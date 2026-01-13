---
sidebar_position: 5
---

# Pipeline Monitoring

Comprehensive monitoring and alerting for CI/CD pipelines across GitHub Actions and Azure DevOps.

## Monitoring Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CI/CD Monitoring Architecture                         │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌───────────────────┐        ┌───────────────────┐                        │
│  │   GitHub Actions  │        │   Azure DevOps    │                        │
│  │                   │        │                   │                        │
│  │  • Build metrics  │        │  • Deploy metrics │                        │
│  │  • Test results   │        │  • Approval times │                        │
│  │  • Security scans │        │  • Stage duration │                        │
│  └─────────┬─────────┘        └─────────┬─────────┘                        │
│            │                            │                                   │
│            └────────────┬───────────────┘                                   │
│                         ▼                                                   │
│            ┌─────────────────────────┐                                     │
│            │    Azure Monitor        │                                     │
│            │    (Central Hub)        │                                     │
│            └───────────┬─────────────┘                                     │
│                        │                                                    │
│         ┌──────────────┼──────────────┐                                    │
│         ▼              ▼              ▼                                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐                          │
│  │  Grafana    │ │  PagerDuty  │ │   Slack     │                          │
│  │ Dashboards  │ │  Alerting   │ │  Notifs     │                          │
│  └─────────────┘ └─────────────┘ └─────────────┘                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Metrics

### CI Metrics (GitHub Actions)

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| `ci_build_duration_seconds` | Time to build | < 5 min | > 10 min |
| `ci_test_duration_seconds` | Time to run tests | < 10 min | > 20 min |
| `ci_test_pass_rate` | Percentage of passing tests | > 99% | < 95% |
| `ci_test_coverage_percent` | Code coverage | > 80% | < 70% |
| `ci_security_vulnerabilities` | Critical/High vulns found | 0 | > 0 |
| `ci_build_success_rate` | Build success percentage | > 95% | < 90% |
| `ci_queue_time_seconds` | Time waiting in queue | < 30s | > 2 min |

### CD Metrics (Azure DevOps)

| Metric | Description | Target | Alert Threshold |
|--------|-------------|--------|-----------------|
| `cd_deployment_duration_seconds` | Time to deploy | < 10 min | > 30 min |
| `cd_deployment_success_rate` | Successful deployments | > 99% | < 95% |
| `cd_rollback_count` | Number of rollbacks | 0 | > 0 |
| `cd_approval_wait_time_hours` | Time waiting for approval | < 4h | > 24h |
| `cd_lead_time_hours` | Commit to production | < 24h | > 72h |
| `cd_deployment_frequency` | Deploys per day | > 5 | < 1 |
| `cd_mttr_minutes` | Mean time to recovery | < 30 min | > 60 min |

## Dashboards

### GitHub Actions Dashboard

```json
{
  "dashboard": {
    "title": "QuikApp CI - GitHub Actions",
    "panels": [
      {
        "title": "Build Success Rate (24h)",
        "type": "gauge",
        "targets": [
          {
            "expr": "sum(github_actions_workflow_run_success) / sum(github_actions_workflow_run_total) * 100"
          }
        ],
        "thresholds": {
          "mode": "absolute",
          "steps": [
            {"color": "red", "value": 0},
            {"color": "yellow", "value": 90},
            {"color": "green", "value": 95}
          ]
        }
      },
      {
        "title": "Build Duration by Service",
        "type": "timeseries",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, github_actions_job_duration_seconds_bucket{workflow='CI'})",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Test Coverage Trend",
        "type": "timeseries",
        "targets": [
          {
            "expr": "codecov_coverage_percent{branch='main'}",
            "legendFormat": "{{service}}"
          }
        ]
      },
      {
        "title": "Security Vulnerabilities",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(security_scan_vulnerabilities{severity=~'critical|high'})"
          }
        ],
        "thresholds": {
          "steps": [
            {"color": "green", "value": 0},
            {"color": "red", "value": 1}
          ]
        }
      },
      {
        "title": "Failed Builds (Last 24h)",
        "type": "table",
        "targets": [
          {
            "expr": "github_actions_workflow_run_failed{time_range='24h'}",
            "format": "table"
          }
        ]
      }
    ]
  }
}
```

### Azure DevOps CD Dashboard

```json
{
  "dashboard": {
    "title": "QuikApp CD - Azure DevOps",
    "panels": [
      {
        "title": "Deployment Pipeline",
        "type": "nodeGraph",
        "description": "Environment progression with success rates",
        "targets": [
          {
            "expr": "azure_devops_stage_success_rate"
          }
        ]
      },
      {
        "title": "Deployments by Environment (7d)",
        "type": "barchart",
        "targets": [
          {
            "expr": "sum by (environment) (azure_devops_deployments_total{time_range='7d'})"
          }
        ]
      },
      {
        "title": "Lead Time (Commit to Prod)",
        "type": "timeseries",
        "targets": [
          {
            "expr": "azure_devops_lead_time_hours{environment='production'}"
          }
        ]
      },
      {
        "title": "Pending Approvals",
        "type": "table",
        "targets": [
          {
            "expr": "azure_devops_pending_approvals"
          }
        ]
      },
      {
        "title": "Rollbacks (30d)",
        "type": "stat",
        "targets": [
          {
            "expr": "sum(azure_devops_rollbacks_total{time_range='30d'})"
          }
        ]
      },
      {
        "title": "Environment Health",
        "type": "statusHistory",
        "targets": [
          {
            "expr": "environment_health_status"
          }
        ]
      }
    ]
  }
}
```

### DORA Metrics Dashboard

```json
{
  "dashboard": {
    "title": "QuikApp DORA Metrics",
    "panels": [
      {
        "title": "Deployment Frequency",
        "type": "stat",
        "description": "How often we deploy to production",
        "targets": [
          {
            "expr": "count(azure_devops_deployments_total{environment='production',time_range='7d'}) / 7"
          }
        ],
        "unit": "deploys/day"
      },
      {
        "title": "Lead Time for Changes",
        "type": "stat",
        "description": "Time from commit to production",
        "targets": [
          {
            "expr": "avg(azure_devops_lead_time_hours)"
          }
        ],
        "unit": "hours"
      },
      {
        "title": "Change Failure Rate",
        "type": "gauge",
        "description": "Percentage of deployments causing failures",
        "targets": [
          {
            "expr": "(sum(azure_devops_rollbacks_total) / sum(azure_devops_deployments_total)) * 100"
          }
        ],
        "thresholds": {
          "steps": [
            {"color": "green", "value": 0},
            {"color": "yellow", "value": 5},
            {"color": "red", "value": 15}
          ]
        }
      },
      {
        "title": "Mean Time to Recovery",
        "type": "stat",
        "description": "Average time to recover from failures",
        "targets": [
          {
            "expr": "avg(azure_devops_mttr_minutes)"
          }
        ],
        "unit": "minutes"
      }
    ]
  }
}
```

## Alerting

### PagerDuty Integration

```yaml
# alertmanager/config.yml
global:
  pagerduty_url: 'https://events.pagerduty.com/v2/enqueue'

route:
  receiver: 'default'
  group_by: ['alertname', 'service', 'environment']
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - match:
        severity: critical
      receiver: 'pagerduty-critical'
    - match:
        severity: warning
      receiver: 'slack-warnings'

receivers:
  - name: 'pagerduty-critical'
    pagerduty_configs:
      - service_key: '<PAGERDUTY_SERVICE_KEY>'
        severity: critical
        description: '{{ .GroupLabels.alertname }}: {{ .Annotations.summary }}'
        details:
          environment: '{{ .GroupLabels.environment }}'
          service: '{{ .GroupLabels.service }}'
          runbook: '{{ .Annotations.runbook_url }}'

  - name: 'slack-warnings'
    slack_configs:
      - api_url: '<SLACK_WEBHOOK_URL>'
        channel: '#cicd-alerts'
        title: '{{ .GroupLabels.alertname }}'
        text: '{{ .Annotations.description }}'
        color: '{{ if eq .Status "firing" }}warning{{ else }}good{{ end }}'
```

### Alert Rules

```yaml
# prometheus/alerts/cicd.yml
groups:
  - name: ci-alerts
    rules:
      - alert: CIBuildFailure
        expr: github_actions_workflow_run_failed > 0
        for: 0m
        labels:
          severity: warning
        annotations:
          summary: "CI build failed for {{ $labels.service }}"
          description: "Build {{ $labels.run_id }} failed in {{ $labels.workflow }}"
          runbook_url: "https://wiki.quikapp.dev/runbooks/ci-build-failure"

      - alert: CIBuildDurationHigh
        expr: github_actions_job_duration_seconds > 600
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "CI build taking too long for {{ $labels.service }}"
          description: "Build duration is {{ $value }}s (threshold: 600s)"

      - alert: SecurityVulnerabilityCritical
        expr: security_scan_vulnerabilities{severity="critical"} > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Critical security vulnerability found in {{ $labels.service }}"
          description: "{{ $value }} critical vulnerabilities detected"
          runbook_url: "https://wiki.quikapp.dev/runbooks/security-vulnerability"

      - alert: TestCoverageLow
        expr: codecov_coverage_percent < 70
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Test coverage dropped below 70% for {{ $labels.service }}"
          description: "Current coverage: {{ $value }}%"

  - name: cd-alerts
    rules:
      - alert: DeploymentFailed
        expr: azure_devops_deployment_failed > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Deployment failed for {{ $labels.service }} to {{ $labels.environment }}"
          description: "Deployment {{ $labels.release_id }} failed"
          runbook_url: "https://wiki.quikapp.dev/runbooks/deployment-failure"

      - alert: RollbackTriggered
        expr: increase(azure_devops_rollbacks_total[1h]) > 0
        for: 0m
        labels:
          severity: critical
        annotations:
          summary: "Rollback triggered for {{ $labels.service }} in {{ $labels.environment }}"
          description: "Automatic rollback was triggered due to health check failures"
          runbook_url: "https://wiki.quikapp.dev/runbooks/rollback"

      - alert: ApprovalPending
        expr: azure_devops_pending_approval_hours > 24
        for: 1h
        labels:
          severity: warning
        annotations:
          summary: "Approval pending for {{ $labels.environment }} > 24 hours"
          description: "Release {{ $labels.release_id }} has been waiting {{ $value }}h for approval"

      - alert: ProductionDeploymentStuck
        expr: azure_devops_deployment_duration_seconds{environment="production"} > 1800
        for: 5m
        labels:
          severity: critical
        annotations:
          summary: "Production deployment stuck for {{ $labels.service }}"
          description: "Deployment has been running for {{ $value }}s"

      - alert: HighChangeFailureRate
        expr: (sum(azure_devops_rollbacks_total) / sum(azure_devops_deployments_total)) > 0.15
        for: 1d
        labels:
          severity: warning
        annotations:
          summary: "High change failure rate detected"
          description: "Change failure rate is {{ $value | humanizePercentage }}"
```

### Slack Notifications

```yaml
# GitHub Actions notification step
- name: Notify Slack on Failure
  if: failure()
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "channel": "#cicd-alerts",
        "attachments": [
          {
            "color": "danger",
            "blocks": [
              {
                "type": "section",
                "text": {
                  "type": "mrkdwn",
                  "text": ":x: *CI Build Failed*\n*Service:* ${{ matrix.service }}\n*Branch:* ${{ github.ref_name }}\n*Commit:* ${{ github.sha }}"
                }
              },
              {
                "type": "actions",
                "elements": [
                  {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "View Logs"},
                    "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
                  }
                ]
              }
            ]
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

## Log Aggregation

### Azure Log Analytics Queries

```kusto
// Failed deployments in last 24 hours
AzureDevOpsDeployments
| where TimeGenerated > ago(24h)
| where Status == "Failed"
| project TimeGenerated, Service, Environment, ReleaseId, ErrorMessage
| order by TimeGenerated desc

// Average deployment duration by environment
AzureDevOpsDeployments
| where TimeGenerated > ago(7d)
| where Status == "Succeeded"
| summarize AvgDuration = avg(DurationMinutes) by Environment
| order by AvgDuration desc

// Lead time trend
AzureDevOpsDeployments
| where TimeGenerated > ago(30d)
| where Environment == "production"
| summarize LeadTimeHours = avg(LeadTimeHours) by bin(TimeGenerated, 1d)
| render timechart

// Approval bottlenecks
AzureDevOpsApprovals
| where TimeGenerated > ago(7d)
| summarize WaitTimeHours = avg(WaitTimeHours) by Approver, Environment
| order by WaitTimeHours desc
```

### GitHub Actions Log Queries

```kusto
// Build failures by service
GitHubActionsRuns
| where TimeGenerated > ago(7d)
| where Conclusion == "failure"
| summarize FailureCount = count() by Service
| order by FailureCount desc

// Test duration trends
GitHubActionsJobs
| where TimeGenerated > ago(30d)
| where JobName contains "test"
| summarize P95Duration = percentile(DurationSeconds, 95) by bin(TimeGenerated, 1d), Service
| render timechart

// Security scan results
GitHubActionsSecurityScans
| where TimeGenerated > ago(7d)
| summarize
    Critical = sum(CriticalCount),
    High = sum(HighCount),
    Medium = sum(MediumCount)
  by Service
| order by Critical desc, High desc
```

## Reporting

### Weekly CI/CD Report (Automated)

```python
# scripts/generate_cicd_report.py
import requests
from datetime import datetime, timedelta

def generate_weekly_report():
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)

    report = {
        "period": f"{start_date.date()} to {end_date.date()}",
        "ci_metrics": get_ci_metrics(start_date, end_date),
        "cd_metrics": get_cd_metrics(start_date, end_date),
        "dora_metrics": calculate_dora_metrics(start_date, end_date),
        "incidents": get_incidents(start_date, end_date),
        "recommendations": generate_recommendations()
    }

    return report

def get_ci_metrics(start, end):
    return {
        "total_builds": query_prometheus("sum(github_actions_workflow_run_total)"),
        "success_rate": query_prometheus("sum(github_actions_workflow_run_success) / sum(github_actions_workflow_run_total) * 100"),
        "avg_build_duration": query_prometheus("avg(github_actions_job_duration_seconds)"),
        "security_issues": query_prometheus("sum(security_scan_vulnerabilities{severity=~'critical|high'})")
    }

def calculate_dora_metrics(start, end):
    return {
        "deployment_frequency": "5.2 deploys/day",
        "lead_time": "4.5 hours",
        "change_failure_rate": "2.1%",
        "mttr": "18 minutes"
    }
```

### Report Template

```markdown
# QuikApp CI/CD Weekly Report
**Period:** {{ period }}

## Summary
- **Total Builds:** {{ ci_metrics.total_builds }}
- **Build Success Rate:** {{ ci_metrics.success_rate }}%
- **Total Deployments:** {{ cd_metrics.total_deployments }}
- **Deployment Success Rate:** {{ cd_metrics.success_rate }}%

## DORA Metrics
| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Deployment Frequency | {{ dora.deployment_frequency }} | > 5/day | ✅ |
| Lead Time | {{ dora.lead_time }} | < 24h | ✅ |
| Change Failure Rate | {{ dora.change_failure_rate }} | < 5% | ✅ |
| MTTR | {{ dora.mttr }} | < 30m | ✅ |

## Incidents
{{ #each incidents }}
- **{{ this.severity }}**: {{ this.description }} ({{ this.status }})
{{ /each }}

## Recommendations
{{ #each recommendations }}
- {{ this }}
{{ /each }}
```
