---
sidebar_position: 1
---

# Presence Service

Elixir/Phoenix service for real-time user presence and status tracking using Redis for high-performance distributed state management.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4001 |
| **Cache/State** | Redis Cluster |
| **Database** | MongoDB (persistence) |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |

## Features

- Real-time online/offline status
- Typing indicators with auto-expiry
- Custom status messages
- Last seen tracking
- Multi-device presence aggregation
- Phoenix PubSub broadcasting
- Redis-backed distributed presence
- Horizontal scaling with Redis Cluster

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │────▶│ Presence Service│────▶│  Redis Cluster  │
│   (WebSocket)   │     │   (Phoenix)     │     │                 │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │                       │
                                 │              ┌────────▼────────┐
                        ┌────────▼────────┐     │   Redis Pub/Sub │
                        │    MongoDB      │     │   (Real-time)   │
                        │  (Persistence)  │     └─────────────────┘
                        └─────────────────┘
```

## Redis Configuration

### Connection Setup

```elixir
# config/config.exs
config :presence_service, :redis,
  host: System.get_env("REDIS_HOST", "localhost"),
  port: String.to_integer(System.get_env("REDIS_PORT", "6379")),
  password: System.get_env("REDIS_PASSWORD"),
  database: 0,
  ssl: System.get_env("REDIS_SSL", "false") == "true",
  pool_size: 20,
  timeout: 5_000

# Redis Cluster configuration
config :presence_service, :redis_cluster,
  cluster: [
    [host: "redis-1.quikapp.internal", port: 6379],
    [host: "redis-2.quikapp.internal", port: 6379],
    [host: "redis-3.quikapp.internal", port: 6379],
    [host: "redis-4.quikapp.internal", port: 6379],
    [host: "redis-5.quikapp.internal", port: 6379],
    [host: "redis-6.quikapp.internal", port: 6379]
  ],
  password: System.get_env("REDIS_PASSWORD"),
  pool_size: 5

# Phoenix PubSub with Redis adapter
config :presence_service, PresenceWeb.Endpoint,
  pubsub_server: PresenceService.PubSub

config :presence_service, PresenceService.PubSub,
  adapter: Phoenix.PubSub.Redis,
  host: System.get_env("REDIS_HOST"),
  port: String.to_integer(System.get_env("REDIS_PORT", "6379")),
  password: System.get_env("REDIS_PASSWORD"),
  node_name: System.get_env("NODE_NAME", "presence@localhost")
```

### Redis Client Module

```elixir
defmodule PresenceService.Redis do
  @moduledoc """
  Redis client wrapper with connection pooling and cluster support.
  """

  use Supervisor

  def start_link(opts) do
    Supervisor.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    redis_config = Application.get_env(:presence_service, :redis)

    children = [
      {Redix,
        host: redis_config[:host],
        port: redis_config[:port],
        password: redis_config[:password],
        database: redis_config[:database],
        name: :redix
      },
      # Connection pool for high throughput
      :poolboy.child_spec(:redis_pool, pool_config(), redis_config)
    ]

    Supervisor.init(children, strategy: :one_for_one)
  end

  defp pool_config do
    [
      name: {:local, :redis_pool},
      worker_module: PresenceService.Redis.Worker,
      size: 20,
      max_overflow: 10
    ]
  end

  @doc """
  Execute a Redis command using the connection pool.
  """
  def command(command, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 5_000)

    :poolboy.transaction(:redis_pool, fn pid ->
      Redix.command(pid, command, timeout: timeout)
    end)
  end

  @doc """
  Execute multiple Redis commands in a pipeline.
  """
  def pipeline(commands, opts \\ []) do
    timeout = Keyword.get(opts, :timeout, 5_000)

    :poolboy.transaction(:redis_pool, fn pid ->
      Redix.pipeline(pid, commands, timeout: timeout)
    end)
  end

  @doc """
  Execute a Redis transaction (MULTI/EXEC).
  """
  def transaction(commands) do
    transaction_commands = [["MULTI"]] ++ commands ++ [["EXEC"]]
    pipeline(transaction_commands)
  end
end
```

## Redis Data Structures

### Key Schema

```
# User presence (Hash)
presence:user:{user_id}
  - status: "online" | "away" | "busy" | "offline" | "invisible"
  - custom_message: "In a meeting"
  - emoji: "📞"
  - last_seen: 1704067200
  - updated_at: 1704067200

# User devices (Sorted Set - score = last_heartbeat)
presence:user:{user_id}:devices
  - device_id:web:browser_123 -> 1704067200
  - device_id:mobile:ios_456 -> 1704067195

# Channel presence (Sorted Set - score = join_time)
presence:channel:{channel_id}
  - user_id_1 -> 1704067200
  - user_id_2 -> 1704067100

# Typing indicators (Set with TTL)
typing:{channel_id}
  - user_id_1
  - user_id_2

# Online users (Sorted Set - score = last_heartbeat)
presence:online:{workspace_id}
  - user_id -> timestamp

# Status expiry (Sorted Set - score = expiry_time)
presence:status_expiry
  - user_id -> expiry_timestamp
```

### Presence Tracking Implementation

```elixir
defmodule PresenceService.PresenceTracker do
  @moduledoc """
  Redis-backed presence tracking with heartbeat and TTL management.
  """

  alias PresenceService.Redis

  @heartbeat_ttl 30  # seconds
  @presence_ttl 60   # seconds (2 missed heartbeats = offline)
  @typing_ttl 5      # seconds

  @doc """
  Update user presence with heartbeat.
  """
  def heartbeat(user_id, device_id, workspace_id) do
    now = System.system_time(:second)
    device_key = "presence:user:#{user_id}:devices"
    online_key = "presence:online:#{workspace_id}"

    commands = [
      # Update device heartbeat
      ["ZADD", device_key, now, device_id],
      # Set device TTL
      ["EXPIRE", device_key, @presence_ttl],
      # Add to workspace online set
      ["ZADD", online_key, now, user_id],
      # Update user status if needed
      ["HSET", "presence:user:#{user_id}", "last_seen", now]
    ]

    case Redis.pipeline(commands) do
      {:ok, _} ->
        broadcast_presence_update(user_id, workspace_id)
        :ok
      error ->
        error
    end
  end

  @doc """
  Set user status with optional expiry.
  """
  def set_status(user_id, status, opts \\ []) do
    custom_message = Keyword.get(opts, :custom_message)
    emoji = Keyword.get(opts, :emoji)
    clear_after = Keyword.get(opts, :clear_after)

    now = System.system_time(:second)
    presence_key = "presence:user:#{user_id}"

    fields = [
      "status", to_string(status),
      "updated_at", now
    ]

    fields = if custom_message, do: fields ++ ["custom_message", custom_message], else: fields
    fields = if emoji, do: fields ++ ["emoji", emoji], else: fields

    commands = [
      ["HSET", presence_key | fields]
    ]

    # Add expiry if specified
    commands = if clear_after do
      expiry_time = now + clear_after
      commands ++ [
        ["ZADD", "presence:status_expiry", expiry_time, user_id]
      ]
    else
      commands ++ [
        ["ZREM", "presence:status_expiry", user_id]
      ]
    end

    case Redis.pipeline(commands) do
      {:ok, _} ->
        broadcast_status_update(user_id, status, custom_message, emoji)
        :ok
      error ->
        error
    end
  end

  @doc """
  Get user presence including aggregated device status.
  """
  def get_presence(user_id) do
    now = System.system_time(:second)
    cutoff = now - @presence_ttl

    commands = [
      ["HGETALL", "presence:user:#{user_id}"],
      ["ZRANGEBYSCORE", "presence:user:#{user_id}:devices", cutoff, "+inf", "WITHSCORES"]
    ]

    case Redis.pipeline(commands) do
      {:ok, [presence_data, device_data]} ->
        presence = parse_hash(presence_data)
        devices = parse_sorted_set(device_data)

        # Determine effective status based on devices
        effective_status = if Enum.empty?(devices) do
          "offline"
        else
          Map.get(presence, "status", "online")
        end

        {:ok, %{
          user_id: user_id,
          status: effective_status,
          custom_message: Map.get(presence, "custom_message"),
          emoji: Map.get(presence, "emoji"),
          last_seen: Map.get(presence, "last_seen"),
          devices: devices
        }}

      error ->
        error
    end
  end

  @doc """
  Get online users for a workspace.
  """
  def get_online_users(workspace_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    offset = Keyword.get(opts, :offset, 0)
    now = System.system_time(:second)
    cutoff = now - @presence_ttl

    commands = [
      ["ZRANGEBYSCORE", "presence:online:#{workspace_id}", cutoff, "+inf",
       "LIMIT", offset, limit, "WITHSCORES"],
      ["ZCOUNT", "presence:online:#{workspace_id}", cutoff, "+inf"]
    ]

    case Redis.pipeline(commands) do
      {:ok, [users, count]} ->
        {:ok, %{
          users: parse_sorted_set(users),
          total: count,
          limit: limit,
          offset: offset
        }}

      error ->
        error
    end
  end

  @doc """
  Get presence for multiple users (bulk fetch).
  """
  def get_bulk_presence(user_ids) do
    now = System.system_time(:second)
    cutoff = now - @presence_ttl

    commands = Enum.flat_map(user_ids, fn user_id ->
      [
        ["HGETALL", "presence:user:#{user_id}"],
        ["ZCOUNT", "presence:user:#{user_id}:devices", cutoff, "+inf"]
      ]
    end)

    case Redis.pipeline(commands) do
      {:ok, results} ->
        presence_list = results
        |> Enum.chunk_every(2)
        |> Enum.zip(user_ids)
        |> Enum.map(fn {[presence_data, device_count], user_id} ->
          presence = parse_hash(presence_data)
          status = if device_count > 0, do: Map.get(presence, "status", "online"), else: "offline"

          %{
            user_id: user_id,
            status: status,
            custom_message: Map.get(presence, "custom_message"),
            emoji: Map.get(presence, "emoji"),
            last_seen: Map.get(presence, "last_seen")
          }
        end)

        {:ok, presence_list}

      error ->
        error
    end
  end

  defp parse_hash(nil), do: %{}
  defp parse_hash([]), do: %{}
  defp parse_hash(list) do
    list
    |> Enum.chunk_every(2)
    |> Enum.into(%{}, fn [k, v] -> {k, v} end)
  end

  defp parse_sorted_set(nil), do: []
  defp parse_sorted_set([]), do: []
  defp parse_sorted_set(list) do
    list
    |> Enum.chunk_every(2)
    |> Enum.map(fn [member, score] ->
      %{id: member, timestamp: String.to_integer(score)}
    end)
  end
end
```

### Typing Indicators

```elixir
defmodule PresenceService.TypingTracker do
  @moduledoc """
  Redis-backed typing indicator tracking with auto-expiry.
  """

  alias PresenceService.Redis

  @typing_ttl 5  # seconds

  @doc """
  Start typing indicator for a user in a channel.
  """
  def start_typing(user_id, channel_id) do
    key = "typing:#{channel_id}"

    commands = [
      ["SADD", key, user_id],
      ["EXPIRE", key, @typing_ttl]
    ]

    case Redis.pipeline(commands) do
      {:ok, [added, _]} when added > 0 ->
        broadcast_typing(channel_id, user_id, :start)
        :ok
      {:ok, _} ->
        # User already in set, just refresh TTL
        :ok
      error ->
        error
    end
  end

  @doc """
  Stop typing indicator for a user.
  """
  def stop_typing(user_id, channel_id) do
    key = "typing:#{channel_id}"

    case Redis.command(["SREM", key, user_id]) do
      {:ok, removed} when removed > 0 ->
        broadcast_typing(channel_id, user_id, :stop)
        :ok
      {:ok, _} ->
        :ok
      error ->
        error
    end
  end

  @doc """
  Get all users currently typing in a channel.
  """
  def get_typing_users(channel_id) do
    key = "typing:#{channel_id}"

    case Redis.command(["SMEMBERS", key]) do
      {:ok, users} -> {:ok, users}
      error -> error
    end
  end

  defp broadcast_typing(channel_id, user_id, action) do
    Phoenix.PubSub.broadcast(
      PresenceService.PubSub,
      "channel:#{channel_id}",
      {:typing, %{user_id: user_id, action: action}}
    )
  end
end
```

### Channel Presence

```elixir
defmodule PresenceService.ChannelPresence do
  @moduledoc """
  Track which users are actively viewing a channel.
  """

  alias PresenceService.Redis

  @view_ttl 300  # 5 minutes

  @doc """
  User joins/views a channel.
  """
  def join_channel(user_id, channel_id) do
    now = System.system_time(:second)
    key = "presence:channel:#{channel_id}"

    commands = [
      ["ZADD", key, now, user_id],
      ["EXPIRE", key, @view_ttl]
    ]

    case Redis.pipeline(commands) do
      {:ok, _} ->
        broadcast_channel_presence(channel_id, user_id, :join)
        :ok
      error ->
        error
    end
  end

  @doc """
  User leaves a channel.
  """
  def leave_channel(user_id, channel_id) do
    key = "presence:channel:#{channel_id}"

    case Redis.command(["ZREM", key, user_id]) do
      {:ok, _} ->
        broadcast_channel_presence(channel_id, user_id, :leave)
        :ok
      error ->
        error
    end
  end

  @doc """
  Get users currently viewing a channel.
  """
  def get_channel_viewers(channel_id) do
    now = System.system_time(:second)
    cutoff = now - @view_ttl
    key = "presence:channel:#{channel_id}"

    case Redis.command(["ZRANGEBYSCORE", key, cutoff, "+inf"]) do
      {:ok, users} -> {:ok, users}
      error -> error
    end
  end

  @doc """
  Get viewer count for a channel.
  """
  def get_viewer_count(channel_id) do
    now = System.system_time(:second)
    cutoff = now - @view_ttl
    key = "presence:channel:#{channel_id}"

    case Redis.command(["ZCOUNT", key, cutoff, "+inf"]) do
      {:ok, count} -> {:ok, count}
      error -> error
    end
  end

  defp broadcast_channel_presence(channel_id, user_id, action) do
    Phoenix.PubSub.broadcast(
      PresenceService.PubSub,
      "channel:#{channel_id}",
      {:presence, %{user_id: user_id, action: action}}
    )
  end
end
```

## Redis Pub/Sub

### Real-time Event Broadcasting

```elixir
defmodule PresenceService.PubSub.Redis do
  @moduledoc """
  Redis Pub/Sub for cross-node presence broadcasting.
  """

  use GenServer
  require Logger

  @pubsub_channels [
    "presence:updates",
    "presence:status",
    "presence:typing"
  ]

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    redis_config = Application.get_env(:presence_service, :redis)

    {:ok, pubsub} = Redix.PubSub.start_link(
      host: redis_config[:host],
      port: redis_config[:port],
      password: redis_config[:password]
    )

    # Subscribe to presence channels
    Enum.each(@pubsub_channels, fn channel ->
      Redix.PubSub.subscribe(pubsub, channel, self())
    end)

    {:ok, %{pubsub: pubsub}}
  end

  @impl true
  def handle_info({:redix_pubsub, _pubsub, _ref, :subscribed, %{channel: channel}}, state) do
    Logger.info("Subscribed to Redis channel: #{channel}")
    {:noreply, state}
  end

  @impl true
  def handle_info({:redix_pubsub, _pubsub, _ref, :message, %{channel: channel, payload: payload}}, state) do
    handle_pubsub_message(channel, payload)
    {:noreply, state}
  end

  @doc """
  Publish a presence update to Redis Pub/Sub.
  """
  def publish(channel, message) do
    payload = Jason.encode!(message)
    PresenceService.Redis.command(["PUBLISH", channel, payload])
  end

  defp handle_pubsub_message("presence:updates", payload) do
    case Jason.decode(payload) do
      {:ok, %{"user_id" => user_id, "workspace_id" => workspace_id} = data} ->
        Phoenix.PubSub.broadcast(
          PresenceService.PubSub,
          "workspace:#{workspace_id}",
          {:presence_update, data}
        )
      _ ->
        :ok
    end
  end

  defp handle_pubsub_message("presence:status", payload) do
    case Jason.decode(payload) do
      {:ok, %{"user_id" => user_id} = data} ->
        Phoenix.PubSub.broadcast(
          PresenceService.PubSub,
          "user:#{user_id}",
          {:status_update, data}
        )
      _ ->
        :ok
    end
  end

  defp handle_pubsub_message("presence:typing", payload) do
    case Jason.decode(payload) do
      {:ok, %{"channel_id" => channel_id} = data} ->
        Phoenix.PubSub.broadcast(
          PresenceService.PubSub,
          "channel:#{channel_id}",
          {:typing_update, data}
        )
      _ ->
        :ok
    end
  end

  defp handle_pubsub_message(_, _), do: :ok
end
```

## Phoenix Channels

```elixir
defmodule PresenceWeb.PresenceChannel do
  use PresenceWeb, :channel

  alias PresenceService.{PresenceTracker, TypingTracker, ChannelPresence}

  @heartbeat_interval 15_000  # 15 seconds

  def join("presence:" <> user_id, params, socket) do
    if authorized?(socket, user_id) do
      send(self(), :after_join)
      schedule_heartbeat()

      socket = socket
      |> assign(:user_id, user_id)
      |> assign(:device_id, params["device_id"] || generate_device_id())
      |> assign(:workspace_id, params["workspace_id"])

      {:ok, socket}
    else
      {:error, %{reason: "unauthorized"}}
    end
  end

  def handle_info(:after_join, socket) do
    # Track presence in Redis
    PresenceTracker.heartbeat(
      socket.assigns.user_id,
      socket.assigns.device_id,
      socket.assigns.workspace_id
    )

    # Send current presence state
    {:ok, presence} = PresenceTracker.get_presence(socket.assigns.user_id)
    push(socket, "presence_state", presence)

    {:noreply, socket}
  end

  def handle_info(:heartbeat, socket) do
    PresenceTracker.heartbeat(
      socket.assigns.user_id,
      socket.assigns.device_id,
      socket.assigns.workspace_id
    )
    schedule_heartbeat()
    {:noreply, socket}
  end

  def handle_in("set_status", params, socket) do
    opts = [
      custom_message: params["custom_message"],
      emoji: params["emoji"],
      clear_after: params["clear_after"]
    ] |> Enum.reject(fn {_, v} -> is_nil(v) end)

    case PresenceTracker.set_status(socket.assigns.user_id, params["status"], opts) do
      :ok -> {:reply, :ok, socket}
      {:error, reason} -> {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  def handle_in("typing_start", %{"channel_id" => channel_id}, socket) do
    TypingTracker.start_typing(socket.assigns.user_id, channel_id)
    {:noreply, socket}
  end

  def handle_in("typing_stop", %{"channel_id" => channel_id}, socket) do
    TypingTracker.stop_typing(socket.assigns.user_id, channel_id)
    {:noreply, socket}
  end

  def handle_in("join_channel", %{"channel_id" => channel_id}, socket) do
    ChannelPresence.join_channel(socket.assigns.user_id, channel_id)
    {:noreply, socket}
  end

  def handle_in("leave_channel", %{"channel_id" => channel_id}, socket) do
    ChannelPresence.leave_channel(socket.assigns.user_id, channel_id)
    {:noreply, socket}
  end

  def handle_in("get_online_users", params, socket) do
    {:ok, result} = PresenceTracker.get_online_users(
      socket.assigns.workspace_id,
      limit: params["limit"] || 100,
      offset: params["offset"] || 0
    )
    {:reply, {:ok, result}, socket}
  end

  def terminate(_reason, socket) do
    # Clean up on disconnect
    PresenceTracker.disconnect(
      socket.assigns.user_id,
      socket.assigns.device_id
    )
    :ok
  end

  defp schedule_heartbeat do
    Process.send_after(self(), :heartbeat, @heartbeat_interval)
  end

  defp generate_device_id do
    :crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower)
  end

  defp authorized?(socket, user_id) do
    socket.assigns[:current_user_id] == user_id
  end
end
```

## Redis Cluster Configuration

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  redis-master:
    image: redis:7.2-alpine
    command: redis-server --appendonly yes --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis-replica:
    image: redis:7.2-alpine
    command: redis-server --replicaof redis-master 6379 --appendonly yes
    depends_on:
      - redis-master

  redis-sentinel:
    image: redis:7.2-alpine
    command: redis-sentinel /etc/redis/sentinel.conf
    volumes:
      - ./sentinel.conf:/etc/redis/sentinel.conf
    depends_on:
      - redis-master
      - redis-replica
    ports:
      - "26379:26379"

  redis-commander:
    image: rediscommander/redis-commander:latest
    environment:
      - REDIS_HOSTS=local:redis-master:6379
    ports:
      - "8081:8081"
    depends_on:
      - redis-master

volumes:
  redis_data:
```

### Redis Sentinel Configuration

```conf
# sentinel.conf
sentinel monitor quikapp-master redis-master 6379 2
sentinel down-after-milliseconds quikapp-master 5000
sentinel failover-timeout quikapp-master 60000
sentinel parallel-syncs quikapp-master 1

sentinel auth-pass quikapp-master your-redis-password
```

### Production Kubernetes Configuration

```yaml
apiVersion: redis.redis.opstreelabs.in/v1beta2
kind: RedisCluster
metadata:
  name: quikapp-redis
  namespace: presence
spec:
  clusterSize: 3
  clusterVersion: v7
  persistenceEnabled: true
  kubernetesConfig:
    image: redis:7.2-alpine
    imagePullPolicy: IfNotPresent
    resources:
      requests:
        cpu: 100m
        memory: 256Mi
      limits:
        cpu: 500m
        memory: 512Mi
  redisExporter:
    enabled: true
    image: quay.io/opstree/redis-exporter:v1.44.0
  storage:
    volumeClaimTemplate:
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi
        storageClassName: fast-ssd
  redisConfig:
    additionalRedisConfig: |
      maxmemory 400mb
      maxmemory-policy allkeys-lru
      appendonly yes
      appendfsync everysec
```

## API Endpoints

### Get User Presence

```http
GET /api/presence/users/{userId}
Authorization: Bearer {token}
```

**Response:**

```json
{
  "user_id": "user-123",
  "status": "online",
  "custom_message": "In a meeting",
  "emoji": "📞",
  "last_seen": 1704067200,
  "devices": [
    {"id": "web:browser_abc", "timestamp": 1704067200},
    {"id": "mobile:ios_xyz", "timestamp": 1704067195}
  ]
}
```

### Set User Status

```http
PUT /api/presence/users/{userId}/status
Content-Type: application/json
Authorization: Bearer {token}

{
  "status": "busy",
  "custom_message": "Deep work - no interruptions",
  "emoji": "🎯",
  "clear_after": 3600
}
```

### Get Online Users

```http
GET /api/presence/workspace/{workspaceId}/online?limit=50&offset=0
Authorization: Bearer {token}
```

**Response:**

```json
{
  "users": [
    {"id": "user-123", "timestamp": 1704067200},
    {"id": "user-456", "timestamp": 1704067198}
  ],
  "total": 142,
  "limit": 50,
  "offset": 0
}
```

### Get Bulk Presence

```http
POST /api/presence/bulk
Content-Type: application/json
Authorization: Bearer {token}

{
  "user_ids": ["user-123", "user-456", "user-789"]
}
```

### Get Channel Viewers

```http
GET /api/presence/channel/{channelId}/viewers
Authorization: Bearer {token}
```

### Get Typing Users

```http
GET /api/presence/channel/{channelId}/typing
Authorization: Bearer {token}
```

## Monitoring & Metrics

### Prometheus Metrics

```elixir
defmodule PresenceService.Metrics do
  use Prometheus.Metric

  def setup do
    Gauge.declare(
      name: :presence_online_users,
      help: "Number of online users",
      labels: [:workspace_id]
    )

    Counter.declare(
      name: :presence_heartbeats_total,
      help: "Total heartbeat events",
      labels: [:status]
    )

    Histogram.declare(
      name: :presence_redis_latency_seconds,
      help: "Redis operation latency",
      labels: [:operation],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1]
    )

    Gauge.declare(
      name: :presence_typing_users,
      help: "Number of users currently typing",
      labels: [:channel_id]
    )
  end
end
```

### Redis Health Check

```elixir
defmodule PresenceService.HealthCheck do
  alias PresenceService.Redis

  def check do
    start_time = System.monotonic_time(:microsecond)

    case Redis.command(["PING"]) do
      {:ok, "PONG"} ->
        latency = System.monotonic_time(:microsecond) - start_time

        {:ok, %{
          status: "healthy",
          redis: %{
            connected: true,
            latency_us: latency
          }
        }}

      {:error, reason} ->
        {:error, %{
          status: "unhealthy",
          redis: %{
            connected: false,
            error: inspect(reason)
          }
        }}
    end
  end

  def redis_info do
    case Redis.command(["INFO", "stats"]) do
      {:ok, info} -> parse_redis_info(info)
      error -> error
    end
  end

  defp parse_redis_info(info) do
    info
    |> String.split("\r\n")
    |> Enum.reject(&(String.starts_with?(&1, "#") or &1 == ""))
    |> Enum.into(%{}, fn line ->
      [key, value] = String.split(line, ":", parts: 2)
      {key, value}
    end)
  end
end
```

## Status Types

```elixir
@status_types [:online, :away, :busy, :offline, :invisible]

defmodule Presence.Status do
  defstruct [
    :user_id,
    :status,
    :custom_message,
    :emoji,
    :clear_after,
    :last_seen_at,
    :devices
  ]
end
```

## Environment Variables

```bash
# Redis Connection
REDIS_HOST=redis-master.presence.svc.cluster.local
REDIS_PORT=6379
REDIS_PASSWORD=your-secure-password
REDIS_SSL=true
REDIS_DATABASE=0

# Redis Pool
REDIS_POOL_SIZE=20
REDIS_TIMEOUT=5000

# Presence Settings
HEARTBEAT_INTERVAL=15000
PRESENCE_TTL=60
TYPING_TTL=5

# Node Configuration
NODE_NAME=presence@node-1
```

## Health Check

```http
GET /health
```

```json
{
  "status": "healthy",
  "redis": {
    "connected": true,
    "latency_us": 245,
    "memory_used": "45.2MB",
    "connected_clients": 25
  },
  "presence": {
    "online_users": 1542,
    "active_channels": 234
  },
  "version": "1.0.0"
}
```
