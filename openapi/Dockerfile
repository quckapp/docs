# Multi-stage build for custom Swagger UI with bundled OpenAPI spec

# Stage 1: Bundle and validate OpenAPI spec
FROM node:20-alpine AS builder

WORKDIR /app

# Install OpenAPI bundler
RUN npm install -g @redocly/cli

# Copy OpenAPI files
COPY . /app/openapi/

# Validate and bundle the specification
RUN redocly lint /app/openapi/openapi.yaml --skip-rule=no-unused-components || true
RUN redocly bundle /app/openapi/openapi.yaml -o /app/bundled-openapi.yaml

# Stage 2: Serve with Swagger UI
FROM swaggerapi/swagger-ui:v5.10.3

# Copy bundled spec
COPY --from=builder /app/bundled-openapi.yaml /usr/share/nginx/html/openapi.yaml

# Copy custom HTML if needed
COPY index.html /usr/share/nginx/html/index.html

# Environment configuration
ENV SWAGGER_JSON=/usr/share/nginx/html/openapi.yaml
ENV BASE_URL=/
ENV DEEP_LINKING=true
ENV DISPLAY_REQUEST_DURATION=true
ENV FILTER=true
ENV SHOW_EXTENSIONS=true
ENV TRY_IT_OUT_ENABLED=true
ENV PERSIST_AUTHORIZATION=true
ENV VALIDATOR_URL=null
ENV DOC_EXPANSION=list

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost:8080/ || exit 1
