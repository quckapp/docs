# Service-URLs Go API — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create the missing `service-urls/api/v1` Go backend so the `docker-compose.configloader.yml` stack can run.

**Architecture:** Gin + GORM API with two route groups: config reader (X-API-Key auth) for go-configloader consumers, and admin CRUD (Bearer JWT auth) for the service-urls React frontend. Standalone MySQL database with auto-migration.

**Tech Stack:** Go 1.21, Gin-gonic, GORM + MySQL, go-auth (shared JWT middleware), Logrus, Docker multi-stage build.

**Design doc:** `docs/plans/2026-02-26-service-urls-api-design.md`

---

### Task 1: Project scaffolding — go.mod, config, .env.example

**Files:**
- Create: `service-urls/api/v1/go.mod`
- Create: `service-urls/api/v1/internal/config/config.go`
- Create: `service-urls/api/v1/.env.example`

**Step 1: Create go.mod**

```
service-urls/api/v1/go.mod
```

```go
module github.com/quckapp/service-urls-api

go 1.21

require (
	github.com/gin-gonic/gin v1.9.1
	github.com/google/uuid v1.5.0
	github.com/golang-jwt/jwt/v5 v5.2.0
	github.com/quckapp/go-auth v0.1.0
	github.com/sirupsen/logrus v1.9.3
	gorm.io/driver/mysql v1.5.2
	gorm.io/gorm v1.25.5
)

replace github.com/quckapp/go-auth => ../../../packages/go-auth
```

**Step 2: Create config/config.go**

Pattern: Follow `services/bookmark-service/internal/config/config.go` exactly.

```go
package config

import (
	"fmt"
	"os"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

type Config struct {
	Port       string
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	JWTSecret  string
}

func Load() *Config {
	return &Config{
		Port:       getEnv("PORT", "8085"),
		DBHost:     getEnv("MYSQL_HOST", "localhost"),
		DBPort:     getEnv("MYSQL_PORT", "3306"),
		DBUser:     getEnv("MYSQL_USERNAME", "root"),
		DBPassword: getEnv("MYSQL_PASSWORD", "root_secret"),
		DBName:     getEnv("MYSQL_DATABASE", "quckapp_admin"),
		JWTSecret:  getEnv("JWT_SECRET", "local-dev-jwt-secret-change-in-production-min-32-chars"),
	}
}

func InitDB(cfg *Config) (*gorm.DB, error) {
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?charset=utf8mb4&parseTime=True&loc=Local",
		cfg.DBUser, cfg.DBPassword, cfg.DBHost, cfg.DBPort, cfg.DBName)

	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)

	return db, nil
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}
```

Note: env var names match `docker-compose.configloader.yml` (`MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USERNAME`, `MYSQL_PASSWORD`, `JWT_SECRET`).

**Step 3: Create .env.example**

```
PORT=8085
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=quckapp_admin
MYSQL_USERNAME=root
MYSQL_PASSWORD=root_secret
JWT_SECRET=local-dev-jwt-secret-change-in-production-min-32-chars
GIN_MODE=debug
```

**Step 4: Commit**

```bash
git add service-urls/api/v1/go.mod service-urls/api/v1/internal/config/config.go service-urls/api/v1/.env.example
git commit -m "feat(service-urls-api): scaffold Go project with config"
```

---

### Task 2: GORM models — all 4 tables

**Files:**
- Create: `service-urls/api/v1/internal/model/service_url.go`
- Create: `service-urls/api/v1/internal/model/infrastructure.go`
- Create: `service-urls/api/v1/internal/model/firebase.go`
- Create: `service-urls/api/v1/internal/model/api_key.go`

Pattern: Follow `services/bookmark-service/internal/model/bookmark.go` — UUID PK with `BeforeCreate` hook, GORM tags, JSON tags matching frontend types.

**Step 1: Create service_url.go**

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ServiceUrl struct {
	ID          uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Environment string    `gorm:"type:varchar(20);not null;uniqueIndex:idx_env_key" json:"environment"`
	ServiceKey  string    `gorm:"type:varchar(100);not null;uniqueIndex:idx_env_key" json:"serviceKey"`
	Category    string    `gorm:"type:varchar(20);not null" json:"category"`
	URL         string    `gorm:"type:varchar(500);not null;column:url" json:"url"`
	Description string    `gorm:"type:text" json:"description"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	UpdatedBy   string    `gorm:"type:varchar(100)" json:"updatedBy"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

func (s *ServiceUrl) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}
```

**Step 2: Create infrastructure.go**

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type InfrastructureConfig struct {
	ID               uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Environment      string    `gorm:"type:varchar(20);not null;uniqueIndex:idx_infra_env_key" json:"environment"`
	InfraKey         string    `gorm:"type:varchar(100);not null;uniqueIndex:idx_infra_env_key" json:"infraKey"`
	Host             string    `gorm:"type:varchar(255);not null" json:"host"`
	Port             int       `gorm:"not null" json:"port"`
	Username         string    `gorm:"type:varchar(100)" json:"username,omitempty"`
	ConnectionString string    `gorm:"type:varchar(500)" json:"connectionString,omitempty"`
	IsActive         bool      `gorm:"default:true" json:"isActive"`
	UpdatedBy        string    `gorm:"type:varchar(100)" json:"updatedBy"`
	CreatedAt        time.Time `json:"createdAt"`
	UpdatedAt        time.Time `json:"updatedAt"`
}

func (i *InfrastructureConfig) BeforeCreate(tx *gorm.DB) error {
	if i.ID == uuid.Nil {
		i.ID = uuid.New()
	}
	return nil
}
```

**Step 3: Create firebase.go**

```go
package model

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type FirebaseConfig struct {
	ID            uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	Environment   string    `gorm:"type:varchar(20);uniqueIndex;not null" json:"environment"`
	ProjectID     string    `gorm:"type:varchar(100);not null" json:"projectId"`
	ClientEmail   string    `gorm:"type:varchar(255);not null" json:"clientEmail"`
	PrivateKey    string    `gorm:"type:text" json:"-"`
	PrivateKeyMasked string `gorm:"-" json:"privateKeyMasked,omitempty"`
	StorageBucket string    `gorm:"type:varchar(255)" json:"storageBucket"`
	IsActive      bool      `gorm:"default:true" json:"isActive"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

func (f *FirebaseConfig) BeforeCreate(tx *gorm.DB) error {
	if f.ID == uuid.Nil {
		f.ID = uuid.New()
	}
	return nil
}

// MaskPrivateKey sets the masked field for API responses
func (f *FirebaseConfig) MaskPrivateKey() {
	if f.PrivateKey != "" {
		if len(f.PrivateKey) > 20 {
			f.PrivateKeyMasked = f.PrivateKey[:10] + "..." + f.PrivateKey[len(f.PrivateKey)-10:]
		} else {
			f.PrivateKeyMasked = "***"
		}
	}
}
```

**Step 4: Create api_key.go**

```go
package model

import (
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type ApiKey struct {
	ID          uuid.UUID `gorm:"type:char(36);primaryKey" json:"id"`
	KeyHash     string    `gorm:"type:varchar(64);not null;index" json:"-"`
	Name        string    `gorm:"type:varchar(100);not null" json:"name"`
	Environment string    `gorm:"type:varchar(20)" json:"environment,omitempty"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
}

func (a *ApiKey) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}

// HashKey returns SHA-256 hex digest of the raw API key
func HashKey(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", h)
}
```

**Step 5: Commit**

```bash
git add service-urls/api/v1/internal/model/
git commit -m "feat(service-urls-api): add GORM models for all tables"
```

---

### Task 3: Repositories — data access layer

**Files:**
- Create: `service-urls/api/v1/internal/repository/service_url_repo.go`
- Create: `service-urls/api/v1/internal/repository/infrastructure_repo.go`
- Create: `service-urls/api/v1/internal/repository/firebase_repo.go`
- Create: `service-urls/api/v1/internal/repository/api_key_repo.go`

**Step 1: Create service_url_repo.go**

```go
package repository

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"gorm.io/gorm"
)

type ServiceUrlRepository struct {
	db *gorm.DB
}

func NewServiceUrlRepository(db *gorm.DB) *ServiceUrlRepository {
	return &ServiceUrlRepository{db: db}
}

func (r *ServiceUrlRepository) FindByEnv(env string, category string) ([]model.ServiceUrl, error) {
	var results []model.ServiceUrl
	q := r.db.Where("environment = ? AND is_active = ?", env, true)
	if category != "" {
		q = q.Where("category = ?", category)
	}
	err := q.Order("service_key ASC").Find(&results).Error
	return results, err
}

func (r *ServiceUrlRepository) FindByEnvAndKey(env, key string) (*model.ServiceUrl, error) {
	var result model.ServiceUrl
	err := r.db.Where("environment = ? AND service_key = ?", env, key).First(&result).Error
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *ServiceUrlRepository) Create(s *model.ServiceUrl) error {
	return r.db.Create(s).Error
}

func (r *ServiceUrlRepository) Update(s *model.ServiceUrl) error {
	return r.db.Save(s).Error
}

func (r *ServiceUrlRepository) Delete(env, key string) error {
	return r.db.Where("environment = ? AND service_key = ?", env, key).Delete(&model.ServiceUrl{}).Error
}

func (r *ServiceUrlRepository) CountByEnv(env string) (int64, error) {
	var count int64
	err := r.db.Model(&model.ServiceUrl{}).Where("environment = ? AND is_active = ?", env, true).Count(&count).Error
	return count, err
}

// FindAllActiveByEnv returns all active service URLs (no category filter) for config export
func (r *ServiceUrlRepository) FindAllActiveByEnv(env string) ([]model.ServiceUrl, error) {
	var results []model.ServiceUrl
	err := r.db.Where("environment = ? AND is_active = ?", env, true).Find(&results).Error
	return results, err
}
```

**Step 2: Create infrastructure_repo.go**

```go
package repository

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"gorm.io/gorm"
)

type InfrastructureRepository struct {
	db *gorm.DB
}

func NewInfrastructureRepository(db *gorm.DB) *InfrastructureRepository {
	return &InfrastructureRepository{db: db}
}

func (r *InfrastructureRepository) FindByEnv(env string) ([]model.InfrastructureConfig, error) {
	var results []model.InfrastructureConfig
	err := r.db.Where("environment = ? AND is_active = ?", env, true).Order("infra_key ASC").Find(&results).Error
	return results, err
}

func (r *InfrastructureRepository) FindByEnvAndKey(env, key string) (*model.InfrastructureConfig, error) {
	var result model.InfrastructureConfig
	err := r.db.Where("environment = ? AND infra_key = ?", env, key).First(&result).Error
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *InfrastructureRepository) Create(i *model.InfrastructureConfig) error {
	return r.db.Create(i).Error
}

func (r *InfrastructureRepository) Update(i *model.InfrastructureConfig) error {
	return r.db.Save(i).Error
}

func (r *InfrastructureRepository) Delete(env, key string) error {
	return r.db.Where("environment = ? AND infra_key = ?", env, key).Delete(&model.InfrastructureConfig{}).Error
}

func (r *InfrastructureRepository) CountByEnv(env string) (int64, error) {
	var count int64
	err := r.db.Model(&model.InfrastructureConfig{}).Where("environment = ? AND is_active = ?", env, true).Count(&count).Error
	return count, err
}
```

**Step 3: Create firebase_repo.go**

```go
package repository

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"gorm.io/gorm"
)

type FirebaseRepository struct {
	db *gorm.DB
}

func NewFirebaseRepository(db *gorm.DB) *FirebaseRepository {
	return &FirebaseRepository{db: db}
}

func (r *FirebaseRepository) FindByEnv(env string) (*model.FirebaseConfig, error) {
	var result model.FirebaseConfig
	err := r.db.Where("environment = ?", env).First(&result).Error
	if err != nil {
		return nil, err
	}
	return &result, nil
}

func (r *FirebaseRepository) Upsert(f *model.FirebaseConfig) error {
	var existing model.FirebaseConfig
	err := r.db.Where("environment = ?", f.Environment).First(&existing).Error
	if err == gorm.ErrRecordNotFound {
		return r.db.Create(f).Error
	}
	if err != nil {
		return err
	}
	f.ID = existing.ID
	return r.db.Save(f).Error
}

func (r *FirebaseRepository) ExistsByEnv(env string) (bool, error) {
	var count int64
	err := r.db.Model(&model.FirebaseConfig{}).Where("environment = ?", env).Count(&count).Error
	return count > 0, err
}
```

**Step 4: Create api_key_repo.go**

```go
package repository

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"gorm.io/gorm"
)

type ApiKeyRepository struct {
	db *gorm.DB
}

func NewApiKeyRepository(db *gorm.DB) *ApiKeyRepository {
	return &ApiKeyRepository{db: db}
}

// ValidateKey checks if a raw API key is valid (optionally scoped to an environment)
func (r *ApiKeyRepository) ValidateKey(rawKey, env string) (bool, error) {
	hash := model.HashKey(rawKey)
	var count int64
	err := r.db.Model(&model.ApiKey{}).
		Where("key_hash = ? AND is_active = ? AND (environment IS NULL OR environment = ?)", hash, true, env).
		Count(&count).Error
	return count > 0, err
}
```

**Step 5: Commit**

```bash
git add service-urls/api/v1/internal/repository/
git commit -m "feat(service-urls-api): add repository layer for all models"
```

---

### Task 4: Middleware — API key auth + JWT auth

**Files:**
- Create: `service-urls/api/v1/internal/middleware/apikey.go`
- Create: `service-urls/api/v1/internal/middleware/cors.go`

The JWT middleware comes from `packages/go-auth` (already used by bookmark-service). We only need a custom API key middleware for the config reader endpoints.

**Step 1: Create apikey.go**

```go
package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/quckapp/service-urls-api/internal/repository"
)

// ApiKeyAuth validates X-API-Key header against the api_keys table.
// The env parameter is extracted from the URL path by handlers before this runs,
// so we accept it from the Gin context (set by the handler or extracted from path).
func ApiKeyAuth(repo *repository.ApiKeyRepository) gin.HandlerFunc {
	return func(c *gin.Context) {
		key := c.GetHeader("X-API-Key")
		if key == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing X-API-Key header"})
			return
		}

		env := c.Param("env")
		valid, err := repo.ValidateKey(key, env)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "failed to validate API key"})
			return
		}
		if !valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid API key"})
			return
		}

		c.Next()
	}
}
```

**Step 2: Create cors.go**

```go
package middleware

import (
	"github.com/gin-gonic/gin"
)

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Origin, Content-Type, Authorization, X-API-Key")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
```

**Step 3: Commit**

```bash
git add service-urls/api/v1/internal/middleware/
git commit -m "feat(service-urls-api): add API key and CORS middleware"
```

---

### Task 5: Config service — flattening logic for go-configloader

**Files:**
- Create: `service-urls/api/v1/internal/service/config_service.go`

This is the core business logic: flatten service URLs + infrastructure + firebase into KEY=VALUE pairs for consumption by go-configloader.

**Step 1: Create config_service.go**

```go
package service

import (
	"fmt"
	"strings"

	"github.com/quckapp/service-urls-api/internal/repository"
)

type ConfigService struct {
	serviceUrlRepo *repository.ServiceUrlRepository
	infraRepo      *repository.InfrastructureRepository
	firebaseRepo   *repository.FirebaseRepository
}

func NewConfigService(
	serviceUrlRepo *repository.ServiceUrlRepository,
	infraRepo *repository.InfrastructureRepository,
	firebaseRepo *repository.FirebaseRepository,
) *ConfigService {
	return &ConfigService{
		serviceUrlRepo: serviceUrlRepo,
		infraRepo:      infraRepo,
		firebaseRepo:   firebaseRepo,
	}
}

// GetFlatConfig returns all active config for an environment as a flat key-value map.
func (s *ConfigService) GetFlatConfig(env string) (map[string]string, error) {
	result := make(map[string]string)

	// Service URLs: SERVICE_KEY = url
	services, err := s.serviceUrlRepo.FindAllActiveByEnv(env)
	if err != nil {
		return nil, fmt.Errorf("failed to load service urls: %w", err)
	}
	for _, svc := range services {
		result[svc.ServiceKey] = svc.URL
	}

	// Infrastructure: INFRA_KEY_HOST, INFRA_KEY_PORT, etc.
	infra, err := s.infraRepo.FindByEnv(env)
	if err != nil {
		return nil, fmt.Errorf("failed to load infrastructure: %w", err)
	}
	for _, i := range infra {
		result[i.InfraKey+"_HOST"] = i.Host
		result[i.InfraKey+"_PORT"] = fmt.Sprintf("%d", i.Port)
		if i.Username != "" {
			result[i.InfraKey+"_USERNAME"] = i.Username
		}
		if i.ConnectionString != "" {
			result[i.InfraKey+"_CONNECTION_STRING"] = i.ConnectionString
		}
	}

	// Firebase
	fb, err := s.firebaseRepo.FindByEnv(env)
	if err == nil && fb != nil {
		result["FIREBASE_PROJECT_ID"] = fb.ProjectID
		result["FIREBASE_CLIENT_EMAIL"] = fb.ClientEmail
		result["FIREBASE_PRIVATE_KEY"] = fb.PrivateKey
		result["FIREBASE_STORAGE_BUCKET"] = fb.StorageBucket
	}

	return result, nil
}

// FormatEnvFile converts a flat map to .env format (KEY=VALUE lines)
func FormatEnvFile(config map[string]string) string {
	var b strings.Builder
	for k, v := range config {
		// Quote values that contain special characters
		if strings.ContainsAny(v, " \t=:#\"'\\") {
			b.WriteString(fmt.Sprintf("%s=\"%s\"\n", k, strings.ReplaceAll(v, "\"", "\\\"")))
		} else {
			b.WriteString(fmt.Sprintf("%s=%s\n", k, v))
		}
	}
	return b.String()
}

// FormatDockerCompose converts a flat map to YAML environment block
func FormatDockerCompose(config map[string]string) string {
	var b strings.Builder
	b.WriteString("environment:\n")
	for k, v := range config {
		b.WriteString(fmt.Sprintf("  %s: \"%s\"\n", k, strings.ReplaceAll(v, "\"", "\\\"")))
	}
	return b.String()
}

// GetSingleValue returns a single config value by key for an environment
func (s *ConfigService) GetSingleValue(env, key string) (string, error) {
	config, err := s.GetFlatConfig(env)
	if err != nil {
		return "", err
	}
	val, ok := config[key]
	if !ok {
		return "", fmt.Errorf("key %q not found in environment %q", key, env)
	}
	return val, nil
}
```

**Step 2: Commit**

```bash
git add service-urls/api/v1/internal/service/config_service.go
git commit -m "feat(service-urls-api): add config flattening service for go-configloader"
```

---

### Task 6: Admin services — CRUD business logic

**Files:**
- Create: `service-urls/api/v1/internal/service/service_url_service.go`
- Create: `service-urls/api/v1/internal/service/infrastructure_service.go`
- Create: `service-urls/api/v1/internal/service/firebase_service.go`
- Create: `service-urls/api/v1/internal/service/auth_service.go`

**Step 1: Create service_url_service.go**

```go
package service

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"github.com/quckapp/service-urls-api/internal/repository"
)

type ServiceUrlService struct {
	repo *repository.ServiceUrlRepository
}

func NewServiceUrlService(repo *repository.ServiceUrlRepository) *ServiceUrlService {
	return &ServiceUrlService{repo: repo}
}

func (s *ServiceUrlService) List(env, category string) ([]model.ServiceUrl, error) {
	return s.repo.FindByEnv(env, category)
}

func (s *ServiceUrlService) Create(svc *model.ServiceUrl) error {
	return s.repo.Create(svc)
}

func (s *ServiceUrlService) Update(env, key string, updates *model.ServiceUrl) error {
	existing, err := s.repo.FindByEnvAndKey(env, key)
	if err != nil {
		return err
	}
	updates.ID = existing.ID
	updates.Environment = env
	updates.ServiceKey = key
	return s.repo.Update(updates)
}

func (s *ServiceUrlService) Delete(env, key string) error {
	return s.repo.Delete(env, key)
}
```

**Step 2: Create infrastructure_service.go**

```go
package service

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"github.com/quckapp/service-urls-api/internal/repository"
)

type InfrastructureService struct {
	repo *repository.InfrastructureRepository
}

func NewInfrastructureService(repo *repository.InfrastructureRepository) *InfrastructureService {
	return &InfrastructureService{repo: repo}
}

func (s *InfrastructureService) List(env string) ([]model.InfrastructureConfig, error) {
	return s.repo.FindByEnv(env)
}

func (s *InfrastructureService) Create(infra *model.InfrastructureConfig) error {
	return s.repo.Create(infra)
}

func (s *InfrastructureService) Update(env, key string, updates *model.InfrastructureConfig) error {
	existing, err := s.repo.FindByEnvAndKey(env, key)
	if err != nil {
		return err
	}
	updates.ID = existing.ID
	updates.Environment = env
	updates.InfraKey = key
	return s.repo.Update(updates)
}

func (s *InfrastructureService) Delete(env, key string) error {
	return s.repo.Delete(env, key)
}
```

**Step 3: Create firebase_service.go**

```go
package service

import (
	"github.com/quckapp/service-urls-api/internal/model"
	"github.com/quckapp/service-urls-api/internal/repository"
)

type FirebaseService struct {
	repo *repository.FirebaseRepository
}

func NewFirebaseService(repo *repository.FirebaseRepository) *FirebaseService {
	return &FirebaseService{repo: repo}
}

func (s *FirebaseService) Get(env string) (*model.FirebaseConfig, error) {
	fb, err := s.repo.FindByEnv(env)
	if err != nil {
		return nil, err
	}
	fb.MaskPrivateKey()
	return fb, nil
}

func (s *FirebaseService) Upsert(fb *model.FirebaseConfig) error {
	return s.repo.Upsert(fb)
}
```

**Step 4: Create auth_service.go**

The frontend sends `POST /auth/login` with phone+password. For the standalone API, we use a simple admin credential stored as an env var (not a full user table). JWTs are issued locally.

```go
package service

import (
	"errors"
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type AuthService struct {
	jwtSecret string
}

func NewAuthService(jwtSecret string) *AuthService {
	return &AuthService{jwtSecret: jwtSecret}
}

type LoginRequest struct {
	PhoneNumber string `json:"phoneNumber" binding:"required"`
	Password    string `json:"password" binding:"required"`
}

type LoginResponse struct {
	Token string    `json:"token"`
	User  AdminUser `json:"user"`
}

type AdminUser struct {
	ID          string `json:"id"`
	DisplayName string `json:"displayName"`
	PhoneNumber string `json:"phoneNumber"`
	Role        string `json:"role"`
}

func (s *AuthService) Login(req LoginRequest) (*LoginResponse, error) {
	// Simple credential check — in production, proxy to auth-service
	adminPhone := os.Getenv("ADMIN_PHONE")
	adminPass := os.Getenv("ADMIN_PASSWORD")
	if adminPhone == "" {
		adminPhone = "+1234567890"
	}
	if adminPass == "" {
		adminPass = "admin123"
	}

	if req.PhoneNumber != adminPhone || req.Password != adminPass {
		return nil, errors.New("invalid credentials")
	}

	adminID := os.Getenv("ADMIN_USER_ID")
	if adminID == "" {
		adminID = uuid.New().String()
	}

	user := AdminUser{
		ID:          adminID,
		DisplayName: "Admin",
		PhoneNumber: req.PhoneNumber,
		Role:        "super_admin",
	}

	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}

	return &LoginResponse{Token: token, User: user}, nil
}

func (s *AuthService) generateToken(user AdminUser) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.PhoneNumber,
		"iss":   "quckapp-auth",
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(s.jwtSecret))
}

func (s *AuthService) GetProfile(userID string) *AdminUser {
	return &AdminUser{
		ID:          userID,
		DisplayName: "Admin",
		PhoneNumber: os.Getenv("ADMIN_PHONE"),
		Role:        "super_admin",
	}
}
```

**Step 5: Commit**

```bash
git add service-urls/api/v1/internal/service/
git commit -m "feat(service-urls-api): add CRUD and auth service layer"
```

---

### Task 7: Config reader handler (go-configloader endpoints)

**Files:**
- Create: `service-urls/api/v1/internal/handler/config_handler.go`

These are the endpoints consumed by go-configloader at service startup.

**Step 1: Create config_handler.go**

```go
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/quckapp/service-urls-api/internal/service"
)

type ConfigHandler struct {
	configService *service.ConfigService
}

func NewConfigHandler(configService *service.ConfigService) *ConfigHandler {
	return &ConfigHandler{configService: configService}
}

// GetEnvFile returns all config as KEY=VALUE text (for go-configloader env-file format)
func (h *ConfigHandler) GetEnvFile(c *gin.Context) {
	env := c.Param("env")
	config, err := h.configService.GetFlatConfig(env)
	if err != nil {
		c.String(http.StatusInternalServerError, "failed to load config: %s", err.Error())
		return
	}
	c.String(http.StatusOK, service.FormatEnvFile(config))
}

// GetJSON returns all config as flat JSON object (for go-configloader json format)
func (h *ConfigHandler) GetJSON(c *gin.Context) {
	env := c.Param("env")
	config, err := h.configService.GetFlatConfig(env)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, config)
}

// GetSingleValue returns a single config value as plain text
func (h *ConfigHandler) GetSingleValue(c *gin.Context) {
	env := c.Param("env")
	key := c.Param("key")
	val, err := h.configService.GetSingleValue(env, key)
	if err != nil {
		c.String(http.StatusNotFound, err.Error())
		return
	}
	c.String(http.StatusOK, val)
}

// GetDockerCompose returns config as YAML environment block
func (h *ConfigHandler) GetDockerCompose(c *gin.Context) {
	env := c.Param("env")
	config, err := h.configService.GetFlatConfig(env)
	if err != nil {
		c.String(http.StatusInternalServerError, "failed to load config: %s", err.Error())
		return
	}
	c.String(http.StatusOK, service.FormatDockerCompose(config))
}
```

**Step 2: Commit**

```bash
git add service-urls/api/v1/internal/handler/config_handler.go
git commit -m "feat(service-urls-api): add config reader handler for go-configloader"
```

---

### Task 8: Admin handler — CRUD + bulk operations

**Files:**
- Create: `service-urls/api/v1/internal/handler/admin_handler.go`

**Step 1: Create admin_handler.go**

```go
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/quckapp/service-urls-api/internal/model"
	"github.com/quckapp/service-urls-api/internal/service"
)

var validEnvironments = map[string]bool{
	"local": true, "development": true, "qa": true,
	"uat1": true, "uat2": true, "uat3": true,
	"staging": true, "production": true,
}

type AdminHandler struct {
	serviceUrlSvc *service.ServiceUrlService
	infraSvc      *service.InfrastructureService
	firebaseSvc   *service.FirebaseService
	configSvc     *service.ConfigService
}

func NewAdminHandler(
	serviceUrlSvc *service.ServiceUrlService,
	infraSvc *service.InfrastructureService,
	firebaseSvc *service.FirebaseService,
	configSvc *service.ConfigService,
) *AdminHandler {
	return &AdminHandler{
		serviceUrlSvc: serviceUrlSvc,
		infraSvc:      infraSvc,
		firebaseSvc:   firebaseSvc,
		configSvc:     configSvc,
	}
}

// --- Summary ---

type EnvironmentSummary struct {
	Environment  string  `json:"environment"`
	ServiceCount int64   `json:"serviceCount"`
	InfraCount   int64   `json:"infraCount"`
	HasFirebase  bool    `json:"hasFirebase"`
	LastUpdated  *string `json:"lastUpdated"`
}

func (h *AdminHandler) GetSummaries(c *gin.Context) {
	envs := []string{"local", "development", "qa", "uat1", "uat2", "uat3", "staging", "production"}
	summaries := make([]EnvironmentSummary, 0, len(envs))

	for _, env := range envs {
		svcCount, _ := h.serviceUrlSvc.CountByEnv(env)
		infraCount, _ := h.infraSvc.CountByEnv(env)
		hasFB, _ := h.firebaseSvc.Exists(env)
		summaries = append(summaries, EnvironmentSummary{
			Environment:  env,
			ServiceCount: svcCount,
			InfraCount:   infraCount,
			HasFirebase:  hasFB,
		})
	}

	c.JSON(http.StatusOK, summaries)
}

// --- Service URLs CRUD ---

func (h *AdminHandler) ListServices(c *gin.Context) {
	env := c.Param("env")
	category := c.Query("category")
	services, err := h.serviceUrlSvc.List(env, category)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, services)
}

func (h *AdminHandler) CreateService(c *gin.Context) {
	env := c.Param("env")
	var svc model.ServiceUrl
	if err := c.ShouldBindJSON(&svc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	svc.Environment = env
	if err := h.serviceUrlSvc.Create(&svc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, svc)
}

func (h *AdminHandler) UpdateService(c *gin.Context) {
	env := c.Param("env")
	key := c.Param("serviceKey")
	var svc model.ServiceUrl
	if err := c.ShouldBindJSON(&svc); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.serviceUrlSvc.Update(env, key, &svc); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, svc)
}

func (h *AdminHandler) DeleteService(c *gin.Context) {
	env := c.Param("env")
	key := c.Param("serviceKey")
	if err := h.serviceUrlSvc.Delete(env, key); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// --- Infrastructure CRUD ---

func (h *AdminHandler) ListInfrastructure(c *gin.Context) {
	env := c.Param("env")
	infra, err := h.infraSvc.List(env)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, infra)
}

func (h *AdminHandler) CreateInfrastructure(c *gin.Context) {
	env := c.Param("env")
	var infra model.InfrastructureConfig
	if err := c.ShouldBindJSON(&infra); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	infra.Environment = env
	if err := h.infraSvc.Create(&infra); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusCreated, infra)
}

func (h *AdminHandler) UpdateInfrastructure(c *gin.Context) {
	env := c.Param("env")
	key := c.Param("infraKey")
	var infra model.InfrastructureConfig
	if err := c.ShouldBindJSON(&infra); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := h.infraSvc.Update(env, key, &infra); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, infra)
}

func (h *AdminHandler) DeleteInfrastructure(c *gin.Context) {
	env := c.Param("env")
	key := c.Param("infraKey")
	if err := h.infraSvc.Delete(env, key); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "deleted"})
}

// --- Firebase ---

func (h *AdminHandler) GetFirebase(c *gin.Context) {
	env := c.Param("env")
	fb, err := h.firebaseSvc.Get(env)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no firebase config for this environment"})
		return
	}
	c.JSON(http.StatusOK, fb)
}

func (h *AdminHandler) UpsertFirebase(c *gin.Context) {
	env := c.Param("env")
	var fb model.FirebaseConfig
	if err := c.ShouldBindJSON(&fb); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	fb.Environment = env
	if err := h.firebaseSvc.Upsert(&fb); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, fb)
}

// --- Bulk Operations ---

type BulkExportResponse struct {
	Environment    string                     `json:"environment"`
	Services       []model.ServiceUrl         `json:"services"`
	Infrastructure []model.InfrastructureConfig `json:"infrastructure"`
	Firebase       *model.FirebaseConfig      `json:"firebase"`
}

func (h *AdminHandler) Export(c *gin.Context) {
	env := c.Param("env")
	services, _ := h.serviceUrlSvc.List(env, "")
	infra, _ := h.infraSvc.List(env)
	fb, _ := h.firebaseSvc.Get(env)

	c.JSON(http.StatusOK, BulkExportResponse{
		Environment:    env,
		Services:       services,
		Infrastructure: infra,
		Firebase:       fb,
	})
}

type BulkImportRequest struct {
	Services       []model.ServiceUrl          `json:"services"`
	Infrastructure []model.InfrastructureConfig `json:"infrastructure"`
}

func (h *AdminHandler) Import(c *gin.Context) {
	env := c.Param("env")
	var req BulkImportRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	created := 0
	for i := range req.Services {
		req.Services[i].Environment = env
		if err := h.serviceUrlSvc.Create(&req.Services[i]); err == nil {
			created++
		}
	}
	for i := range req.Infrastructure {
		req.Infrastructure[i].Environment = env
		if err := h.infraSvc.Create(&req.Infrastructure[i]); err == nil {
			created++
		}
	}

	c.JSON(http.StatusOK, gin.H{"imported": created})
}

type CloneRequest struct {
	SourceEnv string `json:"sourceEnv" binding:"required"`
	TargetEnv string `json:"targetEnv" binding:"required"`
	Overwrite bool   `json:"overwrite"`
}

func (h *AdminHandler) Clone(c *gin.Context) {
	var req CloneRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if !validEnvironments[req.SourceEnv] || !validEnvironments[req.TargetEnv] {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid environment"})
		return
	}

	// Export source
	services, _ := h.serviceUrlSvc.List(req.SourceEnv, "")
	infra, _ := h.infraSvc.List(req.SourceEnv)

	cloned := 0
	for _, svc := range services {
		clone := svc
		clone.ID = [16]byte{} // reset for new UUID
		clone.Environment = req.TargetEnv
		if req.Overwrite {
			_ = h.serviceUrlSvc.Delete(req.TargetEnv, svc.ServiceKey)
		}
		if err := h.serviceUrlSvc.Create(&clone); err == nil {
			cloned++
		}
	}
	for _, inf := range infra {
		clone := inf
		clone.ID = [16]byte{}
		clone.Environment = req.TargetEnv
		if req.Overwrite {
			_ = h.infraSvc.Delete(req.TargetEnv, inf.InfraKey)
		}
		if err := h.infraSvc.Create(&clone); err == nil {
			cloned++
		}
	}

	c.JSON(http.StatusOK, gin.H{"cloned": cloned})
}
```

Note: `CountByEnv` and `Exists` methods need to be added to the service layer. These are thin pass-throughs to the repo.

**Step 2: Add missing service methods**

Append to `service_url_service.go`:
```go
func (s *ServiceUrlService) CountByEnv(env string) (int64, error) {
	return s.repo.CountByEnv(env)
}
```

Append to `infrastructure_service.go`:
```go
func (s *InfrastructureService) CountByEnv(env string) (int64, error) {
	return s.repo.CountByEnv(env)
}
```

Append to `firebase_service.go`:
```go
func (s *FirebaseService) Exists(env string) (bool, error) {
	return s.repo.ExistsByEnv(env)
}
```

**Step 3: Commit**

```bash
git add service-urls/api/v1/internal/handler/admin_handler.go service-urls/api/v1/internal/service/
git commit -m "feat(service-urls-api): add admin CRUD handler with bulk operations"
```

---

### Task 9: Auth handler

**Files:**
- Create: `service-urls/api/v1/internal/handler/auth_handler.go`

**Step 1: Create auth_handler.go**

```go
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"
	goauth "github.com/quckapp/go-auth"
	"github.com/quckapp/service-urls-api/internal/service"
)

type AuthHandler struct {
	authService *service.AuthService
}

func NewAuthHandler(authService *service.AuthService) *AuthHandler {
	return &AuthHandler{authService: authService}
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req service.LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	resp, err := h.authService.Login(req)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, resp)
}

func (h *AuthHandler) GetProfile(c *gin.Context) {
	userID, exists := goauth.GetUserID(c)
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "not authenticated"})
		return
	}

	user := h.authService.GetProfile(userID)
	c.JSON(http.StatusOK, user)
}
```

**Step 2: Commit**

```bash
git add service-urls/api/v1/internal/handler/auth_handler.go
git commit -m "feat(service-urls-api): add auth handler with login and profile"
```

---

### Task 10: Main entrypoint — wire everything + routes

**Files:**
- Create: `service-urls/api/v1/cmd/server/main.go`

**Step 1: Create main.go**

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/quckapp/service-urls-api/internal/config"
	"github.com/quckapp/service-urls-api/internal/handler"
	"github.com/quckapp/service-urls-api/internal/middleware"
	"github.com/quckapp/service-urls-api/internal/model"
	"github.com/quckapp/service-urls-api/internal/repository"
	"github.com/quckapp/service-urls-api/internal/service"
	goauth "github.com/quckapp/go-auth"
	"github.com/sirupsen/logrus"
)

func main() {
	// Logger
	logger := logrus.New()
	logger.SetFormatter(&logrus.JSONFormatter{})
	logger.SetOutput(os.Stdout)
	logger.Info("Starting service-urls-api...")

	// Config
	cfg := config.Load()

	// Database
	db, err := config.InitDB(cfg)
	if err != nil {
		logger.Fatalf("Failed to connect to database: %v", err)
	}
	logger.Info("Connected to MySQL")

	// Auto-migrate
	if err := db.AutoMigrate(
		&model.ServiceUrl{},
		&model.InfrastructureConfig{},
		&model.FirebaseConfig{},
		&model.ApiKey{},
	); err != nil {
		logger.Fatalf("Failed to migrate database: %v", err)
	}
	logger.Info("Database migrated")

	// Seed default API key if none exist
	seedDefaultApiKey(db, logger)

	// Repositories
	serviceUrlRepo := repository.NewServiceUrlRepository(db)
	infraRepo := repository.NewInfrastructureRepository(db)
	firebaseRepo := repository.NewFirebaseRepository(db)
	apiKeyRepo := repository.NewApiKeyRepository(db)

	// Services
	configSvc := service.NewConfigService(serviceUrlRepo, infraRepo, firebaseRepo)
	serviceUrlSvc := service.NewServiceUrlService(serviceUrlRepo)
	infraSvc := service.NewInfrastructureService(infraRepo)
	firebaseSvc := service.NewFirebaseService(firebaseRepo)
	authSvc := service.NewAuthService(cfg.JWTSecret)

	// Handlers
	configHandler := handler.NewConfigHandler(configSvc)
	adminHandler := handler.NewAdminHandler(serviceUrlSvc, infraSvc, firebaseSvc, configSvc)
	authHandler := handler.NewAuthHandler(authSvc)

	// Router
	router := gin.New()
	router.Use(gin.Recovery())
	router.Use(middleware.CORS())
	router.Use(goauth.Logger(logger))
	router.Use(goauth.RequestID())

	// Health check
	router.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "healthy", "service": "service-urls-api"})
	})

	// Config reader routes (X-API-Key auth)
	configGroup := router.Group("/api/v1/config")
	configGroup.Use(middleware.ApiKeyAuth(apiKeyRepo))
	{
		configGroup.GET("/:env/env-file", configHandler.GetEnvFile)
		configGroup.GET("/:env/json", configHandler.GetJSON)
		configGroup.GET("/:env/service/:key", configHandler.GetSingleValue)
		configGroup.GET("/:env/docker-compose", configHandler.GetDockerCompose)
	}

	// Auth routes (no auth required)
	authGroup := router.Group("/api/v1/auth")
	{
		authGroup.POST("/login", authHandler.Login)
	}

	// Admin routes (JWT auth)
	authCfg := goauth.DefaultConfig(cfg.JWTSecret)
	adminGroup := router.Group("/api/v1/admin")
	adminGroup.Use(goauth.Auth(authCfg))
	{
		adminGroup.GET("/profile", authHandler.GetProfile)

		su := adminGroup.Group("/service-urls")
		{
			su.GET("/summary", adminHandler.GetSummaries)
			su.POST("/clone", adminHandler.Clone)

			env := su.Group("/:env")
			{
				env.GET("/services", adminHandler.ListServices)
				env.POST("/services", adminHandler.CreateService)
				env.PUT("/services/:serviceKey", adminHandler.UpdateService)
				env.DELETE("/services/:serviceKey", adminHandler.DeleteService)

				env.GET("/infrastructure", adminHandler.ListInfrastructure)
				env.POST("/infrastructure", adminHandler.CreateInfrastructure)
				env.PUT("/infrastructure/:infraKey", adminHandler.UpdateInfrastructure)
				env.DELETE("/infrastructure/:infraKey", adminHandler.DeleteInfrastructure)

				env.GET("/firebase", adminHandler.GetFirebase)
				env.PUT("/firebase", adminHandler.UpsertFirebase)

				env.GET("/export", adminHandler.Export)
				env.POST("/import", adminHandler.Import)
			}
		}
	}

	// Start server with graceful shutdown
	srv := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	go func() {
		logger.Infof("Listening on :%s", cfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Fatalf("Server error: %v", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit
	logger.Info("Shutting down...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		logger.Fatalf("Forced shutdown: %v", err)
	}
	logger.Info("Server stopped")
}

func seedDefaultApiKey(db *gorm.DB, logger *logrus.Logger) {
	var count int64
	db.Model(&model.ApiKey{}).Count(&count)
	if count == 0 {
		key := model.ApiKey{
			KeyHash: model.HashKey("qk_dev_masterkey_2024"),
			Name:    "default-dev-key",
		}
		if err := db.Create(&key).Error; err != nil {
			logger.Warnf("Failed to seed default API key: %v", err)
		} else {
			logger.Info("Seeded default API key: qk_dev_masterkey_2024")
		}
	}
}
```

Note: `seedDefaultApiKey` references `gorm.DB` — add the import: `"gorm.io/gorm"`.

**Step 2: Commit**

```bash
git add service-urls/api/v1/cmd/server/main.go
git commit -m "feat(service-urls-api): add main entrypoint with route wiring"
```

---

### Task 11: Dockerfile + DB seed script

**Files:**
- Create: `service-urls/api/v1/Dockerfile`
- Create: `service-urls/docker/init/01-seed.sql`

**Step 1: Create Dockerfile**

The bookmark-service Dockerfile uses repo root as build context to resolve the `go-auth` replace directive. We need the same approach, but the configloader compose file currently uses `context: ./service-urls/api/v1`. We must update the compose file (Task 12) to use `context: .` with `dockerfile: service-urls/api/v1/Dockerfile`.

```dockerfile
# Build stage
# NOTE: Build context is repo root (.) to resolve replace directive for go-auth
FROM golang:1.21-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git

# Copy go-auth package (referenced via replace directive)
COPY packages/go-auth /app/packages/go-auth

# Copy service go mod files
WORKDIR /app/service-urls/api/v1
COPY service-urls/api/v1/go.mod service-urls/api/v1/go.sum ./
RUN go mod download

# Copy service source code
COPY service-urls/api/v1/ .

# Build the application
RUN CGO_ENABLED=0 GOOS=linux go build -o /app/server ./cmd/server

# Runtime stage
FROM alpine:3.19

WORKDIR /app

RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

COPY --from=builder /app/server .

RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 8085

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8085/health || exit 1

CMD ["./server"]
```

**Step 2: Create seed SQL**

```sql
-- 01-seed.sql: Initial schema seed for service-urls-api
-- This runs on first MySQL container startup via docker-entrypoint-initdb.d
--
-- Note: GORM AutoMigrate creates the tables, so this just seeds data.
-- The tables may not exist on first DB init (API hasn't connected yet),
-- so we use CREATE TABLE IF NOT EXISTS for the api_keys table.

CREATE TABLE IF NOT EXISTS api_keys (
    id CHAR(36) PRIMARY KEY,
    key_hash VARCHAR(64) NOT NULL,
    name VARCHAR(100) NOT NULL,
    environment VARCHAR(20),
    is_active TINYINT(1) DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_api_keys_key_hash (key_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Default dev API key: qk_dev_masterkey_2024
-- SHA-256 hash: pre-computed
INSERT IGNORE INTO api_keys (id, key_hash, name, environment, is_active, created_at)
VALUES (
    UUID(),
    SHA2('qk_dev_masterkey_2024', 256),
    'default-dev-key',
    NULL,
    1,
    NOW()
);
```

**Step 3: Commit**

```bash
git add service-urls/api/v1/Dockerfile service-urls/docker/init/01-seed.sql
git commit -m "feat(service-urls-api): add Dockerfile and DB seed script"
```

---

### Task 12: Update docker-compose.configloader.yml

**Files:**
- Modify: `docker-compose.configloader.yml:20-22`

**Step 1: Update build context to repo root**

Change the `local-service-urls-api` build section from:
```yaml
    build:
      context: ./service-urls/api/v1
      dockerfile: Dockerfile
```
to:
```yaml
    build:
      context: .
      dockerfile: service-urls/api/v1/Dockerfile
```

Also update the DB init volume mount from:
```yaml
      - ./service-urls/docker/init:/docker-entrypoint-initdb.d
```
to (no change needed — path is relative to repo root and correct).

**Step 2: Commit**

```bash
git add docker-compose.configloader.yml
git commit -m "fix(configloader): update build context to repo root for go-auth resolution"
```

---

### Task 13: Resolve Go dependencies and build

**Step 1: Initialize go.sum**

```bash
cd service-urls/api/v1
go mod tidy
```

Run: Verify no errors. The `go.sum` file should be created.

**Step 2: Verify compilation**

```bash
cd service-urls/api/v1
go build ./cmd/server
```

Run: Should produce no errors. Delete the binary after: `rm server` (or `server.exe` on Windows).

**Step 3: Commit go.sum**

```bash
git add service-urls/api/v1/go.sum
git commit -m "chore(service-urls-api): add go.sum after dependency resolution"
```

---

### Task 14: Docker build and run

**Step 1: Build and start the stack**

```bash
docker compose -f docker-compose.yml -f docker-compose.configloader.yml up -d local-service-urls-api local-service-urls-db
```

Run: Verify both containers start. Check logs:
```bash
docker logs quckapp-local-service-urls-api
```

Expected: Should see "Connected to MySQL", "Database migrated", "Listening on :8085"

**Step 2: Smoke test the config reader endpoint**

```bash
curl -H "X-API-Key: qk_dev_masterkey_2024" http://localhost:8085/api/v1/config/development/json
```

Expected: `{}` (empty JSON since no config data is seeded yet) or a valid JSON response.

**Step 3: Smoke test the health endpoint**

```bash
curl http://localhost:8085/health
```

Expected: `{"service":"service-urls-api","status":"healthy"}`

---

### USER CONTRIBUTION OPPORTUNITY: Config Flattening Logic

After Task 5, the config flattening in `config_service.go` has a meaningful design choice:

**Context:** The `FormatEnvFile` function iterates over a `map[string]string` which has non-deterministic ordering in Go. For the env-file and docker-compose formats, this means the output order changes on every request.

**Request:** In `service-urls/api/v1/internal/service/config_service.go`, consider whether the `FormatEnvFile` and `FormatDockerCompose` functions should sort keys alphabetically for deterministic output, or group them by type (service URLs first, then infrastructure, then firebase). This affects readability when debugging and consistency for caching.

**Guidance:** Sorted keys are simpler but lose semantic grouping. Grouped output requires changing the function signatures to accept structured data instead of a flat map. Consider which is more useful for operators debugging config issues.

---

Plan complete and saved to `docs/plans/2026-02-26-service-urls-api-implementation.md`. Two execution options:

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** — Open a new session with executing-plans, batch execution with checkpoints

Which approach?
