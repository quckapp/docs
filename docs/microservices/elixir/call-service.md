---
sidebar_position: 2
---

# Call Service

Elixir/Phoenix service for voice and video call management with WebRTC signaling, TURN/STUN server integration, and SFU-based group calls.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 4002 |
| **Database** | MongoDB |
| **Framework** | Phoenix 1.7 |
| **Language** | Elixir 1.15 |
| **Media Server** | Janus/mediasoup |
| **TURN/STUN** | coturn |

## Features

- WebRTC signaling (offer/answer/ICE)
- 1:1 voice and video calls
- Group calls with SFU architecture
- Screen sharing and application sharing
- Call recording with cloud storage
- Real-time call quality metrics
- TURN/STUN server integration
- Bandwidth adaptation
- Noise cancellation support
- Virtual backgrounds

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Web Client    │────▶│  Call Service   │────▶│   Media Server  │
│   (WebRTC)      │     │   (Signaling)   │     │   (Janus/SFU)   │
└────────┬────────┘     └────────┬────────┘     └────────┬────────┘
         │                       │                       │
         │              ┌────────▼────────┐              │
         │              │    MongoDB      │              │
         │              │  (Call State)   │              │
         │              └─────────────────┘              │
         │                                               │
         │              ┌─────────────────┐              │
         └─────────────▶│   TURN/STUN     │◀─────────────┘
                        │    (coturn)     │
                        └─────────────────┘
```

## WebRTC Configuration

### STUN/TURN Server Configuration

```elixir
# config/config.exs
config :call_service, :ice_servers,
  stun: [
    %{urls: "stun:stun.quckapp.com:3478"},
    %{urls: "stun:stun.l.google.com:19302"}
  ],
  turn: [
    %{
      urls: "turn:turn.quckapp.com:3478",
      username: System.get_env("TURN_USERNAME"),
      credential: System.get_env("TURN_PASSWORD")
    },
    %{
      urls: "turn:turn.quckapp.com:443?transport=tcp",
      username: System.get_env("TURN_USERNAME"),
      credential: System.get_env("TURN_PASSWORD")
    },
    %{
      urls: "turns:turn.quckapp.com:443",
      username: System.get_env("TURN_USERNAME"),
      credential: System.get_env("TURN_PASSWORD")
    }
  ],
  # Time-limited credentials (more secure)
  credential_ttl: 86400  # 24 hours

# Media server configuration
config :call_service, :media_server,
  type: :janus,  # or :mediasoup
  url: System.get_env("MEDIA_SERVER_URL", "ws://janus:8188"),
  admin_secret: System.get_env("JANUS_ADMIN_SECRET"),
  api_secret: System.get_env("JANUS_API_SECRET")
```

### ICE Server Credentials Generator

```elixir
defmodule CallService.ICE.CredentialGenerator do
  @moduledoc """
  Generate time-limited TURN credentials using HMAC-SHA1.
  """

  @turn_secret System.get_env("TURN_SECRET")

  @doc """
  Generate TURN credentials for a user with TTL.
  """
  def generate_credentials(user_id, ttl \\ 86400) do
    timestamp = System.system_time(:second) + ttl
    username = "#{timestamp}:#{user_id}"

    credential = :crypto.mac(:hmac, :sha, @turn_secret, username)
    |> Base.encode64()

    %{
      username: username,
      credential: credential,
      ttl: ttl
    }
  end

  @doc """
  Get complete ICE server configuration for a user.
  """
  def get_ice_servers(user_id) do
    config = Application.get_env(:call_service, :ice_servers)
    turn_creds = generate_credentials(user_id)

    stun_servers = config[:stun]
    turn_servers = Enum.map(config[:turn], fn server ->
      Map.merge(server, %{
        username: turn_creds.username,
        credential: turn_creds.credential
      })
    end)

    %{
      ice_servers: stun_servers ++ turn_servers,
      ice_transport_policy: "all",  # or "relay" to force TURN
      ttl: turn_creds.ttl
    }
  end
end
```

## WebRTC Signaling

### Signaling Channel

```elixir
defmodule CallWeb.CallChannel do
  use CallWeb, :channel

  alias CallService.{CallManager, ICE.CredentialGenerator}

  @call_timeout 30_000  # 30 seconds

  def join("call:" <> call_id, params, socket) do
    case CallManager.join_call(call_id, socket.assigns.user_id) do
      {:ok, call} ->
        send(self(), {:after_join, call})
        {:ok, assign(socket, :call_id, call_id)}

      {:error, reason} ->
        {:error, %{reason: reason}}
    end
  end

  def handle_info({:after_join, call}, socket) do
    # Send ICE servers configuration
    ice_config = CredentialGenerator.get_ice_servers(socket.assigns.user_id)
    push(socket, "ice_servers", ice_config)

    # Send current call state
    push(socket, "call_state", %{
      call_id: call.id,
      participants: call.participants,
      state: call.state,
      type: call.type
    })

    {:noreply, socket}
  end

  # Initiate a new call
  def handle_in("call:initiate", %{"to_user_id" => to_user_id, "type" => type}, socket) do
    call_params = %{
      from_user_id: socket.assigns.user_id,
      to_user_id: to_user_id,
      type: type,  # "audio" or "video"
      workspace_id: socket.assigns.workspace_id
    }

    case CallManager.initiate_call(call_params) do
      {:ok, call} ->
        # Notify the recipient
        CallWeb.Endpoint.broadcast("user:#{to_user_id}", "incoming_call", %{
          call_id: call.id,
          from_user_id: socket.assigns.user_id,
          type: type
        })

        {:reply, {:ok, %{call_id: call.id}}, assign(socket, :call_id, call.id)}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # Accept incoming call
  def handle_in("call:accept", _params, socket) do
    case CallManager.accept_call(socket.assigns.call_id, socket.assigns.user_id) do
      {:ok, call} ->
        broadcast!(socket, "call:accepted", %{
          call_id: call.id,
          accepted_by: socket.assigns.user_id
        })
        {:reply, :ok, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # Reject incoming call
  def handle_in("call:reject", %{"reason" => reason}, socket) do
    CallManager.reject_call(socket.assigns.call_id, socket.assigns.user_id, reason)
    broadcast!(socket, "call:rejected", %{
      call_id: socket.assigns.call_id,
      rejected_by: socket.assigns.user_id,
      reason: reason
    })
    {:reply, :ok, socket}
  end

  # End current call
  def handle_in("call:end", _params, socket) do
    CallManager.end_call(socket.assigns.call_id, socket.assigns.user_id)
    broadcast!(socket, "call:ended", %{
      call_id: socket.assigns.call_id,
      ended_by: socket.assigns.user_id
    })
    {:reply, :ok, socket}
  end

  # WebRTC SDP Offer
  def handle_in("webrtc:offer", %{"sdp" => sdp, "to_user_id" => to_user_id}, socket) do
    # Validate SDP
    case validate_sdp(sdp) do
      :ok ->
        # Forward offer to the recipient
        CallWeb.Endpoint.broadcast("user:#{to_user_id}", "webrtc:offer", %{
          call_id: socket.assigns.call_id,
          from_user_id: socket.assigns.user_id,
          sdp: sdp
        })

        # Log for debugging
        CallService.Metrics.record_sdp_exchange(:offer)
        {:noreply, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # WebRTC SDP Answer
  def handle_in("webrtc:answer", %{"sdp" => sdp, "to_user_id" => to_user_id}, socket) do
    case validate_sdp(sdp) do
      :ok ->
        CallWeb.Endpoint.broadcast("user:#{to_user_id}", "webrtc:answer", %{
          call_id: socket.assigns.call_id,
          from_user_id: socket.assigns.user_id,
          sdp: sdp
        })

        CallService.Metrics.record_sdp_exchange(:answer)
        {:noreply, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # WebRTC ICE Candidate
  def handle_in("webrtc:ice_candidate", %{"candidate" => candidate, "to_user_id" => to_user_id}, socket) do
    CallWeb.Endpoint.broadcast("user:#{to_user_id}", "webrtc:ice_candidate", %{
      call_id: socket.assigns.call_id,
      from_user_id: socket.assigns.user_id,
      candidate: candidate
    })

    CallService.Metrics.record_ice_candidate()
    {:noreply, socket}
  end

  # Toggle media tracks
  def handle_in("media:toggle", %{"type" => type, "enabled" => enabled}, socket) do
    CallManager.update_participant_media(
      socket.assigns.call_id,
      socket.assigns.user_id,
      type,
      enabled
    )

    broadcast!(socket, "media:toggled", %{
      user_id: socket.assigns.user_id,
      type: type,
      enabled: enabled
    })

    {:noreply, socket}
  end

  # Start screen sharing
  def handle_in("screen:start", %{"sdp" => sdp}, socket) do
    CallManager.start_screen_share(socket.assigns.call_id, socket.assigns.user_id)

    broadcast!(socket, "screen:started", %{
      user_id: socket.assigns.user_id,
      sdp: sdp
    })

    {:noreply, socket}
  end

  # Stop screen sharing
  def handle_in("screen:stop", _params, socket) do
    CallManager.stop_screen_share(socket.assigns.call_id, socket.assigns.user_id)

    broadcast!(socket, "screen:stopped", %{
      user_id: socket.assigns.user_id
    })

    {:noreply, socket}
  end

  # Report call quality metrics
  def handle_in("quality:report", metrics, socket) do
    CallService.Quality.record_metrics(
      socket.assigns.call_id,
      socket.assigns.user_id,
      metrics
    )

    {:noreply, socket}
  end

  defp validate_sdp(%{"type" => type, "sdp" => sdp}) when type in ["offer", "answer"] do
    if String.contains?(sdp, "v=0") and String.contains?(sdp, "o=") do
      :ok
    else
      {:error, "Invalid SDP format"}
    end
  end

  defp validate_sdp(_), do: {:error, "Invalid SDP structure"}

  def terminate(_reason, socket) do
    if socket.assigns[:call_id] do
      CallManager.participant_disconnected(
        socket.assigns.call_id,
        socket.assigns.user_id
      )
    end
    :ok
  end
end
```

### Call Manager

```elixir
defmodule CallService.CallManager do
  @moduledoc """
  Manages call lifecycle and state.
  """

  use GenServer

  alias CallService.{Call, Repo, MediaServer}

  def start_link(opts) do
    GenServer.start_link(__MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Initiate a new call.
  """
  def initiate_call(params) do
    call = %Call{
      id: generate_call_id(),
      from_user_id: params.from_user_id,
      participants: [
        %{user_id: params.from_user_id, joined_at: DateTime.utc_now(), media: %{audio: true, video: params.type == "video"}}
      ],
      type: params.type,
      state: :ringing,
      workspace_id: params.workspace_id,
      started_at: DateTime.utc_now()
    }

    case Repo.insert(call) do
      {:ok, call} ->
        # Start call timeout
        Process.send_after(self(), {:call_timeout, call.id}, 30_000)
        {:ok, call}

      error ->
        error
    end
  end

  @doc """
  Accept an incoming call.
  """
  def accept_call(call_id, user_id) do
    with {:ok, call} <- get_call(call_id),
         :ok <- validate_can_accept(call, user_id) do

      participant = %{
        user_id: user_id,
        joined_at: DateTime.utc_now(),
        media: %{audio: true, video: call.type == "video"}
      }

      updated_call = call
      |> Map.update!(:participants, &[participant | &1])
      |> Map.put(:state, :connected)
      |> Map.put(:connected_at, DateTime.utc_now())

      Repo.update(updated_call)
    end
  end

  @doc """
  End a call.
  """
  def end_call(call_id, user_id) do
    with {:ok, call} <- get_call(call_id) do
      updated_call = call
      |> Map.put(:state, :ended)
      |> Map.put(:ended_at, DateTime.utc_now())
      |> Map.put(:ended_by, user_id)
      |> calculate_duration()

      # Stop media server session
      MediaServer.stop_session(call_id)

      # Stop recording if active
      if call.recording_active do
        CallService.Recording.stop(call_id)
      end

      Repo.update(updated_call)
    end
  end

  defp calculate_duration(call) do
    if call.connected_at do
      duration = DateTime.diff(call.ended_at, call.connected_at, :second)
      Map.put(call, :duration_seconds, duration)
    else
      Map.put(call, :duration_seconds, 0)
    end
  end

  defp generate_call_id do
    "call_" <> (:crypto.strong_rand_bytes(16) |> Base.encode16(case: :lower))
  end
end
```

## Group Calls (SFU)

### SFU Integration

```elixir
defmodule CallService.SFU do
  @moduledoc """
  Selective Forwarding Unit integration for group calls.
  Supports Janus and mediasoup backends.
  """

  @behaviour CallService.MediaServer

  alias CallService.SFU.{Janus, Mediasoup}

  def create_room(call_id, opts \\ []) do
    backend = Application.get_env(:call_service, :media_server)[:type]

    case backend do
      :janus -> Janus.create_room(call_id, opts)
      :mediasoup -> Mediasoup.create_room(call_id, opts)
    end
  end

  def join_room(call_id, user_id, opts \\ []) do
    backend = Application.get_env(:call_service, :media_server)[:type]

    case backend do
      :janus -> Janus.join_room(call_id, user_id, opts)
      :mediasoup -> Mediasoup.join_room(call_id, user_id, opts)
    end
  end

  def publish_stream(call_id, user_id, sdp) do
    backend = Application.get_env(:call_service, :media_server)[:type]

    case backend do
      :janus -> Janus.publish(call_id, user_id, sdp)
      :mediasoup -> Mediasoup.produce(call_id, user_id, sdp)
    end
  end

  def subscribe_stream(call_id, user_id, publisher_id) do
    backend = Application.get_env(:call_service, :media_server)[:type]

    case backend do
      :janus -> Janus.subscribe(call_id, user_id, publisher_id)
      :mediasoup -> Mediasoup.consume(call_id, user_id, publisher_id)
    end
  end
end
```

### Janus Gateway Integration

```elixir
defmodule CallService.SFU.Janus do
  @moduledoc """
  Janus WebRTC Gateway integration.
  """

  use WebSockex
  require Logger

  @janus_url Application.get_env(:call_service, :media_server)[:url]
  @api_secret Application.get_env(:call_service, :media_server)[:api_secret]

  def start_link(opts) do
    WebSockex.start_link(@janus_url, __MODULE__, opts, name: __MODULE__)
  end

  @doc """
  Create a video room for group calls.
  """
  def create_room(call_id, opts \\ []) do
    request = %{
      janus: "message",
      body: %{
        request: "create",
        room: call_id_to_room(call_id),
        description: "QuckApp Call #{call_id}",
        publishers: Keyword.get(opts, :max_participants, 50),
        bitrate: Keyword.get(opts, :bitrate, 512000),
        fir_freq: 10,
        audiocodec: "opus",
        videocodec: "vp8,h264",
        record: Keyword.get(opts, :record, false),
        rec_dir: "/recordings/#{call_id}"
      },
      transaction: generate_transaction_id()
    }

    send_request(request)
  end

  @doc """
  Join a video room as a publisher.
  """
  def join_room(call_id, user_id, opts \\ []) do
    request = %{
      janus: "message",
      body: %{
        request: "join",
        room: call_id_to_room(call_id),
        ptype: "publisher",
        display: user_id,
        id: user_id_to_feed(user_id)
      },
      transaction: generate_transaction_id()
    }

    send_request(request)
  end

  @doc """
  Publish media to the room.
  """
  def publish(call_id, user_id, sdp) do
    request = %{
      janus: "message",
      body: %{
        request: "configure",
        audio: true,
        video: true
      },
      jsep: %{
        type: "offer",
        sdp: sdp
      },
      transaction: generate_transaction_id()
    }

    send_request(request)
  end

  @doc """
  Subscribe to another participant's stream.
  """
  def subscribe(call_id, user_id, publisher_id) do
    request = %{
      janus: "message",
      body: %{
        request: "join",
        room: call_id_to_room(call_id),
        ptype: "subscriber",
        feed: user_id_to_feed(publisher_id)
      },
      transaction: generate_transaction_id()
    }

    send_request(request)
  end

  defp call_id_to_room(call_id) do
    :erlang.phash2(call_id, 2_147_483_647)
  end

  defp user_id_to_feed(user_id) do
    :erlang.phash2(user_id, 2_147_483_647)
  end

  defp generate_transaction_id do
    :crypto.strong_rand_bytes(12) |> Base.encode16(case: :lower)
  end

  defp send_request(request) do
    WebSockex.send_frame(__MODULE__, {:text, Jason.encode!(request)})
  end
end
```

### Group Call Channel

```elixir
defmodule CallWeb.GroupCallChannel do
  use CallWeb, :channel

  alias CallService.{SFU, CallManager}

  @max_participants 50

  def join("group_call:" <> call_id, params, socket) do
    with {:ok, call} <- CallManager.get_call(call_id),
         :ok <- validate_can_join(call),
         {:ok, room_info} <- SFU.join_room(call_id, socket.assigns.user_id) do

      send(self(), {:after_join, call, room_info})
      {:ok, assign(socket, call_id: call_id, room_info: room_info)}
    else
      {:error, reason} -> {:error, %{reason: reason}}
    end
  end

  def handle_info({:after_join, call, room_info}, socket) do
    # Send room info and existing publishers
    push(socket, "room_joined", %{
      call_id: call.id,
      publishers: room_info.publishers,
      ice_servers: CallService.ICE.CredentialGenerator.get_ice_servers(socket.assigns.user_id)
    })

    # Notify others
    broadcast!(socket, "participant_joined", %{
      user_id: socket.assigns.user_id
    })

    {:noreply, socket}
  end

  # Publish local media
  def handle_in("publish", %{"sdp" => sdp}, socket) do
    case SFU.publish_stream(socket.assigns.call_id, socket.assigns.user_id, sdp) do
      {:ok, answer_sdp} ->
        {:reply, {:ok, %{sdp: answer_sdp}}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # Subscribe to a publisher
  def handle_in("subscribe", %{"publisher_id" => publisher_id}, socket) do
    case SFU.subscribe_stream(socket.assigns.call_id, socket.assigns.user_id, publisher_id) do
      {:ok, offer_sdp} ->
        {:reply, {:ok, %{sdp: offer_sdp, publisher_id: publisher_id}}, socket}

      {:error, reason} ->
        {:reply, {:error, %{reason: reason}}, socket}
    end
  end

  # Handle subscription answer
  def handle_in("subscribe_answer", %{"publisher_id" => publisher_id, "sdp" => sdp}, socket) do
    SFU.complete_subscription(socket.assigns.call_id, socket.assigns.user_id, publisher_id, sdp)
    {:noreply, socket}
  end

  defp validate_can_join(call) do
    if length(call.participants) < @max_participants do
      :ok
    else
      {:error, "Room is full"}
    end
  end
end
```

## Screen Sharing

```elixir
defmodule CallService.ScreenShare do
  @moduledoc """
  Screen sharing management with quality adaptation.
  """

  @doc """
  Start screen sharing session.
  """
  def start(call_id, user_id, opts \\ []) do
    constraints = %{
      video: %{
        cursor: Keyword.get(opts, :cursor, "always"),
        displaySurface: Keyword.get(opts, :surface, "monitor"),  # or "window", "browser"
        logicalSurface: true,
        frameRate: %{ideal: 15, max: 30},
        width: %{ideal: 1920, max: 2560},
        height: %{ideal: 1080, max: 1440}
      },
      audio: Keyword.get(opts, :system_audio, false)
    }

    # Store screen share state
    CallService.Redis.command([
      "HSET", "call:#{call_id}:screen_share",
      "user_id", user_id,
      "started_at", DateTime.utc_now() |> DateTime.to_iso8601(),
      "constraints", Jason.encode!(constraints)
    ])

    {:ok, constraints}
  end

  @doc """
  Stop screen sharing session.
  """
  def stop(call_id, user_id) do
    CallService.Redis.command(["DEL", "call:#{call_id}:screen_share"])
    :ok
  end

  @doc """
  Get current screen share info.
  """
  def get_active(call_id) do
    case CallService.Redis.command(["HGETALL", "call:#{call_id}:screen_share"]) do
      {:ok, []} -> nil
      {:ok, data} -> parse_screen_share(data)
    end
  end

  defp parse_screen_share(data) do
    data
    |> Enum.chunk_every(2)
    |> Enum.into(%{}, fn [k, v] -> {k, v} end)
  end
end
```

## Call Recording

```elixir
defmodule CallService.Recording do
  @moduledoc """
  Call recording with cloud storage integration.
  """

  @recording_bucket System.get_env("RECORDING_BUCKET", "quckapp-recordings")

  @doc """
  Start recording a call.
  """
  def start(call_id, opts \\ []) do
    recording = %{
      id: generate_recording_id(),
      call_id: call_id,
      started_at: DateTime.utc_now(),
      format: Keyword.get(opts, :format, "webm"),
      quality: Keyword.get(opts, :quality, "720p"),
      status: :recording
    }

    # Tell media server to start recording
    CallService.SFU.start_recording(call_id, recording.id)

    # Store recording metadata
    CallService.Repo.insert(recording)
  end

  @doc """
  Stop recording and upload to cloud storage.
  """
  def stop(call_id) do
    with {:ok, recording} <- get_active_recording(call_id),
         :ok <- CallService.SFU.stop_recording(call_id),
         {:ok, file_path} <- get_recording_file(call_id, recording.id),
         {:ok, cloud_url} <- upload_to_cloud(file_path, recording) do

      updated_recording = recording
      |> Map.put(:status, :completed)
      |> Map.put(:ended_at, DateTime.utc_now())
      |> Map.put(:file_url, cloud_url)
      |> Map.put(:duration_seconds, calculate_duration(recording))

      CallService.Repo.update(updated_recording)
    end
  end

  defp upload_to_cloud(file_path, recording) do
    key = "recordings/#{recording.call_id}/#{recording.id}.#{recording.format}"

    ExAws.S3.put_object(@recording_bucket, key, File.read!(file_path))
    |> ExAws.request()
    |> case do
      {:ok, _} -> {:ok, "https://#{@recording_bucket}.s3.amazonaws.com/#{key}"}
      error -> error
    end
  end

  defp generate_recording_id do
    "rec_" <> (:crypto.strong_rand_bytes(12) |> Base.encode16(case: :lower))
  end
end
```

## Call Quality Metrics

```elixir
defmodule CallService.Quality do
  @moduledoc """
  Real-time call quality monitoring and adaptation.
  """

  alias CallService.Redis

  @quality_ttl 3600  # 1 hour

  @doc """
  Record quality metrics from client.
  """
  def record_metrics(call_id, user_id, metrics) do
    timestamp = System.system_time(:millisecond)
    key = "call:#{call_id}:quality:#{user_id}"

    data = %{
      timestamp: timestamp,
      audio: %{
        packets_lost: metrics["audio"]["packetsLost"],
        packets_sent: metrics["audio"]["packetsSent"],
        jitter: metrics["audio"]["jitter"],
        round_trip_time: metrics["audio"]["roundTripTime"],
        codec: metrics["audio"]["codec"]
      },
      video: %{
        packets_lost: metrics["video"]["packetsLost"],
        packets_sent: metrics["video"]["packetsSent"],
        frames_sent: metrics["video"]["framesSent"],
        frames_dropped: metrics["video"]["framesDropped"],
        frame_rate: metrics["video"]["framesPerSecond"],
        resolution: "#{metrics["video"]["frameWidth"]}x#{metrics["video"]["frameHeight"]}",
        codec: metrics["video"]["codec"],
        bitrate: metrics["video"]["bitrate"]
      },
      connection: %{
        ice_state: metrics["iceConnectionState"],
        connection_state: metrics["connectionState"],
        selected_candidate_pair: metrics["selectedCandidatePair"]
      }
    }

    # Store in Redis sorted set (score = timestamp)
    Redis.command([
      "ZADD", key, timestamp, Jason.encode!(data)
    ])

    Redis.command(["EXPIRE", key, @quality_ttl])

    # Check for quality issues and trigger adaptation
    check_quality_issues(call_id, user_id, data)
  end

  @doc """
  Get quality metrics for a call.
  """
  def get_metrics(call_id, user_id, opts \\ []) do
    limit = Keyword.get(opts, :limit, 100)
    key = "call:#{call_id}:quality:#{user_id}"

    case Redis.command(["ZRANGE", key, "-#{limit}", "-1", "WITHSCORES"]) do
      {:ok, data} -> parse_metrics(data)
      error -> error
    end
  end

  @doc """
  Calculate call quality score (MOS-like).
  """
  def calculate_quality_score(metrics) do
    audio_score = calculate_audio_score(metrics.audio)
    video_score = calculate_video_score(metrics.video)

    # Weighted average
    (audio_score * 0.4 + video_score * 0.6)
    |> Float.round(2)
  end

  defp calculate_audio_score(audio) do
    packet_loss_rate = audio.packets_lost / max(audio.packets_sent, 1)
    jitter_score = max(0, 5 - audio.jitter / 50)
    rtt_score = max(0, 5 - audio.round_trip_time / 200)
    loss_score = max(0, 5 - packet_loss_rate * 100)

    (jitter_score + rtt_score + loss_score) / 3
  end

  defp calculate_video_score(video) do
    frame_drop_rate = video.frames_dropped / max(video.frames_sent, 1)
    fps_score = min(video.frame_rate / 30, 1) * 5
    loss_score = max(0, 5 - frame_drop_rate * 100)

    (fps_score + loss_score) / 2
  end

  defp check_quality_issues(call_id, user_id, data) do
    issues = []

    # Check packet loss
    if data.audio.packets_lost > 0 do
      loss_rate = data.audio.packets_lost / max(data.audio.packets_sent, 1)
      if loss_rate > 0.05 do
        issues = [{:high_packet_loss, loss_rate} | issues]
      end
    end

    # Check jitter
    if data.audio.jitter > 50 do
      issues = [{:high_jitter, data.audio.jitter} | issues]
    end

    # Check frame rate
    if data.video.frame_rate < 15 do
      issues = [{:low_frame_rate, data.video.frame_rate} | issues]
    end

    # Trigger adaptation if needed
    if length(issues) > 0 do
      trigger_quality_adaptation(call_id, user_id, issues)
    end
  end

  defp trigger_quality_adaptation(call_id, user_id, issues) do
    # Notify client to reduce quality
    CallWeb.Endpoint.broadcast("call:#{call_id}", "quality:adapt", %{
      user_id: user_id,
      issues: issues,
      recommendation: determine_recommendation(issues)
    })
  end

  defp determine_recommendation(issues) do
    cond do
      Enum.any?(issues, fn {type, _} -> type == :high_packet_loss end) ->
        %{action: "reduce_bitrate", target_bitrate: 256000}

      Enum.any?(issues, fn {type, _} -> type == :low_frame_rate end) ->
        %{action: "reduce_resolution", target_height: 480}

      true ->
        %{action: "monitor"}
    end
  end
end
```

## TURN/STUN Server Configuration

### coturn Docker Compose

```yaml
version: '3.8'

services:
  coturn:
    image: coturn/coturn:latest
    network_mode: host
    volumes:
      - ./turnserver.conf:/etc/coturn/turnserver.conf
      - ./certs:/etc/coturn/certs
    environment:
      - TURN_USERNAME=${TURN_USERNAME}
      - TURN_PASSWORD=${TURN_PASSWORD}
    restart: unless-stopped
```

### turnserver.conf

```conf
# Network
listening-port=3478
tls-listening-port=5349
alt-listening-port=3479

# External IP (replace with your server IP)
external-ip=YOUR_SERVER_IP

# Realm
realm=quckapp.com

# Authentication
lt-cred-mech
use-auth-secret
static-auth-secret=YOUR_TURN_SECRET

# TLS
cert=/etc/coturn/certs/turn.crt
pkey=/etc/coturn/certs/turn.key

# Logging
log-file=/var/log/coturn/turnserver.log
verbose

# Performance
total-quota=100
bps-capacity=0
stale-nonce=600

# Security
no-multicast-peers
denied-peer-ip=10.0.0.0-10.255.255.255
denied-peer-ip=192.168.0.0-192.168.255.255
denied-peer-ip=172.16.0.0-172.31.255.255

# Ports
min-port=49152
max-port=65535
```

## Client-Side WebRTC Implementation

### JavaScript Client Example

```javascript
class QuckAppCall {
  constructor(callService, userId) {
    this.callService = callService;
    this.userId = userId;
    this.peerConnection = null;
    this.localStream = null;
    this.remoteStream = null;
  }

  async initialize(iceServers) {
    const config = {
      iceServers: iceServers,
      iceTransportPolicy: 'all',
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
      sdpSemantics: 'unified-plan'
    };

    this.peerConnection = new RTCPeerConnection(config);

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.callService.sendIceCandidate(event.candidate);
      }
    };

    // Handle connection state changes
    this.peerConnection.onconnectionstatechange = () => {
      console.log('Connection state:', this.peerConnection.connectionState);
      this.onConnectionStateChange?.(this.peerConnection.connectionState);
    };

    // Handle ICE connection state changes
    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('ICE state:', this.peerConnection.iceConnectionState);
    };

    // Handle remote stream
    this.peerConnection.ontrack = (event) => {
      this.remoteStream = event.streams[0];
      this.onRemoteStream?.(this.remoteStream);
    };

    // Start quality monitoring
    this.startQualityMonitoring();
  }

  async startCall(isVideo = true) {
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: isVideo ? {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      } : false
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);

    this.localStream.getTracks().forEach(track => {
      this.peerConnection.addTrack(track, this.localStream);
    });

    return this.localStream;
  }

  async createOffer() {
    const offer = await this.peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });

    await this.peerConnection.setLocalDescription(offer);
    return offer;
  }

  async handleOffer(offer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    return answer;
  }

  async handleAnswer(answer) {
    await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
  }

  async addIceCandidate(candidate) {
    await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  }

  async startScreenShare() {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        cursor: 'always',
        displaySurface: 'monitor'
      },
      audio: false
    });

    const videoTrack = screenStream.getVideoTracks()[0];
    const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');

    if (sender) {
      await sender.replaceTrack(videoTrack);
    }

    videoTrack.onended = () => {
      this.stopScreenShare();
    };

    return screenStream;
  }

  async stopScreenShare() {
    const videoTrack = this.localStream.getVideoTracks()[0];
    const sender = this.peerConnection.getSenders().find(s => s.track?.kind === 'video');

    if (sender && videoTrack) {
      await sender.replaceTrack(videoTrack);
    }
  }

  startQualityMonitoring() {
    this.qualityInterval = setInterval(async () => {
      const stats = await this.peerConnection.getStats();
      const metrics = this.parseStats(stats);
      this.callService.reportQuality(metrics);
    }, 5000);
  }

  parseStats(stats) {
    const metrics = { audio: {}, video: {}, connection: {} };

    stats.forEach(report => {
      if (report.type === 'outbound-rtp' && report.kind === 'audio') {
        metrics.audio = {
          packetsSent: report.packetsSent,
          packetsLost: report.packetsLost || 0,
          codec: report.codecId
        };
      }

      if (report.type === 'outbound-rtp' && report.kind === 'video') {
        metrics.video = {
          packetsSent: report.packetsSent,
          packetsLost: report.packetsLost || 0,
          framesSent: report.framesSent,
          framesDropped: report.framesDropped || 0,
          framesPerSecond: report.framesPerSecond,
          frameWidth: report.frameWidth,
          frameHeight: report.frameHeight
        };
      }

      if (report.type === 'candidate-pair' && report.state === 'succeeded') {
        metrics.connection = {
          roundTripTime: report.currentRoundTripTime * 1000,
          availableOutgoingBitrate: report.availableOutgoingBitrate
        };
      }
    });

    return metrics;
  }

  endCall() {
    clearInterval(this.qualityInterval);

    this.localStream?.getTracks().forEach(track => track.stop());
    this.peerConnection?.close();

    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
  }
}
```

## API Endpoints

### Initiate Call

```http
POST /api/calls
Content-Type: application/json
Authorization: Bearer {token}

{
  "to_user_id": "user-456",
  "type": "video",
  "workspace_id": "ws-123"
}
```

### Get Call Info

```http
GET /api/calls/{callId}
Authorization: Bearer {token}
```

### End Call

```http
DELETE /api/calls/{callId}
Authorization: Bearer {token}
```

### Get Call History

```http
GET /api/calls?workspace_id={workspaceId}&limit=20&offset=0
Authorization: Bearer {token}
```

### Get Call Recording

```http
GET /api/calls/{callId}/recording
Authorization: Bearer {token}
```

## Environment Variables

```bash
# TURN/STUN
TURN_USERNAME=quckapp
TURN_PASSWORD=secure-password
TURN_SECRET=shared-secret-for-credentials
STUN_URL=stun:stun.quckapp.com:3478
TURN_URL=turn:turn.quckapp.com:3478

# Media Server (Janus)
MEDIA_SERVER_URL=ws://janus:8188
JANUS_API_SECRET=janus-api-secret
JANUS_ADMIN_SECRET=janus-admin-secret

# Recording
RECORDING_BUCKET=quckapp-recordings
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1

# Service
PORT=4002
SECRET_KEY_BASE=xxx
```

## Health Check

```http
GET /health
```

```json
{
  "status": "healthy",
  "media_server": {
    "connected": true,
    "active_rooms": 42,
    "total_participants": 156
  },
  "turn_server": {
    "connected": true,
    "active_allocations": 89
  },
  "active_calls": 42,
  "version": "1.0.0"
}
```
