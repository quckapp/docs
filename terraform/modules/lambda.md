# Lambda Module

Creates Lambda functions for media processing including thumbnail generation, video processing, and image optimization.

## Features

- Thumbnail generator for images
- Video thumbnail extractor
- Image optimizer (WebP/AVIF conversion)
- S3 event triggers
- SQS integration
- VPC connectivity (optional)
- X-Ray tracing
- Dead letter queues

## Usage

```hcl
module "lambda" {
  source = "../../modules/lambda"

  environment = "prod"

  # S3 Configuration
  media_bucket_name      = module.s3.media_bucket_id
  media_bucket_arn       = module.s3.media_bucket_arn
  thumbnails_bucket_name = module.s3.thumbnails_bucket_id
  thumbnails_bucket_arn  = module.s3.thumbnails_bucket_arn
  kms_key_arn            = module.kms.s3_media_key_arn

  # Functions to create
  create_thumbnail_generator = true
  create_video_thumbnail     = true
  create_image_optimizer     = true
  create_s3_triggers         = true

  # Deployment packages
  thumbnail_lambda_zip_path = "dist/thumbnail.zip"
  thumbnail_lambda_hash     = filebase64sha256("dist/thumbnail.zip")

  # Resources
  thumbnail_memory_size          = 1024
  thumbnail_timeout              = 30
  thumbnail_reserved_concurrency = 50

  # Configuration
  thumbnail_sizes = [
    { name = "small", width = 150, height = 150 },
    { name = "medium", width = 300, height = 300 },
    { name = "large", width = 600, height = 600 }
  ]

  # Logging
  log_retention_days  = 30
  enable_xray_tracing = true

  tags = var.tags
}
```

## Function Architecture

```
┌─────────────┐     ┌─────────────────────┐
│  S3 Upload  │────▶│ Thumbnail Generator │
└─────────────┘     └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   S3 Thumbnails     │
                    └─────────────────────┘

┌─────────────┐     ┌─────────────────────┐
│  S3 Video   │────▶│  Video Thumbnail    │
└─────────────┘     └──────────┬──────────┘
                               │
                    ┌──────────▼──────────┐
                    │   S3 Thumbnails     │
                    └─────────────────────┘

┌─────────────┐     ┌─────────────────────┐     ┌──────────────┐
│   Request   │────▶│  Image Optimizer    │────▶│ Optimized    │
│   (API)     │     │  (WebP/AVIF)        │     │ Image        │
└─────────────┘     └─────────────────────┘     └──────────────┘
```

## Thumbnail Generator

### Configuration

```hcl
thumbnail_sizes = [
  { name = "small", width = 150, height = 150 },
  { name = "medium", width = 300, height = 300 },
  { name = "large", width = 600, height = 600 }
]

thumbnail_output_format  = "webp"
thumbnail_output_quality = 85
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `THUMBNAILS_BUCKET` | Output bucket name |
| `THUMBNAIL_SIZES` | JSON array of sizes |
| `OUTPUT_FORMAT` | webp, jpeg, png |
| `OUTPUT_QUALITY` | 1-100 |

### Sample Code

```javascript
const sharp = require('sharp');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

exports.handler = async (event) => {
  const bucket = event.Records[0].s3.bucket.name;
  const key = decodeURIComponent(event.Records[0].s3.object.key);

  const image = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));

  for (const size of JSON.parse(process.env.THUMBNAIL_SIZES)) {
    const thumbnail = await sharp(await image.Body.toBuffer())
      .resize(size.width, size.height, { fit: 'cover' })
      .webp({ quality: parseInt(process.env.OUTPUT_QUALITY) })
      .toBuffer();

    await s3.send(new PutObjectCommand({
      Bucket: process.env.THUMBNAILS_BUCKET,
      Key: `${size.name}/${path.basename(key, path.extname(key))}.webp`,
      Body: thumbnail,
      ContentType: 'image/webp'
    }));
  }
};
```

## Video Thumbnail

### Configuration

```hcl
video_frame_positions = [1, 5, 10]  # Seconds into video
video_thumbnail_memory_size = 2048
video_thumbnail_timeout = 60
```

### Lambda Layer Requirements

- FFmpeg layer for video processing
- Available from AWS Serverless Application Repository

## Image Optimizer

### Configuration

```hcl
webp_quality = 85
avif_quality = 80
optimizer_max_width  = 2048
optimizer_max_height = 2048
```

### Use Case

Convert images to modern formats (WebP/AVIF) on-demand for browsers that support them.

## S3 Triggers

```hcl
# Photo uploads trigger thumbnail generation
s3_bucket_notification {
  lambda_function {
    lambda_function_arn = aws_lambda_function.thumbnail.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "photos/"
    filter_suffix       = ".jpg"
  }
}
```

## VPC Configuration

For Lambda functions that need to access VPC resources:

```hcl
vpc_subnet_ids         = module.vpc.private_subnet_ids
vpc_security_group_ids = [module.vpc.lambda_security_group_id]
```

**Note**: VPC-connected Lambda functions have cold start overhead.

## Variables

| Name | Description | Type | Default |
|------|-------------|------|---------|
| `environment` | Environment name | string | - |
| `media_bucket_name` | Source bucket | string | - |
| `thumbnails_bucket_name` | Output bucket | string | - |
| `create_thumbnail_generator` | Create function | bool | `true` |
| `thumbnail_memory_size` | Memory (MB) | number | `1024` |
| `thumbnail_timeout` | Timeout (seconds) | number | `30` |
| `thumbnail_sizes` | List of sizes | list(object) | See above |

## Outputs

| Name | Description |
|------|-------------|
| `thumbnail_generator_function_arn` | Function ARN |
| `thumbnail_generator_function_name` | Function name |
| `thumbnail_generator_role_arn` | IAM role ARN |
| `all_function_arns` | Map of all function ARNs |
| `all_log_groups` | Map of log group names |

## Cost Optimization

| Resource | Optimization |
|----------|-------------|
| Memory | Right-size based on profiling |
| Timeout | Set to realistic maximum |
| Concurrency | Use reserved concurrency |
| Provisioned | For consistent latency |

### Memory vs Duration Tradeoff

More memory = faster execution = potentially lower cost:

```
512MB  @ 5000ms = $0.000083
1024MB @ 2500ms = $0.000083
2048MB @ 1250ms = $0.000083
```

Test and profile to find optimal configuration.
