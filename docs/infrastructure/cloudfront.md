---
sidebar_position: 4
---

# CloudFront CDN

Amazon CloudFront provides global content delivery for QuckApp media, with 400+ edge locations for low-latency access worldwide.

## CDN Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           CloudFront Global Distribution                             │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│                              ┌─────────────────────┐                                 │
│                              │      Clients        │                                 │
│                              │   (Global Users)    │                                 │
│                              └──────────┬──────────┘                                 │
│                                         │                                            │
│                              ┌──────────▼──────────┐                                 │
│                              │     Route 53        │                                 │
│                              │  (DNS Resolution)   │                                 │
│                              └──────────┬──────────┘                                 │
│                                         │                                            │
│         ┌───────────────────────────────┼───────────────────────────────┐           │
│         │                               │                               │           │
│         ▼                               ▼                               ▼           │
│  ┌─────────────┐                 ┌─────────────┐                 ┌─────────────┐    │
│  │  North      │                 │   Europe    │                 │    Asia     │    │
│  │  America    │                 │   Edge      │                 │   Pacific   │    │
│  │  Edge PoPs  │                 │   PoPs      │                 │   Edge PoPs │    │
│  │             │                 │             │                 │             │    │
│  │ • New York  │                 │ • London    │                 │ • Tokyo     │    │
│  │ • LA        │                 │ • Frankfurt │                 │ • Singapore │    │
│  │ • Chicago   │                 │ • Paris     │                 │ • Sydney    │    │
│  │ • Miami     │                 │ • Amsterdam │                 │ • Mumbai    │    │
│  └──────┬──────┘                 └──────┬──────┘                 └──────┬──────┘    │
│         │                               │                               │           │
│         │      Cache Miss               │       Cache Miss              │           │
│         │           │                   │           │                   │           │
│         ▼           ▼                   ▼           ▼                   ▼           │
│  ┌─────────────────────────────────────────────────────────────────────────────┐   │
│  │                        Regional Edge Caches                                  │   │
│  │                                                                              │   │
│  │    ┌─────────────┐         ┌─────────────┐         ┌─────────────┐          │   │
│  │    │  US-East    │         │  EU-West    │         │  AP-South   │          │   │
│  │    │   (Ohio)    │         │ (Ireland)   │         │ (Singapore) │          │   │
│  │    └──────┬──────┘         └──────┬──────┘         └──────┬──────┘          │   │
│  │           │                       │                       │                  │   │
│  └───────────┼───────────────────────┼───────────────────────┼──────────────────┘   │
│              │                       │                       │                      │
│              └───────────────────────┼───────────────────────┘                      │
│                                      │                                              │
│                           ┌──────────▼──────────┐                                   │
│                           │      Origins        │                                   │
│                           │                     │                                   │
│                           │  ┌───────────────┐  │                                   │
│                           │  │  S3 Buckets   │  │                                   │
│                           │  │  (Media)      │  │                                   │
│                           │  └───────────────┘  │                                   │
│                           │                     │                                   │
│                           │  ┌───────────────┐  │                                   │
│                           │  │  API Gateway  │  │                                   │
│                           │  │  (Dynamic)    │  │                                   │
│                           │  └───────────────┘  │                                   │
│                           │                     │                                   │
│                           │  ┌───────────────┐  │                                   │
│                           │  │  Lambda@Edge  │  │                                   │
│                           │  │  (Transform)  │  │                                   │
│                           │  └───────────────┘  │                                   │
│                           └─────────────────────┘                                   │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## Distribution Configuration

### Terraform Configuration

```hcl
# terraform/modules/cloudfront/main.tf

resource "aws_cloudfront_distribution" "media" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = "QuckApp Media CDN - ${var.environment}"
  default_root_object = ""
  price_class         = var.environment == "prod" ? "PriceClass_All" : "PriceClass_100"
  http_version        = "http2and3"

  aliases = var.environment == "prod" ? [
    "cdn.quckapp.com",
    "media.quckapp.com"
  ] : ["cdn.${var.environment}.quckapp.dev"]

  # S3 Origin for media
  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "S3-Media"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id

    origin_shield {
      enabled              = var.environment == "prod"
      origin_shield_region = "us-east-1"
    }
  }

  # S3 Origin for thumbnails
  origin {
    domain_name              = aws_s3_bucket.thumbnails.bucket_regional_domain_name
    origin_id                = "S3-Thumbnails"
    origin_access_control_id = aws_cloudfront_origin_access_control.thumbnails.id
  }

  # API Gateway Origin (for signed URL generation)
  origin {
    domain_name = "${aws_api_gateway_rest_api.media.id}.execute-api.${var.region}.amazonaws.com"
    origin_id   = "API-Gateway"
    origin_path = "/${var.environment}"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }

  # Default behavior - Media files
  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-Media"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id            = aws_cloudfront_cache_policy.media.id
    origin_request_policy_id   = aws_cloudfront_origin_request_policy.media.id
    response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id

    # Lambda@Edge for image optimization
    lambda_function_association {
      event_type   = "origin-response"
      lambda_arn   = aws_lambda_function.image_optimizer.qualified_arn
      include_body = false
    }

    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.url_rewrite.arn
    }
  }

  # Thumbnails - aggressive caching
  ordered_cache_behavior {
    path_pattern           = "/thumbnails/*"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-Thumbnails"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id = aws_cloudfront_cache_policy.immutable.id

    # Long TTL for thumbnails
    min_ttl     = 86400      # 1 day
    default_ttl = 31536000   # 1 year
    max_ttl     = 31536000   # 1 year
  }

  # API routes - no caching
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "API-Gateway"
    viewer_protocol_policy = "redirect-to-https"
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.disabled.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api.id
  }

  # Geo restriction (optional)
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  # SSL Certificate
  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  # WAF
  web_acl_id = var.environment == "prod" ? aws_wafv2_web_acl.cdn.arn : null

  # Logging
  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.logs.bucket_domain_name
    prefix          = "cloudfront/${var.environment}/"
  }

  tags = {
    Environment = var.environment
    Service     = "cdn"
  }
}
```

### Cache Policies

```hcl
# terraform/modules/cloudfront/cache-policies.tf

# Media cache policy - moderate caching with signed URLs
resource "aws_cloudfront_cache_policy" "media" {
  name        = "QuckApp-Media-${var.environment}"
  comment     = "Cache policy for media files"
  default_ttl = 86400      # 1 day
  max_ttl     = 604800     # 7 days
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "whitelist"
      query_strings {
        items = ["v", "w", "h", "q"]  # version, width, height, quality
      }
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Immutable assets - aggressive caching
resource "aws_cloudfront_cache_policy" "immutable" {
  name        = "QuckApp-Immutable-${var.environment}"
  comment     = "Cache policy for immutable assets"
  default_ttl = 31536000   # 1 year
  max_ttl     = 31536000
  min_ttl     = 31536000

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }

    headers_config {
      header_behavior = "none"
    }

    query_strings_config {
      query_string_behavior = "none"
    }

    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
  }
}

# Disabled caching for API
resource "aws_cloudfront_cache_policy" "disabled" {
  name        = "QuckApp-Disabled-${var.environment}"
  comment     = "No caching for API requests"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "all"
    }

    headers_config {
      header_behavior = "whitelist"
      headers {
        items = ["Authorization", "Origin", "Accept"]
      }
    }

    query_strings_config {
      query_string_behavior = "all"
    }
  }
}
```

---

## Signed URLs & Cookies

### CloudFront Signed URL Generation (Go)

```go
// services/media-service/internal/cdn/signed_url.go

package cdn

import (
    "crypto/rsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"
    "time"

    "github.com/aws/aws-sdk-go-v2/feature/cloudfront/sign"
)

type CloudFrontSigner struct {
    keyPairID  string
    privateKey *rsa.PrivateKey
    domain     string
}

func NewCloudFrontSigner(keyPairID, privateKeyPath, domain string) (*CloudFrontSigner, error) {
    keyBytes, err := os.ReadFile(privateKeyPath)
    if err != nil {
        return nil, fmt.Errorf("failed to read private key: %w", err)
    }

    block, _ := pem.Decode(keyBytes)
    if block == nil {
        return nil, fmt.Errorf("failed to decode PEM block")
    }

    privateKey, err := x509.ParsePKCS1PrivateKey(block.Bytes)
    if err != nil {
        return nil, fmt.Errorf("failed to parse private key: %w", err)
    }

    return &CloudFrontSigner{
        keyPairID:  keyPairID,
        privateKey: privateKey,
        domain:     domain,
    }, nil
}

// GenerateSignedURL creates a time-limited signed URL for media access
func (s *CloudFrontSigner) GenerateSignedURL(objectKey string, expiration time.Duration) (string, error) {
    rawURL := fmt.Sprintf("https://%s/%s", s.domain, objectKey)

    signer := sign.NewURLSigner(s.keyPairID, s.privateKey)

    signedURL, err := signer.Sign(rawURL, time.Now().Add(expiration))
    if err != nil {
        return "", fmt.Errorf("failed to sign URL: %w", err)
    }

    return signedURL, nil
}

// GenerateSignedURLWithPolicy creates a signed URL with custom policy
// (e.g., IP restrictions, date range)
func (s *CloudFrontSigner) GenerateSignedURLWithPolicy(
    objectKey string,
    expiration time.Duration,
    allowedIP string,
) (string, error) {
    rawURL := fmt.Sprintf("https://%s/%s", s.domain, objectKey)

    policy := sign.NewCannedPolicy(rawURL, time.Now().Add(expiration))

    // For custom policy with IP restriction
    if allowedIP != "" {
        policy = &sign.Policy{
            Statements: []sign.Statement{
                {
                    Resource: rawURL,
                    Condition: sign.Condition{
                        DateLessThan: &sign.AWSEpochTime{
                            Time: time.Now().Add(expiration),
                        },
                        IPAddress: &sign.IPAddress{
                            SourceIP: allowedIP + "/32",
                        },
                    },
                },
            },
        }
    }

    signer := sign.NewURLSigner(s.keyPairID, s.privateKey)

    signedURL, err := signer.SignWithPolicy(rawURL, policy)
    if err != nil {
        return "", fmt.Errorf("failed to sign URL with policy: %w", err)
    }

    return signedURL, nil
}

// GenerateSignedCookies for accessing multiple files
func (s *CloudFrontSigner) GenerateSignedCookies(
    resourcePath string,
    expiration time.Duration,
) (*sign.CookieOptions, error) {
    resourceURL := fmt.Sprintf("https://%s/%s*", s.domain, resourcePath)

    signer := sign.NewCookieSigner(s.keyPairID, s.privateKey)

    cookies, err := signer.Sign(resourceURL, time.Now().Add(expiration))
    if err != nil {
        return nil, fmt.Errorf("failed to sign cookies: %w", err)
    }

    return cookies, nil
}
```

---

## Lambda@Edge Functions

### Image Optimization

```javascript
// lambda/image-optimizer/index.js

'use strict';

const Sharp = require('sharp');
const https = require('https');

// Supported output formats
const SUPPORTED_FORMATS = ['webp', 'avif', 'jpeg', 'png'];

// Max dimensions
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;

exports.handler = async (event) => {
    const response = event.Records[0].cf.response;
    const request = event.Records[0].cf.request;

    // Only process successful image responses
    if (response.status !== '200') {
        return response;
    }

    const contentType = response.headers['content-type']?.[0]?.value || '';
    if (!contentType.startsWith('image/')) {
        return response;
    }

    // Parse query parameters
    const params = new URLSearchParams(request.querystring);
    const width = Math.min(parseInt(params.get('w') || '0', 10), MAX_WIDTH);
    const height = Math.min(parseInt(params.get('h') || '0', 10), MAX_HEIGHT);
    const quality = Math.min(parseInt(params.get('q') || '85', 10), 100);
    const format = params.get('f') || 'webp';

    // No transformation needed
    if (!width && !height && format === getFormatFromContentType(contentType)) {
        return response;
    }

    try {
        // Fetch original image from S3
        const imageBuffer = await fetchImageFromS3(request);

        // Transform image
        let transformer = Sharp(imageBuffer);

        if (width || height) {
            transformer = transformer.resize(width || null, height || null, {
                fit: 'inside',
                withoutEnlargement: true,
            });
        }

        // Convert format
        switch (format) {
            case 'webp':
                transformer = transformer.webp({ quality });
                break;
            case 'avif':
                transformer = transformer.avif({ quality });
                break;
            case 'jpeg':
                transformer = transformer.jpeg({ quality, progressive: true });
                break;
            case 'png':
                transformer = transformer.png({ compressionLevel: 9 });
                break;
        }

        const outputBuffer = await transformer.toBuffer();

        // Update response
        response.body = outputBuffer.toString('base64');
        response.bodyEncoding = 'base64';
        response.headers['content-type'] = [{ value: `image/${format}` }];
        response.headers['cache-control'] = [{ value: 'public, max-age=31536000, immutable' }];
        response.headers['vary'] = [{ value: 'Accept' }];

        return response;
    } catch (error) {
        console.error('Image optimization error:', error);
        return response; // Return original on error
    }
};

function getFormatFromContentType(contentType) {
    const match = contentType.match(/image\/(\w+)/);
    return match ? match[1] : 'jpeg';
}

async function fetchImageFromS3(request) {
    // Implementation depends on your S3 setup
    // This is a simplified example
    return new Promise((resolve, reject) => {
        const options = {
            hostname: request.origin.s3.domainName,
            path: request.uri,
            method: 'GET',
        };

        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        });

        req.on('error', reject);
        req.end();
    });
}
```

### Security Headers Function

```javascript
// cloudfront-functions/security-headers.js

function handler(event) {
    var response = event.response;
    var headers = response.headers;

    // Security headers
    headers['strict-transport-security'] = {
        value: 'max-age=31536000; includeSubDomains; preload'
    };

    headers['x-content-type-options'] = { value: 'nosniff' };
    headers['x-frame-options'] = { value: 'DENY' };
    headers['x-xss-protection'] = { value: '1; mode=block' };

    headers['content-security-policy'] = {
        value: "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:;"
    };

    headers['referrer-policy'] = { value: 'strict-origin-when-cross-origin' };

    headers['permissions-policy'] = {
        value: 'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()'
    };

    // CORS headers for media
    var origin = event.request.headers.origin;
    if (origin && isAllowedOrigin(origin.value)) {
        headers['access-control-allow-origin'] = { value: origin.value };
        headers['access-control-allow-methods'] = { value: 'GET, HEAD, OPTIONS' };
        headers['access-control-max-age'] = { value: '86400' };
    }

    return response;
}

function isAllowedOrigin(origin) {
    var allowedOrigins = [
        'https://quckapp.com',
        'https://app.quckapp.com',
        'https://web.quckapp.com'
    ];
    return allowedOrigins.includes(origin) || origin.endsWith('.quckapp.dev');
}
```

---

## WAF Configuration

```hcl
# terraform/modules/cloudfront/waf.tf

resource "aws_wafv2_web_acl" "cdn" {
  name        = "quckapp-cdn-waf-${var.environment}"
  description = "WAF rules for CloudFront CDN"
  scope       = "CLOUDFRONT"

  default_action {
    allow {}
  }

  # Rate limiting
  rule {
    name     = "RateLimitRule"
    priority = 1

    override_action {
      none {}
    }

    statement {
      rate_based_statement {
        limit              = 10000
        aggregate_key_type = "IP"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "RateLimitRule"
      sampled_requests_enabled   = true
    }
  }

  # AWS Managed Rules - Common Rule Set
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 2

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "AWSManagedRulesCommonRuleSet"
      sampled_requests_enabled   = true
    }
  }

  # Block bad bots
  rule {
    name     = "AWSManagedRulesBotControlRuleSet"
    priority = 3

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesBotControlRuleSet"
        vendor_name = "AWS"

        managed_rule_group_configs {
          aws_managed_rules_bot_control_rule_set {
            inspection_level = "COMMON"
          }
        }
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "BotControlRuleSet"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "QuckAppCDNWAF"
    sampled_requests_enabled   = true
  }

  tags = {
    Environment = var.environment
    Service     = "cdn"
  }
}
```

---

## Monitoring & Alarms

```yaml
# cloudwatch/cloudfront-alarms.yaml

Resources:
  CloudFrontErrorRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: QuckApp-CloudFront-ErrorRate
      MetricName: 5xxErrorRate
      Namespace: AWS/CloudFront
      Statistic: Average
      Period: 300
      EvaluationPeriods: 3
      Threshold: 1
      ComparisonOperator: GreaterThanThreshold
      Dimensions:
        - Name: DistributionId
          Value: !Ref CloudFrontDistribution
        - Name: Region
          Value: Global

  CloudFrontCacheHitRateAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: QuckApp-CloudFront-LowCacheHitRate
      MetricName: CacheHitRate
      Namespace: AWS/CloudFront
      Statistic: Average
      Period: 3600
      EvaluationPeriods: 1
      Threshold: 80
      ComparisonOperator: LessThanThreshold
      Dimensions:
        - Name: DistributionId
          Value: !Ref CloudFrontDistribution
        - Name: Region
          Value: Global

  CloudFrontOriginLatencyAlarm:
    Type: AWS::CloudWatch::Alarm
    Properties:
      AlarmName: QuckApp-CloudFront-HighOriginLatency
      MetricName: OriginLatency
      Namespace: AWS/CloudFront
      Statistic: p90
      Period: 300
      EvaluationPeriods: 3
      Threshold: 2000
      ComparisonOperator: GreaterThanThreshold
```

---

## Related Documentation

- [AWS Infrastructure](./aws.md) - Overall AWS architecture
- [S3 Media Storage](./s3.md) - S3 bucket configuration
- [Media Encryption](./media-encryption.md) - E2EE implementation
