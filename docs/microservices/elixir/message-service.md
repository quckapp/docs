---
sidebar_position: 3
---

# Message Service

Elixir/Phoenix service for real-time messaging with Apache Kafka event streaming, read receipts, and reactions.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4003 |
| **Database** | MongoDB |
| **Message Broker** | Apache Kafka |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |

## Features

- Real-time message delivery via Phoenix Channels
- Apache Kafka event streaming for reliability
- Read receipts with delivery guarantees
- Message reactions
- Message editing/deletion
- File attachments
- Threaded replies
- Message search
- Event sourcing and replay

## API Documentation

### OpenAPI Spec

- **OpenAPI Spec (JSON):** http://localhost:4003/api/openapi
- **OpenAPI Spec (YAML):** http://localhost:4003/api/openapi.yaml

### OpenApiSpex Configuration

The message-service uses [OpenApiSpex](https://github.com/open-api-spex/open_api_spex) for OpenAPI documentation:

```elixir
defmodule MessageServiceWeb.ApiSpec do
  alias OpenApiSpex.{Info, OpenApi, Paths, Server}

  @behaviour OpenApi

  @impl OpenApi
  def spec do
    %OpenApi{
      info: %Info{
        title: "QuckApp Message Service API",
        version: "1.0.0",
        description: "Real-time messaging with Kafka event streaming"
      },
      servers: [
        %Server{url: "http://localhost:4003", description: "Local Development"},
        %Server{url: "https://api.quckapp.com/messages", description: "Production"}
      ],
      paths: Paths.from_router(MessageServiceWeb.Router)
    }
    |> OpenApiSpex.resolve_schema_modules()
  end
end
```

### API Tags

| Tag | Description |
|-----|-------------|
| Messages | Message CRUD operations |
| Reactions | Message reactions |
| Read Receipts | Read receipt management |
| Threads | Threaded conversations |
| Attachments | File attachments |

### Security

- **Authentication:** JWT Bearer token via `Authorization` header
- **WebSocket:** Phoenix Channels with token authentication

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │────▶│  Message API    │────▶│    MongoDB      │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌─────────────────┐
                        │  Apache Kafka   │
                        │    Cluster      │
                        └────────┬────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Notification │      │    Analytics    │      │     Search      │
│    Service    │      │     Service     │      │    Indexer      │
└───────────────┘      └─────────────────┘      └─────────────────┘
```

## Apache Kafka Integration

### Kafka Configuration

```elixir
# config/config.exs
config :message_service, :kafka,
  brokers: [
    {"kafka-1.quckapp.internal", 9092},
    {"kafka-2.quckapp.internal", 9092},
    {"kafka-3.quckapp.internal", 9092}
  ],
  client_id: :message_service,
  ssl: true,
  sasl: [
    mechanism: :scram_sha_512,
    username: System.get_env("KAFKA_USERNAME"),
    password: System.get_env("KAFKA_PASSWORD")
  ]

# Producer configuration
config :message_service, :kafka_producer,
  required_acks: :all,
  ack_timeout: 1_000,
  max_retries: 3,
  retry_backoff_ms: 100,
  compression: :snappy,
  batch_size: 16_384,
  linger_ms: 5

# Consumer configuration
config :message_service, :kafka_consumer,
  group_id: "message-service-group",
  auto_offset_reset: :earliest,
  enable_auto_commit: false,
  max_poll_records: 500,
  session_timeout_ms: 30_000,
  heartbeat_interval_ms: 3_000
```

### Kafka Topics

| Topic | Partitions | Replication | Retention | Description |
|-------|------------|-------------|-----------|-------------|
| `messages.created` | 32 | 3 | 30 days | New message events |
| `messages.updated` | 16 | 3 | 7 days | Message edits |
| `messages.deleted` | 16 | 3 | 7 days | Message deletions |
| `messages.reactions` | 16 | 3 | 7 days | Reaction events |
| `messages.read-receipts` | 32 | 3 | 3 days | Read receipt events |
| `messages.typing` | 8 | 2 | 1 hour | Typing indicators |
| `messages.dlq` | 4 | 3 | 90 days | Dead letter queue |

### Topic Creation

```bash
# Create message topics with proper configuration
kafka-topics.sh --create \
  --bootstrap-server kafka:9092 \
  --topic messages.created \
  --partitions 32 \
  --replication-factor 3 \
  --config retention.ms=2592000000 \
  --config cleanup.policy=delete \
  --config min.insync.replicas=2

kafka-topics.sh --create \
  --bootstrap-server kafka:9092 \
  --topic messages.read-receipts \
  --partitions 32 \
  --replication-factor 3 \
  --config retention.ms=259200000 \
  --config cleanup.policy=compact,delete
```

### Kafka Producer

```elixir
defmodule MessageService.Kafka.Producer do
  @moduledoc """
  Kafka producer for message events with guaranteed delivery.
  """

  use GenServer
  require Logger

  alias MessageService.Kafka.Serializer

  @topics %{
    message_created: "messages.created",
    message_updated: "messages.updated",
    message_deleted: "messages.deleted",
    reaction_added: "messages.reactions",
    read_receipt: "messages.read-receipts",
    typing: "messages.typing"
  }

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Publish a message event to Kafka with guaranteed delivery.
  """
  def publish(event_type, payload, opts \\ []) do
    topic = Map.fetch!(@topics, event_type)
    partition_key = opts[:partition_key] || payload.channel_id

    event = %{
      event_id: UUID.uuid4(),
      event_type: event_type,
      timestamp: DateTime.utc_now(),
      payload: payload,
      metadata: %{
        service: "message-service",
        version: "1.0.0",
        correlation_id: opts[:correlation_id]
      }
    }

    case produce(topic, partition_key, event) do
      :ok ->
        Logger.debug("Published #{event_type} to #{topic}")
        {:ok, event.event_id}

      {:error, reason} ->
        Logger.error("Failed to publish #{event_type}: #{inspect(reason)}")
        handle_publish_failure(event, reason)
    end
  end

  @doc """
  Publish message created event.
  """
  def publish_message_created(message) do
    publish(:message_created, %{
      message_id: message.id,
      channel_id: message.channel_id,
      workspace_id: message.workspace_id,
      sender_id: message.sender_id,
      content: message.content,
      type: message.type,
      attachments: message.attachments,
      reply_to: message.reply_to,
      thread_id: message.thread_id,
      created_at: message.inserted_at
    }, partition_key: message.channel_id)
  end

  @doc """
  Publish read receipt event.
  """
  def publish_read_receipt(receipt) do
    publish(:read_receipt, %{
      message_id: receipt.message_id,
      channel_id: receipt.channel_id,
      user_id: receipt.user_id,
      read_at: receipt.read_at
    }, partition_key: receipt.channel_id)
  end

  defp produce(topic, key, event) do
    message = %{
      key: key,
      value: Serializer.encode(event),
      headers: [
        {"content-type", "application/json"},
        {"event-type", to_string(event.event_type)}
      ]
    }

    :brod.produce_sync(:kafka_client, topic, :hash, message.key, message.value)
  end

  defp handle_publish_failure(event, reason) do
    # Store in local buffer for retry
    MessageService.Kafka.RetryBuffer.enqueue(event)
    {:error, :queued_for_retry}
  end
end
```

### Kafka Consumer

```elixir
defmodule MessageService.Kafka.Consumer do
  @moduledoc """
  Kafka consumer for processing message events from other services.
  """

  use Broadway

  alias Broadway.Message
  alias MessageService.Kafka.Deserializer

  def start_link(opts) do
    Broadway.start_link(__MODULE__,
      name: __MODULE__,
      producer: [
        module: {
          BroadwayKafka.Producer,
          [
            hosts: Application.get_env(:message_service, :kafka)[:brokers],
            group_id: "message-service-consumer",
            topics: ["users.updated", "channels.deleted", "workspaces.updated"],
            receive_interval: 100,
            offset_commit_on_ack: true,
            offset_reset_policy: :earliest
          ]
        },
        concurrency: 4
      ],
      processors: [
        default: [
          concurrency: 8,
          max_demand: 10
        ]
      ],
      batchers: [
        default: [
          batch_size: 100,
          batch_timeout: 200,
          concurrency: 4
        ]
      ]
    )
  end

  @impl true
  def handle_message(_, %Message{data: data} = message, _) do
    case Deserializer.decode(data) do
      {:ok, event} ->
        process_event(event)
        message

      {:error, reason} ->
        Message.failed(message, reason)
    end
  end

  @impl true
  def handle_batch(_, messages, _, _) do
    # Batch processing for efficiency
    messages
    |> Enum.group_by(& &1.metadata.topic)
    |> Enum.each(fn {topic, batch} ->
      process_batch(topic, batch)
    end)

    messages
  end

  @impl true
  def handle_failed(messages, _context) do
    # Send failed messages to DLQ
    Enum.each(messages, fn message ->
      MessageService.Kafka.DLQ.publish(message)
    end)

    messages
  end

  defp process_event(%{event_type: "user.updated"} = event) do
    MessageService.Messages.update_sender_info(
      event.payload.user_id,
      event.payload.display_name,
      event.payload.avatar_url
    )
  end

  defp process_event(%{event_type: "channel.deleted"} = event) do
    MessageService.Messages.archive_channel_messages(event.payload.channel_id)
  end

  defp process_event(_event), do: :ok

  defp process_batch("users.updated", messages) do
    user_ids = Enum.map(messages, & &1.data.payload.user_id)
    MessageService.Messages.batch_update_sender_info(user_ids)
  end

  defp process_batch(_, _), do: :ok
end
```

### Event Schemas (Avro)

```json
{
  "type": "record",
  "name": "MessageCreated",
  "namespace": "com.quckapp.messages",
  "fields": [
    {"name": "event_id", "type": "string"},
    {"name": "event_type", "type": "string"},
    {"name": "timestamp", "type": "long", "logicalType": "timestamp-millis"},
    {
      "name": "payload",
      "type": {
        "type": "record",
        "name": "MessagePayload",
        "fields": [
          {"name": "message_id", "type": "string"},
          {"name": "channel_id", "type": "string"},
          {"name": "workspace_id", "type": "string"},
          {"name": "sender_id", "type": "string"},
          {"name": "content", "type": ["null", "string"]},
          {"name": "type", "type": {"type": "enum", "name": "MessageType", "symbols": ["TEXT", "IMAGE", "FILE", "SYSTEM"]}},
          {"name": "attachments", "type": {"type": "array", "items": "string"}, "default": []},
          {"name": "reply_to", "type": ["null", "string"]},
          {"name": "thread_id", "type": ["null", "string"]},
          {"name": "created_at", "type": "long", "logicalType": "timestamp-millis"}
        ]
      }
    },
    {
      "name": "metadata",
      "type": {
        "type": "record",
        "name": "EventMetadata",
        "fields": [
          {"name": "service", "type": "string"},
          {"name": "version", "type": "string"},
          {"name": "correlation_id", "type": ["null", "string"]}
        ]
      }
    }
  ]
}
```

### Schema Registry Integration

```elixir
defmodule MessageService.Kafka.SchemaRegistry do
  @moduledoc """
  Confluent Schema Registry integration for Avro schema management.
  """

  @registry_url System.get_env("SCHEMA_REGISTRY_URL", "http://schema-registry:8081")

  def register_schema(subject, schema) do
    body = Jason.encode!(%{schema: Jason.encode!(schema)})

    case HTTPoison.post("#{@registry_url}/subjects/#{subject}/versions", body, headers()) do
      {:ok, %{status_code: 200, body: body}} ->
        {:ok, Jason.decode!(body)["id"]}

      {:error, reason} ->
        {:error, reason}
    end
  end

  def get_schema(subject, version \\ "latest") do
    case HTTPoison.get("#{@registry_url}/subjects/#{subject}/versions/#{version}") do
      {:ok, %{status_code: 200, body: body}} ->
        {:ok, Jason.decode!(body)}

      {:error, reason} ->
        {:error, reason}
    end
  end

  def check_compatibility(subject, schema) do
    body = Jason.encode!(%{schema: Jason.encode!(schema)})

    case HTTPoison.post("#{@registry_url}/compatibility/subjects/#{subject}/versions/latest", body, headers()) do
      {:ok, %{status_code: 200, body: body}} ->
        {:ok, Jason.decode!(body)["is_compatible"]}

      {:error, reason} ->
        {:error, reason}
    end
  end

  defp headers do
    [{"Content-Type", "application/vnd.schemaregistry.v1+json"}]
  end
end
```

### Kafka Streams Processing

```elixir
defmodule MessageService.Kafka.Streams do
  @moduledoc """
  Stream processing for real-time message analytics and aggregations.
  """

  use GenStage
  require Logger

  def start_link(opts) do
    GenStage.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @impl true
  def init(_opts) do
    {:producer_consumer, %{},
      subscribe_to: [
        {MessageService.Kafka.Consumer, max_demand: 100}
      ]}
  end

  @impl true
  def handle_events(events, _from, state) do
    processed = events
    |> Enum.map(&process_stream_event/1)
    |> Enum.reject(&is_nil/1)

    {:noreply, processed, state}
  end

  defp process_stream_event(%{event_type: :message_created} = event) do
    # Real-time message count aggregation
    channel_id = event.payload.channel_id
    timestamp = event.timestamp

    MessageService.Analytics.increment_message_count(channel_id, timestamp)

    # Window-based aggregation (5-minute tumbling window)
    window_key = get_window_key(timestamp, :timer.minutes(5))
    MessageService.Analytics.aggregate_window(window_key, event)

    event
  end

  defp process_stream_event(%{event_type: :reaction_added} = event) do
    # Reaction trending analysis
    MessageService.Analytics.track_reaction_trend(
      event.payload.emoji,
      event.timestamp
    )

    event
  end

  defp process_stream_event(_event), do: nil

  defp get_window_key(timestamp, window_size) do
    window_start = div(DateTime.to_unix(timestamp, :millisecond), window_size) * window_size
    DateTime.from_unix!(window_start, :millisecond)
  end
end
```

### Exactly-Once Semantics

```elixir
defmodule MessageService.Kafka.ExactlyOnce do
  @moduledoc """
  Implements exactly-once semantics for message processing.
  """

  alias MessageService.Repo
  alias MessageService.ProcessedEvents

  @doc """
  Process event with idempotency guarantee.
  """
  def process_idempotent(event, processor_fn) do
    event_id = event.event_id

    Repo.transaction(fn ->
      case ProcessedEvents.get(event_id) do
        nil ->
          # Event not processed yet
          result = processor_fn.(event)

          ProcessedEvents.insert(%{
            event_id: event_id,
            processed_at: DateTime.utc_now(),
            result: :success
          })

          result

        _existing ->
          # Event already processed, skip
          {:ok, :duplicate}
      end
    end)
  end

  @doc """
  Transactional produce with consumer offset commit.
  """
  def transactional_produce(consumer_offsets, events) do
    :brod.transaction(:kafka_client, fn txn ->
      # Produce events
      Enum.each(events, fn {topic, key, value} ->
        :brod.txn_produce(txn, topic, :hash, key, value)
      end)

      # Commit consumer offsets
      :brod.txn_add_offsets(txn, "message-service-group", consumer_offsets)
    end)
  end
end
```

### Dead Letter Queue

```elixir
defmodule MessageService.Kafka.DLQ do
  @moduledoc """
  Dead Letter Queue for failed message processing.
  """

  require Logger

  @dlq_topic "messages.dlq"
  @max_retries 3

  def publish(failed_message) do
    retry_count = get_retry_count(failed_message)

    dlq_event = %{
      original_topic: failed_message.metadata.topic,
      original_partition: failed_message.metadata.partition,
      original_offset: failed_message.metadata.offset,
      original_key: failed_message.metadata.key,
      original_value: failed_message.data,
      error: inspect(failed_message.status),
      retry_count: retry_count,
      failed_at: DateTime.utc_now(),
      can_retry: retry_count < @max_retries
    }

    case :brod.produce_sync(:kafka_client, @dlq_topic, 0, nil, Jason.encode!(dlq_event)) do
      :ok ->
        Logger.warn("Message sent to DLQ: #{inspect(dlq_event)}")
        :ok

      {:error, reason} ->
        Logger.error("Failed to send to DLQ: #{inspect(reason)}")
        {:error, reason}
    end
  end

  def process_dlq do
    # Retry eligible messages from DLQ
    :brod.subscribe(:kafka_client, self(), @dlq_topic, 0, [])
    receive_dlq_messages()
  end

  defp receive_dlq_messages do
    receive do
      {:kafka_message, _topic, _partition, _offset, _key, value} ->
        event = Jason.decode!(value)

        if event["can_retry"] do
          retry_message(event)
        else
          archive_message(event)
        end

        receive_dlq_messages()
    after
      5000 -> :ok
    end
  end

  defp retry_message(event) do
    # Re-publish to original topic
    :brod.produce_sync(
      :kafka_client,
      event["original_topic"],
      event["original_partition"],
      event["original_key"],
      event["original_value"]
    )
  end

  defp archive_message(event) do
    # Store permanently failed messages
    MessageService.FailedMessages.insert(event)
  end

  defp get_retry_count(%{metadata: %{headers: headers}}) do
    case List.keyfind(headers, "retry-count", 0) do
      {_, count} -> String.to_integer(count)
      nil -> 0
    end
  end
end
```

## Message Schema

```elixir
defmodule Message do
  use Ecto.Schema

  embedded_schema do
    field :channel_id, :string
    field :workspace_id, :string
    field :sender_id, :string
    field :content, :string
    field :type, Ecto.Enum, values: [:text, :image, :file, :system]
    field :attachments, {:array, :map}
    field :reactions, {:array, :map}
    field :reply_to, :string
    field :thread_id, :string
    field :edited_at, :utc_datetime
    field :deleted_at, :utc_datetime
    field :kafka_offset, :integer
    field :kafka_partition, :integer
    timestamps()
  end
end
```

## Phoenix Channel

```elixir
defmodule MessageWeb.MessageChannel do
  use MessageWeb, :channel

  alias MessageService.Kafka.Producer

  def handle_in("new_message", %{"content" => content}, socket) do
    message = Messages.create_message(%{
      channel_id: socket.assigns.channel_id,
      workspace_id: socket.assigns.workspace_id,
      sender_id: socket.assigns.user_id,
      content: content
    })

    # Publish to Kafka for downstream consumers
    Producer.publish_message_created(message)

    broadcast!(socket, "message", message)
    {:reply, {:ok, message}, socket}
  end

  def handle_in("add_reaction", %{"message_id" => id, "emoji" => emoji}, socket) do
    {:ok, reaction} = Messages.add_reaction(id, socket.assigns.user_id, emoji)

    # Publish reaction event to Kafka
    Producer.publish(:reaction_added, %{
      message_id: id,
      channel_id: socket.assigns.channel_id,
      user_id: socket.assigns.user_id,
      emoji: emoji
    })

    broadcast!(socket, "reaction_added", %{message_id: id, emoji: emoji})
    {:noreply, socket}
  end

  def handle_in("mark_read", %{"message_id" => id}, socket) do
    {:ok, receipt} = Messages.mark_as_read(id, socket.assigns.user_id)

    # Publish read receipt to Kafka
    Producer.publish_read_receipt(receipt)

    {:noreply, socket}
  end
end
```

## Kafka Cluster Configuration

### Docker Compose (Development)

```yaml
version: '3.8'

services:
  zookeeper:
    image: confluentinc/cp-zookeeper:7.5.0
    environment:
      ZOOKEEPER_CLIENT_PORT: 2181
      ZOOKEEPER_TICK_TIME: 2000
    ports:
      - "2181:2181"

  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9092:9092"
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 3
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 2
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_NUM_PARTITIONS: 8

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9093:9093"
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:29093,PLAINTEXT_HOST://localhost:9093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    depends_on:
      - zookeeper
    ports:
      - "9094:9094"
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:29094,PLAINTEXT_HOST://localhost:9094
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2

  schema-registry:
    image: confluentinc/cp-schema-registry:7.5.0
    depends_on:
      - kafka-1
      - kafka-2
      - kafka-3
    ports:
      - "8081:8081"
    environment:
      SCHEMA_REGISTRY_HOST_NAME: schema-registry
      SCHEMA_REGISTRY_KAFKASTORE_BOOTSTRAP_SERVERS: kafka-1:29092,kafka-2:29093,kafka-3:29094
      SCHEMA_REGISTRY_LISTENERS: http://0.0.0.0:8081

  kafka-ui:
    image: provectuslabs/kafka-ui:latest
    depends_on:
      - kafka-1
      - schema-registry
    ports:
      - "8080:8080"
    environment:
      KAFKA_CLUSTERS_0_NAME: quckapp-local
      KAFKA_CLUSTERS_0_BOOTSTRAPSERVERS: kafka-1:29092,kafka-2:29093,kafka-3:29094
      KAFKA_CLUSTERS_0_SCHEMAREGISTRY: http://schema-registry:8081
```

### Production Configuration (Kubernetes)

```yaml
apiVersion: kafka.strimzi.io/v1beta2
kind: Kafka
metadata:
  name: quckapp-kafka
  namespace: messaging
spec:
  kafka:
    version: 3.6.0
    replicas: 3
    listeners:
      - name: plain
        port: 9092
        type: internal
        tls: false
      - name: tls
        port: 9093
        type: internal
        tls: true
        authentication:
          type: scram-sha-512
      - name: external
        port: 9094
        type: loadbalancer
        tls: true
        authentication:
          type: scram-sha-512
    config:
      offsets.topic.replication.factor: 3
      transaction.state.log.replication.factor: 3
      transaction.state.log.min.isr: 2
      default.replication.factor: 3
      min.insync.replicas: 2
      inter.broker.protocol.version: "3.6"
      log.retention.hours: 168
      log.segment.bytes: 1073741824
      num.partitions: 8
    storage:
      type: persistent-claim
      size: 100Gi
      class: fast-ssd
    resources:
      requests:
        memory: 4Gi
        cpu: "2"
      limits:
        memory: 8Gi
        cpu: "4"
    metricsConfig:
      type: jmxPrometheusExporter
      valueFrom:
        configMapKeyRef:
          name: kafka-metrics
          key: kafka-metrics-config.yml
  zookeeper:
    replicas: 3
    storage:
      type: persistent-claim
      size: 10Gi
      class: fast-ssd
  entityOperator:
    topicOperator: {}
    userOperator: {}
```

## Monitoring & Metrics

### Kafka Metrics

```elixir
defmodule MessageService.Kafka.Metrics do
  @moduledoc """
  Prometheus metrics for Kafka producer/consumer.
  """

  use Prometheus.Metric

  def setup do
    Counter.declare(
      name: :kafka_messages_produced_total,
      help: "Total messages produced to Kafka",
      labels: [:topic, :status]
    )

    Counter.declare(
      name: :kafka_messages_consumed_total,
      help: "Total messages consumed from Kafka",
      labels: [:topic, :consumer_group]
    )

    Histogram.declare(
      name: :kafka_produce_latency_seconds,
      help: "Kafka produce latency in seconds",
      labels: [:topic],
      buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1]
    )

    Gauge.declare(
      name: :kafka_consumer_lag,
      help: "Kafka consumer lag",
      labels: [:topic, :partition, :consumer_group]
    )
  end

  def record_produce(topic, status, latency) do
    Counter.inc(name: :kafka_messages_produced_total, labels: [topic, status])
    Histogram.observe([name: :kafka_produce_latency_seconds, labels: [topic]], latency)
  end

  def record_consume(topic, consumer_group) do
    Counter.inc(name: :kafka_messages_consumed_total, labels: [topic, consumer_group])
  end

  def set_consumer_lag(topic, partition, consumer_group, lag) do
    Gauge.set([name: :kafka_consumer_lag, labels: [topic, partition, consumer_group]], lag)
  end
end
```

### Grafana Dashboard Queries

```promql
# Messages produced per second
rate(kafka_messages_produced_total[5m])

# Consumer lag by topic
kafka_consumer_lag{consumer_group="message-service-group"}

# P99 produce latency
histogram_quantile(0.99, rate(kafka_produce_latency_seconds_bucket[5m]))

# Error rate
rate(kafka_messages_produced_total{status="error"}[5m]) /
rate(kafka_messages_produced_total[5m])
```

## Environment Variables

```bash
# Kafka Connection
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
KAFKA_USERNAME=message-service
KAFKA_PASSWORD=secret
KAFKA_SSL_ENABLED=true

# Schema Registry
SCHEMA_REGISTRY_URL=http://schema-registry:8081

# Consumer Configuration
KAFKA_CONSUMER_GROUP=message-service-group
KAFKA_AUTO_OFFSET_RESET=earliest
KAFKA_MAX_POLL_RECORDS=500

# Producer Configuration
KAFKA_ACKS=all
KAFKA_COMPRESSION=snappy
KAFKA_BATCH_SIZE=16384
KAFKA_LINGER_MS=5
```

## Health Check

```http
GET /health
```

```json
{
  "status": "healthy",
  "kafka": {
    "connected": true,
    "brokers": 3,
    "consumer_lag": {
      "messages.created": 12,
      "users.updated": 0
    }
  },
  "mongodb": "connected",
  "version": "1.0.0"
}
```
