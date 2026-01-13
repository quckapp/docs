# SQS Module

Creates SQS queues for asynchronous message processing with dead letter queues and CloudWatch alarms.

## Features

- Standard and FIFO queues
- Dead letter queues (DLQ)
- Server-side encryption with KMS
- Access policies for S3 and Lambda
- CloudWatch alarms for monitoring
- Configurable visibility timeouts

## Usage

```hcl
module "sqs" {
  source = "../../modules/sqs"

  environment = "prod"
  kms_key_arn = module.kms.s3_media_key_arn

  # Queues to create
  create_media_processing_queue = true
  create_thumbnail_queue        = true
  create_video_processing_queue = true
  create_notification_queue     = true
  create_export_queue           = true
  create_fifo_queue             = false

  # Access control
  s3_bucket_arns = [module.s3.media_bucket_arn]
  lambda_role_arns = [
    module.lambda.thumbnail_generator_role_arn
  ]

  # Retention
  message_retention_seconds     = 345600   # 4 days
  dlq_message_retention_seconds = 1209600  # 14 days

  # Alarms
  enable_cloudwatch_alarms = true
  alarm_actions            = [module.sns.alerts_topic_arn]

  tags = var.tags
}
```

## Queue Architecture

```
┌──────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Producer   │────▶│   Main Queue        │────▶│   Consumer   │
│   (S3/API)   │     │                     │     │   (Lambda)   │
└──────────────┘     └──────────┬──────────┘     └──────────────┘
                                │
                     (after max receives)
                                │
                     ┌──────────▼──────────┐
                     │  Dead Letter Queue  │
                     └─────────────────────┘
```

## Queue Types

### Media Processing Queue

General media processing tasks:

```hcl
queue {
  name                       = "quikapp-{env}-media-processing"
  delay_seconds              = 0
  max_message_size           = 262144  # 256 KB
  message_retention_seconds  = 345600  # 4 days
  visibility_timeout_seconds = 360     # 6 minutes
  receive_wait_time_seconds  = 20      # Long polling
}
```

### Thumbnail Queue

Dedicated queue for thumbnail generation:

```hcl
queue {
  name                       = "quikapp-{env}-thumbnails"
  visibility_timeout_seconds = 180     # 3 minutes
}
```

### Video Processing Queue

Longer processing times for video:

```hcl
queue {
  name                       = "quikapp-{env}-video-processing"
  visibility_timeout_seconds = 900     # 15 minutes
}
```

### Notification Queue

Push notifications and alerts:

```hcl
queue {
  name                       = "quikapp-{env}-notifications"
  visibility_timeout_seconds = 60      # 1 minute
}
```

### FIFO Queue (Optional)

For ordered processing:

```hcl
queue {
  name                        = "quikapp-{env}-ordered.fifo"
  fifo_queue                  = true
  content_based_deduplication = true
  deduplication_scope         = "messageGroup"
  fifo_throughput_limit       = "perMessageGroupId"
}
```

## Dead Letter Queues

Each queue has an associated DLQ:

```hcl
redrive_policy = jsonencode({
  deadLetterTargetArn = aws_sqs_queue.dlq.arn
  maxReceiveCount     = 3  # Move to DLQ after 3 failures
})
```

### DLQ Alarm

```hcl
alarm {
  alarm_name  = "DLQ-Messages"
  metric_name = "ApproximateNumberOfMessagesVisible"
  threshold   = 10
  period      = 300
}
```

## Access Policies

### S3 Event Notifications

```hcl
statement {
  effect    = "Allow"
  actions   = ["sqs:SendMessage"]
  resources = [queue_arn]

  principals {
    type        = "Service"
    identifiers = ["s3.amazonaws.com"]
  }

  condition {
    test     = "ArnLike"
    variable = "aws:SourceArn"
    values   = [bucket_arn]
  }
}
```

### Lambda Access

```hcl
statement {
  effect  = "Allow"
  actions = [
    "sqs:ReceiveMessage",
    "sqs:DeleteMessage",
    "sqs:GetQueueAttributes"
  ]
  resources = [queue_arn]

  principals {
    type        = "AWS"
    identifiers = [lambda_role_arn]
  }
}
```

## Visibility Timeout

Set based on processing time:

| Queue | Processing Time | Visibility Timeout |
|-------|-----------------|-------------------|
| Thumbnails | ~30 seconds | 180 seconds (3 min) |
| Video | ~2-5 minutes | 900 seconds (15 min) |
| Notifications | ~5 seconds | 60 seconds (1 min) |

**Rule**: Visibility timeout should be 6x the expected processing time.

## Long Polling

Enable for cost optimization:

```hcl
receive_wait_time_seconds = 20  # Wait up to 20 seconds
```

Benefits:
- Reduces empty receives
- Lowers SQS costs
- More efficient for Lambda polling

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `kms_key_arn` | KMS key for encryption | string | - |
| `create_media_processing_queue` | Create queue | bool | `true` |
| `message_retention_seconds` | Retention period | number | `345600` |
| `enable_cloudwatch_alarms` | Create alarms | bool | `true` |

## Outputs

| Name | Description |
|------|-------------|
| `media_processing_queue_id` | Queue URL |
| `media_processing_queue_arn` | Queue ARN |
| `thumbnail_queue_arn` | Thumbnail queue ARN |
| `all_queue_arns` | Map of all queue ARNs |
| `all_queue_urls` | Map of all queue URLs |
| `all_dlq_arns` | Map of all DLQ ARNs |

## Cost Considerations

| Operation | Cost (per million) |
|-----------|-------------------|
| Standard queue requests | $0.40 |
| FIFO queue requests | $0.50 |
| Data transfer (out) | $0.09/GB |

### Optimization Tips

1. Use long polling (reduce empty receives)
2. Batch messages (up to 10 per request)
3. Use Standard queues unless ordering required
4. Delete messages promptly after processing
