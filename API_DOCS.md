# Erenmax Backend — Full API & Database Documentation

> Base URL: `http://localhost:3000`
> All authenticated endpoints require: `Authorization: Bearer <JWT_TOKEN>`

---

## Table of Contents

1. [Database Schemas](#1-database-schemas)
2. [Auth APIs](#2-auth-apis)
3. [Users APIs](#3-users-apis)
4. [Goals APIs](#4-goals-apis)
5. [Applications APIs](#5-applications-apis)
6. [Sessions APIs](#6-sessions-apis)
7. [Partners API](#7-partners-api)
8. [Categories API](#8-categories-api)
9. [Points & Trust Score Logic](#9-points--trust-score-logic)
10. [Error Format](#10-error-format)

---

## 1. Database Schemas

### Collection: `users`

| Field               | Type     | Default          | Description                   |
| ------------------- | -------- | ---------------- | ----------------------------- |
| `_id`               | ObjectId | auto             | Primary key                   |
| `name`              | String   | required         | Display name                  |
| `email`             | String   | required, unique | Login email                   |
| `password`          | String   | required, hidden | bcrypt hashed (select: false) |
| `avatar`            | String   | null             | Profile image URL             |
| `bio`               | String   | null             | Short description             |
| `trustScore`        | Number   | 50               | 0–100 computed score          |
| `totalPoints`       | Number   | 100              | Spendable/earnable balance    |
| `showRate`          | Number   | 100              | % of sessions attended        |
| `sessionsCompleted` | Number   | 0                | Counter                       |
| `goalsPosted`       | Number   | 0                | Counter                       |
| `goalsHelped`       | Number   | 0                | Counter                       |
| `streak`            | Number   | 0                | Current daily streak (days)   |
| `longestStreak`     | Number   | 0                | Historic max streak           |
| `badges`            | String[] | []               | Earned badge labels           |
| `createdAt`         | Date     | auto             |                               |
| `updatedAt`         | Date     | auto             |                               |

---

### Collection: `goals`

| Field                    | Type             | Default       | Description                                                                              |
| ------------------------ | ---------------- | ------------- | ---------------------------------------------------------------------------------------- |
| `_id`                    | ObjectId         | auto          | Primary key                                                                              |
| `userId`                 | ObjectId → users | required      | Goal poster (owner)                                                                      |
| `title`                  | String           | required      | Short title                                                                              |
| `description`            | String           | required      | Full description                                                                         |
| `category`               | String (enum)    | required      | `dsa` \| `system-design` \| `behavioral` \| `fitness` \| `speaking` \| `other`           |
| `difficulty`             | String (enum)    | required      | `beginner` \| `intermediate` \| `advanced`                                               |
| `pledgedPoints`          | Number (min 10)  | required      | Points staked by goal owner, deducted on create                                          |
| `status`                 | String (enum)    | `open`        | `open` \| `matched` \| `in-progress` \| `completed` \| `cancelled`                       |
| `applicationsOpen`       | Boolean          | true          | Whether new applications are accepted                                                    |
| `maxApplicants`          | Number           | null          | Optional cap                                                                             |
| `defaultDurationMins`    | Number           | 45            | Default session duration (mins), copied onto new slots                                   |
| `defaultPlatform`        | String           | `Google Meet` | Default meeting platform, copied onto new slots                                          |
| `approvalDeadlineOffset` | String (enum)    | `6h`          | `2h` \| `6h` \| `12h` \| `24h` — how far before scheduledAt the approval deadline is set |
| `createdAt`              | Date             | auto          |                                                                                          |
| `updatedAt`              | Date             | auto          |                                                                                          |

> **Removed fields:** `topic`, `scheduledDate`, `duration`, `meetingLink` — these now live on each individual session slot.

**Indexes:** `{ status, category }`, full-text on `{ title, description }`

---

### Collection: `applications`

| Field          | Type                | Default   | Description                                               |
| -------------- | ------------------- | --------- | --------------------------------------------------------- |
| `_id`          | ObjectId            | auto      | Primary key                                               |
| `sessionId`    | ObjectId → sessions | required  | Which session slot this application is for                |
| `goalId`       | ObjectId → goals    | null      | Convenience denormalized ref (copied from session.goalId) |
| `applicantId`  | ObjectId → users    | required  | Who applied                                               |
| `message`      | String              | null      | Optional cover message                                    |
| `stakedPoints` | Number (min 0)      | required  | Points applicant stakes (deducted on apply)               |
| `status`       | String (enum)       | `pending` | `pending` \| `approved` \| `rejected` \| `withdrawn`      |
| `createdAt`    | Date                | auto      |                                                           |
| `updatedAt`    | Date                | auto      |                                                           |

**Unique index:** `{ sessionId, applicantId }` — one application per person per slot.

---

### Collection: `sessions`

| Field               | Type             | Default  | Description                                                                           |
| ------------------- | ---------------- | -------- | ------------------------------------------------------------------------------------- |
| `_id`               | ObjectId         | auto     | Primary key                                                                           |
| `goalId`            | ObjectId → goals | required | Associated goal                                                                       |
| `goalOwnerId`       | ObjectId → users | required | Goal poster                                                                           |
| `approvedHelperId`  | ObjectId → users | null     | Set when an application is approved (was `partnerId`)                                 |
| `partnerId`         | ObjectId → users | null     | Legacy field — kept for backward compat                                               |
| `approvedAt`        | Date             | null     | When a helper was approved                                                            |
| `scheduledAt`       | Date             | required | When session is scheduled                                                             |
| `duration`          | Number           | 45       | Minutes                                                                               |
| `meetingLink`       | String           | null     | Meeting URL                                                                           |
| `status`            | String (enum)    | `open`   | `open` → `pending_approval` → `approved` → `in_progress` → `completed` \| `cancelled` |
| `topic`             | String           | required | Specific topic for this slot                                                          |
| `sessionCategory`   | String           | required | Category for this slot                                                                |
| `notes`             | String           | null     | Session notes                                                                         |
| `goalOwnerRating`   | Number (1–5)     | null     | Rating given by owner                                                                 |
| `partnerRating`     | Number (1–5)     | null     | Rating given by helper                                                                |
| `goalOwnerFeedback` | String           | null     | Text feedback by owner                                                                |
| `partnerFeedback`   | String           | null     | Text feedback by helper                                                               |
| `goalOwnerShowedUp` | Boolean          | null     | Attendance flag                                                                       |
| `partnerShowedUp`   | Boolean          | null     | Attendance flag                                                                       |
| `completedAt`       | Date             | null     | When completed                                                                        |
| `approvalDeadline`  | Date             | null     | Deadline for helper to confirm (computed from goal.approvalDeadlineOffset)            |
| `createdAt`         | Date             | auto     |                                                                                       |
| `updatedAt`         | Date             | auto     |                                                                                       |

**New lifecycle:** `open → pending_approval → approved → in_progress → completed | cancelled`

---

### Collection: `trustscorelogs`

| Field          | Type                | Default  | Description                                                                            |
| -------------- | ------------------- | -------- | -------------------------------------------------------------------------------------- |
| `_id`          | ObjectId            | auto     | Primary key                                                                            |
| `userId`       | ObjectId → users    | required | Whose score changed                                                                    |
| `action`       | String (enum)       | required | `session_completed` \| `good_feedback` \| `streak_bonus` \| `no_show` \| `late_cancel` |
| `pointsChange` | Number              | required | Positive or negative                                                                   |
| `description`  | String              | required | Human-readable reason                                                                  |
| `sessionId`    | ObjectId → sessions | null     | Related session if any                                                                 |
| `createdAt`    | Date                | auto     |                                                                                        |

---

## 2. Auth APIs

### `POST /api/auth/register`

Creates a new user. New users start with **100 points** and **trustScore 50**.

**Auth required:** No

**Request body:**

```json
{
  "name": "John Doe", // required, string
  "email": "john@example.com", // required, unique
  "password": "password123" // required, min 8 chars
}
```

**DB operations:**

1. Checks if email already exists in `users` → throws 409 if yes
2. bcrypt hashes the password (rounds: 10)
3. Creates user doc with defaults (100 points, trustScore 50, showRate 100)
4. Signs JWT with `{ userId, email }`

**Response 201:**

```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "trustScore": 50,
    "totalPoints": 100,
    "createdAt": "2026-03-19T00:00:00Z"
  },
  "token": "<JWT>"
}
```

**Errors:** `400` validation | `409` email exists

---

### `POST /api/auth/login`

**Auth required:** No

**Request body:**

```json
{
  "email": "john@example.com",
  "password": "password123"
}
```

**DB operations:**

1. Finds user by email (with `password` field explicitly selected)
2. bcrypt.compare(plain, hashed) → 401 if mismatch
3. Signs and returns JWT

**Response 200:**

```json
{
  "user": {
    "id": "uuid",
    "name": "John Doe",
    "email": "john@example.com",
    "avatar": null,
    "trustScore": 72,
    "totalPoints": 250,
    "showRate": 95
  },
  "token": "<JWT>"
}
```

**Errors:** `400` validation | `401` invalid credentials

---

### `POST /api/auth/logout`

**Auth required:** Yes

Stateless logout (JWT is not server-side invalidated — client must discard token).

**Response 200:**

```json
{ "message": "Logged out successfully" }
```

---

### `GET /api/auth/me`

Returns the full profile of the currently authenticated user.

**Auth required:** Yes

**DB operations:**

1. JWT guard decodes token → gets `userId`
2. Fetches full user doc from `users`

**Response 200:**

```json
{
  "user": {
    "id": "uuid",
    "name": "string",
    "email": "string",
    "avatar": null,
    "bio": null,
    "trustScore": 72,
    "totalPoints": 250,
    "showRate": 95,
    "sessionsCompleted": 12,
    "goalsPosted": 5,
    "goalsHelped": 8,
    "streak": 7,
    "badges": ["Reliable Partner"]
  }
}
```

---

## 3. Users APIs

### `GET /api/users/:userId`

Returns a user's **public** profile (no email/points).

**Auth required:** No

**DB operations:** Finds user by `_id` in `users`

**Response 200:**

```json
{
  "user": {
    "id": "uuid",
    "name": "string",
    "avatar": null,
    "bio": null,
    "trustScore": 72,
    "showRate": 95,
    "sessionsCompleted": 12,
    "goalsPosted": 5,
    "goalsHelped": 8,
    "badges": ["Reliable Partner"],
    "createdAt": "2026-01-01T00:00:00Z"
  }
}
```

**Errors:** `404` user not found

---

### `PATCH /api/users/me`

Updates the authenticated user's editable profile fields.

**Auth required:** Yes

**Request body (all optional):**

```json
{
  "name": "New Name",
  "avatar": "https://cdn.example.com/pic.jpg",
  "bio": "I love system design"
}
```

**DB operations:** `findByIdAndUpdate` on `users` with `$set`

**Response 200:** `{ "user": { ...full updated user doc } }`

---

### `GET /api/users/me/stats`

Full dashboard stats for the authenticated user.

**Auth required:** Yes

**DB operations:**

1. Counts `sessions` where user is owner or partner, status=`completed`, in last 7 days → `sessionsThisWeek`
2. Fetches all completed sessions → calculates `totalHoursSpent`, `averageRating`
3. Builds `weeklyActivity` array (last 7 days, sessions per day)
4. Aggregates `sessions` + joined `goals` → `categoryBreakdown`
5. Reads all `trustscorelogs` for user → builds `scoreBreakdown`

**Response 200:**

```json
{
  "stats": {
    "trustScore": 72,
    "totalPoints": 250,
    "showRate": 95,
    "sessionsCompleted": 12,
    "sessionsThisWeek": 3,
    "goalsPosted": 5,
    "goalsHelped": 8,
    "currentStreak": 7,
    "longestStreak": 14,
    "totalHoursSpent": 18.5,
    "averageRating": 4.3
  },
  "scoreBreakdown": {
    "sessionsPoints": 340,
    "feedbackPoints": 120,
    "streakPoints": 45,
    "missedPenalty": -30,
    "missedCount": 2
  },
  "weeklyActivity": [
    { "day": "Thu", "sessions": 1 },
    { "day": "Fri", "sessions": 2 },
    { "day": "Sat", "sessions": 0 },
    { "day": "Sun", "sessions": 1 },
    { "day": "Mon", "sessions": 0 },
    { "day": "Tue", "sessions": 3 },
    { "day": "Wed", "sessions": 1 }
  ],
  "categoryBreakdown": [
    { "category": "dsa", "count": 8 },
    { "category": "system-design", "count": 4 }
  ]
}
```

---

### `GET /api/users/me/trust-score-history`

Paginated history of all point changes for the authenticated user.

**Auth required:** Yes

**Query params:** `?limit=20&offset=0`

**DB operations:** Queries `trustscorelogs` by `userId`, sorted by `createdAt` desc

**Response 200:**

```json
{
  "history": [
    {
      "id": "uuid",
      "action": "session_completed",
      "pointsChange": 22,
      "description": "Session completed with good attendance",
      "createdAt": "2026-03-18T10:00:00Z"
    },
    {
      "id": "uuid",
      "action": "late_cancel",
      "pointsChange": -15,
      "description": "Late cancellation (< 2h before session)",
      "createdAt": "2026-03-15T08:00:00Z"
    }
  ],
  "total": 24
}
```

---

## 4. Goals APIs

### `POST /api/goals`

Creates a new goal. **Deducts `pledgedPoints` from the user's balance immediately.**

**Auth required:** Yes

**Request body:**

```json
{
  "title": "Practice Binary Trees", // required
  "description": "Want to do LCA, traversal", // required
  "category": "dsa", // required: dsa|system-design|behavioral|fitness|speaking|other
  "difficulty": "intermediate", // required: beginner|intermediate|advanced
  "pledgedPoints": 30, // required, min 10
  "defaultDurationMins": 60, // optional, default 45
  "defaultPlatform": "Zoom", // optional, default "Google Meet"
  "approvalDeadlineOffset": "6h" // optional: "2h"|"6h"|"12h"|"24h", default "6h"
}
```

**DB operations:**

1. Validates `user.totalPoints >= pledgedPoints` → 400 if not
2. Creates goal doc with `status: "open"`, `applicationsOpen: true`, and the three default fields
3. Decrements `user.totalPoints` by `pledgedPoints`
4. Increments `user.goalsPosted` by 1

**Response 201:** `{ "goal": { ...goal fields } }`

**Errors:** `400` insufficient points | `400` validation

---

### `GET /api/goals`

Browse/feed of goals with filtering, search, and pagination.

**Auth required:** No

**Query params:**

| Param            | Type    | Default  | Description                                              |
| ---------------- | ------- | -------- | -------------------------------------------------------- |
| `category`       | string  | —        | Filter by category                                       |
| `difficulty`     | string  | —        | Filter by difficulty                                     |
| `search`         | string  | —        | Full-text search on title, description                   |
| `status`         | string  | `open`   | Filter by status                                         |
| `sortBy`         | string  | `recent` | `recent` \| `points`                                     |
| `has_open_slots` | boolean | —        | If `true`, only return goals with at least one open slot |
| `limit`          | number  | 20       | Pagination                                               |
| `offset`         | number  | 0        | Pagination                                               |

**DB operations:**

1. Builds filter, runs paginated query on `goals` with `userId` populated (name, avatar, trustScore)
2. Aggregates `applications` (pending) per goalId → `applicationCount`
3. Aggregates `sessions` with `status=open` per goalId → `openSlotCount`

**Response 200:**

```json
{
  "goals": [
    {
      "id": "uuid",
      "title": "Practice Binary Trees",
      "description": "...",
      "category": "dsa",
      "difficulty": "intermediate",
      "pledgedPoints": 30,
      "status": "open",
      "applicationsOpen": true,
      "defaultDurationMins": 60,
      "defaultPlatform": "Google Meet",
      "applicationCount": 4,
      "openSlotCount": 2,
      "createdAt": "2026-03-19T00:00:00Z",
      "user": {
        "id": "uuid",
        "name": "John Doe",
        "avatar": null,
        "trustScore": 72
      }
    }
  ],
  "total": 48,
  "hasMore": true
}
```

---

### `GET /api/goals/:goalId`

Single goal with full detail, **all session slots** (as an array), and the current user's application status.

**Auth required:** No (pass `?userId=` to get `userApplication`)

**DB operations:**

1. Fetches goal + populates owner (name, avatar, trustScore, showRate, sessionsCompleted)
2. Counts pending applications → `applicationCount`
3. If `userId` query param provided → looks up that user's application
4. Fetches **all** sessions for this goal → returns them as `sessions[]`
5. For each session: resolves `approvedHelper` (name, trustScore), counts pending apps per session

**Response 200:**

```json
{
  "goal": {
    "id": "uuid",
    "title": "Practice Binary Trees",
    "description": "...",
    "category": "dsa",
    "difficulty": "intermediate",
    "pledgedPoints": 30,
    "status": "open",
    "applicationsOpen": true,
    "defaultDurationMins": 60,
    "defaultPlatform": "Google Meet",
    "approvalDeadlineOffset": "6h",
    "applicationCount": 3,
    "openSlotCount": 2,
    "createdAt": "2026-03-19T00:00:00Z",
    "sessions": [
      {
        "id": "uuid",
        "topic": "Trees — LCA",
        "category": "dsa",
        "status": "open",
        "scheduledAt": "2026-03-25T14:00:00Z",
        "duration": 60,
        "meetingLink": null,
        "approvalDeadline": "2026-03-25T08:00:00Z",
        "approvedHelper": null,
        "appCount": 3
      },
      {
        "id": "uuid",
        "topic": "Graphs — BFS",
        "category": "dsa",
        "status": "approved",
        "scheduledAt": "2026-03-28T10:00:00Z",
        "duration": 60,
        "meetingLink": null,
        "approvalDeadline": "2026-03-28T04:00:00Z",
        "approvedHelper": {
          "id": "uuid",
          "name": "Jane Smith",
          "avatar": null,
          "trustScore": 80
        },
        "appCount": 0
      }
    ],
    "user": {
      "id": "uuid",
      "name": "John Doe",
      "avatar": null,
      "trustScore": 72,
      "showRate": 95,
      "sessionsCompleted": 12
    }
  },
  "userApplication": {
    "id": "uuid",
    "status": "pending",
    "sessionId": "uuid"
  }
}
```

---

### `PATCH /api/goals/:goalId`

Update a goal. Owner only. Only editable fields: title, description, applicationsOpen, defaultDurationMins, defaultPlatform, approvalDeadlineOffset.

**Auth required:** Yes

**Request body (all optional):**

```json
{
  "title": "Updated title",
  "description": "Updated description",
  "applicationsOpen": true,
  "defaultDurationMins": 45,
  "defaultPlatform": "Zoom",
  "approvalDeadlineOffset": "12h"
}
```

**DB operations:** `findByIdAndUpdate` on `goals` after ownership check

**Response 200:** `{ "goal": { ...updated goal } }`

**Errors:** `403` not owner | `404` not found

---

### `DELETE /api/goals/:goalId`

Cancel/delete a goal. Owner only. **Cannot delete if there is an approved application.**

**Auth required:** Yes

**DB operations:**

1. Checks for approved application → 400 if exists
2. Sets goal `status: "cancelled"`
3. Rejects all pending applications and **refunds their `stakedPoints`** to each applicant
4. **Refunds `pledgedPoints`** back to the owner

**Response 200:** `{ "message": "Goal deleted successfully" }`

**Errors:** `400` approved application exists | `403` not owner | `404` not found

---

### `GET /api/goals/my`

All goals posted by the authenticated user.

**Auth required:** Yes

**Query params:** `?status=open|matched|completed|all&limit=20&offset=0`

**DB operations:** Queries `goals` by `userId`, includes `applicationCount` per goal

**Response 200:** `{ "goals": [...], "total": 5 }`

---

### `POST /api/goals/:goalId/sessions`

Creates a **new** session slot on the goal. Owner only. **Always creates a fresh document** (no upsert — every call creates a new slot).

**Auth required:** Yes

**Request body:**

```json
{
  "topic": "Trees — LCA", // required
  "category": "dsa", // required
  "scheduledDate": "2026-03-25T14:00:00Z", // required, ISO string
  "durationMins": 60, // optional — defaults to goal.defaultDurationMins (45)
  "platform": "Zoom", // optional — defaults to goal.defaultPlatform
  "meetingLink": "https://zoom.us/j/abc" // optional
}
```

**DB operations:**

1. Ownership check on goal
2. Reads `goal.approvalDeadlineOffset` to compute `approvalDeadline = scheduledAt − offset`
3. Falls back to `goal.defaultDurationMins` if `durationMins` not provided
4. **Always creates a new** `sessions` document with `status: "open"`, `approvedHelperId: null`
5. Does NOT change `goal.status`, does NOT sync any field back to the goal

**Response 201:**

```json
{
  "session": {
    "id": "uuid",
    "topic": "Trees — LCA",
    "category": "dsa",
    "scheduledAt": "2026-03-25T14:00:00Z",
    "approvalDeadline": "2026-03-25T08:00:00Z",
    "duration": 60,
    "meetingLink": null,
    "status": "open"
  }
}
```

**Errors:** `403` not owner | `404` goal not found

---

## 5. Applications APIs

### `POST /api/goals/:goalId/applications`

Apply to a **specific session slot**. **Deducts `stakedPoints` from applicant immediately (held in escrow).**

**Auth required:** Yes

**Route:** `POST /api/sessions/:sessionId/applications`

**Request body:**

```json
{
  "message": "I have 300+ LeetCode solves", // optional
  "stakedPoints": 20 // required, min 0
}
```

**DB operations:**

1. Validates session exists and `status` is `open` or `pending_approval`
2. Checks applicant is not the session's `goalOwnerId` → 400
3. Checks no duplicate application for this `sessionId + applicantId` → 409
4. Validates `user.totalPoints >= stakedPoints` → 400
5. Creates application with `sessionId`, `goalId` (copied from session), `status: "pending"`
6. Decrements applicant's `totalPoints` by `stakedPoints`
7. If session was `open`, transitions it to `pending_approval`

**Response 201:** `{ "application": { id, sessionId, goalId, applicantId, message, stakedPoints, status, createdAt } }`

**Errors:** `400` closed slot/own session/insufficient points | `409` duplicate

---

### `GET /api/goals/:goalId/applications`

All applications for a goal, **grouped by session slot info** for the owner's dashboard view. **Goal owner only.**

**Auth required:** Yes (owner)

**DB operations:**

1. Ownership check
2. Fetches all applications where `goalId` matches, populates `applicantId` and `sessionId`
3. Returns each application with `sessionId`, `sessionTopic`, `sessionScheduledAt`, `sessionStatus`

**Response 200:**

```json
{
  "applications": [
    {
      "id": "uuid",
      "sessionId": "uuid",
      "sessionTopic": "Trees — LCA",
      "sessionCategory": "dsa",
      "sessionScheduledAt": "2026-03-25T14:00:00Z",
      "sessionStatus": "pending_approval",
      "message": "I love trees",
      "stakedPoints": 20,
      "status": "pending",
      "createdAt": "2026-03-19T00:00:00Z",
      "applicant": {
        "id": "uuid",
        "name": "Jane Smith",
        "avatar": null,
        "trustScore": 80,
        "showRate": 95,
        "showUpRate": 0.95,
        "sessionsCompleted": 26,
        "sessionsCount": 26
      }
    }
  ]
}
```

---

### `POST /api/applications/:applicationId/approve`

Approve an application. **Goal owner only.** Updates the **existing session slot** (does NOT create a new one). Rejects + refunds all other pending applicants for **that specific slot only** (other slots of the same goal are unaffected).

**Auth required:** Yes (owner)

**DB operations:**

1. Ownership check via `application.goalId.userId`
2. Sets application `status: "approved"`
3. Sets `session.approvedHelperId = applicantId`, `session.status = "approved"`, `session.approvedAt = now`
4. Does NOT set `goal.status = "matched"` — goal stays active
5. Does NOT close `goal.applicationsOpen` — other slots still accept applications
6. Rejects + refunds other pending applicants **for this session only**

**Response 200:**

```json
{
  "application": { "id": "uuid", "status": "approved" },
  "session": {
    "id": "uuid",
    "status": "approved",
    "approvedHelperId": "uuid"
  }
}
```

**Errors:** `400` not pending | `403` not owner | `404` not found

---

### `POST /api/applications/:applicationId/reject`

Reject a single application. **Goal owner only.** Refunds staked points to applicant.

**Auth required:** Yes (owner)

**DB operations:**

1. Sets application `status: "rejected"`
2. **Refunds `stakedPoints`** to applicant's `totalPoints`

**Response 200:** `{ "application": { "id": "uuid", "status": "rejected" } }`

---

### `DELETE /api/applications/:applicationId`

Withdraw your own application. **Only while status is `pending`.**

**Auth required:** Yes (applicant)

**DB operations:**

1. Sets application `status: "withdrawn"`
2. **Refunds `stakedPoints`** back to applicant's `totalPoints`

**Response 200:** `{ "message": "Application withdrawn" }`

**Errors:** `400` not pending | `403` not your application | `404` not found

---

### `GET /api/applications/my`

All applications submitted by the authenticated user, with **session details** included.

**Auth required:** Yes

**Query params:** `?status=pending|approved|rejected|all`

**DB operations:** Queries `applications` by `applicantId`, populates `goalId` and `sessionId`

**Response 200:**

```json
{
  "applications": [
    {
      "id": "uuid",
      "status": "approved",
      "stakedPoints": 20,
      "createdAt": "2026-03-19T00:00:00Z",
      "sessionId": "uuid",
      "session": {
        "id": "uuid",
        "topic": "Trees — LCA",
        "category": "dsa",
        "scheduledAt": "2026-03-25T14:00:00Z",
        "status": "approved"
      },
      "goal": {
        "id": "uuid",
        "title": "Practice Binary Trees",
        "category": "dsa",
        "status": "open",
        "user": {
          "id": "uuid",
          "name": "John Doe",
          "avatar": null
        }
      }
    }
  ],
  "total": 5
}
```

---

## 6. Sessions APIs

### `GET /api/sessions`

All sessions the authenticated user is part of (as owner or helper).

**Auth required:** Yes

**Query params:**

| Param    | Values                        | Default | Description                                                   |
| -------- | ----------------------------- | ------- | ------------------------------------------------------------- |
| `type`   | `upcoming` \| `past` \| `all` | `all`   | upcoming = active future sessions; past = completed/cancelled |
| `role`   | `owner` \| `partner` \| `all` | `all`   | Filter by user's role                                         |
| `status` | string                        | —       | Direct status filter (overrides `type`)                       |
| `limit`  | number                        | 20      | Pagination                                                    |
| `offset` | number                        | 0       | Pagination                                                    |

**DB operations:**

1. Builds filter based on type, role, or explicit status
2. Uses `approvedHelperId` (with `partnerId` legacy fallback) for partner matching
3. Populates `goalId` (title, category, difficulty, pledgedPoints)

**Response 200:**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "topic": "Trees — LCA",
      "category": "dsa",
      "scheduledAt": "2026-03-25T14:00:00Z",
      "duration": 60,
      "status": "approved",
      "meetingLink": null,
      "role": "owner",
      "goal": {
        "id": "uuid",
        "title": "Practice Binary Trees",
        "category": "dsa",
        "difficulty": "intermediate",
        "pledgedPoints": 30
      },
      "partner": {
        "id": "uuid",
        "name": "Jane Smith",
        "avatar": null,
        "trustScore": 80
      },
      "isOwner": true
    }
  ],
  "total": 12
}
```

---

### `GET /api/sessions/open`

Public browse feed of all open session slots — powers the landing page "open slots right now" section.

**Auth required:** No

**Query params:** `?category=dsa&from=2026-03-20T00:00:00Z&limit=20&offset=0`

**DB operations:**

1. Queries `sessions` where `status = "open"`, optional `category` and `from` date filters
2. Sorts by `scheduledAt ASC`
3. Populates `goalId` (title, category, difficulty, pledgedPoints), resolves owner user
4. Counts pending applications per session

**Response 200:**

```json
{
  "sessions": [
    {
      "id": "uuid",
      "topic": "Trees — LCA",
      "category": "dsa",
      "scheduledAt": "2026-03-25T14:00:00Z",
      "duration": 60,
      "meetingLink": null,
      "approvalDeadline": "2026-03-25T08:00:00Z",
      "status": "open",
      "applicationCount": 3,
      "goal": {
        "id": "uuid",
        "title": "Practice Binary Trees",
        "category": "dsa",
        "difficulty": "intermediate",
        "pledgedPoints": 30
      },
      "owner": {
        "id": "uuid",
        "name": "John Doe",
        "avatar": null,
        "trustScore": 72
      }
    }
  ],
  "total": 14,
  "hasMore": false
}
```

---

### `GET /api/sessions/:sessionId`

Full detail of a single session. Access restricted to the session owner or approved helper.

**Auth required:** Yes (owner or approved helper)

**DB operations:**

1. Fetches session, populates `goalId`
2. Fetches `goalOwner` and `approvedHelper` user docs separately

**Response 200:**

```json
{
  "session": {
    "id": "uuid",
    "topic": "Trees — LCA",
    "category": "dsa",
    "scheduledAt": "2026-03-25T14:00:00Z",
    "duration": 60,
    "status": "approved",
    "meetingLink": null,
    "notes": null,
    "approvalDeadline": "2026-03-25T08:00:00Z",
    "goal": {
      "id": "uuid",
      "title": "Practice Binary Trees",
      "description": "...",
      "category": "dsa",
      "difficulty": "intermediate",
      "pledgedPoints": 30
    },
    "goalOwner": {
      "id": "uuid",
      "name": "John Doe",
      "avatar": null,
      "trustScore": 72
    },
    "approvedHelper": {
      "id": "uuid",
      "name": "Jane Smith",
      "avatar": null,
      "trustScore": 80
    },
    "isOwner": true
  }
}
```

---

### `PATCH /api/sessions/:sessionId`

Update notes or meeting link. Either participant can do this.

**Auth required:** Yes (participant)

**Request body (all optional):**

```json
{
  "notes": "Focus on post-order traversal",
  "meetingLink": "https://zoom.us/j/updated"
}
```

**Response 200:** `{ "session": { ...updated session doc } }`

---

### `POST /api/sessions/:sessionId/start`

Mark session as `in_progress`. Owner or approved helper can trigger this.

**Auth required:** Yes (owner or helper)

**DB operations:** Updates `status` to `in_progress` (only if currently `approved` or legacy `scheduled`)

**Response 200:** `{ "session": { "id": "uuid", "status": "in_progress" } }`

**Errors:** `400` not in approved/scheduled state

---

### `POST /api/sessions/:sessionId/complete`

Complete a session, submit rating, and trigger **points transfer**.

**Auth required:** Yes (participant)

**Request body:**

```json
{
  "rating": 5, // required, 1–5
  "feedback": "Excellent!", // optional
  "partnerShowedUp": true // required boolean
}
```

**DB operations & points logic:**

**If `partnerShowedUp: true`:**

1. Marks session `completed`, sets `completedAt`
2. Sets the caller's rating + feedback on the session
3. Calculates `pointsEarned = 10 + round((rating - 1) * 3.75)` → range 10–25
4. Adds `pointsEarned` to caller's `totalPoints`
5. Increments caller's `sessionsCompleted` by 1
6. Logs a `session_completed` entry in `trustscorelogs`
7. **If caller is the goal owner:**
   - Sets goal `status: "completed"`
   - Transfers `goal.pledgedPoints` → to partner's `totalPoints`
   - Increments partner's `goalsHelped` by 1

**If `partnerShowedUp: false`:**

1. Marks session `completed`
2. Looks up the approved application to get `stakedPoints`
3. Logs a `no_show` entry for the no-showing party in `trustscorelogs`
4. If goal owner reporting no-show: refunds `pledgedPoints` back to owner
5. If partner reporting no-show: refunds `stakedPoints` back to partner

**Response 200:**

```json
{
  "session": {
    "id": "uuid",
    "status": "completed",
    "completedAt": "2026-03-25T16:00:00Z"
  },
  "pointsEarned": 22
}
```

---

### `POST /api/sessions/:sessionId/cancel`

Cancel a session. Either participant can cancel. **Late cancellation (< 2h before) triggers a penalty.**

**Auth required:** Yes (participant)

**Request body (optional):**

```json
{ "reason": "Schedule conflict" }
```

**DB operations & points logic:**

**If cancelled > 2h before scheduled time (early cancel):**

1. Refunds approved helper's `stakedPoints` from the application
2. Rejects the approved application
3. **Resets session `status` back to `"open"`** and clears `approvedHelperId` — so a new helper can apply
4. No points penalty

**If cancelled ≤ 2h before scheduled time (late cancel):**

1. Sets session `status: "cancelled"` (permanently closed)
2. Deducts **15 points** from the canceller's `totalPoints`
3. Logs a `late_cancel` in `trustscorelogs`

**Response 200:**

```json
{
  "session": { "id": "uuid", "status": "cancelled" },
  "pointsLost": 15
}
```

---

## 7. Partners API

### `GET /api/partners`

Users you've had completed sessions with, grouped and sorted by most recent activity.

**Auth required:** Yes

**Query params:** `?limit=20&offset=0`

**DB operations:**

1. Fetches all completed sessions where user is owner or partner
2. Builds map of `partnerId → { sessionsCount, lastSessionAt, ratings[] }`
3. Sorts by most recent session
4. Fetches user docs for top N partners
5. Computes `averageRating` per partner

**Response 200:**

```json
{
  "partners": [
    {
      "user": {
        "id": "uuid",
        "name": "Jane Smith",
        "avatar": null,
        "trustScore": 80
      },
      "sessionsCount": 5,
      "lastSessionAt": "2026-03-18T16:00:00Z",
      "averageRating": 4.6
    }
  ],
  "total": 8
}
```

---

## 8. Categories API

### `GET /api/categories`

Static list of all available goal categories with topics.

**Auth required:** No

**Response 200:**

```json
{
  "categories": [
    {
      "id": "dsa",
      "name": "DSA",
      "description": "Data Structures & Algorithms",
      "topics": [
        "Arrays",
        "Trees",
        "Graphs",
        "DP",
        "Strings",
        "Sorting",
        "Linked Lists",
        "Heaps"
      ]
    },
    {
      "id": "system-design",
      "name": "System Design",
      "description": "Architect scalable systems",
      "topics": [
        "URL Shortener",
        "Twitter Feed",
        "Rate Limiter",
        "Chat System",
        "CDN",
        "Database Sharding"
      ]
    },
    {
      "id": "behavioral",
      "name": "Behavioral",
      "description": "STAR method interviews",
      "topics": [
        "Leadership",
        "Conflict Resolution",
        "Failure Stories",
        "Teamwork",
        "Goals"
      ]
    },
    {
      "id": "fitness",
      "name": "Fitness",
      "description": "Workout accountability",
      "topics": []
    },
    {
      "id": "speaking",
      "name": "Speaking",
      "description": "Public speaking practice",
      "topics": []
    },
    {
      "id": "other",
      "name": "Other",
      "description": "Any other skill or goal",
      "topics": []
    }
  ]
}
```

---

## 9. Points & Trust Score Logic

### Points System Summary

| Event                                                | Who              | Change                                        |
| ---------------------------------------------------- | ---------------- | --------------------------------------------- |
| Create goal                                          | Goal owner       | `-pledgedPoints`                              |
| Apply to session slot                                | Applicant        | `-stakedPoints` (escrow)                      |
| Application rejected / withdrawn                     | Applicant        | `+stakedPoints` refund                        |
| Goal deleted (no approved app)                       | Owner            | `+pledgedPoints` refund                       |
| Application approved → others for same slot rejected | Other applicants | `+stakedPoints` refund each                   |
| Session completed (helper showed up)                 | Completer        | `+10 to +25` based on rating                  |
| Session completed, goal owner reports                | Helper           | `+pledgedPoints` transfer                     |
| Session completed, no-show reported                  | No-shower        | trust log penalty                             |
| Late cancel (< 2h before)                            | Canceller        | `-15 pts`                                     |
| Early cancel (> 2h before)                           | Helper           | `+stakedPoints` refund; slot resets to `open` |

### Points Earned Formula

```
pointsEarned = 10 + round((rating - 1) * 3.75)

rating 1 → 10 pts
rating 2 → 14 pts
rating 3 → 18 pts
rating 4 → 21 pts
rating 5 → 25 pts
```

### Trust Score Formula

```
trustScore = (showRate × 0.4) + (avgRating × 10) + min(sessionsCompleted × 0.5, 20) + min(streak, 10)

Max: 40 + 50 + 20 + 10 = 100
```

### Score Breakdown (from trustscorelogs)

| `action`            | Bucket                     |
| ------------------- | -------------------------- |
| `session_completed` | `sessionsPoints`           |
| `good_feedback`     | `feedbackPoints`           |
| `streak_bonus`      | `streakPoints`             |
| `no_show`           | `missedPenalty` (negative) |
| `late_cancel`       | `missedPenalty` (negative) |

---

## 10. Error Format

All errors follow this consistent structure:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "name must be a string",
    "details": {}
  }
}
```

| HTTP Code | `code`                  | When                                         |
| --------- | ----------------------- | -------------------------------------------- |
| 400       | `VALIDATION_ERROR`      | Invalid/missing fields in request body       |
| 401       | `UNAUTHORIZED`          | No token or expired/invalid JWT              |
| 403       | `FORBIDDEN`             | Valid token but not allowed (not owner etc.) |
| 404       | `NOT_FOUND`             | Resource doesn't exist                       |
| 409       | `CONFLICT`              | Duplicate (email exists, already applied)    |
| 500       | `INTERNAL_SERVER_ERROR` | Unexpected server error                      |

---

## Quick Reference — All Endpoints

| Method | Path                                    | Auth | Description                                       |
| ------ | --------------------------------------- | ---- | ------------------------------------------------- |
| POST   | `/api/auth/register`                    | No   | Register new user                                 |
| POST   | `/api/auth/login`                       | No   | Login + get JWT                                   |
| POST   | `/api/auth/logout`                      | Yes  | Logout (client discards token)                    |
| GET    | `/api/auth/me`                          | Yes  | Get current user                                  |
| GET    | `/api/users/:userId`                    | No   | Public profile                                    |
| PATCH  | `/api/users/me`                         | Yes  | Update own profile                                |
| GET    | `/api/users/me/stats`                   | Yes  | Dashboard stats + score breakdown                 |
| GET    | `/api/users/me/trust-score-history`     | Yes  | Points history                                    |
| POST   | `/api/goals`                            | Yes  | Create goal                                       |
| GET    | `/api/goals`                            | No   | Browse goals (filter/search/openSlots)            |
| GET    | `/api/goals/my`                         | Yes  | My posted goals                                   |
| GET    | `/api/goals/:goalId`                    | No   | Goal detail + sessions[] + user application       |
| PATCH  | `/api/goals/:goalId`                    | Yes  | Update goal defaults (owner)                      |
| DELETE | `/api/goals/:goalId`                    | Yes  | Cancel goal (owner)                               |
| POST   | `/api/goals/:goalId/sessions`           | Yes  | Add new session slot to goal (owner)              |
| GET    | `/api/goals/:goalId/applications`       | Yes  | Applications for all slots of a goal (owner)      |
| POST   | `/api/sessions/:sessionId/applications` | Yes  | Apply to a specific session slot                  |
| POST   | `/api/applications/:id/approve`         | Yes  | Approve applicant — updates existing slot (owner) |
| POST   | `/api/applications/:id/reject`          | Yes  | Reject applicant (owner)                          |
| DELETE | `/api/applications/:id`                 | Yes  | Withdraw application (applicant)                  |
| GET    | `/api/applications/my`                  | Yes  | My submitted applications + session details       |
| GET    | `/api/sessions/open`                    | No   | Public open slots browse feed                     |
| GET    | `/api/sessions`                         | Yes  | My sessions (filter type/role/status)             |
| GET    | `/api/sessions/:sessionId`              | Yes  | Session detail                                    |
| PATCH  | `/api/sessions/:sessionId`              | Yes  | Update notes/meeting link                         |
| POST   | `/api/sessions/:sessionId/start`        | Yes  | Mark in_progress                                  |
| POST   | `/api/sessions/:sessionId/complete`     | Yes  | Complete + rate + transfer points                 |
| POST   | `/api/sessions/:sessionId/cancel`       | Yes  | Cancel (early → reset to open, late → -15pts)     |
| GET    | `/api/partners`                         | Yes  | My past partners                                  |
| GET    | `/api/categories`                       | No   | All categories + topics                           |
