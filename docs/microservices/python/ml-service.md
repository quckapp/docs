---
sidebar_position: 5
---

# ML Service

Python service for machine learning predictions, model serving, and intelligent features using the Databricks Lakehouse Platform.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5008 |
| **Platform** | Databricks Lakehouse |
| **Framework** | FastAPI |
| **Language** | Python 3.11 |
| **ML Tracking** | MLflow |
| **Data Format** | Delta Lake |

## Features

- User recommendations and personalization
- Content ranking and relevance scoring
- Spam and abuse detection
- Sentiment analysis
- Model serving and inference
- Feature engineering pipelines
- A/B testing for ML models

## Databricks Platform Integration

QuckApp leverages the Databricks Lakehouse Platform for unified data analytics and machine learning capabilities.

### Core Technologies

#### Apache Spark

Distributed computing engine for large-scale data processing:

```python
from pyspark.sql import SparkSession

spark = SparkSession.builder \
    .appName("QuckApp-ML") \
    .config("spark.databricks.delta.preview.enabled", "true") \
    .getOrCreate()

# Process user interaction data
interactions_df = spark.read.format("delta").load("/mnt/quckapp/interactions")
features_df = interactions_df.groupBy("user_id").agg(
    count("message_id").alias("message_count"),
    avg("response_time").alias("avg_response_time")
)
```

#### Delta Lake

ACID-compliant data lake storage with versioning and time travel:

```python
from delta.tables import DeltaTable

# Write ML features to Delta Lake
features_df.write \
    .format("delta") \
    .mode("merge") \
    .option("mergeSchema", "true") \
    .save("/mnt/quckapp/ml-features")

# Time travel for reproducibility
historical_features = spark.read \
    .format("delta") \
    .option("versionAsOf", 10) \
    .load("/mnt/quckapp/ml-features")
```

#### MLflow

End-to-end ML lifecycle management:

```python
import mlflow
import mlflow.sklearn

mlflow.set_tracking_uri("databricks")
mlflow.set_experiment("/quckapp/recommendation-model")

with mlflow.start_run():
    # Log parameters
    mlflow.log_param("algorithm", "xgboost")
    mlflow.log_param("max_depth", 6)

    # Train model
    model = train_recommendation_model(features_df)

    # Log metrics
    mlflow.log_metric("auc", 0.92)
    mlflow.log_metric("precision", 0.88)

    # Register model
    mlflow.sklearn.log_model(model, "recommendation-model")
```

#### Delta Sharing

Secure data sharing across organizations:

```python
import delta_sharing

# Share ML features with partner services
profile = delta_sharing.SharingClient("/path/to/profile.share")
shared_features = delta_sharing.load_as_pandas(
    f"{profile}#quckapp.ml_features.user_embeddings"
)
```

### Databricks Products

#### Unity Catalog

Unified governance for data and AI assets:

```sql
-- Create catalog for ML assets
CREATE CATALOG IF NOT EXISTS quckapp_ml;
USE CATALOG quckapp_ml;

-- Register feature tables
CREATE TABLE ml_features.user_features (
    user_id STRING,
    embedding ARRAY<DOUBLE>,
    last_updated TIMESTAMP
) USING DELTA;

-- Grant access to ML service
GRANT SELECT ON TABLE ml_features.user_features TO `ml-service`;
```

#### Mosaic AI / Databricks IQ

AI-powered analytics and model development:

```python
from databricks.feature_store import FeatureStoreClient

fs = FeatureStoreClient()

# Create feature table
fs.create_table(
    name="quckapp_ml.features.user_activity",
    primary_keys=["user_id"],
    df=user_features_df,
    description="User activity features for recommendations"
)

# Use features for training
training_set = fs.create_training_set(
    df=labels_df,
    feature_lookups=[
        FeatureLookup(
            table_name="quckapp_ml.features.user_activity",
            feature_names=["message_count", "avg_response_time"],
            lookup_key="user_id"
        )
    ],
    label="conversion"
)
```

#### Workflows

Orchestrated ML pipelines:

```yaml
# databricks-workflow.yml
resources:
  jobs:
    ml_pipeline:
      name: "QuckApp ML Pipeline"
      schedule:
        quartz_cron_expression: "0 0 2 * * ?"
        timezone_id: "UTC"
      tasks:
        - task_key: feature_engineering
          notebook_task:
            notebook_path: /Repos/quckapp/ml/feature_engineering
          cluster_id: ${var.cluster_id}

        - task_key: model_training
          depends_on:
            - task_key: feature_engineering
          notebook_task:
            notebook_path: /Repos/quckapp/ml/model_training

        - task_key: model_deployment
          depends_on:
            - task_key: model_training
          notebook_task:
            notebook_path: /Repos/quckapp/ml/deploy_model
```

#### Serverless Compute

On-demand compute for inference:

```python
from databricks.sdk import WorkspaceClient

client = WorkspaceClient()

# Deploy model to serverless endpoint
endpoint = client.serving_endpoints.create(
    name="quckapp-recommendations",
    config={
        "served_models": [{
            "model_name": "recommendation-model",
            "model_version": "1",
            "workload_size": "Small",
            "scale_to_zero_enabled": True
        }]
    }
)
```

## API Endpoints

### Recommendations

```http
POST /api/ml/recommendations
Content-Type: application/json

{
  "user_id": "user-123",
  "context": {
    "channel_id": "channel-456",
    "time_of_day": "morning"
  },
  "limit": 10
}
```

### Spam Detection

```http
POST /api/ml/spam-check
Content-Type: application/json

{
  "content": "Check out this amazing offer!",
  "user_id": "user-789",
  "metadata": {
    "ip_address": "192.168.1.1",
    "user_agent": "Mozilla/5.0..."
  }
}
```

### Sentiment Analysis

```http
POST /api/ml/sentiment
Content-Type: application/json

{
  "messages": [
    {"id": "msg-1", "content": "This is great!"},
    {"id": "msg-2", "content": "I'm frustrated with this issue"}
  ]
}
```

## Cloud Integration

### Multi-Cloud Support

QuckApp ML Service supports Databricks on all major cloud providers:

| Cloud | Region | Features |
|-------|--------|----------|
| **Azure** | East US, West Europe | Primary deployment, Unity Catalog |
| **AWS** | us-east-1, eu-west-1 | Disaster recovery, S3 integration |
| **GCP** | us-central1 | BigQuery integration, Vertex AI |

### Azure Databricks Connection

```python
from databricks import sql
import os

connection = sql.connect(
    server_hostname=os.environ["DATABRICKS_HOST"],
    http_path=os.environ["DATABRICKS_HTTP_PATH"],
    access_token=os.environ["DATABRICKS_TOKEN"]
)

cursor = connection.cursor()
cursor.execute("SELECT * FROM quckapp_ml.features.user_embeddings LIMIT 100")
results = cursor.fetchall()
```

## Model Registry

### Registered Models

| Model | Version | Stage | Use Case |
|-------|---------|-------|----------|
| `recommendation-v2` | 3.1.0 | Production | User recommendations |
| `spam-classifier` | 2.4.0 | Production | Spam detection |
| `sentiment-bert` | 1.2.0 | Production | Sentiment analysis |
| `content-ranker` | 1.0.0 | Staging | Content ranking |

### Model Serving

```python
import requests

# Call deployed model endpoint
response = requests.post(
    f"{DATABRICKS_HOST}/serving-endpoints/quckapp-recommendations/invocations",
    headers={"Authorization": f"Bearer {DATABRICKS_TOKEN}"},
    json={
        "dataframe_records": [
            {"user_id": "user-123", "context_features": [...]}
        ]
    }
)

predictions = response.json()["predictions"]
```

## Environment Variables

```bash
# Databricks Connection
DATABRICKS_HOST=adb-xxxx.azuredatabricks.net
DATABRICKS_HTTP_PATH=/sql/1.0/warehouses/xxxx
DATABRICKS_TOKEN=dapi...

# MLflow
MLFLOW_TRACKING_URI=databricks
MLFLOW_EXPERIMENT_NAME=/quckapp/production

# Feature Store
FEATURE_STORE_URI=databricks://quckapp_ml

# Model Serving
MODEL_SERVING_ENDPOINT=https://adb-xxxx.azuredatabricks.net/serving-endpoints
```

## Monitoring

### Model Performance Metrics

```python
from databricks.sdk import WorkspaceClient

client = WorkspaceClient()

# Get endpoint metrics
metrics = client.serving_endpoints.get_metrics(
    name="quckapp-recommendations"
)

print(f"Latency P50: {metrics.latency_p50_ms}ms")
print(f"Latency P99: {metrics.latency_p99_ms}ms")
print(f"Request count: {metrics.request_count}")
```

### Data Quality Monitoring

```python
from databricks.sdk.service.catalog import MonitorInfo

# Monitor feature table quality
monitor = client.quality_monitors.create(
    table_name="quckapp_ml.features.user_activity",
    assets_dir="/mnt/quckapp/monitors",
    schedule={"quartz_cron_expression": "0 0 * * * ?"}
)
```

## Partner Ecosystem

QuckApp integrates with Databricks partner solutions:

- **Fivetran**: Data ingestion from external sources
- **dbt**: Data transformation and modeling
- **Great Expectations**: Data validation
- **Weights & Biases**: Experiment tracking
- **Monte Carlo**: Data observability

## Docker Configuration

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY . .

# Expose port
EXPOSE 5008

# Run with uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5008"]
```

## Health Check

```http
GET /health
```

```json
{
  "status": "healthy",
  "databricks_connection": "connected",
  "models_loaded": 3,
  "feature_store": "available",
  "version": "1.0.0"
}
```
