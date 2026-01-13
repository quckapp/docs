---
sidebar_position: 4
---

# Maintenance & Support Guide

## 1. Routine Maintenance

### 1.1 Daily Tasks

| Task | Time | Owner |
|------|------|-------|
| Review monitoring dashboards | 9:00 AM | SRE |
| Check error rates | 9:00 AM | SRE |
| Review overnight alerts | 9:00 AM | SRE |
| Verify backup completion | 10:00 AM | DBA |

### 1.2 Weekly Tasks

| Task | Day | Owner |
|------|-----|-------|
| Security patch review | Monday | Security |
| Database optimization | Tuesday | DBA |
| Log analysis | Wednesday | SRE |
| Capacity review | Thursday | SRE |
| DR test (non-prod) | Friday | DevOps |

### 1.3 Monthly Tasks

| Task | Week | Owner |
|------|------|-------|
| Full DR drill | Week 1 | SRE Team |
| Access audit | Week 2 | Security |
| Certificate renewal check | Week 3 | SRE |
| Capacity planning | Week 4 | Engineering |

## 2. Troubleshooting Guide

### 2.1 Common Issues

#### High API Latency

**Symptoms:**
- API response time > 200ms
- Users report slowness

**Diagnosis:**
```bash
# Check service metrics
kubectl top pods -n quikapp-live

# Check database connections
mysql -e "SHOW PROCESSLIST"

# Check Redis
redis-cli info stats
```

**Resolution:**
1. Check database slow query log
2. Review recent deployments
3. Scale up pods if CPU > 70%
4. Clear Redis cache if memory > 80%

---

#### Message Delivery Delays

**Symptoms:**
- Messages taking > 1 second to deliver
- Users report "typing but not sending"

**Diagnosis:**
```bash
# Check Kafka lag
kafka-consumer-groups.sh --describe --group message-consumers

# Check WebSocket connections
curl localhost:8080/metrics | grep websocket

# Check Phoenix channels
curl localhost:4000/dashboard
```

**Resolution:**
1. Check Kafka broker health
2. Scale WebSocket pods
3. Check for network issues
4. Review Phoenix supervisor

---

#### Authentication Failures

**Symptoms:**
- Users cannot log in
- SSO redirects failing

**Diagnosis:**
```bash
# Check auth service logs
kubectl logs -l app=auth-service -n quikapp-live

# Check OAuth provider
curl -I https://login.microsoftonline.com

# Check certificates
openssl s_client -connect auth.quikapp.com:443
```

**Resolution:**
1. Verify IdP is reachable
2. Check certificate expiration
3. Review recent auth config changes
4. Clear auth cache

---

#### Database Connection Errors

**Symptoms:**
- "Connection refused" errors
- Services failing to start

**Diagnosis:**
```bash
# Check RDS status
aws rds describe-db-instances --db-instance-identifier quikapp-live

# Check connection count
mysql -e "SHOW STATUS LIKE 'Threads_connected'"

# Check pool usage
curl localhost:8080/actuator/health
```

**Resolution:**
1. Check RDS instance status
2. Increase connection pool if exhausted
3. Check security group rules
4. Review slow queries blocking connections

### 2.2 Escalation Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Escalation Matrix                                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Level 1: On-call Engineer (0-15 min)                                       │
│  ├── Initial triage                                                         │
│  ├── Basic troubleshooting                                                  │
│  └── Page Level 2 if unresolved                                            │
│                                                                              │
│  Level 2: Senior Engineer (15-30 min)                                       │
│  ├── Deep technical investigation                                           │
│  ├── Implement fix or workaround                                           │
│  └── Escalate to Level 3 if needed                                         │
│                                                                              │
│  Level 3: Tech Lead / Manager (30-60 min)                                  │
│  ├── Architecture-level decisions                                           │
│  ├── Cross-team coordination                                                │
│  └── Stakeholder communication                                              │
│                                                                              │
│  Level 4: VP/CTO (> 60 min major incidents)                                │
│  ├── Executive decisions                                                    │
│  └── External communication                                                 │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Monitoring

### 3.1 Key Dashboards

| Dashboard | URL | Purpose |
|-----------|-----|---------|
| System Overview | grafana.quikapp.com/d/overview | High-level health |
| API Performance | grafana.quikapp.com/d/api | API metrics |
| Database | grafana.quikapp.com/d/database | DB performance |
| Kafka | grafana.quikapp.com/d/kafka | Message queue |

### 3.2 Alert Runbooks

#### Alert: High Error Rate

```yaml
alert: HighErrorRate
expr: rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m]) > 0.01
severity: critical

runbook:
  1. Check which endpoints are failing
  2. Review error logs for stack traces
  3. Check for recent deployments
  4. Check downstream dependencies
  5. If unresolved in 15 min, escalate
```

#### Alert: Pod CrashLoopBackOff

```yaml
alert: PodCrashLoopBackOff
expr: kube_pod_container_status_waiting_reason{reason="CrashLoopBackOff"} > 0
severity: high

runbook:
  1. kubectl describe pod <pod-name>
  2. kubectl logs <pod-name> --previous
  3. Check for resource limits
  4. Check for config/secret changes
  5. Rollback if recent deployment
```

## 4. Backup & Recovery

### 4.1 Backup Verification

```bash
# List backups
aws rds describe-db-snapshots --db-instance-identifier quikapp-live

# Verify backup integrity
./scripts/verify-backup.sh --date=$(date +%Y-%m-%d)

# Test restore (monthly)
./scripts/test-restore.sh --snapshot=latest --target=quikapp-restore-test
```

### 4.2 Recovery Procedures

#### Database Recovery

```bash
# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier quikapp-live-restored \
  --db-snapshot-identifier quikapp-live-snapshot-20240115

# Point-in-time recovery
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier quikapp-live \
  --target-db-instance-identifier quikapp-live-pitr \
  --restore-time 2024-01-15T10:00:00Z
```

#### File Recovery

```bash
# List S3 versions
aws s3api list-object-versions --bucket quikapp-media-live --prefix files/

# Restore specific version
aws s3api get-object \
  --bucket quikapp-media-live \
  --key files/abc123.pdf \
  --version-id "xyz789" \
  restored-file.pdf
```

## 5. Security Operations

### 5.1 Security Checklist

- [ ] Review access logs weekly
- [ ] Rotate secrets monthly
- [ ] Update dependencies weekly
- [ ] Run vulnerability scan daily
- [ ] Review IAM permissions quarterly

### 5.2 Incident Response

```
Detection → Containment → Investigation → Recovery → Lessons Learned
```

## 6. Contacts

| Role | Contact |
|------|---------|
| On-call Engineer | oncall@quikapp.com |
| SRE Team | sre@quikapp.com |
| Security Team | security@quikapp.com |
| DBA | dba@quikapp.com |

## Related Documentation

- [Deployment Guide](./deployment-guide)
- [DevOps Overview](../devops/overview)
- [Architecture Security](../architecture/security)
