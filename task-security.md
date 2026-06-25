# Task List — Identity-Bound Auth + LMS Foundation + Host Controls

---

## Phase 1: Database + Seed Data
> **Goal**: SQLite DB with schema and test data. Everything else depends on this.

- [ ] Install backend dependencies: `better-sqlite3`, `bcrypt`, `@types/better-sqlite3`, `@types/bcrypt`
- [ ] Create `backend/src/db.ts`:
  - [ ] Initialize `better-sqlite3` with a DB file path (e.g., `backend/opengrapes.db`)
  - [ ] `CREATE TABLE IF NOT EXISTS users` (id, name, email, password_hash, role, created_at)
  - [ ] `CREATE TABLE IF NOT EXISTS batches` (id, name, teacher_id FK, created_at)
  - [ ] `CREATE TABLE IF NOT EXISTS enrollments` (id, student_id FK, batch_id FK, status, enrolled_at, UNIQUE constraint)
  - [ ] `CREATE TABLE IF NOT EXISTS live_sessions` (id, batch_id FK, room_id UNIQUE, status, started_at, ended_at)
  - [ ] Export the `db` instance and helper query functions
  - [ ] Add `opengrapes.db` to `backend/.gitignore`
- [ ] Create `backend/src/seed.ts`:
  - [ ] Hash passwords with `bcrypt` (cost factor 10)
  - [ ] Insert 1 teacher: `Prof. Malhotra`, `teacher@opengrapes.com`, password `teacher123`
  - [ ] Insert 5 students: Riya, Arjun, Priya, Sameer, Neha with `{name}@test.com`, password `student123`
  - [ ] Insert 2 batches: "Math 101 — Batch A", "Physics — Batch B" (teacher_id = 1)
  - [ ] Insert enrollments: Riya, Arjun, Priya → Batch A; Sameer, Neha → Batch B
  - [ ] Use `INSERT OR IGNORE` to make re-runs idempotent
- [ ] Add `"seed": "ts-node src/seed.ts"` to `backend/package.json` scripts
- [ ] Run `npm run seed` and verify DB file is populated correctly

---

## Phase 2: Auth System (Login + Middleware)
> **Goal**: Login endpoint + auth middleware. Blocks Phase 3 and Phase 4.

- [ ] Generate a strong `LMS_JWT_SECRET` and add to `backend/.env`
- [ ] Generate a strong `SESSION_TOKEN_SECRET` (replace `opengrapes`) and update `backend/.env`
- [ ] Create `backend/src/auth.ts`:
  - [ ] `requireAuth` middleware: reads `Authorization: Bearer <token>`, verifies against `LMS_JWT_SECRET`, attaches `req.user`
  - [ ] `requireRole(role)` middleware: checks `req.user.role`, returns 403 if mismatch
  - [ ] TypeScript: extend Express `Request` type with `user?: { userId, role, name, email }`
- [ ] Add `POST /api/auth/login` to `backend/src/index.ts`:
  - [ ] Accept `{ email, password }` body
  - [ ] Lookup user by email in SQLite
  - [ ] Verify password with `bcrypt.compare()`
  - [ ] Return 401 on bad credentials with generic error message
  - [ ] On success: sign LMS Auth JWT (`{ userId, role, name, email }`, 24h expiry, `LMS_JWT_SECRET`)
  - [ ] Return `{ token, user: { id, name, email, role } }`
- [ ] Add `GET /api/auth/me` to `backend/src/index.ts`:
  - [ ] Protected by `requireAuth`
  - [ ] Returns decoded user info from the JWT
- [ ] Test: login with correct creds → 200 + valid JWT; wrong creds → 401

---

## Phase 3: Class Lifecycle Endpoints
> **Goal**: start-class, join-class, end-class, my-batches, session sweep. Blocks Phase 4.

- [ ] Add `POST /api/start-class`:
  - [ ] Protected by `requireAuth` + `requireRole('teacher')`
  - [ ] Validate teacher owns the batch (query `batches` table)
  - [ ] Check no existing `live` session for this batch → 409 if duplicate
  - [ ] Generate unique `roomId`: `batch-{batchId}-{Date.now()}-{crypto.randomBytes(3).toString('hex')}`
  - [ ] Insert `live_sessions` row with `status: 'live'`
  - [ ] Sign Session JWT: `{ userId, role: 'teacher', name, roomId, batchId }`, 2h expiry, `SESSION_TOKEN_SECRET`
  - [ ] Return `{ roomId, sessionToken, batchId }`
- [ ] Add `POST /api/join-class`:
  - [ ] Protected by `requireAuth` + `requireRole('student')`
  - [ ] Validate enrollment: query `enrollments` where `student_id` + `batch_id` + `status = 'active'` → 403 if not enrolled
  - [ ] Validate active session: query `live_sessions` where `batch_id` + `status = 'live'` → 404 if no live session
  - [ ] Sign Session JWT: `{ userId, role: 'student', name, roomId, batchId }`, 2h expiry
  - [ ] Return `{ roomId, sessionToken }`
- [ ] Add `POST /api/end-class`:
  - [ ] Protected by `requireAuth` + `requireRole('teacher')`
  - [ ] Update `live_sessions`: set `status = 'completed'`, `ended_at = datetime('now')`
  - [ ] Return `{ ok: true }`
- [ ] Modify `POST /api/token`:
  - [ ] Verify Session JWT (signed with `SESSION_TOKEN_SECRET`) — keep existing logic but ensure `userId` is used as LiveKit identity instead of user-supplied `participantName`
  - [ ] Embed `role` in LiveKit metadata (unchanged behavior)
  - [ ] No enrollment re-check (reconnection policy)
- [ ] Delete `POST /api/create-session` (replaced by `/api/start-class`)
- [ ] Add `GET /api/my-batches`:
  - [ ] Protected by `requireAuth`
  - [ ] Teacher: return owned batches + enrolled student count + active session info
  - [ ] Student: return enrolled batches + teacher name + active session info
  - [ ] Include `activeSession: { roomId, startedAt } | null` per batch
- [ ] Add session cleanup sweep:
  - [ ] `setInterval` every 60 seconds after DB init
  - [ ] Query sessions: `status = 'live' AND started_at < datetime('now', '-2 hours')`
  - [ ] Update matched: `status = 'expired'`, `ended_at = datetime('now')`
  - [ ] `console.log` any auto-expired sessions for visibility
- [ ] Test all endpoints with curl/Postman before proceeding to frontend

---

## Phase 4: Frontend — Auth + Dashboard + Room Refactor
> **Goal**: Login page, auth context, role-based dashboard, refactored room page.

### 4a: Auth Layer
- [ ] Create `frontend/lib/auth.ts`:
  - [ ] `AuthContext` with React Context
  - [ ] `useAuth()` hook: `{ user, token, isLoading, login(email, password), logout() }`
  - [ ] `login()`: fetch `POST /api/auth/login`, store JWT in `localStorage`, decode user
  - [ ] `logout()`: clear `localStorage`, redirect to `/`
  - [ ] On mount: read token from `localStorage`, decode with `decodeJwt`, check expiry
  - [ ] If expired: clear token, set `user: null`
- [ ] Create `frontend/components/AuthProvider.tsx`:
  - [ ] Wrap children with `AuthContext.Provider`
- [ ] Modify `frontend/app/layout.tsx`:
  - [ ] Wrap `{children}` with `<AuthProvider>`

### 4b: Login Page
- [ ] Modify `frontend/app/page.tsx`:
  - [ ] Replace the "Host a Live Class" form with a login form (email + password)
  - [ ] Call `login()` from `useAuth()` on submit
  - [ ] Show loading spinner during login
  - [ ] Show error message on 401
  - [ ] On success: `router.push('/dashboard')`
  - [ ] If already logged in on mount: redirect to `/dashboard`
  - [ ] Style: same dark theme, glassmorphism card, indigo accents

### 4c: Dashboard Page
- [ ] Create `frontend/app/dashboard/page.tsx`:
  - [ ] Protected: redirect to `/` if not logged in
  - [ ] Fetch `GET /api/my-batches` on mount (with auth header)
  - [ ] Poll every 5 seconds for active session updates
  - [ ] **Teacher view**:
    - [ ] Header: "Welcome, {name}" + logout button
    - [ ] Batch cards: name, student count, status indicator (live/inactive)
    - [ ] "Start Class" button per batch → `POST /api/start-class` → redirect to `/room/{roomId}?sessionToken=...`
    - [ ] "End Class" button when session is active → `POST /api/end-class` → refresh batch list
    - [ ] Expandable student list per batch (names from `/api/my-batches`)
  - [ ] **Student view**:
    - [ ] Header: "Welcome, {name}" + logout button
    - [ ] Batch cards: name, teacher name, status
    - [ ] "Join Class" button per batch → disabled/gray when no active session, indigo/active when live
    - [ ] When active: `POST /api/join-class` → redirect to `/room/{roomId}?sessionToken=...`
    - [ ] Pulsing green dot on live batches for visual cue
  - [ ] Style: dark theme, consistent with existing design system

### 4d: Room Page Refactor
- [ ] Modify `frontend/app/room/[roomName]/page.tsx`:
  - [ ] Remove `studentToken` query param handling
  - [ ] Remove `name` query param handling (user identity comes from session JWT)
  - [ ] Keep `sessionToken` query param — now per-user
  - [ ] If `sessionToken` is missing/invalid: redirect to `/dashboard` (not error page)
  - [ ] Extract user name from decoded session JWT for display
  - [ ] Remove the teacher `isFullyConnected` bypass logic (PreJoinScreen always shows for device setup)
- [ ] Modify `frontend/components/classroom/PreJoinScreen.tsx`:
  - [ ] Remove the name input `<input>` field and its state
  - [ ] Display user's name from auth context or decoded JWT (read-only text)
  - [ ] Keep all device selection (mic/camera dropdowns) and toggle buttons
  - [ ] Adjust layout since the name field is gone
- [ ] Modify `frontend/components/VideoRoom.tsx`:
  - [ ] Remove `studentToken` prop from `VideoRoomProps` and `RoomContentProps`
  - [ ] Remove `handleCopyLink` callback and `isCopied` state
  - [ ] Remove `studentToken` passing to `Controls` component
  - [ ] Derive `userName` from session JWT payload instead of prop
  - [ ] Pass `roomName` (for host control API calls) to `ChatPanel`

---

## Phase 5: Session Lifecycle Cleanup
> **Goal**: Server-side sweep for stale sessions. Runs as part of Phase 3 but verified separately.

- [ ] Verify sweep runs on server startup (check console log)
- [ ] Test: manually insert a session with `started_at` = 3 hours ago → verify it gets auto-expired within 60 seconds
- [ ] Verify the "Join Class" button becomes inactive after session expires

---

## Phase 6: Revocation + Host Controls
> **Goal**: Teacher can kick students and remotely mute mic/camera.

### 6a: Backend Endpoints
- [ ] Initialize `RoomServiceClient` from `livekit-server-sdk` with `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, LiveKit server URL
- [ ] Add `POST /api/kick-participant`:
  - [ ] Protected by `requireAuth` + `requireRole('teacher')`
  - [ ] Body: `{ roomId, participantIdentity }`
  - [ ] Call `roomService.removeParticipant(roomId, participantIdentity)`
  - [ ] Return `{ ok: true }`
- [ ] Add `POST /api/mute-participant`:
  - [ ] Protected by `requireAuth` + `requireRole('teacher')`
  - [ ] Body: `{ roomId, participantIdentity, trackType: 'audio' | 'video', muted: boolean }`
  - [ ] Call `roomService.listParticipants(roomId)` to find the participant
  - [ ] Find the matching track (audio or video) from participant's published tracks
  - [ ] Call `roomService.mutePublishedTrack(roomId, participantIdentity, trackSid, muted)`
  - [ ] Return `{ ok: true }` or `{ error: 'Participant or track not found' }`

### 6b: Frontend Host Controls UI
- [ ] Modify `frontend/components/classroom/ChatPanel.tsx`:
  - [ ] In the **Participants** tab, for each non-local student participant (teacher view only):
    - [ ] Add "Mute Mic" / "Unmute Mic" toggle button (based on `p.isMicrophoneEnabled`)
    - [ ] Add "Disable Cam" / "Enable Cam" toggle button (based on `p.isCameraEnabled`)
  - [ ] On click: call `POST /api/mute-participant` with LMS auth JWT from `localStorage`
  - [ ] Show loading state on the button during API call
  - [ ] LiveKit SDK auto-updates the participant's `isMicrophoneEnabled` / `isCameraEnabled` reactively — no manual state sync needed
  - [ ] Style: small icon buttons matching existing participant row design (red tint when muted)

---

## Post-Implementation Verification
- [ ] Full flow: seed → login teacher → start class → login student → join class → video room works
- [ ] Unenrolled student cannot join
- [ ] Student without login cannot access `/dashboard` or `/room/...`
- [ ] Page refresh mid-call reconnects without re-login
- [ ] Teacher mutes a student's mic → student's mic turns off
- [ ] Teacher disables a student's camera → student's camera turns off
- [ ] Teacher kicks a student → student is disconnected
- [ ] Session auto-expires after 2 hours (test with short timeout)
- [ ] Whiteboard still works in the room (no regression)
- [ ] Chat still works (no regression)
- [ ] PDF export still works (no regression)
