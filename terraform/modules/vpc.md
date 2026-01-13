# VPC Module

Creates a complete VPC networking infrastructure for QuikApp.

## Features

- Multi-AZ VPC with public and private subnets
- Database and ElastiCache dedicated subnets
- NAT Gateways for private subnet internet access
- VPC Endpoints for AWS service connectivity
- Flow Logs for network monitoring
- Network ACLs for additional security
- Pre-configured security groups

## Usage

```hcl
module "vpc" {
  source = "../../modules/vpc"

  environment = "prod"
  vpc_cidr    = "10.0.0.0/16"
  az_count    = 3

  # Subnets
  create_database_subnets    = true
  create_elasticache_subnets = true

  # NAT Gateway
  enable_nat_gateway = true
  single_nat_gateway = false  # One per AZ for HA

  # VPC Endpoints
  create_s3_endpoint       = true
  create_dynamodb_endpoint = true
  create_interface_endpoints = true

  # Flow Logs
  enable_flow_logs = true

  # Security Groups
  create_alb_security_group         = true
  create_application_security_group = true
  create_database_security_group    = true

  tags = var.tags
}
```

## Subnet Architecture

| Subnet Type | CIDR Range | Purpose |
|-------------|------------|---------|
| Public | /20 per AZ | ALB, NAT Gateway, Bastion |
| Private | /20 per AZ | Application servers, Lambda |
| Database | /24 per AZ | RDS, Aurora |
| ElastiCache | /24 per AZ | Redis, Memcached |

### Example CIDR Allocation (10.0.0.0/16)

```
AZ-a:
  Public:      10.0.0.0/20   (10.0.0.1 - 10.0.15.254)
  Private:     10.0.64.0/20  (10.0.64.1 - 10.0.79.254)
  Database:    10.0.128.0/24 (10.0.128.1 - 10.0.128.254)
  ElastiCache: 10.0.132.0/24 (10.0.132.1 - 10.0.132.254)

AZ-b:
  Public:      10.0.16.0/20
  Private:     10.0.80.0/20
  Database:    10.0.129.0/24
  ElastiCache: 10.0.133.0/24

AZ-c:
  Public:      10.0.32.0/20
  Private:     10.0.96.0/20
  Database:    10.0.130.0/24
  ElastiCache: 10.0.134.0/24
```

## VPC Endpoints

### Gateway Endpoints (Free)

| Endpoint | Purpose |
|----------|---------|
| S3 | Private S3 access |
| DynamoDB | Private DynamoDB access |

### Interface Endpoints (Charged)

| Endpoint | Purpose |
|----------|---------|
| ECR (api, dkr) | Container registry |
| SSM, SSM Messages | Systems Manager |
| Secrets Manager | Secrets access |
| CloudWatch Logs | Log delivery |
| KMS | Encryption operations |
| SQS | Queue access |
| SNS | Topic access |
| Lambda | Function invocation |
| STS | Token service |
| Cognito | Authentication |

## Security Groups

### ALB Security Group

```hcl
Ingress:
  - Port 80 (HTTP) from 0.0.0.0/0
  - Port 443 (HTTPS) from 0.0.0.0/0

Egress:
  - All traffic to application security group
```

### Application Security Group

```hcl
Ingress:
  - Application port from ALB security group
  - Application port from Lambda security group

Egress:
  - All traffic (0.0.0.0/0)
```

### Database Security Group

```hcl
Ingress:
  - Port 5432/3306 from application security group
  - Port 5432/3306 from Lambda security group

Egress:
  - None (databases don't initiate connections)
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `vpc_cidr` | VPC CIDR block | string | `"10.0.0.0/16"` |
| `az_count` | Number of AZs | number | `3` |
| `enable_nat_gateway` | Enable NAT Gateway | bool | `true` |
| `single_nat_gateway` | Use single NAT (cost savings) | bool | `false` |
| `enable_flow_logs` | Enable VPC Flow Logs | bool | `true` |
| `flow_logs_destination` | Destination type | string | `"cloud-watch-logs"` |

## Outputs

| Name | Description |
|------|-------------|
| `vpc_id` | VPC ID |
| `vpc_cidr_block` | VPC CIDR block |
| `public_subnet_ids` | List of public subnet IDs |
| `private_subnet_ids` | List of private subnet IDs |
| `database_subnet_ids` | List of database subnet IDs |
| `database_subnet_group_name` | RDS subnet group name |
| `elasticache_subnet_group_name` | ElastiCache subnet group name |
| `alb_security_group_id` | ALB security group ID |
| `application_security_group_id` | App security group ID |
| `database_security_group_id` | Database security group ID |
| `nat_gateway_public_ips` | NAT Gateway public IPs |

## Cost Considerations

| Component | Cost (us-east-1) |
|-----------|------------------|
| NAT Gateway | $0.045/hour + $0.045/GB |
| Interface Endpoint | $0.01/hour per AZ |
| Flow Logs (CloudWatch) | $0.50/GB ingested |

### Cost Optimization Tips

1. **Dev environment**: Use single NAT Gateway
2. **Gateway endpoints**: Always free (S3, DynamoDB)
3. **Interface endpoints**: Enable only what's needed
4. **Flow Logs**: Use S3 destination for lower cost
