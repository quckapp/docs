---
sidebar_position: 3
---

# Environment Promotion Gates

Promotion gates enforce a strict linear progression of service versions through the environment chain. A version cannot be activated in a higher environment until it has been validated and activated in the preceding one — preventing untested code from reaching production.

---

## Environment Chain

All environments follow a fixed promotion chain:

```
┌───────┐    ┌─────┐    ┌────┐    ┌─────┐    ┌─────────┐    ┌────────────┐    ┌──────┐
│ local │───▶│ dev │───▶│ qa │───▶│ uat │───▶│ staging │───▶│ production │───▶│ live │
└───────┘    └─────┘    └────┘    └─────┘    └─────────┘    └────────────┘    └──────┘
 ◄──── Unrestricted ────►  ◄──────────────── Restricted ─────────────────────────────►
```

| Category | Environments | Gate Behaviour |
|----------|-------------|----------------|
| **Unrestricted** | `local`, `dev`, `qa` | Versions can be activated freely without prior-environment checks |
| **Restricted** | `uat`, `staging`, `production`, `live` | Version must be `ACTIVE` in the previous environment before promotion |

---

## How It Works

### Chain Validation on Activation

When a service calls `activate()` on a version in a restricted environment, the promotion gate library checks whether that version is already `ACTIVE` in the preceding environment. If not, activation is rejected.

```
CI/CD Pipeline                    Admin-Service                  Per-Service Library
      │                                │                                │
      │  GET /can-promote              │                                │
      │───────────────────────────────▶│                                │
      │  { allowed, nextEnvironment }  │                                │
      │◀───────────────────────────────│                                │
      │                                │                                │
      │  (if allowed)                  │                                │
      │  POST /promote                 │                                │
      │───────────────────────────────▶│                                │
      │                                │  activate(serviceKey, ver)     │
      │                                │───────────────────────────────▶│
      │                                │  chain.previousOf(env) check   │
      │                                │◀───────────────────────────────│
      │  { promotionType: "PROMOTE" }  │                                │
      │◀───────────────────────────────│                                │
```

### CI/CD Pipeline Integration

Pipelines call `/can-promote` before attempting deployment to the next environment. A typical Azure DevOps stage gate:

```yaml
- stage: PromoteToStaging
  jobs:
    - job: CheckGate
      steps:
        - script: |
            RESULT=$(curl -s "$ADMIN_URL/api/v1/admin/service-urls/uat/versions/$SERVICE_KEY/$VERSION/can-promote")
            ALLOWED=$(echo "$RESULT" | jq -r '.data.allowed')
            if [ "$ALLOWED" != "true" ]; then
              echo "##vso[task.logissue type=error]Promotion blocked: $(echo $RESULT | jq -r '.data.blockedReason')"
              exit 1
            fi
          displayName: 'Check promotion eligibility'

    - job: Promote
      dependsOn: CheckGate
      steps:
        - script: |
            curl -X POST "$ADMIN_URL/api/v1/admin/service-urls/uat/versions/$SERVICE_KEY/$VERSION/promote" \
              -H "Content-Type: application/json" \
              -d '{"reason": "Pipeline auto-promotion after QA pass"}'
          displayName: 'Promote to staging'
```

---

## Admin-Service API Endpoints

All endpoints are under the base path `/api/v1/admin/service-urls`.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/{env}/versions/{serviceKey}/{ver}/can-promote` | Check if a version can be promoted to the next environment |
| `POST` | `/{env}/versions/{serviceKey}/{ver}/promote` | Promote a version to the next environment in the chain |
| `POST` | `/{env}/versions/{serviceKey}/{ver}/emergency-activate` | Emergency activation bypassing the chain (dual-approval) |

### `GET /can-promote`

Check whether a version is eligible for promotion from `{env}` to the next environment in the chain.

**Response:**

```json
{
  "data": {
    "allowed": true,
    "environment": "qa",
    "serviceKey": "user-service",
    "apiVersion": "v2",
    "nextEnvironment": "uat",
    "blockedReason": null
  }
}
```

When blocked, `allowed` is `false` and `blockedReason` explains why (e.g., `"Version v2 is not ACTIVE in qa"`).

### `POST /promote`

Promote a version from `{env}` to the next environment. The version must pass the `/can-promote` check first.

**Request:**

```json
{
  "reason": "All QA test suites passed"
}
```

**Response:**

```json
{
  "data": {
    "fromEnvironment": "qa",
    "toEnvironment": "uat",
    "serviceKey": "user-service",
    "apiVersion": "v2",
    "promotionType": "PROMOTE",
    "promotedBy": "ci-pipeline@quckapp.com",
    "versionConfig": { }
  }
}
```

### `POST /emergency-activate`

Bypass the promotion chain for emergencies (hotfixes, critical incidents). Requires dual approval and a JIRA ticket.

**Request:**

```json
{
  "reason": "Critical security patch — CVE-2025-XXXX",
  "approver1": "jane.doe@quckapp.com",
  "approver2": "john.smith@quckapp.com",
  "jiraTicket": "QUCK-4521"
}
```

**Response:**

```json
{
  "data": {
    "fromEnvironment": null,
    "toEnvironment": "production",
    "serviceKey": "auth-service",
    "apiVersion": "v3",
    "promotionType": "EMERGENCY",
    "promotedBy": "ops-lead@quckapp.com",
    "versionConfig": { }
  }
}
```

---

## Per-Service Libraries

Each tech stack has a dedicated promotion gate library that embeds the environment chain logic directly into the service. These libraries provide both chain utilities (normalize, previousOf, isUnrestricted) and optional HTTP endpoints for service-level promotion tracking.

| Tech Stack | Package | Location | Integration Pattern |
|-----------|---------|----------|-------------------|
| **Spring/Java** | `com.quckapp.promotion` | `packages/promotion-gate-spring/` | `@Import(PromotionModule.class)` — auto-configures controller, service, JPA entity |
| **Go** | `promotiongate` | `packages/promotion-gate-go/` | `handler.RegisterRoutes(routerGroup)` — mounts Gin handler with store interface |
| **Node/NestJS** | `promotion-gate-node` | `packages/promotion-gate-node/` | `PromotionModule.forRoot(config)` — NestJS dynamic module with TypeORM entity |
| **Python** | `promotion_gate` | `packages/promotion-gate-python/` | `create_promotion_router(service_name, env)` — returns FastAPI `APIRouter` |
| **Elixir** | `PromotionGate` | `packages/promotion-gate-elixir/` | `forward "/promotion", PromotionGate.Router` — Phoenix router plug |

### Common API Surface

All five libraries expose the same chain utility functions:

| Function | Description |
|----------|-------------|
| `normalize(env)` | Lowercases and normalizes UAT variants (`uat1` → `uat`) |
| `previousOf(env)` | Returns the preceding environment in the chain, or `nil`/`null` for `local` |
| `nextOf(env)` | Returns the next environment in the chain, or `nil`/`null` for `live` |
| `isUnrestricted(env)` | Returns `true` for `local`, `dev`, `qa` |
| `uatVariants()` | Returns `["uat", "uat1", "uat2", "uat3"]` |

### Common Endpoints (Per-Service)

Each library also provides optional HTTP endpoints for service-level promotion tracking:

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/can-promote` | Check eligibility for next environment |
| `POST` | `/promote` | Record a promotion event |
| `POST` | `/emergency-activate` | Emergency activation with dual approval |
| `GET` | `/history` | Promotion audit trail |
| `GET` | `/status` | Current promotion status |

---

## Emergency Activation

Emergency activation allows bypassing the promotion chain when a critical fix must reach a higher environment immediately (e.g., a production hotfix that cannot wait for the full promotion sequence).

### Requirements

1. **Dual Approval** — Two approvers (`approver1`, `approver2`) must be named in the request
2. **3 Distinct Participants** — The person initiating the request (`promotedBy`) plus both approvers must all be different people
3. **JIRA Ticket** — A valid JIRA ticket reference is mandatory for audit compliance
4. **Reason** — A written justification is required

### Validation

The admin-service enforces the 3-participant rule:

```java
Set<String> participants = Set.of(promotedBy, request.approver1(), request.approver2());
if (participants.size() < 3) {
    throw new IllegalArgumentException(
        "Emergency activation requires 3 distinct participants (promoter, approver1, approver2)");
}
```

Each per-service library applies the same validation independently:

```java
// Spring library — PromotionService.emergencyActivate()
if (promotedBy.equalsIgnoreCase(approver1)) {
    throw new IllegalArgumentException("approver1 must differ from promotedBy");
}
if (promotedBy.equalsIgnoreCase(approver2)) {
    throw new IllegalArgumentException("approver2 must differ from promotedBy");
}
if (approver1.equalsIgnoreCase(approver2)) {
    throw new IllegalArgumentException("approver1 and approver2 must be different people");
}
```

### Audit Trail

Emergency activations are recorded with full context:

| Field | Value |
|-------|-------|
| `promotion_type` | `"emergency"` |
| `approver1` | First approver's identity |
| `approver2` | Second approver's identity |
| `jira_ticket` | JIRA ticket reference |
| `reason` | Written justification |
| `promoted_by` | Person who initiated the request |

The changelog entry follows the format:

```
EMERGENCY: {reason} [JIRA: {jiraTicket}, approvers: {approver1}, {approver2}]
```

---

## UAT Variant Handling

QuckApp supports multiple parallel UAT environments (`uat1`, `uat2`, `uat3`) for concurrent testing streams. For promotion chain purposes, all variants normalize to `"uat"`.

### How It Works

```
                    ┌──────┐
              ┌────▶│ uat1 │────┐
              │     └──────┘    │
┌────┐        │     ┌──────┐   │     ┌─────────┐
│ qa │────────┼────▶│ uat2 │───┼────▶│ staging │
└────┘        │     └──────┘   │     └─────────┘
              │     ┌──────┐   │
              └────▶│ uat3 │───┘
                    └──────┘
        All normalize to "uat" for chain validation
```

| Variant | Normalized Form | Chain Position |
|---------|----------------|----------------|
| `uat` | `uat` | After `qa`, before `staging` |
| `uat1` | `uat` | After `qa`, before `staging` |
| `uat2` | `uat` | After `qa`, before `staging` |
| `uat3` | `uat` | After `qa`, before `staging` |

### Chain Constants

```java
// Spring/Java
private static final List<String> UAT_VARIANTS = List.of("uat", "uat1", "uat2", "uat3");
```

```python
# Python
UAT_VARIANTS: List[str] = ["uat", "uat1", "uat2", "uat3"]
```

```elixir
# Elixir
@uat_variants ["uat", "uat1", "uat2", "uat3"]
```

When checking `previousOf("uat2")`, the chain normalizes first and returns `"qa"`. Similarly, `nextOf("uat3")` normalizes and returns `"staging"`. This means a version active in *any* UAT variant satisfies the gate requirement for promotion to staging.
