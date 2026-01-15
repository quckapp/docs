---
sidebar_position: 5
---

# Media Encryption

QuckApp implements a multi-layer encryption strategy similar to WhatsApp, combining client-side End-to-End Encryption (E2EE) with server-side encryption for defense in depth.

## Encryption Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                           Media Encryption Architecture                              │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              Encryption Layers                                  │ │
│  │                                                                                 │ │
│  │    Layer 1: Client-Side E2EE (Signal Protocol)                                 │ │
│  │    ───────────────────────────────────────────                                 │ │
│  │    • Media encrypted BEFORE leaving device                                     │ │
│  │    • Only sender and recipient(s) have decryption keys                         │ │
│  │    • Server CANNOT decrypt content                                             │ │
│  │    • Uses AES-256-GCM per-message keys                                         │ │
│  │                                                                                 │ │
│  │    Layer 2: Transport Encryption (TLS 1.3)                                     │ │
│  │    ─────────────────────────────────────────                                   │ │
│  │    • All network traffic encrypted                                             │ │
│  │    • Protects against MITM attacks                                             │ │
│  │    • Certificate pinning for API connections                                   │ │
│  │                                                                                 │ │
│  │    Layer 3: Server-Side Encryption (AWS KMS + SSE-S3)                          │ │
│  │    ─────────────────────────────────────────────────                           │ │
│  │    • Additional encryption at rest                                             │ │
│  │    • Protects against physical storage access                                  │ │
│  │    • AWS manages encryption keys                                               │ │
│  │                                                                                 │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
│  ┌────────────────────────────────────────────────────────────────────────────────┐ │
│  │                              Key Hierarchy                                      │ │
│  │                                                                                 │ │
│  │    ┌─────────────────────┐                                                      │ │
│  │    │  User Identity Key  │ ◄── Long-term key pair (generated on device)        │ │
│  │    │  (Ed25519)          │                                                      │ │
│  │    └──────────┬──────────┘                                                      │ │
│  │               │                                                                 │ │
│  │               ▼                                                                 │ │
│  │    ┌─────────────────────┐                                                      │ │
│  │    │  Pre-Key Bundle     │ ◄── Published to server for async key exchange      │ │
│  │    │  (X25519)           │                                                      │ │
│  │    └──────────┬──────────┘                                                      │ │
│  │               │                                                                 │ │
│  │               ▼                                                                 │ │
│  │    ┌─────────────────────┐                                                      │ │
│  │    │  Session Key        │ ◄── Derived via X3DH key agreement                  │ │
│  │    │  (Shared Secret)    │                                                      │ │
│  │    └──────────┬──────────┘                                                      │ │
│  │               │                                                                 │ │
│  │               ▼                                                                 │ │
│  │    ┌─────────────────────┐                                                      │ │
│  │    │  Chain Keys         │ ◄── Ratcheted per-message (Double Ratchet)          │ │
│  │    │  (HKDF derived)     │                                                      │ │
│  │    └──────────┬──────────┘                                                      │ │
│  │               │                                                                 │ │
│  │               ▼                                                                 │ │
│  │    ┌─────────────────────┐                                                      │ │
│  │    │  Message Key        │ ◄── Unique per message (AES-256-GCM)                │ │
│  │    │  (256-bit)          │                                                      │ │
│  │    └──────────┬──────────┘                                                      │ │
│  │               │                                                                 │ │
│  │               ▼                                                                 │ │
│  │    ┌─────────────────────┐                                                      │ │
│  │    │  Media Key          │ ◄── Derived from message key for large files        │ │
│  │    │  (AES-256-GCM)      │                                                      │ │
│  │    └─────────────────────┘                                                      │ │
│  │                                                                                 │ │
│  └────────────────────────────────────────────────────────────────────────────────┘ │
│                                                                                      │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

## E2EE Flow

### Media Upload Encryption Flow

```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│                              Media Upload Flow                                       │
├─────────────────────────────────────────────────────────────────────────────────────┤
│                                                                                      │
│  Sender Device                      Server                      AWS S3              │
│  ─────────────                      ──────                      ──────              │
│       │                                │                           │                │
│       │  1. Generate random                                        │                │
│       │     Media Key (256-bit)        │                           │                │
│       │                                │                           │                │
│       │  2. Encrypt media with         │                           │                │
│       │     AES-256-GCM                │                           │                │
│       │     • plaintext → ciphertext   │                           │                │
│       │     • Generate IV (96-bit)     │                           │                │
│       │     • Compute auth tag         │                           │                │
│       │                                │                           │                │
│       │  3. Compute SHA256 hash        │                           │                │
│       │     of encrypted blob          │                           │                │
│       │                                │                           │                │
│       │  4. Request upload URL ────────▶                           │                │
│       │     (with file size, type)     │                           │                │
│       │                                │                           │                │
│       │  ◀─────────────────────────────│  5. Return presigned URL  │                │
│       │     Pre-signed S3 URL          │                           │                │
│       │                                │                           │                │
│       │  6. Upload encrypted blob ─────────────────────────────────▶                │
│       │     directly to S3             │                           │                │
│       │     (bypasses server)          │                           │                │
│       │                                │                           │                │
│       │                                │  ◀────────────────────────│                │
│       │                                │     7. S3 applies SSE-KMS │                │
│       │                                │        (additional layer) │                │
│       │                                │                           │                │
│       │  8. Send message with          │                           │                │
│       │     encrypted Media Key ───────▶                           │                │
│       │     • Media Key encrypted      │                           │                │
│       │       with recipient's         │                           │                │
│       │       session key              │                           │                │
│       │     • Include: URL, hash,      │                           │                │
│       │       IV, media type           │                           │                │
│       │                                │                           │                │
└─────────────────────────────────────────────────────────────────────────────────────┘
```

### Media Download Decryption Flow

```
Recipient Device                    Server                      AWS CloudFront/S3
─────────────────                   ──────                      ─────────────────
      │                                │                              │
      │  1. Receive message with       │                              │
      │     encrypted media ref        │                              │
      │                                │                              │
      │  2. Decrypt Media Key using    │                              │
      │     session key                │                              │
      │                                │                              │
      │  3. Request download URL ──────▶                              │
      │                                │                              │
      │  ◀─────────────────────────────│  4. Return signed CloudFront │
      │     Signed URL (time-limited)  │     URL                      │
      │                                │                              │
      │  5. Download encrypted blob ───────────────────────────────────▶
      │     from CloudFront edge       │                              │
      │                                │                              │
      │  ◀───────────────────────────────────────────────────────────│
      │     Encrypted media blob       │                              │
      │                                │                              │
      │  6. Verify SHA256 hash         │                              │
      │     matches message            │                              │
      │                                │                              │
      │  7. Decrypt with Media Key     │                              │
      │     + IV using AES-256-GCM     │                              │
      │                                │                              │
      │  8. Display decrypted media    │                              │
      │                                │                              │
```

---

## Implementation

### Client-Side Encryption (TypeScript)

```typescript
// clients/shared/src/crypto/media-encryption.ts

import { randomBytes, createCipheriv, createDecipheriv, createHash } from 'crypto';

// Constants
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12;  // 96 bits (GCM recommended)
const AUTH_TAG_LENGTH = 16; // 128 bits

export interface EncryptedMedia {
  ciphertext: Uint8Array;
  iv: Uint8Array;
  authTag: Uint8Array;
  mediaKey: Uint8Array;
  hash: string;
}

export interface MediaKeyInfo {
  key: Uint8Array;
  iv: Uint8Array;
  hash: string;
}

/**
 * Encrypts media file with a random AES-256-GCM key
 * This happens entirely on the client device before upload
 */
export async function encryptMedia(plaintext: Uint8Array): Promise<EncryptedMedia> {
  // Generate random media key and IV
  const mediaKey = randomBytes(KEY_LENGTH);
  const iv = randomBytes(IV_LENGTH);

  // Create cipher
  const cipher = createCipheriv(ALGORITHM, mediaKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  // Encrypt
  const encrypted = Buffer.concat([
    cipher.update(plaintext),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  // Compute hash of encrypted content (for verification)
  const ciphertext = new Uint8Array(encrypted);
  const hash = createHash('sha256')
    .update(Buffer.concat([iv, ciphertext, authTag]))
    .digest('hex');

  return {
    ciphertext,
    iv: new Uint8Array(iv),
    authTag: new Uint8Array(authTag),
    mediaKey: new Uint8Array(mediaKey),
    hash,
  };
}

/**
 * Decrypts media file using the provided media key
 */
export async function decryptMedia(
  ciphertext: Uint8Array,
  mediaKey: Uint8Array,
  iv: Uint8Array,
  authTag: Uint8Array,
  expectedHash: string
): Promise<Uint8Array> {
  // Verify hash first
  const actualHash = createHash('sha256')
    .update(Buffer.concat([Buffer.from(iv), Buffer.from(ciphertext), Buffer.from(authTag)]))
    .digest('hex');

  if (actualHash !== expectedHash) {
    throw new Error('Media integrity check failed: hash mismatch');
  }

  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, mediaKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  // Decrypt
  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]);

  return new Uint8Array(decrypted);
}

/**
 * Encrypts the media key for a specific recipient using their session key
 * This is sent as part of the message, not stored on server
 */
export async function encryptMediaKeyForRecipient(
  mediaKey: Uint8Array,
  iv: Uint8Array,
  hash: string,
  sessionKey: CryptoKey
): Promise<Uint8Array> {
  // Combine media key info
  const mediaKeyInfo = JSON.stringify({
    key: Buffer.from(mediaKey).toString('base64'),
    iv: Buffer.from(iv).toString('base64'),
    hash,
  });

  // Encrypt with session key (derived from Signal Protocol)
  const encoder = new TextEncoder();
  const data = encoder.encode(mediaKeyInfo);

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: randomBytes(12) },
    sessionKey,
    data
  );

  return new Uint8Array(encrypted);
}
```

### Server-Side Encryption Configuration

```go
// services/media-service/internal/s3/encryption.go

package s3

import (
    "context"
    "fmt"

    "github.com/aws/aws-sdk-go-v2/aws"
    "github.com/aws/aws-sdk-go-v2/service/s3"
    "github.com/aws/aws-sdk-go-v2/service/s3/types"
)

// ServerSideEncryption configures S3 bucket encryption
type ServerSideEncryption struct {
    client *s3.Client
    kmsKey string
}

// ConfigureBucketEncryption sets up SSE-KMS for a bucket
func (e *ServerSideEncryption) ConfigureBucketEncryption(
    ctx context.Context,
    bucket string,
) error {
    _, err := e.client.PutBucketEncryption(ctx, &s3.PutBucketEncryptionInput{
        Bucket: aws.String(bucket),
        ServerSideEncryptionConfiguration: &types.ServerSideEncryptionConfiguration{
            Rules: []types.ServerSideEncryptionRule{
                {
                    ApplyServerSideEncryptionByDefault: &types.ServerSideEncryptionByDefault{
                        SSEAlgorithm:   types.ServerSideEncryptionAwsKms,
                        KMSMasterKeyID: aws.String(e.kmsKey),
                    },
                    BucketKeyEnabled: aws.Bool(true), // Reduces KMS costs
                },
            },
        },
    })
    if err != nil {
        return fmt.Errorf("failed to configure bucket encryption: %w", err)
    }

    return nil
}

// UploadWithEncryption uploads an object with SSE-KMS
// Note: The content should ALREADY be E2EE encrypted by the client
func (e *ServerSideEncryption) UploadWithEncryption(
    ctx context.Context,
    bucket, key string,
    content []byte,
    metadata map[string]string,
) error {
    _, err := e.client.PutObject(ctx, &s3.PutObjectInput{
        Bucket:               aws.String(bucket),
        Key:                  aws.String(key),
        Body:                 nil, // Using pre-signed URLs, not direct upload
        ServerSideEncryption: types.ServerSideEncryptionAwsKms,
        SSEKMSKeyId:          aws.String(e.kmsKey),
        BucketKeyEnabled:     aws.Bool(true),
        Metadata:             metadata,
    })
    if err != nil {
        return fmt.Errorf("failed to upload encrypted object: %w", err)
    }

    return nil
}
```

---

## AWS KMS Configuration

### Terraform KMS Keys

```hcl
# terraform/modules/kms/main.tf

# Media encryption key
resource "aws_kms_key" "media" {
  description             = "KMS key for QuckApp media encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
  multi_region            = var.environment == "prod"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      },
      {
        Sid    = "Allow CloudFront Service"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action = [
          "kms:Decrypt"
        ]
        Resource = "*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.media.arn
          }
        }
      },
      {
        Sid    = "Allow Media Service"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.media_service.arn
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = {
    Environment = var.environment
    Service     = "media"
  }
}

resource "aws_kms_alias" "media" {
  name          = "alias/quckapp-media-${var.environment}"
  target_key_id = aws_kms_key.media.key_id
}

# Replica key for multi-region (production only)
resource "aws_kms_replica_key" "media_eu" {
  count = var.environment == "prod" ? 1 : 0

  provider = aws.eu-west-1

  description             = "Replica of QuckApp media encryption key (EU)"
  primary_key_arn         = aws_kms_key.media.arn
  deletion_window_in_days = 30
}

resource "aws_kms_replica_key" "media_apac" {
  count = var.environment == "prod" ? 1 : 0

  provider = aws.ap-southeast-1

  description             = "Replica of QuckApp media encryption key (APAC)"
  primary_key_arn         = aws_kms_key.media.arn
  deletion_window_in_days = 30
}
```

---

## Security Comparison

### QuckApp vs WhatsApp Encryption

| Feature | WhatsApp | QuckApp |
|---------|----------|---------|
| **E2EE Protocol** | Signal Protocol | Signal Protocol |
| **Message Encryption** | AES-256-GCM | AES-256-GCM |
| **Key Exchange** | X3DH + Double Ratchet | X3DH + Double Ratchet |
| **Media Encryption** | AES-256-CBC → GCM | AES-256-GCM |
| **Server Access** | Cannot decrypt | Cannot decrypt |
| **Storage Encryption** | Proprietary | AWS SSE-KMS |
| **Key Backup** | iCloud/Google (optional) | User-controlled |
| **Forward Secrecy** | Yes | Yes |
| **Post-Compromise Security** | Yes | Yes |

### What the Server Sees

```
┌─────────────────────────────────────────────────────────────────┐
│                    Server's View of Data                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ✓ CAN SEE:                                                     │
│  ──────────                                                     │
│  • Encrypted blob (random bytes)                                │
│  • File size                                                    │
│  • Upload timestamp                                             │
│  • Sender user ID                                               │
│  • Recipient user ID(s)                                         │
│  • Message metadata (channel, timestamp)                        │
│                                                                  │
│  ✗ CANNOT SEE:                                                  │
│  ─────────────                                                  │
│  • Media content (encrypted with client key)                    │
│  • Media key (encrypted in message)                             │
│  • Decrypted message content                                    │
│  • File names (encrypted in metadata)                           │
│  • Thumbnails (generated client-side)                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Compliance & Audit

### Encryption Audit Trail

```yaml
# CloudWatch Logs for KMS usage
logGroupName: /aws/kms/quckapp-media

# Sample audit event
{
  "eventVersion": "1.08",
  "eventTime": "2024-01-15T10:30:00Z",
  "eventSource": "kms.amazonaws.com",
  "eventName": "GenerateDataKey",
  "awsRegion": "us-east-1",
  "sourceIPAddress": "10.0.1.50",
  "userAgent": "aws-sdk-go/1.44.0",
  "requestParameters": {
    "keyId": "alias/quckapp-media-prod",
    "keySpec": "AES_256"
  },
  "userIdentity": {
    "type": "AssumedRole",
    "arn": "arn:aws:sts::123456789:assumed-role/quckapp-media-service/i-xxx"
  }
}
```

### Compliance Standards

| Standard | Requirement | QuckApp Implementation |
|----------|-------------|------------------------|
| **SOC 2** | Encryption at rest | SSE-KMS + E2EE |
| **GDPR** | Data protection | E2EE + user consent |
| **HIPAA** | PHI encryption | AES-256 + audit logs |
| **PCI DSS** | Cardholder data | Not applicable (no payment storage) |

---

## Related Documentation

- [AWS Infrastructure](./aws.md) - Overall AWS architecture
- [S3 Media Storage](./s3.md) - S3 configuration
- [CloudFront CDN](./cloudfront.md) - CDN setup
- [Security](../architecture/security.md) - Overall security architecture
