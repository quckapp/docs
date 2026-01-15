# Environment Promotion Guide

This guide describes the process for promoting code between environments.

## Promotion Workflow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        Promotion Pipeline                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  1. DEV                                                                 │
│     │  ✓ Unit tests pass                                               │
│     │  ✓ Integration tests pass                                        │
│     │  ✓ Code review approved                                          │
│     ▼                                                                   │
│  2. QA                                                                  │
│     │  ✓ Automated E2E tests pass                                      │
│     │  ✓ Manual QA testing complete                                    │
│     │  ✓ No critical/high bugs                                         │
│     ▼                                                                   │
│  3. UAT (1, 2, or 3)                                                   │
│     │  ✓ User acceptance testing                                       │
│     │  ✓ Stakeholder sign-off                                          │
│     │  ✓ Performance baseline met                                      │
│     ▼                                                                   │
│  4. STAGING                                                             │
│     │  ✓ Load testing complete                                         │
│     │  ✓ Security scan passed                                          │
│     │  ✓ Release notes prepared                                        │
│     │  ✓ Rollback plan documented                                      │
│     ▼                                                                   │
│  5. LIVE                                                                │
│     ✓ Change Advisory Board approval                                   │
│     ✓ Maintenance window scheduled                                     │
│     ✓ Monitoring verified                                              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

## Using GitHub Actions

### Promote via Workflow

1. Go to **Actions** → **Promote Between Environments**
2. Click **Run workflow**
3. Select source and target environments
4. Optionally specify image tag
5. Click **Run workflow**

### Valid Promotion Paths

| Source | Valid Targets |
|--------|---------------|
| dev | qa |
| qa | uat1, uat2, uat3 |
| uat1 | staging |
| uat2 | staging |
| uat3 | staging |
| staging | live |

### Blocked Paths

- Cannot skip environments (e.g., dev → staging)
- Cannot promote backward (e.g., qa → dev)
- Cannot promote directly to live (except from staging)

## Manual Promotion

### 1. Verify Source Environment

```bash
# Check current deployment in source
kubectl get pods -n quckapp-<source>
kubectl get deployment -n quckapp-<source> -o jsonpath='{.items[*].spec.template.spec.containers[*].image}'
```

### 2. Tag Image for Target

```bash
# Get source image tag
SOURCE_TAG=$(kubectl get deployment/<source>-quckapp-api -n quckapp-<source> \
  -o jsonpath='{.spec.template.spec.containers[0].image}' | cut -d: -f2)

# Re-tag for target
aws ecr get-login-password | docker login --username AWS --password-stdin $ECR_REGISTRY

docker pull $ECR_REGISTRY/quckapp/api:$SOURCE_TAG
docker tag $ECR_REGISTRY/quckapp/api:$SOURCE_TAG $ECR_REGISTRY/quckapp/api:<target>-$SOURCE_TAG
docker push $ECR_REGISTRY/quckapp/api:<target>-$SOURCE_TAG
```

### 3. Deploy to Target

```bash
# Update kustomization
cd k8s/overlays/<target>
kustomize edit set image quckapp/api=$ECR_REGISTRY/quckapp/api:<target>-$SOURCE_TAG

# Apply
kubectl apply -k .

# Verify
kubectl rollout status deployment/<target>-quckapp-api -n quckapp-<target>
```

## Promotion Checklist

### Dev → QA

- [ ] All unit tests passing
- [ ] All integration tests passing
- [ ] Code review approved and merged
- [ ] No linting errors
- [ ] Security scan passed
- [ ] Database migrations tested

### QA → UAT

- [ ] QA team sign-off
- [ ] All E2E tests passing
- [ ] No open critical bugs
- [ ] No open high-priority bugs
- [ ] Performance acceptable
- [ ] Test data prepared for UAT

### UAT → Staging

- [ ] UAT sign-off from stakeholders
- [ ] All acceptance criteria met
- [ ] Release notes drafted
- [ ] Documentation updated
- [ ] Runbook reviewed
- [ ] Rollback plan documented

### Staging → Live

- [ ] **Change Advisory Board (CAB) approval**
- [ ] Load testing completed successfully
- [ ] Security scan passed (no critical findings)
- [ ] Staging verified for 24+ hours
- [ ] Maintenance window scheduled
- [ ] Communication sent to stakeholders
- [ ] On-call team notified
- [ ] Monitoring dashboards ready
- [ ] Rollback verified in staging

## Rollback Procedure

### Quick Rollback

```bash
# Rollback to previous version
kubectl rollout undo deployment/<env>-quckapp-api -n quckapp-<env>

# Verify
kubectl rollout status deployment/<env>-quckapp-api -n quckapp-<env>
```

### Rollback to Specific Version

```bash
# List revision history
kubectl rollout history deployment/<env>-quckapp-api -n quckapp-<env>

# Rollback to specific revision
kubectl rollout undo deployment/<env>-quckapp-api -n quckapp-<env> --to-revision=<N>
```

### Database Rollback

If migrations were applied:

```bash
# Run migration rollback
npm run db:migrate:rollback

# Or restore from backup (RDS)
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier quckapp-<env>-restored \
  --db-snapshot-identifier <snapshot-id>
```

## Emergency Procedures

### Production Incident

1. **Assess impact** - Determine user impact
2. **Communicate** - Notify stakeholders
3. **Rollback if needed** - Use quick rollback
4. **Investigate** - Root cause analysis
5. **Fix forward** - Deploy hotfix if rollback insufficient
6. **Post-mortem** - Document lessons learned

### Emergency Hotfix to Live

```bash
# Create hotfix branch
git checkout -b hotfix/critical-fix main

# Make fix, commit, push
git commit -m "Hotfix: Critical security fix"
git push origin hotfix/critical-fix

# Fast-track promotion (requires CAB emergency approval)
# 1. Deploy to staging
# 2. Quick verification (30 min)
# 3. Deploy to live

# Merge back to develop
git checkout develop
git merge hotfix/critical-fix
```

## Best Practices

1. **Always promote forward** - Never skip environments
2. **Use immutable tags** - Tag images with SHA or semantic version
3. **Test in staging** - Full testing before live
4. **Monitor after deploy** - Watch metrics for 30+ minutes
5. **Document everything** - Keep deployment logs
6. **Have a rollback plan** - Know how to rollback before deploying
