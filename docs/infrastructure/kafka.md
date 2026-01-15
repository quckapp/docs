---
sidebar_position: 4
---

# Apache Kafka

QuckApp uses Apache Kafka for event streaming, enabling real-time communication between microservices.

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│  Producer   │     │  Producer   │     │  Producer   │
│ (Auth Svc)  │     │ (User Svc)  │     │ (Msg Svc)   │
└──────┬──────┘     └──────┬──────┘     └──────┬──────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │     Kafka Cluster      │
              │  ┌──────────────────┐  │
              │  │ Broker 1 (Leader)│  │
              │  └──────────────────┘  │
              │  ┌──────────────────┐  │
              │  │ Broker 2 (Replica)│ │
              │  └──────────────────┘  │
              │  ┌──────────────────┐  │
              │  │ Broker 3 (Replica)│ │
              │  └──────────────────┘  │
              └────────────┬───────────┘
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
       ▼                   ▼                   ▼
┌──────────────┐   ┌──────────────┐   ┌──────────────┐
│   Consumer   │   │   Consumer   │   │   Consumer   │
│ (Notify Svc) │   │ (Audit Svc)  │   │ (Analytics)  │
└──────────────┘   └──────────────┘   └──────────────┘
```

## Topics

### Topic Naming Convention

```
QuckApp.{domain}.{event-type}
```

### Core Topics

| Topic | Partitions | Retention | Description |
|-------|------------|-----------|-------------|
| `QuckApp.auth.user-registered` | 3 | 7 days | New user registrations |
| `QuckApp.auth.user-login` | 3 | 1 day | Login events |
| `QuckApp.auth.password-reset` | 1 | 1 day | Password reset requests |
| `QuckApp.user.profile-updated` | 3 | 7 days | Profile changes |
| `QuckApp.user.status-changed` | 6 | 1 day | Online status changes |
| `QuckApp.message.sent` | 12 | 30 days | New messages |
| `QuckApp.message.edited` | 6 | 7 days | Message edits |
| `QuckApp.message.deleted` | 3 | 7 days | Message deletions |
| `QuckApp.message.reaction` | 6 | 7 days | Emoji reactions |
| `QuckApp.channel.created` | 3 | 30 days | New channels |
| `QuckApp.channel.member-added` | 6 | 7 days | Member additions |
| `QuckApp.workspace.created` | 1 | 30 days | New workspaces |
| `QuckApp.notification.push` | 6 | 1 day | Push notifications |
| `QuckApp.notification.email` | 3 | 1 day | Email notifications |
| `QuckApp.audit.event` | 6 | 90 days | Audit log events |
| `QuckApp.analytics.event` | 12 | 30 days | Analytics events |

### Topic Configuration

```bash
# Create topic with specific configuration
kafka-topics --create \
  --bootstrap-server kafka:9092 \
  --topic QuckApp.message.sent \
  --partitions 12 \
  --replication-factor 3 \
  --config retention.ms=2592000000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2
```

## Event Schemas

### User Registered Event

```json
{
  "eventId": "evt_uuid",
  "eventType": "user.registered",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0",
  "data": {
    "userId": "user_uuid",
    "email": "user@example.com",
    "displayName": "John Doe",
    "registrationMethod": "email",
    "workspaceId": "workspace_uuid"
  },
  "metadata": {
    "source": "auth-service",
    "correlationId": "req_uuid",
    "userAgent": "Mozilla/5.0..."
  }
}
```

### Message Sent Event

```json
{
  "eventId": "evt_uuid",
  "eventType": "message.sent",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0",
  "data": {
    "messageId": "msg_uuid",
    "channelId": "channel_uuid",
    "workspaceId": "workspace_uuid",
    "userId": "user_uuid",
    "content": "Hello, world!",
    "attachments": [],
    "mentions": ["user_uuid_2"],
    "threadId": null
  },
  "metadata": {
    "source": "message-service",
    "correlationId": "req_uuid"
  }
}
```

### Notification Event

```json
{
  "eventId": "evt_uuid",
  "eventType": "notification.push",
  "timestamp": "2024-01-15T10:30:00Z",
  "version": "1.0",
  "data": {
    "recipientId": "user_uuid",
    "type": "mention",
    "title": "New mention",
    "body": "John mentioned you in #general",
    "data": {
      "channelId": "channel_uuid",
      "messageId": "msg_uuid"
    },
    "priority": "high"
  }
}
```

## Producer Configuration

### NestJS Producer

```typescript
// kafka.producer.ts
import { Injectable } from '@nestjs/common';
import { Kafka, Producer, CompressionTypes } from 'kafkajs';

@Injectable()
export class KafkaProducer {
  private producer: Producer;

  constructor() {
    const kafka = new Kafka({
      clientId: 'backend-service',
      brokers: ['kafka:29092'],
      retry: {
        initialRetryTime: 100,
        retries: 8
      }
    });
    this.producer = kafka.producer({
      allowAutoTopicCreation: false,
      idempotent: true
    });
  }

  async publish(topic: string, event: any): Promise<void> {
    await this.producer.send({
      topic,
      compression: CompressionTypes.GZIP,
      messages: [{
        key: event.data.userId || event.eventId,
        value: JSON.stringify(event),
        headers: {
          'event-type': event.eventType,
          'correlation-id': event.metadata?.correlationId
        }
      }]
    });
  }
}
```

### Spring Boot Producer

```java
// KafkaProducerConfig.java
@Configuration
public class KafkaProducerConfig {

    @Bean
    public ProducerFactory<String, String> producerFactory() {
        Map<String, Object> config = new HashMap<>();
        config.put(ProducerConfig.BOOTSTRAP_SERVERS_CONFIG, "kafka:29092");
        config.put(ProducerConfig.KEY_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.VALUE_SERIALIZER_CLASS_CONFIG, StringSerializer.class);
        config.put(ProducerConfig.ACKS_CONFIG, "all");
        config.put(ProducerConfig.ENABLE_IDEMPOTENCE_CONFIG, true);
        config.put(ProducerConfig.COMPRESSION_TYPE_CONFIG, "gzip");
        return new DefaultKafkaProducerFactory<>(config);
    }

    @Bean
    public KafkaTemplate<String, String> kafkaTemplate() {
        return new KafkaTemplate<>(producerFactory());
    }
}
```

### Go Producer

```go
// producer.go
package kafka

import (
    "github.com/IBM/sarama"
)

type Producer struct {
    producer sarama.SyncProducer
}

func NewProducer(brokers []string) (*Producer, error) {
    config := sarama.NewConfig()
    config.Producer.RequiredAcks = sarama.WaitForAll
    config.Producer.Idempotent = true
    config.Producer.Compression = sarama.CompressionGZIP
    config.Producer.Return.Successes = true
    config.Net.MaxOpenRequests = 1

    producer, err := sarama.NewSyncProducer(brokers, config)
    if err != nil {
        return nil, err
    }
    return &Producer{producer: producer}, nil
}

func (p *Producer) Publish(topic string, key string, value []byte) error {
    msg := &sarama.ProducerMessage{
        Topic: topic,
        Key:   sarama.StringEncoder(key),
        Value: sarama.ByteEncoder(value),
    }
    _, _, err := p.producer.SendMessage(msg)
    return err
}
```

## Consumer Configuration

### Consumer Groups

| Group ID | Topics | Services |
|----------|--------|----------|
| `notification-service` | `message.sent`, `message.reaction`, `user.*` | Notification |
| `audit-service` | `*.event` | Audit |
| `analytics-service` | `*` | Analytics |
| `search-indexer` | `message.*`, `channel.*`, `user.*` | Search |
| `realtime-broadcaster` | `message.*`, `presence.*` | Realtime |

### NestJS Consumer

```typescript
// kafka.consumer.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';

@Injectable()
export class KafkaConsumer implements OnModuleInit {
  private consumer: Consumer;

  constructor() {
    const kafka = new Kafka({
      clientId: 'notification-service',
      brokers: ['kafka:29092']
    });
    this.consumer = kafka.consumer({
      groupId: 'notification-service',
      sessionTimeout: 30000,
      heartbeatInterval: 3000
    });
  }

  async onModuleInit() {
    await this.consumer.connect();
    await this.consumer.subscribe({
      topics: ['QuckApp.message.sent', 'QuckApp.message.reaction'],
      fromBeginning: false
    });

    await this.consumer.run({
      eachMessage: async (payload: EachMessagePayload) => {
        const event = JSON.parse(payload.message.value.toString());
        await this.handleEvent(event);
      }
    });
  }

  private async handleEvent(event: any) {
    switch (event.eventType) {
      case 'message.sent':
        await this.handleMessageSent(event);
        break;
      case 'message.reaction':
        await this.handleReaction(event);
        break;
    }
  }
}
```

## Monitoring

### Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `kafka_consumer_lag` | Messages behind | > 10000 |
| `kafka_request_latency_avg` | Avg request time | > 100ms |
| `kafka_messages_per_sec` | Throughput | varies |
| `kafka_under_replicated_partitions` | Replication issues | > 0 |

### Monitoring Commands

```bash
# Check consumer lag
kafka-consumer-groups --bootstrap-server kafka:9092 \
  --group notification-service --describe

# List topics
kafka-topics --bootstrap-server kafka:9092 --list

# Describe topic
kafka-topics --bootstrap-server kafka:9092 \
  --topic QuckApp.message.sent --describe

# View messages
kafka-console-consumer --bootstrap-server kafka:9092 \
  --topic QuckApp.message.sent --from-beginning --max-messages 10
```

## Production Configuration

```properties
# server.properties
num.partitions=6
default.replication.factor=3
min.insync.replicas=2
auto.create.topics.enable=false
log.retention.hours=168
log.segment.bytes=1073741824
log.retention.check.interval.ms=300000
compression.type=producer
```
