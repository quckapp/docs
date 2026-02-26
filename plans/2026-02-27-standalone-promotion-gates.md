# Standalone Per-Service Promotion Gates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Every service manages its own promotion gates — no central admin-service dependency. Each service has its own `/promotion/*` endpoints and stores promotion records in its own database.

**Architecture:** Create one shared library per language ecosystem (Go, Java, Python, Elixir, Node.js). Each library provides the environment chain logic, promotion endpoints, and DB schema. Services import the library and wire it into their existing router and database. CI/CD calls each service's own `/promotion/can-promote` endpoint.

**Tech Stack:** Go/Gin, Java/Spring Boot 3.2, Python/FastAPI, Elixir/Phoenix 1.7, Node.js/NestJS 10, MySQL, MongoDB, PostgreSQL, Redis

---

## Phase 1: Go Shared Library + 11 Service Integrations

### Task 1.1: Create Go promotion-gate package — core types and chain logic

**Files:**
- Create: `packages/promotion-gate-go/promotion.go`
- Create: `packages/promotion-gate-go/go.mod`

**Step 1: Create go.mod**

```
packages/promotion-gate-go/go.mod
```
```go
module github.com/quckapp/promotion-gate-go

go 1.23

require github.com/gin-gonic/gin v1.10.0
```

**Step 2: Create promotion.go with chain logic + types**

```go
package promotion

import (
	"strings"
	"time"
)

// Environment chain: local → dev → qa → uat → staging → production → live
var chain = []string{"local", "dev", "qa", "uat", "staging", "production", "live"}
var uatVariants = []string{"uat", "uat1", "uat2", "uat3"}

type PromotionRecord struct {
	ID              string    `json:"id" db:"id" gorm:"primaryKey;type:char(36)"`
	ServiceKey      string    `json:"serviceKey" db:"service_key" gorm:"type:varchar(100);not null;index"`
	APIVersion      string    `json:"apiVersion" db:"api_version" gorm:"type:varchar(20);not null"`
	FromEnvironment string    `json:"fromEnvironment" db:"from_environment" gorm:"type:varchar(50)"`
	ToEnvironment   string    `json:"toEnvironment" db:"to_environment" gorm:"type:varchar(50);not null"`
	PromotionType   string    `json:"promotionType" db:"promotion_type" gorm:"type:varchar(30);not null"`
	PromotedBy      string    `json:"promotedBy" db:"promoted_by" gorm:"type:varchar(100)"`
	Approver1       string    `json:"approver1,omitempty" db:"approver1" gorm:"type:varchar(100)"`
	Approver2       string    `json:"approver2,omitempty" db:"approver2" gorm:"type:varchar(100)"`
	JiraTicket      string    `json:"jiraTicket,omitempty" db:"jira_ticket" gorm:"type:varchar(50)"`
	Reason          string    `json:"reason,omitempty" db:"reason" gorm:"type:text"`
	Status          string    `json:"status" db:"status" gorm:"type:varchar(20);not null;default:ACTIVE"`
	CreatedAt       time.Time `json:"createdAt" db:"created_at" gorm:"autoCreateTime"`
}

type CanPromoteResponse struct {
	Allowed       bool   `json:"allowed"`
	ServiceKey    string `json:"serviceKey"`
	APIVersion    string `json:"apiVersion"`
	FromEnv       string `json:"fromEnvironment"`
	ToEnv         string `json:"toEnvironment"`
	BlockedReason string `json:"blockedReason,omitempty"`
}

type PromoteRequest struct {
	ServiceKey string `json:"serviceKey" binding:"required"`
	APIVersion string `json:"apiVersion" binding:"required"`
	PromotedBy string `json:"promotedBy"`
}

type EmergencyActivateRequest struct {
	ServiceKey string `json:"serviceKey" binding:"required"`
	APIVersion string `json:"apiVersion" binding:"required"`
	Reason     string `json:"reason" binding:"required"`
	Approver1  string `json:"approver1" binding:"required"`
	Approver2  string `json:"approver2" binding:"required"`
	JiraTicket string `json:"jiraTicket" binding:"required"`
}

func Normalize(env string) string {
	lower := strings.ToLower(env)
	for _, u := range uatVariants {
		if lower == u {
			return "uat"
		}
	}
	return lower
}

func PreviousOf(env string) (string, bool) {
	norm := Normalize(env)
	for i, e := range chain {
		if e == norm && i > 0 {
			return chain[i-1], true
		}
	}
	return "", false
}

func IsUnrestricted(env string) bool {
	norm := Normalize(env)
	return norm == "local" || norm == "dev"
}

func UATVariants() []string {
	return uatVariants
}
```

**Step 3: Commit**
```bash
git add packages/promotion-gate-go/
git commit -m "feat: create Go promotion-gate shared package — core types and chain logic"
```

---

### Task 1.2: Add Go promotion-gate SQL store (MySQL/sqlx)

**Files:**
- Create: `packages/promotion-gate-go/store_sql.go`

```go
package promotion

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// SQLStore implements promotion tracking using any database/sql compatible DB.
type SQLStore struct {
	db        *sql.DB
	tableName string
}

func NewSQLStore(db *sql.DB, tableName string) *SQLStore {
	if tableName == "" {
		tableName = "promotion_records"
	}
	return &SQLStore{db: db, tableName: tableName}
}

func (s *SQLStore) Migrate(ctx context.Context) error {
	query := fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id CHAR(36) PRIMARY KEY,
		service_key VARCHAR(100) NOT NULL,
		api_version VARCHAR(20) NOT NULL,
		from_environment VARCHAR(50),
		to_environment VARCHAR(50) NOT NULL,
		promotion_type VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
		status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
		promoted_by VARCHAR(100),
		approver1 VARCHAR(100),
		approver2 VARCHAR(100),
		jira_ticket VARCHAR(50),
		reason TEXT,
		created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
		INDEX idx_svc_ver (service_key, api_version),
		INDEX idx_to_env (to_environment, status)
	)`, s.tableName)
	_, err := s.db.ExecContext(ctx, query)
	return err
}

func (s *SQLStore) IsActiveInEnv(ctx context.Context, env, serviceKey, apiVersion string) (bool, error) {
	query := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE to_environment = ? AND service_key = ? AND api_version = ? AND status = 'ACTIVE'", s.tableName)
	var count int
	err := s.db.QueryRowContext(ctx, query, env, serviceKey, apiVersion).Scan(&count)
	return count > 0, err
}

func (s *SQLStore) Record(ctx context.Context, rec *PromotionRecord) error {
	rec.ID = uuid.New().String()
	rec.CreatedAt = time.Now()
	if rec.Status == "" {
		rec.Status = "ACTIVE"
	}
	query := fmt.Sprintf("INSERT INTO %s (id, service_key, api_version, from_environment, to_environment, promotion_type, status, promoted_by, approver1, approver2, jira_ticket, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", s.tableName)
	_, err := s.db.ExecContext(ctx, query, rec.ID, rec.ServiceKey, rec.APIVersion, rec.FromEnvironment, rec.ToEnvironment, rec.PromotionType, rec.Status, rec.PromotedBy, rec.Approver1, rec.Approver2, rec.JiraTicket, rec.Reason, rec.CreatedAt)
	return err
}

func (s *SQLStore) History(ctx context.Context, serviceKey, apiVersion string) ([]PromotionRecord, error) {
	query := fmt.Sprintf("SELECT id, service_key, api_version, from_environment, to_environment, promotion_type, status, promoted_by, approver1, approver2, jira_ticket, reason, created_at FROM %s WHERE service_key = ? AND api_version = ? ORDER BY created_at DESC LIMIT 100", s.tableName)
	rows, err := s.db.QueryContext(ctx, query, serviceKey, apiVersion)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var records []PromotionRecord
	for rows.Next() {
		var r PromotionRecord
		if err := rows.Scan(&r.ID, &r.ServiceKey, &r.APIVersion, &r.FromEnvironment, &r.ToEnvironment, &r.PromotionType, &r.Status, &r.PromotedBy, &r.Approver1, &r.Approver2, &r.JiraTicket, &r.Reason, &r.CreatedAt); err != nil {
			return nil, err
		}
		records = append(records, r)
	}
	return records, nil
}

// Store is the interface both SQLStore and MongoStore implement.
type Store interface {
	Migrate(ctx context.Context) error
	IsActiveInEnv(ctx context.Context, env, serviceKey, apiVersion string) (bool, error)
	Record(ctx context.Context, rec *PromotionRecord) error
	History(ctx context.Context, serviceKey, apiVersion string) ([]PromotionRecord, error)
}

// Ensure SQLStore implements Store
var _ Store = (*SQLStore)(nil)
```

**Commit:**
```bash
git commit -m "feat: add SQL store adapter for Go promotion-gate package"
```

---

### Task 1.3: Add Go promotion-gate MongoDB store

**Files:**
- Create: `packages/promotion-gate-go/store_mongo.go`

```go
package promotion

import (
	"context"
	"time"

	"github.com/google/uuid"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type MongoStore struct {
	collection *mongo.Collection
}

func NewMongoStore(db *mongo.Database, collectionName string) *MongoStore {
	if collectionName == "" {
		collectionName = "promotion_records"
	}
	return &MongoStore{collection: db.Collection(collectionName)}
}

func (s *MongoStore) Migrate(ctx context.Context) error {
	_, err := s.collection.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "service_key", Value: 1}, {Key: "api_version", Value: 1}}},
		{Keys: bson.D{{Key: "to_environment", Value: 1}, {Key: "status", Value: 1}}},
	})
	return err
}

func (s *MongoStore) IsActiveInEnv(ctx context.Context, env, serviceKey, apiVersion string) (bool, error) {
	count, err := s.collection.CountDocuments(ctx, bson.M{
		"to_environment": env, "service_key": serviceKey,
		"api_version": apiVersion, "status": "ACTIVE",
	})
	return count > 0, err
}

func (s *MongoStore) Record(ctx context.Context, rec *PromotionRecord) error {
	rec.ID = uuid.New().String()
	rec.CreatedAt = time.Now()
	if rec.Status == "" {
		rec.Status = "ACTIVE"
	}
	_, err := s.collection.InsertOne(ctx, rec)
	return err
}

func (s *MongoStore) History(ctx context.Context, serviceKey, apiVersion string) ([]PromotionRecord, error) {
	opts := options.Find().SetSort(bson.D{{Key: "created_at", Value: -1}}).SetLimit(100)
	cursor, err := s.collection.Find(ctx, bson.M{
		"service_key": serviceKey, "api_version": apiVersion,
	}, opts)
	if err != nil {
		return nil, err
	}
	var records []PromotionRecord
	if err := cursor.All(ctx, &records); err != nil {
		return nil, err
	}
	return records, nil
}

var _ Store = (*MongoStore)(nil)
```

**Commit:**
```bash
git commit -m "feat: add MongoDB store adapter for Go promotion-gate package"
```

---

### Task 1.4: Add Go promotion-gate Gin handler (routes)

**Files:**
- Create: `packages/promotion-gate-go/handler.go`

```go
package promotion

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
)

type Handler struct {
	store       Store
	serviceName string // this service's own key (e.g. "channel-service")
	environment string // current deployment environment (e.g. "dev", "qa")
}

func NewHandler(store Store, serviceName, environment string) *Handler {
	return &Handler{store: store, serviceName: serviceName, environment: environment}
}

// RegisterRoutes mounts /promotion/* routes on the given gin.RouterGroup.
func (h *Handler) RegisterRoutes(rg *gin.RouterGroup) {
	p := rg.Group("/promotion")
	{
		p.GET("/can-promote", h.CanPromote)
		p.POST("/promote", h.Promote)
		p.POST("/emergency-activate", h.EmergencyActivate)
		p.GET("/history", h.History)
		p.GET("/status", h.Status)
	}
}

func (h *Handler) CanPromote(c *gin.Context) {
	serviceKey := c.DefaultQuery("serviceKey", h.serviceName)
	apiVersion := c.DefaultQuery("apiVersion", "v1")
	toEnv := c.DefaultQuery("toEnvironment", h.environment)

	if IsUnrestricted(toEnv) {
		c.JSON(http.StatusOK, gin.H{"data": CanPromoteResponse{
			Allowed: true, ServiceKey: serviceKey, APIVersion: apiVersion, ToEnv: toEnv,
		}})
		return
	}

	prevEnv, hasPrev := PreviousOf(toEnv)
	if !hasPrev {
		c.JSON(http.StatusOK, gin.H{"data": CanPromoteResponse{Allowed: true, ServiceKey: serviceKey, APIVersion: apiVersion, ToEnv: toEnv}})
		return
	}

	// Check UAT variants
	envsToCheck := []string{prevEnv}
	if prevEnv == "uat" {
		envsToCheck = UATVariants()
	}

	for _, env := range envsToCheck {
		active, err := h.store.IsActiveInEnv(c.Request.Context(), env, serviceKey, apiVersion)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		if active {
			c.JSON(http.StatusOK, gin.H{"data": CanPromoteResponse{
				Allowed: true, ServiceKey: serviceKey, APIVersion: apiVersion,
				FromEnv: prevEnv, ToEnv: toEnv,
			}})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"data": CanPromoteResponse{
		Allowed: false, ServiceKey: serviceKey, APIVersion: apiVersion,
		FromEnv: prevEnv, ToEnv: toEnv,
		BlockedReason: serviceKey + " " + apiVersion + " is not ACTIVE in " + prevEnv,
	}})
}

func (h *Handler) Promote(c *gin.Context) {
	var req PromoteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.ServiceKey == "" {
		req.ServiceKey = h.serviceName
	}

	prevEnv, _ := PreviousOf(h.environment)

	rec := &PromotionRecord{
		ServiceKey:      req.ServiceKey,
		APIVersion:      req.APIVersion,
		FromEnvironment: prevEnv,
		ToEnvironment:   h.environment,
		PromotionType:   "NORMAL",
		PromotedBy:      req.PromotedBy,
		Status:          "ACTIVE",
	}
	if err := h.store.Record(c.Request.Context(), rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rec})
}

func (h *Handler) EmergencyActivate(c *gin.Context) {
	var req EmergencyActivateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if strings.EqualFold(req.Approver1, req.Approver2) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "approver1 and approver2 must be different"})
		return
	}

	prevEnv, _ := PreviousOf(h.environment)

	rec := &PromotionRecord{
		ServiceKey:      req.ServiceKey,
		APIVersion:      req.APIVersion,
		FromEnvironment: prevEnv,
		ToEnvironment:   h.environment,
		PromotionType:   "EMERGENCY_HOTFIX",
		PromotedBy:      "emergency",
		Approver1:       req.Approver1,
		Approver2:       req.Approver2,
		JiraTicket:      req.JiraTicket,
		Reason:          req.Reason,
		Status:          "ACTIVE",
	}
	if err := h.store.Record(c.Request.Context(), rec); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": rec})
}

func (h *Handler) History(c *gin.Context) {
	serviceKey := c.DefaultQuery("serviceKey", h.serviceName)
	apiVersion := c.DefaultQuery("apiVersion", "v1")

	records, err := h.store.History(c.Request.Context(), serviceKey, apiVersion)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"data": records})
}

func (h *Handler) Status(c *gin.Context) {
	serviceKey := c.DefaultQuery("serviceKey", h.serviceName)
	apiVersion := c.DefaultQuery("apiVersion", "v1")

	active, _ := h.store.IsActiveInEnv(c.Request.Context(), h.environment, serviceKey, apiVersion)
	c.JSON(http.StatusOK, gin.H{"data": gin.H{
		"service":     serviceKey,
		"apiVersion":  apiVersion,
		"environment": h.environment,
		"active":      active,
	}})
}
```

**Commit:**
```bash
git commit -m "feat: add Gin HTTP handler for Go promotion-gate package"
```

---

### Task 1.5: Integrate promotion-gate into all 11 Go services

For each Go service, the integration pattern is identical:

**Services using MySQL/sqlx** (channel-service, workspace-service, thread-service, bookmark-service, moderation-service):
Add to `cmd/main.go` (or `cmd/server/main.go`):
```go
import promotion "github.com/quckapp/promotion-gate-go"

// After DB init:
promoStore := promotion.NewSQLStore(mysqlDB.DB, "promotion_records")
promoStore.Migrate(context.Background())
promoHandler := promotion.NewHandler(promoStore, "channel-service", cfg.Environment)
promoHandler.RegisterRoutes(api) // api is the /api/v1 router group
```

Add to `go.mod`:
```
require github.com/quckapp/promotion-gate-go v0.0.0
replace github.com/quckapp/promotion-gate-go => ../../packages/promotion-gate-go
```

**Services using MongoDB** (attachment-service, file-service, media-service, reminder-service):
```go
promoStore := promotion.NewMongoStore(mongoDB, "promotion_records")
promoStore.Migrate(context.Background())
promoHandler := promotion.NewHandler(promoStore, "attachment-service", cfg.Environment)
promoHandler.RegisterRoutes(api)
```

**Services with PostgreSQL** (go-bff):
Uses `database/sql` from pgx, so `NewSQLStore` works directly.

**Services with only Redis** (cdn-service, search-service):
Add minimal MySQL connection for promotion tracking:
```go
promoDB, _ := sql.Open("mysql", cfg.PromotionDBURL) // new env var: PROMOTION_DB_URL
promoStore := promotion.NewSQLStore(promoDB, "promotion_records")
```

**Files to modify per service:**

| Service | File | DB type |
|---------|------|---------|
| channel-service | `services/channel-service/cmd/main.go`, `go.mod` | MySQL/sqlx |
| workspace-service | `services/workspace-service/cmd/server/main.go`, `go.mod` | MySQL/sqlx |
| thread-service | `services/thread-service/cmd/server/main.go`, `go.mod` | MySQL/sqlx |
| bookmark-service | `services/bookmark-service/cmd/main.go`, `go.mod` | MySQL/GORM |
| moderation-service | `services/moderation-service/cmd/main.go`, `go.mod` | MySQL/sqlx |
| attachment-service | `services/attachment-service/cmd/main.go`, `go.mod` | MongoDB |
| file-service | `services/file-service/cmd/main.go`, `go.mod` | MongoDB |
| media-service | `services/media-service/cmd/main.go`, `go.mod` | MongoDB |
| reminder-service | `services/reminder-service/cmd/main.go`, `go.mod` | MongoDB |
| go-bff | `services/go-bff/cmd/main.go`, `go.mod` | PostgreSQL |
| cdn-service | `services/cdn-service/cmd/main.go`, `go.mod` | New MySQL conn |
| search-service | `services/search-service/cmd/main.go`, `go.mod` | New MySQL conn |

**Commit after each service integration or batch of 3-4.**

---

## Phase 2: Java/Spring Shared Library + 6 Service Integrations

### Task 2.1: Create Spring Boot promotion-gate auto-configuration starter

**Files:**
- Create: `packages/promotion-gate-spring/pom.xml`
- Create: `packages/promotion-gate-spring/src/main/java/com/quckapp/promotion/EnvironmentChain.java`
- Create: `packages/promotion-gate-spring/src/main/java/com/quckapp/promotion/PromotionRecord.java`
- Create: `packages/promotion-gate-spring/src/main/java/com/quckapp/promotion/PromotionRepository.java`
- Create: `packages/promotion-gate-spring/src/main/java/com/quckapp/promotion/PromotionService.java`
- Create: `packages/promotion-gate-spring/src/main/java/com/quckapp/promotion/PromotionController.java`
- Create: `packages/promotion-gate-spring/src/main/java/com/quckapp/promotion/PromotionAutoConfiguration.java`
- Create: `packages/promotion-gate-spring/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`
- Create: `packages/promotion-gate-spring/src/main/resources/db/migration/V999__create_promotion_records.sql`

**pom.xml:**
```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
    </parent>
    <groupId>com.quckapp</groupId>
    <artifactId>promotion-gate-spring</artifactId>
    <version>0.1.0</version>
    <properties><java.version>21</java.version></properties>
    <dependencies>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-web</artifactId></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-starter-data-jpa</artifactId></dependency>
        <dependency><groupId>org.springframework.boot</groupId><artifactId>spring-boot-autoconfigure</artifactId></dependency>
        <dependency><groupId>org.projectlombok</groupId><artifactId>lombok</artifactId><optional>true</optional></dependency>
    </dependencies>
</project>
```

**EnvironmentChain.java** — Same as existing `admin-service/domain/EnvironmentChain.java`.

**PromotionRecord.java (JPA entity):**
```java
package com.quckapp.promotion;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity @Table(name = "promotion_records")
@Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor
public class PromotionRecord {
    @Id @Column(length = 36) private String id;
    @Column(name = "service_key", nullable = false, length = 100) private String serviceKey;
    @Column(name = "api_version", nullable = false, length = 20) private String apiVersion;
    @Column(name = "from_environment", length = 50) private String fromEnvironment;
    @Column(name = "to_environment", nullable = false, length = 50) private String toEnvironment;
    @Column(name = "promotion_type", nullable = false, length = 30) private String promotionType;
    @Column(length = 20) private String status;
    @Column(name = "promoted_by", length = 100) private String promotedBy;
    @Column(length = 100) private String approver1;
    @Column(length = 100) private String approver2;
    @Column(name = "jira_ticket", length = 50) private String jiraTicket;
    @Column(columnDefinition = "TEXT") private String reason;
    @Column(name = "created_at") private LocalDateTime createdAt;

    @PrePersist void prePersist() {
        if (id == null) id = java.util.UUID.randomUUID().toString();
        if (createdAt == null) createdAt = LocalDateTime.now();
        if (status == null) status = "ACTIVE";
    }
}
```

**PromotionRepository.java:**
```java
package com.quckapp.promotion;

import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;

public interface PromotionRepository extends JpaRepository<PromotionRecord, String> {
    List<PromotionRecord> findByToEnvironmentAndServiceKeyAndApiVersionAndStatus(
        String env, String serviceKey, String apiVersion, String status);
    List<PromotionRecord> findByServiceKeyAndApiVersionOrderByCreatedAtDesc(
        String serviceKey, String apiVersion);
}
```

**PromotionService.java** — contains canPromote, promote, emergencyActivate logic (same as VersionService promotion methods but standalone).

**PromotionController.java:**
```java
package com.quckapp.promotion;

import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController @RequestMapping("/promotion") @RequiredArgsConstructor
public class PromotionController {
    private final PromotionService service;

    @GetMapping("/can-promote")
    public Map<String, Object> canPromote(
        @RequestParam String serviceKey, @RequestParam(defaultValue = "v1") String apiVersion,
        @RequestParam String toEnvironment) {
        return Map.of("data", service.canPromote(serviceKey, apiVersion, toEnvironment));
    }

    @PostMapping("/promote")
    public Map<String, Object> promote(@RequestBody Map<String, String> req) {
        return Map.of("data", service.promote(req.get("serviceKey"), req.get("apiVersion"), req.getOrDefault("promotedBy", "system")));
    }

    @PostMapping("/emergency-activate")
    public Map<String, Object> emergencyActivate(@RequestBody Map<String, String> req) {
        return Map.of("data", service.emergencyActivate(req));
    }

    @GetMapping("/history")
    public Map<String, Object> history(@RequestParam String serviceKey, @RequestParam(defaultValue = "v1") String apiVersion) {
        return Map.of("data", service.history(serviceKey, apiVersion));
    }

    @GetMapping("/status")
    public Map<String, Object> status(@RequestParam String serviceKey, @RequestParam(defaultValue = "v1") String apiVersion) {
        return Map.of("data", service.status(serviceKey, apiVersion));
    }
}
```

**PromotionAutoConfiguration.java:**
```java
package com.quckapp.promotion;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

@AutoConfiguration
@ComponentScan("com.quckapp.promotion")
@EntityScan("com.quckapp.promotion")
@EnableJpaRepositories("com.quckapp.promotion")
public class PromotionAutoConfiguration {}
```

**AutoConfiguration.imports:**
```
com.quckapp.promotion.PromotionAutoConfiguration
```

**V999__create_promotion_records.sql** (Flyway, high version to not conflict):
```sql
CREATE TABLE IF NOT EXISTS promotion_records (
    id CHAR(36) PRIMARY KEY,
    service_key VARCHAR(100) NOT NULL,
    api_version VARCHAR(20) NOT NULL,
    from_environment VARCHAR(50),
    to_environment VARCHAR(50) NOT NULL,
    promotion_type VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    promoted_by VARCHAR(100),
    approver1 VARCHAR(100),
    approver2 VARCHAR(100),
    jira_ticket VARCHAR(50),
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_promo_svc_ver (service_key, api_version),
    INDEX idx_promo_env (to_environment, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Commit:**
```bash
git commit -m "feat: create Spring Boot promotion-gate auto-configuration starter"
```

---

### Task 2.2: Integrate into all 6 Java services

For each service, add to `pom.xml`:
```xml
<dependency>
    <groupId>com.quckapp</groupId>
    <artifactId>promotion-gate-spring</artifactId>
    <version>0.1.0</version>
</dependency>
```

And add `ENVIRONMENT` to `application.yml`:
```yaml
promotion:
  service-name: ${PROMOTION_SERVICE_NAME:user-service}
  environment: ${ENVIRONMENT:local}
```

That's it — Spring Boot auto-configuration handles the rest (entity scan, repo registration, controller registration, Flyway migration).

**Services:** admin-service, auth-service, user-service, permission-service, security-service, audit-service

**Commit:**
```bash
git commit -m "feat: integrate promotion-gate into all 6 Java/Spring services"
```

---

## Phase 3: Python Shared Library + 8 Service Integrations

### Task 3.1: Create Python promotion-gate package

**Files:**
- Create: `packages/promotion-gate-python/promotion_gate/__init__.py`
- Create: `packages/promotion-gate-python/promotion_gate/chain.py`
- Create: `packages/promotion-gate-python/promotion_gate/models.py`
- Create: `packages/promotion-gate-python/promotion_gate/store.py`
- Create: `packages/promotion-gate-python/promotion_gate/router.py`
- Create: `packages/promotion-gate-python/setup.py`

**chain.py** — Environment chain logic (same as Go version, in Python).

**models.py** — Pydantic schemas for request/response.

**store.py** — SQLAlchemy model + session helper:
```python
from sqlalchemy import Column, String, Text, DateTime, Index, create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
import uuid, datetime

class Base(DeclarativeBase): pass

class PromotionRecord(Base):
    __tablename__ = "promotion_records"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    service_key = Column(String(100), nullable=False, index=True)
    api_version = Column(String(20), nullable=False)
    from_environment = Column(String(50))
    to_environment = Column(String(50), nullable=False)
    promotion_type = Column(String(30), nullable=False, default="NORMAL")
    status = Column(String(20), nullable=False, default="ACTIVE")
    promoted_by = Column(String(100))
    approver1 = Column(String(100))
    approver2 = Column(String(100))
    jira_ticket = Column(String(50))
    reason = Column(Text)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    __table_args__ = (Index("idx_promo_env", "to_environment", "status"),)
```

**router.py** — FastAPI APIRouter with all promotion endpoints:
```python
from fastapi import APIRouter, Query, Depends
from .chain import previous_of, is_unrestricted, uat_variants
from .store import PromotionRecord, get_promo_db
# ... endpoints matching Go handler pattern
```

**Integration per service** — add to `requirements.txt`:
```
promotion-gate @ file:../../packages/promotion-gate-python
```

Add to `main.py`:
```python
from promotion_gate.router import create_promotion_router
from promotion_gate.store import init_promotion_db
init_promotion_db(settings.DATABASE_URL)
app.include_router(create_promotion_router("ml-service", settings.ENVIRONMENT), prefix="/promotion")
```

**Services with no DB** (ml-service, sentiment-service, smart-reply-service): Add `PROMOTION_DB_URL` env var pointing to a MySQL instance.

**Services:** ml-service, sentiment-service, smart-reply-service, moderation-service, analytics-service, export-service, insights-service, integration-service

**Commit:**
```bash
git commit -m "feat: create Python promotion-gate package + integrate into 8 services"
```

---

## Phase 4: Elixir Shared Library + 7 Service Integrations

### Task 4.1: Create Elixir promotion-gate package

**Files:**
- Create: `packages/promotion-gate-elixir/mix.exs`
- Create: `packages/promotion-gate-elixir/lib/promotion_gate.ex` (chain logic)
- Create: `packages/promotion-gate-elixir/lib/promotion_gate/store.ex` (MongoDB store using mongodb_driver)
- Create: `packages/promotion-gate-elixir/lib/promotion_gate/router.ex` (Phoenix.Router scope)

**MongoDB store** — Uses `Mongo.find_one/3`, `Mongo.insert_one/3`, `Mongo.count_documents/3` (matching existing Elixir service pattern).

**Router** — A `Phoenix.Router` scope that can be `forward`ed:
```elixir
defmodule PromotionGate.Router do
  use Phoenix.Router
  import Plug.Conn
  import Phoenix.Controller

  pipeline :promotion_api do
    plug :accepts, ["json"]
  end

  scope "/promotion" do
    pipe_through :promotion_api
    get  "/can-promote", PromotionGate.PromotionController, :can_promote
    post "/promote",     PromotionGate.PromotionController, :promote
    post "/emergency-activate", PromotionGate.PromotionController, :emergency_activate
    get  "/history",     PromotionGate.PromotionController, :history
    get  "/status",      PromotionGate.PromotionController, :status
  end
end
```

**Integration per service** — add to `mix.exs` deps:
```elixir
{:promotion_gate, path: "../../packages/promotion-gate-elixir"}
```

Add to service's `router.ex`:
```elixir
forward "/promotion", PromotionGate.Router
```

Add to `application.ex` children:
```elixir
{PromotionGate.Store, [pool: :mongo_pool, db: "quckapp_presence", service: "presence-service", env: System.get_env("ENVIRONMENT", "local")]}
```

**Services:** presence-service, call-service, message-service, event-broadcast-service, notification-orchestrator, huddle-service, realtime-service

**Commit:**
```bash
git commit -m "feat: create Elixir promotion-gate package + integrate into 7 services"
```

---

## Phase 5: Node.js/NestJS Shared Library + 2 Service Integrations

### Task 5.1: Create NestJS promotion-gate module

**Files:**
- Create: `packages/promotion-gate-node/package.json`
- Create: `packages/promotion-gate-node/src/index.ts`
- Create: `packages/promotion-gate-node/src/promotion.entity.ts`
- Create: `packages/promotion-gate-node/src/promotion.service.ts`
- Create: `packages/promotion-gate-node/src/promotion.controller.ts`
- Create: `packages/promotion-gate-node/src/promotion.module.ts`
- Create: `packages/promotion-gate-node/src/chain.ts`

**TypeORM entity:**
```typescript
@Entity('promotion_records')
@Index(['serviceKey', 'apiVersion'])
@Index(['toEnvironment', 'status'])
export class PromotionRecord {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'service_key', length: 100 }) serviceKey: string;
  @Column({ name: 'api_version', length: 20 }) apiVersion: string;
  @Column({ name: 'from_environment', length: 50, nullable: true }) fromEnvironment: string;
  @Column({ name: 'to_environment', length: 50 }) toEnvironment: string;
  @Column({ name: 'promotion_type', length: 30, default: 'NORMAL' }) promotionType: string;
  @Column({ length: 20, default: 'ACTIVE' }) status: string;
  @Column({ name: 'promoted_by', length: 100, nullable: true }) promotedBy: string;
  @Column({ length: 100, nullable: true }) approver1: string;
  @Column({ length: 100, nullable: true }) approver2: string;
  @Column({ name: 'jira_ticket', length: 50, nullable: true }) jiraTicket: string;
  @Column({ type: 'text', nullable: true }) reason: string;
  @CreateDateColumn({ name: 'created_at' }) createdAt: Date;
}
```

**NestJS module with `forRoot()` factory:**
```typescript
@Module({})
export class PromotionGateModule {
  static forRoot(options: { serviceName: string; environment: string }): DynamicModule {
    return {
      module: PromotionGateModule,
      imports: [TypeOrmModule.forFeature([PromotionRecord])],
      controllers: [PromotionController],
      providers: [
        PromotionService,
        { provide: 'PROMOTION_OPTIONS', useValue: options },
      ],
      exports: [PromotionService],
    };
  }
}
```

**Integration per service:**
```typescript
// app.module.ts
imports: [
  PromotionGateModule.forRoot({
    serviceName: 'notification-service',
    environment: process.env.ENVIRONMENT || 'local',
  }),
]
```

**Services:** notification-service, backend-gateway (deprecated but include for completeness)

**Commit:**
```bash
git commit -m "feat: create NestJS promotion-gate module + integrate into 2 Node services"
```

---

## Phase 6: Update CI/CD to Call Per-Service Endpoints

### Task 6.1: Update reusable-service-deploy.yml

**Modify:** `.github/workflows/reusable-service-deploy.yml`

Change the promotion gate check from calling admin-service to calling each service's own `/promotion/can-promote` endpoint:

```yaml
# Before (centralized):
# curl "${{ vars.SERVICE_URLS_API_URL }}/admin/service-urls/can-promote?..."

# After (per-service):
# The service_name input already identifies the service
# Each service exposes /promotion/can-promote on its own port
SERVICE_URL="http://${{ inputs.service_name }}.$NAMESPACE.svc.cluster.local:${{ inputs.port }}"
RESPONSE=$(curl -sf "$SERVICE_URL/promotion/can-promote?serviceKey=${{ inputs.service_name }}&apiVersion=${{ inputs.api_version }}&toEnvironment=$ENV_NAME")
```

Do the same for the record step: call each service's own `/promotion/promote`.

### Task 6.2: Update other deployment workflows

Apply the same per-service pattern to:
- `.github/workflows/k8s-deploy.yml`
- `.github/workflows/k8s-deploy-all.yml`
- `.github/workflows/deploy.yml`
- `.github/workflows/promote-environment.yml`

### Task 6.3: Update Azure Pipeline templates

**Modify:** `.azure-pipelines/templates/version-promotion-gate.yml`
**Modify:** `.azure-pipelines/templates/version-promotion-record.yml`

Add `servicePort` parameter and call the service's own endpoint.

**Commit:**
```bash
git commit -m "feat: update CI/CD to call per-service promotion endpoints"
```

---

## Phase 7: Clean Up Centralized Logic from admin-service

### Task 7.1: Remove promotion logic from admin-service VersionService

**Modify:** `services/admin-service/src/main/java/com/quckapp/admin/service/VersionService.java`
- Remove `canPromote()`, `promote()`, `emergencyActivate()`, `getPromotionHistory()` methods
- Remove `isActiveInPreviousEnvironment()` helper
- Remove promotion gate enforcement from `activate()`
- Keep basic `activate()` for version status management only

**Modify:** `services/admin-service/src/main/java/com/quckapp/admin/controller/VersionController.java`
- Remove `/can-promote`, `/promote`, `/emergency-activate`, `/promotion-history` endpoints

**Delete:** `services/admin-service/src/main/java/com/quckapp/admin/domain/EnvironmentChain.java` (now in shared package)
**Delete:** `services/admin-service/src/test/java/com/quckapp/admin/domain/EnvironmentChainTest.java`
**Delete:** `services/admin-service/src/test/java/com/quckapp/admin/service/VersionServicePromotionTest.java`

admin-service still keeps:
- Version CRUD (create, update, list, delete)
- State transitions (markReady, activate, deprecate, disable) — without promotion gate
- Global config, profiles, export
- Its OWN promotion-gate-spring integration for its own deployment tracking

**Commit:**
```bash
git commit -m "refactor: remove centralized promotion logic from admin-service"
```

---

## Summary

| Phase | Tasks | Services affected |
|-------|-------|-------------------|
| 1: Go library | 1.1-1.5 | 11 Go services |
| 2: Java library | 2.1-2.2 | 6 Java services |
| 3: Python library | 3.1 | 8 Python services |
| 4: Elixir library | 4.1 | 7 Elixir services |
| 5: Node.js library | 5.1 | 2 Node services |
| 6: CI/CD | 6.1-6.3 | All workflows |
| 7: Cleanup | 7.1 | admin-service |
| **Total** | **14 tasks** | **35 services + CI/CD** |
