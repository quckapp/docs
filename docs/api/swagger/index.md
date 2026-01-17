---
sidebar_position: 0
title: Interactive API Docs
---

# Interactive API Documentation

Explore QuckApp APIs using interactive Swagger UI documentation. These pages provide a live API explorer where you can:

- Browse all available endpoints
- View request/response schemas
- Try out API calls directly from the browser
- Authenticate and test protected endpoints

## Available Services

| Service | Description | OpenAPI Spec |
|---------|-------------|--------------|
| [Auth Service](./auth-service) | Authentication, tokens, OAuth2, 2FA | [JSON](/api/auth-service.json) |
| [User Service](./user-service) | User management, profiles, preferences | [JSON](/api/user-service.json) |

## Using the API Explorer

### Authentication

1. Click the **Authorize** button at the top of the Swagger UI
2. Enter your JWT access token in the Bearer Auth field
3. Click **Authorize** to apply the token to all requests

### Making Requests

1. Expand an endpoint section
2. Click **Try it out**
3. Fill in the required parameters
4. Click **Execute** to send the request
5. View the response below

### Downloading OpenAPI Specs

Each service provides its OpenAPI specification in JSON format. You can download these specs to:

- Generate client SDKs using tools like OpenAPI Generator
- Import into Postman or Insomnia
- Use with other API development tools

## Coming Soon

Additional interactive API documentation for other services:

- Workspace Service
- Channel Service
- Message Service
- And more...
