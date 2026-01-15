---
sidebar_position: 9
---

# Kafka Integration

Apache Kafka for event streaming.

## Topics

```
QuckApp.users.events
QuckApp.messages.events
QuckApp.presence.events
QuckApp.notifications.events
QuckApp.analytics.events
QuckApp.audit.events
```

## Publishing Events

```typescript
@Injectable()
export class UserService {
  constructor(private kafka: KafkaService) {}

  async createUser(dto: CreateUserDto) {
    const user = await this.userRepo.save(dto);

    await this.kafka.emit('QuckApp.users.events', {
      type: 'USER_CREATED',
      payload: { userId: user.id, email: user.email },
      timestamp: new Date().toISOString(),
    });

    return user;
  }
}
```

## Consuming Events

```typescript
@Controller()
export class AnalyticsConsumer {
  @EventPattern('QuckApp.users.events')
  async handleUserEvent(data: UserEvent) {
    if (data.type === 'USER_CREATED') {
      await this.analyticsService.trackNewUser(data.payload);
    }
  }
}
```
