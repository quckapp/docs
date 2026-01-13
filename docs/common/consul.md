---
sidebar_position: 8
---

# Consul Integration

HashiCorp Consul for service discovery and configuration.

## Features

- Service registration/deregistration
- Health checks
- Service discovery
- KV store for configuration
- Leader election

## Usage

```typescript
// Service registration
await consul.registerService({
  name: 'backend-gateway',
  port: 3000,
  check: {
    http: 'http://localhost:3000/health',
    interval: '10s',
  },
});

// Service discovery
const authService = await consul.getServiceInstance('auth-service');
const url = `http://${authService.address}:${authService.port}`;

// KV store
await consul.setKV('config/feature-flags', { darkMode: true });
const config = await consul.getKV('config/feature-flags');
```
