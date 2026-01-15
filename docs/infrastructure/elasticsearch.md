---
sidebar_position: 12
---

# Elasticsearch

QuckApp uses Elasticsearch for full-text search, providing fast and relevant search results across messages, users, channels, and files.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                   Elasticsearch Cluster                          │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │     Node 1      │  │     Node 2      │  │     Node 3      │  │
│  │ Master + Data   │──│ Master + Data   │──│ Master + Data   │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
│           └────────────────────┴────────────────────┘           │
│                         Cluster State                            │
└─────────────────────────────────────────────────────────────────┘
                               │
         ┌─────────────────────┼─────────────────────┐
         │                     │                     │
         ▼                     ▼                     ▼
   ┌───────────┐        ┌───────────┐        ┌───────────┐
   │  Search   │        │  Backend  │        │ Analytics │
   │  Service  │        │  Gateway  │        │  Service  │
   └───────────┘        └───────────┘        └───────────┘
```

## Services Using Elasticsearch

| Service | Usage |
|---------|-------|
| **search-service** (Go) | Primary search indexing and queries |
| **backend-gateway** (NestJS) | Search API endpoint |
| **analytics-service** (Python) | Log analysis, metrics aggregation |
| **moderation-service** (Python) | Content pattern detection |

## Index Mappings

### Messages Index

```json
PUT /QuckApp-messages
{
  "settings": {
    "number_of_shards": 5,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "message_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding", "message_stemmer", "message_stop"]
        },
        "autocomplete_analyzer": {
          "type": "custom",
          "tokenizer": "autocomplete_tokenizer",
          "filter": ["lowercase"]
        }
      },
      "tokenizer": {
        "autocomplete_tokenizer": {
          "type": "edge_ngram",
          "min_gram": 2,
          "max_gram": 20,
          "token_chars": ["letter", "digit"]
        }
      },
      "filter": {
        "message_stemmer": {
          "type": "stemmer",
          "language": "english"
        },
        "message_stop": {
          "type": "stop",
          "stopwords": "_english_"
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "channelId": { "type": "keyword" },
      "workspaceId": { "type": "keyword" },
      "userId": { "type": "keyword" },
      "content": {
        "type": "text",
        "analyzer": "message_analyzer",
        "fields": {
          "exact": { "type": "keyword" },
          "autocomplete": {
            "type": "text",
            "analyzer": "autocomplete_analyzer",
            "search_analyzer": "standard"
          }
        }
      },
      "attachments": {
        "type": "nested",
        "properties": {
          "filename": { "type": "text" },
          "mimeType": { "type": "keyword" }
        }
      },
      "mentions": { "type": "keyword" },
      "hasAttachments": { "type": "boolean" },
      "threadId": { "type": "keyword" },
      "deleted": { "type": "boolean" },
      "createdAt": { "type": "date" },
      "updatedAt": { "type": "date" }
    }
  }
}
```

### Users Index

```json
PUT /QuckApp-users
{
  "settings": {
    "number_of_shards": 2,
    "number_of_replicas": 1,
    "analysis": {
      "analyzer": {
        "name_analyzer": {
          "type": "custom",
          "tokenizer": "standard",
          "filter": ["lowercase", "asciifolding"]
        }
      }
    }
  },
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "email": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "displayName": {
        "type": "text",
        "analyzer": "name_analyzer",
        "fields": {
          "keyword": { "type": "keyword" },
          "suggest": {
            "type": "completion"
          }
        }
      },
      "fullName": {
        "type": "text",
        "analyzer": "name_analyzer"
      },
      "workspaces": { "type": "keyword" },
      "status": { "type": "keyword" },
      "avatarUrl": { "type": "keyword", "index": false },
      "createdAt": { "type": "date" }
    }
  }
}
```

### Channels Index

```json
PUT /QuckApp-channels
{
  "settings": {
    "number_of_shards": 2,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "workspaceId": { "type": "keyword" },
      "name": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" },
          "suggest": { "type": "completion" }
        }
      },
      "description": { "type": "text" },
      "type": { "type": "keyword" },
      "isArchived": { "type": "boolean" },
      "memberCount": { "type": "integer" },
      "createdAt": { "type": "date" }
    }
  }
}
```

### Files Index

```json
PUT /QuckApp-files
{
  "settings": {
    "number_of_shards": 3,
    "number_of_replicas": 1
  },
  "mappings": {
    "properties": {
      "id": { "type": "keyword" },
      "workspaceId": { "type": "keyword" },
      "channelId": { "type": "keyword" },
      "uploadedBy": { "type": "keyword" },
      "filename": {
        "type": "text",
        "fields": {
          "keyword": { "type": "keyword" }
        }
      },
      "mimeType": { "type": "keyword" },
      "size": { "type": "long" },
      "content": {
        "type": "text",
        "analyzer": "message_analyzer"
      },
      "createdAt": { "type": "date" }
    }
  }
}
```

## Docker Configuration

```yaml
# docker-compose.yml
services:
  elasticsearch:
    image: elasticsearch:8.8.0
    container_name: QuckApp-elasticsearch
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
      - cluster.name=QuckApp-cluster
      - bootstrap.memory_lock=true
    ulimits:
      memlock:
        soft: -1
        hard: -1
    volumes:
      - elasticsearch_data:/usr/share/elasticsearch/data
    ports:
      - "9200:9200"
      - "9300:9300"
    networks:
      - QuckApp-network
    healthcheck:
      test: curl -s http://localhost:9200/_cluster/health | grep -vq '"status":"red"'
      interval: 20s
      timeout: 10s
      retries: 10

volumes:
  elasticsearch_data:
```

### Multi-Node Cluster (Production)

```yaml
# docker-compose.es-cluster.yml
services:
  es01:
    image: elasticsearch:8.8.0
    environment:
      - node.name=es01
      - cluster.name=QuckApp-cluster
      - discovery.seed_hosts=es02,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
      - xpack.security.enabled=true
      - ELASTIC_PASSWORD=secret
    volumes:
      - es01_data:/usr/share/elasticsearch/data
    networks:
      - QuckApp-network

  es02:
    image: elasticsearch:8.8.0
    environment:
      - node.name=es02
      - cluster.name=QuckApp-cluster
      - discovery.seed_hosts=es01,es03
      - cluster.initial_master_nodes=es01,es02,es03
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    volumes:
      - es02_data:/usr/share/elasticsearch/data
    networks:
      - QuckApp-network

  es03:
    image: elasticsearch:8.8.0
    environment:
      - node.name=es03
      - cluster.name=QuckApp-cluster
      - discovery.seed_hosts=es01,es02
      - cluster.initial_master_nodes=es01,es02,es03
      - "ES_JAVA_OPTS=-Xms2g -Xmx2g"
    volumes:
      - es03_data:/usr/share/elasticsearch/data
    networks:
      - QuckApp-network

volumes:
  es01_data:
  es02_data:
  es03_data:
```

## Client Configuration

### Go (olivere/elastic)

```go
// elasticsearch/client.go
package elasticsearch

import (
    "context"
    "time"

    "github.com/olivere/elastic/v7"
)

type Client struct {
    es *elastic.Client
}

func NewClient(urls []string) (*Client, error) {
    client, err := elastic.NewClient(
        elastic.SetURL(urls...),
        elastic.SetSniff(false),
        elastic.SetHealthcheckInterval(10*time.Second),
        elastic.SetRetrier(elastic.NewBackoffRetrier(
            elastic.NewExponentialBackoff(100*time.Millisecond, 5*time.Second),
        )),
    )
    if err != nil {
        return nil, err
    }

    return &Client{es: client}, nil
}

func (c *Client) IndexMessage(ctx context.Context, msg *Message) error {
    _, err := c.es.Index().
        Index("QuckApp-messages").
        Id(msg.ID).
        BodyJson(msg).
        Do(ctx)
    return err
}

func (c *Client) SearchMessages(ctx context.Context, query string, workspaceID string, limit int) ([]*Message, error) {
    searchQuery := elastic.NewBoolQuery().
        Must(elastic.NewMultiMatchQuery(query, "content", "content.autocomplete").
            Type("best_fields").
            Fuzziness("AUTO")).
        Filter(elastic.NewTermQuery("workspaceId", workspaceID)).
        Filter(elastic.NewTermQuery("deleted", false))

    result, err := c.es.Search().
        Index("QuckApp-messages").
        Query(searchQuery).
        Sort("_score", false).
        Sort("createdAt", false).
        Size(limit).
        Do(ctx)
    if err != nil {
        return nil, err
    }

    var messages []*Message
    for _, hit := range result.Hits.Hits {
        var msg Message
        if err := json.Unmarshal(hit.Source, &msg); err != nil {
            continue
        }
        messages = append(messages, &msg)
    }
    return messages, nil
}
```

### NestJS (@elastic/elasticsearch)

```typescript
// elasticsearch.service.ts
import { Injectable } from '@nestjs/common';
import { Client } from '@elastic/elasticsearch';

@Injectable()
export class ElasticsearchService {
  private client: Client;

  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      maxRetries: 5,
      requestTimeout: 60000,
    });
  }

  async search(params: {
    query: string;
    workspaceId: string;
    type?: 'messages' | 'users' | 'channels' | 'files';
    limit?: number;
  }): Promise<SearchResult> {
    const { query, workspaceId, type, limit = 20 } = params;

    const indices = type
      ? [`QuckApp-${type}`]
      : ['QuckApp-messages', 'QuckApp-users', 'QuckApp-channels', 'QuckApp-files'];

    const response = await this.client.search({
      index: indices,
      body: {
        query: {
          bool: {
            must: {
              multi_match: {
                query,
                fields: ['content^3', 'displayName^2', 'name^2', 'filename', 'description'],
                type: 'best_fields',
                fuzziness: 'AUTO',
              },
            },
            filter: [
              { term: { workspaceId } },
            ],
          },
        },
        highlight: {
          fields: {
            content: {},
            displayName: {},
            name: {},
          },
          pre_tags: ['<mark>'],
          post_tags: ['</mark>'],
        },
        size: limit,
        sort: [
          { _score: 'desc' },
          { createdAt: 'desc' },
        ],
      },
    });

    return this.formatResults(response);
  }

  async indexDocument(index: string, id: string, document: any): Promise<void> {
    await this.client.index({
      index: `QuckApp-${index}`,
      id,
      body: document,
      refresh: true,
    });
  }

  async deleteDocument(index: string, id: string): Promise<void> {
    await this.client.delete({
      index: `QuckApp-${index}`,
      id,
    });
  }
}
```

### Python (elasticsearch-py)

```python
# elasticsearch_client.py
from elasticsearch import Elasticsearch, helpers
import os

es = Elasticsearch(
    hosts=[os.getenv('ELASTICSEARCH_URL', 'http://localhost:9200')],
    retry_on_timeout=True,
    max_retries=3
)

def search_messages(query: str, workspace_id: str, limit: int = 20):
    body = {
        "query": {
            "bool": {
                "must": {
                    "multi_match": {
                        "query": query,
                        "fields": ["content^3", "content.autocomplete"],
                        "type": "best_fields",
                        "fuzziness": "AUTO"
                    }
                },
                "filter": [
                    {"term": {"workspaceId": workspace_id}},
                    {"term": {"deleted": False}}
                ]
            }
        },
        "highlight": {
            "fields": {"content": {}}
        },
        "size": limit,
        "sort": [
            {"_score": "desc"},
            {"createdAt": "desc"}
        ]
    }

    response = es.search(index="QuckApp-messages", body=body)
    return response['hits']['hits']

def bulk_index_messages(messages: list):
    actions = [
        {
            "_index": "QuckApp-messages",
            "_id": msg['id'],
            "_source": msg
        }
        for msg in messages
    ]
    helpers.bulk(es, actions)
```

## Search Queries

### Global Search

```json
POST /QuckApp-*/_search
{
  "query": {
    "bool": {
      "must": {
        "multi_match": {
          "query": "project update",
          "fields": ["content^3", "displayName^2", "name^2", "filename"],
          "type": "best_fields",
          "fuzziness": "AUTO"
        }
      },
      "filter": [
        { "term": { "workspaceId": "workspace-uuid" } }
      ]
    }
  },
  "highlight": {
    "fields": {
      "content": { "fragment_size": 150, "number_of_fragments": 3 }
    }
  },
  "aggs": {
    "by_type": {
      "terms": { "field": "_index" }
    }
  },
  "size": 20
}
```

### User Autocomplete

```json
POST /QuckApp-users/_search
{
  "suggest": {
    "user-suggest": {
      "prefix": "joh",
      "completion": {
        "field": "displayName.suggest",
        "size": 10,
        "fuzzy": {
          "fuzziness": 1
        }
      }
    }
  }
}
```

### Messages in Date Range

```json
POST /QuckApp-messages/_search
{
  "query": {
    "bool": {
      "must": { "match": { "content": "meeting" } },
      "filter": [
        { "term": { "channelId": "channel-uuid" } },
        { "range": { "createdAt": { "gte": "2024-01-01", "lte": "2024-01-31" } } }
      ]
    }
  },
  "sort": [{ "createdAt": "desc" }],
  "size": 50
}
```

### Aggregation - Messages per Day

```json
POST /QuckApp-messages/_search
{
  "size": 0,
  "query": {
    "bool": {
      "filter": [
        { "term": { "workspaceId": "workspace-uuid" } },
        { "range": { "createdAt": { "gte": "now-30d" } } }
      ]
    }
  },
  "aggs": {
    "messages_per_day": {
      "date_histogram": {
        "field": "createdAt",
        "calendar_interval": "day"
      }
    }
  }
}
```

## Index Management

### Index Lifecycle Management

```json
PUT _ilm/policy/QuckApp-messages-policy
{
  "policy": {
    "phases": {
      "hot": {
        "min_age": "0ms",
        "actions": {
          "rollover": {
            "max_size": "50gb",
            "max_age": "30d"
          }
        }
      },
      "warm": {
        "min_age": "30d",
        "actions": {
          "shrink": { "number_of_shards": 1 },
          "forcemerge": { "max_num_segments": 1 }
        }
      },
      "delete": {
        "min_age": "365d",
        "actions": {
          "delete": {}
        }
      }
    }
  }
}
```

### Reindex API

```json
POST _reindex
{
  "source": {
    "index": "QuckApp-messages-old"
  },
  "dest": {
    "index": "QuckApp-messages"
  }
}
```

## Monitoring

### Cluster Health

```bash
# Cluster health
curl -X GET "localhost:9200/_cluster/health?pretty"

# Node stats
curl -X GET "localhost:9200/_nodes/stats?pretty"

# Index stats
curl -X GET "localhost:9200/QuckApp-*/_stats?pretty"

# Pending tasks
curl -X GET "localhost:9200/_cluster/pending_tasks?pretty"
```

### Prometheus Exporter

```yaml
# docker-compose.monitoring.yml
services:
  elasticsearch-exporter:
    image: quay.io/prometheuscommunity/elasticsearch-exporter:v1.6.0
    container_name: QuckApp-es-exporter
    command:
      - '--es.uri=http://elasticsearch:9200'
      - '--es.all'
      - '--es.indices'
    ports:
      - "9114:9114"
    networks:
      - QuckApp-network
```

## Backup & Recovery

### Snapshot Repository

```json
PUT _snapshot/QuckApp-backup
{
  "type": "s3",
  "settings": {
    "bucket": "QuckApp-es-backups",
    "region": "us-east-1",
    "compress": true
  }
}
```

### Create Snapshot

```json
PUT _snapshot/QuckApp-backup/snapshot-2024-01-15
{
  "indices": "QuckApp-*",
  "ignore_unavailable": true,
  "include_global_state": false
}
```

### Restore Snapshot

```json
POST _snapshot/QuckApp-backup/snapshot-2024-01-15/_restore
{
  "indices": "QuckApp-messages",
  "rename_pattern": "QuckApp-(.+)",
  "rename_replacement": "restored-QuckApp-$1"
}
```
