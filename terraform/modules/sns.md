# SNS Module

Creates SNS topics for event-driven messaging, alerts, and mobile push notifications.

## Features

- Standard and FIFO topics
- Email and SMS subscriptions
- SQS fan-out subscriptions
- Mobile push platforms (APNs, FCM)
- Dead letter queue alerts
- KMS encryption
- Delivery policies with retries
- SMS preferences and limits

## Usage

```hcl
module "sns" {
  source = "../../modules/sns"

  environment = "prod"
  kms_key_arn = module.kms.app_secrets_key_arn

  # Topics
  create_media_events_topic       = true
  create_alerts_topic             = true
  create_user_notifications_topic = true
  create_dlq_alerts_topic         = true
  create_export_complete_topic    = true

  # Alert subscriptions
  alert_email_endpoints = [
    "ops-team@company.com",
    "on-call@company.com"
  ]
  alert_sms_endpoints = ["+1234567890"]

  # DLQ alerts
  dlq_alert_email_endpoints = ["dev-team@company.com"]

  # User notification fan-out
  notification_queue_arn = module.sqs.notification_queue_arn

  # Mobile push
  create_mobile_push_platforms = true
  apns_credentials = var.apns_credentials
  fcm_api_key      = var.fcm_api_key

  tags = var.tags
}
```

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                       SNS Topics                              │
│                                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │  Media Events   │  │  System Alerts  │  │ User Notify  │  │
│  └────────┬────────┘  └────────┬────────┘  └──────┬───────┘  │
│           │                    │                   │          │
└───────────┼────────────────────┼───────────────────┼──────────┘
            │                    │                   │
    ┌───────▼───────┐    ┌───────▼───────┐   ┌──────▼───────┐
    │  SQS Queue    │    │    Email      │   │  SQS Queue   │
    │  (Processing) │    │    SMS        │   │  (Fan-out)   │
    └───────────────┘    └───────────────┘   └──────────────┘
```

## Topics

### Media Events Topic

For media processing completion/failure events:

```hcl
topic {
  name         = "quikapp-media-events-{env}"
  display_name = "QuikApp Media Events"

  delivery_policy = {
    minDelayTarget     = 20
    maxDelayTarget     = 20
    numRetries         = 3
    backoffFunction    = "linear"
  }
}
```

### System Alerts Topic

For CloudWatch alarms and operational alerts:

```hcl
topic {
  name         = "quikapp-alerts-{env}"
  display_name = "QuikApp Alerts"
}

# Email subscriptions
subscriptions = [
  { protocol = "email", endpoint = "ops@company.com" },
  { protocol = "sms",   endpoint = "+1234567890" }
]
```

### User Notifications Topic

For user-facing notifications with SQS fan-out:

```hcl
topic {
  name         = "quikapp-user-notifications-{env}"
  display_name = "QuikApp User Notifications"

  # Higher retry for user notifications
  delivery_policy = {
    minDelayTarget     = 5
    maxDelayTarget     = 60
    numRetries         = 5
    backoffFunction    = "exponential"
  }
}

# SQS subscription
subscription {
  protocol             = "sqs"
  endpoint             = notification_queue_arn
  raw_message_delivery = true
}
```

### FIFO Topic (Ordered Events)

For scenarios requiring message ordering:

```hcl
topic {
  name                        = "quikapp-media-events-{env}.fifo"
  fifo_topic                  = true
  content_based_deduplication = true
}
```

## Mobile Push Notifications

### Apple Push Notification Service (APNs)

```hcl
platform_application {
  name     = "quikapp-apns-{env}"
  platform = "APNS"  # or "APNS_SANDBOX" for dev

  platform_credential = var.apns_private_key
  platform_principal  = var.apns_certificate
}
```

### Firebase Cloud Messaging (FCM)

```hcl
platform_application {
  name                = "quikapp-fcm-{env}"
  platform            = "GCM"
  platform_credential = var.fcm_api_key
}
```

### Sending Push Notifications

```javascript
const AWS = require('@aws-sdk/client-sns');
const sns = new AWS.SNSClient();

// Create endpoint for device
const endpoint = await sns.send(new AWS.CreatePlatformEndpointCommand({
  PlatformApplicationArn: platformArn,
  Token: deviceToken
}));

// Send notification
await sns.send(new AWS.PublishCommand({
  TargetArn: endpoint.EndpointArn,
  Message: JSON.stringify({
    GCM: JSON.stringify({
      notification: {
        title: 'New Message',
        body: 'You have a new message'
      }
    }),
    APNS: JSON.stringify({
      aps: {
        alert: { title: 'New Message', body: 'You have a new message' },
        sound: 'default'
      }
    })
  }),
  MessageStructure: 'json'
}));
```

## SMS Configuration

```hcl
sms_preferences {
  monthly_spend_limit   = 100  # USD
  default_sender_id     = "QuikApp"
  default_sms_type      = "Transactional"  # or "Promotional"
  usage_report_s3_bucket = "quikapp-sms-reports"
}
```

### SMS Types

| Type | Use Case | Delivery |
|------|----------|----------|
| Transactional | OTP, alerts | High priority |
| Promotional | Marketing | Lower priority |

## Delivery Policies

### Retry Configuration

```hcl
delivery_policy = {
  http = {
    defaultHealthyRetryPolicy = {
      minDelayTarget     = 5      # Minimum delay (seconds)
      maxDelayTarget     = 60     # Maximum delay (seconds)
      numRetries         = 5      # Total retries
      numMaxDelayRetries = 2      # Retries at max delay
      numNoDelayRetries  = 1      # Immediate retries
      numMinDelayRetries = 2      # Retries at min delay
      backoffFunction    = "exponential"  # or "linear"
    }
  }
}
```

### Backoff Functions

| Function | Behavior |
|----------|----------|
| `linear` | Constant delay between retries |
| `exponential` | Increasing delay between retries |
| `arithmetic` | Delay increases by fixed amount |
| `geometric` | Delay doubles each retry |

## Publishing Messages

### Node.js Example

```javascript
const { SNSClient, PublishCommand } = require('@aws-sdk/client-sns');

const sns = new SNSClient();

// Simple message
await sns.send(new PublishCommand({
  TopicArn: process.env.MEDIA_EVENTS_TOPIC_ARN,
  Message: JSON.stringify({
    event: 'media.processed',
    mediaId: 'uuid-123',
    status: 'success'
  }),
  MessageAttributes: {
    eventType: { DataType: 'String', StringValue: 'media.processed' }
  }
}));

// FIFO message
await sns.send(new PublishCommand({
  TopicArn: process.env.MEDIA_EVENTS_FIFO_TOPIC_ARN,
  Message: JSON.stringify({ event: 'ordered.event' }),
  MessageGroupId: 'user-123',
  MessageDeduplicationId: 'unique-id-123'
}));
```

### Message Filtering

```hcl
subscription {
  topic_arn = topic_arn
  protocol  = "sqs"
  endpoint  = queue_arn

  filter_policy = jsonencode({
    eventType = ["media.processed", "media.failed"]
  })
}
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `kms_key_arn` | KMS key for encryption | string | - |
| `create_media_events_topic` | Create media events topic | bool | `true` |
| `create_alerts_topic` | Create alerts topic | bool | `true` |
| `alert_email_endpoints` | Email addresses for alerts | list(string) | `[]` |
| `alert_sms_endpoints` | Phone numbers for alerts | list(string) | `[]` |

## Outputs

| Name | Description |
|------|-------------|
| `media_events_topic_arn` | Media events topic ARN |
| `alerts_topic_arn` | Alerts topic ARN |
| `user_notifications_topic_arn` | User notifications topic ARN |
| `apns_platform_arn` | APNs platform application ARN |
| `fcm_platform_arn` | FCM platform application ARN |
| `all_topic_arns` | Map of all topic ARNs |

## Cost Considerations

| Operation | Cost |
|-----------|------|
| Publish (first 1M/month) | Free |
| Publish (per million after) | $0.50 |
| SMS (US) | $0.00645/message |
| Mobile push | $0.50/million |
| Email | $2.00/100K |

### Optimization Tips

1. Use message filtering to reduce unnecessary deliveries
2. Batch messages when possible
3. Use raw message delivery for SQS to avoid double-encoding
4. Monitor SMS spend with monthly limits
5. Use FIFO only when ordering is required (higher cost)
