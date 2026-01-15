# API Gateway Module

Creates API Gateway resources for RESTful and HTTP APIs with authentication, throttling, and monitoring.

## Features

- HTTP API (API Gateway v2) - lower latency, lower cost
- REST API (API Gateway v1) - advanced features
- Custom domains with TLS 1.2
- Cognito and JWT authorizers
- Lambda and HTTP integrations
- Request/response validation
- Usage plans and API keys
- Throttling and quotas
- VPC Link for private integrations
- WAF integration (REST API)
- CloudWatch logging and alarms

## Usage

### HTTP API (Recommended)

```hcl
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment = "prod"

  # HTTP API
  create_http_api = true
  stage_name      = "v1"
  auto_deploy     = true

  # CORS
  enable_cors = true
  cors_allowed_origins = [
    "https://app.quckapp.com",
    "https://admin.quckapp.com"
  ]
  cors_allowed_methods = ["GET", "POST", "PUT", "DELETE"]
  cors_allowed_headers = ["Authorization", "Content-Type"]

  # Custom domain
  custom_domain_name  = "api.quckapp.com"
  acm_certificate_arn = module.acm.certificate_arn

  # Throttling
  throttling_burst_limit = 5000
  throttling_rate_limit  = 10000

  # Logging
  enable_access_logging = true
  log_retention_days    = 30

  # Alarms
  enable_cloudwatch_alarms = true
  alarm_actions            = [module.sns.alerts_topic_arn]

  tags = var.tags
}
```

### REST API (Advanced Features)

```hcl
module "api_gateway" {
  source = "../../modules/api-gateway"

  environment = "prod"

  # REST API
  create_rest_api       = true
  rest_api_endpoint_type = "REGIONAL"
  stage_name            = "v1"

  # Caching
  enable_cache       = true
  cache_cluster_size = "0.5"
  cache_ttl          = 300

  # X-Ray tracing
  enable_xray_tracing = true

  # Usage plans
  create_usage_plan = true
  quota_limit       = 10000
  quota_period      = "DAY"

  # API keys
  api_keys = {
    mobile-app = {
      description = "Mobile application"
      enabled     = true
      value       = null  # Auto-generate
    }
    partner-api = {
      description = "Partner integration"
      enabled     = true
      value       = var.partner_api_key
    }
  }

  # WAF
  waf_web_acl_arn = module.waf.web_acl_arn

  tags = var.tags
}
```

## Architecture

### HTTP API

```
┌─────────────────────────────────────────────────────────────┐
│                      HTTP API                                │
│                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐   │
│  │   Custom     │───▶│    Stage     │───▶│   Routes     │   │
│  │   Domain     │    │   (v1)       │    │   & Auth     │   │
│  └──────────────┘    └──────────────┘    └──────────────┘   │
│                                                   │          │
│                                          ┌────────▼────────┐ │
│                                          │  Integrations   │ │
│                                          │  Lambda/HTTP    │ │
│                                          └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### REST API

```
┌───────────────────────────────────────────────────────────────┐
│                       REST API                                 │
│                                                                │
│  ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌────────────┐  │
│  │  WAF     │──▶│ API Key  │──▶│ Authoriz │──▶│  Resource  │  │
│  │          │   │ Validate │   │          │   │  /Method   │  │
│  └──────────┘   └──────────┘   └──────────┘   └──────┬─────┘  │
│                                                       │        │
│  ┌──────────┐                                ┌───────▼──────┐ │
│  │  Cache   │◀───────────────────────────────│ Integration  │ │
│  │          │                                │ Lambda/HTTP  │ │
│  └──────────┘                                └──────────────┘ │
└───────────────────────────────────────────────────────────────┘
```

## HTTP API vs REST API

| Feature | HTTP API | REST API |
|---------|----------|----------|
| Latency | Lower (~10ms) | Higher (~30ms) |
| Cost | 70% cheaper | Standard pricing |
| CORS | Native support | Manual setup |
| JWT Auth | Built-in | Lambda authorizer |
| API Keys | No | Yes |
| Usage Plans | No | Yes |
| Request Validation | No | Yes |
| Caching | No | Yes |
| WAF | No | Yes |
| X-Ray | Limited | Full support |

**Use HTTP API** for: Most modern APIs, Lambda backends, simple authentication
**Use REST API** for: API key management, request validation, caching, WAF protection

## Authorizers

### JWT Authorizer (HTTP API)

```hcl
authorizer {
  name             = "cognito-jwt"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]

  jwt_configuration {
    issuer   = "https://cognito-idp.${region}.amazonaws.com/${user_pool_id}"
    audience = [client_id]
  }
}
```

### Cognito Authorizer (REST API)

```hcl
authorizer {
  name          = "cognito"
  type          = "COGNITO_USER_POOLS"
  provider_arns = [cognito_user_pool_arn]
}
```

### Lambda Authorizer

```hcl
authorizer {
  name                   = "custom-auth"
  authorizer_uri         = lambda_invoke_arn
  authorizer_credentials = iam_role_arn
  type                   = "TOKEN"  # or "REQUEST"

  # Cache policy
  authorizer_result_ttl_in_seconds = 300
}
```

## Routes and Integrations

### Lambda Integration

```hcl
# HTTP API route
route {
  route_key = "POST /users"
  target    = "integrations/${lambda_integration_id}"

  authorization_type = "JWT"
  authorizer_id      = jwt_authorizer_id
}

integration {
  integration_type       = "AWS_PROXY"
  integration_uri        = lambda_invoke_arn
  payload_format_version = "2.0"
}
```

### HTTP Proxy Integration

```hcl
integration {
  integration_type   = "HTTP_PROXY"
  integration_uri    = "https://backend.internal.com/{proxy}"
  integration_method = "ANY"

  connection_type = "VPC_LINK"
  connection_id   = vpc_link_id
}
```

## Custom Domains

```hcl
# Domain configuration
domain {
  domain_name     = "api.quckapp.com"
  certificate_arn = acm_certificate_arn
  security_policy = "TLS_1_2"
}

# API mapping
mapping {
  api_id          = api_id
  stage           = stage_id
  api_mapping_key = "v1"  # api.quckapp.com/v1/...
}
```

### DNS Configuration

```hcl
# Route 53 record
resource "aws_route53_record" "api" {
  zone_id = hosted_zone_id
  name    = "api.quckapp.com"
  type    = "A"

  alias {
    name                   = api_gateway_domain.target_domain_name
    zone_id                = api_gateway_domain.hosted_zone_id
    evaluate_target_health = true
  }
}
```

## Throttling and Quotas

### Stage-Level Throttling

```hcl
default_route_settings {
  throttling_burst_limit = 5000   # Concurrent requests
  throttling_rate_limit  = 10000  # Requests per second
}
```

### Usage Plans (REST API)

```hcl
usage_plan {
  name = "standard-plan"

  quota_settings {
    limit  = 10000   # Requests per period
    period = "DAY"   # DAY, WEEK, MONTH
  }

  throttle_settings {
    burst_limit = 200
    rate_limit  = 100
  }
}
```

## VPC Link

For private backend integrations:

```hcl
# HTTP API VPC Link
vpc_link {
  name               = "backend-vpc-link"
  security_group_ids = [sg_id]
  subnet_ids         = private_subnet_ids
}

# REST API VPC Link
vpc_link {
  name        = "backend-vpc-link"
  target_arns = [nlb_arn]
}
```

## Access Logging

```hcl
access_log_settings {
  destination_arn = cloudwatch_log_group_arn
  format = jsonencode({
    requestId         = "$context.requestId"
    ip                = "$context.identity.sourceIp"
    requestTime       = "$context.requestTime"
    httpMethod        = "$context.httpMethod"
    routeKey          = "$context.routeKey"
    status            = "$context.status"
    responseLength    = "$context.responseLength"
    integrationLatency = "$context.integrationLatency"
  })
}
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `create_http_api` | Create HTTP API | bool | `true` |
| `create_rest_api` | Create REST API | bool | `false` |
| `stage_name` | Stage name | string | `"v1"` |
| `custom_domain_name` | Custom domain | string | `null` |
| `throttling_burst_limit` | Burst limit | number | `5000` |
| `throttling_rate_limit` | Rate limit | number | `10000` |
| `enable_access_logging` | Enable logging | bool | `true` |

## Outputs

| Name | Description |
|------|-------------|
| `http_api_id` | HTTP API ID |
| `http_api_endpoint` | HTTP API endpoint URL |
| `rest_api_id` | REST API ID |
| `rest_api_execution_arn` | REST API execution ARN |
| `custom_domain_name` | Custom domain name |
| `vpc_link_id` | VPC Link ID |
| `stage_invoke_url` | Stage invoke URL |

## Cost Considerations

### HTTP API Pricing

| Requests/Month | Price (per million) |
|----------------|---------------------|
| First 300M | $1.00 |
| Over 300M | $0.90 |

### REST API Pricing

| Requests/Month | Price (per million) |
|----------------|---------------------|
| First 333M | $3.50 |
| Over 333M | $2.80 |

### Additional Costs

| Feature | Cost |
|---------|------|
| Caching (0.5 GB) | $0.020/hour |
| Caching (6.1 GB) | $0.200/hour |
| Data transfer | $0.09/GB |

### Optimization Tips

1. Use HTTP API when possible (70% cheaper)
2. Enable caching for frequently accessed endpoints
3. Use appropriate cache sizes
4. Implement client-side caching with Cache-Control headers
5. Use compression for large payloads
