---
sidebar_position: 3
---

# Notification Service

NestJS service for push notifications, email, and SMS delivery.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 3001 |
| **Database** | MongoDB |
| **Framework** | NestJS 10.x |
| **Language** | TypeScript |
| **ODM** | Mongoose |

## Features

- Push notifications (FCM, APNs)
- Email notifications (SendGrid, SES)
- SMS notifications (Twilio)
- Notification preferences
- Delivery tracking
- Template management

## Notification Channels

```typescript
enum NotificationChannel {
  PUSH = 'push',
  EMAIL = 'email',
  SMS = 'sms',
  IN_APP = 'in_app',
}

interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, any>;
  channels: NotificationChannel[];
}
```

## Kafka Consumer

```typescript
@EventPattern('QuikApp.notifications.events')
async handleNotification(payload: NotificationPayload) {
  const userPrefs = await this.getUserPreferences(payload.userId);

  for (const channel of payload.channels) {
    if (this.isChannelEnabled(userPrefs, channel)) {
      await this.sendToChannel(channel, payload);
    }
  }
}
```

## MongoDB Database Integration

QuikApp Notification Service uses MongoDB for flexible document storage, enabling efficient handling of diverse notification types, delivery tracking, and user preferences with varying schemas.

### MongoDB Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Notification Service                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐             │
│  │   NestJS    │───▶│  Mongoose   │───▶│   MongoDB   │             │
│  │  Service    │    │    ODM      │    │   Driver    │             │
│  └─────────────┘    └─────────────┘    └──────┬──────┘             │
└──────────────────────────────────────────────│──────────────────────┘
                                               │
                    ┌──────────────────────────┼──────────────────────────┐
                    │                          │                          │
             ┌──────▼──────┐            ┌──────▼──────┐            ┌──────▼──────┐
             │   Primary   │            │  Secondary  │            │  Secondary  │
             │   (Write)   │───────────▶│   (Read)    │───────────▶│   (Read)    │
             │             │  Replica   │             │   Replica  │             │
             └─────────────┘    Set     └─────────────┘    Set     └─────────────┘
```

### NestJS MongoDB Module Configuration

```typescript
// app.module.ts
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        dbName: configService.get<string>('MONGODB_DATABASE', 'quikapp_notifications'),

        // Connection pool settings
        maxPoolSize: 100,
        minPoolSize: 10,
        maxIdleTimeMS: 30000,
        waitQueueTimeoutMS: 10000,

        // Timeouts
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,

        // Read/Write concerns
        readPreference: 'secondaryPreferred',
        readConcern: { level: 'majority' },
        writeConcern: { w: 'majority', j: true, wtimeout: 5000 },

        // Retry settings
        retryWrites: true,
        retryReads: true,

        // Compression
        compressors: ['zstd', 'snappy', 'zlib'],

        // Auth
        authSource: 'admin',
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

### Mongoose Schemas

#### Notification Schema

```typescript
// schemas/notification.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({
  collection: 'notifications',
  timestamps: true,
  toJSON: { virtuals: true },
})
export class Notification {
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, enum: ['message', 'mention', 'reaction', 'call', 'system', 'marketing'] })
  type: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ type: Object, default: {} })
  data: Record<string, any>;

  @Prop({ type: [String], enum: ['push', 'email', 'sms', 'in_app'], default: ['push', 'in_app'] })
  channels: string[];

  @Prop({ default: false, index: true })
  isRead: boolean;

  @Prop({ type: Date })
  readAt?: Date;

  @Prop({ default: 'pending', enum: ['pending', 'sent', 'delivered', 'failed'], index: true })
  status: string;

  @Prop({ type: Object, default: {} })
  deliveryStatus: {
    push?: { status: string; sentAt?: Date; deliveredAt?: Date; error?: string };
    email?: { status: string; sentAt?: Date; openedAt?: Date; error?: string };
    sms?: { status: string; sentAt?: Date; deliveredAt?: Date; error?: string };
    in_app?: { status: string; sentAt?: Date };
  };

  @Prop({ type: Date, index: true })
  scheduledAt?: Date;

  @Prop({ type: Date, index: true, expires: 2592000 }) // TTL: 30 days
  expiresAt?: Date;

  @Prop()
  templateId?: string;

  @Prop({ type: Object })
  templateData?: Record<string, any>;

  @Prop({ index: true })
  workspaceId?: string;

  @Prop({ index: true })
  channelId?: string;

  @Prop()
  messageId?: string;

  @Prop({ default: 0 })
  priority: number;

  @Prop({ type: [String], default: [] })
  tags: string[];
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);

// Compound indexes for common queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, type: 1, createdAt: -1 });
NotificationSchema.index({ status: 1, scheduledAt: 1 });
NotificationSchema.index({ workspaceId: 1, createdAt: -1 });

// Text index for search
NotificationSchema.index({ title: 'text', body: 'text' });
```

#### User Preferences Schema

```typescript
// schemas/notification-preferences.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationPreferencesDocument = NotificationPreferences & Document;

@Schema({
  collection: 'notification_preferences',
  timestamps: true,
})
export class NotificationPreferences {
  @Prop({ required: true, unique: true, index: true })
  userId: string;

  @Prop({
    type: Object,
    default: {
      push: true,
      email: true,
      sms: false,
      in_app: true,
    },
  })
  channels: {
    push: boolean;
    email: boolean;
    sms: boolean;
    in_app: boolean;
  };

  @Prop({
    type: Object,
    default: {
      message: { push: true, email: false, sms: false, in_app: true },
      mention: { push: true, email: true, sms: false, in_app: true },
      reaction: { push: true, email: false, sms: false, in_app: true },
      call: { push: true, email: false, sms: true, in_app: true },
      system: { push: true, email: true, sms: false, in_app: true },
      marketing: { push: false, email: true, sms: false, in_app: false },
    },
  })
  typePreferences: Record<string, Record<string, boolean>>;

  @Prop({
    type: Object,
    default: { enabled: false },
  })
  quietHours: {
    enabled: boolean;
    start?: string; // "22:00"
    end?: string;   // "08:00"
    timezone?: string;
    allowUrgent?: boolean;
  };

  @Prop({ type: [String], default: [] })
  mutedWorkspaces: string[];

  @Prop({ type: [String], default: [] })
  mutedChannels: string[];

  @Prop({ type: [String], default: [] })
  mutedUsers: string[];

  @Prop({ default: 'all', enum: ['all', 'mentions', 'none'] })
  mobilePreference: string;

  @Prop({ default: 'en' })
  language: string;

  @Prop({ default: 'UTC' })
  timezone: string;
}

export const NotificationPreferencesSchema = SchemaFactory.createForClass(NotificationPreferences);
```

#### Notification Template Schema

```typescript
// schemas/notification-template.schema.ts
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type NotificationTemplateDocument = NotificationTemplate & Document;

@Schema({
  collection: 'notification_templates',
  timestamps: true,
})
export class NotificationTemplate {
  @Prop({ required: true, unique: true })
  name: string;

  @Prop({ required: true })
  type: string;

  @Prop({ type: Object })
  push?: {
    title: string;
    body: string;
    icon?: string;
    image?: string;
    action?: string;
  };

  @Prop({ type: Object })
  email?: {
    subject: string;
    htmlTemplate: string;
    textTemplate: string;
  };

  @Prop({ type: Object })
  sms?: {
    body: string;
  };

  @Prop({ type: Object })
  inApp?: {
    title: string;
    body: string;
    icon?: string;
    actionUrl?: string;
  };

  @Prop({ type: [String], default: [] })
  requiredVariables: string[];

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ default: 'en' })
  language: string;

  @Prop({ type: Object, default: {} })
  translations: Record<string, {
    push?: { title: string; body: string };
    email?: { subject: string; htmlTemplate: string };
    sms?: { body: string };
    inApp?: { title: string; body: string };
  }>;
}

export const NotificationTemplateSchema = SchemaFactory.createForClass(NotificationTemplate);
NotificationTemplateSchema.index({ name: 1, language: 1 }, { unique: true });
```

### Repository Pattern with Mongoose

```typescript
// repositories/notification.repository.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, FilterQuery } from 'mongoose';
import { Notification, NotificationDocument } from '../schemas/notification.schema';

@Injectable()
export class NotificationRepository {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
  ) {}

  async create(notification: Partial<Notification>): Promise<NotificationDocument> {
    return this.notificationModel.create(notification);
  }

  async createMany(notifications: Partial<Notification>[]): Promise<NotificationDocument[]> {
    return this.notificationModel.insertMany(notifications, { ordered: false });
  }

  async findById(id: string): Promise<NotificationDocument | null> {
    return this.notificationModel.findById(id).lean();
  }

  async findByUserId(
    userId: string,
    options: {
      skip?: number;
      limit?: number;
      isRead?: boolean;
      type?: string;
      since?: Date;
    } = {},
  ): Promise<NotificationDocument[]> {
    const query: FilterQuery<Notification> = { userId };

    if (options.isRead !== undefined) {
      query.isRead = options.isRead;
    }
    if (options.type) {
      query.type = options.type;
    }
    if (options.since) {
      query.createdAt = { $gte: options.since };
    }

    return this.notificationModel
      .find(query)
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .lean();
  }

  async markAsRead(notificationId: string, userId: string): Promise<boolean> {
    const result = await this.notificationModel.updateOne(
      { _id: notificationId, userId },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount > 0;
  }

  async markAllAsRead(userId: string): Promise<number> {
    const result = await this.notificationModel.updateMany(
      { userId, isRead: false },
      { $set: { isRead: true, readAt: new Date() } },
    );
    return result.modifiedCount;
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationModel.countDocuments({ userId, isRead: false });
  }

  async updateDeliveryStatus(
    notificationId: string,
    channel: string,
    status: { status: string; sentAt?: Date; error?: string },
  ): Promise<void> {
    await this.notificationModel.updateOne(
      { _id: notificationId },
      { $set: { [`deliveryStatus.${channel}`]: status } },
    );
  }

  async findScheduledNotifications(batchSize: number = 100): Promise<NotificationDocument[]> {
    const now = new Date();
    return this.notificationModel
      .find({
        status: 'pending',
        scheduledAt: { $lte: now },
      })
      .limit(batchSize);
  }

  async deleteExpiredNotifications(): Promise<number> {
    const result = await this.notificationModel.deleteMany({
      expiresAt: { $lte: new Date() },
    });
    return result.deletedCount;
  }

  // Aggregation for analytics
  async getNotificationStats(
    userId: string,
    startDate: Date,
    endDate: Date,
  ): Promise<any> {
    return this.notificationModel.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            type: '$type',
            channel: '$channels',
          },
          total: { $sum: 1 },
          read: { $sum: { $cond: ['$isRead', 1, 0] } },
          delivered: {
            $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] },
          },
        },
      },
    ]);
  }
}
```

### MongoDB Aggregation Pipelines

```typescript
// services/notification-analytics.service.ts
import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage } from 'mongoose';
import { Notification } from '../schemas/notification.schema';

@Injectable()
export class NotificationAnalyticsService {
  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
  ) {}

  async getDeliveryMetrics(
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' | 'week' = 'day',
  ): Promise<any[]> {
    const dateFormat = {
      hour: { $dateToString: { format: '%Y-%m-%d %H:00', date: '$createdAt' } },
      day: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
      week: { $dateToString: { format: '%Y-W%V', date: '$createdAt' } },
    };

    return this.notificationModel.aggregate([
      {
        $match: {
          createdAt: { $gte: startDate, $lte: endDate },
        },
      },
      {
        $group: {
          _id: {
            period: dateFormat[groupBy],
            status: '$status',
          },
          count: { $sum: 1 },
        },
      },
      {
        $group: {
          _id: '$_id.period',
          statuses: {
            $push: {
              status: '$_id.status',
              count: '$count',
            },
          },
          total: { $sum: '$count' },
        },
      },
      {
        $sort: { _id: 1 },
      },
    ]);
  }

  async getUserNotificationActivity(
    userId: string,
    days: number = 30,
  ): Promise<any> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.notificationModel.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate },
        },
      },
      {
        $facet: {
          byType: [
            { $group: { _id: '$type', count: { $sum: 1 } } },
          ],
          byChannel: [
            { $unwind: '$channels' },
            { $group: { _id: '$channels', count: { $sum: 1 } } },
          ],
          readStats: [
            {
              $group: {
                _id: null,
                total: { $sum: 1 },
                read: { $sum: { $cond: ['$isRead', 1, 0] } },
                avgReadTime: {
                  $avg: {
                    $cond: [
                      '$readAt',
                      { $subtract: ['$readAt', '$createdAt'] },
                      null,
                    ],
                  },
                },
              },
            },
          ],
          timeline: [
            {
              $group: {
                _id: {
                  $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
                },
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);
  }
}
```

### MongoDB Change Streams for Real-Time Updates

```typescript
// services/notification-stream.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, ChangeStream } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class NotificationStreamService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NotificationStreamService.name);
  private changeStream: ChangeStream;

  constructor(
    @InjectConnection() private connection: Connection,
    private eventEmitter: EventEmitter2,
  ) {}

  async onModuleInit() {
    await this.initChangeStream();
  }

  async onModuleDestroy() {
    if (this.changeStream) {
      await this.changeStream.close();
    }
  }

  private async initChangeStream() {
    const collection = this.connection.collection('notifications');

    const pipeline = [
      {
        $match: {
          operationType: { $in: ['insert', 'update'] },
        },
      },
    ];

    const options = {
      fullDocument: 'updateLookup',
    };

    this.changeStream = collection.watch(pipeline, options);

    this.changeStream.on('change', (change) => {
      this.handleChange(change);
    });

    this.changeStream.on('error', (error) => {
      this.logger.error('Change stream error:', error);
      setTimeout(() => this.initChangeStream(), 5000);
    });

    this.logger.log('MongoDB change stream initialized');
  }

  private handleChange(change: any) {
    const { operationType, fullDocument, documentKey } = change;

    switch (operationType) {
      case 'insert':
        this.eventEmitter.emit('notification.created', fullDocument);
        break;
      case 'update':
        if (fullDocument?.isRead) {
          this.eventEmitter.emit('notification.read', {
            notificationId: documentKey._id,
            userId: fullDocument.userId,
          });
        }
        break;
    }
  }
}
```

### MongoDB Transactions

```typescript
// services/notification-transaction.service.ts
import { Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model } from 'mongoose';
import { Notification } from '../schemas/notification.schema';
import { NotificationPreferences } from '../schemas/notification-preferences.schema';

@Injectable()
export class NotificationTransactionService {
  constructor(
    @InjectConnection() private connection: Connection,
    @InjectModel(Notification.name)
    private notificationModel: Model<Notification>,
    @InjectModel(NotificationPreferences.name)
    private preferencesModel: Model<NotificationPreferences>,
  ) {}

  async sendWithPreferenceUpdate(
    notification: Partial<Notification>,
    preferenceUpdate: Partial<NotificationPreferences>,
  ): Promise<{ notification: Notification; preferences: NotificationPreferences }> {
    const session = await this.connection.startSession();

    try {
      session.startTransaction({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      });

      const [createdNotification] = await this.notificationModel.create(
        [notification],
        { session },
      );

      const updatedPreferences = await this.preferencesModel.findOneAndUpdate(
        { userId: notification.userId },
        { $set: preferenceUpdate },
        { session, new: true, upsert: true },
      );

      await session.commitTransaction();

      return {
        notification: createdNotification,
        preferences: updatedPreferences,
      };
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
  }
}
```

### Docker Compose Configuration

```yaml
version: '3.8'

services:
  mongodb-primary:
    image: mongo:7.0
    container_name: quikapp-mongo-primary
    command: mongod --replSet rs0 --bind_ip_all
    environment:
      MONGO_INITDB_ROOT_USERNAME: ${MONGO_ROOT_USER}
      MONGO_INITDB_ROOT_PASSWORD: ${MONGO_ROOT_PASSWORD}
    ports:
      - "27017:27017"
    volumes:
      - mongodb_primary_data:/data/db
    networks:
      - quikapp-network
    healthcheck:
      test: mongosh --eval 'db.runCommand("ping").ok' --quiet
      interval: 10s
      timeout: 5s
      retries: 5

  mongodb-secondary1:
    image: mongo:7.0
    container_name: quikapp-mongo-secondary1
    command: mongod --replSet rs0 --bind_ip_all
    ports:
      - "27018:27017"
    volumes:
      - mongodb_secondary1_data:/data/db
    depends_on:
      mongodb-primary:
        condition: service_healthy
    networks:
      - quikapp-network

  mongodb-secondary2:
    image: mongo:7.0
    container_name: quikapp-mongo-secondary2
    command: mongod --replSet rs0 --bind_ip_all
    ports:
      - "27019:27017"
    volumes:
      - mongodb_secondary2_data:/data/db
    depends_on:
      mongodb-primary:
        condition: service_healthy
    networks:
      - quikapp-network

volumes:
  mongodb_primary_data:
  mongodb_secondary1_data:
  mongodb_secondary2_data:

networks:
  quikapp-network:
    external: true
```

### Kubernetes MongoDB Operator (Percona)

```yaml
apiVersion: psmdb.percona.com/v1
kind: PerconaServerMongoDB
metadata:
  name: quikapp-mongodb
  namespace: quikapp
spec:
  crVersion: 1.15.0
  image: percona/percona-server-mongodb:7.0.4

  replsets:
    - name: rs0
      size: 3

      affinity:
        antiAffinityTopologyKey: "kubernetes.io/hostname"

      resources:
        limits:
          cpu: "2"
          memory: 4Gi
        requests:
          cpu: "500m"
          memory: 2Gi

      volumeSpec:
        persistentVolumeClaim:
          storageClassName: fast-ssd
          resources:
            requests:
              storage: 100Gi

  secrets:
    users: quikapp-mongodb-secrets

  backup:
    enabled: true
    image: percona/percona-backup-mongodb:2.3.0
    storages:
      s3-backup:
        type: s3
        s3:
          bucket: quikapp-mongodb-backups
          region: us-east-1
          credentialsSecret: aws-s3-secret
    tasks:
      - name: daily-backup
        enabled: true
        schedule: "0 2 * * *"
        keep: 7
        storageName: s3-backup
```

### Environment Variables

```bash
# MongoDB Connection
MONGODB_URI=mongodb://quikapp:password@mongodb-primary:27017,mongodb-secondary1:27017,mongodb-secondary2:27017/quikapp_notifications?replicaSet=rs0&readPreference=secondaryPreferred
MONGODB_DATABASE=quikapp_notifications

# Connection Pool
MONGODB_MAX_POOL_SIZE=100
MONGODB_MIN_POOL_SIZE=10

# Timeouts
MONGODB_SERVER_SELECTION_TIMEOUT_MS=5000
MONGODB_SOCKET_TIMEOUT_MS=45000

# Auth
MONGO_ROOT_USER=root
MONGO_ROOT_PASSWORD=secure-root-password
```

### Health Check

```http
GET /health
```

```json
{
  "status": "healthy",
  "mongodb": {
    "status": "connected",
    "replicaSet": "rs0",
    "primary": "mongodb-primary:27017",
    "secondaries": ["mongodb-secondary1:27017", "mongodb-secondary2:27017"]
  },
  "providers": {
    "fcm": "connected",
    "sendgrid": "connected",
    "twilio": "connected"
  },
  "version": "1.0.0"
}
```
