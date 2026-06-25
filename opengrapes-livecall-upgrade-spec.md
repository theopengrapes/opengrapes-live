# OpenGrapes — Live Class Module: Implementation Spec

## Context

OpenGrapes is an LMS for independent creator-educators in India. The live-class
module (video call + collaborative whiteboard) is built on:

- **Frontend**: Next.js, `@livekit/components-react` for video, `tldraw` for
  the whiteboard (currently using `useSyncDemo`, pointing at tldraw's public
  demo sync server)
- **Backend**: Express.js, using `livekit-server-sdk` to issue room-join JWTs
  via `/api/token`, plus a TURN-credential caching layer (Metered.ca)
- **Media server**: LiveKit Cloud (not self-hosted — do not propose
  self-hosted LiveKit or VPS-based SFU clustering)

**Target scale**: 10–15 students per class, up to 4 batches/day, design with
headroom to ~30–50 concurrent users. This is NOT a 500-user problem. Do not
introduce infrastructure intended for that scale (no Hetzner/Contabo VPS
plans, no LiveKit clustering, no multi-region setups).

**Product context**: One paying teacher has validated the need. She currently
uses Google Meet + OneNote + WhatsApp and wants all three replaced, plus PDF
notes delivered to students after class. The cofounder is building the
fees/tests/LMS side; this spec covers only the live-call + whiteboard module.

---

## Priority order

Work through these in order. Each phase should be independently testable
before moving to the next.

1. Self-host tldraw sync on Cloudflare (unlocks whiteboard reconnection AND
   is a prerequisite for PDF export)
2. Lightweight room-token auth on `/api/token`
3. Whiteboard → PDF export pipeline
4. LiveKit reconnection UX polish
5. Screen share quality tuning

---

## Phase 1: Self-host tldraw sync (Cloudflare Durable Objects)

### Goal
Replace `useSyncDemo` (public tldraw demo server — no persistence, no
privacy, rate-limited) with a self-hosted sync backend using Cloudflare
Workers + Durable Objects + R2.

### Reference
Base this on the official `tldraw/tldraw-sync-cloudflare` template repo. It
provides:
- A Durable Object per whiteboard room (`TldrawDurableObject.ts`)
- R2 bucket storage for room state and any pasted images/video
- WebSocket sync, with link-preview unfurling (can be stripped if unused)

### Tasks
- [ ] Clone/adapt `tldraw/tldraw-sync-cloudflare` into a `whiteboard-sync/`
  directory in the monorepo (or as a separate deployable package — agent's
  choice based on repo structure)
- [ ] Wire the existing frontend `Whiteboard.tsx` to use `useSync` (pointing
  at the new self-hosted Worker URL) instead of `useSyncDemo`
- [ ] Each class session should map to a unique tldraw room ID — derive this
  from the existing LiveKit room/session ID so whiteboard and video call share
  one identifier
- [ ] Confirm room state persists across page refresh/reconnect (this is the
  whiteboard's reconnection story — no separate reconnect logic needed if this
  works correctly)
- [ ] Ensure each tldraw room maps to a **multi-page document with sensible
  page boundaries** (not one infinite single-page canvas) — this matters for
  Phase 3 PDF export. Default to one tldraw "page" = one notes page.

### 🔴 USER ACTION REQUIRED
- [ ] **Create/verify Cloudflare account** and provide the agent with
  Cloudflare account ID + API token (Workers + R2 + Durable Objects
  permissions) so the Worker can be deployed
- [ ] **Decide on a subdomain** for the sync Worker (e.g.
  `sync.opengrapes.com` or a `workers.dev` URL for now) and configure DNS if a
  custom domain is wanted
- [ ] After deploy, **manually verify billing tier** in Cloudflare dashboard —
  confirm Durable Objects + R2 usage stays within free tier limits during
  initial testing (SQLite-backed Durable Object storage billing changes are
  rolling out around Jan 2026 — just confirm no unexpected charges appear)

### Cost target
$0/month at current scale (free tier: ~3M DO requests/month, 10GB R2 storage,
1M R2 operations/month — comfortably covers 4 classes/day).

---

## Phase 2: Lightweight auth on `/api/token`

### Goal
Prevent unauthenticated users from requesting LiveKit join tokens for
arbitrary rooms. This is NOT a full user-account/login system — it's a
signed, time-limited session token tied to a class.

### Tasks
- [ ] When a teacher creates/schedules a class session, generate a signed
  token (e.g. JWT or HMAC-signed payload) containing: room ID, session
  expiry timestamp, and role (teacher/student)
- [ ] Embed this signed token in the join link shared with students (as a
  query param)
- [ ] Modify `/api/token` (in `index.ts`) to:
  - Require this signed session token as a request parameter
  - Verify signature + expiry before issuing a LiveKit JWT
  - Reject requests with missing/invalid/expired session tokens (401)
- [ ] Ensure the existing TURN-credential caching logic (`index.ts:L89-L92`)
  is unaffected — auth check happens before that logic runs, not instead of it
- [ ] Set a reasonable session token expiry (e.g. class duration + 30 min
  buffer) so links can't be reused indefinitely

### 🔴 USER ACTION REQUIRED
- [ ] **Generate and securely store a signing secret** (e.g. via environment
  variable `SESSION_TOKEN_SECRET`) — agent should generate a strong random
  value, but user must add it to their deployment environment (Vercel/hosting
  env vars) and NOT commit it to the repo
- [ ] **Decide where "create class session" happens in the current flow** —
  if this doesn't exist yet as a concept (vs. ad-hoc room creation), user needs
  to confirm with agent how teachers currently generate a room link today, so
  the signed-token step can be inserted at the right point without breaking
  existing flow

---

## Phase 3: Whiteboard → PDF export pipeline

### Goal
After a class ends, generate a PDF of the whiteboard's pages and make it
available to students via the LMS (handoff point: a stored file reference,
likely in R2, that the cofounder's LMS notes feature can link to).

### Tasks
- [ ] Add an "End class" action (teacher-only) that triggers export
- [ ] For each tldraw page in the session's whiteboard document:
  - Use `editor.getCurrentPageShapeIds()` + `editor.toImage(shapeIds, {
    format: 'svg', background: true })` to export each page as SVG (fallback
    to PNG if SVG export has issues with certain shape types — test both)
  - If a page has zero shapes, skip it (don't generate a blank PDF page)
- [ ] Client-side, assemble the exported page images into a single PDF using
  `jsPDF` (one image per PDF page, sized to fit)
- [ ] Upload the resulting PDF to the R2 bucket (same bucket as the tldraw
  sync setup from Phase 1 — use a separate path/prefix, e.g.
  `notes-pdfs/{sessionId}.pdf`)
- [ ] Store a reference (R2 object key or signed URL) associated with the
  class session in the database, in a format the cofounder's LMS notes
  feature can query/display
- [ ] Handle the case where the teacher forgets to click "End class" —
  consider an auto-trigger on room close/last-participant-leaves as a fallback
  (lower priority, can be phase 3b)

### 🔴 USER ACTION REQUIRED
- [ ] **Coordinate with cofounder** on the exact schema/format for how
  "notes for session X" should be stored/referenced so the LMS side can
  display it to students — agent should NOT invent this schema unilaterally
  if the cofounder's notes feature already has a data model
- [ ] **Confirm** whether students should get notes automatically after class
  ends, or only after teacher reviews/approves — this is a product decision,
  not a technical one

---

## Phase 4: LiveKit reconnection UX

### Goal
Make connection drops/recoveries visible and graceful instead of silent
freezes, using LiveKit's built-in reconnection (do not build custom retry
logic — the SDK already handles exponential backoff with jitter).

### Tasks
- [ ] Add `useConnectionState` (or the `<ConnectionState />` component) to
  `VideoRoom.tsx` to surface connection status: "Connecting...",
  "Reconnecting...", "Disconnected" to the user
- [ ] **Audit `VideoRoom.tsx` for unnecessary `<LiveKitRoom>` remounts** —
  check that token/serverUrl/options props passed to `<LiveKitRoom>` are
  stable across re-renders (memoized, not recreated on every render). Unstable
  props cause "Client initiated disconnect" loops that look like network lag
  but are actually self-inflicted
- [ ] On "Disconnected" (not "Reconnecting") state, show a manual "Rejoin"
  button as a last-resort fallback
- [ ] Test by throttling network in browser devtools and toggling
  airplane mode on a phone mid-call — verify the video call recovers without a
  full page reload, and the whiteboard re-syncs (should work automatically per
  Phase 1)

### 🔴 USER ACTION REQUIRED
None — this phase is fully agent-implementable and testable without external
accounts.

---

## Phase 5: Screen share quality tuning

### Goal
Improve screen-share legibility (text/code clarity) without increasing
LiveKit Cloud costs.

### Tasks
- [ ] Locate where screen-share tracks are published (likely via
  `useTrackToggle` or direct `localParticipant.setScreenShareEnabled()`)
- [ ] Set screen-share-specific publish options: higher resolution
  (e.g. 1080p) and a bitrate appropriate for mostly-static content (screen
  share with text doesn't need high frame rate — 5-15fps is often sufficient
  and reduces bandwidth vs. camera video)
- [ ] Verify simulcast is enabled (LiveKit Cloud default) so students on
  weaker connections automatically get a lower-quality layer
- [ ] No infra changes — this is purely a publish-options config change

### 🔴 USER ACTION REQUIRED
- [ ] **Check current LiveKit Cloud plan's bandwidth/participant-minute
  quota** in the LiveKit Cloud dashboard after Phase 1-4 are live and the team
  has run a few real classes — confirm usage is comfortably within the current
  plan before/after this tuning. No action needed unless usage is unexpectedly
  high.

---

## Out of scope (explicitly deferred — do not implement)

- Self-hosted LiveKit / VPS-based SFU
- LiveKit clustering / multi-node / Redis message broker
- Migration away from LiveKit Cloud
- Active-speaker pagination / video grid pagination for large rooms (revisit
  only if/when class sizes regularly exceed ~30)
- Full user account/login system (Phase 2 auth is intentionally lightweight)
- Coturn or alternative TURN providers (Metered.ca caching logic stays as-is)
