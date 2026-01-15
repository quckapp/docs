# DynamoDB Module

Creates DynamoDB tables for NoSQL data storage with global secondary indexes, streams, and global tables.

## Features

- Multiple table types (metadata, sessions, notifications)
- On-demand and provisioned capacity modes
- Auto-scaling for provisioned mode
- Global secondary indexes (GSI)
- DynamoDB Streams for CDC
- Global Tables for multi-region
- Point-in-time recovery
- TTL for automatic expiration
- Server-side encryption with KMS

## Usage

```hcl
module "dynamodb" {
  source = "../../modules/dynamodb"

  environment = "prod"
  kms_key_arn = module.kms.s3_media_key_arn

  # Billing mode
  billing_mode = "PAY_PER_REQUEST"  # or "PROVISIONED"

  # Tables to create
  create_media_metadata_table = true
  create_user_sessions_table  = true
  create_notifications_table  = true
  create_conversations_table  = true
  create_rate_limiting_table  = true

  # Backup
  enable_point_in_time_recovery = true
  enable_deletion_protection    = true

  # Streams
  enable_streams   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  # Global tables
  enable_global_tables = true
  replica_region       = "us-west-2"

  tags = var.tags
}
```

## Table Schemas

### Media Metadata Table

```hcl
table {
  name     = "quckapp-{env}-media-metadata"
  hash_key = "mediaId"

  attribute {
    name = "mediaId"
    type = "S"
  }
  attribute {
    name = "userId"
    type = "S"
  }
  attribute {
    name = "createdAt"
    type = "S"
  }

  # Query by user
  global_secondary_index {
    name            = "userId-createdAt-index"
    hash_key        = "userId"
    range_key       = "createdAt"
    projection_type = "ALL"
  }
}
```

#### Item Structure

```json
{
  "mediaId": "uuid-123",
  "userId": "user-456",
  "type": "photo",
  "filename": "vacation.jpg",
  "size": 1024000,
  "mimeType": "image/jpeg",
  "s3Key": "photos/user-456/2024/01/uuid-123.jpg",
  "thumbnails": {
    "small": "thumbs/small/uuid-123.webp",
    "medium": "thumbs/medium/uuid-123.webp"
  },
  "metadata": {
    "width": 1920,
    "height": 1080
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "expiresAt": 1705400000
}
```

### User Sessions Table

```hcl
table {
  name      = "quckapp-{env}-user-sessions"
  hash_key  = "sessionId"
  range_key = "userId"

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
```

### Conversations Table

```hcl
table {
  name      = "quckapp-{env}-conversations"
  hash_key  = "conversationId"
  range_key = "messageId"

  # Query by participant
  global_secondary_index {
    name     = "participant-updatedAt-index"
    hash_key = "participantId"
    range_key = "updatedAt"
  }
}
```

### Rate Limiting Table

```hcl
table {
  name     = "quckapp-{env}-rate-limits"
  hash_key = "key"  # e.g., "api:user-123:endpoint"

  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }
}
```

## Capacity Modes

### On-Demand (Recommended for Variable Workloads)

```hcl
billing_mode = "PAY_PER_REQUEST"
```

- No capacity planning
- Pay per read/write
- Instant scaling
- Good for unpredictable traffic

### Provisioned (Recommended for Stable Workloads)

```hcl
billing_mode = "PROVISIONED"

read_capacity  = 100
write_capacity = 50

# Auto-scaling
enable_autoscaling = true
autoscaling_max_read_capacity  = 1000
autoscaling_max_write_capacity = 1000
autoscaling_target_utilization = 70
```

## Global Secondary Indexes

```hcl
global_secondary_index {
  name            = "email-index"
  hash_key        = "email"
  projection_type = "INCLUDE"
  non_key_attributes = ["userId", "name"]

  # Provisioned mode only
  read_capacity  = 50
  write_capacity = 25
}
```

### Projection Types

| Type | Data Returned | Cost |
|------|---------------|------|
| KEYS_ONLY | Keys only | Lowest |
| INCLUDE | Keys + specified attributes | Medium |
| ALL | All attributes | Highest |

## DynamoDB Streams

Enable for change data capture:

```hcl
enable_streams   = true
stream_view_type = "NEW_AND_OLD_IMAGES"
```

### Stream View Types

| Type | Content |
|------|---------|
| KEYS_ONLY | Only key attributes |
| NEW_IMAGE | Item after modification |
| OLD_IMAGE | Item before modification |
| NEW_AND_OLD_IMAGES | Both before and after |

### Lambda Trigger

```hcl
resource "aws_lambda_event_source_mapping" "stream" {
  event_source_arn  = module.dynamodb.media_metadata_stream_arn
  function_name     = aws_lambda_function.processor.arn
  starting_position = "LATEST"
  batch_size        = 100
}
```

## Global Tables

Multi-region active-active replication:

```hcl
enable_global_tables = true
replica_region       = "us-west-2"
replica_kms_key_arn  = var.replica_kms_key_arn
```

### Considerations

- Eventual consistency between regions
- Last-writer-wins conflict resolution
- Same table structure required
- Higher cost (replicated writes)

## TTL (Time to Live)

Automatic item expiration:

```hcl
ttl {
  attribute_name = "expiresAt"
  enabled        = true
}
```

### Setting TTL in Application

```python
import time

item = {
    'sessionId': 'sess-123',
    'userId': 'user-456',
    'expiresAt': int(time.time()) + 3600  # 1 hour from now
}
table.put_item(Item=item)
```

## Access Patterns

### Single Table Design

```
PK                  SK                  Attributes
USER#123            PROFILE             name, email, avatar
USER#123            SESSION#abc         token, expiresAt
USER#123            MEDIA#xyz           type, s3Key, createdAt
CONV#456            META                participants, updatedAt
CONV#456            MSG#2024-01-15T...  senderId, content
```

### Query Examples

```python
# Get user profile
response = table.get_item(
    Key={'PK': 'USER#123', 'SK': 'PROFILE'}
)

# Get user's media
response = table.query(
    KeyConditionExpression=Key('PK').eq('USER#123') & Key('SK').begins_with('MEDIA#')
)

# Get conversation messages
response = table.query(
    KeyConditionExpression=Key('PK').eq('CONV#456') & Key('SK').begins_with('MSG#'),
    ScanIndexForward=False,  # Newest first
    Limit=50
)
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `kms_key_arn` | KMS key for encryption | string | - |
| `billing_mode` | Capacity mode | string | `"PAY_PER_REQUEST"` |
| `enable_streams` | Enable DynamoDB Streams | bool | `false` |
| `enable_global_tables` | Enable multi-region | bool | `false` |

## Outputs

| Name | Description |
|------|-------------|
| `media_metadata_table_name` | Table name |
| `media_metadata_table_arn` | Table ARN |
| `all_table_names` | Map of all table names |
| `stream_arns` | Map of stream ARNs |

## Cost Optimization

### Pricing (On-Demand)

| Operation | Cost (per million) |
|-----------|-------------------|
| Read (4KB) | $0.25 |
| Write (1KB) | $1.25 |
| Stream read | $0.02 |
| Storage | $0.25/GB/month |

### Tips

1. Use sparse indexes (fewer items = lower cost)
2. Project only needed attributes
3. Use TTL for automatic cleanup
4. Consider provisioned for stable workloads
5. Use DAX for read-heavy workloads
