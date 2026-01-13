---
sidebar_position: 14
---

# HashiCorp Consul

QuikApp uses HashiCorp Consul for service discovery, health checking, and distributed configuration management across all microservices.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                       Consul Cluster                             │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Consul Server  │  │  Consul Server  │  │  Consul Server  │  │
│  │    (Leader)     │◄─│   (Follower)    │◄─│   (Follower)    │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                         Raft Consensus                           │
└─────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │  Consul   │        │  Consul   │        │  Consul   │
   │  Agent    │        │  Agent    │        │  Agent    │
   │ (Client)  │        │ (Client)  │        │ (Client)  │
   └─────┬─────┘        └─────┬─────┘        └─────┬─────┘
         │                    │                    │
         ▼                    ▼                    ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │   Auth    │        │  Backend  │        │  Search   │
   │  Service  │        │  Gateway  │        │  Service  │
   └───────────┘        └───────────┘        └───────────┘
```

## Features Used

| Feature | Purpose |
|---------|---------|
| **Service Discovery** | Locate services by name instead of IP |
| **Health Checking** | Monitor service health automatically |
| **KV Store** | Distributed configuration storage |
| **DNS Interface** | Service discovery via DNS queries |
| **HTTP API** | Programmatic service registration |

## Docker Configuration

```yaml
# docker-compose.yml
services:
  consul:
    image: hashicorp/consul:1.17
    container_name: QuikApp-consul
    ports:
      - "8500:8500"   # HTTP API & UI
      - "8600:8600/udp"  # DNS
      - "8301:8301"   # Serf LAN
      - "8302:8302"   # Serf WAN
      - "8300:8300"   # Server RPC
    environment:
      CONSUL_BIND_INTERFACE: eth0
    command: agent -server -bootstrap-expect=1 -ui -client=0.0.0.0
    volumes:
      - consul_data:/consul/data
      - ./config/consul:/consul/config
    networks:
      - QuikApp-network
    healthcheck:
      test: ["CMD", "consul", "members"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  consul_data:
```

### Production Cluster

```yaml
# docker-compose.consul-cluster.yml
services:
  consul-server-1:
    image: hashicorp/consul:1.17
    command: agent -server -bootstrap-expect=3 -node=consul-1 -retry-join=consul-server-2 -retry-join=consul-server-3 -client=0.0.0.0 -ui
    volumes:
      - consul1_data:/consul/data
    networks:
      - QuikApp-network

  consul-server-2:
    image: hashicorp/consul:1.17
    command: agent -server -bootstrap-expect=3 -node=consul-2 -retry-join=consul-server-1 -retry-join=consul-server-3 -client=0.0.0.0
    volumes:
      - consul2_data:/consul/data
    networks:
      - QuikApp-network

  consul-server-3:
    image: hashicorp/consul:1.17
    command: agent -server -bootstrap-expect=3 -node=consul-3 -retry-join=consul-server-1 -retry-join=consul-server-2 -client=0.0.0.0
    volumes:
      - consul3_data:/consul/data
    networks:
      - QuikApp-network

volumes:
  consul1_data:
  consul2_data:
  consul3_data:
```

### Server Configuration

```hcl
# config/consul/server.hcl
datacenter = "QuikApp-dc1"
data_dir = "/consul/data"
log_level = "INFO"

server = true
bootstrap_expect = 3

ui_config {
  enabled = true
}

bind_addr = "0.0.0.0"
client_addr = "0.0.0.0"

addresses {
  http = "0.0.0.0"
  dns = "0.0.0.0"
}

ports {
  http = 8500
  dns = 8600
}

connect {
  enabled = true
}

acl {
  enabled = true
  default_policy = "deny"
  enable_token_persistence = true
}

telemetry {
  prometheus_retention_time = "30s"
  disable_hostname = true
}
```

## Service Registration

### Service Definition Files

```json
// config/consul/services/auth-service.json
{
  "service": {
    "id": "auth-service-1",
    "name": "auth-service",
    "tags": ["spring-boot", "auth", "v1"],
    "address": "auth-service",
    "port": 8001,
    "meta": {
      "version": "1.0.0",
      "environment": "production"
    },
    "checks": [
      {
        "id": "auth-health",
        "name": "Auth Service Health",
        "http": "http://auth-service:8001/actuator/health",
        "interval": "10s",
        "timeout": "5s"
      }
    ],
    "weights": {
      "passing": 10,
      "warning": 1
    }
  }
}
```

```json
// config/consul/services/backend-gateway.json
{
  "service": {
    "id": "backend-gateway-1",
    "name": "backend-gateway",
    "tags": ["nestjs", "api", "gateway"],
    "address": "backend",
    "port": 3000,
    "checks": [
      {
        "id": "backend-health",
        "name": "Backend Gateway Health",
        "http": "http://backend:3000/health",
        "interval": "10s",
        "timeout": "3s"
      },
      {
        "id": "backend-ready",
        "name": "Backend Gateway Ready",
        "http": "http://backend:3000/health/ready",
        "interval": "15s",
        "timeout": "5s"
      }
    ]
  }
}
```

## Client Integration

### Spring Boot

```yaml
# application.yml
spring:
  cloud:
    consul:
      host: ${CONSUL_HOST:localhost}
      port: ${CONSUL_PORT:8500}
      discovery:
        enabled: true
        service-name: auth-service
        instance-id: ${spring.application.name}:${random.uuid}
        health-check-path: /actuator/health
        health-check-interval: 10s
        tags:
          - spring-boot
          - auth
          - version=1.0.0
        metadata:
          environment: ${ENVIRONMENT:development}
      config:
        enabled: true
        prefix: config
        default-context: application
        profile-separator: '::'
```

```java
// ConsulConfig.java
@Configuration
@EnableDiscoveryClient
public class ConsulConfig {

    @Bean
    @LoadBalanced
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }

    // Call other services using service name
    @Autowired
    private RestTemplate restTemplate;

    public UserDTO getUser(String userId) {
        return restTemplate.getForObject(
            "http://user-service/api/v1/users/" + userId,
            UserDTO.class
        );
    }
}
```

### NestJS

```typescript
// consul.module.ts
import { Module, Global, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import Consul from 'consul';

@Global()
@Module({})
export class ConsulModule implements OnModuleInit, OnModuleDestroy {
  private consul: Consul.Consul;
  private serviceId: string;

  async onModuleInit() {
    this.consul = new Consul({
      host: process.env.CONSUL_HOST || 'localhost',
      port: process.env.CONSUL_PORT || '8500',
    });

    this.serviceId = `backend-gateway-${process.env.HOSTNAME || 'local'}`;

    // Register service
    await this.consul.agent.service.register({
      id: this.serviceId,
      name: 'backend-gateway',
      address: process.env.SERVICE_HOST || 'localhost',
      port: parseInt(process.env.PORT || '3000'),
      tags: ['nestjs', 'gateway', 'api'],
      check: {
        http: `http://${process.env.SERVICE_HOST || 'localhost'}:${process.env.PORT || '3000'}/health`,
        interval: '10s',
        timeout: '5s',
      },
    });

    console.log(`Registered service: ${this.serviceId}`);
  }

  async onModuleDestroy() {
    await this.consul.agent.service.deregister(this.serviceId);
    console.log(`Deregistered service: ${this.serviceId}`);
  }

  async getService(name: string): Promise<ServiceInfo[]> {
    const services = await this.consul.health.service({
      service: name,
      passing: true,
    });

    return services.map((s: any) => ({
      id: s.Service.ID,
      address: s.Service.Address,
      port: s.Service.Port,
      tags: s.Service.Tags,
    }));
  }

  async getServiceUrl(name: string): Promise<string> {
    const services = await this.getService(name);
    if (services.length === 0) {
      throw new Error(`No healthy instances of ${name} found`);
    }
    // Simple round-robin (use proper load balancing in production)
    const service = services[Math.floor(Math.random() * services.length)];
    return `http://${service.address}:${service.port}`;
  }
}
```

```typescript
// consul.service.ts - Service Discovery
import { Injectable, Inject } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConsulModule } from './consul.module';

@Injectable()
export class UserServiceClient {
  constructor(
    private httpService: HttpService,
    private consul: ConsulModule,
  ) {}

  async getUser(userId: string) {
    const baseUrl = await this.consul.getServiceUrl('user-service');
    const response = await this.httpService.axiosRef.get(
      `${baseUrl}/api/v1/users/${userId}`
    );
    return response.data;
  }
}
```

### Go

```go
// consul/client.go
package consul

import (
    "fmt"
    "math/rand"
    "os"
    "time"

    "github.com/hashicorp/consul/api"
)

type Client struct {
    consul *api.Client
    serviceID string
}

func NewClient() (*Client, error) {
    config := api.DefaultConfig()
    config.Address = os.Getenv("CONSUL_ADDR")
    if config.Address == "" {
        config.Address = "localhost:8500"
    }

    client, err := api.NewClient(config)
    if err != nil {
        return nil, err
    }

    return &Client{consul: client}, nil
}

func (c *Client) Register(name string, port int, tags []string) error {
    c.serviceID = fmt.Sprintf("%s-%s", name, os.Getenv("HOSTNAME"))

    registration := &api.AgentServiceRegistration{
        ID:      c.serviceID,
        Name:    name,
        Port:    port,
        Tags:    tags,
        Address: os.Getenv("SERVICE_HOST"),
        Check: &api.AgentServiceCheck{
            HTTP:                           fmt.Sprintf("http://%s:%d/health", os.Getenv("SERVICE_HOST"), port),
            Interval:                       "10s",
            Timeout:                        "5s",
            DeregisterCriticalServiceAfter: "1m",
        },
    }

    return c.consul.Agent().ServiceRegister(registration)
}

func (c *Client) Deregister() error {
    return c.consul.Agent().ServiceDeregister(c.serviceID)
}

func (c *Client) GetService(name string) (*api.ServiceEntry, error) {
    services, _, err := c.consul.Health().Service(name, "", true, nil)
    if err != nil {
        return nil, err
    }

    if len(services) == 0 {
        return nil, fmt.Errorf("no healthy instances of %s found", name)
    }

    // Random selection (implement proper load balancing)
    rand.Seed(time.Now().UnixNano())
    return services[rand.Intn(len(services))], nil
}

func (c *Client) GetServiceURL(name string) (string, error) {
    service, err := c.GetService(name)
    if err != nil {
        return "", err
    }

    return fmt.Sprintf("http://%s:%d", service.Service.Address, service.Service.Port), nil
}
```

### Python

```python
# consul_client.py
import consul
import os
import random
import socket
import atexit

class ConsulClient:
    def __init__(self):
        self.consul = consul.Consul(
            host=os.getenv('CONSUL_HOST', 'localhost'),
            port=int(os.getenv('CONSUL_PORT', 8500))
        )
        self.service_id = None

    def register(self, name: str, port: int, tags: list = None):
        hostname = socket.gethostname()
        self.service_id = f"{name}-{hostname}"

        self.consul.agent.service.register(
            name=name,
            service_id=self.service_id,
            address=os.getenv('SERVICE_HOST', 'localhost'),
            port=port,
            tags=tags or [],
            check=consul.Check.http(
                url=f"http://{os.getenv('SERVICE_HOST', 'localhost')}:{port}/health",
                interval='10s',
                timeout='5s',
                deregister='1m'
            )
        )

        # Auto-deregister on exit
        atexit.register(self.deregister)

        print(f"Registered service: {self.service_id}")

    def deregister(self):
        if self.service_id:
            self.consul.agent.service.deregister(self.service_id)
            print(f"Deregistered service: {self.service_id}")

    def get_service(self, name: str) -> dict:
        _, services = self.consul.health.service(name, passing=True)

        if not services:
            raise Exception(f"No healthy instances of {name} found")

        # Random selection
        service = random.choice(services)
        return {
            'id': service['Service']['ID'],
            'address': service['Service']['Address'],
            'port': service['Service']['Port'],
            'tags': service['Service']['Tags']
        }

    def get_service_url(self, name: str) -> str:
        service = self.get_service(name)
        return f"http://{service['address']}:{service['port']}"

# Usage
consul_client = ConsulClient()
consul_client.register('analytics-service', 5001, ['python', 'analytics'])

# Call other services
user_service_url = consul_client.get_service_url('user-service')
```

## Key-Value Store

### Configuration Management

```bash
# Set configuration values
consul kv put config/QuikApp/database/max_connections 100
consul kv put config/QuikApp/cache/ttl 3600
consul kv put config/QuikApp/rate_limit/requests_per_second 100

# Get values
consul kv get config/QuikApp/database/max_connections

# List all keys
consul kv get -recurse config/QuikApp/

# Export configuration
consul kv export config/QuikApp/ > config-backup.json

# Import configuration
consul kv import @config-backup.json
```

### Watch for Changes

```typescript
// config-watcher.ts
import Consul from 'consul';

const consul = new Consul();

async function watchConfig(key: string, callback: (value: string) => void) {
  const watcher = consul.watch({
    method: consul.kv.get,
    options: { key },
  });

  watcher.on('change', (data) => {
    if (data && data.Value) {
      callback(Buffer.from(data.Value, 'base64').toString());
    }
  });

  watcher.on('error', (err) => {
    console.error('Watch error:', err);
  });
}

// Usage
watchConfig('config/QuikApp/rate_limit/requests_per_second', (value) => {
  console.log('Rate limit updated:', value);
  updateRateLimit(parseInt(value));
});
```

## DNS Interface

```bash
# Query service via DNS
dig @localhost -p 8600 auth-service.service.consul

# SRV record (includes port)
dig @localhost -p 8600 auth-service.service.consul SRV

# Query with tag filter
dig @localhost -p 8600 spring-boot.auth-service.service.consul
```

### DNS Configuration in Docker

```yaml
# docker-compose.yml
services:
  backend:
    dns:
      - 172.17.0.1  # Docker bridge IP
    dns_search:
      - service.consul
```

## Health Checks

### Check Types

```json
{
  "checks": [
    {
      "id": "http-check",
      "name": "HTTP Health Check",
      "http": "http://localhost:8001/health",
      "interval": "10s",
      "timeout": "5s"
    },
    {
      "id": "tcp-check",
      "name": "TCP Port Check",
      "tcp": "localhost:8001",
      "interval": "10s",
      "timeout": "3s"
    },
    {
      "id": "grpc-check",
      "name": "gRPC Health Check",
      "grpc": "localhost:50051",
      "grpc_use_tls": false,
      "interval": "10s"
    },
    {
      "id": "script-check",
      "name": "Script Check",
      "args": ["/scripts/check-db.sh"],
      "interval": "30s",
      "timeout": "10s"
    }
  ]
}
```

## Monitoring

### Prometheus Metrics

```yaml
# prometheus.yml
scrape_configs:
  - job_name: 'consul'
    metrics_path: '/v1/agent/metrics'
    params:
      format: ['prometheus']
    static_configs:
      - targets: ['consul:8500']
```

### Key Metrics

| Metric | Description |
|--------|-------------|
| `consul_catalog_services` | Number of registered services |
| `consul_health_service_checks` | Health check status |
| `consul_serf_member_status` | Cluster member status |
| `consul_raft_leader` | Current Raft leader |
| `consul_kv_store_entries` | Number of KV entries |

## Backup & Recovery

```bash
#!/bin/bash
# scripts/backup-consul.sh

BACKUP_DIR="/backups/consul"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Snapshot (includes KV store, service catalog, ACL tokens)
consul snapshot save "$BACKUP_DIR/consul_${TIMESTAMP}.snap"

# Export KV store separately
consul kv export > "$BACKUP_DIR/kv_${TIMESTAMP}.json"

# Keep only last 7 days
find $BACKUP_DIR -name "*.snap" -mtime +7 -delete
find $BACKUP_DIR -name "*.json" -mtime +7 -delete

# Upload to S3
aws s3 sync $BACKUP_DIR s3://QuikApp-backups/consul/
```

### Restore

```bash
# Restore snapshot
consul snapshot restore consul_backup.snap

# Restore KV store
consul kv import @kv_backup.json
```
