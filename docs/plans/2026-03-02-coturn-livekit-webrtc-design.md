# CoTURN + LiveKit WebRTC Infrastructure Design

## Context

The `infrastructure/coturn/` and `infrastructure/livekit/` directories each have a single basic config file — `turnserver.conf` and `livekit.yaml` — suitable only for local dev. They lack environment-specific overrides, TLS, production secrets management, Docker images, recording/egress support, and validation scripts. This design expands both into production-ready WebRTC infrastructure for calls and huddles.

## Existing State

- **CoTURN** (`coturn/turnserver.conf`): Basic TURN relay, hardcoded dev secret, ports 3478/5349, no TLS certs, no Redis session store
- **LiveKit** (`livekit/livekit.yaml`): Basic SFU config, dev API key, ports 7880-7882 + 50000-60000 UDP, Redis db 7, 50 max participants, built-in TURN
- **Call-service** (Elixir, port 4002): Manages call lifecycle, creates LiveKit rooms via API, generates join tokens
- **Huddle-service** (Elixir, port 4005): Group audio rooms, uses LiveKit for media
- **Prometheus**: Already scrapes LiveKit on 7880
- **Postgres**: `livekit_room` column in calls table
- **Docker Compose**: No entries for CoTURN or LiveKit yet

## Decisions

- **Small-medium scale**: Up to ~500 concurrent calls, ~50 huddle rooms. Single LiveKit instance per environment with horizontal scaling ready
- **CoTURN for NAT traversal**: Dedicated TURN relay (not LiveKit's built-in) for production reliability
- **4 environments**: dev, staging, production, live — matching existing infrastructure patterns
- **Egress for huddles**: S3-based recording for huddle sessions (compliance/review)
- **Redis separation**: CoTURN on db 8, LiveKit on db 7 (existing)

## Architecture

```
Client (browser/mobile)
    |
    +--- Signaling ----> call-service:4002 (Elixir)
    |                       |
    |                       v
    |                  LiveKit API
    |                  (create room, generate token)
    |
    +--- Media (UDP) ----> LiveKit SFU :7882
    |                       |
    |                       +-- Direct (same network) --> peer
    |                       +-- NAT traversal needed --> CoTURN :3478/:5349
    |
    +--- TURN relay ----> CoTURN :3478 (UDP) / :5349 (TLS)
                            |
                            +-- Relay --> LiveKit SFU
```

## CoTURN Configuration

### Base Config (enhanced turnserver.conf)

| Setting | Value |
|---------|-------|
| Listening ports | 3478 (UDP/TCP), 5349 (TLS) |
| Relay port range | 49152-65535 |
| Auth | Long-term credentials via shared secret |
| Realm | `${TURN_REALM}` |
| Redis session store | `${REDIS_URL}` db 8 |
| Prometheus metrics | `:9641/metrics` |
| Denied peer IPs | 0.0.0.0-0.255.255.255, loopback, link-local |

### Environment Overrides

| Setting | Dev | Staging | Production | Live |
|---------|-----|---------|------------|------|
| Auth secret | Hardcoded dev | `${TURN_AUTH_SECRET}` | `${TURN_AUTH_SECRET}` | `${TURN_AUTH_SECRET}` |
| TLS | Disabled | Enabled | Enabled | Enabled |
| Realm | `quckapp.local` | `turn.staging.quckapp.com` | `turn.quckapp.com` | `turn.quckapp.com` |
| Relay IP | Auto-detect | `${TURN_EXTERNAL_IP}` | `${TURN_EXTERNAL_IP}` | `${TURN_EXTERNAL_IP}` |
| Total quota | 100 | 300 | 500 | 500 |
| Max BPS per session | Unlimited | 50 Mbps | 50 Mbps | 100 Mbps |
| Verbose logging | Yes | Yes | No | No |

## LiveKit Configuration

### Base Config (enhanced livekit.yaml)

| Setting | Value |
|---------|-------|
| HTTP port | 7880 |
| RTC TCP port | 7881 |
| RTC UDP port | 7882 |
| UDP port range | 50000-60000 |
| Redis | `${REDIS_URL}` db 7 |
| Max participants/room | `${MAX_PARTICIPANTS}` |
| Room empty timeout | 300s |
| Logging | JSON format |

### TURN Integration

| Setting | Value |
|---------|-------|
| TURN enabled | true |
| TURN domain | `${TURN_DOMAIN}` |
| TURN UDP port | 3478 |
| TURN TLS port | 5349 |
| External TLS | true (production), false (dev) |

### Webhooks (Production)

| Event | Target | Purpose |
|-------|--------|---------|
| room_started | call-service:4002 | Track active rooms |
| room_finished | call-service:4002 | Cleanup, update call records |
| participant_joined | call-service:4002 | Update participant count |
| participant_left | call-service:4002 | Update participant count |

### Egress (Recording)

| Setting | Value |
|---------|-------|
| Enabled | Staging + Production + Live |
| Storage | S3 bucket `${EGRESS_S3_BUCKET}` |
| Format | MP4 (video), OGG (audio-only) |
| Max duration | 4 hours |

### Environment Overrides

| Setting | Dev | Staging | Production | Live |
|---------|-----|---------|------------|------|
| API keys | Hardcoded dev | `${LIVEKIT_API_KEY}` | `${LIVEKIT_API_KEY}` | `${LIVEKIT_API_KEY}` |
| TLS | Disabled | Enabled | Enabled | Enabled |
| Max participants/room | 50 | 75 | 100 | 100 |
| Max rooms | Unlimited | 200 | 500 | 500 |
| Egress | Disabled | Enabled | Enabled | Enabled |
| Webhooks | Disabled | Enabled | Enabled | Enabled |
| Log level | debug | info | warn | warn |
| TURN external TLS | false | true | true | true |

## Directory Structure

```
coturn/
+-- turnserver.conf              # (enhanced) Base config with placeholders
+-- environments/
|   +-- dev.conf                 # Dev: localhost, no TLS, verbose
|   +-- staging.conf             # Staging: TLS, real certs
|   +-- production.conf          # Production: strict limits, metrics
|   +-- live.conf                # Live: max security
+-- tls/
|   +-- tls-config.md            # Certificate setup guide
+-- docker/
|   +-- Dockerfile               # CoTURN container image
+-- scripts/
    +-- validate-config.sh       # Config validation

livekit/
+-- livekit.yaml                 # (enhanced) Base config with placeholders
+-- environments/
|   +-- dev.yaml                 # Dev: no TLS, debug, no webhooks
|   +-- staging.yaml             # Staging: TLS, webhooks, egress
|   +-- production.yaml          # Production: strict limits, recording
|   +-- live.yaml                # Live: max participants, redundancy
+-- egress/
|   +-- egress-config.yaml       # Recording/streaming to S3
+-- docker/
|   +-- Dockerfile               # LiveKit container image
+-- scripts/
    +-- validate-configs.sh      # YAML validation

```

## File Count

~16 files total (8 per component), enhancing the existing 2 base configs.
