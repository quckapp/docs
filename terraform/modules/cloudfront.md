# CloudFront Module

Creates CloudFront CDN distribution with WAF, signed URLs, and Lambda@Edge integration.

## Features

- Multi-origin distribution (media, thumbnails)
- Origin Access Control (OAC) for S3
- Signed URLs/Cookies for secure access
- WAF Web ACL with rate limiting
- Custom cache policies
- Lambda@Edge for image optimization
- Geographic restrictions
- Custom domain with SSL

## Usage

```hcl
module "cloudfront" {
  source = "../../modules/cloudfront"

  environment = "prod"

  # S3 Origins
  media_bucket_regional_domain_name = module.s3.media_bucket_regional_domain_name
  media_bucket_arn                  = module.s3.media_bucket_arn
  thumbnails_bucket_domain_name     = module.s3.thumbnails_bucket_domain_name
  thumbnails_bucket_arn             = module.s3.thumbnails_bucket_arn

  # Custom domain
  domain_aliases      = ["cdn.quckapp.com"]
  acm_certificate_arn = var.cdn_certificate_arn

  # Signed URLs
  enable_signed_urls        = true
  cloudfront_public_key_pem = var.cloudfront_public_key

  # WAF
  create_waf_web_acl    = true
  waf_rate_limit        = 2000
  waf_blocked_countries = ["KP", "IR"]

  # Performance
  price_class          = "PriceClass_200"
  enable_origin_shield = true

  tags = var.tags
}
```

## Distribution Architecture

```
                    CloudFront Distribution
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   /media/*           /thumbs/*          /api/*
        │                  │                  │
        ▼                  ▼                  ▼
   ┌─────────┐       ┌─────────┐       ┌─────────┐
   │ S3 Media│       │S3 Thumbs│       │   API   │
   │ Bucket  │       │ Bucket  │       │ Gateway │
   └─────────┘       └─────────┘       └─────────┘
```

## Cache Behaviors

### Media Cache Policy

```hcl
cache_policy {
  name        = "MediaCachePolicy"
  default_ttl = 86400      # 1 day
  max_ttl     = 31536000   # 1 year
  min_ttl     = 0

  # Cache by query strings for signed URLs
  query_strings {
    include = ["Expires", "Signature", "Key-Pair-Id"]
  }

  # Compression
  enable_accept_encoding_gzip   = true
  enable_accept_encoding_brotli = true
}
```

### Thumbnails Cache Policy

```hcl
cache_policy {
  name        = "ThumbnailCachePolicy"
  default_ttl = 604800     # 7 days
  max_ttl     = 31536000   # 1 year
  min_ttl     = 86400      # 1 day

  # Cache by image format preference
  headers {
    include = ["Accept"]
  }
}
```

## Signed URLs

### Key Pair Setup

1. Generate RSA key pair:
```bash
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem
```

2. Upload public key to CloudFront
3. Store private key securely (Secrets Manager)

### Generating Signed URLs

```python
from datetime import datetime, timedelta
import boto3

def generate_signed_url(file_path, expiration_minutes=60):
    cloudfront_signer = boto3.client('cloudfront').get_signer(
        key_id=KEY_PAIR_ID,
        private_key=PRIVATE_KEY
    )

    url = f"https://cdn.quckapp.com/{file_path}"
    expires = datetime.utcnow() + timedelta(minutes=expiration_minutes)

    return cloudfront_signer.generate_presigned_url(
        url,
        date_less_than=expires
    )
```

## WAF Configuration

### Rate Limiting

```hcl
rule {
  name     = "RateLimit"
  priority = 1

  rate_based_statement {
    limit              = 2000  # Requests per 5 minutes
    aggregate_key_type = "IP"
  }

  action {
    block {}
  }
}
```

### Geographic Blocking

```hcl
rule {
  name     = "GeoBlock"
  priority = 2

  geo_match_statement {
    country_codes = ["KP", "IR", "SY"]
  }

  action {
    block {}
  }
}
```

### SQL Injection Protection

```hcl
rule {
  name     = "SQLInjection"
  priority = 3

  managed_rule_group_statement {
    vendor_name = "AWS"
    name        = "AWSManagedRulesSQLiRuleSet"
  }
}
```

## Lambda@Edge

### Image Optimization

```javascript
// Origin Response - Convert images to WebP
exports.handler = async (event) => {
  const response = event.Records[0].cf.response;
  const request = event.Records[0].cf.request;

  // Check if client supports WebP
  const accept = request.headers['accept']?.[0]?.value || '';

  if (accept.includes('image/webp')) {
    // Redirect to WebP version
    response.headers['content-type'] = [{ value: 'image/webp' }];
  }

  return response;
};
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `media_bucket_regional_domain_name` | S3 bucket domain | string | - |
| `domain_aliases` | Custom domains | list(string) | `[]` |
| `acm_certificate_arn` | ACM cert ARN (us-east-1) | string | `null` |
| `enable_signed_urls` | Enable signed URLs | bool | `false` |
| `create_waf_web_acl` | Create WAF | bool | `true` |
| `price_class` | CloudFront price class | string | `"PriceClass_100"` |

## Outputs

| Name | Description |
|------|-------------|
| `distribution_id` | CloudFront distribution ID |
| `distribution_arn` | Distribution ARN |
| `distribution_domain_name` | CloudFront domain |
| `cdn_url` | Full CDN URL |
| `media_oac_id` | Origin Access Control ID |
| `waf_web_acl_arn` | WAF Web ACL ARN |
| `cache_policy_ids` | Map of cache policy IDs |

## Price Classes

| Price Class | Regions | Cost |
|-------------|---------|------|
| PriceClass_100 | US, Canada, Europe | Lowest |
| PriceClass_200 | + Asia, Africa, Middle East | Medium |
| PriceClass_All | All edge locations | Highest |

## Cost Optimization

1. **Price Class**: Use PriceClass_100 for primarily US/EU traffic
2. **Origin Shield**: Reduces origin requests but adds cost
3. **Cache TTL**: Longer TTLs reduce origin requests
4. **Compression**: Enable Gzip/Brotli to reduce transfer costs
