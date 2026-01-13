---
sidebar_position: 4
---

# Bug Reports & Defect Management

## 1. Bug Report Guidelines

### 1.1 Bug Report Template

```markdown
## Bug Summary
[One-line description of the issue]

## Environment
- **Environment:** Dev / QA / UAT / Staging / Production
- **Service:** [Service name]
- **Version:** [Version number]
- **Browser/Device:** [If applicable]
- **OS:** [Operating system]

## Severity
- [ ] Critical - System down, data loss
- [ ] High - Major feature broken
- [ ] Medium - Feature impaired
- [ ] Low - Minor issue

## Priority
- [ ] P1 - Fix immediately
- [ ] P2 - Fix in current sprint
- [ ] P3 - Fix in next sprint
- [ ] P4 - Fix when convenient

## Steps to Reproduce
1. [Step 1]
2. [Step 2]
3. [Step 3]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Screenshots/Logs
[Attach relevant screenshots or log snippets]

## Additional Context
[Any other relevant information]
```

### 1.2 Example Bug Reports

#### Critical Bug Example

```markdown
## Bug Summary
Messages not delivered to any users in #engineering channel

## Environment
- **Environment:** Production
- **Service:** message-service
- **Version:** v2.3.1
- **Affected Users:** 500+

## Severity
- [x] Critical - System down, data loss

## Priority
- [x] P1 - Fix immediately

## Steps to Reproduce
1. Open #engineering channel
2. Send any message
3. Message appears for sender
4. Other users never receive the message

## Expected Behavior
Messages should be delivered to all channel members within 100ms.

## Actual Behavior
Messages are not delivered to any recipients. Sender sees their
message but no one else receives it.

## Screenshots/Logs
```
ERROR 2024-01-15 10:30:15 [message-service] KafkaProducerError:
  Topic 'message.sent' unreachable
  Broker: kafka-prod-1:9092
  Error: Connection refused
```

## Additional Context
- Started at 10:25 UTC
- Kafka broker kafka-prod-1 appears to be down
- Other channels may be affected
```

#### High Bug Example

```markdown
## Bug Summary
Search results not showing messages older than 7 days

## Environment
- **Environment:** QA
- **Service:** search-service
- **Version:** v1.8.0

## Severity
- [x] High - Major feature broken

## Priority
- [x] P2 - Fix in current sprint

## Steps to Reproduce
1. Send a message today with keyword "quarterly"
2. Wait or search for "quarterly" - message found
3. Search for "annual report" (message from 10 days ago)
4. No results returned, but message exists

## Expected Behavior
Search should return all messages matching query regardless of age.

## Actual Behavior
Only messages from the last 7 days are returned in search results.

## Screenshots/Logs
Search query: "annual report"
Results: 0 messages
Elasticsearch query shows index only has 7 days of data.

## Additional Context
Likely related to index retention policy change in v1.8.0
```

## 2. Severity Definitions

### 2.1 Severity Levels

| Severity | Definition | Examples | Response |
|----------|------------|----------|----------|
| **Critical** | System unusable, data loss risk | Service down, security breach | Immediate |
| **High** | Major feature completely broken | Cannot send messages, login fails | 4 hours |
| **Medium** | Feature works but impaired | Slow search, UI glitch | 24 hours |
| **Low** | Minor inconvenience | Typo, cosmetic issue | 1 week |

### 2.2 Severity Matrix

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Severity Assessment Matrix                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│              │  Many Users     │  Some Users     │  Few Users     │         │
│  ────────────┼─────────────────┼─────────────────┼────────────────┤         │
│  Core Feature│  Critical       │  High           │  High          │         │
│  ────────────┼─────────────────┼─────────────────┼────────────────┤         │
│  Secondary   │  High           │  Medium         │  Medium        │         │
│  ────────────┼─────────────────┼─────────────────┼────────────────┤         │
│  Nice-to-have│  Medium         │  Low            │  Low           │         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 3. Bug Lifecycle

### 3.1 Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Bug Lifecycle                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────┐     ┌─────────┐     ┌─────────┐     ┌─────────┐              │
│  │   New   │────▶│ Triaged │────▶│Assigned │────▶│In Progress│              │
│  └─────────┘     └─────────┘     └─────────┘     └─────────┘              │
│       │               │               │               │                     │
│       │               │               │               │                     │
│       │               ▼               ▼               ▼                     │
│       │          ┌─────────┐     ┌─────────┐    ┌─────────┐               │
│       │          │Duplicate│     │Won't Fix│    │In Review│               │
│       │          └─────────┘     └─────────┘    └─────────┘               │
│       │                                              │                     │
│       │                                              ▼                     │
│       │                                         ┌─────────┐               │
│       │                                         │ Testing │               │
│       │                                         └─────────┘               │
│       │                                              │                     │
│       │                    ┌─────────────────────────┼──────────┐         │
│       │                    │                         │          │         │
│       │                    ▼                         ▼          ▼         │
│       │               ┌─────────┐              ┌─────────┐ ┌─────────┐   │
│       └──────────────▶│Reopened │              │Verified │ │  Closed │   │
│                       └─────────┘              └─────────┘ └─────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Status Definitions

| Status | Description | Owner |
|--------|-------------|-------|
| **New** | Bug reported, not reviewed | Reporter |
| **Triaged** | Reviewed, severity/priority set | QA Lead |
| **Assigned** | Developer assigned | QA Lead |
| **In Progress** | Developer working on fix | Developer |
| **In Review** | Code review in progress | Developer |
| **Testing** | Fix deployed to QA | QA Engineer |
| **Verified** | Fix confirmed working | QA Engineer |
| **Closed** | Bug resolved | QA Engineer |
| **Reopened** | Bug reoccurred | Anyone |
| **Won't Fix** | Decision not to fix | Product Owner |
| **Duplicate** | Same as existing bug | QA Lead |

## 4. Bug Triage

### 4.1 Triage Process

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Bug Triage Process                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. Review bug report                                                       │
│     ├── Is report complete?                                                 │
│     ├── Can issue be reproduced?                                           │
│     └── Is it a duplicate?                                                  │
│                                                                              │
│  2. Assess severity                                                         │
│     ├── How many users affected?                                           │
│     ├── Which feature is impacted?                                         │
│     └── Is there a workaround?                                             │
│                                                                              │
│  3. Set priority                                                            │
│     ├── Business impact                                                     │
│     ├── Technical complexity                                                │
│     └── Available resources                                                 │
│                                                                              │
│  4. Assign to developer                                                     │
│     ├── Based on expertise                                                  │
│     ├── Based on availability                                               │
│     └── Based on service ownership                                          │
│                                                                              │
│  5. Add to sprint (if P1/P2)                                               │
│     └── Or add to backlog (P3/P4)                                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Triage Meeting

| Aspect | Detail |
|--------|--------|
| **Frequency** | Daily (15 min) |
| **Attendees** | QA Lead, Tech Lead, Product Owner |
| **Agenda** | Review new bugs, assign priorities |
| **Output** | Updated bug statuses |

## 5. SLA & Response Times

### 5.1 Response Time SLA

| Severity | First Response | Resolution Target |
|----------|---------------|-------------------|
| Critical | 15 minutes | 4 hours |
| High | 1 hour | 24 hours |
| Medium | 4 hours | 1 week |
| Low | 24 hours | 1 month |

### 5.2 Escalation Path

```
Developer (1 hour) → Tech Lead (2 hours) → Engineering Manager (4 hours) → CTO
```

## 6. Metrics & Reporting

### 6.1 Bug Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| **Open Bugs** | Total open bugs | < 50 |
| **Bug Density** | Bugs per KLOC | < 1 |
| **Escape Rate** | Bugs found in prod | < 5% |
| **Fix Rate** | Bugs fixed per sprint | > 90% |
| **Reopen Rate** | Bugs reopened | < 5% |
| **MTTR** | Mean time to resolve | < 48h |

### 6.2 Weekly Bug Report

```markdown
## Bug Report - Week of [Date]

### Summary
- New bugs: XX
- Resolved: XX
- Open bugs: XX

### By Severity
| Severity | Open | Resolved |
|----------|------|----------|
| Critical | X | X |
| High | X | X |
| Medium | X | X |
| Low | X | X |

### Top Issues
1. [Bug title] - [Status]
2. [Bug title] - [Status]

### Action Items
- [ ] [Action item]
```

## Related Documentation

- [Test Plan](./test-plan) - Testing strategy
- [Test Cases](./test-cases) - Test procedures
- [DevOps CI/CD](../devops/cicd/github-actions) - Pipeline configuration
