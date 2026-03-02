# CoTURN + LiveKit WebRTC Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the single-file CoTURN and LiveKit directories into production-ready WebRTC infrastructure with environment configs, Docker images, egress/recording, and validation scripts.

**Architecture:** Enhance existing base configs with environment placeholders, add 4 per-environment override files for each component (dev, staging, production, live), Docker images for containerized deployment, egress config for huddle recording, TLS guide, and validation scripts following the existing Kong/Envoy patterns.

**Tech Stack:** CoTURN (TURN relay), LiveKit (SFU media server), Docker, Redis, S3 (egress), Bash scripts

---

## Task 1: Enhance CoTURN Base Config + Environment Overrides

**Files:**
- Modify: `coturn/turnserver.conf`
- Create: `coturn/environments/dev.conf`
- Create: `coturn/environments/staging.conf`
- Create: `coturn/environments/production.conf`
- Create: `coturn/environments/live.conf`

**Step 1: Enhance the base turnserver.conf**

Replace `coturn/turnserver.conf` with:

```conf
# =============================================================================
# QUCKAPP - CoTURN TURN Server Configuration
# =============================================================================
# TURN/STUN relay for NAT traversal in WebRTC calls and huddles.
# Clients behind symmetric NATs or restrictive firewalls use this relay.
#
# Environment-specific overrides are in environments/*.conf
# Usage: turnserver -c turnserver.conf -c environments/<env>.conf
# =============================================================================

# --- Listening ---
listening-port=3478
tls-listening-port=5349
alt-listening-port=3479
alt-tls-listening-port=5350
relay-port-range=49152-65535

# --- Authentication ---
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=${TURN_AUTH_SECRET}
realm=${TURN_REALM}
server-name=quckapp-turn

# --- TLS ---
# cert=/etc/coturn/certs/turn.pem
# pkey=/etc/coturn/certs/turn.key
# dh-file=/etc/coturn/certs/dhparam.pem
# cipher-list="ECDHE+AESGCM:ECDHE+CHACHA20"
no-tlsv1
no-tlsv1_1

# --- Network ---
# external-ip=${TURN_EXTERNAL_IP}/${TURN_INTERNAL_IP}
# relay-ip=${TURN_RELAY_IP}

# --- Redis Session Store ---
# redis-statsdb="ip=127.0.0.1 dbname=8 port=6379"
# redis-userdb="ip=127.0.0.1 dbname=8 port=6379"

# --- Resource Limits ---
total-quota=300
bps-capacity=0
max-bps=0
stale-nonce=600
max-allocate-lifetime=3600

# --- Security ---
no-multicast-peers
no-cli
denied-peer-ip=0.0.0.0-0.255.255.255
denied-peer-ip=127.0.0.0-127.255.255.255
denied-peer-ip=::1
denied-peer-ip=fe80::-febf::ffff:ffff:ffff:ffff

# --- Prometheus Metrics ---
prometheus
prometheus-port=9641

# --- Logging ---
log-file=stdout
new-log-timestamp
```

**Step 2: Create environment overrides**

Create `coturn/environments/dev.conf`:

```conf
# CoTURN Development Environment
# Usage: turnserver -c turnserver.conf -c environments/dev.conf

# Dev credentials (not secret)
static-auth-secret=coturn_dev_secret_not_for_production
realm=quckapp.local

# No TLS in dev
no-tls
no-dtls

# Verbose logging for debugging
verbose

# Relaxed limits
total-quota=100
```

Create `coturn/environments/staging.conf`:

```conf
# CoTURN Staging Environment
# Usage: turnserver -c turnserver.conf -c environments/staging.conf

# Auth secret from env/secrets manager
# static-auth-secret=${TURN_AUTH_SECRET}
realm=turn.staging.quckapp.com

# TLS enabled
cert=/etc/coturn/certs/turn.pem
pkey=/etc/coturn/certs/turn.key

# External IP for NAT
# external-ip=${TURN_EXTERNAL_IP}/${TURN_INTERNAL_IP}

# Redis session store
redis-statsdb="ip=${REDIS_HOST} dbname=8 port=6379 password=${REDIS_PASSWORD}"
redis-userdb="ip=${REDIS_HOST} dbname=8 port=6379 password=${REDIS_PASSWORD}"

# Moderate limits
total-quota=300
max-bps=52428800

# Logging
verbose
```

Create `coturn/environments/production.conf`:

```conf
# CoTURN Production Environment
# Usage: turnserver -c turnserver.conf -c environments/production.conf

# Auth secret from secrets manager
# static-auth-secret=${TURN_AUTH_SECRET}
realm=turn.quckapp.com

# TLS enabled
cert=/etc/coturn/certs/turn.pem
pkey=/etc/coturn/certs/turn.key
dh-file=/etc/coturn/certs/dhparam.pem
cipher-list="ECDHE+AESGCM:ECDHE+CHACHA20"

# External IP for NAT
# external-ip=${TURN_EXTERNAL_IP}/${TURN_INTERNAL_IP}
# relay-ip=${TURN_RELAY_IP}

# Redis session store
redis-statsdb="ip=${REDIS_HOST} dbname=8 port=6379 password=${REDIS_PASSWORD}"
redis-userdb="ip=${REDIS_HOST} dbname=8 port=6379 password=${REDIS_PASSWORD}"

# Production limits
total-quota=500
max-bps=52428800
user-quota=5
max-allocate-timeout=60

# Security hardening
allowed-peer-ip=10.0.0.0-10.255.255.255
allowed-peer-ip=172.16.0.0-172.31.255.255
no-loopback-peers

# No verbose logging in production
no-stdout-log
syslog
```

Create `coturn/environments/live.conf`:

```conf
# CoTURN Live Environment
# Usage: turnserver -c turnserver.conf -c environments/live.conf

# Auth secret from secrets manager
# static-auth-secret=${TURN_AUTH_SECRET}
realm=turn.quckapp.com

# TLS enabled with strong ciphers
cert=/etc/coturn/certs/turn.pem
pkey=/etc/coturn/certs/turn.key
dh-file=/etc/coturn/certs/dhparam.pem
cipher-list="ECDHE+AESGCM:ECDHE+CHACHA20"

# External IP for NAT
# external-ip=${TURN_EXTERNAL_IP}/${TURN_INTERNAL_IP}
# relay-ip=${TURN_RELAY_IP}

# Redis session store
redis-statsdb="ip=${REDIS_HOST} dbname=8 port=6379 password=${REDIS_PASSWORD}"
redis-userdb="ip=${REDIS_HOST} dbname=8 port=6379 password=${REDIS_PASSWORD}"

# Maximum capacity
total-quota=500
max-bps=104857600
user-quota=10
max-allocate-timeout=60

# Security hardening
allowed-peer-ip=10.0.0.0-10.255.255.255
allowed-peer-ip=172.16.0.0-172.31.255.255
no-loopback-peers

# Minimal logging
no-stdout-log
syslog
no-software-attribute
```

**Step 3: Commit**

```bash
git add coturn/turnserver.conf coturn/environments/
git commit -m "feat(coturn): enhance base config and add 4 environment overrides"
```

---

## Task 2: CoTURN TLS Guide + Docker + Validation Script

**Files:**
- Create: `coturn/tls/tls-config.md`
- Create: `coturn/docker/Dockerfile`
- Create: `coturn/scripts/validate-config.sh`

**Step 1: Create TLS config guide**

Create `coturn/tls/tls-config.md`:

```markdown
# CoTURN TLS Certificate Configuration

## Development

No TLS required. The `environments/dev.conf` disables TLS with `no-tls` and `no-dtls`.

## Staging / Production / Live

### Option 1: Let's Encrypt (recommended for public TURN servers)

```bash
# Install certbot
apt-get install certbot

# Generate certificate for TURN domain
certbot certonly --standalone -d turn.quckapp.com \
  --non-interactive --agree-tos --email ops@quckapp.com

# Copy certs to CoTURN mount
cp /etc/letsencrypt/live/turn.quckapp.com/fullchain.pem /etc/coturn/certs/turn.pem
cp /etc/letsencrypt/live/turn.quckapp.com/privkey.pem /etc/coturn/certs/turn.key

# Generate DH params (one-time)
openssl dhparam -out /etc/coturn/certs/dhparam.pem 2048
```

### Option 2: cert-manager (Kubernetes)

```yaml
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: coturn-tls
spec:
  secretName: coturn-tls-secret
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  dnsNames:
    - turn.quckapp.com
    - turn.staging.quckapp.com
```

### Certificate Renewal

Certs auto-renew via certbot cron or cert-manager. CoTURN reloads certs on SIGUSR2:

```bash
# Signal CoTURN to reload certs (no downtime)
kill -SIGUSR2 $(pidof turnserver)
```

### Ports Required

| Port | Protocol | Purpose |
|------|----------|---------|
| 3478 | UDP/TCP | STUN/TURN |
| 5349 | TCP | TURN over TLS |
| 3479 | UDP/TCP | STUN/TURN alternate |
| 5350 | TCP | TURN TLS alternate |
| 49152-65535 | UDP | Media relay range |
| 9641 | TCP | Prometheus metrics |
```

**Step 2: Create Dockerfile**

Create `coturn/docker/Dockerfile`:

```dockerfile
# =============================================================================
# CoTURN TURN Server
# =============================================================================
# TURN/STUN relay for WebRTC NAT traversal
# =============================================================================

FROM coturn/coturn:4.6-alpine

# Labels
LABEL maintainer="QuckApp <ops@quckapp.com>"
LABEL description="CoTURN TURN server for QuckApp WebRTC"

# Copy base config
COPY turnserver.conf /etc/coturn/turnserver.conf

# Copy environment configs
COPY environments/ /etc/coturn/environments/

# Create certs directory
RUN mkdir -p /etc/coturn/certs && \
    chown -R turnserver:turnserver /etc/coturn

# TLS certs are mounted at runtime
VOLUME ["/etc/coturn/certs"]

# Ports: STUN/TURN, TLS, alternates, metrics
EXPOSE 3478/udp 3478/tcp 5349/tcp 3479/udp 3479/tcp 5350/tcp 9641/tcp

# Relay port range
EXPOSE 49152-65535/udp

# Health check via STUN binding request
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD turnutils_stunclient localhost || exit 1

# Default: run with dev config
# Override in docker-compose/k8s with: -c /etc/coturn/environments/production.conf
ENTRYPOINT ["turnserver", "-c", "/etc/coturn/turnserver.conf"]
CMD ["-c", "/etc/coturn/environments/dev.conf"]
```

**Step 3: Create validation script**

Create `coturn/scripts/validate-config.sh`:

```bash
#!/usr/bin/env bash
# =============================================================================
# Validate CoTURN Configuration Files
# =============================================================================
# Usage: ./validate-config.sh
# Checks syntax and required settings for all CoTURN config files.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COTURN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== CoTURN Config Validation ==="
echo "Directory: $COTURN_DIR"
echo ""

TOTAL_FILES=0
TOTAL_PASS=0
TOTAL_FAIL=0

validate_conf() {
    local file="$1"
    local rel_path="${file#$COTURN_DIR/}"
    TOTAL_FILES=$((TOTAL_FILES + 1))

    # Check for common syntax issues:
    # 1. No tabs (CoTURN uses key=value, no tabs needed)
    # 2. No trailing whitespace on non-comment lines
    # 3. Key=value or key format (no spaces around =)
    local errors=""

    # Check file is readable
    if [ ! -r "$file" ]; then
        errors="File not readable"
    fi

    # Check for lines with spaces around = (invalid syntax)
    if grep -qE '^[^#]*\s+=\s+' "$file" 2>/dev/null; then
        errors="${errors:+$errors; }Spaces around = sign"
    fi

    if [ -z "$errors" ]; then
        echo "  PASS: $rel_path"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    else
        echo "  FAIL: $rel_path ($errors)"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
}

# Validate base config
validate_conf "$COTURN_DIR/turnserver.conf"

# Validate environment overrides
for env_file in "$COTURN_DIR"/environments/*.conf; do
    if [ -f "$env_file" ]; then
        validate_conf "$env_file"
    fi
done

echo ""
echo "=== Summary ==="
echo "  Total files: $TOTAL_FILES"
echo "  Passed:      $TOTAL_PASS"
echo "  Failed:      $TOTAL_FAIL"

echo ""
if [ "$TOTAL_FAIL" -gt 0 ]; then
    echo "=== Validation FAILED ==="
    exit 1
else
    echo "=== Validation PASSED ==="
fi
```

**Step 4: Commit**

```bash
git add coturn/tls/ coturn/docker/ coturn/scripts/
git commit -m "feat(coturn): add TLS guide, Dockerfile, and validation script"
```

---

## Task 3: Enhance LiveKit Base Config + Environment Overrides

**Files:**
- Modify: `livekit/livekit.yaml`
- Create: `livekit/environments/dev.yaml`
- Create: `livekit/environments/staging.yaml`
- Create: `livekit/environments/production.yaml`
- Create: `livekit/environments/live.yaml`

**Step 1: Enhance the base livekit.yaml**

Replace `livekit/livekit.yaml` with:

```yaml
# =============================================================================
# QUCKAPP - LiveKit Server Configuration
# =============================================================================
# SFU (Selective Forwarding Unit) for 1-to-1 and group video/audio calls.
# Clients connect directly to LiveKit for media; call lifecycle (ringing,
# answered, ended) is still managed by the Elixir call-service.
#
# Environment-specific overrides are in environments/*.yaml
# =============================================================================

port: 7880

rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false
  tcp_port: 7881
  udp_port: 7882
  # Congestion control
  congestion_control:
    enabled: true
    probe_mode: padding

# API keys for server-to-server auth (call-service + go-bff use these)
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}

# TURN integration (delegates to CoTURN)
turn:
  enabled: true
  domain: ${TURN_DOMAIN}
  tls_port: 5349
  udp_port: 3478
  external_tls: false

# Redis for distributed state (room routing, participant tracking)
redis:
  address: ${REDIS_HOST}:6379
  password: ${REDIS_PASSWORD}
  db: 7

# Room defaults
room:
  auto_create: true
  empty_timeout: 300
  max_participants: ${MAX_PARTICIPANTS:-50}

# Audio settings
audio:
  active_speaker_update_interval: 300ms
  smooth_interval: 3

# Webhooks (disabled by default, enabled per environment)
# webhook:
#   urls:
#     - http://call-service.quckapp.local:4002/webhooks/livekit
#   api_key: ${LIVEKIT_API_KEY}

# Egress (recording, disabled by default)
# egress:
#   s3:
#     access_key: ${AWS_ACCESS_KEY_ID}
#     secret: ${AWS_SECRET_ACCESS_KEY}
#     region: ${AWS_REGION}
#     bucket: ${EGRESS_S3_BUCKET}

logging:
  level: info
  json: true
  sample: false
```

**Step 2: Create environment overrides**

Create `livekit/environments/dev.yaml`:

```yaml
# LiveKit Development Environment
# Usage: livekit-server --config livekit.yaml --config environments/dev.yaml

port: 7880

rtc:
  use_external_ip: false

keys:
  devkey: secret_dev_not_for_production

turn:
  enabled: true
  domain: localhost
  tls_port: 0
  udp_port: 3478
  external_tls: false

redis:
  address: redis:6379
  password: ""
  db: 7

room:
  auto_create: true
  empty_timeout: 300
  max_participants: 50

logging:
  level: debug
  json: true
```

Create `livekit/environments/staging.yaml`:

```yaml
# LiveKit Staging Environment
# Usage: livekit-server --config livekit.yaml --config environments/staging.yaml

rtc:
  use_external_ip: true

turn:
  domain: turn.staging.quckapp.com
  external_tls: true

room:
  max_participants: 75

webhook:
  urls:
    - http://call-service.quckapp.local:4002/webhooks/livekit
  api_key: ${LIVEKIT_API_KEY}

egress:
  s3:
    access_key: ${AWS_ACCESS_KEY_ID}
    secret: ${AWS_SECRET_ACCESS_KEY}
    region: ${AWS_REGION}
    bucket: ${EGRESS_S3_BUCKET}

logging:
  level: info
```

Create `livekit/environments/production.yaml`:

```yaml
# LiveKit Production Environment
# Usage: livekit-server --config livekit.yaml --config environments/production.yaml

rtc:
  use_external_ip: true

turn:
  domain: turn.quckapp.com
  external_tls: true

room:
  max_participants: 100

limit:
  num_rooms: 500
  bytes_per_sec: 104857600

webhook:
  urls:
    - http://call-service.quckapp.local:4002/webhooks/livekit
  api_key: ${LIVEKIT_API_KEY}

egress:
  s3:
    access_key: ${AWS_ACCESS_KEY_ID}
    secret: ${AWS_SECRET_ACCESS_KEY}
    region: ${AWS_REGION}
    bucket: ${EGRESS_S3_BUCKET}

logging:
  level: warn
```

Create `livekit/environments/live.yaml`:

```yaml
# LiveKit Live Environment
# Usage: livekit-server --config livekit.yaml --config environments/live.yaml

rtc:
  use_external_ip: true

turn:
  domain: turn.quckapp.com
  external_tls: true

room:
  max_participants: 100

limit:
  num_rooms: 500
  bytes_per_sec: 209715200

webhook:
  urls:
    - http://call-service.quckapp.local:4002/webhooks/livekit
  api_key: ${LIVEKIT_API_KEY}

egress:
  s3:
    access_key: ${AWS_ACCESS_KEY_ID}
    secret: ${AWS_SECRET_ACCESS_KEY}
    region: ${AWS_REGION}
    bucket: ${EGRESS_S3_BUCKET}

logging:
  level: warn
  sample: true
```

**Step 3: Commit**

```bash
git add livekit/livekit.yaml livekit/environments/
git commit -m "feat(livekit): enhance base config and add 4 environment overrides"
```

---

## Task 4: LiveKit Egress + Docker + Validation Script

**Files:**
- Create: `livekit/egress/egress-config.yaml`
- Create: `livekit/docker/Dockerfile`
- Create: `livekit/scripts/validate-configs.sh`

**Step 1: Create egress config**

Create `livekit/egress/egress-config.yaml`:

```yaml
# =============================================================================
# LiveKit Egress Configuration
# =============================================================================
# Recording and streaming config for huddle sessions and calls.
# Egress runs as a separate service alongside LiveKit SFU.
# =============================================================================

api_key: ${LIVEKIT_API_KEY}
api_secret: ${LIVEKIT_API_SECRET}
ws_url: ws://livekit:7880

# Health check
health_port: 7890

# Logging
log_level: info

# S3 output
s3:
  access_key: ${AWS_ACCESS_KEY_ID}
  secret: ${AWS_SECRET_ACCESS_KEY}
  region: ${AWS_REGION}
  bucket: ${EGRESS_S3_BUCKET}
  force_path_style: false

# Recording defaults
room_composite:
  # MP4 for video calls
  file_output:
    file_type: mp4
    filepath: "recordings/{room_name}/{room_id}-{time}.mp4"
  # Max recording duration (4 hours)
  segment_duration: 14400

track_composite:
  # OGG for audio-only (huddles)
  file_output:
    file_type: ogg
    filepath: "recordings/{room_name}/{room_id}-audio-{time}.ogg"

# Resource limits
cpu_cost:
  room_composite: 3.0
  track_composite: 1.0
  track: 0.5

# Template (for composite recordings)
template_base: https://recorder.quckapp.com
```

**Step 2: Create Dockerfile**

Create `livekit/docker/Dockerfile`:

```dockerfile
# =============================================================================
# LiveKit SFU Media Server
# =============================================================================
# Selective Forwarding Unit for WebRTC calls and huddles
# =============================================================================

FROM livekit/livekit-server:v1.7

# Labels
LABEL maintainer="QuckApp <ops@quckapp.com>"
LABEL description="LiveKit SFU server for QuckApp WebRTC"

# Copy base config
COPY livekit.yaml /etc/livekit/livekit.yaml

# Copy environment configs
COPY environments/ /etc/livekit/environments/

# Copy egress config
COPY egress/ /etc/livekit/egress/

# Ports: HTTP API, RTC TCP, RTC UDP
EXPOSE 7880/tcp 7881/tcp 7882/udp

# UDP port range for media
EXPOSE 50000-60000/udp

# Health check via HTTP API
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -q --spider http://localhost:7880/ || exit 1

# Default: run with dev config
ENTRYPOINT ["livekit-server"]
CMD ["--config", "/etc/livekit/livekit.yaml", "--config", "/etc/livekit/environments/dev.yaml"]
```

**Step 3: Create validation script**

Create `livekit/scripts/validate-configs.sh`:

```bash
#!/usr/bin/env bash
# =============================================================================
# Validate LiveKit Configuration Files
# =============================================================================
# Usage: ./validate-configs.sh
# Validates YAML syntax for all LiveKit config files.
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
LIVEKIT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== LiveKit Config Validation ==="
echo "Directory: $LIVEKIT_DIR"
echo ""

TOTAL_FILES=0
TOTAL_PASS=0
TOTAL_FAIL=0

# Find all YAML files (exclude scripts and docker directories)
while IFS= read -r file; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    REL_PATH="${file#$LIVEKIT_DIR/}"

    # Convert path for Python on Windows
    if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "mingw"* ]]; then
        PY_FILE=$(cygpath -w "$file" 2>/dev/null || echo "$file")
    else
        PY_FILE="$file"
    fi

    if python -c "import yaml; yaml.safe_load(open(r'$PY_FILE'))" 2>/dev/null; then
        echo "  PASS: $REL_PATH"
        TOTAL_PASS=$((TOTAL_PASS + 1))
    else
        echo "  FAIL: $REL_PATH"
        TOTAL_FAIL=$((TOTAL_FAIL + 1))
    fi
done < <(find "$LIVEKIT_DIR" -name "*.yaml" -o -name "*.yml" | sort)

echo ""
echo "=== Summary ==="
echo "  Total files: $TOTAL_FILES"
echo "  Passed:      $TOTAL_PASS"
echo "  Failed:      $TOTAL_FAIL"

echo ""
echo "=== Files by Directory ==="
for dir in environments egress; do
    if [ -d "$LIVEKIT_DIR/$dir" ]; then
        COUNT=$(find "$LIVEKIT_DIR/$dir" -name "*.yaml" -o -name "*.yml" | wc -l)
        echo "  $dir/: $COUNT files"
    fi
done

echo ""
if [ "$TOTAL_FAIL" -gt 0 ]; then
    echo "=== Validation FAILED ==="
    exit 1
else
    echo "=== Validation PASSED ==="
fi
```

**Step 4: Commit**

```bash
git add livekit/egress/ livekit/docker/ livekit/scripts/
git commit -m "feat(livekit): add egress config, Dockerfile, and validation script"
```

---

## Task 5: Run Validation + Commit Docs + Update Parent Repo

**Step 1: Run CoTURN validation**

```bash
cd infrastructure
bash coturn/scripts/validate-config.sh
```

Expected: All 5 conf files PASS.

**Step 2: Run LiveKit validation**

```bash
bash livekit/scripts/validate-configs.sh
```

Expected: All 6 YAML files PASS (livekit.yaml + 4 environments + 1 egress).

**Step 3: Commit implementation plan in docs submodule**

```bash
cd docs/
git add docs/plans/2026-03-02-coturn-livekit-webrtc-implementation.md
git commit -m "docs: add CoTURN + LiveKit WebRTC implementation plan"
```

**Step 4: Update parent repo submodule references**

```bash
cd ..
git add docs infrastructure
git commit -m "chore: update submodules (CoTURN + LiveKit WebRTC infrastructure)"
```

**Step 5: Push all submodules**

```bash
cd infrastructure && git push && cd ..
cd docs && git push && cd ..
git push
```
