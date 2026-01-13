---
sidebar_position: 11
---

# MongoDB

QuikApp uses MongoDB for storing messages, reactions, and other document-oriented data that benefits from flexible schemas and high write throughput.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    MongoDB Replica Set                           │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │    Primary      │  │   Secondary 1   │  │   Secondary 2   │  │
│  │  (Read/Write)   │◄─│   (Read Only)   │◄─│   (Read Only)   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                         Automatic Failover                       │
└─────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │  Message  │        │ Moderation│        │    ML     │
   │  Service  │        │  Service  │        │  Service  │
   └───────────┘        └───────────┘        └───────────┘
```

## Services Using MongoDB

| Service | Database | Purpose |
|---------|----------|---------|
| **message-service** (Elixir) | `QuikApp_messages` | Messages, reactions, threads |
| **moderation-service** (Python) | `QuikApp_moderation` | Content moderation logs |
| **ml-service** (Python) | `QuikApp_ml` | ML model data, training sets |
| **smart-reply-service** (Python) | `QuikApp_smartreply` | Reply suggestions, context |
| **file-service** (Go) | `QuikApp_files` | File metadata, GridFS |

## Collections Schema

### Messages Collection

```javascript
// QuikApp_messages.messages
{
  _id: ObjectId("..."),
  channelId: UUID("channel-uuid"),
  workspaceId: UUID("workspace-uuid"),
  userId: UUID("user-uuid"),
  content: "Hello, world!",
  contentType: "text", // text, rich, code, file

  // Rich content
  blocks: [
    {
      type: "paragraph",
      content: "Hello, world!"
    },
    {
      type: "mention",
      userId: UUID("mentioned-user")
    }
  ],

  // Attachments
  attachments: [
    {
      id: UUID("attachment-uuid"),
      type: "image",
      url: "https://cdn.QuikApp.dev/...",
      filename: "screenshot.png",
      size: 102400,
      mimeType: "image/png",
      thumbnailUrl: "https://cdn.QuikApp.dev/thumb/..."
    }
  ],

  // Mentions
  mentions: [UUID("user-1"), UUID("user-2")],
  mentionsEveryone: false,

  // Threading
  threadId: null, // or parent message ID
  replyCount: 0,
  lastReplyAt: null,

  // Reactions
  reactions: {
    "thumbsup": [UUID("user-1"), UUID("user-2")],
    "heart": [UUID("user-3")]
  },
  reactionCount: 3,

  // Status
  edited: false,
  editedAt: null,
  deleted: false,
  deletedAt: null,

  // Metadata
  clientMessageId: "client-uuid", // For deduplication
  metadata: {
    source: "web",
    userAgent: "Mozilla/5.0..."
  },

  createdAt: ISODate("2024-01-15T10:30:00Z"),
  updatedAt: ISODate("2024-01-15T10:30:00Z")
}

// Indexes
db.messages.createIndex({ channelId: 1, createdAt: -1 })
db.messages.createIndex({ threadId: 1, createdAt: 1 })
db.messages.createIndex({ userId: 1, createdAt: -1 })
db.messages.createIndex({ workspaceId: 1, createdAt: -1 })
db.messages.createIndex({ "mentions": 1, createdAt: -1 })
db.messages.createIndex({ content: "text" }) // Text search
db.messages.createIndex({ clientMessageId: 1 }, { unique: true, sparse: true })
```

### Reactions Collection

```javascript
// QuikApp_messages.reactions (for detailed tracking)
{
  _id: ObjectId("..."),
  messageId: ObjectId("message-id"),
  channelId: UUID("channel-uuid"),
  userId: UUID("user-uuid"),
  emoji: "thumbsup",
  emojiCode: ":+1:",
  createdAt: ISODate("2024-01-15T10:35:00Z")
}

// Indexes
db.reactions.createIndex({ messageId: 1, emoji: 1 })
db.reactions.createIndex({ userId: 1, messageId: 1 }, { unique: true })
```

### Read Receipts Collection

```javascript
// QuikApp_messages.read_receipts
{
  _id: ObjectId("..."),
  channelId: UUID("channel-uuid"),
  userId: UUID("user-uuid"),
  lastReadMessageId: ObjectId("message-id"),
  lastReadAt: ISODate("2024-01-15T10:40:00Z"),
  unreadCount: 5
}

// Indexes
db.read_receipts.createIndex({ channelId: 1, userId: 1 }, { unique: true })
db.read_receipts.createIndex({ userId: 1 })
```

### Moderation Collection

```javascript
// QuikApp_moderation.reports
{
  _id: ObjectId("..."),
  messageId: ObjectId("message-id"),
  channelId: UUID("channel-uuid"),
  reportedBy: UUID("user-uuid"),
  reportedUser: UUID("user-uuid"),
  reason: "spam", // spam, harassment, inappropriate, other
  description: "This message is spam",
  status: "pending", // pending, reviewed, actioned, dismissed
  reviewedBy: null,
  reviewedAt: null,
  action: null, // warn, delete, ban
  createdAt: ISODate("2024-01-15T11:00:00Z")
}

// QuikApp_moderation.auto_mod_results
{
  _id: ObjectId("..."),
  messageId: ObjectId("message-id"),
  contentHash: "sha256...",
  checks: {
    profanity: { score: 0.1, flagged: false },
    spam: { score: 0.8, flagged: true },
    toxicity: { score: 0.2, flagged: false }
  },
  overallScore: 0.8,
  action: "flag", // allow, flag, block
  processedAt: ISODate("2024-01-15T10:30:01Z")
}
```

### File Metadata Collection

```javascript
// QuikApp_files.files
{
  _id: ObjectId("..."),
  fileId: UUID("file-uuid"),
  workspaceId: UUID("workspace-uuid"),
  uploadedBy: UUID("user-uuid"),

  filename: "document.pdf",
  originalFilename: "My Document.pdf",
  mimeType: "application/pdf",
  size: 1024000, // bytes

  storage: {
    provider: "s3",
    bucket: "QuikApp-files",
    key: "workspaces/ws-uuid/files/file-uuid.pdf",
    region: "us-east-1"
  },

  urls: {
    original: "https://cdn.QuikApp.dev/files/...",
    thumbnail: "https://cdn.QuikApp.dev/thumbs/..."
  },

  metadata: {
    width: null, // for images
    height: null,
    duration: null, // for videos/audio
    pages: 10 // for documents
  },

  virusScan: {
    status: "clean", // pending, clean, infected
    scannedAt: ISODate("2024-01-15T10:30:05Z")
  },

  deleted: false,
  deletedAt: null,

  createdAt: ISODate("2024-01-15T10:30:00Z"),
  expiresAt: null // for temporary files
}

// Indexes
db.files.createIndex({ fileId: 1 }, { unique: true })
db.files.createIndex({ workspaceId: 1, createdAt: -1 })
db.files.createIndex({ uploadedBy: 1 })
db.files.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 })
```

## Docker Configuration

```yaml
# docker-compose.yml
services:
  mongodb:
    image: mongo:6.0
    container_name: QuikApp-mongodb
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_USER:-QuikApp}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_PASSWORD:-secret}
    volumes:
      - mongodb_data:/data/db
      - ./init-scripts/mongo:/docker-entrypoint-initdb.d
    ports:
      - "27017:27017"
    networks:
      - QuikApp-network
    command: mongod --replSet rs0 --bind_ip_all
    healthcheck:
      test: echo 'db.runCommand("ping").ok' | mongosh localhost:27017/test --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb-init:
    image: mongo:6.0
    depends_on:
      - mongodb
    command: >
      mongosh --host mongodb:27017 --username QuikApp --password secret --authenticationDatabase admin --eval "
        rs.initiate({
          _id: 'rs0',
          members: [{ _id: 0, host: 'mongodb:27017' }]
        })
      "
    networks:
      - QuikApp-network

volumes:
  mongodb_data:
```

### Replica Set Setup (Production)

```yaml
# docker-compose.mongo-ha.yml
services:
  mongo1:
    image: mongo:6.0
    command: mongod --replSet rs0 --bind_ip_all
    volumes:
      - mongo1_data:/data/db
    networks:
      - QuikApp-network

  mongo2:
    image: mongo:6.0
    command: mongod --replSet rs0 --bind_ip_all
    volumes:
      - mongo2_data:/data/db
    networks:
      - QuikApp-network

  mongo3:
    image: mongo:6.0
    command: mongod --replSet rs0 --bind_ip_all
    volumes:
      - mongo3_data:/data/db
    networks:
      - QuikApp-network

volumes:
  mongo1_data:
  mongo2_data:
  mongo3_data:
```

## Client Configuration

### Elixir (mongodb driver)

```elixir
# config/config.exs
config :QuikApp, QuikApp.Repo,
  url: System.get_env("MONGODB_URL", "mongodb://QuikApp:secret@localhost:27017/QuikApp_messages"),
  pool_size: 10,
  write_concern: [w: "majority", j: true],
  read_preference: :secondary_preferred

# lib/QuikApp/message.ex
defmodule QuikApp.Message do
  use Mongo.Collection

  collection "messages" do
    attribute :channel_id, :binary_id
    attribute :user_id, :binary_id
    attribute :content, :string
    attribute :attachments, {:array, :map}, default: []
    attribute :reactions, :map, default: %{}
    attribute :created_at, :utc_datetime
    timestamps()
  end
end
```

### Python (pymongo)

```python
# config/mongodb.py
from pymongo import MongoClient
from pymongo.read_preferences import ReadPreference
import os

MONGODB_URL = os.getenv(
    "MONGODB_URL",
    "mongodb://QuikApp:secret@localhost:27017"
)

client = MongoClient(
    MONGODB_URL,
    maxPoolSize=20,
    minPoolSize=5,
    readPreference=ReadPreference.SECONDARY_PREFERRED,
    w="majority",
    j=True
)

# Databases
messages_db = client.QuikApp_messages
moderation_db = client.QuikApp_moderation
ml_db = client.QuikApp_ml

# Collections
messages = messages_db.messages
reactions = messages_db.reactions
reports = moderation_db.reports
```

### Go (mongo-driver)

```go
// mongodb/client.go
package mongodb

import (
    "context"
    "time"

    "go.mongodb.org/mongo-driver/mongo"
    "go.mongodb.org/mongo-driver/mongo/options"
    "go.mongodb.org/mongo-driver/mongo/readpref"
)

type Client struct {
    client *mongo.Client
    db     *mongo.Database
}

func NewClient(uri, database string) (*Client, error) {
    ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
    defer cancel()

    clientOpts := options.Client().
        ApplyURI(uri).
        SetMaxPoolSize(20).
        SetMinPoolSize(5).
        SetReadPreference(readpref.SecondaryPreferred())

    client, err := mongo.Connect(ctx, clientOpts)
    if err != nil {
        return nil, err
    }

    if err := client.Ping(ctx, nil); err != nil {
        return nil, err
    }

    return &Client{
        client: client,
        db:     client.Database(database),
    }, nil
}

func (c *Client) Collection(name string) *mongo.Collection {
    return c.db.Collection(name)
}
```

## Aggregation Pipelines

### Get Channel Messages with User Info

```javascript
db.messages.aggregate([
  { $match: { channelId: UUID("channel-uuid") } },
  { $sort: { createdAt: -1 } },
  { $limit: 50 },
  {
    $lookup: {
      from: "users",
      localField: "userId",
      foreignField: "_id",
      as: "user"
    }
  },
  { $unwind: "$user" },
  {
    $project: {
      _id: 1,
      content: 1,
      attachments: 1,
      reactions: 1,
      createdAt: 1,
      "user.displayName": 1,
      "user.avatarUrl": 1
    }
  }
])
```

### Get Unread Count per Channel

```javascript
db.read_receipts.aggregate([
  { $match: { userId: UUID("user-uuid") } },
  {
    $lookup: {
      from: "messages",
      let: { channelId: "$channelId", lastReadAt: "$lastReadAt" },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$channelId", "$$channelId"] },
                { $gt: ["$createdAt", "$$lastReadAt"] }
              ]
            }
          }
        },
        { $count: "unread" }
      ],
      as: "unreadInfo"
    }
  },
  {
    $project: {
      channelId: 1,
      unreadCount: { $ifNull: [{ $arrayElemAt: ["$unreadInfo.unread", 0] }, 0] }
    }
  }
])
```

### Message Analytics

```javascript
db.messages.aggregate([
  {
    $match: {
      workspaceId: UUID("workspace-uuid"),
      createdAt: { $gte: ISODate("2024-01-01"), $lt: ISODate("2024-02-01") }
    }
  },
  {
    $group: {
      _id: {
        date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        userId: "$userId"
      },
      messageCount: { $sum: 1 }
    }
  },
  {
    $group: {
      _id: "$_id.date",
      totalMessages: { $sum: "$messageCount" },
      uniqueUsers: { $sum: 1 }
    }
  },
  { $sort: { _id: 1 } }
])
```

## Performance Tuning

### MongoDB Configuration

```yaml
# mongod.conf
storage:
  dbPath: /data/db
  journal:
    enabled: true
  wiredTiger:
    engineConfig:
      cacheSizeGB: 4
    collectionConfig:
      blockCompressor: snappy

operationProfiling:
  mode: slowOp
  slowOpThresholdMs: 100

replication:
  replSetName: rs0

net:
  port: 27017
  bindIp: 0.0.0.0
```

### Index Optimization

```javascript
// Compound indexes for common queries
db.messages.createIndex(
  { channelId: 1, createdAt: -1 },
  { background: true }
)

// Partial index for undeleted messages
db.messages.createIndex(
  { channelId: 1, createdAt: -1 },
  { partialFilterExpression: { deleted: false } }
)

// TTL index for temporary data
db.temp_uploads.createIndex(
  { createdAt: 1 },
  { expireAfterSeconds: 86400 }
)
```

## Monitoring

### Key Metrics

```javascript
// Server status
db.serverStatus()

// Collection stats
db.messages.stats()

// Current operations
db.currentOp()

// Index usage
db.messages.aggregate([{ $indexStats: {} }])

// Slow queries
db.system.profile.find({ millis: { $gt: 100 } }).sort({ ts: -1 }).limit(10)
```

### Prometheus Exporter

```yaml
# docker-compose.monitoring.yml
services:
  mongodb-exporter:
    image: percona/mongodb_exporter:0.40
    container_name: QuikApp-mongodb-exporter
    environment:
      MONGODB_URI: "mongodb://QuikApp:secret@mongodb:27017"
    ports:
      - "9216:9216"
    networks:
      - QuikApp-network
```

## Backup & Recovery

```bash
#!/bin/bash
# scripts/backup-mongodb.sh

BACKUP_DIR="/backups/mongodb"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DATABASES="QuikApp_messages QuikApp_moderation QuikApp_ml QuikApp_files"

for DB in $DATABASES; do
    mongodump \
        --uri="mongodb://QuikApp:secret@localhost:27017/$DB?authSource=admin" \
        --out="$BACKUP_DIR/${DB}_${TIMESTAMP}"

    tar -czvf "$BACKUP_DIR/${DB}_${TIMESTAMP}.tar.gz" "$BACKUP_DIR/${DB}_${TIMESTAMP}"
    rm -rf "$BACKUP_DIR/${DB}_${TIMESTAMP}"
done

# Keep only last 14 days
find $BACKUP_DIR -name "*.tar.gz" -mtime +14 -delete

# Upload to S3
aws s3 sync $BACKUP_DIR s3://QuikApp-backups/mongodb/
```
