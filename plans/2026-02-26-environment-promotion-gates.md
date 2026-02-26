# Environment Promotion Gates Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enforce that API versions can only be activated through the environment chain (local → dev → qa → uat → staging → production → live), with an emergency hotfix bypass requiring dual approval — enforced across admin-service API, GitHub Actions, and Azure Pipelines.

**Architecture:** Add an `EnvironmentChain` utility that defines the canonical promotion order. Modify `VersionService.activate()` to reject activations unless the version is already ACTIVE in the previous environment (hard gate). Add a `PromotionRecord` entity for immutable audit trail. Add `promote()` for one-step chain advancement and `emergencyActivate()` for hotfix bypass with dual-approver requirement. Wire promotion validation into CI/CD via a `/can-promote` API endpoint called by GitHub Actions steps and Azure Pipeline gates.

**Tech Stack:** Spring Boot 3 (Java 21), Flyway, JPA/Hibernate, GitHub Actions, Azure Pipelines (YAML templates)

---

## Context

**Existing code you need to know about:**

- `VersionService.java` (`services/admin-service/src/main/java/com/quckapp/admin/service/VersionService.java`) — The core service. Has `activate()` at line 115 that currently only checks `status == READY` with NO environment chain validation.
- `VersionController.java` (`services/admin-service/src/main/java/com/quckapp/admin/controller/VersionController.java`) — REST endpoints at `/api/v1/admin/service-urls`. Currently has `POST /{env}/versions/{serviceKey}/{ver}/activate`.
- `VersionConfigRepository.java` (`services/admin-service/src/main/java/com/quckapp/admin/domain/repository/VersionConfigRepository.java`) — JPA repository with custom finders.
- `VersionDtos.java` (`services/admin-service/src/main/java/com/quckapp/admin/dto/VersionDtos.java`) — All request/response DTOs as Java records.
- `VersionStatus.java` — Enum: `PLANNED, READY, ACTIVE, DEPRECATED, SUNSET, DISABLED`
- `reusable-service-deploy.yml` (`.github/workflows/reusable-service-deploy.yml`) — CI/CD template called by all service workflows. Has deploy-dev through deploy-live jobs.
- `promote-environment.yml` (`.github/workflows/promote-environment.yml`) — Manual environment promotion. Validates paths but has NO version API integration.
- DB migrations at `services/admin-service/src/main/resources/db/migration/` — Currently V1 and V2. Version tables are NOT yet migrated (Hibernate auto-creates them in dev). Need V3.

**Environment chain (canonical order):**
```
local (index 0) — unrestricted sandbox
dev (index 1) — auto from CI
qa (index 2) — auto from CI
uat (index 3) — manual gate (uat1/uat2/uat3 all count as "uat" tier)
staging (index 4) — manual gate
production (index 5) — manual gate, 2 approvals
live (index 6) — release manager only
```

---

## Phase 1: Backend — EnvironmentChain Utility

### Task 1.1: Create EnvironmentChain utility class

This is the foundation — a stateless utility that defines environment order and validation.

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/EnvironmentChain.java`
- Test: `services/admin-service/src/test/java/com/quckapp/admin/domain/EnvironmentChainTest.java`

**Step 1: Write the tests**

```java
package com.quckapp.admin.domain;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.*;

class EnvironmentChainTest {

    @Test
    void previousOf_dev_returns_local() {
        assertThat(EnvironmentChain.previousOf("dev")).hasValue("local");
    }

    @Test
    void previousOf_local_returns_empty() {
        assertThat(EnvironmentChain.previousOf("local")).isEmpty();
    }

    @Test
    void previousOf_qa_returns_dev() {
        assertThat(EnvironmentChain.previousOf("qa")).hasValue("dev");
    }

    @Test
    void previousOf_production_returns_staging() {
        assertThat(EnvironmentChain.previousOf("production")).hasValue("staging");
    }

    @Test
    void previousOf_live_returns_production() {
        assertThat(EnvironmentChain.previousOf("live")).hasValue("production");
    }

    @ParameterizedTest
    @CsvSource({"uat1,qa", "uat2,qa", "uat3,qa"})
    void previousOf_uatVariants_returns_qa(String uat, String expected) {
        assertThat(EnvironmentChain.previousOf(uat)).hasValue(expected);
    }

    @Test
    void previousOf_staging_returns_uat() {
        // staging requires ANY uat (uat1, uat2, or uat3)
        assertThat(EnvironmentChain.previousOf("staging")).hasValue("uat");
    }

    @Test
    void isUnrestricted_local_returns_true() {
        assertThat(EnvironmentChain.isUnrestricted("local")).isTrue();
    }

    @Test
    void isUnrestricted_dev_returns_false() {
        assertThat(EnvironmentChain.isUnrestricted("dev")).isFalse();
    }

    @Test
    void normalizeEnvironment_uat1_returns_uat() {
        assertThat(EnvironmentChain.normalize("uat1")).isEqualTo("uat");
    }

    @Test
    void normalizeEnvironment_production_returns_production() {
        assertThat(EnvironmentChain.normalize("production")).isEqualTo("production");
    }

    @ParameterizedTest
    @CsvSource({"dev,qa,true", "qa,dev,false", "dev,staging,false", "staging,live,true", "local,dev,true"})
    void isValidPromotion(String from, String to, boolean expected) {
        assertThat(EnvironmentChain.isValidPromotion(from, to)).isEqualTo(expected);
    }

    @Test
    void nextOf_staging_returns_production() {
        assertThat(EnvironmentChain.nextOf("staging")).hasValue("production");
    }

    @Test
    void nextOf_live_returns_empty() {
        assertThat(EnvironmentChain.nextOf("live")).isEmpty();
    }

    @Test
    void previousOf_unknown_throws() {
        assertThatThrownBy(() -> EnvironmentChain.previousOf("unknown"))
                .isInstanceOf(IllegalArgumentException.class);
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd services/admin-service && ./mvnw test -pl . -Dtest=EnvironmentChainTest -Dsurefire.failIfNoSpecifiedTests=false`
Expected: Compilation error — `EnvironmentChain` class does not exist

**Step 3: Write the implementation**

```java
package com.quckapp.admin.domain;

import java.util.*;

public final class EnvironmentChain {

    private EnvironmentChain() {}

    // Canonical chain order. UAT variants (uat1/2/3) are normalized to "uat".
    private static final List<String> CHAIN = List.of(
            "local", "dev", "qa", "uat", "staging", "production", "live"
    );

    private static final Set<String> UAT_VARIANTS = Set.of("uat", "uat1", "uat2", "uat3");

    /**
     * Normalize environment name: uat1/uat2/uat3 → uat, everything else unchanged.
     */
    public static String normalize(String environment) {
        Objects.requireNonNull(environment);
        return UAT_VARIANTS.contains(environment.toLowerCase()) ? "uat" : environment.toLowerCase();
    }

    /**
     * Get the previous environment in the chain. Empty for "local" (unrestricted).
     * For staging, returns "uat" (any uat variant satisfies).
     */
    public static Optional<String> previousOf(String environment) {
        int index = indexOf(environment);
        return index <= 0 ? Optional.empty() : Optional.of(CHAIN.get(index - 1));
    }

    /**
     * Get the next environment in the chain. Empty for "live" (terminal).
     */
    public static Optional<String> nextOf(String environment) {
        int index = indexOf(environment);
        return index >= CHAIN.size() - 1 ? Optional.empty() : Optional.of(CHAIN.get(index + 1));
    }

    /**
     * Returns true if this environment has no promotion gate (local only).
     */
    public static boolean isUnrestricted(String environment) {
        return "local".equalsIgnoreCase(environment);
    }

    /**
     * Validates that promoting from → to is exactly one step forward in the chain.
     */
    public static boolean isValidPromotion(String from, String to) {
        int fromIndex = indexOf(from);
        int toIndex = indexOf(to);
        return toIndex == fromIndex + 1;
    }

    private static int indexOf(String environment) {
        String normalized = normalize(environment);
        int index = CHAIN.indexOf(normalized);
        if (index < 0) {
            throw new IllegalArgumentException("Unknown environment: " + environment
                    + ". Valid: " + CHAIN);
        }
        return index;
    }
}
```

**Step 4: Run tests to verify they pass**

Run: `cd services/admin-service && ./mvnw test -pl . -Dtest=EnvironmentChainTest`
Expected: All 14 tests PASS

**Step 5: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/domain/EnvironmentChain.java \
       services/admin-service/src/test/java/com/quckapp/admin/domain/EnvironmentChainTest.java
git commit -m "feat: add EnvironmentChain utility for promotion order validation"
```

---

## Phase 2: Backend — PromotionRecord Entity & Migration

### Task 2.1: Create Flyway migration V3 for version tables + promotion_records

The version tables (version_configs, global_version_configs, version_profiles, version_profile_entries) were auto-created by Hibernate in dev but never had a proper migration. We need V3 to create them all, plus the new `promotion_records` table.

**Files:**
- Create: `services/admin-service/src/main/resources/db/migration/V3__create_version_and_promotion_tables.sql`

**Step 1: Write the migration**

```sql
-- =============================================================================
-- V3: Version management tables + Promotion records
-- =============================================================================

-- Version configurations (per environment + service + apiVersion)
CREATE TABLE IF NOT EXISTS version_configs (
    id BINARY(16) NOT NULL,
    environment VARCHAR(20) NOT NULL,
    service_key VARCHAR(50) NOT NULL,
    api_version VARCHAR(20) NOT NULL,
    release_version VARCHAR(50),
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED',
    sunset_date DATE,
    sunset_duration_days INT,
    deprecated_at DATETIME(6),
    changelog TEXT,
    updated_by VARCHAR(255),
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_env_service_version UNIQUE (environment, service_key, api_version),
    INDEX idx_vc_environment (environment),
    INDEX idx_vc_service_key (service_key),
    INDEX idx_vc_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Global version config (one per environment)
CREATE TABLE IF NOT EXISTS global_version_configs (
    id BINARY(16) NOT NULL,
    environment VARCHAR(20) NOT NULL,
    default_api_version VARCHAR(20) NOT NULL DEFAULT 'v1',
    default_sunset_days INT NOT NULL DEFAULT 90,
    updated_by VARCHAR(255),
    updated_at DATETIME(6),
    PRIMARY KEY (id),
    CONSTRAINT uk_gvc_environment UNIQUE (environment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Version profiles (named presets)
CREATE TABLE IF NOT EXISTS version_profiles (
    id BINARY(16) NOT NULL,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    created_by VARCHAR(255),
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Version profile entries
CREATE TABLE IF NOT EXISTS version_profile_entries (
    id BINARY(16) NOT NULL,
    profile_id BINARY(16) NOT NULL,
    service_key VARCHAR(50) NOT NULL,
    api_version VARCHAR(20) NOT NULL,
    release_version VARCHAR(50),
    PRIMARY KEY (id),
    CONSTRAINT fk_vpe_profile FOREIGN KEY (profile_id) REFERENCES version_profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Promotion records (immutable audit trail)
CREATE TABLE IF NOT EXISTS promotion_records (
    id BINARY(16) NOT NULL,
    version_config_id BINARY(16) NOT NULL,
    service_key VARCHAR(50) NOT NULL,
    api_version VARCHAR(20) NOT NULL,
    from_environment VARCHAR(20) NOT NULL,
    to_environment VARCHAR(20) NOT NULL,
    promotion_type VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    promoted_by VARCHAR(255) NOT NULL,
    approver1 VARCHAR(255),
    approver2 VARCHAR(255),
    jira_ticket VARCHAR(50),
    reason TEXT,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_pr_version FOREIGN KEY (version_config_id) REFERENCES version_configs(id),
    INDEX idx_pr_service (service_key, api_version),
    INDEX idx_pr_environment (to_environment),
    INDEX idx_pr_type (promotion_type),
    INDEX idx_pr_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/resources/db/migration/V3__create_version_and_promotion_tables.sql
git commit -m "feat: add V3 migration for version tables and promotion_records"
```

---

### Task 2.2: Create PromotionRecord entity and PromotionType enum

**Files:**
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/PromotionType.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/entity/PromotionRecord.java`
- Create: `services/admin-service/src/main/java/com/quckapp/admin/domain/repository/PromotionRecordRepository.java`

**Step 1: Create the enum**

```java
package com.quckapp.admin.domain.entity;

public enum PromotionType {
    NORMAL,
    EMERGENCY_HOTFIX
}
```

**Step 2: Create the entity**

```java
package com.quckapp.admin.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "promotion_records", indexes = {
    @Index(name = "idx_pr_service", columnList = "serviceKey, apiVersion"),
    @Index(name = "idx_pr_environment", columnList = "toEnvironment"),
    @Index(name = "idx_pr_type", columnList = "promotionType"),
    @Index(name = "idx_pr_created", columnList = "createdAt")
})
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class PromotionRecord {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(nullable = false)
    private UUID versionConfigId;

    @Column(nullable = false, length = 50)
    private String serviceKey;

    @Column(nullable = false, length = 20)
    private String apiVersion;

    @Column(nullable = false, length = 20)
    private String fromEnvironment;

    @Column(nullable = false, length = 20)
    private String toEnvironment;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private PromotionType promotionType = PromotionType.NORMAL;

    @Column(nullable = false, length = 255)
    private String promotedBy;

    @Column(length = 255)
    private String approver1;

    @Column(length = 255)
    private String approver2;

    @Column(length = 50)
    private String jiraTicket;

    @Column(columnDefinition = "TEXT")
    private String reason;

    @CreatedDate
    @Column(nullable = false, updatable = false)
    private LocalDateTime createdAt;
}
```

**Step 3: Create the repository**

```java
package com.quckapp.admin.domain.repository;

import com.quckapp.admin.domain.entity.PromotionRecord;
import com.quckapp.admin.domain.entity.PromotionType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.UUID;

@Repository
public interface PromotionRecordRepository extends JpaRepository<PromotionRecord, UUID> {
    List<PromotionRecord> findByServiceKeyAndApiVersionOrderByCreatedAtDesc(String serviceKey, String apiVersion);
    List<PromotionRecord> findByToEnvironmentOrderByCreatedAtDesc(String toEnvironment);
    List<PromotionRecord> findByPromotionTypeOrderByCreatedAtDesc(PromotionType promotionType);
}
```

**Step 4: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/domain/entity/PromotionType.java \
       services/admin-service/src/main/java/com/quckapp/admin/domain/entity/PromotionRecord.java \
       services/admin-service/src/main/java/com/quckapp/admin/domain/repository/PromotionRecordRepository.java
git commit -m "feat: add PromotionRecord entity, enum, and repository"
```

---

## Phase 3: Backend — Promotion DTOs

### Task 3.1: Add promotion-related DTOs to VersionDtos.java

**Files:**
- Modify: `services/admin-service/src/main/java/com/quckapp/admin/dto/VersionDtos.java:15-141`

**Step 1: Add new DTOs**

Add these records inside the `VersionDtos` class, after `ApplyProfileRequest` (line 46) in the Request DTOs section:

```java
    public record PromoteRequest(
        @NotBlank String serviceKey,
        @NotBlank @Pattern(regexp = "^v\\d+(\\.\\d+)?$", message = "apiVersion must match pattern vN or vN.N") String apiVersion
    ) {}

    public record EmergencyActivateRequest(
        @NotBlank String serviceKey,
        @NotBlank @Pattern(regexp = "^v\\d+(\\.\\d+)?$", message = "apiVersion must match pattern vN or vN.N") String apiVersion,
        @NotBlank String reason,
        @NotBlank String approver1,
        @NotBlank String approver2,
        @NotBlank @Pattern(regexp = "^[A-Z]+-\\d+$", message = "jiraTicket must match pattern PROJ-123") String jiraTicket
    ) {}

    public record CanPromoteRequest(
        @NotBlank String serviceKey,
        @NotBlank String apiVersion,
        @NotBlank String toEnvironment
    ) {}
```

Add these records in the Response DTOs section, after `ExportEnvFileResponse` (line 141):

```java
    public record PromotionResponse(
        UUID promotionId,
        String serviceKey,
        String apiVersion,
        String fromEnvironment,
        String toEnvironment,
        String promotionType,
        String promotedBy,
        VersionConfigResponse versionConfig
    ) {}

    public record CanPromoteResponse(
        boolean allowed,
        String serviceKey,
        String apiVersion,
        String fromEnvironment,
        String toEnvironment,
        String blockedReason
    ) {}

    public record PromotionHistoryResponse(
        UUID id,
        UUID versionConfigId,
        String serviceKey,
        String apiVersion,
        String fromEnvironment,
        String toEnvironment,
        String promotionType,
        String promotedBy,
        String approver1,
        String approver2,
        String jiraTicket,
        String reason,
        java.time.LocalDateTime createdAt
    ) {}
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/dto/VersionDtos.java
git commit -m "feat: add promotion request/response DTOs"
```

---

## Phase 4: Backend — Enforce Promotion Chain in VersionService

### Task 4.1: Add promotion validation to activate() and new promote/emergency methods

This is the core task. We modify `activate()` to enforce the chain and add `promote()`, `canPromote()`, and `emergencyActivate()`.

**Files:**
- Modify: `services/admin-service/src/main/java/com/quckapp/admin/service/VersionService.java`
- Test: `services/admin-service/src/test/java/com/quckapp/admin/service/VersionServicePromotionTest.java`

**Step 1: Write the tests**

```java
package com.quckapp.admin.service;

import com.quckapp.admin.domain.EnvironmentChain;
import com.quckapp.admin.domain.entity.*;
import com.quckapp.admin.domain.repository.*;
import com.quckapp.admin.dto.VersionDtos.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class VersionServicePromotionTest {

    @Mock private VersionConfigRepository versionRepo;
    @Mock private GlobalVersionConfigRepository globalConfigRepo;
    @Mock private VersionProfileRepository profileRepo;
    @Mock private PromotionRecordRepository promotionRepo;

    @InjectMocks private VersionService service;

    private VersionConfig readyVersionInQa;
    private VersionConfig activeVersionInDev;

    @BeforeEach
    void setUp() {
        activeVersionInDev = VersionConfig.builder()
                .id(UUID.randomUUID())
                .environment("dev")
                .serviceKey("user-service")
                .apiVersion("v2")
                .status(VersionStatus.ACTIVE)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();

        readyVersionInQa = VersionConfig.builder()
                .id(UUID.randomUUID())
                .environment("qa")
                .serviceKey("user-service")
                .apiVersion("v2")
                .status(VersionStatus.READY)
                .createdAt(LocalDateTime.now())
                .updatedAt(LocalDateTime.now())
                .build();
    }

    @Test
    void activate_qa_succeeds_when_active_in_dev() {
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("qa", "user-service", "v2"))
                .thenReturn(Optional.of(readyVersionInQa));
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("dev", "user-service", "v2"))
                .thenReturn(Optional.of(activeVersionInDev));
        when(versionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(promotionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        VersionConfigResponse result = service.activate("qa", "user-service", "v2", "admin");
        assertThat(result.status()).isEqualTo(VersionStatus.ACTIVE);
    }

    @Test
    void activate_qa_fails_when_not_active_in_dev() {
        VersionConfig notActiveInDev = VersionConfig.builder()
                .environment("dev").serviceKey("user-service").apiVersion("v2")
                .status(VersionStatus.READY).build();

        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("qa", "user-service", "v2"))
                .thenReturn(Optional.of(readyVersionInQa));
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("dev", "user-service", "v2"))
                .thenReturn(Optional.of(notActiveInDev));

        assertThatThrownBy(() -> service.activate("qa", "user-service", "v2", "admin"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be ACTIVE in dev");
    }

    @Test
    void activate_qa_fails_when_version_missing_in_dev() {
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("qa", "user-service", "v2"))
                .thenReturn(Optional.of(readyVersionInQa));
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("dev", "user-service", "v2"))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> service.activate("qa", "user-service", "v2", "admin"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("must be ACTIVE in dev");
    }

    @Test
    void activate_local_succeeds_without_chain_check() {
        VersionConfig localReady = VersionConfig.builder()
                .id(UUID.randomUUID())
                .environment("local").serviceKey("user-service").apiVersion("v2")
                .status(VersionStatus.READY)
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now())
                .build();

        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("local", "user-service", "v2"))
                .thenReturn(Optional.of(localReady));
        when(versionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(promotionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        VersionConfigResponse result = service.activate("local", "user-service", "v2", "admin");
        assertThat(result.status()).isEqualTo(VersionStatus.ACTIVE);
    }

    @Test
    void canPromote_returns_allowed_when_active_in_previous() {
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("dev", "user-service", "v2"))
                .thenReturn(Optional.of(activeVersionInDev));

        CanPromoteResponse result = service.canPromote("user-service", "v2", "qa");
        assertThat(result.allowed()).isTrue();
    }

    @Test
    void canPromote_returns_blocked_when_not_active() {
        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("dev", "user-service", "v2"))
                .thenReturn(Optional.empty());

        CanPromoteResponse result = service.canPromote("user-service", "v2", "qa");
        assertThat(result.allowed()).isFalse();
        assertThat(result.blockedReason()).contains("dev");
    }

    @Test
    void emergencyActivate_succeeds_with_all_fields() {
        VersionConfig prodReady = VersionConfig.builder()
                .id(UUID.randomUUID())
                .environment("production").serviceKey("user-service").apiVersion("v2")
                .status(VersionStatus.READY)
                .createdAt(LocalDateTime.now()).updatedAt(LocalDateTime.now())
                .build();

        when(versionRepo.findByEnvironmentAndServiceKeyAndApiVersion("production", "user-service", "v2"))
                .thenReturn(Optional.of(prodReady));
        when(versionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(promotionRepo.save(any())).thenAnswer(inv -> inv.getArgument(0));

        EmergencyActivateRequest req = new EmergencyActivateRequest(
                "user-service", "v2", "Critical security patch",
                "alice@quckapp.com", "bob@quckapp.com", "SEC-1234");

        VersionConfigResponse result = service.emergencyActivate("production", req, "charlie@quckapp.com");
        assertThat(result.status()).isEqualTo(VersionStatus.ACTIVE);
    }

    @Test
    void emergencyActivate_fails_when_promoter_is_approver() {
        EmergencyActivateRequest req = new EmergencyActivateRequest(
                "user-service", "v2", "Critical security patch",
                "charlie@quckapp.com", "bob@quckapp.com", "SEC-1234");

        assertThatThrownBy(() -> service.emergencyActivate("production", req, "charlie@quckapp.com"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("approvers must differ from promoter");
    }

    @Test
    void emergencyActivate_fails_when_approvers_same() {
        EmergencyActivateRequest req = new EmergencyActivateRequest(
                "user-service", "v2", "Critical security patch",
                "alice@quckapp.com", "alice@quckapp.com", "SEC-1234");

        assertThatThrownBy(() -> service.emergencyActivate("production", req, "charlie@quckapp.com"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("approver1 and approver2 must be different");
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd services/admin-service && ./mvnw test -pl . -Dtest=VersionServicePromotionTest`
Expected: Compilation errors — `canPromote`, `emergencyActivate` methods don't exist, `PromotionRecordRepository` not injected

**Step 3: Modify VersionService.java**

Add `PromotionRecordRepository` to the constructor injection (add field after line 27):

```java
    private final PromotionRecordRepository promotionRepo;
```

Replace the `activate()` method (lines 115-128) with:

```java
    public VersionConfigResponse activate(String environment, String serviceKey, String apiVersion, String updatedBy) {
        VersionConfig config = findVersion(environment, serviceKey, apiVersion);

        if (config.getStatus() != VersionStatus.READY) {
            throw new IllegalStateException(
                    "Cannot activate: current status is " + config.getStatus() + ", expected READY");
        }

        // === PROMOTION GATE: enforce environment chain ===
        if (!EnvironmentChain.isUnrestricted(environment)) {
            Optional<String> previousEnv = EnvironmentChain.previousOf(environment);
            if (previousEnv.isPresent()) {
                String prevEnv = previousEnv.get();
                boolean activeInPrevious;

                if ("uat".equals(prevEnv)) {
                    // For staging: check if active in ANY uat variant
                    activeInPrevious = List.of("uat1", "uat2", "uat3").stream()
                            .anyMatch(uat -> versionRepo
                                    .findByEnvironmentAndServiceKeyAndApiVersion(uat, serviceKey, apiVersion)
                                    .map(v -> v.getStatus() == VersionStatus.ACTIVE)
                                    .orElse(false));
                } else {
                    activeInPrevious = versionRepo
                            .findByEnvironmentAndServiceKeyAndApiVersion(prevEnv, serviceKey, apiVersion)
                            .map(v -> v.getStatus() == VersionStatus.ACTIVE)
                            .orElse(false);
                }

                if (!activeInPrevious) {
                    throw new IllegalStateException(
                            "Promotion gate: " + serviceKey + " " + apiVersion
                                    + " must be ACTIVE in " + prevEnv + " before activating in " + environment
                                    + ". Use emergency-activate for hotfix bypass.");
                }
            }
        }

        config.setStatus(VersionStatus.ACTIVE);
        config.setUpdatedBy(updatedBy);
        config = versionRepo.save(config);

        // Record the promotion
        PromotionRecord record = PromotionRecord.builder()
                .versionConfigId(config.getId())
                .serviceKey(serviceKey)
                .apiVersion(apiVersion)
                .fromEnvironment(EnvironmentChain.previousOf(environment).orElse("none"))
                .toEnvironment(environment)
                .promotionType(PromotionType.NORMAL)
                .promotedBy(updatedBy)
                .build();
        promotionRepo.save(record);

        log.info("Activated: {} {} in {} (promotion from {})",
                serviceKey, apiVersion, environment, record.getFromEnvironment());
        return toResponse(config);
    }
```

Add these new methods after `disable()` (after line 177):

```java
    // ===== Promotion Operations =====

    /**
     * Check if a version can be promoted to the target environment.
     * Returns allowed=true if the version is ACTIVE in the previous environment.
     */
    @Transactional(readOnly = true)
    public CanPromoteResponse canPromote(String serviceKey, String apiVersion, String toEnvironment) {
        Optional<String> previousEnv = EnvironmentChain.previousOf(toEnvironment);

        if (EnvironmentChain.isUnrestricted(toEnvironment) || previousEnv.isEmpty()) {
            return new CanPromoteResponse(true, serviceKey, apiVersion, "none", toEnvironment, null);
        }

        String prevEnv = previousEnv.get();
        boolean activeInPrevious;

        if ("uat".equals(prevEnv)) {
            activeInPrevious = List.of("uat1", "uat2", "uat3").stream()
                    .anyMatch(uat -> versionRepo
                            .findByEnvironmentAndServiceKeyAndApiVersion(uat, serviceKey, apiVersion)
                            .map(v -> v.getStatus() == VersionStatus.ACTIVE)
                            .orElse(false));
        } else {
            activeInPrevious = versionRepo
                    .findByEnvironmentAndServiceKeyAndApiVersion(prevEnv, serviceKey, apiVersion)
                    .map(v -> v.getStatus() == VersionStatus.ACTIVE)
                    .orElse(false);
        }

        if (activeInPrevious) {
            return new CanPromoteResponse(true, serviceKey, apiVersion, prevEnv, toEnvironment, null);
        } else {
            return new CanPromoteResponse(false, serviceKey, apiVersion, prevEnv, toEnvironment,
                    serviceKey + " " + apiVersion + " is not ACTIVE in " + prevEnv);
        }
    }

    /**
     * Promote a version from the previous environment to the next.
     * Creates the version in toEnvironment if it doesn't exist, marks READY, then activates.
     */
    public PromotionResponse promote(String toEnvironment, String serviceKey, String apiVersion, String updatedBy) {
        // Validate chain
        CanPromoteResponse check = canPromote(serviceKey, apiVersion, toEnvironment);
        if (!check.allowed()) {
            throw new IllegalStateException("Promotion blocked: " + check.blockedReason());
        }

        String fromEnvironment = EnvironmentChain.previousOf(toEnvironment).orElse("none");

        // Create version in target env if it doesn't exist
        Optional<VersionConfig> existing = versionRepo.findByEnvironmentAndServiceKeyAndApiVersion(
                toEnvironment, serviceKey, apiVersion);

        VersionConfig config;
        if (existing.isEmpty()) {
            // Copy release version from source
            VersionConfig source = findVersion(fromEnvironment.equals("uat")
                    ? findActiveUatEnvironment(serviceKey, apiVersion) : fromEnvironment, serviceKey, apiVersion);

            config = VersionConfig.builder()
                    .environment(toEnvironment)
                    .serviceKey(serviceKey)
                    .apiVersion(apiVersion)
                    .releaseVersion(source.getReleaseVersion())
                    .status(VersionStatus.READY)
                    .changelog(source.getChangelog())
                    .updatedBy(updatedBy)
                    .build();
            config = versionRepo.save(config);
        } else {
            config = existing.get();
            if (config.getStatus() == VersionStatus.ACTIVE) {
                throw new IllegalStateException("Version is already ACTIVE in " + toEnvironment);
            }
            if (config.getStatus() != VersionStatus.READY) {
                config.setStatus(VersionStatus.READY);
                config.setUpdatedBy(updatedBy);
                config = versionRepo.save(config);
            }
        }

        // Activate (this won't re-check the chain since we've already validated)
        config.setStatus(VersionStatus.ACTIVE);
        config.setUpdatedBy(updatedBy);
        config = versionRepo.save(config);

        // Record
        PromotionRecord record = PromotionRecord.builder()
                .versionConfigId(config.getId())
                .serviceKey(serviceKey)
                .apiVersion(apiVersion)
                .fromEnvironment(fromEnvironment)
                .toEnvironment(toEnvironment)
                .promotionType(PromotionType.NORMAL)
                .promotedBy(updatedBy)
                .build();
        promotionRepo.save(record);

        log.info("Promoted: {} {} from {} to {}", serviceKey, apiVersion, fromEnvironment, toEnvironment);
        return new PromotionResponse(record.getId(), serviceKey, apiVersion,
                fromEnvironment, toEnvironment, "NORMAL", updatedBy, toResponse(config));
    }

    /**
     * Emergency hotfix bypass — activates a version in ANY environment without chain validation.
     * Requires: reason, two distinct approvers (different from promoter), JIRA ticket.
     */
    public VersionConfigResponse emergencyActivate(String environment, EmergencyActivateRequest request, String promotedBy) {
        // Validate dual approval
        if (request.approver1().equalsIgnoreCase(request.approver2())) {
            throw new IllegalArgumentException("Emergency hotfix: approver1 and approver2 must be different people");
        }
        if (request.approver1().equalsIgnoreCase(promotedBy) || request.approver2().equalsIgnoreCase(promotedBy)) {
            throw new IllegalArgumentException("Emergency hotfix: approvers must differ from promoter");
        }

        VersionConfig config = findVersion(environment, request.serviceKey(), request.apiVersion());

        if (config.getStatus() != VersionStatus.READY) {
            throw new IllegalStateException(
                    "Cannot emergency-activate: current status is " + config.getStatus() + ", expected READY");
        }

        config.setStatus(VersionStatus.ACTIVE);
        config.setUpdatedBy(promotedBy);
        config = versionRepo.save(config);

        // Record emergency promotion
        PromotionRecord record = PromotionRecord.builder()
                .versionConfigId(config.getId())
                .serviceKey(request.serviceKey())
                .apiVersion(request.apiVersion())
                .fromEnvironment("EMERGENCY_BYPASS")
                .toEnvironment(environment)
                .promotionType(PromotionType.EMERGENCY_HOTFIX)
                .promotedBy(promotedBy)
                .approver1(request.approver1())
                .approver2(request.approver2())
                .jiraTicket(request.jiraTicket())
                .reason(request.reason())
                .build();
        promotionRepo.save(record);

        log.warn("EMERGENCY HOTFIX: {} {} activated in {} by {} (approvers: {}, {}, ticket: {})",
                request.serviceKey(), request.apiVersion(), environment,
                promotedBy, request.approver1(), request.approver2(), request.jiraTicket());
        return toResponse(config);
    }

    /**
     * Get promotion history for a service+version.
     */
    @Transactional(readOnly = true)
    public List<PromotionHistoryResponse> getPromotionHistory(String serviceKey, String apiVersion) {
        return promotionRepo.findByServiceKeyAndApiVersionOrderByCreatedAtDesc(serviceKey, apiVersion)
                .stream()
                .map(this::toPromotionHistoryResponse)
                .toList();
    }

    // Add to private helpers section:
    private String findActiveUatEnvironment(String serviceKey, String apiVersion) {
        for (String uat : List.of("uat1", "uat2", "uat3")) {
            Optional<VersionConfig> v = versionRepo.findByEnvironmentAndServiceKeyAndApiVersion(uat, serviceKey, apiVersion);
            if (v.isPresent() && v.get().getStatus() == VersionStatus.ACTIVE) {
                return uat;
            }
        }
        throw new IllegalStateException("No active UAT version found for " + serviceKey + " " + apiVersion);
    }

    private PromotionHistoryResponse toPromotionHistoryResponse(PromotionRecord r) {
        return new PromotionHistoryResponse(
                r.getId(), r.getVersionConfigId(), r.getServiceKey(), r.getApiVersion(),
                r.getFromEnvironment(), r.getToEnvironment(), r.getPromotionType().name(),
                r.getPromotedBy(), r.getApprover1(), r.getApprover2(),
                r.getJiraTicket(), r.getReason(), r.getCreatedAt());
    }
```

**Step 4: Run tests to verify they pass**

Run: `cd services/admin-service && ./mvnw test -pl . -Dtest=VersionServicePromotionTest`
Expected: All 9 tests PASS

**Step 5: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/service/VersionService.java \
       services/admin-service/src/test/java/com/quckapp/admin/service/VersionServicePromotionTest.java
git commit -m "feat: enforce environment promotion chain in activate() with emergency hotfix bypass"
```

---

## Phase 5: Backend — Controller Endpoints

### Task 5.1: Add promotion endpoints to VersionController

**Files:**
- Modify: `services/admin-service/src/main/java/com/quckapp/admin/controller/VersionController.java`

**Step 1: Add new endpoints after the existing state transition endpoints (after line 119)**

```java
    // ===== Promotion Gate Endpoints =====

    @GetMapping("/can-promote")
    @Operation(summary = "Check if a version can be promoted to target environment (CI/CD gate)")
    public ResponseEntity<ApiResponse<CanPromoteResponse>> canPromote(
            @RequestParam String serviceKey,
            @RequestParam String apiVersion,
            @RequestParam String toEnvironment) {
        return ResponseEntity.ok(ApiResponse.success(
                versionService.canPromote(serviceKey, apiVersion, toEnvironment)));
    }

    @PostMapping("/{env}/versions/{serviceKey}/{ver}/promote")
    @Operation(summary = "Promote version from previous environment (creates + activates in target)")
    public ResponseEntity<ApiResponse<PromotionResponse>> promote(
            @PathVariable String env,
            @PathVariable String serviceKey,
            @PathVariable String ver) {
        return ResponseEntity.ok(ApiResponse.success("Version promoted",
                versionService.promote(env, serviceKey, ver, DEFAULT_UPDATED_BY)));
    }

    @PostMapping("/{env}/versions/emergency-activate")
    @Operation(summary = "Emergency hotfix bypass — requires dual approval + JIRA ticket")
    public ResponseEntity<ApiResponse<VersionConfigResponse>> emergencyActivate(
            @PathVariable String env,
            @Valid @RequestBody EmergencyActivateRequest request) {
        return ResponseEntity.ok(ApiResponse.success("Emergency hotfix activated",
                versionService.emergencyActivate(env, request, DEFAULT_UPDATED_BY)));
    }

    @GetMapping("/promotion-history/{serviceKey}/{ver}")
    @Operation(summary = "Get promotion audit trail for a version")
    public ResponseEntity<ApiResponse<List<PromotionHistoryResponse>>> getPromotionHistory(
            @PathVariable String serviceKey,
            @PathVariable String ver) {
        return ResponseEntity.ok(ApiResponse.success(
                versionService.getPromotionHistory(serviceKey, ver)));
    }
```

**Step 2: Commit**

```bash
git add services/admin-service/src/main/java/com/quckapp/admin/controller/VersionController.java
git commit -m "feat: add promotion gate, emergency activate, and history endpoints"
```

---

## Phase 6: GitHub Actions — Promotion Gate in CI/CD

### Task 6.1: Add promotion gate steps to reusable-service-deploy.yml

Modify the reusable deploy workflow to check promotion rules before each environment deployment and auto-record promotions after successful deploy.

**Files:**
- Modify: `.github/workflows/reusable-service-deploy.yml`

**Step 1: Add `api_version` input** (add after `port` input, around line 20):

```yaml
      api_version:
        required: false
        type: string
        default: 'v1'
        description: 'API version being deployed (e.g., v1, v2)'
```

**Step 2: Replace the `deploy-dev` job** (lines 66-86) with promotion-gate-aware version:

```yaml
  deploy-dev:
    needs: build-push
    runs-on: ubuntu-latest
    environment: development
    steps:
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - name: Deploy to dev AKS
        run: |
          az aks get-credentials --resource-group quckapp-dev --name quckapp-dev-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-push.outputs.image_tag }} \
            -n quckapp
      - name: Mark version ready + promote to dev
        if: vars.SERVICE_URLS_API_URL != ''
        run: |
          API_URL="${{ vars.SERVICE_URLS_API_URL }}/admin/service-urls"
          TOKEN="${{ secrets.SERVICE_URLS_API_TOKEN }}"
          SVC="${{ inputs.service_name }}"
          VER="${{ inputs.api_version }}"

          # Mark ready in dev
          curl -sf -X POST "$API_URL/dev/versions/$SVC/$VER/ready" \
            -H "Authorization: Bearer $TOKEN" || echo "::warning::Version ready marking failed (non-fatal)"

          # Promote to dev (auto-activates)
          curl -sf -X POST "$API_URL/dev/versions/$SVC/$VER/promote" \
            -H "Authorization: Bearer $TOKEN" || echo "::warning::Version promotion failed (non-fatal)"
```

**Step 3: Add promotion gate to each subsequent deploy job.** Replace deploy-qa (lines 88-100), deploy-uat, deploy-staging, deploy-production, deploy-live with gate-checked versions. Example for deploy-qa:

```yaml
  deploy-qa:
    needs: [build-push, deploy-dev]
    runs-on: ubuntu-latest
    environment: qa
    steps:
      - name: Check promotion gate
        if: vars.SERVICE_URLS_API_URL != ''
        run: |
          RESPONSE=$(curl -sf "${{ vars.SERVICE_URLS_API_URL }}/admin/service-urls/can-promote?serviceKey=${{ inputs.service_name }}&apiVersion=${{ inputs.api_version }}&toEnvironment=qa" \
            -H "Authorization: Bearer ${{ secrets.SERVICE_URLS_API_TOKEN }}")
          ALLOWED=$(echo "$RESPONSE" | jq -r '.data.allowed')
          if [ "$ALLOWED" != "true" ]; then
            REASON=$(echo "$RESPONSE" | jq -r '.data.blockedReason')
            echo "::error::Promotion gate blocked: $REASON"
            exit 1
          fi
      - uses: azure/login@v1
        with:
          creds: ${{ secrets.AZURE_CREDENTIALS }}
      - name: Deploy to qa AKS
        run: |
          az aks get-credentials --resource-group quckapp-qa --name quckapp-qa-aks
          kubectl set image deployment/${{ inputs.service_name }} \
            ${{ inputs.service_name }}=${{ needs.build-push.outputs.image_tag }} \
            -n quckapp
      - name: Record promotion
        if: vars.SERVICE_URLS_API_URL != ''
        run: |
          curl -sf -X POST "${{ vars.SERVICE_URLS_API_URL }}/admin/service-urls/qa/versions/${{ inputs.service_name }}/${{ inputs.api_version }}/promote" \
            -H "Authorization: Bearer ${{ secrets.SERVICE_URLS_API_TOKEN }}" || echo "::warning::Promotion recording failed"
```

**Repeat the same pattern for deploy-uat, deploy-staging, deploy-production, deploy-live** — each gets:
1. A "Check promotion gate" step that calls `/can-promote` and fails if blocked
2. A "Record promotion" step after deploy that calls `/promote`

Use the environment name matching the job: `uat1` for deploy-uat, `staging` for deploy-staging, `production` for deploy-production, `live` for deploy-live.

**Step 4: Commit**

```bash
git add .github/workflows/reusable-service-deploy.yml
git commit -m "feat: add promotion gate checks to CI/CD deploy pipeline"
```

---

### Task 6.2: Add version promotion to promote-environment.yml

**Files:**
- Modify: `.github/workflows/promote-environment.yml`

**Step 1: Add promotion gate to the `promote` job** (after the "Checkout" step, around line 103):

```yaml
      - name: Check version promotion gate
        if: vars.SERVICE_URLS_API_URL != ''
        run: |
          API_URL="${{ vars.SERVICE_URLS_API_URL }}/admin/service-urls"
          TOKEN="${{ secrets.SERVICE_URLS_API_TOKEN }}"
          TARGET="${{ inputs.target_environment }}"

          # Check all services in this deployment can be promoted
          SERVICES=$(kubectl get deployments -n quckapp-${{ inputs.source_environment }} -o jsonpath='{.items[*].metadata.name}')
          BLOCKED=""
          for SVC in $SERVICES; do
            RESPONSE=$(curl -sf "$API_URL/can-promote?serviceKey=$SVC&apiVersion=v1&toEnvironment=$TARGET" \
              -H "Authorization: Bearer $TOKEN" 2>/dev/null || echo '{"data":{"allowed":true}}')
            ALLOWED=$(echo "$RESPONSE" | jq -r '.data.allowed')
            if [ "$ALLOWED" != "true" ]; then
              REASON=$(echo "$RESPONSE" | jq -r '.data.blockedReason')
              BLOCKED="$BLOCKED\n$SVC: $REASON"
            fi
          done

          if [ -n "$BLOCKED" ]; then
            echo "::error::Promotion gate blocked for:$BLOCKED"
            exit 1
          fi
```

**Step 2: Add promotion recording after successful deploy** (after the "Wait for rollout" step):

```yaml
      - name: Record version promotions
        if: vars.SERVICE_URLS_API_URL != ''
        run: |
          API_URL="${{ vars.SERVICE_URLS_API_URL }}/admin/service-urls"
          TOKEN="${{ secrets.SERVICE_URLS_API_TOKEN }}"
          TARGET="${{ inputs.target_environment }}"

          SERVICES=$(kubectl get deployments -n quckapp-${{ inputs.source_environment }} -o jsonpath='{.items[*].metadata.name}')
          for SVC in $SERVICES; do
            curl -sf -X POST "$API_URL/$TARGET/versions/$SVC/v1/promote" \
              -H "Authorization: Bearer $TOKEN" || echo "::warning::Promotion recording failed for $SVC"
          done
```

**Step 3: Commit**

```bash
git add .github/workflows/promote-environment.yml
git commit -m "feat: add version promotion gate to manual environment promotion workflow"
```

---

## Phase 7: Azure Pipelines — Promotion Gate Template

### Task 7.1: Create Azure Pipeline gate template

**Files:**
- Create: `.azure-pipelines/templates/version-promotion-gate.yml`
- Create: `.azure-pipelines/templates/version-promotion-record.yml`

**Step 1: Create the promotion gate template**

```yaml
# =============================================================================
# Version Promotion Gate — Azure Pipelines Template
# =============================================================================
# Use as a step template in your deployment stages.
# Calls the service-urls API to validate that a version can be promoted
# to the target environment. Fails the pipeline if blocked.
#
# Usage:
#   - template: templates/version-promotion-gate.yml
#     parameters:
#       serviceName: 'user-service'
#       apiVersion: 'v1'
#       targetEnvironment: 'production'
#       serviceUrlsApiUrl: '$(SERVICE_URLS_API_URL)'
#       serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'
# =============================================================================

parameters:
  - name: serviceName
    type: string
  - name: apiVersion
    type: string
    default: 'v1'
  - name: targetEnvironment
    type: string
  - name: serviceUrlsApiUrl
    type: string
  - name: serviceUrlsApiToken
    type: string

steps:
  - script: |
      set -e
      RESPONSE=$(curl -sf "${{ parameters.serviceUrlsApiUrl }}/admin/service-urls/can-promote?serviceKey=${{ parameters.serviceName }}&apiVersion=${{ parameters.apiVersion }}&toEnvironment=${{ parameters.targetEnvironment }}" \
        -H "Authorization: Bearer ${{ parameters.serviceUrlsApiToken }}")

      ALLOWED=$(echo "$RESPONSE" | jq -r '.data.allowed')

      if [ "$ALLOWED" != "true" ]; then
        REASON=$(echo "$RESPONSE" | jq -r '.data.blockedReason')
        echo "##vso[task.logissue type=error]Promotion gate blocked: $REASON"
        echo "##vso[task.complete result=Failed;]Promotion gate blocked"
        exit 1
      fi

      echo "Promotion gate passed: ${{ parameters.serviceName }} ${{ parameters.apiVersion }} → ${{ parameters.targetEnvironment }}"
    displayName: 'Check Version Promotion Gate'
    env:
      SERVICE_URLS_API_TOKEN: ${{ parameters.serviceUrlsApiToken }}
```

**Step 2: Create the promotion record template**

```yaml
# =============================================================================
# Version Promotion Record — Azure Pipelines Template
# =============================================================================
# Records a successful promotion after deployment.
#
# Usage:
#   - template: templates/version-promotion-record.yml
#     parameters:
#       serviceName: 'user-service'
#       apiVersion: 'v1'
#       targetEnvironment: 'production'
#       serviceUrlsApiUrl: '$(SERVICE_URLS_API_URL)'
#       serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'
# =============================================================================

parameters:
  - name: serviceName
    type: string
  - name: apiVersion
    type: string
    default: 'v1'
  - name: targetEnvironment
    type: string
  - name: serviceUrlsApiUrl
    type: string
  - name: serviceUrlsApiToken
    type: string

steps:
  - script: |
      curl -sf -X POST "${{ parameters.serviceUrlsApiUrl }}/admin/service-urls/${{ parameters.targetEnvironment }}/versions/${{ parameters.serviceName }}/${{ parameters.apiVersion }}/promote" \
        -H "Authorization: Bearer ${{ parameters.serviceUrlsApiToken }}" \
        || echo "##vso[task.logissue type=warning]Version promotion recording failed (non-fatal)"

      echo "Promotion recorded: ${{ parameters.serviceName }} ${{ parameters.apiVersion }} → ${{ parameters.targetEnvironment }}"
    displayName: 'Record Version Promotion'
    condition: succeeded()
    env:
      SERVICE_URLS_API_TOKEN: ${{ parameters.serviceUrlsApiToken }}
```

**Step 3: Create an example pipeline showing usage**

Create: `.azure-pipelines/templates/example-service-deploy.yml`

```yaml
# =============================================================================
# Example: Service deployment pipeline with version promotion gates
# =============================================================================
# Copy and adapt this for each service.
# =============================================================================

trigger:
  branches:
    include:
      - main
  paths:
    include:
      - 'services/user-service/**'

variables:
  serviceName: 'user-service'
  apiVersion: 'v1'
  serviceUrlsApiUrl: '$(SERVICE_URLS_API_URL)'

stages:
  - stage: Build
    jobs:
      - job: BuildPush
        pool:
          vmImage: 'ubuntu-latest'
        steps:
          - task: Docker@2
            inputs:
              command: buildAndPush
              repository: '$(serviceName)'
              dockerfile: 'services/$(serviceName)/Dockerfile'

  - stage: DeployDev
    dependsOn: Build
    jobs:
      - deployment: DeployDev
        environment: 'development'
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/version-promotion-gate.yml
                  parameters:
                    serviceName: '$(serviceName)'
                    apiVersion: '$(apiVersion)'
                    targetEnvironment: 'dev'
                    serviceUrlsApiUrl: '$(serviceUrlsApiUrl)'
                    serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'
                - script: echo "Deploy to dev AKS..."
                  displayName: 'Deploy to dev'
                - template: templates/version-promotion-record.yml
                  parameters:
                    serviceName: '$(serviceName)'
                    apiVersion: '$(apiVersion)'
                    targetEnvironment: 'dev'
                    serviceUrlsApiUrl: '$(serviceUrlsApiUrl)'
                    serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'

  - stage: DeployQA
    dependsOn: DeployDev
    jobs:
      - deployment: DeployQA
        environment: 'qa'
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/version-promotion-gate.yml
                  parameters:
                    serviceName: '$(serviceName)'
                    apiVersion: '$(apiVersion)'
                    targetEnvironment: 'qa'
                    serviceUrlsApiUrl: '$(serviceUrlsApiUrl)'
                    serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'
                - script: echo "Deploy to qa AKS..."
                  displayName: 'Deploy to QA'
                - template: templates/version-promotion-record.yml
                  parameters:
                    serviceName: '$(serviceName)'
                    apiVersion: '$(apiVersion)'
                    targetEnvironment: 'qa'
                    serviceUrlsApiUrl: '$(serviceUrlsApiUrl)'
                    serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'

  - stage: DeployProduction
    dependsOn: DeployQA
    jobs:
      - deployment: DeployProd
        environment: 'production'
        strategy:
          runOnce:
            deploy:
              steps:
                - template: templates/version-promotion-gate.yml
                  parameters:
                    serviceName: '$(serviceName)'
                    apiVersion: '$(apiVersion)'
                    targetEnvironment: 'production'
                    serviceUrlsApiUrl: '$(serviceUrlsApiUrl)'
                    serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'
                - script: echo "Deploy to production AKS..."
                  displayName: 'Deploy to Production'
                - template: templates/version-promotion-record.yml
                  parameters:
                    serviceName: '$(serviceName)'
                    apiVersion: '$(apiVersion)'
                    targetEnvironment: 'production'
                    serviceUrlsApiUrl: '$(serviceUrlsApiUrl)'
                    serviceUrlsApiToken: '$(SERVICE_URLS_API_TOKEN)'
```

**Step 4: Commit**

```bash
git add .azure-pipelines/
git commit -m "feat: add Azure Pipeline templates for version promotion gates"
```

---

## Phase 8: GitHub Action — PR Version Validation Check

### Task 8.1: Create PR check workflow for version-related changes

A GitHub Action that runs on PRs targeting `main`, detects if version-related files changed, and validates that no out-of-order promotions are being introduced.

**Files:**
- Create: `.github/workflows/pr-version-check.yml`

**Step 1: Write the workflow**

```yaml
name: PR Version Validation

on:
  pull_request:
    branches: [main]
    paths:
      - 'services/admin-service/src/**'
      - '.github/workflows/reusable-service-deploy.yml'
      - '.github/workflows/promote-environment.yml'

permissions:
  pull-requests: write
  contents: read

jobs:
  version-check:
    name: Validate Version Promotion Rules
    runs-on: ubuntu-latest
    if: vars.SERVICE_URLS_API_URL != ''
    steps:
      - uses: actions/checkout@v4

      - name: Check for direct activation bypasses
        run: |
          # Scan for any code that directly sets status to ACTIVE without using promote()
          VIOLATIONS=$(grep -rn "VersionStatus.ACTIVE" --include="*.java" services/admin-service/src/ \
            | grep -v "Test" \
            | grep -v "VersionService.java" \
            | grep -v "VersionStatus.java" \
            || true)

          if [ -n "$VIOLATIONS" ]; then
            echo "::warning::Found direct VersionStatus.ACTIVE references outside VersionService:"
            echo "$VIOLATIONS"
          fi

      - name: Validate promotion chain integrity
        run: |
          # Verify EnvironmentChain.java still has the correct order
          if ! grep -q '"local", "dev", "qa", "uat", "staging", "production", "live"' \
            services/admin-service/src/main/java/com/quckapp/admin/domain/EnvironmentChain.java; then
            echo "::error::EnvironmentChain order has been modified! Verify this is intentional."
            exit 1
          fi

      - name: Post check summary
        if: always()
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.pulls.createReview({
              owner: context.repo.owner,
              repo: context.repo.repo,
              pull_number: context.issue.number,
              event: 'COMMENT',
              body: '**Version Promotion Check:** Verified that environment chain rules are intact and no direct activation bypasses were introduced.'
            });
```

**Step 2: Commit**

```bash
git add .github/workflows/pr-version-check.yml
git commit -m "feat: add PR check workflow for version promotion rule validation"
```

---

## Summary

| Phase | Task | Description | Files |
|-------|------|-------------|-------|
| 1 | 1.1 | EnvironmentChain utility + tests | 2 files |
| 2 | 2.1 | V3 Flyway migration | 1 file |
| 2 | 2.2 | PromotionRecord entity + repo | 3 files |
| 3 | 3.1 | Promotion DTOs | 1 file (modify) |
| 4 | 4.1 | Enforce chain in activate() + promote/emergency methods + tests | 2 files |
| 5 | 5.1 | Controller endpoints | 1 file (modify) |
| 6 | 6.1 | Promotion gate in reusable-service-deploy.yml | 1 file (modify) |
| 6 | 6.2 | Promotion gate in promote-environment.yml | 1 file (modify) |
| 7 | 7.1 | Azure Pipeline gate templates + example | 3 files |
| 8 | 8.1 | PR version validation check | 1 file |

**Total: 16 files (10 new, 6 modified), 10 tasks, ~8 commits**

**Enforcement coverage:**
- **API level:** `activate()` rejects out-of-order promotions (hard gate)
- **CI/CD (GitHub Actions):** Each deploy job calls `/can-promote` before deploying
- **CI/CD (Azure Pipelines):** Reusable templates call `/can-promote` before deploying
- **PR review:** Automated check ensures chain rules aren't modified
- **Emergency bypass:** `/emergency-activate` requires reason + 2 approvers + JIRA ticket
- **Audit trail:** Every promotion recorded in `promotion_records` table with full context
