# Identity-Bound Auth + LMS Foundation — Implementation Plan

## Summary

Restructure the video call module from "whoever has the link gets in" to "tokens are minted per-authenticated-student-per-session." This is the structural foundation for the OpenGrapes LMS — designed to be migratable to a standalone LMS backend later.

> [!IMPORTANT]
> This plan changes the core access model. After implementation, the current "copy invite link" flow is **replaced** by login-gated access. Direct URL access without authentication will be blocked.

---

## Decisions Locked In

| Decision | Choice |
|---|---|
| Database | SQLite via `better-sqlite3`, file-based, in the Express server |
| Identity model | Seeded `users` table (teachers + students), email + bcrypt password login |
| Auth pattern | Two JWTs: LMS Auth (24h, `LMS_JWT_SECRET`) + Session (2h, `SESSION_TOKEN_SECRET`) |
| Data model | `users` → `batches` → `enrollments` → `live_sessions` |
| Session timeout | 2 hours, cleaned by server-side periodic sweep every 60s |
| Reconnection | No re-auth on reconnect; session JWT (2h) covers the full class |
| Revocation | `/api/kick-participant` endpoint via LiveKit `removeParticipant` API |
| Frontend | Login page replaces home page; dashboard with role-based views |
| Live notification | Student dashboard polls `GET /api/my-batches` every 5s |
| Token storage | `localStorage` + `useAuth()` hook on the frontend |
| Host controls | Teacher can remotely mute mic / disable camera for any student via LiveKit server API |
| DB migration | SQLite now, PostgreSQL-ready — all DB access isolated in `db.ts` |

---

## Proposed Changes

### Phase 1: Database + Data Model

> Foundation layer — everything else depends on this.

#### [NEW] `backend/src/db.ts`
- Initialize SQLite database using `better-sqlite3`
- Create tables on startup (idempotent `CREATE TABLE IF NOT EXISTS`):

```sql
-- Users: both teachers and students
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('teacher', 'student')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Batches: a recurring class group
CREATE TABLE batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  teacher_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

-- Enrollments: which students belong to which batch
CREATE TABLE enrollments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES users(id),
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'suspended')),
  enrolled_at TEXT DEFAULT (datetime('now')),
  UNIQUE(student_id, batch_id)
);

-- Live Sessions: tracks active/past class sessions
CREATE TABLE live_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL REFERENCES batches(id),
  room_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'live' CHECK(status IN ('live', 'completed', 'expired')),
  started_at TEXT DEFAULT (datetime('now')),
  ended_at TEXT
);
```

#### [NEW] `backend/src/seed.ts`
- Seed script that populates the DB with test data:
  - 1 teacher: `{ name: "Prof. Malhotra", email: "teacher@opengrapes.com", password: "teacher123" }`
  - 5 students: Riya, Arjun, Priya, Sameer, Neha with emails `riya@test.com`, etc., password `student123`
  - 2 batches: "Math 101 — Batch A", "Physics — Batch B" (both assigned to teacher)
  - Enrollments: 3 students in batch A, 2 in batch B
- Passwords hashed with bcrypt before insertion
- Run via `npm run seed` script

#### [MODIFY] `backend/package.json`
- Add dependencies: `better-sqlite3`, `bcrypt`
- Add devDependencies: `@types/better-sqlite3`, `@types/bcrypt`
- Add `"seed": "ts-node src/seed.ts"` script

---

### Phase 2: Auth Endpoints

> Login system for both teachers and students.

#### [NEW] `backend/src/auth.ts`
- Auth middleware function `requireAuth(req, res, next)`:
  - Reads `Authorization: Bearer <token>` header
  - Verifies JWT against `LMS_JWT_SECRET`
  - Attaches `req.user = { userId, role, name, email }` to the request
  - Returns 401 if missing/invalid/expired
- Role-check middleware: `requireRole('teacher')` — returns 403 if role doesn't match

#### [MODIFY] `backend/src/index.ts`
- **Add** `POST /api/auth/login`:
  - Body: `{ email, password }`
  - Lookup user by email in SQLite
  - Verify password with `bcrypt.compare()`
  - Sign and return LMS Auth JWT: `{ userId, role, name, email }`, expires 24h, signed with `LMS_JWT_SECRET`
  - Returns: `{ token, user: { id, name, email, role } }`

- **Add** `GET /api/auth/me`:
  - Protected by `requireAuth`
  - Returns the decoded user info from the JWT (no DB lookup needed)
  - Used by the frontend `useAuth()` hook to validate stored tokens

---

### Phase 3: Class Lifecycle Endpoints

> Start-class, join-class, end-class — the core session state machine.

#### [MODIFY] `backend/src/index.ts`

- **Replace** `POST /api/create-session` with `POST /api/start-class`:
  - Protected by `requireAuth` + `requireRole('teacher')`
  - Body: `{ batchId }`
  - Validates:
    - The teacher owns this batch
    - No existing `live` session for this batch (prevent duplicate starts)
  - Generates a unique `roomId`: `batch-{batchId}-{timestamp}-{6-char-random}`
  - Inserts a `live_sessions` row with `status: 'live'`
  - Signs a Session JWT for the teacher: `{ userId, role: 'teacher', name, roomId, batchId }`, expires 2h, signed with `SESSION_TOKEN_SECRET`
  - Returns: `{ roomId, sessionToken, batchId }`

- **Add** `POST /api/join-class`:
  - Protected by `requireAuth` + `requireRole('student')`
  - Body: `{ batchId }`
  - Validates:
    - Student is enrolled in this batch (`enrollments` table, `status = 'active'`)
    - An active `live` session exists for this batch
  - Signs a Session JWT for the student: `{ userId, role: 'student', name, roomId, batchId }`, expires 2h
  - Returns: `{ roomId, sessionToken }`

- **Add** `POST /api/end-class`:
  - Protected by `requireAuth` + `requireRole('teacher')`
  - Body: `{ batchId }` or `{ roomId }`
  - Sets `live_sessions.status = 'completed'`, `ended_at = now()`
  - Returns: `{ ok: true }`

- **Modify** `POST /api/token`:
  - Now verifies the Session JWT (signed with `SESSION_TOKEN_SECRET`)
  - Extracts `userId`, `role`, `name`, `roomId` from the verified payload
  - Uses `userId` as the LiveKit identity (not the user-supplied `participantName`)
  - Embeds `role` in LiveKit participant metadata (unchanged behavior)
  - **Does NOT re-check enrollment** — the session JWT's existence and validity is sufficient (reconnection policy)

- **Add** `POST /api/kick-participant`:
  - Protected by `requireAuth` + `requireRole('teacher')`
  - Body: `{ roomId, participantIdentity }`
  - Calls LiveKit Server SDK's `RoomServiceClient.removeParticipant(roomId, participantIdentity)`
  - Optionally updates `enrollments.status = 'suspended'` for that student+batch
  - Returns: `{ ok: true }`

- **Add** `POST /api/mute-participant`:
  - Protected by `requireAuth` + `requireRole('teacher')`
  - Body: `{ roomId, participantIdentity, trackType: 'audio' | 'video', muted: boolean }`
  - Uses `RoomServiceClient.listParticipants(roomId)` to find the participant
  - Iterates their published tracks to find the matching track (audio or video)
  - Calls `RoomServiceClient.mutePublishedTrack(roomId, identity, trackSid, muted)` to forcibly mute/unmute
  - Returns: `{ ok: true }` or `{ error: 'Participant or track not found' }`
  - Note: LiveKit SDK automatically notifies the student's client that their track was muted — no data channel message needed

- **Add** `GET /api/my-batches`:
  - Protected by `requireAuth`
  - If teacher: returns all batches they own, with enrolled student counts, and any active `live_sessions`
  - If student: returns all batches they're enrolled in, with active session info
  - Response shape:
    ```json
    {
      "batches": [
        {
          "id": 1,
          "name": "Math 101 — Batch A",
          "teacherName": "Prof. Malhotra",
          "studentCount": 3,
          "activeSession": { "roomId": "batch-1-...", "startedAt": "..." } | null
        }
      ]
    }
    ```

- **Add** session cleanup sweep:
  - On server startup, `setInterval(() => { ... }, 60_000)`:
    - Query: `SELECT id FROM live_sessions WHERE status = 'live' AND started_at < datetime('now', '-2 hours')`
    - Update matched rows: `status = 'expired'`, `ended_at = now()`
    - Log any auto-expired sessions

---

### Phase 4: Frontend — Auth Layer + Dashboard

> Login page, auth context, role-based dashboard.

#### [NEW] `frontend/lib/auth.ts`
- `useAuth()` hook:
  - Reads LMS Auth JWT from `localStorage`
  - Decodes payload (using existing `decodeJwt`)
  - Returns `{ user, token, isLoading, login(email, password), logout() }`
  - `login()`: calls `POST /api/auth/login`, stores token in `localStorage`
  - `logout()`: clears `localStorage`, redirects to `/`
  - If token is expired on mount, clears it and returns `user: null`

#### [NEW] `frontend/components/AuthProvider.tsx`
- React Context provider wrapping the `useAuth()` hook
- Wrap `layout.tsx` children with `<AuthProvider>`

#### [MODIFY] `frontend/app/page.tsx`
- Replace the "Host a Live Class" form with a **Login page**:
  - Email + password form
  - Calls `login()` from `useAuth()`
  - On success, redirects to `/dashboard`
  - Styled to match existing dark theme (glassmorphism, indigo accents)

#### [NEW] `frontend/app/dashboard/page.tsx`
- Protected route (redirects to `/` if not logged in)
- **Teacher view**:
  - List of batches they own
  - Each batch shows: name, student count, active session indicator
  - "Start Class" button per batch → calls `POST /api/start-class`, then redirects to `/room/[roomId]?sessionToken=...`
  - "End Class" button shown when a session is active → calls `POST /api/end-class`
  - Enrolled students list per batch (expandable)
- **Student view**:
  - List of enrolled batches
  - Each batch shows: name, teacher name
  - "Join Class" button per batch → active (indigo) when `activeSession` is not null, disabled/gray when no active session
  - On click: calls `POST /api/join-class`, then redirects to `/room/[roomId]?sessionToken=...`
  - Polls `GET /api/my-batches` every 5 seconds to check for active sessions

#### [MODIFY] `frontend/app/room/[roomName]/page.tsx`
- Remove the `studentToken` query param logic (no more generic shareable tokens)
- Remove the `name` query param (user identity comes from the session JWT, not URL)
- Session token still passed via query param but now bound to a specific user
- Remove the PreJoinScreen name input (user is already identified via login)
- PreJoinScreen now shows only device setup (cam/mic selection + toggles), no name field
- If session JWT is missing or invalid, redirect to `/dashboard`

#### [MODIFY] `frontend/components/classroom/PreJoinScreen.tsx`
- Remove the name input field
- Display the user's name from auth context (read-only)
- Keep device selection and cam/mic toggle functionality

#### [MODIFY] `frontend/components/VideoRoom.tsx`
- Remove the `studentToken` prop (no longer relevant — each user gets their own session token)
- Remove the `handleCopyLink` logic that generates shareable invite URLs
- The `userName` now comes from the session JWT payload, not a prop
- Pass `sessionToken` (LMS auth JWT) to `ChatPanel` for host control API calls

#### [MODIFY] `frontend/components/classroom/ChatPanel.tsx`
- Add host control buttons in the **Participants** tab (teacher-only):
  - "Mute Mic" / "Unmute Mic" button per student participant
  - "Disable Camera" / "Enable Camera" button per student participant
- Each button calls `POST /api/mute-participant` with the appropriate `trackType` and `muted` value
- Uses the LMS auth JWT from `localStorage` for the `Authorization` header
- Show loading spinner on the button during the API call
- LiveKit SDK auto-updates the UI for the muted student (their `isMicrophoneEnabled` / `isCameraEnabled` changes reactively)

---

### Phase 5: Session Lifecycle Cleanup

#### [MODIFY] `backend/src/index.ts`
- Add the `setInterval` sweep for expired sessions (as described in Phase 3)
- Wire it to run on server startup, after DB initialization

---

### Phase 6: Revocation + Host Controls

#### [MODIFY] `backend/src/index.ts`
- Add `POST /api/kick-participant` (as described in Phase 3)
- Add `POST /api/mute-participant` (as described in Phase 3)
- Both require `livekit-server-sdk`'s `RoomServiceClient` — already a dependency
- Initialize `RoomServiceClient` with `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and LiveKit server URL

#### [MODIFY] `frontend/components/classroom/ChatPanel.tsx`
- Add mute mic / disable camera buttons in participants list (teacher-only, as described in Phase 4)

---

## Files Changed Summary

| Status | File | Phase |
|---|---|---|
| [NEW] | `backend/src/db.ts` | 1 |
| [NEW] | `backend/src/seed.ts` | 1 |
| [NEW] | `backend/src/auth.ts` | 2 |
| [MODIFY] | `backend/src/index.ts` | 2, 3, 5, 6 |
| [MODIFY] | `backend/package.json` | 1 |
| [MODIFY] | `backend/.env` | 2 (add `LMS_JWT_SECRET`) |
| [NEW] | `frontend/lib/auth.ts` | 4 |
| [NEW] | `frontend/components/AuthProvider.tsx` | 4 |
| [MODIFY] | `frontend/app/page.tsx` | 4 |
| [NEW] | `frontend/app/dashboard/page.tsx` | 4 |
| [MODIFY] | `frontend/app/room/[roomName]/page.tsx` | 4 |
| [MODIFY] | `frontend/components/classroom/PreJoinScreen.tsx` | 4 |
| [MODIFY] | `frontend/components/VideoRoom.tsx` | 4 |
| [MODIFY] | `frontend/app/layout.tsx` | 4 (wrap with AuthProvider) |

---

## Verification Plan

### Automated Tests
- `npm run seed` populates the DB without errors
- `POST /api/auth/login` with correct credentials returns a valid JWT
- `POST /api/auth/login` with wrong password returns 401
- `POST /api/start-class` without auth returns 401
- `POST /api/start-class` with student auth returns 403
- `POST /api/start-class` with teacher auth creates a live session
- `POST /api/join-class` with unenrolled student returns 403
- `POST /api/join-class` with enrolled student + active session returns a session JWT
- `POST /api/join-class` with enrolled student + no active session returns 404
- `POST /api/token` with valid session JWT returns a LiveKit token
- `POST /api/token` with expired session JWT returns 401
- Session sweep expires sessions older than 2 hours
- `POST /api/mute-participant` with teacher auth mutes a student's mic
- `POST /api/mute-participant` with student auth returns 403
- `POST /api/kick-participant` with teacher auth removes a participant

### Manual Verification
1. Start the server, run `npm run seed`
2. Login as teacher → see dashboard with batches
3. Click "Start Class" on a batch → redirected to video room
4. Open incognito window, login as an enrolled student → see "Join Class" button active
5. Click "Join Class" → enters the same video room
6. Login as a student NOT enrolled in that batch → "Join Class" button disabled/missing
7. Refresh the student's page mid-call → reconnects without re-login
8. Wait 2 hours (or temporarily set timeout to 30 seconds for testing) → session auto-expires
9. As teacher, open participants panel → click "Mute Mic" on a student → student's mic is forcibly muted
10. As teacher, click "Disable Camera" on a student → student's camera is forcibly disabled
11. Verify the student sees their mic/camera toggled off on their end

---

## Migrability Notes

> [!TIP]
> This architecture is designed to be extractable. When you build the standalone OpenGrapes LMS:

- **`db.ts`** → Replace SQLite with your LMS database (Postgres/MySQL). The schema shapes (`users`, `batches`, `enrollments`, `live_sessions`) are the same.
- **`auth.ts`** → Replace with your LMS auth middleware. The `requireAuth` / `requireRole` pattern stays identical.
- **`/api/start-class`, `/api/join-class`** → Move to the LMS backend. The Express video server retains only `/api/token`, `/api/turn`, `/api/livekit-url`.
- **`useAuth()` hook** → Replace `localStorage` with your LMS session management. The hook interface stays the same.
- **Dashboard page** → Replace with the full LMS dashboard. The polling-based "is class live?" check becomes a WebSocket/SSE push.
