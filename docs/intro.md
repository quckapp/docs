---
sidebar_position: 1
slug: /
---

# QuckApp Documentation

Welcome to **QuckApp** - an enterprise-grade, polyglot microservices chat platform built for scale, performance, and reliability.

## What is QuckApp?

QuckApp is a modern real-time communication platform that combines the best practices of distributed systems architecture with cutting-edge technologies. It's designed to handle millions of concurrent users while maintaining sub-second message delivery.

## Key Features

- **Real-time Messaging** - Instant message delivery with read receipts, typing indicators, and reactions
- **Voice & Video Calls** - WebRTC-powered HD audio and video calling
- **Workspaces & Channels** - Organized communication spaces for teams
- **File Sharing** - Secure file uploads with CDN delivery
- **Search** - Full-text search powered by Elasticsearch
- **AI-Powered Features** - Smart replies, sentiment analysis, and content moderation
- **Enterprise Security** - OAuth 2.0, 2FA, RBAC, and audit logging

## Architecture Overview

QuckApp is built on a **polyglot microservices architecture** using the best language for each task:

| Technology | Use Case | Services |
|------------|----------|----------|
| **Spring Boot** | Authentication & Security | Auth, User, Permission, Audit, Admin |
| **NestJS** | API Gateway & Notifications | Backend Gateway, Realtime, Notification |
| **Elixir/Phoenix** | Real-time Communication | Presence, Calls, Messages, Huddles |
| **Go** | High-performance CRUD | Workspaces, Channels, Files, Search |
| **Python** | AI/ML & Analytics | Analytics, ML, Sentiment, Moderation |

## Quick Links

- [Getting Started](./getting-started) - Set up your development environment
- [Architecture Overview](./architecture/overview) - Understand the system design
- [Microservices](./microservices/overview) - Explore all 32 services
- [API Reference](./api/overview) - REST, WebSocket, and gRPC APIs

## Technology Stack

### Backend
- **Languages**: Java 21, TypeScript, Elixir, Go 1.21+, Python 3.11+
- **Frameworks**: Spring Boot 3.x, NestJS, Phoenix, Gin/Fiber, FastAPI
- **Databases**: PostgreSQL, MySQL, MongoDB, Redis
- **Message Queues**: Apache Kafka, RabbitMQ
- **Search**: Elasticsearch 8.x

### Infrastructure
- **Containerization**: Docker, Kubernetes
- **Service Mesh**: Consul, Vault
- **Monitoring**: Prometheus, Grafana, Datadog
- **CI/CD**: GitHub Actions, ArgoCD

### Cloud Services
- **ML/AI**: Azure Databricks
- **Storage**: AWS S3 / Azure Blob Storage
- **CDN**: CloudFront / Azure CDN

## Service Count

| Stack | Count |
|-------|-------|
| Spring Boot | 5 |
| NestJS | 3 |
| Elixir/Phoenix | 6 |
| Go | 10 |
| Python | 8 |
| **Total** | **32** |

## Getting Help

- **GitHub Issues**: Report bugs and request features
- **Discussions**: Ask questions and share ideas
- **Discord**: Join our community for real-time help
