---
sidebar_position: 3
---

# Search Service

Go service for full-text search, autocomplete, and relevance ranking using Elasticsearch.

## Overview

| Property | Value |
|----------|-------|
| **Port** | 5006 |
| **Search Engine** | Elasticsearch 8.x |
| **Database** | MySQL (metadata) |
| **Framework** | Gin |
| **Language** | Go 1.21 |

## Features

- Full-text search across messages, users, and channels
- Fuzzy matching and typo tolerance
- Autocomplete and search suggestions
- Faceted search with filters
- Relevance ranking and boosting
- Real-time indexing via Kafka
- Search analytics and insights
- Multi-language support

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   API Gateway   │────▶│  Search Service │────▶│  Elasticsearch  │
└─────────────────┘     └────────┬────────┘     │    Cluster      │
                                 │              └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │  Kafka Consumer │
                        │  (Indexer)      │
                        └────────┬────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌───────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   messages    │      │     users       │      │    channels     │
│   .created    │      │    .updated     │      │    .created     │
└───────────────┘      └─────────────────┘      └─────────────────┘
```

## Elasticsearch Configuration

### Cluster Settings

```yaml
# elasticsearch.yml
cluster.name: quckapp-search
node.name: es-node-1

network.host: 0.0.0.0
http.port: 9200
transport.port: 9300

discovery.seed_hosts:
  - es-node-1:9300
  - es-node-2:9300
  - es-node-3:9300

cluster.initial_master_nodes:
  - es-node-1
  - es-node-2
  - es-node-3

# Memory settings
bootstrap.memory_lock: true

# Security
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.http.ssl.enabled: true

# Performance
indices.memory.index_buffer_size: 30%
indices.queries.cache.size: 20%
thread_pool.search.queue_size: 1000
thread_pool.write.queue_size: 1000
```

### Index Templates

```json
// PUT _index_template/messages_template
{
  "index_patterns": ["messages-*"],
  "priority": 100,
  "template": {
    "settings": {
      "number_of_shards": 5,
      "number_of_replicas": 1,
      "refresh_interval": "1s",
      "analysis": {
        "analyzer": {
          "message_analyzer": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
              "lowercase",
              "asciifolding",
              "word_delimiter_graph",
              "english_stemmer",
              "edge_ngram_filter"
            ]
          },
          "autocomplete_analyzer": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
              "lowercase",
              "edge_ngram_filter"
            ]
          },
          "search_analyzer": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": [
              "lowercase",
              "asciifolding",
              "english_stemmer"
            ]
          }
        },
        "filter": {
          "english_stemmer": {
            "type": "stemmer",
            "language": "english"
          },
          "edge_ngram_filter": {
            "type": "edge_ngram",
            "min_gram": 2,
            "max_gram": 20
          }
        }
      }
    },
    "mappings": {
      "dynamic": "strict",
      "properties": {
        "message_id": {
          "type": "keyword"
        },
        "channel_id": {
          "type": "keyword"
        },
        "workspace_id": {
          "type": "keyword"
        },
        "sender_id": {
          "type": "keyword"
        },
        "sender_name": {
          "type": "text",
          "analyzer": "autocomplete_analyzer",
          "search_analyzer": "search_analyzer",
          "fields": {
            "keyword": { "type": "keyword" }
          }
        },
        "content": {
          "type": "text",
          "analyzer": "message_analyzer",
          "search_analyzer": "search_analyzer",
          "fields": {
            "exact": { "type": "keyword" }
          }
        },
        "type": {
          "type": "keyword"
        },
        "attachments": {
          "type": "nested",
          "properties": {
            "filename": { "type": "text" },
            "mimetype": { "type": "keyword" },
            "size": { "type": "long" }
          }
        },
        "reactions": {
          "type": "keyword"
        },
        "thread_id": {
          "type": "keyword"
        },
        "is_pinned": {
          "type": "boolean"
        },
        "created_at": {
          "type": "date"
        },
        "updated_at": {
          "type": "date"
        }
      }
    }
  }
}
```

### User Index Mapping

```json
// PUT _index_template/users_template
{
  "index_patterns": ["users"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1,
      "analysis": {
        "analyzer": {
          "name_analyzer": {
            "type": "custom",
            "tokenizer": "standard",
            "filter": ["lowercase", "asciifolding", "edge_ngram_filter"]
          }
        },
        "filter": {
          "edge_ngram_filter": {
            "type": "edge_ngram",
            "min_gram": 1,
            "max_gram": 20
          }
        }
      }
    },
    "mappings": {
      "properties": {
        "user_id": { "type": "keyword" },
        "username": {
          "type": "text",
          "analyzer": "name_analyzer",
          "search_analyzer": "standard",
          "fields": {
            "keyword": { "type": "keyword" },
            "suggest": { "type": "completion" }
          }
        },
        "display_name": {
          "type": "text",
          "analyzer": "name_analyzer",
          "search_analyzer": "standard",
          "fields": {
            "keyword": { "type": "keyword" },
            "suggest": { "type": "completion" }
          }
        },
        "email": {
          "type": "keyword"
        },
        "avatar_url": {
          "type": "keyword",
          "index": false
        },
        "status": {
          "type": "keyword"
        },
        "title": {
          "type": "text"
        },
        "department": {
          "type": "keyword"
        },
        "workspace_ids": {
          "type": "keyword"
        },
        "created_at": {
          "type": "date"
        },
        "last_active_at": {
          "type": "date"
        }
      }
    }
  }
}
```

### Channel Index Mapping

```json
// PUT _index_template/channels_template
{
  "index_patterns": ["channels"],
  "template": {
    "settings": {
      "number_of_shards": 3,
      "number_of_replicas": 1
    },
    "mappings": {
      "properties": {
        "channel_id": { "type": "keyword" },
        "workspace_id": { "type": "keyword" },
        "name": {
          "type": "text",
          "analyzer": "standard",
          "fields": {
            "keyword": { "type": "keyword" },
            "suggest": { "type": "completion" }
          }
        },
        "description": {
          "type": "text"
        },
        "type": {
          "type": "keyword"
        },
        "is_private": {
          "type": "boolean"
        },
        "member_count": {
          "type": "integer"
        },
        "member_ids": {
          "type": "keyword"
        },
        "created_by": {
          "type": "keyword"
        },
        "created_at": {
          "type": "date"
        },
        "last_message_at": {
          "type": "date"
        }
      }
    }
  }
}
```

## Go Elasticsearch Client

### Client Configuration

```go
package elasticsearch

import (
    "context"
    "crypto/tls"
    "encoding/json"
    "fmt"
    "net/http"
    "os"
    "time"

    "github.com/elastic/go-elasticsearch/v8"
    "github.com/elastic/go-elasticsearch/v8/esapi"
)

type Client struct {
    es     *elasticsearch.Client
    config *Config
}

type Config struct {
    Addresses  []string
    Username   string
    Password   string
    CACert     string
    MaxRetries int
    Timeout    time.Duration
}

func NewClient(cfg *Config) (*Client, error) {
    transport := &http.Transport{
        TLSClientConfig: &tls.Config{
            MinVersion: tls.VersionTLS12,
        },
        MaxIdleConnsPerHost:   10,
        ResponseHeaderTimeout: cfg.Timeout,
    }

    es, err := elasticsearch.NewClient(elasticsearch.Config{
        Addresses:  cfg.Addresses,
        Username:   cfg.Username,
        Password:   cfg.Password,
        CACert:     []byte(cfg.CACert),
        Transport:  transport,
        MaxRetries: cfg.MaxRetries,
        RetryOnStatus: []int{502, 503, 504},
    })
    if err != nil {
        return nil, fmt.Errorf("failed to create elasticsearch client: %w", err)
    }

    // Test connection
    res, err := es.Ping()
    if err != nil {
        return nil, fmt.Errorf("elasticsearch ping failed: %w", err)
    }
    defer res.Body.Close()

    return &Client{es: es, config: cfg}, nil
}

func NewClientFromEnv() (*Client, error) {
    return NewClient(&Config{
        Addresses:  []string{os.Getenv("ELASTICSEARCH_URL")},
        Username:   os.Getenv("ELASTICSEARCH_USERNAME"),
        Password:   os.Getenv("ELASTICSEARCH_PASSWORD"),
        CACert:     os.Getenv("ELASTICSEARCH_CA_CERT"),
        MaxRetries: 3,
        Timeout:    30 * time.Second,
    })
}
```

### Search Operations

```go
package search

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"

    "github.com/quckapp/search-service/elasticsearch"
)

type SearchService struct {
    client *elasticsearch.Client
}

type SearchRequest struct {
    Query       string            `json:"query"`
    WorkspaceID string            `json:"workspace_id"`
    ChannelIDs  []string          `json:"channel_ids,omitempty"`
    Type        string            `json:"type,omitempty"`
    From        int               `json:"from,omitempty"`
    Size        int               `json:"size,omitempty"`
    Sort        string            `json:"sort,omitempty"`
    Filters     map[string]string `json:"filters,omitempty"`
    DateRange   *DateRange        `json:"date_range,omitempty"`
}

type DateRange struct {
    From string `json:"from,omitempty"`
    To   string `json:"to,omitempty"`
}

type SearchResult struct {
    Total    int64         `json:"total"`
    Hits     []SearchHit   `json:"hits"`
    Aggs     Aggregations  `json:"aggregations,omitempty"`
    Took     int64         `json:"took_ms"`
    ScrollID string        `json:"scroll_id,omitempty"`
}

type SearchHit struct {
    ID        string                 `json:"id"`
    Index     string                 `json:"index"`
    Score     float64                `json:"score"`
    Source    map[string]interface{} `json:"source"`
    Highlight map[string][]string    `json:"highlight,omitempty"`
}

// SearchMessages performs full-text search on messages
func (s *SearchService) SearchMessages(ctx context.Context, req *SearchRequest) (*SearchResult, error) {
    query := map[string]interface{}{
        "query": map[string]interface{}{
            "bool": map[string]interface{}{
                "must": []map[string]interface{}{
                    {
                        "multi_match": map[string]interface{}{
                            "query":     req.Query,
                            "fields":    []string{"content^3", "sender_name", "attachments.filename"},
                            "type":      "best_fields",
                            "fuzziness": "AUTO",
                            "operator":  "and",
                        },
                    },
                },
                "filter": s.buildFilters(req),
            },
        },
        "highlight": map[string]interface{}{
            "fields": map[string]interface{}{
                "content": map[string]interface{}{
                    "fragment_size":       150,
                    "number_of_fragments": 3,
                    "pre_tags":            []string{"<mark>"},
                    "post_tags":           []string{"</mark>"},
                },
            },
        },
        "from": req.From,
        "size": s.getSize(req.Size),
        "sort": s.buildSort(req.Sort),
        "aggs": map[string]interface{}{
            "by_channel": map[string]interface{}{
                "terms": map[string]interface{}{
                    "field": "channel_id",
                    "size":  10,
                },
            },
            "by_sender": map[string]interface{}{
                "terms": map[string]interface{}{
                    "field": "sender_id",
                    "size":  10,
                },
            },
            "by_date": map[string]interface{}{
                "date_histogram": map[string]interface{}{
                    "field":             "created_at",
                    "calendar_interval": "day",
                },
            },
        },
    }

    return s.executeSearch(ctx, "messages-*", query)
}

// SearchUsers performs user search with autocomplete
func (s *SearchService) SearchUsers(ctx context.Context, req *SearchRequest) (*SearchResult, error) {
    query := map[string]interface{}{
        "query": map[string]interface{}{
            "bool": map[string]interface{}{
                "should": []map[string]interface{}{
                    {
                        "match": map[string]interface{}{
                            "username": map[string]interface{}{
                                "query":     req.Query,
                                "boost":     2.0,
                                "fuzziness": "AUTO",
                            },
                        },
                    },
                    {
                        "match": map[string]interface{}{
                            "display_name": map[string]interface{}{
                                "query":     req.Query,
                                "boost":     1.5,
                                "fuzziness": "AUTO",
                            },
                        },
                    },
                    {
                        "prefix": map[string]interface{}{
                            "email": req.Query,
                        },
                    },
                },
                "minimum_should_match": 1,
                "filter": []map[string]interface{}{
                    {
                        "term": map[string]interface{}{
                            "workspace_ids": req.WorkspaceID,
                        },
                    },
                },
            },
        },
        "from": req.From,
        "size": s.getSize(req.Size),
    }

    return s.executeSearch(ctx, "users", query)
}

// SearchChannels performs channel search
func (s *SearchService) SearchChannels(ctx context.Context, req *SearchRequest, userID string) (*SearchResult, error) {
    query := map[string]interface{}{
        "query": map[string]interface{}{
            "bool": map[string]interface{}{
                "must": []map[string]interface{}{
                    {
                        "multi_match": map[string]interface{}{
                            "query":  req.Query,
                            "fields": []string{"name^2", "description"},
                            "type":   "best_fields",
                        },
                    },
                },
                "filter": []map[string]interface{}{
                    {
                        "term": map[string]interface{}{
                            "workspace_id": req.WorkspaceID,
                        },
                    },
                    {
                        "bool": map[string]interface{}{
                            "should": []map[string]interface{}{
                                {"term": map[string]interface{}{"is_private": false}},
                                {"term": map[string]interface{}{"member_ids": userID}},
                            },
                        },
                    },
                },
            },
        },
        "from": req.From,
        "size": s.getSize(req.Size),
        "sort": []map[string]interface{}{
            {"member_count": "desc"},
            {"_score": "desc"},
        },
    }

    return s.executeSearch(ctx, "channels", query)
}

func (s *SearchService) buildFilters(req *SearchRequest) []map[string]interface{} {
    filters := []map[string]interface{}{
        {"term": map[string]interface{}{"workspace_id": req.WorkspaceID}},
    }

    if len(req.ChannelIDs) > 0 {
        filters = append(filters, map[string]interface{}{
            "terms": map[string]interface{}{"channel_id": req.ChannelIDs},
        })
    }

    if req.Type != "" {
        filters = append(filters, map[string]interface{}{
            "term": map[string]interface{}{"type": req.Type},
        })
    }

    if req.DateRange != nil {
        rangeFilter := map[string]interface{}{}
        if req.DateRange.From != "" {
            rangeFilter["gte"] = req.DateRange.From
        }
        if req.DateRange.To != "" {
            rangeFilter["lte"] = req.DateRange.To
        }
        filters = append(filters, map[string]interface{}{
            "range": map[string]interface{}{"created_at": rangeFilter},
        })
    }

    return filters
}

func (s *SearchService) buildSort(sort string) []map[string]interface{} {
    switch sort {
    case "newest":
        return []map[string]interface{}{{"created_at": "desc"}, {"_score": "desc"}}
    case "oldest":
        return []map[string]interface{}{{"created_at": "asc"}, {"_score": "desc"}}
    default:
        return []map[string]interface{}{{"_score": "desc"}, {"created_at": "desc"}}
    }
}

func (s *SearchService) getSize(size int) int {
    if size <= 0 || size > 100 {
        return 20
    }
    return size
}

func (s *SearchService) executeSearch(ctx context.Context, index string, query map[string]interface{}) (*SearchResult, error) {
    var buf bytes.Buffer
    if err := json.NewEncoder(&buf).Encode(query); err != nil {
        return nil, fmt.Errorf("failed to encode query: %w", err)
    }

    res, err := s.client.Search(
        s.client.Search.WithContext(ctx),
        s.client.Search.WithIndex(index),
        s.client.Search.WithBody(&buf),
        s.client.Search.WithTrackTotalHits(true),
    )
    if err != nil {
        return nil, fmt.Errorf("search request failed: %w", err)
    }
    defer res.Body.Close()

    if res.IsError() {
        return nil, fmt.Errorf("search error: %s", res.String())
    }

    var result map[string]interface{}
    if err := json.NewDecoder(res.Body).Decode(&result); err != nil {
        return nil, fmt.Errorf("failed to decode response: %w", err)
    }

    return s.parseSearchResult(result)
}
```

### Autocomplete / Suggestions

```go
// Autocomplete provides search-as-you-type functionality
func (s *SearchService) Autocomplete(ctx context.Context, prefix, index, field string, size int) ([]string, error) {
    query := map[string]interface{}{
        "suggest": map[string]interface{}{
            "autocomplete": map[string]interface{}{
                "prefix": prefix,
                "completion": map[string]interface{}{
                    "field":           field + ".suggest",
                    "size":            size,
                    "skip_duplicates": true,
                    "fuzzy": map[string]interface{}{
                        "fuzziness": "AUTO",
                    },
                },
            },
        },
    }

    var buf bytes.Buffer
    json.NewEncoder(&buf).Encode(query)

    res, err := s.client.Search(
        s.client.Search.WithContext(ctx),
        s.client.Search.WithIndex(index),
        s.client.Search.WithBody(&buf),
    )
    if err != nil {
        return nil, err
    }
    defer res.Body.Close()

    var result map[string]interface{}
    json.NewDecoder(res.Body).Decode(&result)

    suggestions := []string{}
    if suggest, ok := result["suggest"].(map[string]interface{}); ok {
        if autocomplete, ok := suggest["autocomplete"].([]interface{}); ok && len(autocomplete) > 0 {
            if options, ok := autocomplete[0].(map[string]interface{})["options"].([]interface{}); ok {
                for _, opt := range options {
                    if text, ok := opt.(map[string]interface{})["text"].(string); ok {
                        suggestions = append(suggestions, text)
                    }
                }
            }
        }
    }

    return suggestions, nil
}

// SearchSuggestions provides "did you mean" functionality
func (s *SearchService) SearchSuggestions(ctx context.Context, query, index string) ([]string, error) {
    suggestionQuery := map[string]interface{}{
        "suggest": map[string]interface{}{
            "text": query,
            "simple_phrase": map[string]interface{}{
                "phrase": map[string]interface{}{
                    "field":      "content",
                    "size":       3,
                    "gram_size":  3,
                    "direct_generator": []map[string]interface{}{
                        {
                            "field":        "content",
                            "suggest_mode": "popular",
                        },
                    },
                    "highlight": map[string]interface{}{
                        "pre_tag":  "<em>",
                        "post_tag": "</em>",
                    },
                },
            },
        },
    }

    var buf bytes.Buffer
    json.NewEncoder(&buf).Encode(suggestionQuery)

    res, err := s.client.Search(
        s.client.Search.WithContext(ctx),
        s.client.Search.WithIndex(index),
        s.client.Search.WithBody(&buf),
    )
    if err != nil {
        return nil, err
    }
    defer res.Body.Close()

    // Parse suggestions from response
    var result map[string]interface{}
    json.NewDecoder(res.Body).Decode(&result)

    return s.parseSuggestions(result), nil
}
```

### Indexing Operations

```go
package indexer

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "time"

    "github.com/elastic/go-elasticsearch/v8/esutil"
)

type Indexer struct {
    client     *elasticsearch.Client
    bulkIndexer esutil.BulkIndexer
}

func NewIndexer(client *elasticsearch.Client) (*Indexer, error) {
    bi, err := esutil.NewBulkIndexer(esutil.BulkIndexerConfig{
        Client:        client,
        NumWorkers:    4,
        FlushBytes:    5e6, // 5MB
        FlushInterval: 30 * time.Second,
        OnError: func(ctx context.Context, err error) {
            log.Printf("Bulk indexer error: %v", err)
        },
    })
    if err != nil {
        return nil, err
    }

    return &Indexer{client: client, bulkIndexer: bi}, nil
}

// IndexMessage indexes a single message
func (i *Indexer) IndexMessage(ctx context.Context, msg *Message) error {
    index := fmt.Sprintf("messages-%s", msg.CreatedAt.Format("2006.01"))

    doc := map[string]interface{}{
        "message_id":   msg.ID,
        "channel_id":   msg.ChannelID,
        "workspace_id": msg.WorkspaceID,
        "sender_id":    msg.SenderID,
        "sender_name":  msg.SenderName,
        "content":      msg.Content,
        "type":         msg.Type,
        "attachments":  msg.Attachments,
        "reactions":    msg.Reactions,
        "thread_id":    msg.ThreadID,
        "is_pinned":    msg.IsPinned,
        "created_at":   msg.CreatedAt,
        "updated_at":   msg.UpdatedAt,
    }

    data, _ := json.Marshal(doc)

    return i.bulkIndexer.Add(ctx, esutil.BulkIndexerItem{
        Action:     "index",
        Index:      index,
        DocumentID: msg.ID,
        Body:       bytes.NewReader(data),
        OnSuccess: func(ctx context.Context, item esutil.BulkIndexerItem, res esutil.BulkIndexerResponseItem) {
            log.Printf("Indexed message %s", item.DocumentID)
        },
        OnFailure: func(ctx context.Context, item esutil.BulkIndexerItem, res esutil.BulkIndexerResponseItem, err error) {
            log.Printf("Failed to index message %s: %v", item.DocumentID, err)
        },
    })
}

// UpdateMessage updates an existing message
func (i *Indexer) UpdateMessage(ctx context.Context, msg *Message) error {
    index := fmt.Sprintf("messages-%s", msg.CreatedAt.Format("2006.01"))

    doc := map[string]interface{}{
        "doc": map[string]interface{}{
            "content":    msg.Content,
            "updated_at": msg.UpdatedAt,
        },
    }

    data, _ := json.Marshal(doc)

    return i.bulkIndexer.Add(ctx, esutil.BulkIndexerItem{
        Action:     "update",
        Index:      index,
        DocumentID: msg.ID,
        Body:       bytes.NewReader(data),
    })
}

// DeleteMessage removes a message from the index
func (i *Indexer) DeleteMessage(ctx context.Context, msgID string, createdAt time.Time) error {
    index := fmt.Sprintf("messages-%s", createdAt.Format("2006.01"))

    return i.bulkIndexer.Add(ctx, esutil.BulkIndexerItem{
        Action:     "delete",
        Index:      index,
        DocumentID: msgID,
    })
}

// IndexUser indexes a user document
func (i *Indexer) IndexUser(ctx context.Context, user *User) error {
    doc := map[string]interface{}{
        "user_id":        user.ID,
        "username":       user.Username,
        "display_name":   user.DisplayName,
        "email":          user.Email,
        "avatar_url":     user.AvatarURL,
        "status":         user.Status,
        "title":          user.Title,
        "department":     user.Department,
        "workspace_ids":  user.WorkspaceIDs,
        "created_at":     user.CreatedAt,
        "last_active_at": user.LastActiveAt,
    }

    data, _ := json.Marshal(doc)

    return i.bulkIndexer.Add(ctx, esutil.BulkIndexerItem{
        Action:     "index",
        Index:      "users",
        DocumentID: user.ID,
        Body:       bytes.NewReader(data),
    })
}

// Close flushes pending items and closes the bulk indexer
func (i *Indexer) Close(ctx context.Context) error {
    return i.bulkIndexer.Close(ctx)
}

// Stats returns bulk indexer statistics
func (i *Indexer) Stats() esutil.BulkIndexerStats {
    return i.bulkIndexer.Stats()
}
```

### Kafka Consumer for Real-time Indexing

```go
package consumer

import (
    "context"
    "encoding/json"
    "log"

    "github.com/segmentio/kafka-go"
)

type IndexerConsumer struct {
    reader  *kafka.Reader
    indexer *Indexer
}

func NewIndexerConsumer(brokers []string, indexer *Indexer) *IndexerConsumer {
    reader := kafka.NewReader(kafka.ReaderConfig{
        Brokers:        brokers,
        GroupID:        "search-indexer",
        Topic:          "messages.created",
        MinBytes:       10e3, // 10KB
        MaxBytes:       10e6, // 10MB
        CommitInterval: time.Second,
    })

    return &IndexerConsumer{reader: reader, indexer: indexer}
}

func (c *IndexerConsumer) Start(ctx context.Context) {
    for {
        select {
        case <-ctx.Done():
            return
        default:
            msg, err := c.reader.ReadMessage(ctx)
            if err != nil {
                log.Printf("Error reading message: %v", err)
                continue
            }

            c.processMessage(ctx, msg)
        }
    }
}

func (c *IndexerConsumer) processMessage(ctx context.Context, msg kafka.Message) {
    var event struct {
        EventType string          `json:"event_type"`
        Payload   json.RawMessage `json:"payload"`
    }

    if err := json.Unmarshal(msg.Value, &event); err != nil {
        log.Printf("Failed to unmarshal event: %v", err)
        return
    }

    switch event.EventType {
    case "message_created":
        var message Message
        json.Unmarshal(event.Payload, &message)
        c.indexer.IndexMessage(ctx, &message)

    case "message_updated":
        var message Message
        json.Unmarshal(event.Payload, &message)
        c.indexer.UpdateMessage(ctx, &message)

    case "message_deleted":
        var payload struct {
            MessageID string    `json:"message_id"`
            CreatedAt time.Time `json:"created_at"`
        }
        json.Unmarshal(event.Payload, &payload)
        c.indexer.DeleteMessage(ctx, payload.MessageID, payload.CreatedAt)

    case "user_updated":
        var user User
        json.Unmarshal(event.Payload, &user)
        c.indexer.IndexUser(ctx, &user)
    }
}
```

## API Endpoints

### Search Messages

```http
POST /api/search/messages
Content-Type: application/json
Authorization: Bearer {token}

{
  "query": "project deadline",
  "workspace_id": "ws-123",
  "channel_ids": ["ch-456", "ch-789"],
  "from": 0,
  "size": 20,
  "sort": "relevance",
  "date_range": {
    "from": "2024-01-01",
    "to": "2024-12-31"
  }
}
```

**Response:**

```json
{
  "total": 142,
  "hits": [
    {
      "id": "msg-abc123",
      "score": 12.5,
      "source": {
        "message_id": "msg-abc123",
        "channel_id": "ch-456",
        "sender_name": "John Doe",
        "content": "Let's discuss the project deadline tomorrow",
        "created_at": "2024-03-15T10:30:00Z"
      },
      "highlight": {
        "content": ["Let's discuss the <mark>project</mark> <mark>deadline</mark> tomorrow"]
      }
    }
  ],
  "aggregations": {
    "by_channel": [
      {"key": "ch-456", "doc_count": 85},
      {"key": "ch-789", "doc_count": 57}
    ],
    "by_date": [
      {"key": "2024-03-15", "doc_count": 12}
    ]
  },
  "took_ms": 23
}
```

### Search Users

```http
GET /api/search/users?q=john&workspace_id=ws-123&size=10
Authorization: Bearer {token}
```

### Search Channels

```http
GET /api/search/channels?q=engineering&workspace_id=ws-123
Authorization: Bearer {token}
```

### Autocomplete

```http
GET /api/search/autocomplete?q=joh&type=users&size=5
Authorization: Bearer {token}
```

### Reindex

```http
POST /api/search/reindex
Content-Type: application/json
Authorization: Bearer {admin-token}

{
  "index": "messages",
  "workspace_id": "ws-123",
  "from_date": "2024-01-01"
}
```

## Docker Compose (Development)

```yaml
version: '3.8'

services:
  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.11.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms1g -Xmx1g"
    ports:
      - "9200:9200"
    volumes:
      - es_data:/usr/share/elasticsearch/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9200"]
      interval: 30s
      timeout: 10s
      retries: 5

  kibana:
    image: docker.elastic.co/kibana/kibana:8.11.0
    environment:
      - ELASTICSEARCH_HOSTS=http://elasticsearch:9200
    ports:
      - "5601:5601"
    depends_on:
      elasticsearch:
        condition: service_healthy

  search-service:
    build: .
    environment:
      - ELASTICSEARCH_URL=http://elasticsearch:9200
      - KAFKA_BROKERS=kafka:9092
    ports:
      - "5006:5006"
    depends_on:
      - elasticsearch

volumes:
  es_data:
```

## Kubernetes Configuration

```yaml
apiVersion: elasticsearch.k8s.elastic.co/v1
kind: Elasticsearch
metadata:
  name: quckapp-search
  namespace: search
spec:
  version: 8.11.0
  nodeSets:
    - name: master
      count: 3
      config:
        node.roles: ["master"]
        xpack.security.enabled: true
        xpack.security.transport.ssl.enabled: true
      podTemplate:
        spec:
          containers:
            - name: elasticsearch
              resources:
                requests:
                  memory: 4Gi
                  cpu: 2
                limits:
                  memory: 4Gi
      volumeClaimTemplates:
        - metadata:
            name: elasticsearch-data
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 10Gi
            storageClassName: fast-ssd

    - name: data
      count: 3
      config:
        node.roles: ["data", "ingest"]
      podTemplate:
        spec:
          containers:
            - name: elasticsearch
              resources:
                requests:
                  memory: 8Gi
                  cpu: 4
                limits:
                  memory: 8Gi
      volumeClaimTemplates:
        - metadata:
            name: elasticsearch-data
          spec:
            accessModes: ["ReadWriteOnce"]
            resources:
              requests:
                storage: 500Gi
            storageClassName: fast-ssd
```

## Performance Tuning

### Index Settings

```json
// Optimize for search performance
PUT /messages-*/_settings
{
  "index": {
    "refresh_interval": "5s",
    "number_of_replicas": 1,
    "search.idle.after": "30s"
  }
}

// Force merge for read-only indices
POST /messages-2024.01/_forcemerge?max_num_segments=1
```

### Query Optimization

```go
// Use request cache for repeated queries
func (s *SearchService) SearchWithCache(ctx context.Context, req *SearchRequest) (*SearchResult, error) {
    query := s.buildQuery(req)
    query["request_cache"] = true

    return s.executeSearch(ctx, "messages-*", query)
}

// Use scroll API for large result sets
func (s *SearchService) ScrollSearch(ctx context.Context, index string, query map[string]interface{}) (<-chan SearchHit, error) {
    results := make(chan SearchHit, 100)

    go func() {
        defer close(results)

        res, _ := s.client.Search(
            s.client.Search.WithIndex(index),
            s.client.Search.WithBody(encodeQuery(query)),
            s.client.Search.WithScroll(time.Minute),
            s.client.Search.WithSize(1000),
        )

        scrollID := parseScrollID(res)

        for {
            hits := parseHits(res)
            for _, hit := range hits {
                results <- hit
            }

            if len(hits) == 0 {
                break
            }

            res, _ = s.client.Scroll(
                s.client.Scroll.WithScrollID(scrollID),
                s.client.Scroll.WithScroll(time.Minute),
            )
        }

        s.client.ClearScroll(s.client.ClearScroll.WithScrollID(scrollID))
    }()

    return results, nil
}
```

## Monitoring & Metrics

### Prometheus Metrics

```go
var (
    searchLatency = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "search_latency_seconds",
            Help:    "Search request latency",
            Buckets: []float64{0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5},
        },
        []string{"index", "status"},
    )

    searchTotal = prometheus.NewCounterVec(
        prometheus.CounterOpts{
            Name: "search_requests_total",
            Help: "Total search requests",
        },
        []string{"index", "status"},
    )

    indexingLatency = prometheus.NewHistogramVec(
        prometheus.HistogramOpts{
            Name:    "indexing_latency_seconds",
            Help:    "Document indexing latency",
            Buckets: []float64{0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25},
        },
        []string{"index"},
    )
)
```

### Elasticsearch Health Check

```go
func (c *Client) HealthCheck(ctx context.Context) (*ClusterHealth, error) {
    res, err := c.es.Cluster.Health(
        c.es.Cluster.Health.WithContext(ctx),
    )
    if err != nil {
        return nil, err
    }
    defer res.Body.Close()

    var health ClusterHealth
    json.NewDecoder(res.Body).Decode(&health)

    return &health, nil
}

type ClusterHealth struct {
    ClusterName         string `json:"cluster_name"`
    Status              string `json:"status"`
    NumberOfNodes       int    `json:"number_of_nodes"`
    ActivePrimaryShards int    `json:"active_primary_shards"`
    ActiveShards        int    `json:"active_shards"`
    UnassignedShards    int    `json:"unassigned_shards"`
}
```

## Environment Variables

```bash
# Elasticsearch
ELASTICSEARCH_URL=https://elasticsearch:9200
ELASTICSEARCH_USERNAME=elastic
ELASTICSEARCH_PASSWORD=changeme
ELASTICSEARCH_CA_CERT=/certs/ca.crt

# Service
PORT=5006
LOG_LEVEL=info

# Kafka (for indexing)
KAFKA_BROKERS=kafka-1:9092,kafka-2:9092,kafka-3:9092
KAFKA_CONSUMER_GROUP=search-indexer

# Performance
BULK_WORKERS=4
BULK_FLUSH_BYTES=5000000
BULK_FLUSH_INTERVAL=30s
```

## Health Check

```http
GET /health
```

```json
{
  "status": "healthy",
  "elasticsearch": {
    "status": "green",
    "nodes": 6,
    "active_shards": 150,
    "unassigned_shards": 0
  },
  "indices": {
    "messages": {"docs": 15000000, "size": "12.5gb"},
    "users": {"docs": 50000, "size": "25mb"},
    "channels": {"docs": 5000, "size": "5mb"}
  },
  "version": "1.0.0"
}
```
