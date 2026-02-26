# API Versioning System — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Centralized API versioning managed through service-urls dashboard, with gated promotion lifecycle, build-time config injection via Azure Key Vault, and per-component CI/CD through GitHub Actions + Azure Pipelines.

**Architecture:** Approach B — Service-Level Version Routing. Services handle multiple API versions internally via shared middleware packages. Kong routes with version-aware regex. service-urls dashboard is the config management plane (build-time only, no runtime dependency). Version promotion is gated by CI/CD confirming code readiness.

**Tech Stack:** Spring Boot 3.2 (Java 21), Go 1.21 (Gin), Elixir (Phoenix), Python (FastAPI), NestJS (TypeScript), React 18 + Redux Toolkit (dashboard), Kong 3.9, GitHub Actions, Azure Pipelines, Azure Key Vault.

**Design doc:** `docs/plans/2026-02-26-api-versioning-design.md`

---

## Phase 1: Data Model + Admin Service Backend

Foundation — all other phases depend on this.

### Task 1.1: Add Version Database Entities to admin-service

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/VersionConfig.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/GlobalVersionConfig.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/VersionProfile.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/VersionProfileEntry.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/VersionStatus.java`

**Step 1: Create VersionStatus enum**

```java
package com.quckapp.admin.domain.entity;

public enum VersionStatus {
    PLANNED,
    READY,
    ACTIVE,
    DEPRECATED,
    SUNSET,
    DISABLED
}
```

**Step 2: Create VersionConfig entity**

```java
package com.quckapp.admin.domain.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Entity
@Table(name = "version_configs",
    uniqueConstraints = @UniqueConstraint(columns = {"environment", "service_key", "api_version"}))
@EntityListeners(AuditingEntityListener.class)
public class VersionConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String environment;

    @Column(name = "service_key", nullable = false)
    private String serviceKey;

    @Column(name = "api_version", nullable = false)
    private String apiVersion;

    @Column(name = "release_version")
    private String releaseVersion;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private VersionStatus status = VersionStatus.PLANNED;

    @Column(name = "sunset_date")
    private LocalDate sunsetDate;

    @Column(name = "sunset_duration_days")
    private Integer sunsetDurationDays;

    @Column(name = "deprecated_at")
    private LocalDateTime deprecatedAt;

    @Column(columnDefinition = "TEXT")
    private String changelog;

    @Column(name = "updated_by")
    private String updatedBy;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // Getters and setters
}
```

**Step 3: Create GlobalVersionConfig entity**

```java
package com.quckapp.admin.domain.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDateTime;

@Entity
@Table(name = "global_version_configs",
    uniqueConstraints = @UniqueConstraint(columns = {"environment"}))
@EntityListeners(AuditingEntityListener.class)
public class GlobalVersionConfig {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false, unique = true)
    private String environment;

    @Column(name = "default_api_version", nullable = false)
    private String defaultApiVersion = "v1";

    @Column(name = "default_sunset_days", nullable = false)
    private int defaultSunsetDays = 90;

    @Column(name = "updated_by")
    private String updatedBy;

    @LastModifiedDate
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    // Getters and setters
}
```

**Step 4: Create VersionProfile + VersionProfileEntry entities**

```java
// VersionProfile.java
package com.quckapp.admin.domain.entity;

import jakarta.persistence.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "version_profiles")
@EntityListeners(AuditingEntityListener.class)
public class VersionProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @Column(nullable = false)
    private String name;

    private String description;

    @OneToMany(mappedBy = "profile", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<VersionProfileEntry> entries = new ArrayList<>();

    @Column(name = "created_by")
    private String createdBy;

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private LocalDateTime createdAt;

    // Getters and setters
}

// VersionProfileEntry.java
package com.quckapp.admin.domain.entity;

import jakarta.persistence.*;

@Entity
@Table(name = "version_profile_entries")
public class VersionProfileEntry {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id", nullable = false)
    private VersionProfile profile;

    @Column(name = "service_key", nullable = false)
    private String serviceKey;

    @Column(name = "api_version", nullable = false)
    private String apiVersion;

    @Column(name = "release_version")
    private String releaseVersion;

    // Getters and setters
}
```

**Step 5: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/domain/entity/Version*.java
git add services/admin-service/src/main/java/com/quckapp/admin/domain/entity/GlobalVersionConfig.java
git commit -m "feat(admin-service): add version config database entities"
```

---

### Task 1.2: Add JPA Repositories

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/repository/VersionConfigRepository.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/repository/GlobalVersionConfigRepository.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/repository/VersionProfileRepository.java`

**Step 1: Create repositories**

```java
// VersionConfigRepository.java
package com.quckapp.admin.domain.repository;

import com.quckapp.admin.domain.entity.VersionConfig;
import com.quckapp.admin.domain.entity.VersionStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.List;
import java.util.Optional;

public interface VersionConfigRepository extends JpaRepository<VersionConfig, String> {
    List<VersionConfig> findByEnvironment(String environment);
    List<VersionConfig> findByEnvironmentAndServiceKey(String environment, String serviceKey);
    Optional<VersionConfig> findByEnvironmentAndServiceKeyAndApiVersion(String environment, String serviceKey, String apiVersion);
    List<VersionConfig> findByEnvironmentAndStatus(String environment, VersionStatus status);
    List<VersionConfig> findByEnvironmentAndApiVersion(String environment, String apiVersion);
    boolean existsByEnvironmentAndServiceKeyAndStatusAndApiVersionNot(String environment, String serviceKey, VersionStatus status, String apiVersion);
}

// GlobalVersionConfigRepository.java
package com.quckapp.admin.domain.repository;

import com.quckapp.admin.domain.entity.GlobalVersionConfig;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.Optional;

public interface GlobalVersionConfigRepository extends JpaRepository<GlobalVersionConfig, String> {
    Optional<GlobalVersionConfig> findByEnvironment(String environment);
}

// VersionProfileRepository.java
package com.quckapp.admin.domain.repository;

import com.quckapp.admin.domain.entity.VersionProfile;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VersionProfileRepository extends JpaRepository<VersionProfile, String> {}
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/domain/repository/Version*.java
git add services/admin-service/src/main/java/com/quckapp/admin/domain/repository/GlobalVersionConfigRepository.java
git commit -m "feat(admin-service): add version config JPA repositories"
```

---

### Task 1.3: Add DTOs for Version API

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/dto/VersionDtos.java`

**Step 1: Create request/response DTOs**

```java
package com.quckapp.admin.dto;

import com.quckapp.admin.domain.entity.VersionStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

public class VersionDtos {

    // --- Requests ---

    public record CreateVersionRequest(
        @NotBlank String serviceKey,
        @NotBlank @Pattern(regexp = "^v\\d+(\\.\\d+)?$") String apiVersion,
        String releaseVersion,
        String changelog
    ) {}

    public record UpdateVersionRequest(
        String releaseVersion,
        Integer sunsetDurationDays,
        String changelog
    ) {}

    public record BulkPlanRequest(
        @NotBlank @Pattern(regexp = "^v\\d+(\\.\\d+)?$") String apiVersion,
        String releaseVersion,
        String changelog
    ) {}

    public record ApplyProfileRequest(
        boolean activateReady
    ) {}

    public record GlobalConfigRequest(
        @NotBlank @Pattern(regexp = "^v\\d+(\\.\\d+)?$") String defaultApiVersion,
        int defaultSunsetDays
    ) {}

    public record CreateProfileRequest(
        @NotBlank String name,
        String description,
        List<ProfileEntryRequest> entries
    ) {}

    public record ProfileEntryRequest(
        @NotBlank String serviceKey,
        @NotBlank String apiVersion,
        String releaseVersion
    ) {}

    // --- Responses ---

    public record VersionConfigResponse(
        String id,
        String environment,
        String serviceKey,
        String apiVersion,
        String releaseVersion,
        VersionStatus status,
        LocalDate sunsetDate,
        Integer sunsetDurationDays,
        LocalDateTime deprecatedAt,
        String changelog,
        String updatedBy,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
    ) {}

    public record GlobalConfigResponse(
        String id,
        String environment,
        String defaultApiVersion,
        int defaultSunsetDays,
        String updatedBy,
        LocalDateTime updatedAt
    ) {}

    public record ProfileResponse(
        String id,
        String name,
        String description,
        List<ProfileEntryResponse> entries,
        String createdBy,
        LocalDateTime createdAt
    ) {}

    public record ProfileEntryResponse(
        String serviceKey,
        String apiVersion,
        String releaseVersion
    ) {}

    public record BulkActivateResponse(
        List<String> activated,
        List<String> skippedNotReady,
        List<String> skippedAlreadyActive
    ) {}

    public record ApplyProfileResponse(
        List<String> activated,
        List<String> planned,
        List<String> skippedNotReady
    ) {}

    public record PublicVersionMapResponse(
        String environment,
        String defaultApiVersion,
        java.util.Map<String, ServiceVersionInfo> services
    ) {}

    public record ServiceVersionInfo(
        List<String> activeVersions,
        List<String> deprecatedVersions,
        String baseUrl
    ) {}

    public record ExportEnvFileResponse(
        String content,
        String filename
    ) {}
}
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/dto/VersionDtos.java
git commit -m "feat(admin-service): add version API request/response DTOs"
```

---

### Task 1.4: Add Version Service Layer

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/service/VersionService.java`

**Step 1: Implement version business logic**

This is where the gated promotion rules live. The service enforces:
- PLANNED → READY: only via CI callback
- READY → ACTIVE: only when status is READY
- ACTIVE → DEPRECATED: only when a newer version is ACTIVE
- Bulk operations respect individual readiness

```java
package com.quckapp.admin.service;

import com.quckapp.admin.domain.entity.*;
import com.quckapp.admin.domain.repository.*;
import com.quckapp.admin.dto.VersionDtos.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@Service
@Transactional
public class VersionService {

    private final VersionConfigRepository versionRepo;
    private final GlobalVersionConfigRepository globalRepo;
    private final VersionProfileRepository profileRepo;

    public VersionService(VersionConfigRepository versionRepo,
                          GlobalVersionConfigRepository globalRepo,
                          VersionProfileRepository profileRepo) {
        this.versionRepo = versionRepo;
        this.globalRepo = globalRepo;
        this.profileRepo = profileRepo;
    }

    // --- Version CRUD ---

    public List<VersionConfig> listVersions(String env) {
        return versionRepo.findByEnvironment(env);
    }

    public List<VersionConfig> listVersionsForService(String env, String serviceKey) {
        return versionRepo.findByEnvironmentAndServiceKey(env, serviceKey);
    }

    public VersionConfig createVersion(String env, CreateVersionRequest req, String updatedBy) {
        versionRepo.findByEnvironmentAndServiceKeyAndApiVersion(env, req.serviceKey(), req.apiVersion())
            .ifPresent(v -> { throw new IllegalStateException(
                "Version " + req.apiVersion() + " already exists for " + req.serviceKey() + " in " + env); });

        var config = new VersionConfig();
        config.setEnvironment(env);
        config.setServiceKey(req.serviceKey());
        config.setApiVersion(req.apiVersion());
        config.setReleaseVersion(req.releaseVersion());
        config.setStatus(VersionStatus.PLANNED);
        config.setChangelog(req.changelog());
        config.setUpdatedBy(updatedBy);
        return versionRepo.save(config);
    }

    public VersionConfig updateVersion(String env, String serviceKey, String ver, UpdateVersionRequest req, String updatedBy) {
        var config = findOrThrow(env, serviceKey, ver);
        if (req.releaseVersion() != null) config.setReleaseVersion(req.releaseVersion());
        if (req.sunsetDurationDays() != null) config.setSunsetDurationDays(req.sunsetDurationDays());
        if (req.changelog() != null) config.setChangelog(req.changelog());
        config.setUpdatedBy(updatedBy);
        return versionRepo.save(config);
    }

    public void deleteVersion(String env, String serviceKey, String ver) {
        var config = findOrThrow(env, serviceKey, ver);
        if (config.getStatus() == VersionStatus.ACTIVE) {
            throw new IllegalStateException("Cannot delete an ACTIVE version. Deprecate it first.");
        }
        versionRepo.delete(config);
    }

    // --- State Transitions ---

    public VersionConfig markReady(String env, String serviceKey, String ver) {
        var config = findOrThrow(env, serviceKey, ver);
        if (config.getStatus() != VersionStatus.PLANNED) {
            throw new IllegalStateException("Can only mark PLANNED versions as READY. Current: " + config.getStatus());
        }
        config.setStatus(VersionStatus.READY);
        return versionRepo.save(config);
    }

    public VersionConfig activate(String env, String serviceKey, String ver, String updatedBy) {
        var config = findOrThrow(env, serviceKey, ver);
        if (config.getStatus() != VersionStatus.READY) {
            throw new IllegalStateException("Can only activate READY versions. Current: " + config.getStatus());
        }
        config.setStatus(VersionStatus.ACTIVE);
        config.setUpdatedBy(updatedBy);
        return versionRepo.save(config);
    }

    public VersionConfig deprecate(String env, String serviceKey, String ver, String updatedBy) {
        var config = findOrThrow(env, serviceKey, ver);
        if (config.getStatus() != VersionStatus.ACTIVE) {
            throw new IllegalStateException("Can only deprecate ACTIVE versions. Current: " + config.getStatus());
        }
        // Must have a newer active version
        boolean hasNewerActive = versionRepo.existsByEnvironmentAndServiceKeyAndStatusAndApiVersionNot(
            env, serviceKey, VersionStatus.ACTIVE, ver);
        if (!hasNewerActive) {
            throw new IllegalStateException("Cannot deprecate the only ACTIVE version. Activate a newer version first.");
        }

        var globalConfig = globalRepo.findByEnvironment(env).orElse(null);
        int sunsetDays = config.getSunsetDurationDays() != null
            ? config.getSunsetDurationDays()
            : (globalConfig != null ? globalConfig.getDefaultSunsetDays() : 90);

        config.setStatus(VersionStatus.DEPRECATED);
        config.setDeprecatedAt(LocalDateTime.now());
        config.setSunsetDate(LocalDate.now().plusDays(sunsetDays));
        config.setUpdatedBy(updatedBy);
        return versionRepo.save(config);
    }

    public VersionConfig disable(String env, String serviceKey, String ver, String updatedBy) {
        var config = findOrThrow(env, serviceKey, ver);
        if (config.getStatus() != VersionStatus.SUNSET && config.getStatus() != VersionStatus.DEPRECATED) {
            throw new IllegalStateException("Can only disable DEPRECATED or SUNSET versions.");
        }
        config.setStatus(VersionStatus.DISABLED);
        config.setUpdatedBy(updatedBy);
        return versionRepo.save(config);
    }

    // --- Bulk Operations ---

    public List<VersionConfig> bulkPlan(String env, BulkPlanRequest req, List<String> serviceKeys, String updatedBy) {
        List<VersionConfig> created = new ArrayList<>();
        for (String key : serviceKeys) {
            var existing = versionRepo.findByEnvironmentAndServiceKeyAndApiVersion(env, key, req.apiVersion());
            if (existing.isEmpty()) {
                var createReq = new CreateVersionRequest(key, req.apiVersion(), req.releaseVersion(), req.changelog());
                created.add(createVersion(env, createReq, updatedBy));
            }
        }
        return created;
    }

    public BulkActivateResponse bulkActivate(String env, String updatedBy) {
        var readyVersions = versionRepo.findByEnvironmentAndStatus(env, VersionStatus.READY);
        List<String> activated = new ArrayList<>();
        List<String> skippedAlreadyActive = new ArrayList<>();

        for (var config : readyVersions) {
            config.setStatus(VersionStatus.ACTIVE);
            config.setUpdatedBy(updatedBy);
            versionRepo.save(config);
            activated.add(config.getServiceKey() + ":" + config.getApiVersion());
        }

        return new BulkActivateResponse(activated, List.of(), skippedAlreadyActive);
    }

    // --- Profiles ---

    public List<VersionProfile> listProfiles() {
        return profileRepo.findAll();
    }

    public VersionProfile createProfile(CreateProfileRequest req, String createdBy) {
        var profile = new VersionProfile();
        profile.setName(req.name());
        profile.setDescription(req.description());
        profile.setCreatedBy(createdBy);

        for (var entry : req.entries()) {
            var profileEntry = new VersionProfileEntry();
            profileEntry.setProfile(profile);
            profileEntry.setServiceKey(entry.serviceKey());
            profileEntry.setApiVersion(entry.apiVersion());
            profileEntry.setReleaseVersion(entry.releaseVersion());
            profile.getEntries().add(profileEntry);
        }

        return profileRepo.save(profile);
    }

    public ApplyProfileResponse applyProfile(String profileId, String env, boolean activateReady, String updatedBy) {
        var profile = profileRepo.findById(profileId)
            .orElseThrow(() -> new IllegalArgumentException("Profile not found: " + profileId));

        List<String> activated = new ArrayList<>();
        List<String> planned = new ArrayList<>();
        List<String> skippedNotReady = new ArrayList<>();

        for (var entry : profile.getEntries()) {
            var existing = versionRepo.findByEnvironmentAndServiceKeyAndApiVersion(
                env, entry.getServiceKey(), entry.getApiVersion());

            if (existing.isEmpty()) {
                var createReq = new CreateVersionRequest(
                    entry.getServiceKey(), entry.getApiVersion(), entry.getReleaseVersion(), "Applied from profile: " + profile.getName());
                createVersion(env, createReq, updatedBy);
                planned.add(entry.getServiceKey() + ":" + entry.getApiVersion());
            } else {
                var config = existing.get();
                if (config.getStatus() == VersionStatus.READY && activateReady) {
                    activate(env, entry.getServiceKey(), entry.getApiVersion(), updatedBy);
                    activated.add(entry.getServiceKey() + ":" + entry.getApiVersion());
                } else if (config.getStatus() != VersionStatus.ACTIVE) {
                    skippedNotReady.add(entry.getServiceKey() + ":" + entry.getApiVersion() + " (" + config.getStatus() + ")");
                }
            }
        }

        return new ApplyProfileResponse(activated, planned, skippedNotReady);
    }

    public void deleteProfile(String profileId) {
        profileRepo.deleteById(profileId);
    }

    // --- Global Config ---

    public GlobalVersionConfig getGlobalConfig(String env) {
        return globalRepo.findByEnvironment(env).orElseGet(() -> {
            var config = new GlobalVersionConfig();
            config.setEnvironment(env);
            return config;
        });
    }

    public GlobalVersionConfig updateGlobalConfig(String env, GlobalConfigRequest req, String updatedBy) {
        var config = globalRepo.findByEnvironment(env).orElseGet(() -> {
            var c = new GlobalVersionConfig();
            c.setEnvironment(env);
            return c;
        });
        config.setDefaultApiVersion(req.defaultApiVersion());
        config.setDefaultSunsetDays(req.defaultSunsetDays());
        config.setUpdatedBy(updatedBy);
        return globalRepo.save(config);
    }

    // --- Export ---

    public String exportEnvFile(String env) {
        var versions = versionRepo.findByEnvironmentAndStatus(env, VersionStatus.ACTIVE);
        var globalConfig = getGlobalConfig(env);
        var sb = new StringBuilder();
        sb.append("# Generated by service-urls — ").append(env).append("\n");
        sb.append("# ").append(LocalDateTime.now()).append("\n\n");
        sb.append("DEFAULT_API_VERSION=").append(globalConfig.getDefaultApiVersion()).append("\n\n");

        var byService = versions.stream().collect(Collectors.groupingBy(VersionConfig::getServiceKey));
        for (var entry : byService.entrySet()) {
            var key = entry.getKey().toUpperCase().replace("-", "_");
            var activeVersions = entry.getValue().stream()
                .map(VersionConfig::getApiVersion).collect(Collectors.joining(","));
            var latest = entry.getValue().stream()
                .max(Comparator.comparing(VersionConfig::getApiVersion)).orElse(null);
            sb.append(key).append("_API_VERSION=").append(latest != null ? latest.getApiVersion() : "v1").append("\n");
            sb.append(key).append("_RELEASE_VERSION=").append(latest != null && latest.getReleaseVersion() != null ? latest.getReleaseVersion() : "0.0.0").append("\n");
            sb.append(key).append("_SUPPORTED_VERSIONS=").append(activeVersions).append("\n\n");
        }

        // Deprecated versions with sunset dates
        var deprecated = versionRepo.findByEnvironmentAndStatus(env, VersionStatus.DEPRECATED);
        if (!deprecated.isEmpty()) {
            sb.append("# Deprecated versions (sunset dates)\n");
            for (var dep : deprecated) {
                var key = dep.getServiceKey().toUpperCase().replace("-", "_");
                sb.append(key).append("_DEPRECATED_VERSIONS=").append(dep.getApiVersion()).append("\n");
                sb.append(key).append("_SUNSET_CONFIG=").append(dep.getApiVersion()).append(":").append(dep.getSunsetDate()).append("\n");
            }
        }

        return sb.toString();
    }

    // --- Public Config Endpoint ---

    public PublicVersionMapResponse getPublicVersionMap(String env, String baseUrl) {
        var versions = versionRepo.findByEnvironment(env);
        var globalConfig = getGlobalConfig(env);
        Map<String, ServiceVersionInfo> services = new HashMap<>();

        var byService = versions.stream().collect(Collectors.groupingBy(VersionConfig::getServiceKey));
        for (var entry : byService.entrySet()) {
            var active = entry.getValue().stream()
                .filter(v -> v.getStatus() == VersionStatus.ACTIVE)
                .map(VersionConfig::getApiVersion).toList();
            var deprecated = entry.getValue().stream()
                .filter(v -> v.getStatus() == VersionStatus.DEPRECATED)
                .map(VersionConfig::getApiVersion).toList();
            services.put(entry.getKey(), new ServiceVersionInfo(active, deprecated, baseUrl));
        }

        return new PublicVersionMapResponse(env, globalConfig.getDefaultApiVersion(), services);
    }

    // --- Helpers ---

    private VersionConfig findOrThrow(String env, String serviceKey, String ver) {
        return versionRepo.findByEnvironmentAndServiceKeyAndApiVersion(env, serviceKey, ver)
            .orElseThrow(() -> new IllegalArgumentException(
                "Version " + ver + " not found for " + serviceKey + " in " + env));
    }
}
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/service/VersionService.java
git commit -m "feat(admin-service): add version service with gated promotion logic"
```

---

### Task 1.5: Add Version Controller

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/controller/VersionController.java`

**Step 1: Create controller with all endpoints**

Reference: Follows same pattern as `AdminController.java` line 17-18 (`@RestController`, `@RequestMapping`).

```java
package com.quckapp.admin.controller;

import com.quckapp.admin.dto.VersionDtos.*;
import com.quckapp.admin.service.VersionService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/admin/service-urls")
public class VersionController {

    private final VersionService versionService;

    public VersionController(VersionService versionService) {
        this.versionService = versionService;
    }

    // --- Version CRUD ---

    @GetMapping("/{env}/versions")
    public ResponseEntity<?> listVersions(@PathVariable String env) {
        return ResponseEntity.ok(Map.of("data", versionService.listVersions(env)));
    }

    @GetMapping("/{env}/versions/{serviceKey}")
    public ResponseEntity<?> listServiceVersions(@PathVariable String env, @PathVariable String serviceKey) {
        return ResponseEntity.ok(Map.of("data", versionService.listVersionsForService(env, serviceKey)));
    }

    @PostMapping("/{env}/versions")
    public ResponseEntity<?> createVersion(@PathVariable String env, @Valid @RequestBody CreateVersionRequest req) {
        var result = versionService.createVersion(env, req, "admin"); // TODO: extract from auth
        return ResponseEntity.ok(Map.of("data", result));
    }

    @PutMapping("/{env}/versions/{serviceKey}/{ver}")
    public ResponseEntity<?> updateVersion(@PathVariable String env, @PathVariable String serviceKey,
                                           @PathVariable String ver, @Valid @RequestBody UpdateVersionRequest req) {
        var result = versionService.updateVersion(env, serviceKey, ver, req, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    @DeleteMapping("/{env}/versions/{serviceKey}/{ver}")
    public ResponseEntity<?> deleteVersion(@PathVariable String env, @PathVariable String serviceKey, @PathVariable String ver) {
        versionService.deleteVersion(env, serviceKey, ver);
        return ResponseEntity.ok(Map.of("message", "Deleted"));
    }

    // --- State Transitions ---

    @PostMapping("/{env}/versions/{serviceKey}/{ver}/ready")
    public ResponseEntity<?> markReady(@PathVariable String env, @PathVariable String serviceKey, @PathVariable String ver) {
        var result = versionService.markReady(env, serviceKey, ver);
        return ResponseEntity.ok(Map.of("data", result));
    }

    @PostMapping("/{env}/versions/{serviceKey}/{ver}/activate")
    public ResponseEntity<?> activate(@PathVariable String env, @PathVariable String serviceKey, @PathVariable String ver) {
        var result = versionService.activate(env, serviceKey, ver, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    @PostMapping("/{env}/versions/{serviceKey}/{ver}/deprecate")
    public ResponseEntity<?> deprecate(@PathVariable String env, @PathVariable String serviceKey, @PathVariable String ver) {
        var result = versionService.deprecate(env, serviceKey, ver, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    @PostMapping("/{env}/versions/{serviceKey}/{ver}/disable")
    public ResponseEntity<?> disable(@PathVariable String env, @PathVariable String serviceKey, @PathVariable String ver) {
        var result = versionService.disable(env, serviceKey, ver, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    // --- Bulk Operations ---

    @PostMapping("/{env}/versions/bulk-plan")
    public ResponseEntity<?> bulkPlan(@PathVariable String env, @Valid @RequestBody BulkPlanRequest req,
                                       @RequestParam(required = false) List<String> serviceKeys) {
        // If no serviceKeys provided, use all from SERVICE_REGISTRY
        var result = versionService.bulkPlan(env, req, serviceKeys, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    @PostMapping("/{env}/versions/bulk-activate")
    public ResponseEntity<?> bulkActivate(@PathVariable String env) {
        var result = versionService.bulkActivate(env, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    // --- Profiles ---

    @GetMapping("/profiles")
    public ResponseEntity<?> listProfiles() {
        return ResponseEntity.ok(Map.of("data", versionService.listProfiles()));
    }

    @PostMapping("/profiles")
    public ResponseEntity<?> createProfile(@Valid @RequestBody CreateProfileRequest req) {
        var result = versionService.createProfile(req, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    @PostMapping("/profiles/{id}/apply/{env}")
    public ResponseEntity<?> applyProfile(@PathVariable String id, @PathVariable String env,
                                           @Valid @RequestBody ApplyProfileRequest req) {
        var result = versionService.applyProfile(id, env, req.activateReady(), "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    @DeleteMapping("/profiles/{id}")
    public ResponseEntity<?> deleteProfile(@PathVariable String id) {
        versionService.deleteProfile(id);
        return ResponseEntity.ok(Map.of("message", "Deleted"));
    }

    // --- Global Config ---

    @GetMapping("/{env}/global-config")
    public ResponseEntity<?> getGlobalConfig(@PathVariable String env) {
        return ResponseEntity.ok(Map.of("data", versionService.getGlobalConfig(env)));
    }

    @PutMapping("/{env}/global-config")
    public ResponseEntity<?> updateGlobalConfig(@PathVariable String env, @Valid @RequestBody GlobalConfigRequest req) {
        var result = versionService.updateGlobalConfig(env, req, "admin");
        return ResponseEntity.ok(Map.of("data", result));
    }

    // --- Export ---

    @GetMapping("/{env}/export/env-file")
    public ResponseEntity<?> exportEnvFile(@PathVariable String env) {
        var content = versionService.exportEnvFile(env);
        return ResponseEntity.ok(Map.of("data", Map.of(
            "content", content,
            "filename", "service-urls-" + env + "-versions.env"
        )));
    }
}
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/controller/VersionController.java
git commit -m "feat(admin-service): add version management REST controller"
```

---

### Task 1.6: Add Public Config Endpoint

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/controller/PublicConfigController.java`

**Step 1: Create public controller (separate from admin routes)**

This is the endpoint clients fetch at app startup: `GET /api/v1/config/versions`

```java
package com.quckapp.admin.controller;

import com.quckapp.admin.service.VersionService;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/config")
public class PublicConfigController {

    private final VersionService versionService;

    @Value("${app.base-url:https://api.quckapp.io}")
    private String baseUrl;

    public PublicConfigController(VersionService versionService) {
        this.versionService = versionService;
    }

    @GetMapping("/versions")
    public ResponseEntity<?> getVersionMap(@RequestParam String environment) {
        var result = versionService.getPublicVersionMap(environment, baseUrl);
        return ResponseEntity.ok(Map.of("data", result));
    }
}
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/controller/PublicConfigController.java
git commit -m "feat(admin-service): add public config/versions endpoint for clients"
```

---

## Phase 2: Version Middleware Packages

Shared middleware for each language stack. Services import these to handle version routing, sunset headers, and status enforcement.

### Task 2.1: Go Version Middleware Package

**Files:**
- Create: `packages/go-version-middleware/go.mod`
- Create: `packages/go-version-middleware/version.go`
- Create: `packages/go-version-middleware/version_test.go`

Reference pattern: `packages/go-auth/middleware.go` (gin.HandlerFunc return type, c.Set()/c.Get() for context).

**Step 1: Create go.mod**

```
module github.com/quckapp/go-version-middleware

go 1.21

require github.com/gin-gonic/gin v1.9.1
```

Run: `cd packages/go-version-middleware && go mod tidy`

**Step 2: Write version middleware**

```go
package goversion

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// Config holds version configuration loaded from environment variables.
type Config struct {
	ServiceKey          string
	ActiveVersions      []string          // e.g., ["v1", "v2"]
	DeprecatedVersions  []string          // e.g., ["v1"]
	SunsetConfig        map[string]string // e.g., {"v1": "2026-06-01"}
	DefaultVersion      string            // e.g., "v2"
	VersionMode         string            // "local" or "deployed"
}

// ConfigFromEnv builds Config from environment variables.
// Expected env vars:
//   SUPPORTED_VERSIONS=v1,v2
//   DEPRECATED_VERSIONS=v1
//   SUNSET_CONFIG=v1:2026-06-01
//   API_VERSION=v2
//   VERSION_MODE=deployed
func ConfigFromEnv(serviceKey string, getenv func(string) string) Config {
	key := strings.ToUpper(strings.ReplaceAll(serviceKey, "-", "_"))

	supported := splitCSV(getenv(key + "_SUPPORTED_VERSIONS"))
	if len(supported) == 0 {
		supported = splitCSV(getenv("SUPPORTED_VERSIONS"))
	}
	if len(supported) == 0 {
		ver := getenv("API_VERSION")
		if ver == "" {
			ver = "v1"
		}
		supported = []string{ver}
	}

	deprecated := splitCSV(getenv(key + "_DEPRECATED_VERSIONS"))
	if len(deprecated) == 0 {
		deprecated = splitCSV(getenv("DEPRECATED_VERSIONS"))
	}

	sunsetRaw := getenv(key + "_SUNSET_CONFIG")
	if sunsetRaw == "" {
		sunsetRaw = getenv("SUNSET_CONFIG")
	}
	sunsetMap := parseSunsetConfig(sunsetRaw)

	defaultVer := getenv("API_VERSION")
	if defaultVer == "" {
		defaultVer = "v1"
	}

	mode := getenv("VERSION_MODE")
	if mode == "" {
		mode = "deployed"
	}

	return Config{
		ServiceKey:         serviceKey,
		ActiveVersions:     supported,
		DeprecatedVersions: deprecated,
		SunsetConfig:       sunsetMap,
		DefaultVersion:     defaultVer,
		VersionMode:        mode,
	}
}

var versionRegex = regexp.MustCompile(`^/api/(v\d+(?:\.\d+)?)(/.*)?$`)

// Middleware returns a gin middleware that:
// 1. Extracts the API version from the URL path
// 2. Validates it against supported versions
// 3. Adds Deprecation/Sunset headers for deprecated versions
// 4. Returns 410 Gone for sunset versions
// 5. Sets "api_version" in gin context for handlers
func Middleware(cfg Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// In local mode, skip version validation
		if cfg.VersionMode == "local" {
			c.Set("api_version", cfg.DefaultVersion)
			c.Next()
			return
		}

		matches := versionRegex.FindStringSubmatch(c.Request.URL.Path)
		if matches == nil {
			// Non-versioned path (health, metrics) — pass through
			c.Next()
			return
		}

		version := matches[1]

		// Check if sunset (past date)
		if sunsetDate, ok := cfg.SunsetConfig[version]; ok {
			parsed, err := time.Parse("2006-01-02", sunsetDate)
			if err == nil && time.Now().After(parsed) {
				c.AbortWithStatusJSON(http.StatusGone, gin.H{
					"error":   "API version " + version + " has been sunset",
					"message": "Please upgrade to " + cfg.DefaultVersion,
					"sunset":  sunsetDate,
				})
				return
			}
		}

		// Check if supported
		if !contains(cfg.ActiveVersions, version) && !contains(cfg.DeprecatedVersions, version) {
			c.AbortWithStatusJSON(http.StatusNotFound, gin.H{
				"error":   "API version " + version + " is not available",
				"message": "Supported versions: " + strings.Join(cfg.ActiveVersions, ", "),
			})
			return
		}

		// Add deprecation headers
		if contains(cfg.DeprecatedVersions, version) {
			c.Header("Deprecation", "true")
			if sunsetDate, ok := cfg.SunsetConfig[version]; ok {
				c.Header("Sunset", sunsetDate)
			}
			c.Header("Link", fmt.Sprintf("</api/%s>; rel=\"successor-version\"", cfg.DefaultVersion))
		}

		c.Set("api_version", version)
		c.Next()
	}
}

// GetVersion extracts the API version from gin context.
func GetVersion(c *gin.Context) string {
	v, _ := c.Get("api_version")
	if s, ok := v.(string); ok {
		return s
	}
	return "v1"
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, ",")
	result := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			result = append(result, p)
		}
	}
	return result
}

func parseSunsetConfig(s string) map[string]string {
	m := make(map[string]string)
	if s == "" {
		return m
	}
	for _, pair := range strings.Split(s, ",") {
		parts := strings.SplitN(strings.TrimSpace(pair), ":", 2)
		if len(parts) == 2 {
			m[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return m
}

func contains(slice []string, item string) bool {
	for _, s := range slice {
		if s == item {
			return true
		}
	}
	return false
}
```

**Step 3: Write tests**

```go
package goversion

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func setupRouter(cfg Config) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(Middleware(cfg))
	r.GET("/api/:version/test/*rest", func(c *gin.Context) {
		c.JSON(200, gin.H{"version": GetVersion(c)})
	})
	return r
}

func TestActiveVersion(t *testing.T) {
	cfg := Config{ActiveVersions: []string{"v1", "v2"}, DefaultVersion: "v2", VersionMode: "deployed"}
	r := setupRouter(cfg)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/test/hello", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
}

func TestUnsupportedVersion(t *testing.T) {
	cfg := Config{ActiveVersions: []string{"v1"}, DefaultVersion: "v1", VersionMode: "deployed"}
	r := setupRouter(cfg)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v3/test/hello", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, 404, w.Code)
}

func TestDeprecatedVersion(t *testing.T) {
	cfg := Config{
		ActiveVersions:     []string{"v1", "v2"},
		DeprecatedVersions: []string{"v1"},
		SunsetConfig:       map[string]string{"v1": "2099-01-01"},
		DefaultVersion:     "v2",
		VersionMode:        "deployed",
	}
	r := setupRouter(cfg)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/test/hello", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
	assert.Equal(t, "true", w.Header().Get("Deprecation"))
	assert.Equal(t, "2099-01-01", w.Header().Get("Sunset"))
}

func TestSunsetVersion(t *testing.T) {
	cfg := Config{
		ActiveVersions:     []string{"v2"},
		DeprecatedVersions: []string{"v1"},
		SunsetConfig:       map[string]string{"v1": "2020-01-01"}, // past date
		DefaultVersion:     "v2",
		VersionMode:        "deployed",
	}
	r := setupRouter(cfg)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/test/hello", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, 410, w.Code)
}

func TestLocalModeSkipsValidation(t *testing.T) {
	cfg := Config{DefaultVersion: "v1", VersionMode: "local"}
	r := setupRouter(cfg)
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v99/test/hello", nil)
	r.ServeHTTP(w, req)
	assert.Equal(t, 200, w.Code)
}

func TestConfigFromEnv(t *testing.T) {
	env := map[string]string{
		"API_VERSION":              "v2",
		"SUPPORTED_VERSIONS":      "v1,v2",
		"DEPRECATED_VERSIONS":     "v1",
		"SUNSET_CONFIG":           "v1:2026-06-01",
		"VERSION_MODE":            "deployed",
	}
	cfg := ConfigFromEnv("test-service", func(key string) string { return env[key] })
	assert.Equal(t, "v2", cfg.DefaultVersion)
	assert.Equal(t, []string{"v1", "v2"}, cfg.ActiveVersions)
	assert.Equal(t, []string{"v1"}, cfg.DeprecatedVersions)
	assert.Equal(t, "2026-06-01", cfg.SunsetConfig["v1"])
}
```

**Step 4: Run tests**

Run: `cd packages/go-version-middleware && go test -v ./...`
Expected: All 6 tests PASS

**Step 5: Commit**

```bash
git add packages/go-version-middleware/
git commit -m "feat: add go-version-middleware package with sunset and deprecation support"
```

---

### Task 2.2: Python Version Middleware (FastAPI)

**Files:**
- Create: `packages/python-version-middleware/version_middleware/__init__.py`
- Create: `packages/python-version-middleware/version_middleware/middleware.py`
- Create: `packages/python-version-middleware/setup.py`
- Create: `packages/python-version-middleware/tests/test_middleware.py`

Reference: `services/ml-service/src/main.py` (FastAPI app pattern, line 92-114).

**Step 1: Create middleware**

```python
# version_middleware/middleware.py
import os
import re
from datetime import date, datetime
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

VERSION_REGEX = re.compile(r"^/api/(v\d+(?:\.\d+)?)(/.*)$")


class VersionConfig:
    def __init__(
        self,
        service_key: str = "",
        active_versions: list[str] | None = None,
        deprecated_versions: list[str] | None = None,
        sunset_config: dict[str, str] | None = None,
        default_version: str = "v1",
        version_mode: str = "deployed",
    ):
        self.service_key = service_key
        self.active_versions = active_versions or ["v1"]
        self.deprecated_versions = deprecated_versions or []
        self.sunset_config = sunset_config or {}
        self.default_version = default_version
        self.version_mode = version_mode

    @classmethod
    def from_env(cls, service_key: str = "") -> "VersionConfig":
        key = service_key.upper().replace("-", "_")

        supported = os.getenv(f"{key}_SUPPORTED_VERSIONS", os.getenv("SUPPORTED_VERSIONS", ""))
        active = [v.strip() for v in supported.split(",") if v.strip()] if supported else None
        if not active:
            active = [os.getenv("API_VERSION", "v1")]

        dep_raw = os.getenv(f"{key}_DEPRECATED_VERSIONS", os.getenv("DEPRECATED_VERSIONS", ""))
        deprecated = [v.strip() for v in dep_raw.split(",") if v.strip()] if dep_raw else []

        sunset_raw = os.getenv(f"{key}_SUNSET_CONFIG", os.getenv("SUNSET_CONFIG", ""))
        sunset = {}
        if sunset_raw:
            for pair in sunset_raw.split(","):
                parts = pair.strip().split(":", 1)
                if len(parts) == 2:
                    sunset[parts[0].strip()] = parts[1].strip()

        return cls(
            service_key=service_key,
            active_versions=active,
            deprecated_versions=deprecated,
            sunset_config=sunset,
            default_version=os.getenv("API_VERSION", "v1"),
            version_mode=os.getenv("VERSION_MODE", "deployed"),
        )


class VersionMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, config: VersionConfig):
        super().__init__(app)
        self.config = config

    async def dispatch(self, request: Request, call_next):
        if self.config.version_mode == "local":
            request.state.api_version = self.config.default_version
            return await call_next(request)

        match = VERSION_REGEX.match(request.url.path)
        if not match:
            return await call_next(request)

        version = match.group(1)

        # Check sunset
        if version in self.config.sunset_config:
            try:
                sunset_date = date.fromisoformat(self.config.sunset_config[version])
                if date.today() > sunset_date:
                    return JSONResponse(
                        status_code=410,
                        content={
                            "error": f"API version {version} has been sunset",
                            "message": f"Please upgrade to {self.config.default_version}",
                            "sunset": self.config.sunset_config[version],
                        },
                    )
            except ValueError:
                pass

        # Check supported
        all_versions = self.config.active_versions + self.config.deprecated_versions
        if version not in all_versions:
            return JSONResponse(
                status_code=404,
                content={
                    "error": f"API version {version} is not available",
                    "message": f"Supported versions: {', '.join(self.config.active_versions)}",
                },
            )

        request.state.api_version = version

        response = await call_next(request)

        # Add deprecation headers
        if version in self.config.deprecated_versions:
            response.headers["Deprecation"] = "true"
            if version in self.config.sunset_config:
                response.headers["Sunset"] = self.config.sunset_config[version]
            response.headers["Link"] = f'</api/{self.config.default_version}>; rel="successor-version"'

        return response
```

**Step 2: Write tests**

```python
# tests/test_middleware.py
import pytest
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from version_middleware.middleware import VersionConfig, VersionMiddleware


def create_app(config: VersionConfig) -> FastAPI:
    app = FastAPI()
    app.add_middleware(VersionMiddleware, config=config)

    @app.get("/api/{version}/test")
    async def test_endpoint(request: Request, version: str):
        return {"version": getattr(request.state, "api_version", "unknown")}

    return app


def test_active_version():
    cfg = VersionConfig(active_versions=["v1", "v2"], default_version="v2")
    client = TestClient(create_app(cfg))
    resp = client.get("/api/v1/test")
    assert resp.status_code == 200


def test_unsupported_version():
    cfg = VersionConfig(active_versions=["v1"], default_version="v1")
    client = TestClient(create_app(cfg))
    resp = client.get("/api/v3/test")
    assert resp.status_code == 404


def test_deprecated_headers():
    cfg = VersionConfig(
        active_versions=["v1", "v2"],
        deprecated_versions=["v1"],
        sunset_config={"v1": "2099-01-01"},
        default_version="v2",
    )
    client = TestClient(create_app(cfg))
    resp = client.get("/api/v1/test")
    assert resp.status_code == 200
    assert resp.headers.get("Deprecation") == "true"
    assert resp.headers.get("Sunset") == "2099-01-01"


def test_sunset_version():
    cfg = VersionConfig(
        active_versions=["v2"],
        deprecated_versions=["v1"],
        sunset_config={"v1": "2020-01-01"},
        default_version="v2",
    )
    client = TestClient(create_app(cfg))
    resp = client.get("/api/v1/test")
    assert resp.status_code == 410


def test_local_mode():
    cfg = VersionConfig(default_version="v1", version_mode="local")
    client = TestClient(create_app(cfg))
    resp = client.get("/api/v99/test")
    assert resp.status_code == 200
```

**Step 3: Run tests**

Run: `cd packages/python-version-middleware && python -m pytest tests/ -v`
Expected: All 5 tests PASS

**Step 4: Commit**

```bash
git add packages/python-version-middleware/
git commit -m "feat: add python-version-middleware package for FastAPI services"
```

---

### Task 2.3: Spring Boot Version Starter

**Files:**
- Create: `packages/spring-version-starter/pom.xml`
- Create: `packages/spring-version-starter/src/main/java/com/quckapp/version/VersionProperties.java`
- Create: `packages/spring-version-starter/src/main/java/com/quckapp/version/VersionFilter.java`
- Create: `packages/spring-version-starter/src/main/java/com/quckapp/version/VersionAutoConfiguration.java`

Reference: `services/auth-service` uses `@RequestMapping("/v1")` (line 25 of AuthController.java). Spring services currently don't include `/api` in their controller mapping — Kong prepends it.

**Step 1: Create pom.xml**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.0</version>
        <relativePath/>
    </parent>

    <groupId>com.quckapp</groupId>
    <artifactId>spring-version-starter</artifactId>
    <version>1.0.0</version>

    <properties>
        <java.version>21</java.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
    </dependencies>
</project>
```

**Step 2: Create VersionProperties**

```java
package com.quckapp.version;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.*;

@ConfigurationProperties(prefix = "quckapp.version")
public class VersionProperties {
    private String apiVersion = "v1";
    private String mode = "deployed";
    private List<String> supportedVersions = List.of("v1");
    private List<String> deprecatedVersions = List.of();
    private Map<String, String> sunsetConfig = Map.of();

    // Getters and setters for all fields
    public String getApiVersion() { return apiVersion; }
    public void setApiVersion(String v) { this.apiVersion = v; }
    public String getMode() { return mode; }
    public void setMode(String m) { this.mode = m; }
    public List<String> getSupportedVersions() { return supportedVersions; }
    public void setSupportedVersions(List<String> v) { this.supportedVersions = v; }
    public List<String> getDeprecatedVersions() { return deprecatedVersions; }
    public void setDeprecatedVersions(List<String> v) { this.deprecatedVersions = v; }
    public Map<String, String> getSunsetConfig() { return sunsetConfig; }
    public void setSunsetConfig(Map<String, String> m) { this.sunsetConfig = m; }
}
```

**Step 3: Create VersionFilter (servlet filter)**

```java
package com.quckapp.version;

import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.time.LocalDate;
import java.util.regex.*;

public class VersionFilter implements Filter {
    private static final Pattern VERSION_PATTERN = Pattern.compile("^/(?:api/)?(v\\d+(?:\\.\\d+)?)(/.*)$");
    private final VersionProperties props;

    public VersionFilter(VersionProperties props) {
        this.props = props;
    }

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {
        var request = (HttpServletRequest) req;
        var response = (HttpServletResponse) res;

        if ("local".equals(props.getMode())) {
            request.setAttribute("api_version", props.getApiVersion());
            chain.doFilter(req, res);
            return;
        }

        var matcher = VERSION_PATTERN.matcher(request.getRequestURI());
        if (!matcher.matches()) {
            chain.doFilter(req, res);
            return;
        }

        String version = matcher.group(1);

        // Check sunset
        String sunsetDate = props.getSunsetConfig().get(version);
        if (sunsetDate != null) {
            try {
                if (LocalDate.now().isAfter(LocalDate.parse(sunsetDate))) {
                    response.setStatus(410);
                    response.setContentType("application/json");
                    response.getWriter().write(
                        "{\"error\":\"API version " + version + " has been sunset\"," +
                        "\"message\":\"Please upgrade to " + props.getApiVersion() + "\"}");
                    return;
                }
            } catch (Exception ignored) {}
        }

        // Check supported
        var allVersions = new java.util.ArrayList<>(props.getSupportedVersions());
        allVersions.addAll(props.getDeprecatedVersions());
        if (!allVersions.contains(version)) {
            response.setStatus(404);
            response.setContentType("application/json");
            response.getWriter().write(
                "{\"error\":\"API version " + version + " is not available\"}");
            return;
        }

        // Add deprecation headers
        if (props.getDeprecatedVersions().contains(version)) {
            response.setHeader("Deprecation", "true");
            if (sunsetDate != null) {
                response.setHeader("Sunset", sunsetDate);
            }
            response.setHeader("Link", "</api/" + props.getApiVersion() + ">; rel=\"successor-version\"");
        }

        request.setAttribute("api_version", version);
        chain.doFilter(req, res);
    }
}
```

**Step 4: Create auto-configuration**

```java
package com.quckapp.version;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConditionalOnWebApplication
@EnableConfigurationProperties(VersionProperties.class)
public class VersionAutoConfiguration {

    @Bean
    public FilterRegistrationBean<VersionFilter> versionFilter(VersionProperties props) {
        var registration = new FilterRegistrationBean<>(new VersionFilter(props));
        registration.addUrlPatterns("/api/*", "/v*");
        registration.setOrder(1);
        return registration;
    }
}
```

**Step 5: Commit**

```bash
git add packages/spring-version-starter/
git commit -m "feat: add spring-version-starter for Spring Boot version middleware"
```

---

### Task 2.4: Elixir Version Plug

**Files:**
- Create: `packages/elixir-version-plug/lib/version_plug.ex`
- Create: `packages/elixir-version-plug/mix.exs`
- Create: `packages/elixir-version-plug/test/version_plug_test.exs`

Reference: `services/message-service/lib/message_service/router.ex` (Phoenix plug pipeline, lines 6-18).

**Step 1: Create mix.exs**

```elixir
defmodule VersionPlug.MixProject do
  use Mix.Project

  def project do
    [
      app: :version_plug,
      version: "1.0.0",
      elixir: "~> 1.14",
      deps: deps()
    ]
  end

  def application do
    [extra_applications: [:logger]]
  end

  defp deps do
    [{:plug, "~> 1.14"}]
  end
end
```

**Step 2: Create the Plug**

```elixir
defmodule VersionPlug do
  @moduledoc """
  Plug that validates API version from URL path, adds deprecation/sunset headers,
  and sets :api_version in conn assigns.

  ## Configuration

  Reads from application env:
    config :version_plug,
      supported_versions: ["v1", "v2"],
      deprecated_versions: ["v1"],
      sunset_config: %{"v1" => "2026-06-01"},
      default_version: "v2",
      version_mode: "deployed"  # or "local"
  """

  import Plug.Conn
  @behaviour Plug

  @version_regex ~r{^/api/(v\d+(?:\.\d+)?)(/.*)$}

  @impl true
  def init(opts), do: opts

  @impl true
  def call(conn, _opts) do
    mode = config(:version_mode, "deployed")

    if mode == "local" do
      assign(conn, :api_version, config(:default_version, "v1"))
    else
      case Regex.run(@version_regex, conn.request_path) do
        [_, version | _] -> validate_version(conn, version)
        _ -> conn
      end
    end
  end

  defp validate_version(conn, version) do
    sunset_config = config(:sunset_config, %{})
    supported = config(:supported_versions, ["v1"])
    deprecated = config(:deprecated_versions, [])
    default_ver = config(:default_version, "v1")

    cond do
      # Check sunset
      Map.has_key?(sunset_config, version) && past_sunset?(sunset_config[version]) ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(410, Jason.encode!(%{
          error: "API version #{version} has been sunset",
          message: "Please upgrade to #{default_ver}"
        }))
        |> halt()

      # Check unsupported
      version not in supported and version not in deprecated ->
        conn
        |> put_resp_content_type("application/json")
        |> send_resp(404, Jason.encode!(%{
          error: "API version #{version} is not available",
          message: "Supported: #{Enum.join(supported, ", ")}"
        }))
        |> halt()

      # Deprecated — add headers
      version in deprecated ->
        conn
        |> assign(:api_version, version)
        |> put_resp_header("deprecation", "true")
        |> put_resp_header("sunset", Map.get(sunset_config, version, ""))
        |> put_resp_header("link", ~s(</api/#{default_ver}>; rel="successor-version"))

      # Active — pass through
      true ->
        assign(conn, :api_version, version)
    end
  end

  defp past_sunset?(date_str) do
    case Date.from_iso8601(date_str) do
      {:ok, sunset_date} -> Date.compare(Date.utc_today(), sunset_date) == :gt
      _ -> false
    end
  end

  defp config(key, default) do
    Application.get_env(:version_plug, key, default)
  end
end
```

**Step 3: Commit**

```bash
git add packages/elixir-version-plug/
git commit -m "feat: add elixir-version-plug for Phoenix services"
```

---

### Task 2.5: NestJS Version Middleware

**Files:**
- Create: `packages/nestjs-version-middleware/src/index.ts`
- Create: `packages/nestjs-version-middleware/src/version.middleware.ts`
- Create: `packages/nestjs-version-middleware/src/version.config.ts`
- Create: `packages/nestjs-version-middleware/package.json`
- Create: `packages/nestjs-version-middleware/tsconfig.json`

Reference: `services/backend-gateway/src/app.module.ts` (NestJS module structure, lines 45-159).

**Step 1: Create package.json**

```json
{
  "name": "@quckapp/nestjs-version-middleware",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "test": "jest"
  },
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/config": "^3.0.0"
  },
  "peerDependencies": {
    "@nestjs/common": ">=10.0.0",
    "@nestjs/config": ">=3.0.0"
  }
}
```

**Step 2: Create version config and middleware**

```typescript
// src/version.config.ts
export interface VersionConfig {
  serviceKey: string;
  activeVersions: string[];
  deprecatedVersions: string[];
  sunsetConfig: Record<string, string>;
  defaultVersion: string;
  versionMode: 'local' | 'deployed';
}

export function configFromEnv(): VersionConfig {
  const supported = process.env.SUPPORTED_VERSIONS?.split(',').map(v => v.trim()).filter(Boolean) || [];
  const apiVersion = process.env.API_VERSION || 'v1';

  return {
    serviceKey: process.env.SERVICE_KEY || '',
    activeVersions: supported.length > 0 ? supported : [apiVersion],
    deprecatedVersions: process.env.DEPRECATED_VERSIONS?.split(',').map(v => v.trim()).filter(Boolean) || [],
    sunsetConfig: parseSunsetConfig(process.env.SUNSET_CONFIG || ''),
    defaultVersion: apiVersion,
    versionMode: (process.env.VERSION_MODE as 'local' | 'deployed') || 'deployed',
  };
}

function parseSunsetConfig(raw: string): Record<string, string> {
  const config: Record<string, string> = {};
  if (!raw) return config;
  for (const pair of raw.split(',')) {
    const [ver, date] = pair.trim().split(':');
    if (ver && date) config[ver.trim()] = date.trim();
  }
  return config;
}

// src/version.middleware.ts
import { Injectable, NestMiddleware, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { VersionConfig } from './version.config';

const VERSION_REGEX = /^\/api\/(v\d+(?:\.\d+)?)(\/.*)?$/;

@Injectable()
export class VersionMiddleware implements NestMiddleware {
  constructor(private readonly config: VersionConfig) {}

  use(req: Request, res: Response, next: NextFunction) {
    if (this.config.versionMode === 'local') {
      (req as any).apiVersion = this.config.defaultVersion;
      return next();
    }

    const match = req.path.match(VERSION_REGEX);
    if (!match) return next();

    const version = match[1];

    // Check sunset
    const sunsetDate = this.config.sunsetConfig[version];
    if (sunsetDate) {
      const parsed = new Date(sunsetDate);
      if (!isNaN(parsed.getTime()) && new Date() > parsed) {
        return res.status(HttpStatus.GONE).json({
          error: `API version ${version} has been sunset`,
          message: `Please upgrade to ${this.config.defaultVersion}`,
        });
      }
    }

    // Check supported
    const allVersions = [...this.config.activeVersions, ...this.config.deprecatedVersions];
    if (!allVersions.includes(version)) {
      return res.status(HttpStatus.NOT_FOUND).json({
        error: `API version ${version} is not available`,
        message: `Supported: ${this.config.activeVersions.join(', ')}`,
      });
    }

    // Add deprecation headers
    if (this.config.deprecatedVersions.includes(version)) {
      res.setHeader('Deprecation', 'true');
      if (sunsetDate) res.setHeader('Sunset', sunsetDate);
      res.setHeader('Link', `</api/${this.config.defaultVersion}>; rel="successor-version"`);
    }

    (req as any).apiVersion = version;
    next();
  }
}

// src/index.ts
export { VersionMiddleware } from './version.middleware';
export { VersionConfig, configFromEnv } from './version.config';
```

**Step 3: Commit**

```bash
git add packages/nestjs-version-middleware/
git commit -m "feat: add nestjs-version-middleware for NestJS services"
```

---

## Phase 3: Kong Gateway Changes

### Task 3.1: Update Kong Routes to Version-Aware Regex

**Files:**
- Modify: `kong/kong.yml`

**Step 1: Update route patterns**

Change all `/api/v1/<resource>` paths to regex patterns that match any version:

```yaml
# Before (example for auth-service)
routes:
  - name: auth-routes
    paths:
      - /api/v1/auth
    strip_path: true

# After
routes:
  - name: auth-routes
    paths:
      - "~/api/v\\d+(\\.\\d+)?/auth"
    strip_path: true
```

Apply this pattern to ALL service routes in kong.yml. For services with strip_path: false (Go services), the full versioned path passes through unchanged — the version middleware handles it.

**Step 2: Add config endpoint route**

Add to kong.yml after the existing services:

```yaml
- name: version-config
  url: http://admin-service:8085/api/v1/config
  connect_timeout: 10000
  write_timeout: 10000
  read_timeout: 10000
  retries: 2
  routes:
    - name: version-config-routes
      paths:
        - /api/v1/config
      strip_path: false
      preserve_host: true
  plugins:
    - name: rate-limiting
      config:
        minute: 60
        policy: local
        fault_tolerant: true
    - name: cors
      config:
        origins: ["*"]
        methods: [GET, OPTIONS]
        headers: [Authorization, Content-Type, X-Request-ID]
        credentials: true
        max_age: 3600
```

**Step 3: Validate**

Run: `docker run --rm -v $(pwd)/kong:/kong kong/deck:latest validate /kong/kong.yml`
Expected: Valid configuration

**Step 4: Commit**

```bash
git add kong/kong.yml
git commit -m "feat(kong): update routes to version-aware regex patterns and add config endpoint"
```

---

## Phase 4: service-urls Dashboard UI

### Task 4.1: Add Version Types to Dashboard

**Files:**
- Modify: `packages/service-urls/src/types/index.ts`

**Step 1: Add version types**

Add after the existing `BulkExportResponse` interface (line 141):

```typescript
// Version Management
export type VersionStatus = 'planned' | 'ready' | 'active' | 'deprecated' | 'sunset' | 'disabled';

export const VERSION_STATUS_LABELS: Record<VersionStatus, string> = {
  planned: 'Planned',
  ready: 'Ready',
  active: 'Active',
  deprecated: 'Deprecated',
  sunset: 'Sunset',
  disabled: 'Disabled',
};

export const VERSION_STATUS_COLORS: Record<VersionStatus, string> = {
  planned: 'bg-gray-100 text-gray-700',
  ready: 'bg-blue-100 text-blue-700',
  active: 'bg-green-100 text-green-700',
  deprecated: 'bg-yellow-100 text-yellow-700',
  sunset: 'bg-orange-100 text-orange-700',
  disabled: 'bg-red-100 text-red-700',
};

export interface VersionConfig {
  id: string;
  environment: Environment;
  serviceKey: string;
  apiVersion: string;
  releaseVersion: string;
  status: VersionStatus;
  sunsetDate: string | null;
  sunsetDurationDays: number | null;
  deprecatedAt: string | null;
  changelog: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalVersionConfig {
  id: string;
  environment: Environment;
  defaultApiVersion: string;
  defaultSunsetDays: number;
  updatedBy: string;
  updatedAt: string;
}

export interface VersionProfile {
  id: string;
  name: string;
  description: string;
  entries: VersionProfileEntry[];
  createdBy: string;
  createdAt: string;
}

export interface VersionProfileEntry {
  serviceKey: string;
  apiVersion: string;
  releaseVersion: string;
}
```

**Step 2: Commit**

```bash
git add packages/service-urls/src/types/index.ts
git commit -m "feat(service-urls): add version management types"
```

---

### Task 4.2: Add Version Redux Slice

**Files:**
- Create: `packages/service-urls/src/store/slices/versionSlice.ts`

**Step 1: Create the version slice**

Follow the same pattern as `serviceUrlsSlice.ts` (async thunks + slice reducers).

```typescript
import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import api from '../../services/api';
import type { Environment, VersionConfig, GlobalVersionConfig, VersionProfile } from '../../types';

interface VersionState {
  versions: VersionConfig[];
  globalConfig: GlobalVersionConfig | null;
  profiles: VersionProfile[];
  loading: boolean;
  saveLoading: boolean;
  error: string | null;
}

const initialState: VersionState = {
  versions: [],
  globalConfig: null,
  profiles: [],
  loading: false,
  saveLoading: false,
  error: null,
};

const BASE = '/admin/service-urls';

// --- Version CRUD ---

export const fetchVersions = createAsyncThunk(
  'versions/fetchVersions',
  async (env: Environment) => {
    const response = await api.get(`${BASE}/${env}/versions`);
    return response.data.data;
  }
);

export const createVersion = createAsyncThunk(
  'versions/createVersion',
  async ({ env, data }: { env: Environment; data: { serviceKey: string; apiVersion: string; releaseVersion?: string; changelog?: string } }) => {
    const response = await api.post(`${BASE}/${env}/versions`, data);
    return response.data.data;
  }
);

export const deleteVersion = createAsyncThunk(
  'versions/deleteVersion',
  async ({ env, serviceKey, ver }: { env: Environment; serviceKey: string; ver: string }) => {
    await api.delete(`${BASE}/${env}/versions/${serviceKey}/${ver}`);
    return { serviceKey, ver };
  }
);

// --- State Transitions ---

export const markReady = createAsyncThunk(
  'versions/markReady',
  async ({ env, serviceKey, ver }: { env: Environment; serviceKey: string; ver: string }) => {
    const response = await api.post(`${BASE}/${env}/versions/${serviceKey}/${ver}/ready`);
    return response.data.data;
  }
);

export const activateVersion = createAsyncThunk(
  'versions/activate',
  async ({ env, serviceKey, ver }: { env: Environment; serviceKey: string; ver: string }) => {
    const response = await api.post(`${BASE}/${env}/versions/${serviceKey}/${ver}/activate`);
    return response.data.data;
  }
);

export const deprecateVersion = createAsyncThunk(
  'versions/deprecate',
  async ({ env, serviceKey, ver }: { env: Environment; serviceKey: string; ver: string }) => {
    const response = await api.post(`${BASE}/${env}/versions/${serviceKey}/${ver}/deprecate`);
    return response.data.data;
  }
);

export const disableVersion = createAsyncThunk(
  'versions/disable',
  async ({ env, serviceKey, ver }: { env: Environment; serviceKey: string; ver: string }) => {
    const response = await api.post(`${BASE}/${env}/versions/${serviceKey}/${ver}/disable`);
    return response.data.data;
  }
);

// --- Bulk Operations ---

export const bulkPlan = createAsyncThunk(
  'versions/bulkPlan',
  async ({ env, apiVersion, releaseVersion }: { env: Environment; apiVersion: string; releaseVersion?: string }) => {
    const response = await api.post(`${BASE}/${env}/versions/bulk-plan`, { apiVersion, releaseVersion });
    return response.data.data;
  }
);

export const bulkActivate = createAsyncThunk(
  'versions/bulkActivate',
  async (env: Environment) => {
    const response = await api.post(`${BASE}/${env}/versions/bulk-activate`);
    return response.data.data;
  }
);

// --- Global Config ---

export const fetchGlobalConfig = createAsyncThunk(
  'versions/fetchGlobalConfig',
  async (env: Environment) => {
    const response = await api.get(`${BASE}/${env}/global-config`);
    return response.data.data;
  }
);

export const updateGlobalConfig = createAsyncThunk(
  'versions/updateGlobalConfig',
  async ({ env, data }: { env: Environment; data: { defaultApiVersion: string; defaultSunsetDays: number } }) => {
    const response = await api.put(`${BASE}/${env}/global-config`, data);
    return response.data.data;
  }
);

// --- Profiles ---

export const fetchProfiles = createAsyncThunk(
  'versions/fetchProfiles',
  async () => {
    const response = await api.get(`${BASE}/profiles`);
    return response.data.data;
  }
);

export const createProfile = createAsyncThunk(
  'versions/createProfile',
  async (data: { name: string; description?: string; entries: { serviceKey: string; apiVersion: string; releaseVersion?: string }[] }) => {
    const response = await api.post(`${BASE}/profiles`, data);
    return response.data.data;
  }
);

export const applyProfile = createAsyncThunk(
  'versions/applyProfile',
  async ({ profileId, env, activateReady }: { profileId: string; env: Environment; activateReady: boolean }) => {
    const response = await api.post(`${BASE}/profiles/${profileId}/apply/${env}`, { activateReady });
    return response.data.data;
  }
);

// --- Export ---

export const exportEnvFile = createAsyncThunk(
  'versions/exportEnvFile',
  async (env: Environment) => {
    const response = await api.get(`${BASE}/${env}/export/env-file`);
    const { content, filename } = response.data.data;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
    return response.data.data;
  }
);

// --- Slice ---

const versionSlice = createSlice({
  name: 'versions',
  initialState,
  reducers: {
    clearVersionError: (state) => { state.error = null; },
    clearVersionData: (state) => { state.versions = []; state.globalConfig = null; },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchVersions.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchVersions.fulfilled, (state, action) => { state.loading = false; state.versions = action.payload; })
      .addCase(fetchVersions.rejected, (state, action) => { state.loading = false; state.error = action.error.message || 'Failed'; })

      .addCase(createVersion.pending, (state) => { state.saveLoading = true; })
      .addCase(createVersion.fulfilled, (state, action) => { state.saveLoading = false; state.versions.push(action.payload); })
      .addCase(createVersion.rejected, (state, action) => { state.saveLoading = false; state.error = action.error.message || 'Failed'; })

      .addCase(fetchGlobalConfig.fulfilled, (state, action) => { state.globalConfig = action.payload; })
      .addCase(updateGlobalConfig.fulfilled, (state, action) => { state.globalConfig = action.payload; })

      .addCase(fetchProfiles.fulfilled, (state, action) => { state.profiles = action.payload; })
      .addCase(createProfile.fulfilled, (state, action) => { state.profiles.push(action.payload); })

      // State transitions update the version in place
      .addCase(activateVersion.fulfilled, (state, action) => {
        const idx = state.versions.findIndex(v => v.serviceKey === action.payload.serviceKey && v.apiVersion === action.payload.apiVersion);
        if (idx !== -1) state.versions[idx] = action.payload;
      })
      .addCase(deprecateVersion.fulfilled, (state, action) => {
        const idx = state.versions.findIndex(v => v.serviceKey === action.payload.serviceKey && v.apiVersion === action.payload.apiVersion);
        if (idx !== -1) state.versions[idx] = action.payload;
      })
      .addCase(markReady.fulfilled, (state, action) => {
        const idx = state.versions.findIndex(v => v.serviceKey === action.payload.serviceKey && v.apiVersion === action.payload.apiVersion);
        if (idx !== -1) state.versions[idx] = action.payload;
      })
      .addCase(disableVersion.fulfilled, (state, action) => {
        const idx = state.versions.findIndex(v => v.serviceKey === action.payload.serviceKey && v.apiVersion === action.payload.apiVersion);
        if (idx !== -1) state.versions[idx] = action.payload;
      });
  },
});

export const { clearVersionError, clearVersionData } = versionSlice.actions;
export default versionSlice.reducer;
```

**Step 2: Register in store**

Modify: `packages/service-urls/src/store/index.ts` — add `versions: versionReducer` to the store.

**Step 3: Commit**

```bash
git add packages/service-urls/src/store/slices/versionSlice.ts
git add packages/service-urls/src/store/index.ts
git commit -m "feat(service-urls): add version management Redux slice"
```

---

### Task 4.3: Add Versions Tab to EnvironmentDetail Page

**Files:**
- Modify: `packages/service-urls/src/pages/EnvironmentDetail.tsx`

**Step 1: Add 'versions' to SECTIONS array (line 52)**

Add `{ key: 'versions', label: 'Versions' }` as the second entry after 'overview'.

**Step 2: Add version-related state, dispatch calls, and render function**

This is a significant UI addition. The Versions tab shows:
- Table of all versions for the environment
- Status badges (planned/ready/active/deprecated/sunset/disabled)
- Action buttons per version (Activate, Deprecate, etc.) enabled based on current status
- Bulk actions bar: "Plan v{x} for All", "Activate All Ready"
- Global config section: default version + sunset days
- Export .env file button

The UI implementation follows the same patterns as the existing services table (lines 376-473 of EnvironmentDetail.tsx).

**Step 3: Commit**

```bash
git add packages/service-urls/src/pages/EnvironmentDetail.tsx
git commit -m "feat(service-urls): add Versions tab to environment detail page"
```

---

### Task 4.4: Add Version Profiles Page

**Files:**
- Create: `packages/service-urls/src/pages/Profiles.tsx`
- Modify: `packages/service-urls/src/App.tsx` (add route)
- Modify: `packages/service-urls/src/components/Layout/Sidebar.tsx` (add nav link if exists)

**Step 1: Create Profiles page**

Profile management page with:
- List all profiles with entry counts
- Create profile modal (select services + versions)
- Apply profile to environment modal (select target env + toggle "activate ready")
- Results display (which services activated, which planned, which skipped)

**Step 2: Add route in App.tsx (after line 47)**

```tsx
<Route path="profiles" element={<PrivateRoute><Profiles /></PrivateRoute>} />
```

**Step 3: Commit**

```bash
git add packages/service-urls/src/pages/Profiles.tsx
git add packages/service-urls/src/App.tsx
git commit -m "feat(service-urls): add version profiles management page"
```

---

## Phase 5: api-client Extension

### Task 5.1: Add VersionedClient to api-client Package

**Files:**
- Create: `packages/api-client/src/core/VersionedClient.ts`
- Modify: `packages/api-client/src/index.ts` (add export)

Reference: `packages/api-client/src/core/OpenAPI.ts` (lines 22-32) — current config.

**Step 1: Create VersionedClient**

```typescript
// packages/api-client/src/core/VersionedClient.ts
import { OpenAPI } from './OpenAPI';

interface ServiceVersionInfo {
  activeVersions: string[];
  deprecatedVersions: string[];
  baseUrl: string;
}

interface VersionMapResponse {
  environment: string;
  defaultApiVersion: string;
  services: Record<string, ServiceVersionInfo>;
}

export class VersionedClient {
  private versionMap: VersionMapResponse | null = null;
  private configUrl: string;
  private environment: string;
  private cacheMs: number;
  private lastFetch = 0;

  constructor(options: {
    configUrl?: string;
    environment?: string;
    cacheDurationMs?: number;
  } = {}) {
    this.configUrl = options.configUrl || `${OpenAPI.BASE}/config/versions`;
    this.environment = options.environment || 'production';
    this.cacheMs = options.cacheDurationMs || 300_000; // 5 minutes
  }

  async init(): Promise<void> {
    await this.fetchConfig();
  }

  getServiceUrl(serviceKey: string, apiVersion?: string): string {
    if (!this.versionMap) {
      // Fallback to default
      return `${OpenAPI.BASE}`;
    }

    const service = this.versionMap.services[serviceKey];
    if (!service) {
      return `${OpenAPI.BASE}`;
    }

    const version = apiVersion
      || service.activeVersions[service.activeVersions.length - 1]
      || this.versionMap.defaultApiVersion;

    return `${service.baseUrl}/api/${version}`;
  }

  getActiveVersions(serviceKey: string): string[] {
    return this.versionMap?.services[serviceKey]?.activeVersions || [];
  }

  getDefaultVersion(): string {
    return this.versionMap?.defaultApiVersion || 'v1';
  }

  isDeprecated(serviceKey: string, version: string): boolean {
    return this.versionMap?.services[serviceKey]?.deprecatedVersions.includes(version) || false;
  }

  private async fetchConfig(): Promise<void> {
    const now = Date.now();
    if (this.versionMap && now - this.lastFetch < this.cacheMs) return;

    try {
      const response = await fetch(`${this.configUrl}?environment=${this.environment}`);
      if (response.ok) {
        const json = await response.json();
        this.versionMap = json.data;
        this.lastFetch = now;
      }
    } catch {
      // Silently fail — use cached or fallback
    }
  }
}
```

**Step 2: Export from index.ts**

Add to `packages/api-client/src/index.ts`:

```typescript
export { VersionedClient } from './core/VersionedClient';
```

**Step 3: Commit**

```bash
git add packages/api-client/src/core/VersionedClient.ts
git add packages/api-client/src/index.ts
git commit -m "feat(api-client): add VersionedClient for version-aware URL resolution"
```

---

## Phase 6: Per-Component CI/CD Workflows

### Task 6.1: Create Reusable Workflow Template

**Files:**
- Create: `.github/workflows/reusable-service-deploy.yml`

**Step 1: Create reusable workflow**

This is the shared template all service workflows call. It handles: build → push ACR → deploy via Azure Pipeline → notify service-urls API.

```yaml
name: Reusable Service Deploy

on:
  workflow_call:
    inputs:
      service_name:
        required: true
        type: string
      service_path:
        required: true
        type: string
      docker_context:
        required: false
        type: string
        default: ''
      language:
        required: true
        type: string  # go, spring, elixir, python, nestjs
      port:
        required: true
        type: string
    secrets:
      AZURE_CREDENTIALS:
        required: true
      ACR_LOGIN_SERVER:
        required: true
      ACR_USERNAME:
        required: true
      ACR_PASSWORD:
        required: true
      SERVICE_URLS_API_TOKEN:
        required: false

jobs:
  build-test:
    runs-on: ubuntu-latest
    outputs:
      image_tag: ${{ steps.meta.outputs.tags }}
    steps:
      - uses: actions/checkout@v4

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Login to ACR
        uses: docker/login-action@v3
        with:
          registry: ${{ secrets.ACR_LOGIN_SERVER }}
          username: ${{ secrets.ACR_USERNAME }}
          password: ${{ secrets.ACR_PASSWORD }}

      - name: Docker meta
        id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ secrets.ACR_LOGIN_SERVER }}/${{ inputs.service_name }}
          tags: |
            type=sha,prefix=
            type=ref,event=branch

      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ${{ inputs.docker_context || inputs.service_path }}
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy-dev:
    needs: build-test
    runs-on: ubuntu-latest
    environment: development
    steps:
      - name: Deploy to dev via Azure Pipeline
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}

      - name: Update AKS deployment
        run: |
          az aks get-credentials --resource-group quckapp-dev --name quckapp-dev-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-test.outputs.image_tag }} \
            -n quckapp

      - name: Smoke test
        run: |
          sleep 30
          kubectl exec -n quckapp deploy/${{ inputs.service_name }} -- \
            wget -q -O- http://localhost:${{ inputs.port }}/health || true

      - name: Mark version ready in service-urls
        if: env.SERVICE_URLS_API_URL != ''
        env:
          SERVICE_URLS_API_URL: ${{ vars.SERVICE_URLS_API_URL }}
        run: |
          # Only if API version env var indicates a new version
          if [ -n "$NEW_API_VERSION" ]; then
            curl -s -X POST "$SERVICE_URLS_API_URL/admin/service-urls/development/versions/${{ inputs.service_name }}/$NEW_API_VERSION/ready" \
              -H "Authorization: Bearer ${{ secrets.SERVICE_URLS_API_TOKEN }}" || true
          fi

  deploy-qa:
    needs: [build-test, deploy-dev]
    runs-on: ubuntu-latest
    environment: qa
    steps:
      - name: Deploy to QA
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: |
          az aks get-credentials --resource-group quckapp-qa --name quckapp-qa-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-test.outputs.image_tag }} \
            -n quckapp

  deploy-uat:
    needs: [build-test, deploy-qa]
    runs-on: ubuntu-latest
    environment: uat1
    steps:
      - name: Deploy to UAT
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: |
          az aks get-credentials --resource-group quckapp-uat --name quckapp-uat-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-test.outputs.image_tag }} \
            -n quckapp

  deploy-staging:
    needs: [build-test, deploy-uat]
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - name: Deploy to Staging
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: |
          az aks get-credentials --resource-group quckapp-staging --name quckapp-staging-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-test.outputs.image_tag }} \
            -n quckapp

  deploy-production:
    needs: [build-test, deploy-staging]
    runs-on: ubuntu-latest
    environment: production
    steps:
      - name: Deploy to Production
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: |
          az aks get-credentials --resource-group quckapp-prod --name quckapp-prod-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-test.outputs.image_tag }} \
            -n quckapp

  deploy-live:
    needs: [build-test, deploy-production]
    runs-on: ubuntu-latest
    environment: live
    steps:
      - name: Promote to Live
        uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: |
          az aks get-credentials --resource-group quckapp-live --name quckapp-live-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-test.outputs.image_tag }} \
            -n quckapp
```

**Step 2: Commit**

```bash
git add .github/workflows/reusable-service-deploy.yml
git commit -m "feat(ci): add reusable service deploy workflow for all environments"
```

---

### Task 6.2: Create Per-Service Workflows (Spring Boot)

**Files:**
- Create: `.github/workflows/services/ci-auth-service.yml`
- Create: `.github/workflows/services/ci-admin-service.yml`
- Create: `.github/workflows/services/ci-user-service.yml`
- Create: `.github/workflows/services/ci-permission-service.yml`
- Create: `.github/workflows/services/ci-audit-service.yml`
- Create: `.github/workflows/services/ci-security-service.yml`

**Step 1: Create template (auth-service as example)**

```yaml
name: CI/CD — auth-service

on:
  push:
    branches: [main]
    paths:
      - 'services/auth-service/**'
  pull_request:
    paths:
      - 'services/auth-service/**'
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: maven
      - name: Run tests
        working-directory: services/auth-service
        run: mvn test -B

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    uses: ./.github/workflows/reusable-service-deploy.yml
    with:
      service_name: auth-service
      service_path: services/auth-service
      language: spring
      port: '8081'
    secrets: inherit
```

Repeat the same pattern for admin-service (port 8085), user-service (8082), permission-service (8083), audit-service (8084), security-service (8086).

**Step 2: Commit**

```bash
git add .github/workflows/services/ci-auth-service.yml
git add .github/workflows/services/ci-admin-service.yml
git add .github/workflows/services/ci-user-service.yml
git add .github/workflows/services/ci-permission-service.yml
git add .github/workflows/services/ci-audit-service.yml
git add .github/workflows/services/ci-security-service.yml
git commit -m "feat(ci): add per-service workflows for Spring Boot services"
```

---

### Task 6.3: Create Per-Service Workflows (Go)

**Files:** Create one workflow per Go service. Example for workspace-service:

```yaml
name: CI/CD — workspace-service

on:
  push:
    branches: [main]
    paths:
      - 'services/workspace-service/**'
  pull_request:
    paths:
      - 'services/workspace-service/**'
  workflow_dispatch:

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with:
          go-version: '1.21'
      - name: Run tests
        working-directory: services/workspace-service
        run: go test -v ./...

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    uses: ./.github/workflows/reusable-service-deploy.yml
    with:
      service_name: workspace-service
      service_path: services/workspace-service
      language: go
      port: '5004'
    secrets: inherit
```

Create for: workspace-service (5004), channel-service (5005), file-service (5002), media-service (5001), attachment-service (4011), bookmark-service (5010), cdn-service (4012), go-bff (3000), reminder-service (4010), search-service (5006), thread-service (3005).

**Commit after creating all.**

---

### Task 6.4: Create Per-Service Workflows (Elixir)

Same pattern adapted for Elixir:

```yaml
jobs:
  test:
    steps:
      - uses: erlef/setup-beam@v1
        with:
          elixir-version: '1.15'
          otp-version: '26'
      - run: mix deps.get && mix test
```

Create for: message-service (4003), realtime-service (4000), presence-service (4001), call-service (4002), huddle-service (4005), event-broadcast-service (4006), notification-orchestrator (4004).

---

### Task 6.5: Create Per-Service Workflows (Python)

```yaml
jobs:
  test:
    steps:
      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
      - run: pip install -r requirements.txt && pytest
```

Create for: ml-service (5008), moderation-service (5014), sentiment-service (5017), smart-reply-service (5019), analytics-service (5007), export-service (5015), insights-service (5018), integration-service (5016).

---

### Task 6.6: Create Per-Service Workflows (NestJS)

```yaml
jobs:
  test:
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci && npm test
```

Create for: backend-gateway (3000), notification-service (3001).

---

### Task 6.7: Create Client Workflows

**Files:**
- Create: `.github/workflows/clients/ci-web.yml`
- Create: `.github/workflows/clients/ci-mobile-android.yml`
- Create: `.github/workflows/clients/ci-mobile-ios.yml`
- Create: `.github/workflows/clients/ci-admin-dashboard.yml`

Web example:

```yaml
name: CI/CD — Web App

on:
  push:
    branches: [main]
    paths: ['web/**']
  pull_request:
    paths: ['web/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - working-directory: web
        run: npm ci && npm run build

  deploy-dev:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: az staticwebapp deploy --app-name quckapp-web-dev

  deploy-staging:
    needs: deploy-dev
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: az staticwebapp deploy --app-name quckapp-web-staging

  deploy-production:
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: az staticwebapp deploy --app-name quckapp-web-prod

  deploy-live:
    needs: deploy-production
    runs-on: ubuntu-latest
    environment: live
    steps:
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: az staticwebapp swap --app-name quckapp-web-prod --slot staging
```

Mobile Android:

```yaml
name: CI/CD — Mobile Android

on:
  push:
    branches: [main]
    paths: ['mobile/**']
  pull_request:
    paths: ['mobile/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - working-directory: mobile
        run: npm ci
      - working-directory: mobile/android
        run: ./gradlew assembleRelease

  deploy-dev:
    needs: build
    if: github.ref == 'refs/heads/main'
    environment: development
    runs-on: ubuntu-latest
    steps:
      - name: Upload to Firebase App Distribution
        uses: wzieba/Firebase-Distribution-Github-Action@v1
        with:
          appId: ${{ secrets.FIREBASE_APP_ID_ANDROID }}
          serviceCredentialsFileContent: ${{ secrets.FIREBASE_CREDENTIALS }}
          file: mobile/android/app/build/outputs/apk/release/app-release.apk

  deploy-production:
    needs: deploy-dev
    environment: production
    runs-on: ubuntu-latest
    steps:
      - name: Upload to Play Console
        uses: r0adkll/upload-google-play@v1
        with:
          serviceAccountJsonPlainText: ${{ secrets.PLAY_STORE_CREDENTIALS }}
          packageName: com.quckapp
          releaseFiles: mobile/android/app/build/outputs/bundle/release/app-release.aab
          track: production
```

---

### Task 6.8: Create Infrastructure Workflows

**Files:**
- Create: `.github/workflows/infrastructure/ci-kong.yml`
- Modify existing terraform workflows to follow per-component pattern

Kong workflow:

```yaml
name: CI/CD — Kong Config

on:
  push:
    branches: [main]
    paths: ['kong/**']
  pull_request:
    paths: ['kong/**']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate Kong config
        run: |
          docker run --rm -v ${{ github.workspace }}/kong:/kong \
            kong/deck:latest validate /kong/kong.yml

  deploy-dev:
    needs: validate
    if: github.ref == 'refs/heads/main'
    environment: development
    runs-on: ubuntu-latest
    steps:
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - run: |
          az aks get-credentials --resource-group quckapp-dev --name quckapp-dev-aks
          kubectl create configmap kong-config --from-file=kong.yml=kong/kong.yml \
            -n quckapp --dry-run=client -o yaml | kubectl apply -f -
          kubectl rollout restart deployment/kong -n quckapp
```

**Commit all workflows.**

---

## Phase 7: Docker Compose Local Config

### Task 7.1: Add Version Env Vars to docker-compose.yml

**Files:**
- Modify: `docker-compose.yml`

Add to each service's `environment` section:

```yaml
# For all services
environment:
  API_VERSION: v1
  RELEASE_VERSION: 0.0.0-local
  VERSION_MODE: local
  SUPPORTED_VERSIONS: v1
```

This tells the version middleware to skip all version logic in local mode.

**Commit:**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add version env vars for local development"
```

---

## Summary — Execution Order

| Phase | Tasks | Dependency |
|-------|-------|-----------|
| **1. Data Model + Backend** | 1.1–1.6 | None (foundation) |
| **2. Version Middleware** | 2.1–2.5 | None (parallel with Phase 1) |
| **3. Kong Changes** | 3.1 | Phase 1.6 (config endpoint) |
| **4. Dashboard UI** | 4.1–4.4 | Phase 1 (backend API exists) |
| **5. api-client** | 5.1 | Phase 1.6 (config endpoint) |
| **6. CI/CD Workflows** | 6.1–6.8 | Phase 1 + 2 (services have middleware) |
| **7. Docker Compose** | 7.1 | Phase 2 (middleware reads env vars) |

**Phases 1 and 2 can run in parallel.** Phases 3–7 depend on 1 and/or 2.

**First v2 validation:** After all phases, roll out v2 on a low-risk service (e.g., bookmark-service) to validate the full flow: plan → implement → CI marks ready → activate in dashboard → clients see v2.
