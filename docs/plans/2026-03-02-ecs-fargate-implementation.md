# ECS Fargate + EC2 GPU Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the single-file ECS directory into a full deployment target for all 31 microservices using Fargate (28 services) and EC2 GPU (3 ML services), with per-stack templates, Cloud Map service discovery, ALB routing, auto-scaling, and environment configs.

**Architecture:** 6 per-stack task definition templates (Spring Boot, Go, Elixir, Python, Python GPU, NestJS) with per-service overrides. ECS services grouped by stack with Cloud Map for internal DNS and ALB for external routing. 4 environment configs (dev, staging, production, live) control resources, replicas, and capacity providers.

**Tech Stack:** AWS ECS Fargate, EC2 (GPU), Cloud Map, ALB, CloudWatch, Application Auto Scaling, JSON configs, Bash scripts

---

## Reference: Service Inventory

### Spring Boot (ports 8081-8086)
| Service | Port | Tier |
|---------|------|------|
| auth-service | 8081 | Critical |
| user-service | 8082 | Critical |
| permission-service | 8083 | Critical |
| audit-service | 8084 | Standard |
| admin-service | 8085 | Standard |
| security-service | 8086 | Standard |

### Go (ports 5001-5019)
| Service | Port | Tier |
|---------|------|------|
| media-service | 5001 | Heavy I/O |
| file-service | 5002 | Heavy I/O |
| go-bff | 5003 | Standard |
| workspace-service | 5004 | Critical |
| channel-service | 5005 | Standard |
| search-service | 5006 | Standard |
| thread-service | 5009 | Standard |
| bookmark-service | 5010 | Standard |
| reminder-service | 5011 | Standard |
| attachment-service | 5012 | Heavy I/O |
| cdn-service | 5013 | Heavy I/O |

### Elixir (ports 4001-4006)
| Service | Port | Tier |
|---------|------|------|
| presence-service | 4001 | Standard |
| call-service | 4002 | Standard |
| message-service | 4003 | Standard |
| notification-orchestrator | 4004 | Standard |
| huddle-service | 4005 | Standard |
| event-broadcast-service | 4006 | Standard |

### Python (ports 5007-5020)
| Service | Port | Tier | Launch |
|---------|------|------|--------|
| analytics-service | 5007 | Batch | Fargate |
| export-service | 5015 | Heavy I/O | Fargate |
| integration-service | 5016 | Standard | Fargate |
| insights-service | 5018 | Standard | Fargate |
| smart-reply-service | 5019 | Standard | Fargate |
| spark-etl | 5020 | Batch | Fargate |

### Python GPU (EC2)
| Service | Port | Tier |
|---------|------|------|
| ml-service | 5008 | ML/GPU |
| moderation-service | 5014 | ML/GPU |
| sentiment-service | 5017 | ML/GPU |

### NestJS (ports 3000-3001)
| Service | Port | Tier |
|---------|------|------|
| backend-gateway | 3000 | Critical |
| notification-service | 3001 | Standard |

---

## Task 1: Cluster Configuration

**Files:**
- Create: `ecs/cluster/cluster-config.json`
- Create: `ecs/cluster/capacity-providers.json`
- Create: `ecs/cluster/namespaces.json`

**Step 1: Create cluster config**

Create `ecs/cluster/cluster-config.json`:

```json
{
  "_comment": "ECS Cluster configuration for QuckApp",
  "clusterName": "quckapp-cluster",
  "settings": [
    {
      "name": "containerInsights",
      "value": "enhanced"
    }
  ],
  "configuration": {
    "executeCommandConfiguration": {
      "logging": "OVERRIDE",
      "logConfiguration": {
        "cloudWatchLogGroupName": "/ecs/quckapp-cluster/exec",
        "cloudWatchEncryptionEnabled": true
      }
    }
  },
  "defaultCapacityProviderStrategy": [
    {
      "capacityProvider": "FARGATE_SPOT",
      "weight": 80,
      "base": 0
    },
    {
      "capacityProvider": "FARGATE",
      "weight": 20,
      "base": 1
    }
  ],
  "tags": [
    {"key": "Project", "value": "quckapp"},
    {"key": "ManagedBy", "value": "ecs-config"},
    {"key": "Environment", "value": "${ENVIRONMENT}"}
  ]
}
```

**Step 2: Create capacity providers config**

Create `ecs/cluster/capacity-providers.json`:

```json
{
  "_comment": "Capacity providers: Fargate (critical), Fargate Spot (stateless), EC2 GPU (ML)",
  "capacityProviders": [
    {
      "name": "FARGATE",
      "type": "builtin",
      "description": "AWS Fargate — for critical stateful services (auth, gateway, user, permission, admin, security, audit, workspace)",
      "services": [
        "auth-service", "user-service", "permission-service", "audit-service",
        "admin-service", "security-service", "workspace-service", "backend-gateway"
      ]
    },
    {
      "name": "FARGATE_SPOT",
      "type": "builtin",
      "description": "AWS Fargate Spot — for stateless fault-tolerant services (70-90% cost savings)",
      "services": [
        "media-service", "file-service", "go-bff", "channel-service", "search-service",
        "thread-service", "bookmark-service", "reminder-service", "attachment-service",
        "cdn-service", "presence-service", "call-service", "message-service",
        "notification-orchestrator", "huddle-service", "event-broadcast-service",
        "notification-service", "analytics-service", "export-service",
        "integration-service", "insights-service", "smart-reply-service", "spark-etl"
      ]
    },
    {
      "name": "quckapp-ec2-gpu",
      "type": "ec2",
      "description": "EC2 GPU instances for ML inference workloads",
      "autoScalingGroup": {
        "instanceType": "g4dn.xlarge",
        "minSize": 0,
        "maxSize": 6,
        "desiredCapacity": 1,
        "amiId": "${ECS_GPU_AMI_ID}",
        "subnets": "${PRIVATE_SUBNET_IDS}",
        "securityGroups": ["${EC2_GPU_SG_ID}"]
      },
      "managedScaling": {
        "status": "ENABLED",
        "targetCapacity": 80,
        "minimumScalingStepSize": 1,
        "maximumScalingStepSize": 2
      },
      "managedTerminationProtection": "ENABLED",
      "services": [
        "ml-service", "sentiment-service", "moderation-service"
      ]
    }
  ]
}
```

**Step 3: Create Cloud Map namespace config**

Create `ecs/cluster/namespaces.json`:

```json
{
  "_comment": "AWS Cloud Map namespace for ECS service discovery",
  "namespace": {
    "name": "quckapp.local",
    "type": "DNS_PRIVATE",
    "vpc": "${VPC_ID}",
    "description": "Private DNS namespace for QuckApp ECS service discovery",
    "properties": {
      "dnsProperties": {
        "soa": {
          "ttl": 10
        }
      }
    }
  },
  "serviceDefaults": {
    "dnsConfig": {
      "routingPolicy": "MULTIVALUE",
      "dnsRecords": [
        {
          "type": "A",
          "ttl": 10
        }
      ]
    },
    "healthCheckCustomConfig": {
      "failureThreshold": 1
    }
  }
}
```

**Step 4: Commit**

```bash
git add ecs/cluster/
git commit -m "feat(ecs): add cluster, capacity providers, and Cloud Map namespace configs"
```

---

## Task 2: Spring Boot Task Definition + Services

**Files:**
- Create: `ecs/task-definitions/spring-boot.json`
- Create: `ecs/services/spring-boot-services.json`

**Step 1: Create Spring Boot task definition template**

Create `ecs/task-definitions/spring-boot.json`:

```json
{
  "_comment": "Spring Boot task definition template — 6 services (auth, user, permission, audit, admin, security)",
  "family": "quckapp-${SERVICE_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${CPU}",
  "memory": "${MEMORY}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "${SERVICE_NAME}",
      "image": "${ECR_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": "${SERVICE_PORT}",
          "protocol": "tcp",
          "appProtocol": "http",
          "name": "${SERVICE_NAME}-http"
        }
      ],
      "environment": [
        {"name": "SPRING_PROFILES_ACTIVE", "value": "${ENVIRONMENT}"},
        {"name": "SERVER_PORT", "value": "${SERVICE_PORT}"},
        {"name": "JAVA_OPTS", "value": "-XX:+UseContainerSupport -XX:MaxRAMPercentage=75.0 -XX:+UseG1GC -XX:+UseStringDeduplication -Djava.security.egd=file:/dev/./urandom"},
        {"name": "OTEL_SERVICE_NAME", "value": "${SERVICE_NAME}"},
        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel-collector.quckapp.local:4317"},
        {"name": "SPRING_AUTH_SERVICE_URL", "value": "http://auth-service.quckapp.local:8081"},
        {"name": "LOG_LEVEL", "value": "${LOG_LEVEL:-INFO}"}
      ],
      "secrets": [
        {"name": "SPRING_DATASOURCE_URL", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATASOURCE_URL"},
        {"name": "SPRING_DATASOURCE_USERNAME", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATASOURCE_USERNAME"},
        {"name": "SPRING_DATASOURCE_PASSWORD", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATASOURCE_PASSWORD"},
        {"name": "JWT_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_SECRET"},
        {"name": "REDIS_HOST", "valueFrom": "${SECRETS_PREFIX}/shared/REDIS_HOST"},
        {"name": "KAFKA_BROKERS", "valueFrom": "${SECRETS_PREFIX}/shared/KAFKA_BROKERS"}
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${SERVICE_PORT}/actuator/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 90
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/quckapp/${SERVICE_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "ulimits": [
        {
          "name": "nofile",
          "softLimit": 65536,
          "hardLimit": 65536
        }
      ]
    }
  ],
  "services": {
    "auth-service":       {"port": 8081, "cpu": "1024", "memory": "2048", "tier": "critical"},
    "user-service":       {"port": 8082, "cpu": "1024", "memory": "2048", "tier": "critical"},
    "permission-service": {"port": 8083, "cpu": "1024", "memory": "2048", "tier": "critical"},
    "audit-service":      {"port": 8084, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "admin-service":      {"port": 8085, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "security-service":   {"port": 8086, "cpu": "512",  "memory": "1024", "tier": "standard"}
  }
}
```

**Step 2: Create Spring Boot ECS services config**

Create `ecs/services/spring-boot-services.json`:

```json
{
  "_comment": "ECS service definitions for Spring Boot stack",
  "services": [
    {
      "serviceName": "auth-service",
      "taskDefinition": "quckapp-auth-service",
      "desiredCount": 2,
      "launchType": "FARGATE",
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 2}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {
          "registryArn": "${CLOUD_MAP_AUTH_SERVICE_ARN}",
          "containerName": "auth-service",
          "containerPort": 8081
        }
      ],
      "loadBalancers": [
        {
          "targetGroupArn": "${ALB_TG_AUTH_ARN}",
          "containerName": "auth-service",
          "containerPort": 8081
        }
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200,
        "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {
          "enable": true,
          "rollback": true
        }
      },
      "enableExecuteCommand": true,
      "propagateTags": "SERVICE",
      "tags": [{"key": "Stack", "value": "spring-boot"}, {"key": "Tier", "value": "critical"}]
    },
    {
      "serviceName": "user-service",
      "taskDefinition": "quckapp-user-service",
      "desiredCount": 2,
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 2}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {"registryArn": "${CLOUD_MAP_USER_SERVICE_ARN}", "containerName": "user-service", "containerPort": 8082}
      ],
      "loadBalancers": [
        {"targetGroupArn": "${ALB_TG_USER_ARN}", "containerName": "user-service", "containerPort": 8082}
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200, "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {"enable": true, "rollback": true}
      },
      "enableExecuteCommand": true,
      "tags": [{"key": "Stack", "value": "spring-boot"}, {"key": "Tier", "value": "critical"}]
    },
    {
      "serviceName": "permission-service",
      "taskDefinition": "quckapp-permission-service",
      "desiredCount": 2,
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 2}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {"registryArn": "${CLOUD_MAP_PERMISSION_SERVICE_ARN}", "containerName": "permission-service", "containerPort": 8083}
      ],
      "loadBalancers": [
        {"targetGroupArn": "${ALB_TG_PERMISSION_ARN}", "containerName": "permission-service", "containerPort": 8083}
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200, "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {"enable": true, "rollback": true}
      },
      "enableExecuteCommand": true,
      "tags": [{"key": "Stack", "value": "spring-boot"}, {"key": "Tier", "value": "critical"}]
    },
    {
      "serviceName": "audit-service",
      "taskDefinition": "quckapp-audit-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 1}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {"registryArn": "${CLOUD_MAP_AUDIT_SERVICE_ARN}", "containerName": "audit-service", "containerPort": 8084}
      ],
      "loadBalancers": [
        {"targetGroupArn": "${ALB_TG_AUDIT_ARN}", "containerName": "audit-service", "containerPort": 8084}
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200, "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {"enable": true, "rollback": true}
      },
      "enableExecuteCommand": true,
      "tags": [{"key": "Stack", "value": "spring-boot"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "admin-service",
      "taskDefinition": "quckapp-admin-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 1}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {"registryArn": "${CLOUD_MAP_ADMIN_SERVICE_ARN}", "containerName": "admin-service", "containerPort": 8085}
      ],
      "loadBalancers": [
        {"targetGroupArn": "${ALB_TG_ADMIN_ARN}", "containerName": "admin-service", "containerPort": 8085}
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200, "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {"enable": true, "rollback": true}
      },
      "enableExecuteCommand": true,
      "tags": [{"key": "Stack", "value": "spring-boot"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "security-service",
      "taskDefinition": "quckapp-security-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 1}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {"registryArn": "${CLOUD_MAP_SECURITY_SERVICE_ARN}", "containerName": "security-service", "containerPort": 8086}
      ],
      "loadBalancers": [
        {"targetGroupArn": "${ALB_TG_SECURITY_ARN}", "containerName": "security-service", "containerPort": 8086}
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200, "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {"enable": true, "rollback": true}
      },
      "enableExecuteCommand": true,
      "tags": [{"key": "Stack", "value": "spring-boot"}, {"key": "Tier", "value": "standard"}]
    }
  ]
}
```

**Step 3: Commit**

```bash
git add ecs/task-definitions/spring-boot.json ecs/services/spring-boot-services.json
git commit -m "feat(ecs): add Spring Boot task definition and service configs (6 services)"
```

---

## Task 3: Go Task Definition + Services

**Files:**
- Create: `ecs/task-definitions/go.json`
- Create: `ecs/services/go-services.json`

**Step 1: Create Go task definition template**

Create `ecs/task-definitions/go.json`:

```json
{
  "_comment": "Go task definition template — 11 services (media, file, bff, workspace, channel, search, thread, bookmark, reminder, attachment, cdn)",
  "family": "quckapp-${SERVICE_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${CPU}",
  "memory": "${MEMORY}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "${SERVICE_NAME}",
      "image": "${ECR_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": "${SERVICE_PORT}",
          "protocol": "tcp",
          "appProtocol": "http",
          "name": "${SERVICE_NAME}-http"
        }
      ],
      "environment": [
        {"name": "APP_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT", "value": "${SERVICE_PORT}"},
        {"name": "GOMAXPROCS", "value": "0"},
        {"name": "OTEL_SERVICE_NAME", "value": "${SERVICE_NAME}"},
        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel-collector.quckapp.local:4317"},
        {"name": "AUTH_SERVICE_URL", "value": "http://auth-service.quckapp.local:8081"},
        {"name": "LOG_LEVEL", "value": "${LOG_LEVEL:-info}"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATABASE_URL"},
        {"name": "JWT_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_SECRET"},
        {"name": "REDIS_URL", "valueFrom": "${SECRETS_PREFIX}/shared/REDIS_URL"},
        {"name": "KAFKA_BROKERS", "valueFrom": "${SECRETS_PREFIX}/shared/KAFKA_BROKERS"},
        {"name": "S3_BUCKET", "valueFrom": "${SECRETS_PREFIX}/shared/S3_BUCKET"},
        {"name": "S3_REGION", "valueFrom": "${SECRETS_PREFIX}/shared/S3_REGION"}
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "wget -q --spider http://localhost:${SERVICE_PORT}/healthz || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 30
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/quckapp/${SERVICE_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "services": {
    "media-service":      {"port": 5001, "cpu": "1024", "memory": "4096", "tier": "heavy_io"},
    "file-service":       {"port": 5002, "cpu": "1024", "memory": "4096", "tier": "heavy_io"},
    "go-bff":             {"port": 5003, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "workspace-service":  {"port": 5004, "cpu": "1024", "memory": "2048", "tier": "critical"},
    "channel-service":    {"port": 5005, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "search-service":     {"port": 5006, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "thread-service":     {"port": 5009, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "bookmark-service":   {"port": 5010, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "reminder-service":   {"port": 5011, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "attachment-service": {"port": 5012, "cpu": "1024", "memory": "4096", "tier": "heavy_io"},
    "cdn-service":        {"port": 5013, "cpu": "1024", "memory": "4096", "tier": "heavy_io"}
  }
}
```

**Step 2: Create Go ECS services config**

Create `ecs/services/go-services.json`:

```json
{
  "_comment": "ECS service definitions for Go stack — 11 services",
  "services": [
    {
      "serviceName": "media-service",
      "taskDefinition": "quckapp-media-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [
        {"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}
      ],
      "networkConfiguration": {
        "awsvpcConfiguration": {
          "subnets": "${PRIVATE_SUBNET_IDS}",
          "securityGroups": ["${FARGATE_SG_ID}"],
          "assignPublicIp": "DISABLED"
        }
      },
      "serviceRegistries": [
        {"registryArn": "${CLOUD_MAP_MEDIA_SERVICE_ARN}", "containerName": "media-service", "containerPort": 5001}
      ],
      "loadBalancers": [
        {"targetGroupArn": "${ALB_TG_MEDIA_ARN}", "containerName": "media-service", "containerPort": 5001}
      ],
      "deploymentConfiguration": {
        "maximumPercent": 200, "minimumHealthyPercent": 100,
        "deploymentCircuitBreaker": {"enable": true, "rollback": true}
      },
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "heavy_io"}]
    },
    {
      "serviceName": "file-service",
      "taskDefinition": "quckapp-file-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_FILE_SERVICE_ARN}", "containerName": "file-service", "containerPort": 5002}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_FILE_ARN}", "containerName": "file-service", "containerPort": 5002}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "heavy_io"}]
    },
    {
      "serviceName": "go-bff",
      "taskDefinition": "quckapp-go-bff",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_GO_BFF_ARN}", "containerName": "go-bff", "containerPort": 5003}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_BFF_ARN}", "containerName": "go-bff", "containerPort": 5003}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "workspace-service",
      "taskDefinition": "quckapp-workspace-service",
      "desiredCount": 2,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE", "weight": 1, "base": 2}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_WORKSPACE_SERVICE_ARN}", "containerName": "workspace-service", "containerPort": 5004}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_WORKSPACE_ARN}", "containerName": "workspace-service", "containerPort": 5004}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "critical"}]
    },
    {
      "serviceName": "channel-service",
      "taskDefinition": "quckapp-channel-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_CHANNEL_SERVICE_ARN}", "containerName": "channel-service", "containerPort": 5005}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_CHANNEL_ARN}", "containerName": "channel-service", "containerPort": 5005}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "search-service",
      "taskDefinition": "quckapp-search-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_SEARCH_SERVICE_ARN}", "containerName": "search-service", "containerPort": 5006}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_SEARCH_ARN}", "containerName": "search-service", "containerPort": 5006}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "thread-service",
      "taskDefinition": "quckapp-thread-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_THREAD_SERVICE_ARN}", "containerName": "thread-service", "containerPort": 5009}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_THREAD_ARN}", "containerName": "thread-service", "containerPort": 5009}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "bookmark-service",
      "taskDefinition": "quckapp-bookmark-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_BOOKMARK_SERVICE_ARN}", "containerName": "bookmark-service", "containerPort": 5010}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_BOOKMARK_ARN}", "containerName": "bookmark-service", "containerPort": 5010}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "reminder-service",
      "taskDefinition": "quckapp-reminder-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_REMINDER_SERVICE_ARN}", "containerName": "reminder-service", "containerPort": 5011}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_REMINDER_ARN}", "containerName": "reminder-service", "containerPort": 5011}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "attachment-service",
      "taskDefinition": "quckapp-attachment-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_ATTACHMENT_SERVICE_ARN}", "containerName": "attachment-service", "containerPort": 5012}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_ATTACHMENT_ARN}", "containerName": "attachment-service", "containerPort": 5012}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "heavy_io"}]
    },
    {
      "serviceName": "cdn-service",
      "taskDefinition": "quckapp-cdn-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_CDN_SERVICE_ARN}", "containerName": "cdn-service", "containerPort": 5013}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_CDN_ARN}", "containerName": "cdn-service", "containerPort": 5013}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "go"}, {"key": "Tier", "value": "heavy_io"}]
    }
  ]
}
```

**Step 3: Commit**

```bash
git add ecs/task-definitions/go.json ecs/services/go-services.json
git commit -m "feat(ecs): add Go task definition and service configs (11 services)"
```

---

## Task 4: Elixir Task Definition + Services

**Files:**
- Create: `ecs/task-definitions/elixir.json`
- Create: `ecs/services/elixir-services.json`

**Step 1: Create Elixir task definition template**

Create `ecs/task-definitions/elixir.json`:

```json
{
  "_comment": "Elixir task definition template — 6 services (presence, call, message, notification-orchestrator, huddle, event-broadcast). WebSocket-aware with long idle timeouts.",
  "family": "quckapp-${SERVICE_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${CPU}",
  "memory": "${MEMORY}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "${SERVICE_NAME}",
      "image": "${ECR_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": "${SERVICE_PORT}",
          "protocol": "tcp",
          "appProtocol": "http",
          "name": "${SERVICE_NAME}-http"
        }
      ],
      "environment": [
        {"name": "MIX_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT", "value": "${SERVICE_PORT}"},
        {"name": "ERLANG_COOKIE", "value": "${ERLANG_COOKIE}"},
        {"name": "ERL_MAX_PORTS", "value": "65536"},
        {"name": "POOL_SIZE", "value": "10"},
        {"name": "OTEL_SERVICE_NAME", "value": "${SERVICE_NAME}"},
        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel-collector.quckapp.local:4317"},
        {"name": "AUTH_SERVICE_URL", "value": "http://auth-service.quckapp.local:8081"},
        {"name": "LOG_LEVEL", "value": "${LOG_LEVEL:-info}"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATABASE_URL"},
        {"name": "SECRET_KEY_BASE", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/SECRET_KEY_BASE"},
        {"name": "JWT_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_SECRET"},
        {"name": "REDIS_URL", "valueFrom": "${SECRETS_PREFIX}/shared/REDIS_URL"},
        {"name": "KAFKA_BROKERS", "valueFrom": "${SECRETS_PREFIX}/shared/KAFKA_BROKERS"}
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${SERVICE_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/quckapp/${SERVICE_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      },
      "ulimits": [
        {
          "name": "nofile",
          "softLimit": 65536,
          "hardLimit": 65536
        }
      ]
    }
  ],
  "services": {
    "presence-service":          {"port": 4001, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "call-service":              {"port": 4002, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "message-service":           {"port": 4003, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "notification-orchestrator": {"port": 4004, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "huddle-service":            {"port": 4005, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "event-broadcast-service":   {"port": 4006, "cpu": "512",  "memory": "1024", "tier": "standard"}
  }
}
```

**Step 2: Create Elixir ECS services config**

Create `ecs/services/elixir-services.json`:

```json
{
  "_comment": "ECS service definitions for Elixir stack — 6 real-time/WebSocket services",
  "services": [
    {
      "serviceName": "presence-service",
      "taskDefinition": "quckapp-presence-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_PRESENCE_SERVICE_ARN}", "containerName": "presence-service", "containerPort": 4001}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_PRESENCE_ARN}", "containerName": "presence-service", "containerPort": 4001}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "elixir"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "call-service",
      "taskDefinition": "quckapp-call-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_CALL_SERVICE_ARN}", "containerName": "call-service", "containerPort": 4002}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_CALL_ARN}", "containerName": "call-service", "containerPort": 4002}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "elixir"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "message-service",
      "taskDefinition": "quckapp-message-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_MESSAGE_SERVICE_ARN}", "containerName": "message-service", "containerPort": 4003}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_MESSAGE_ARN}", "containerName": "message-service", "containerPort": 4003}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "elixir"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "notification-orchestrator",
      "taskDefinition": "quckapp-notification-orchestrator",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_NOTIF_ORCH_ARN}", "containerName": "notification-orchestrator", "containerPort": 4004}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_NOTIF_ORCH_ARN}", "containerName": "notification-orchestrator", "containerPort": 4004}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "elixir"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "huddle-service",
      "taskDefinition": "quckapp-huddle-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_HUDDLE_SERVICE_ARN}", "containerName": "huddle-service", "containerPort": 4005}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_HUDDLE_ARN}", "containerName": "huddle-service", "containerPort": 4005}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "elixir"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "event-broadcast-service",
      "taskDefinition": "quckapp-event-broadcast-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_EVENT_BROADCAST_ARN}", "containerName": "event-broadcast-service", "containerPort": 4006}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_EVENT_BROADCAST_ARN}", "containerName": "event-broadcast-service", "containerPort": 4006}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "elixir"}, {"key": "Tier", "value": "standard"}]
    }
  ]
}
```

**Step 3: Commit**

```bash
git add ecs/task-definitions/elixir.json ecs/services/elixir-services.json
git commit -m "feat(ecs): add Elixir task definition and service configs (6 services)"
```

---

## Task 5: Python + Python GPU Task Definitions + Services

**Files:**
- Create: `ecs/task-definitions/python.json`
- Create: `ecs/task-definitions/python-gpu.json`
- Create: `ecs/services/python-services.json`

**Step 1: Create Python (Fargate) task definition template**

Create `ecs/task-definitions/python.json`:

```json
{
  "_comment": "Python task definition template — 6 Fargate services (analytics, export, integration, insights, smart-reply, spark-etl)",
  "family": "quckapp-${SERVICE_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${CPU}",
  "memory": "${MEMORY}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "${SERVICE_NAME}",
      "image": "${ECR_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": "${SERVICE_PORT}",
          "protocol": "tcp",
          "appProtocol": "http",
          "name": "${SERVICE_NAME}-http"
        }
      ],
      "environment": [
        {"name": "APP_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT", "value": "${SERVICE_PORT}"},
        {"name": "WORKERS", "value": "3"},
        {"name": "THREADS", "value": "2"},
        {"name": "OTEL_SERVICE_NAME", "value": "${SERVICE_NAME}"},
        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel-collector.quckapp.local:4317"},
        {"name": "AUTH_SERVICE_URL", "value": "http://auth-service.quckapp.local:8081"},
        {"name": "LOG_LEVEL", "value": "${LOG_LEVEL:-INFO}"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATABASE_URL"},
        {"name": "JWT_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_SECRET"},
        {"name": "REDIS_URL", "valueFrom": "${SECRETS_PREFIX}/shared/REDIS_URL"},
        {"name": "KAFKA_BROKERS", "valueFrom": "${SECRETS_PREFIX}/shared/KAFKA_BROKERS"},
        {"name": "S3_BUCKET", "valueFrom": "${SECRETS_PREFIX}/shared/S3_BUCKET"}
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${SERVICE_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 45
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/quckapp/${SERVICE_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "services": {
    "analytics-service":    {"port": 5007, "cpu": "512",  "memory": "2048", "tier": "batch"},
    "export-service":       {"port": 5015, "cpu": "1024", "memory": "4096", "tier": "heavy_io"},
    "integration-service":  {"port": 5016, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "insights-service":     {"port": 5018, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "smart-reply-service":  {"port": 5019, "cpu": "512",  "memory": "1024", "tier": "standard"},
    "spark-etl":            {"port": 5020, "cpu": "512",  "memory": "2048", "tier": "batch"}
  }
}
```

**Step 2: Create Python GPU (EC2) task definition template**

Create `ecs/task-definitions/python-gpu.json`:

```json
{
  "_comment": "Python GPU task definition template — 3 ML services on EC2 GPU instances (ml, moderation, sentiment)",
  "family": "quckapp-${SERVICE_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["EC2"],
  "cpu": "4096",
  "memory": "8192",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "placementConstraints": [
    {
      "type": "memberOf",
      "expression": "attribute:ecs.instance-type =~ g4dn.*"
    }
  ],
  "containerDefinitions": [
    {
      "name": "${SERVICE_NAME}",
      "image": "${ECR_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": "${SERVICE_PORT}",
          "protocol": "tcp",
          "appProtocol": "http",
          "name": "${SERVICE_NAME}-http"
        }
      ],
      "environment": [
        {"name": "APP_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT", "value": "${SERVICE_PORT}"},
        {"name": "WORKERS", "value": "1"},
        {"name": "THREADS", "value": "4"},
        {"name": "NVIDIA_VISIBLE_DEVICES", "value": "all"},
        {"name": "CUDA_VISIBLE_DEVICES", "value": "0"},
        {"name": "GPU_MEMORY_FRACTION", "value": "0.8"},
        {"name": "OTEL_SERVICE_NAME", "value": "${SERVICE_NAME}"},
        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel-collector.quckapp.local:4317"},
        {"name": "AUTH_SERVICE_URL", "value": "http://auth-service.quckapp.local:8081"},
        {"name": "LOG_LEVEL", "value": "${LOG_LEVEL:-INFO}"}
      ],
      "secrets": [
        {"name": "DATABASE_URL", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/DATABASE_URL"},
        {"name": "JWT_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_SECRET"},
        {"name": "REDIS_URL", "valueFrom": "${SECRETS_PREFIX}/shared/REDIS_URL"},
        {"name": "KAFKA_BROKERS", "valueFrom": "${SECRETS_PREFIX}/shared/KAFKA_BROKERS"},
        {"name": "MODEL_BUCKET", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/MODEL_BUCKET"}
      ],
      "resourceRequirements": [
        {
          "type": "GPU",
          "value": "1"
        }
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${SERVICE_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 10,
        "retries": 5,
        "startPeriod": 120
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/quckapp/${SERVICE_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "services": {
    "ml-service":         {"port": 5008, "cpu": "4096", "memory": "8192", "tier": "ml_gpu"},
    "moderation-service": {"port": 5014, "cpu": "4096", "memory": "8192", "tier": "ml_gpu"},
    "sentiment-service":  {"port": 5017, "cpu": "4096", "memory": "8192", "tier": "ml_gpu"}
  }
}
```

**Step 3: Create Python ECS services config (Fargate + GPU combined)**

Create `ecs/services/python-services.json`:

```json
{
  "_comment": "ECS service definitions for Python stack — 6 Fargate + 3 EC2 GPU services",
  "services": [
    {
      "serviceName": "analytics-service",
      "taskDefinition": "quckapp-analytics-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 0}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_ANALYTICS_SERVICE_ARN}", "containerName": "analytics-service", "containerPort": 5007}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_ANALYTICS_ARN}", "containerName": "analytics-service", "containerPort": 5007}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 50, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python"}, {"key": "Tier", "value": "batch"}]
    },
    {
      "serviceName": "export-service",
      "taskDefinition": "quckapp-export-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_EXPORT_SERVICE_ARN}", "containerName": "export-service", "containerPort": 5015}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_EXPORT_ARN}", "containerName": "export-service", "containerPort": 5015}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python"}, {"key": "Tier", "value": "heavy_io"}]
    },
    {
      "serviceName": "integration-service",
      "taskDefinition": "quckapp-integration-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_INTEGRATION_SERVICE_ARN}", "containerName": "integration-service", "containerPort": 5016}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_INTEGRATION_ARN}", "containerName": "integration-service", "containerPort": 5016}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "insights-service",
      "taskDefinition": "quckapp-insights-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_INSIGHTS_SERVICE_ARN}", "containerName": "insights-service", "containerPort": 5018}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_INSIGHTS_ARN}", "containerName": "insights-service", "containerPort": 5018}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "smart-reply-service",
      "taskDefinition": "quckapp-smart-reply-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_SMART_REPLY_ARN}", "containerName": "smart-reply-service", "containerPort": 5019}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_SMART_REPLY_ARN}", "containerName": "smart-reply-service", "containerPort": 5019}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python"}, {"key": "Tier", "value": "standard"}]
    },
    {
      "serviceName": "spark-etl",
      "taskDefinition": "quckapp-spark-etl",
      "desiredCount": 0,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 0}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_SPARK_ETL_ARN}", "containerName": "spark-etl", "containerPort": 5020}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_ETL_ARN}", "containerName": "spark-etl", "containerPort": 5020}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 0, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python"}, {"key": "Tier", "value": "batch"}]
    },
    {
      "serviceName": "ml-service",
      "taskDefinition": "quckapp-ml-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "quckapp-ec2-gpu", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${EC2_GPU_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_ML_SERVICE_ARN}", "containerName": "ml-service", "containerPort": 5008}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_ML_ARN}", "containerName": "ml-service", "containerPort": 5008}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python-gpu"}, {"key": "Tier", "value": "ml_gpu"}]
    },
    {
      "serviceName": "moderation-service",
      "taskDefinition": "quckapp-moderation-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "quckapp-ec2-gpu", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${EC2_GPU_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_MODERATION_SERVICE_ARN}", "containerName": "moderation-service", "containerPort": 5014}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_MODERATION_ARN}", "containerName": "moderation-service", "containerPort": 5014}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python-gpu"}, {"key": "Tier", "value": "ml_gpu"}]
    },
    {
      "serviceName": "sentiment-service",
      "taskDefinition": "quckapp-sentiment-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "quckapp-ec2-gpu", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${EC2_GPU_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_SENTIMENT_SERVICE_ARN}", "containerName": "sentiment-service", "containerPort": 5017}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_SENTIMENT_ARN}", "containerName": "sentiment-service", "containerPort": 5017}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "python-gpu"}, {"key": "Tier", "value": "ml_gpu"}]
    }
  ]
}
```

**Step 4: Commit**

```bash
git add ecs/task-definitions/python.json ecs/task-definitions/python-gpu.json ecs/services/python-services.json
git commit -m "feat(ecs): add Python + Python GPU task definitions and service configs (9 services)"
```

---

## Task 6: NestJS Task Definition + Services

**Files:**
- Create: `ecs/task-definitions/nestjs.json`
- Create: `ecs/services/nestjs-services.json`

**Step 1: Create NestJS task definition template**

Create `ecs/task-definitions/nestjs.json`:

```json
{
  "_comment": "NestJS task definition template — 2 services (backend-gateway, notification-service). Replaces legacy backend-task-definition.json.",
  "family": "quckapp-${SERVICE_NAME}",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "${CPU}",
  "memory": "${MEMORY}",
  "executionRoleArn": "${EXECUTION_ROLE_ARN}",
  "taskRoleArn": "${TASK_ROLE_ARN}",
  "runtimePlatform": {
    "cpuArchitecture": "X86_64",
    "operatingSystemFamily": "LINUX"
  },
  "containerDefinitions": [
    {
      "name": "${SERVICE_NAME}",
      "image": "${ECR_REGISTRY}/${SERVICE_NAME}:${IMAGE_TAG}",
      "essential": true,
      "portMappings": [
        {
          "containerPort": "${SERVICE_PORT}",
          "protocol": "tcp",
          "appProtocol": "http",
          "name": "${SERVICE_NAME}-http"
        }
      ],
      "environment": [
        {"name": "NODE_ENV", "value": "${ENVIRONMENT}"},
        {"name": "PORT", "value": "${SERVICE_PORT}"},
        {"name": "NODE_OPTIONS", "value": "--max-old-space-size=1536"},
        {"name": "OTEL_SERVICE_NAME", "value": "${SERVICE_NAME}"},
        {"name": "OTEL_EXPORTER_OTLP_ENDPOINT", "value": "http://otel-collector.quckapp.local:4317"},
        {"name": "AUTH_SERVICE_URL", "value": "http://auth-service.quckapp.local:8081"},
        {"name": "LOG_LEVEL", "value": "${LOG_LEVEL:-info}"}
      ],
      "secrets": [
        {"name": "MONGODB_URI", "valueFrom": "${SECRETS_PREFIX}/${SERVICE_NAME}/MONGODB_URI"},
        {"name": "JWT_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_SECRET"},
        {"name": "JWT_REFRESH_SECRET", "valueFrom": "${SECRETS_PREFIX}/shared/JWT_REFRESH_SECRET"},
        {"name": "REDIS_HOST", "valueFrom": "${SECRETS_PREFIX}/shared/REDIS_HOST"},
        {"name": "KAFKA_BROKERS", "valueFrom": "${SECRETS_PREFIX}/shared/KAFKA_BROKERS"}
      ],
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:${SERVICE_PORT}/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      },
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/quckapp/${SERVICE_NAME}",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "ecs",
          "awslogs-create-group": "true"
        }
      }
    }
  ],
  "services": {
    "backend-gateway":      {"port": 3000, "cpu": "1024", "memory": "2048", "tier": "critical"},
    "notification-service": {"port": 3001, "cpu": "512",  "memory": "1024", "tier": "standard"}
  }
}
```

**Step 2: Create NestJS ECS services config**

Create `ecs/services/nestjs-services.json`:

```json
{
  "_comment": "ECS service definitions for NestJS stack — 2 services",
  "services": [
    {
      "serviceName": "backend-gateway",
      "taskDefinition": "quckapp-backend-gateway",
      "desiredCount": 2,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE", "weight": 1, "base": 2}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_GATEWAY_ARN}", "containerName": "backend-gateway", "containerPort": 3000}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_GATEWAY_ARN}", "containerName": "backend-gateway", "containerPort": 3000}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "enableExecuteCommand": true,
      "tags": [{"key": "Stack", "value": "nestjs"}, {"key": "Tier", "value": "critical"}]
    },
    {
      "serviceName": "notification-service",
      "taskDefinition": "quckapp-notification-service",
      "desiredCount": 1,
      "capacityProviderStrategy": [{"capacityProvider": "FARGATE_SPOT", "weight": 1, "base": 1}],
      "networkConfiguration": {"awsvpcConfiguration": {"subnets": "${PRIVATE_SUBNET_IDS}", "securityGroups": ["${FARGATE_SG_ID}"], "assignPublicIp": "DISABLED"}},
      "serviceRegistries": [{"registryArn": "${CLOUD_MAP_NOTIFICATION_SERVICE_ARN}", "containerName": "notification-service", "containerPort": 3001}],
      "loadBalancers": [{"targetGroupArn": "${ALB_TG_NOTIFICATION_ARN}", "containerName": "notification-service", "containerPort": 3001}],
      "deploymentConfiguration": {"maximumPercent": 200, "minimumHealthyPercent": 100, "deploymentCircuitBreaker": {"enable": true, "rollback": true}},
      "tags": [{"key": "Stack", "value": "nestjs"}, {"key": "Tier", "value": "standard"}]
    }
  ]
}
```

**Step 3: Commit**

```bash
git add ecs/task-definitions/nestjs.json ecs/services/nestjs-services.json
git commit -m "feat(ecs): add NestJS task definition and service configs (2 services)"
```

---

## Task 7: Networking (ALB + Security Groups + Service Discovery)

**Files:**
- Create: `ecs/networking/alb-config.json`
- Create: `ecs/networking/security-groups.json`
- Create: `ecs/networking/service-discovery.json`

**Step 1: Create ALB config**

Create `ecs/networking/alb-config.json`:

```json
{
  "_comment": "Application Load Balancer configuration — 34 target groups matching Kong route paths",
  "loadBalancer": {
    "name": "quckapp-ecs-alb",
    "scheme": "internet-facing",
    "type": "application",
    "subnets": "${PUBLIC_SUBNET_IDS}",
    "securityGroups": ["${ALB_SG_ID}"],
    "tags": [
      {"key": "Project", "value": "quckapp"},
      {"key": "Component", "value": "alb"}
    ]
  },
  "listeners": [
    {
      "port": 80,
      "protocol": "HTTP",
      "defaultAction": {
        "type": "redirect",
        "redirectConfig": {
          "protocol": "HTTPS",
          "port": "443",
          "statusCode": "HTTP_301"
        }
      }
    },
    {
      "port": 443,
      "protocol": "HTTPS",
      "certificateArn": "${ACM_CERTIFICATE_ARN}",
      "sslPolicy": "ELBSecurityPolicy-TLS13-1-2-2021-06",
      "defaultAction": {
        "type": "fixed-response",
        "fixedResponseConfig": {
          "statusCode": "404",
          "contentType": "application/json",
          "messageBody": "{\"error\": \"Not Found\"}"
        }
      }
    }
  ],
  "targetGroups": [
    {"name": "tg-auth",          "port": 8081, "healthCheckPath": "/actuator/health", "pathPattern": "/api/v1/auth/*",    "priority": 1},
    {"name": "tg-user",          "port": 8082, "healthCheckPath": "/actuator/health", "pathPattern": "/api/v1/users/*",   "priority": 2},
    {"name": "tg-permission",    "port": 8083, "healthCheckPath": "/actuator/health", "pathPattern": "/api/v1/permissions/*", "priority": 3},
    {"name": "tg-audit",         "port": 8084, "healthCheckPath": "/actuator/health", "pathPattern": "/api/v1/audit/*",   "priority": 4},
    {"name": "tg-admin",         "port": 8085, "healthCheckPath": "/actuator/health", "pathPattern": "/api/v1/admin/*",   "priority": 5},
    {"name": "tg-security",      "port": 8086, "healthCheckPath": "/actuator/health", "pathPattern": "/api/v1/security/*","priority": 6},
    {"name": "tg-media",         "port": 5001, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/media/*",   "priority": 10},
    {"name": "tg-file",          "port": 5002, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/files/*",   "priority": 11},
    {"name": "tg-bff",           "port": 5003, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/bff/*",     "priority": 12},
    {"name": "tg-workspace",     "port": 5004, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/workspaces/*", "priority": 13},
    {"name": "tg-channel",       "port": 5005, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/channels/*","priority": 14},
    {"name": "tg-search",        "port": 5006, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/search/*",  "priority": 15},
    {"name": "tg-analytics",     "port": 5007, "healthCheckPath": "/health",          "pathPattern": "/api/v1/analytics/*", "priority": 16},
    {"name": "tg-ml",            "port": 5008, "healthCheckPath": "/health",          "pathPattern": "/api/v1/ml/*",      "priority": 17},
    {"name": "tg-thread",        "port": 5009, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/threads/*", "priority": 18},
    {"name": "tg-bookmark",      "port": 5010, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/bookmarks/*", "priority": 19},
    {"name": "tg-reminder",      "port": 5011, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/reminders/*", "priority": 20},
    {"name": "tg-attachment",    "port": 5012, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/attachments/*", "priority": 21},
    {"name": "tg-cdn",           "port": 5013, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/cdn/*",     "priority": 22},
    {"name": "tg-moderation",    "port": 5014, "healthCheckPath": "/health",          "pathPattern": "/api/v1/moderation/*", "priority": 23},
    {"name": "tg-export",        "port": 5015, "healthCheckPath": "/health",          "pathPattern": "/api/v1/export/*",  "priority": 24},
    {"name": "tg-integration",   "port": 5016, "healthCheckPath": "/health",          "pathPattern": "/api/v1/integrations/*", "priority": 25},
    {"name": "tg-sentiment",     "port": 5017, "healthCheckPath": "/health",          "pathPattern": "/api/v1/sentiment/*","priority": 26},
    {"name": "tg-insights",      "port": 5018, "healthCheckPath": "/health",          "pathPattern": "/api/v1/insights/*","priority": 27},
    {"name": "tg-smart-reply",   "port": 5019, "healthCheckPath": "/healthz",         "pathPattern": "/api/v1/smart-reply/*", "priority": 28},
    {"name": "tg-etl",           "port": 5020, "healthCheckPath": "/health",          "pathPattern": "/api/v1/etl/*",     "priority": 29},
    {"name": "tg-presence",      "port": 4001, "healthCheckPath": "/health",          "pathPattern": "/api/v1/presence/*","priority": 30},
    {"name": "tg-call",          "port": 4002, "healthCheckPath": "/health",          "pathPattern": "/api/v1/calls/*",   "priority": 31},
    {"name": "tg-message",       "port": 4003, "healthCheckPath": "/health",          "pathPattern": "/api/v1/messages/*","priority": 32},
    {"name": "tg-notif-orch",    "port": 4004, "healthCheckPath": "/health",          "pathPattern": "/api/v1/notification-orchestrator/*", "priority": 33},
    {"name": "tg-huddle",        "port": 4005, "healthCheckPath": "/health",          "pathPattern": "/api/v1/huddles/*", "priority": 34},
    {"name": "tg-event-broadcast","port": 4006,"healthCheckPath": "/health",          "pathPattern": "/api/v1/events/*",  "priority": 35},
    {"name": "tg-gateway",       "port": 3000, "healthCheckPath": "/health",          "pathPattern": "/api/v1/gateway/*", "priority": 36},
    {"name": "tg-notification",  "port": 3001, "healthCheckPath": "/health",          "pathPattern": "/api/v1/notifications/*", "priority": 37}
  ],
  "targetGroupDefaults": {
    "protocol": "HTTP",
    "targetType": "ip",
    "deregistrationDelay": 30,
    "healthCheck": {
      "protocol": "HTTP",
      "interval": 30,
      "timeout": 5,
      "healthyThreshold": 2,
      "unhealthyThreshold": 3
    },
    "stickiness": {
      "enabled": false
    }
  }
}
```

**Step 2: Create security groups config**

Create `ecs/networking/security-groups.json`:

```json
{
  "_comment": "Security groups for ECS deployment — ALB, Fargate tasks, EC2 GPU instances",
  "securityGroups": [
    {
      "name": "quckapp-alb-sg",
      "description": "ALB security group — accepts public HTTP/HTTPS traffic",
      "vpcId": "${VPC_ID}",
      "ingress": [
        {"protocol": "tcp", "fromPort": 80,  "toPort": 80,  "cidrBlocks": ["0.0.0.0/0"], "description": "HTTP from internet"},
        {"protocol": "tcp", "fromPort": 443, "toPort": 443, "cidrBlocks": ["0.0.0.0/0"], "description": "HTTPS from internet"}
      ],
      "egress": [
        {"protocol": "-1", "fromPort": 0, "toPort": 0, "cidrBlocks": ["0.0.0.0/0"], "description": "All outbound"}
      ],
      "tags": [{"key": "Component", "value": "alb"}]
    },
    {
      "name": "quckapp-fargate-sg",
      "description": "Fargate tasks security group — accepts traffic from ALB and mesh peers",
      "vpcId": "${VPC_ID}",
      "ingress": [
        {"protocol": "tcp", "fromPort": 3000, "toPort": 8086, "sourceSecurityGroup": "quckapp-alb-sg", "description": "Service ports from ALB"},
        {"protocol": "tcp", "fromPort": 3000, "toPort": 8086, "self": true, "description": "Service-to-service mesh traffic"},
        {"protocol": "tcp", "fromPort": 15001, "toPort": 15006, "self": true, "description": "Envoy sidecar proxy ports"}
      ],
      "egress": [
        {"protocol": "-1", "fromPort": 0, "toPort": 0, "cidrBlocks": ["0.0.0.0/0"], "description": "All outbound"}
      ],
      "tags": [{"key": "Component", "value": "fargate"}]
    },
    {
      "name": "quckapp-ec2-gpu-sg",
      "description": "EC2 GPU instances security group — accepts traffic from Fargate tasks",
      "vpcId": "${VPC_ID}",
      "ingress": [
        {"protocol": "tcp", "fromPort": 5008, "toPort": 5008, "sourceSecurityGroup": "quckapp-fargate-sg", "description": "ML service from Fargate"},
        {"protocol": "tcp", "fromPort": 5014, "toPort": 5014, "sourceSecurityGroup": "quckapp-fargate-sg", "description": "Moderation service from Fargate"},
        {"protocol": "tcp", "fromPort": 5017, "toPort": 5017, "sourceSecurityGroup": "quckapp-fargate-sg", "description": "Sentiment service from Fargate"},
        {"protocol": "tcp", "fromPort": 5008, "toPort": 5008, "sourceSecurityGroup": "quckapp-alb-sg", "description": "ML service from ALB"},
        {"protocol": "tcp", "fromPort": 5014, "toPort": 5014, "sourceSecurityGroup": "quckapp-alb-sg", "description": "Moderation service from ALB"},
        {"protocol": "tcp", "fromPort": 5017, "toPort": 5017, "sourceSecurityGroup": "quckapp-alb-sg", "description": "Sentiment service from ALB"}
      ],
      "egress": [
        {"protocol": "-1", "fromPort": 0, "toPort": 0, "cidrBlocks": ["0.0.0.0/0"], "description": "All outbound"}
      ],
      "tags": [{"key": "Component", "value": "ec2-gpu"}]
    }
  ]
}
```

**Step 3: Create service discovery config**

Create `ecs/networking/service-discovery.json`:

```json
{
  "_comment": "Cloud Map service discovery entries — all 31 services register as {name}.quckapp.local",
  "namespace": "quckapp.local",
  "services": [
    {"name": "auth-service",              "port": 8081, "stack": "spring-boot"},
    {"name": "user-service",              "port": 8082, "stack": "spring-boot"},
    {"name": "permission-service",        "port": 8083, "stack": "spring-boot"},
    {"name": "audit-service",             "port": 8084, "stack": "spring-boot"},
    {"name": "admin-service",             "port": 8085, "stack": "spring-boot"},
    {"name": "security-service",          "port": 8086, "stack": "spring-boot"},
    {"name": "media-service",             "port": 5001, "stack": "go"},
    {"name": "file-service",              "port": 5002, "stack": "go"},
    {"name": "go-bff",                    "port": 5003, "stack": "go"},
    {"name": "workspace-service",         "port": 5004, "stack": "go"},
    {"name": "channel-service",           "port": 5005, "stack": "go"},
    {"name": "search-service",            "port": 5006, "stack": "go"},
    {"name": "thread-service",            "port": 5009, "stack": "go"},
    {"name": "bookmark-service",          "port": 5010, "stack": "go"},
    {"name": "reminder-service",          "port": 5011, "stack": "go"},
    {"name": "attachment-service",        "port": 5012, "stack": "go"},
    {"name": "cdn-service",               "port": 5013, "stack": "go"},
    {"name": "presence-service",          "port": 4001, "stack": "elixir"},
    {"name": "call-service",              "port": 4002, "stack": "elixir"},
    {"name": "message-service",           "port": 4003, "stack": "elixir"},
    {"name": "notification-orchestrator", "port": 4004, "stack": "elixir"},
    {"name": "huddle-service",            "port": 4005, "stack": "elixir"},
    {"name": "event-broadcast-service",   "port": 4006, "stack": "elixir"},
    {"name": "analytics-service",         "port": 5007, "stack": "python"},
    {"name": "export-service",            "port": 5015, "stack": "python"},
    {"name": "integration-service",       "port": 5016, "stack": "python"},
    {"name": "insights-service",          "port": 5018, "stack": "python"},
    {"name": "smart-reply-service",       "port": 5019, "stack": "python"},
    {"name": "spark-etl",                 "port": 5020, "stack": "python"},
    {"name": "ml-service",                "port": 5008, "stack": "python-gpu"},
    {"name": "moderation-service",        "port": 5014, "stack": "python-gpu"},
    {"name": "sentiment-service",         "port": 5017, "stack": "python-gpu"},
    {"name": "backend-gateway",           "port": 3000, "stack": "nestjs"},
    {"name": "notification-service",      "port": 3001, "stack": "nestjs"}
  ],
  "dnsConfig": {
    "routingPolicy": "MULTIVALUE",
    "dnsRecords": [{"type": "A", "ttl": 10}]
  },
  "healthCheckCustomConfig": {
    "failureThreshold": 1
  }
}
```

**Step 4: Commit**

```bash
git add ecs/networking/
git commit -m "feat(ecs): add ALB config, security groups, and Cloud Map service discovery"
```

---

## Task 8: Auto-Scaling Policies

**Files:**
- Create: `ecs/autoscaling/scaling-policies.json`
- Create: `ecs/autoscaling/scheduled-scaling.json`

**Step 1: Create scaling policies**

Create `ecs/autoscaling/scaling-policies.json`:

```json
{
  "_comment": "Application Auto Scaling policies for ECS services — target tracking by resource tier",
  "scalingPolicies": {
    "critical": {
      "description": "auth, gateway, user, permission, workspace — aggressive scaling",
      "services": ["auth-service", "user-service", "permission-service", "workspace-service", "backend-gateway"],
      "minCapacity": 2,
      "maxCapacity": 10,
      "policies": [
        {
          "policyName": "cpu-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {
              "predefinedMetricType": "ECSServiceAverageCPUUtilization"
            },
            "targetValue": 60.0,
            "scaleInCooldown": 300,
            "scaleOutCooldown": 60
          }
        },
        {
          "policyName": "memory-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {
              "predefinedMetricType": "ECSServiceAverageMemoryUtilization"
            },
            "targetValue": 70.0,
            "scaleInCooldown": 300,
            "scaleOutCooldown": 60
          }
        }
      ]
    },
    "standard": {
      "description": "Most services — balanced scaling",
      "services": [
        "audit-service", "admin-service", "security-service", "go-bff",
        "channel-service", "search-service", "thread-service", "bookmark-service",
        "reminder-service", "presence-service", "call-service", "message-service",
        "notification-orchestrator", "huddle-service", "event-broadcast-service",
        "notification-service", "integration-service", "insights-service", "smart-reply-service"
      ],
      "minCapacity": 1,
      "maxCapacity": 6,
      "policies": [
        {
          "policyName": "cpu-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageCPUUtilization"},
            "targetValue": 70.0,
            "scaleInCooldown": 300,
            "scaleOutCooldown": 120
          }
        },
        {
          "policyName": "memory-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageMemoryUtilization"},
            "targetValue": 75.0,
            "scaleInCooldown": 300,
            "scaleOutCooldown": 120
          }
        }
      ]
    },
    "heavy_io": {
      "description": "File/media/attachment/cdn/export — I/O-focused scaling",
      "services": ["media-service", "file-service", "attachment-service", "cdn-service", "export-service"],
      "minCapacity": 1,
      "maxCapacity": 8,
      "policies": [
        {
          "policyName": "cpu-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageCPUUtilization"},
            "targetValue": 65.0,
            "scaleInCooldown": 300,
            "scaleOutCooldown": 90
          }
        },
        {
          "policyName": "memory-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageMemoryUtilization"},
            "targetValue": 70.0,
            "scaleInCooldown": 300,
            "scaleOutCooldown": 90
          }
        }
      ]
    },
    "ml_gpu": {
      "description": "ML/sentiment/moderation on EC2 GPU — conservative scaling",
      "services": ["ml-service", "sentiment-service", "moderation-service"],
      "minCapacity": 1,
      "maxCapacity": 4,
      "policies": [
        {
          "policyName": "cpu-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageCPUUtilization"},
            "targetValue": 70.0,
            "scaleInCooldown": 600,
            "scaleOutCooldown": 120
          }
        },
        {
          "policyName": "memory-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageMemoryUtilization"},
            "targetValue": 80.0,
            "scaleInCooldown": 600,
            "scaleOutCooldown": 120
          }
        }
      ]
    },
    "batch": {
      "description": "spark-etl, analytics — scale to zero capable",
      "services": ["spark-etl", "analytics-service"],
      "minCapacity": 0,
      "maxCapacity": 3,
      "policies": [
        {
          "policyName": "cpu-target-tracking",
          "policyType": "TargetTrackingScaling",
          "targetTrackingScalingPolicyConfiguration": {
            "predefinedMetricSpecification": {"predefinedMetricType": "ECSServiceAverageCPUUtilization"},
            "targetValue": 80.0,
            "scaleInCooldown": 600,
            "scaleOutCooldown": 180
          }
        }
      ]
    }
  }
}
```

**Step 2: Create scheduled scaling config**

Create `ecs/autoscaling/scheduled-scaling.json`:

```json
{
  "_comment": "Scheduled scaling actions for batch/ETL workloads",
  "scheduledActions": [
    {
      "serviceName": "spark-etl",
      "description": "Scale up for nightly ETL processing",
      "schedule": "cron(0 2 ? * MON-FRI *)",
      "timezone": "UTC",
      "scalableTargetAction": {
        "minCapacity": 2,
        "maxCapacity": 3
      }
    },
    {
      "serviceName": "spark-etl",
      "description": "Scale down after ETL window",
      "schedule": "cron(0 6 ? * MON-FRI *)",
      "timezone": "UTC",
      "scalableTargetAction": {
        "minCapacity": 0,
        "maxCapacity": 3
      }
    },
    {
      "serviceName": "export-service",
      "description": "Scale up for nightly export processing",
      "schedule": "cron(0 0 ? * * *)",
      "timezone": "UTC",
      "scalableTargetAction": {
        "minCapacity": 3,
        "maxCapacity": 8
      }
    },
    {
      "serviceName": "export-service",
      "description": "Scale down after export window",
      "schedule": "cron(0 4 ? * * *)",
      "timezone": "UTC",
      "scalableTargetAction": {
        "minCapacity": 1,
        "maxCapacity": 8
      }
    }
  ]
}
```

**Step 3: Commit**

```bash
git add ecs/autoscaling/
git commit -m "feat(ecs): add auto-scaling policies and scheduled scaling for all tiers"
```

---

## Task 9: Environment Overrides

**Files:**
- Create: `ecs/environments/dev.json`
- Create: `ecs/environments/staging.json`
- Create: `ecs/environments/production.json`
- Create: `ecs/environments/live.json`

**Step 1: Create all 4 environment configs**

Create `ecs/environments/dev.json`:

```json
{
  "_comment": "Development environment overrides — minimal resources, single replicas, debug enabled",
  "environment": "dev",
  "overrides": {
    "cluster": {
      "containerInsights": "enabled",
      "executeCommand": true
    },
    "resources": {
      "cpuMultiplier": 0.5,
      "memoryMultiplier": 0.5,
      "minReplicas": {
        "critical": 1,
        "standard": 1,
        "heavy_io": 1,
        "ml_gpu": 1,
        "batch": 0
      }
    },
    "capacityProvider": {
      "strategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 1}
      ],
      "useSpot": false
    },
    "logging": {
      "level": "DEBUG",
      "retentionDays": 7
    },
    "autoscaling": {
      "enabled": false
    }
  }
}
```

Create `ecs/environments/staging.json`:

```json
{
  "_comment": "Staging environment overrides — production-like but with Spot instances and debug access",
  "environment": "staging",
  "overrides": {
    "cluster": {
      "containerInsights": "enhanced",
      "executeCommand": true
    },
    "resources": {
      "cpuMultiplier": 1.0,
      "memoryMultiplier": 1.0,
      "minReplicas": {
        "critical": 1,
        "standard": 1,
        "heavy_io": 1,
        "ml_gpu": 1,
        "batch": 0
      }
    },
    "capacityProvider": {
      "strategy": [
        {"capacityProvider": "FARGATE_SPOT", "weight": 80, "base": 0},
        {"capacityProvider": "FARGATE", "weight": 20, "base": 1}
      ],
      "useSpot": true
    },
    "logging": {
      "level": "INFO",
      "retentionDays": 14
    },
    "autoscaling": {
      "enabled": true
    }
  }
}
```

Create `ecs/environments/production.json`:

```json
{
  "_comment": "Production environment — high availability, mixed capacity, no debug access",
  "environment": "production",
  "overrides": {
    "cluster": {
      "containerInsights": "enhanced",
      "executeCommand": false
    },
    "resources": {
      "cpuMultiplier": 1.0,
      "memoryMultiplier": 1.0,
      "minReplicas": {
        "critical": 2,
        "standard": 1,
        "heavy_io": 1,
        "ml_gpu": 1,
        "batch": 0
      }
    },
    "capacityProvider": {
      "strategy": [
        {"capacityProvider": "FARGATE_SPOT", "weight": 60, "base": 0},
        {"capacityProvider": "FARGATE", "weight": 40, "base": 2}
      ],
      "useSpot": true
    },
    "logging": {
      "level": "INFO",
      "retentionDays": 30
    },
    "autoscaling": {
      "enabled": true
    }
  }
}
```

Create `ecs/environments/live.json`:

```json
{
  "_comment": "Live environment — maximum reliability, no Spot, no debug, longest retention",
  "environment": "live",
  "overrides": {
    "cluster": {
      "containerInsights": "enhanced",
      "executeCommand": false
    },
    "resources": {
      "cpuMultiplier": 1.5,
      "memoryMultiplier": 1.5,
      "minReplicas": {
        "critical": 3,
        "standard": 2,
        "heavy_io": 2,
        "ml_gpu": 2,
        "batch": 1
      }
    },
    "capacityProvider": {
      "strategy": [
        {"capacityProvider": "FARGATE", "weight": 1, "base": 3}
      ],
      "useSpot": false
    },
    "logging": {
      "level": "WARN",
      "retentionDays": 90
    },
    "autoscaling": {
      "enabled": true
    }
  }
}
```

**Step 2: Commit**

```bash
git add ecs/environments/
git commit -m "feat(ecs): add environment overrides (dev, staging, production, live)"
```

---

## Task 10: Scripts (Deploy + Validate)

**Files:**
- Create: `ecs/scripts/deploy-service.sh`
- Create: `ecs/scripts/validate-configs.sh`
- Delete: `ecs/backend-task-definition.json` (replaced by per-stack templates)

**Step 1: Create deploy script**

Create `ecs/scripts/deploy-service.sh`:

```bash
#!/usr/bin/env bash
# =============================================================================
# Deploy a Single ECS Service
# =============================================================================
# Usage: ./deploy-service.sh <service-name> [environment] [image-tag]
# Examples:
#   ./deploy-service.sh auth-service dev latest
#   ./deploy-service.sh ml-service production v1.2.3
# =============================================================================

set -euo pipefail

SERVICE_NAME="${1:?Usage: deploy-service.sh <service-name> [environment] [image-tag]}"
ENVIRONMENT="${2:-dev}"
IMAGE_TAG="${3:-latest}"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ECS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ECS Service Deployment ==="
echo "  Service:     $SERVICE_NAME"
echo "  Environment: $ENVIRONMENT"
echo "  Image Tag:   $IMAGE_TAG"
echo ""

# Determine stack from service discovery config
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* ]]; then
    PY_FILE=$(cygpath -w "$ECS_DIR/networking/service-discovery.json" 2>/dev/null || echo "$ECS_DIR/networking/service-discovery.json")
else
    PY_FILE="$ECS_DIR/networking/service-discovery.json"
fi

STACK=$(python -c "
import json
with open(r'$PY_FILE') as f:
    data = json.load(f)
for svc in data['services']:
    if svc['name'] == '$SERVICE_NAME':
        print(svc['stack'])
        break
else:
    print('UNKNOWN')
")

if [ "$STACK" = "UNKNOWN" ]; then
    echo "ERROR: Service '$SERVICE_NAME' not found in service-discovery.json"
    exit 1
fi

echo "  Stack:       $STACK"
echo "  Task Def:    ecs/task-definitions/$STACK.json"
echo ""

# Validate task definition exists
TASK_DEF="$ECS_DIR/task-definitions/$STACK.json"
if [ ! -f "$TASK_DEF" ]; then
    echo "ERROR: Task definition not found: $TASK_DEF"
    exit 1
fi

# Validate environment config exists
ENV_CONFIG="$ECS_DIR/environments/$ENVIRONMENT.json"
if [ ! -f "$ENV_CONFIG" ]; then
    echo "ERROR: Environment config not found: $ENV_CONFIG"
    echo "Available: $(ls "$ECS_DIR/environments/" | sed 's/.json//g' | tr '\n' ' ')"
    exit 1
fi

echo "[1/3] Registering task definition..."
echo "  aws ecs register-task-definition --cli-input-json file://$TASK_DEF"
echo "  (with SERVICE_NAME=$SERVICE_NAME, IMAGE_TAG=$IMAGE_TAG)"

echo ""
echo "[2/3] Updating ECS service..."
echo "  aws ecs update-service --cluster quckapp-cluster --service $SERVICE_NAME --task-definition quckapp-$SERVICE_NAME"

echo ""
echo "[3/3] Waiting for deployment to stabilize..."
echo "  aws ecs wait services-stable --cluster quckapp-cluster --services $SERVICE_NAME"

echo ""
echo "=== Deployment Complete ==="
echo "  Service '$SERVICE_NAME' deployed with image tag '$IMAGE_TAG' to '$ENVIRONMENT'"
```

**Step 2: Create validate script**

Create `ecs/scripts/validate-configs.sh`:

```bash
#!/usr/bin/env bash
# =============================================================================
# Validate ECS Configuration Files
# =============================================================================
# Usage: ./validate-configs.sh
# Validates JSON syntax for all ECS config files across all directories.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ECS_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ECS Config Validation ==="
echo "Directory: $ECS_DIR"
echo ""

TOTAL_FILES=0
TOTAL_PASS=0
TOTAL_FAIL=0

# Find all JSON files (exclude scripts directory)
while IFS= read -r file; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    REL_PATH="${file#$ECS_DIR/}"

    # Convert path for Python on Windows
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* ]]; then
        PY_FILE=$(cygpath -w "$file" 2>/dev/null || echo "$file")
    else
        PY_FILE="$file"
    fi

    if python -c "import json; json.load(open(r'$PY_FILE'))" 2>/dev/null; then
        echo "  PASS: $REL_PATH"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    else
        echo "  FAIL: $REL_PATH"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
done < <(find "$ECS_DIR" -name "*.json" -not -path "*/scripts/*" | sort)

echo ""
echo "=== Summary ==="
echo "  Total files: $TOTAL_FILES"
echo "  Passed:      $TOTAL_PASS"
echo "  Failed:      $TOTAL_FAIL"

# Count by directory
echo ""
echo "=== Files by Directory ==="
for dir in cluster task-definitions services networking autoscaling environments; do
    if [ -d "$ECS_DIR/$dir" ]; then
        COUNT=$(find "$ECS_DIR/$dir" -name "*.json" | wc -l)
        echo "  $dir/: $COUNT files"
    fi
done

echo ""
if [ "$TOTAL_FAIL" -gt 0 ]; then
    echo "=== Validation FAILED ==="
    exit 1
else
    echo "=== Validation PASSED ==="
fi
```

**Step 3: Remove legacy task definition**

```bash
git rm ecs/backend-task-definition.json
```

**Step 4: Commit**

```bash
git add ecs/scripts/
git commit -m "feat(ecs): add deploy/validate scripts, remove legacy task definition"
```

---

## Task 11: Commit Docs + Update Parent Repo

**Step 1: Commit implementation plan in docs submodule**

```bash
cd docs/
git add docs/plans/2026-03-02-ecs-fargate-implementation.md
git commit -m "docs: add ECS Fargate + EC2 GPU implementation plan"
```

**Step 2: Update parent repo submodule references**

```bash
cd ..   # back to QuckApp root
git add docs infrastructure
git commit -m "chore: update submodules (ECS infrastructure + docs)"
```

**Step 3: Push all submodules**

```bash
cd infrastructure && git push && cd ..
cd docs && git push && cd ..
git push
```
