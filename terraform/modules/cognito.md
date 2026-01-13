# Cognito Module

Creates Cognito User Pool for authentication with OAuth 2.0, MFA, and Identity Pool for AWS resource access.

## Features

- User Pool with email/phone verification
- Multi-factor authentication (MFA)
- OAuth 2.0 / OIDC support
- Multiple app clients (web, mobile, backend)
- Identity Pool for AWS credentials
- Custom domains
- Lambda triggers
- Advanced security features

## Usage

```hcl
module "cognito" {
  source = "../../modules/cognito"

  environment = "prod"

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  # Password policy
  password_minimum_length    = 12
  password_require_lowercase = true
  password_require_numbers   = true
  password_require_symbols   = true
  password_require_uppercase = true

  # MFA
  mfa_configuration = "ON"

  # Domain
  create_user_pool_domain = true
  user_pool_domain_prefix = "quikapp"

  # Clients
  create_web_client     = true
  create_mobile_client  = true
  create_backend_client = true

  web_callback_urls = ["https://app.quikapp.com/callback"]
  web_logout_urls   = ["https://app.quikapp.com"]

  # Identity Pool
  create_identity_pool = true

  # Lambda triggers
  lambda_post_confirmation = var.post_confirmation_lambda_arn

  tags = var.tags
}
```

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Cognito User Pool                       │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │  Web Client  │  │Mobile Client │  │Backend Client│       │
│  │  (Public)    │  │  (Public)    │  │  (Secret)    │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
│         │                 │                 │                │
│         └─────────────────┴─────────────────┘                │
│                           │                                  │
│                   ┌───────▼───────┐                         │
│                   │  User Pool    │                         │
│                   │   Domain      │                         │
│                   └───────────────┘                         │
└─────────────────────────────────────────────────────────────┘
                            │
                   ┌────────▼────────┐
                   │  Identity Pool  │
                   │  (AWS Creds)    │
                   └────────┬────────┘
                            │
              ┌─────────────┴─────────────┐
              │                           │
    ┌─────────▼─────────┐     ┌──────────▼──────────┐
    │ Authenticated Role │     │Unauthenticated Role│
    │   (S3, DynamoDB)   │     │   (Limited)        │
    └────────────────────┘     └────────────────────┘
```

## App Clients

### Web Client

For browser-based applications:

```hcl
client {
  name                         = "web-client"
  generate_secret              = false  # SPAs can't keep secrets
  explicit_auth_flows          = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]
  supported_identity_providers = ["COGNITO"]

  callback_urls = ["https://app.quikapp.com/callback"]
  logout_urls   = ["https://app.quikapp.com"]

  allowed_oauth_flows = ["code"]
  allowed_oauth_scopes = [
    "email", "openid", "profile",
    "quikapp-api/read", "quikapp-api/write"
  ]
}
```

### Mobile Client

For iOS/Android applications:

```hcl
client {
  name                = "mobile-client"
  generate_secret     = false
  explicit_auth_flows = [
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH"
  ]

  callback_urls = ["quikapp://callback"]
  logout_urls   = ["quikapp://logout"]

  # Token validity
  access_token_validity  = 1   # 1 hour
  id_token_validity      = 1   # 1 hour
  refresh_token_validity = 30  # 30 days
}
```

### Backend Client

For server-to-server (M2M):

```hcl
client {
  name            = "backend-client"
  generate_secret = true  # Servers can keep secrets

  explicit_auth_flows = [
    "ALLOW_ADMIN_USER_PASSWORD_AUTH"
  ]

  allowed_oauth_flows          = ["client_credentials"]
  allowed_oauth_scopes         = ["quikapp-api/admin"]
  allowed_oauth_flows_user_pool_client = true
}
```

## OAuth 2.0 Flows

### Authorization Code Flow (Recommended)

```
1. User clicks "Login"
2. Redirect to Cognito hosted UI
3. User authenticates
4. Cognito redirects with authorization code
5. Exchange code for tokens
6. Use access token for API calls
```

### Token Refresh

```javascript
const refreshTokens = async (refreshToken) => {
  const response = await fetch(COGNITO_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken
    })
  });
  return response.json();
};
```

## MFA Configuration

```hcl
# Required MFA
mfa_configuration = "ON"

# Software token (TOTP apps)
software_token_mfa_configuration {
  enabled = true
}

# SMS MFA (requires SNS)
sms_mfa_configuration {
  sms_authentication_message = "Your QuikApp code is {####}"
}
```

## Lambda Triggers

| Trigger | Use Case |
|---------|----------|
| Pre Sign-up | Validate email domain |
| Post Confirmation | Create user profile in database |
| Pre Token Generation | Add custom claims |
| Custom Message | Customize emails/SMS |
| Pre Authentication | Check user status |
| Post Authentication | Log sign-in events |

### Example: Post Confirmation

```javascript
exports.handler = async (event) => {
  const userId = event.userName;
  const email = event.request.userAttributes.email;

  // Create user profile in DynamoDB
  await dynamodb.put({
    TableName: 'Users',
    Item: {
      userId,
      email,
      createdAt: new Date().toISOString()
    }
  }).promise();

  return event;
};
```

## Identity Pool

Provides temporary AWS credentials:

```hcl
identity_pool {
  identity_pool_name               = "quikapp-prod"
  allow_unauthenticated_identities = false

  cognito_identity_providers {
    client_id               = user_pool_client_id
    provider_name           = user_pool_endpoint
    server_side_token_check = true
  }
}
```

### Authenticated Role Policy

```hcl
policy {
  # S3 access for user's own files
  statement {
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = [
      "arn:aws:s3:::media-bucket/${cognito-identity.amazonaws.com:sub}/*"
    ]
  }

  # DynamoDB access
  statement {
    actions   = ["dynamodb:Query", "dynamodb:GetItem"]
    resources = [dynamodb_table_arn]
    condition {
      test     = "ForAllValues:StringEquals"
      variable = "dynamodb:LeadingKeys"
      values   = ["${cognito-identity.amazonaws.com:sub}"]
    }
  }
}
```

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `username_attributes` | Username type | list(string) | `["email"]` |
| `mfa_configuration` | MFA setting | string | `"OPTIONAL"` |
| `password_minimum_length` | Min password length | number | `8` |
| `create_identity_pool` | Create Identity Pool | bool | `false` |

## Outputs

| Name | Description |
|------|-------------|
| `user_pool_id` | User Pool ID |
| `user_pool_arn` | User Pool ARN |
| `user_pool_endpoint` | User Pool endpoint |
| `web_client_id` | Web client ID |
| `mobile_client_id` | Mobile client ID |
| `identity_pool_id` | Identity Pool ID |
| `jwks_uri` | JWKS URI for token validation |
| `issuer` | Token issuer URL |

## JWT Token Validation

```javascript
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const client = jwksClient({
  jwksUri: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`
});

const verifyToken = async (token) => {
  const decoded = jwt.decode(token, { complete: true });
  const key = await client.getSigningKey(decoded.header.kid);

  return jwt.verify(token, key.getPublicKey(), {
    issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`,
    audience: clientId
  });
};
```

## Cost Considerations

| Feature | Cost |
|---------|------|
| MAU (first 50K) | Free |
| MAU (50K-100K) | $0.0055/user |
| Advanced Security | $0.05/MAU |
| SMS MFA | SNS charges |
