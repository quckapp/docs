---
sidebar_position: 3
---

# Test Cases & Scenarios

## 1. Authentication Test Cases

### TC-AUTH-001: User Login with Email/Password

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Functional |
| **Automated** | Yes |

**Preconditions:**
- User account exists
- User is not logged in

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to login page | Login form displayed |
| 2 | Enter valid email | Email accepted |
| 3 | Enter valid password | Password masked |
| 4 | Click "Sign In" | Loading indicator shown |
| 5 | Wait for response | Redirected to workspace |

**Postconditions:**
- User is authenticated
- JWT token stored
- Session created

---

### TC-AUTH-002: SSO Login (Okta)

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Functional |
| **Automated** | Yes |

**Preconditions:**
- SSO configured for workspace
- User has Okta account

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to workspace login | SSO button displayed |
| 2 | Click "Sign in with Okta" | Redirected to Okta |
| 3 | Enter Okta credentials | Authenticated by Okta |
| 4 | Authorize QuckApp | Redirected back |
| 5 | Complete login | Access granted |

---

### TC-AUTH-003: Invalid Credentials

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Negative |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter invalid email | Form validates |
| 2 | Enter wrong password | Error message shown |
| 3 | Try 5 times | Account temporarily locked |

---

## 2. Messaging Test Cases

### TC-MSG-001: Send Text Message

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Functional |
| **Automated** | Yes |

**Preconditions:**
- User is authenticated
- User is in a channel

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click message input | Input focused, cursor visible |
| 2 | Type "Hello World" | Text appears in input |
| 3 | Press Enter | Message sent |
| 4 | Observe message list | Message appears instantly |
| 5 | Check other user | Message received in < 100ms |

**Postconditions:**
- Message stored in database
- Message indexed for search
- Notifications sent

---

### TC-MSG-002: Send Message with Mention

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type "@" | User autocomplete shown |
| 2 | Type "joh" | Filtered to matching users |
| 3 | Select "John Smith" | Mention inserted |
| 4 | Complete message | Message contains mention |
| 5 | Send message | John receives notification |

---

### TC-MSG-003: Message with Code Block

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Type triple backticks | Code block created |
| 2 | Enter code | Code formatted |
| 3 | Send message | Code block rendered |
| 4 | Verify syntax highlighting | Highlighting applied |

---

### TC-MSG-004: Real-time Message Delivery

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Performance |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open channel on Device A | Channel visible |
| 2 | Open same channel on Device B | Channel visible |
| 3 | Send message from Device A | Start timer |
| 4 | Message appears on Device B | Stop timer |
| 5 | Verify latency | < 100ms (P99) |

---

## 3. Channel Test Cases

### TC-CHN-001: Create Public Channel

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Add Channel" | Modal opens |
| 2 | Enter channel name | Name validated |
| 3 | Select "Public" | Option selected |
| 4 | Click "Create" | Channel created |
| 5 | Verify in sidebar | Channel listed |

---

### TC-CHN-002: Create Private Channel

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click "Add Channel" | Modal opens |
| 2 | Select "Private" | Option selected |
| 3 | Add members | Members added |
| 4 | Create channel | Channel created |
| 5 | Verify visibility | Only members see channel |

---

## 4. File Sharing Test Cases

### TC-FILE-001: Upload File

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click attachment button | File picker opens |
| 2 | Select file (< 5GB) | File selected |
| 3 | Confirm upload | Upload starts |
| 4 | Wait for completion | Progress shown |
| 5 | Verify in message | File attached |

---

### TC-FILE-002: Download File

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Find message with file | File visible |
| 2 | Click download | Download starts |
| 3 | Wait for completion | File downloaded |
| 4 | Verify file | Matches original |

---

## 5. Search Test Cases

### TC-SRCH-001: Basic Text Search

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Press Cmd+K | Search modal opens |
| 2 | Type "project update" | Results appear |
| 3 | View results | Matches highlighted |
| 4 | Click result | Navigate to message |

---

### TC-SRCH-002: Filtered Search

| Field | Value |
|-------|-------|
| **Priority** | Medium |
| **Type** | Functional |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open search | Search modal opens |
| 2 | Type "from:@john" | Results from John |
| 3 | Add "in:#engineering" | Further filtered |
| 4 | Add "after:2024-01-01" | Date filtered |

---

## 6. Call Test Cases

### TC-CALL-001: Start 1:1 Audio Call

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Partial |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open DM with user | DM visible |
| 2 | Click call button | Call initiated |
| 3 | Recipient sees incoming | Ring notification |
| 4 | Recipient accepts | Call connected |
| 5 | Verify audio | Both hear each other |

---

### TC-CALL-002: Screen Sharing

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Functional |
| **Automated** | Partial |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | In active call | Call ongoing |
| 2 | Click share screen | Screen picker shown |
| 3 | Select screen/window | Sharing starts |
| 4 | Verify other sees | Screen visible |
| 5 | Stop sharing | Sharing stops |

---

## 7. Performance Test Cases

### TC-PERF-001: Message Throughput

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Performance |
| **Automated** | Yes |

**Test Configuration:**
- Users: 10,000 concurrent
- Duration: 30 minutes
- Message rate: 100/second/user

**Acceptance Criteria:**
- Throughput: > 100,000 msg/sec
- Latency P99: < 100ms
- Error rate: < 0.1%

---

### TC-PERF-002: API Response Time

| Field | Value |
|-------|-------|
| **Priority** | High |
| **Type** | Performance |
| **Automated** | Yes |

**Test Configuration:**
- Users: 1,000 concurrent
- Duration: 15 minutes
- Endpoints: All REST APIs

**Acceptance Criteria:**

| Endpoint | P95 Target |
|----------|------------|
| GET /messages | < 100ms |
| POST /messages | < 150ms |
| GET /channels | < 100ms |
| GET /search | < 500ms |

---

## 8. Security Test Cases

### TC-SEC-001: SQL Injection Prevention

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Security |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input: `' OR '1'='1` | Input sanitized |
| 2 | Input: `; DROP TABLE users;` | Input rejected |
| 3 | Verify database | No injection occurred |

---

### TC-SEC-002: XSS Prevention

| Field | Value |
|-------|-------|
| **Priority** | Critical |
| **Type** | Security |
| **Automated** | Yes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Input: `<script>alert('xss')</script>` | Script escaped |
| 2 | View rendered message | No script execution |
| 3 | Input: `<img onerror=alert('xss')>` | Event handler stripped |

---

## Test Case Template

```markdown
### TC-XXX-NNN: [Test Case Title]

| Field | Value |
|-------|-------|
| **Priority** | Critical/High/Medium/Low |
| **Type** | Functional/Performance/Security/Negative |
| **Automated** | Yes/No/Partial |

**Preconditions:**
- [Condition 1]
- [Condition 2]

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | [Action] | [Result] |
| 2 | [Action] | [Result] |

**Postconditions:**
- [Condition 1]
- [Condition 2]
```
