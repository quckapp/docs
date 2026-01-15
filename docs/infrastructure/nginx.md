---
sidebar_position: 3
---

# Nginx Configuration

Nginx serves as the reverse proxy and load balancer for QuckApp, handling SSL termination, rate limiting, and routing.

## Main Configuration

```nginx
# nginx/nginx.conf

user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 4096;
    use epoll;
    multi_accept on;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    # Logging
    log_format main '$remote_addr - $remote_user [$time_local] "$request" '
                    '$status $body_bytes_sent "$http_referer" '
                    '"$http_user_agent" "$http_x_forwarded_for" '
                    'rt=$request_time uct="$upstream_connect_time" '
                    'uht="$upstream_header_time" urt="$upstream_response_time"';

    access_log /var/log/nginx/access.log main;

    # Performance
    sendfile on;
    tcp_nopush on;
    tcp_nodelay on;
    keepalive_timeout 65;
    types_hash_max_size 2048;

    # Gzip Compression
    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript
               application/xml application/xml+rss text/javascript;

    # Rate Limiting Zones
    limit_req_zone $binary_remote_addr zone=api_limit:10m rate=100r/s;
    limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/s;
    limit_req_zone $binary_remote_addr zone=upload_limit:10m rate=5r/s;

    # Connection Limiting
    limit_conn_zone $binary_remote_addr zone=conn_limit:10m;

    # Upstream Definitions
    upstream backend {
        least_conn;
        server backend:3000 weight=5;
        server backend-2:3000 weight=5;
        keepalive 32;
    }

    upstream realtime {
        ip_hash;
        server realtime:3001;
        server realtime-2:3001;
    }

    upstream auth_service {
        server auth-service:8001;
        server auth-service-2:8001 backup;
    }

    upstream user_service {
        server user-service:8002;
    }

    upstream websocket {
        ip_hash;
        server presence:4001;
        server presence-2:4001;
    }

    # SSL Configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    ssl_stapling on;
    ssl_stapling_verify on;

    # Security Headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    include /etc/nginx/conf.d/*.conf;
}
```

## Server Configuration

```nginx
# nginx/conf.d/QuckApp.conf

# HTTP to HTTPS Redirect
server {
    listen 80;
    server_name QuckApp.dev www.QuckApp.dev api.QuckApp.dev;
    return 301 https://$server_name$request_uri;
}

# Main API Server
server {
    listen 443 ssl http2;
    server_name api.QuckApp.dev;

    ssl_certificate /etc/nginx/ssl/QuckApp.crt;
    ssl_certificate_key /etc/nginx/ssl/QuckApp.key;

    # Connection limits
    limit_conn conn_limit 20;

    # Health Check
    location /health {
        access_log off;
        return 200 'OK';
        add_header Content-Type text/plain;
    }

    # ===================
    # AUTH SERVICE ROUTES
    # ===================
    location /api/v1/auth {
        limit_req zone=auth_limit burst=20 nodelay;

        proxy_pass http://auth_service;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 30s;
    }

    # ===================
    # USER SERVICE ROUTES
    # ===================
    location /api/v1/users {
        limit_req zone=api_limit burst=50 nodelay;

        proxy_pass http://user_service;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ===================
    # BACKEND GATEWAY ROUTES
    # ===================
    location /api/v1 {
        limit_req zone=api_limit burst=100 nodelay;

        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Connection "";

        # Timeouts
        proxy_connect_timeout 10s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # ===================
    # FILE UPLOAD
    # ===================
    location /api/v1/files/upload {
        limit_req zone=upload_limit burst=10 nodelay;

        client_max_body_size 100M;
        proxy_pass http://backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_request_buffering off;
        proxy_read_timeout 300s;
    }

    # ===================
    # GRPC GATEWAY
    # ===================
    location /grpc {
        grpc_pass grpc://backend:50051;
        grpc_connect_timeout 10s;
        grpc_read_timeout 60s;
        grpc_send_timeout 60s;
    }

    # Error pages
    error_page 500 502 503 504 /50x.html;
    location = /50x.html {
        root /usr/share/nginx/html;
        internal;
    }
}

# WebSocket Server
server {
    listen 443 ssl http2;
    server_name realtime.QuckApp.dev;

    ssl_certificate /etc/nginx/ssl/QuckApp.crt;
    ssl_certificate_key /etc/nginx/ssl/QuckApp.key;

    location /socket {
        proxy_pass http://websocket;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # WebSocket specific
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
        proxy_connect_timeout 10s;
    }

    location /presence {
        proxy_pass http://realtime;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 86400s;
    }
}

# CDN / Static Assets
server {
    listen 443 ssl http2;
    server_name cdn.QuckApp.dev;

    ssl_certificate /etc/nginx/ssl/QuckApp.crt;
    ssl_certificate_key /etc/nginx/ssl/QuckApp.key;

    root /var/www/cdn;

    location / {
        expires 30d;
        add_header Cache-Control "public, immutable";
        add_header Access-Control-Allow-Origin "*";

        try_files $uri =404;
    }

    location ~* \.(jpg|jpeg|png|gif|ico|webp)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    location ~* \.(css|js)$ {
        expires 7d;
        add_header Cache-Control "public";
    }
}
```

## Rate Limiting Details

| Zone | Rate | Burst | Purpose |
|------|------|-------|---------|
| `api_limit` | 100 req/s | 100 | General API endpoints |
| `auth_limit` | 10 req/s | 20 | Login, register, password reset |
| `upload_limit` | 5 req/s | 10 | File uploads |

## Load Balancing Strategies

### Round Robin (Default)
```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;
    server backend-3:3000;
}
```

### Least Connections
```nginx
upstream backend {
    least_conn;
    server backend-1:3000;
    server backend-2:3000;
}
```

### IP Hash (Sticky Sessions)
```nginx
upstream websocket {
    ip_hash;
    server ws-1:4001;
    server ws-2:4001;
}
```

### Weighted
```nginx
upstream backend {
    server backend-1:3000 weight=5;
    server backend-2:3000 weight=3;
    server backend-3:3000 weight=2;
}
```

## Health Checks

```nginx
upstream backend {
    server backend-1:3000;
    server backend-2:3000;

    # Passive health check (built-in)
    # Mark server as failed after 3 failures
    server backend-1:3000 max_fails=3 fail_timeout=30s;
}
```

## SSL Certificate Setup

### Using Let's Encrypt

```bash
# Install certbot
apt-get install certbot python3-certbot-nginx

# Obtain certificate
certbot --nginx -d api.QuckApp.dev -d realtime.QuckApp.dev -d cdn.QuckApp.dev

# Auto-renewal
certbot renew --dry-run
```

### Certificate Locations

```
/etc/nginx/ssl/
├── QuckApp.crt      # Certificate
├── QuckApp.key      # Private key
└── QuckApp.chain    # Certificate chain
```
