---
sidebar_position: 4
---

# Notification Orchestrator

Elixir service for real-time notification delivery and routing.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4004 |
| **Database** | MongoDB |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |

## Features

- Real-time notification delivery
- Online/offline user routing
- Notification batching
- Deduplication
- Priority queuing

## Routing Logic

```elixir
def route_notification(notification) do
  user_presence = Presence.get_user(notification.user_id)

  case user_presence do
    %{status: :online} ->
      deliver_realtime(notification)

    _ ->
      queue_for_push(notification)
  end
end
```
