# Video Classroom UI — Design & Implementation Prompt

## Project Context

Build a **live video classroom interface** for an edtech SaaS platform targeting independent Indian creator-educators. This is the **student-facing view** during a live session. The product competes with Classplus and Appx but aims to feel closer to a premium tool like Linear or Vercel — polished, intentional, and fast.

---

## Tech Stack

### Frontend
- **Framework**: Next.js 16 (App Router) — handles routing, SSR for landing pages, and proxies API requests to the backend to avoid CORS issues
- **Language**: TypeScript (strict) — typed interfaces for room tokens, ICE candidates, layout states, and participant objects; no `any`
- **Styling**: Tailwind CSS v4 + CSS custom properties — tokens defined via `@theme` in CSS (not `tailwind.config.js`, which is removed in v4)
- **Font**: Rubik via `next/font/google`, applied at root layout
- **Video SDK**: `livekit-client` + `@livekit/components-react` — renders participant tiles, manages local mic/camera/screenshare, detects active speakers via `useParticipants()` and `useSpeakingParticipants()` hooks; Dynacast and Adaptive Stream enabled for resolution scaling
- **Whiteboard**: `tldraw` + `@tldraw/sync` — infinite canvas with pen, text, shapes, and multiplayer cursors; synced via Yjs CRDT over WebSocket

### Backend API
- **Framework**: Express.js (Node.js)
- **Auth / Token Signing**: `livekit-server-sdk` — signs short-lived JWT access tokens per participant containing identity + permissions (`canPublish`, `canSubscribe`, `canPublishData`)
- **TURN Credential Bridge**: Fetches dynamic ICE/TURN credentials on demand from **Metered.ca (OpenRelay)** REST API and forwards them to the client

### Whiteboard Sync Server
- **Protocol**: WebSockets (`ws`)
- **Sync Engine**: **Yjs** via `y-websocket` — CRDT-based conflict resolution; all canvas state is resolved server-side and broadcast to all connected clients so boards stay identical

### Infrastructure
- **SFU (Media Router)**: LiveKit Server — hosted on LiveKit Cloud or self-hosted via Docker; clients send one video stream to the SFU, SFU routes it to all other participants (no P2P mesh)
- **NAT Traversal**:
  - STUN: discovers public IP/port for direct UDP connections
  - TURN (OpenRelay): fallback relay over port 443 TCP/TLS for clients behind symmetric NAT or restrictive mobile networks

---

## Design Tokens

### Color Palette

```
--bg-base: #0D0D12        /* near-black, slightly blue-tinted — primary background */
--bg-surface: #14141C     /* tile/card backgrounds */
--bg-elevated: #1C1C28    /* hover states, modals, control bar */
--border-subtle: #2A2A3D  /* tile borders, dividers */
--accent-primary: #7C5CFC /* violet — active states, speaking indicator, CTAs */
--accent-glow: #9D7FFF    /* lighter violet — hover, secondary accents */
--text-primary: #F0EEFF   /* near-white with violet tint */
--text-muted: #6B6A85     /* labels, secondary info */
--danger: #FF4C6A         /* end call button */
--success: #3DDC97        /* mic-on, joined indicator */
```

### Typography (Rubik)

```
font-family: 'Rubik', sans-serif

Display  : 500 weight, 15px, letter-spacing: -0.01em  (session title)
Label    : 400 weight, 12px, text-muted               (name tags, hover labels)
Button   : 500 weight, 13px                            (control tooltips)
Badge    : 600 weight, 10px, uppercase, tracking-wide  (HOST badge)
```

### Border Radius

```
--radius-tile: 16px      /* video tiles */
--radius-control: 999px  /* control buttons — fully rounded pill */
--radius-pill: 999px     /* control bar container */
--radius-badge: 6px      /* HOST badge, name chip */
```

### Motion

```
Tile entrance    : opacity 0→1 + scale 0.95→1, duration 250ms, ease-out
Whiteboard slide : translateX(100%) → 0, duration 320ms, cubic-bezier(0.22, 1, 0.36, 1)
Grid reflow      : all tiles animate position via CSS grid transition, 280ms ease-in-out
Name hover chip  : opacity 0→1 + translateY(4px→0), 150ms ease-out
Speaking border  : border-color transition to --accent-primary, 100ms — no pulse, no glow
```

---

## Layout Architecture

### Mode A — Grid Mode (no whiteboard/screenshare active)

**Teacher tile is always pinned and 2x the width of a student tile.**

```
┌─────────────────────────────────────────────────────────────────┐
│  [Session Title]  [Time]                         [Participants] │
├──────────────────────────┬──────────────┬──────────────────────┤
│                          │              │                       │
│   TEACHER TILE (2x wide) │  Student 1   │     Student 2         │
│                          │              │                       │
│   HOST badge top-left    ├──────────────┼──────────────────────┤
│   Name chip on hover     │              │                       │
│                          │  Student 3   │     Student 4         │
│                          │              │                       │
└──────────────────────────┴──────────────┴──────────────────────┘
                    [ ── floating pill controls ── ]
```

CSS Grid logic:
- Container: `grid-template-columns: 2fr 1fr 1fr`
- Teacher tile: `grid-row: span 2` (fills left column, full height)
- Student tiles: fill remaining cells in order
- As participants join (up to 5), grid reflows smoothly — tile positions animate with `transition: all 280ms ease-in-out`

### Mode B — Whiteboard / Screenshare Active

**Whiteboard/screen fills ~72% of the width. Right sidebar shows teacher video (pinned top) + student tiles stacked below.**

```
┌──────────────────────────────────────────────────────────────┐
│  [Session Title]  [Time]                      [Participants] │
├────────────────────────────────────┬─────────────────────────┤
│                                    │  ┌─────────────────────┐│
│                                    │  │  Teacher Video      ││
│   Whiteboard / Screenshare         │  │  [HOST] pinned      ││
│   (Tldraw or screen feed)          │  └─────────────────────┘│
│                                    │  ┌─────────────────────┐│
│                                    │  │  Student 1          ││
│                                    │  └─────────────────────┘│
│                                    │  ┌─────────────────────┐│
│                                    │  │  Student 2          ││
│                                    │  └─────────────────────┘│
│                                    │  ┌─────────────────────┐│
│                                    │  │  Student 3 / Self   ││
└────────────────────────────────────┴──┴─────────────────────┘┘
                    [ ── floating pill controls ── ]
```

Transition: When teacher opens whiteboard, the grid mode animates out and the sidebar slides in from the right (`translateX(100%) → 0`, 320ms). The content area simultaneously expands to fill the vacated space.

---

## Component Specs

### Video Tile

```
- bg: --bg-surface
- border: 1.5px solid --border-subtle (default)
- border-color: --accent-primary when speaking (transition: 100ms)
- border-radius: 16px
- overflow: hidden
- Avatar fallback: centered initials in Rubik 500, bg: --bg-elevated, color: --accent-glow

Name chip (hover only):
- position: absolute, bottom: 10px, left: 10px
- bg: rgba(13, 13, 18, 0.75), backdrop-blur: 6px
- border-radius: 6px, padding: 3px 8px
- font: Rubik 400, 12px, --text-primary
- transition: opacity 150ms + translateY(4px→0)
- DO NOT show name chip by default — hover only

HOST badge (teacher tile only):
- position: absolute, top: 10px, left: 10px
- bg: --accent-primary, color: white
- font: Rubik 600, 10px, uppercase, letter-spacing: 0.08em
- border-radius: 6px, padding: 2px 7px
- Always visible, not hover-dependent

Mic muted indicator:
- Small icon bottom-right of tile
- bg: rgba(255,76,106,0.15), icon color: --danger
- Only visible when muted
```

### Floating Control Bar (Pill)

```
- position: fixed, bottom: 24px, left: 50%, transform: translateX(-50%)
- bg: --bg-elevated
- border: 1px solid --border-subtle
- border-radius: 999px
- padding: 10px 20px
- display: flex, gap: 8px, align-items: center
- backdrop-filter: blur(12px)

Buttons (icon only):
- size: 44px × 44px
- border-radius: 999px
- bg: --bg-surface (default), --bg-base on hover
- icon color: --text-primary
- transition: background 150ms
- NO glow, NO shadow on hover — just subtle bg shift

Active state (mic on, cam on):
- bg: rgba(124, 92, 252, 0.15)
- icon color: --accent-glow

End Call button:
- bg: --danger
- icon color: white
- hover: bg darkens by 10%

Separator between groups:
- 1px vertical line, --border-subtle, height: 24px, margin: 0 4px

Button order: [Mic] [Camera] | [Screenshare] [Whiteboard] | [End Call]

Tooltips: show on hover, above button, Rubik 400 12px, --bg-elevated bg, 999px radius, 150ms fade
```

### Header Bar

```
- position: fixed top, full width
- bg: rgba(13, 13, 18, 0.8), backdrop-filter: blur(10px)
- border-bottom: 1px solid --border-subtle
- height: 52px, px: 20px
- Left: Session title (Rubik 500, 14px, --text-primary) + time range (Rubik 400, 12px, --text-muted)
- Right: Participants icon button (shows count badge)
- NO logo, NO nav — clean utility bar only
```

### Join Role Modal (on entry)

```
- Centered modal, bg: --bg-surface, border-radius: 20px
- border: 1px solid --border-subtle
- Heading: "Are you the host of this session?" Rubik 500, 18px
- Two large rounded buttons stacked or side-by-side:
  - "I'm the Teacher" — bg: --accent-primary, color: white
  - "I'm a Student" — bg: --bg-elevated, color: --text-primary, border: 1px solid --border-subtle
- Subtext: Rubik 400, 12px, --text-muted: "Host controls will be enabled after verification."
- Backdrop: rgba(0,0,0,0.6) blur behind modal
```

---

## Interaction Logic (implement as state stubs)

### Participant Join/Leave

```typescript
// Drive the tile grid from LiveKit's useParticipants() hook:
// const participants = useParticipants()
// Teacher participant is identified by metadata role === 'teacher' set at token-signing time
// Filter: const teacher = participants.find(p => JSON.parse(p.metadata).role === 'teacher')
// Filter: const students = participants.filter(p => JSON.parse(p.metadata).role !== 'teacher')

// When a new participant joins (LiveKit fires a participantConnected event):
// 1. useParticipants() updates → React re-renders grid
// 2. New tile appears with entrance animation (opacity + scale, 250ms)
// 3. CSS Grid reflows — existing tiles animate to new positions (280ms)
// 4. Teacher tile always stays pinned at col-span position — never moves
// 5. Max ~5 participants for now — no overflow handling needed yet
```

### Whiteboard / Screenshare Toggle

```typescript
// Whiteboard open/close is broadcast via LiveKit's data channel (not Yjs):
// Teacher publishes a room data message: { type: 'whiteboard', action: 'open' | 'close' }
// All participants receive it via useDataChannel() and update layoutMode accordingly
// Students' whiteboard button is hidden — only teacher can trigger open/close

// When teacher triggers whiteboard:
// 1. Teacher publishes data message → all clients receive → layoutMode: 'grid' → 'sidebar'
// 2. Whiteboard panel (<Tldraw /> connected to @tldraw/sync) slides in from right (320ms)
// 3. @tldraw/sync connects to the Yjs WebSocket server — all drawing is CRDT-synced
// 4. All student tiles + teacher tile reflow into right sidebar (stacked)
// 5. Teacher tile stays pinned at top of sidebar — always first
// 6. Control bar whiteboard button bg changes to active state (violet tint)

// When teacher closes whiteboard:
// 1. Teacher publishes data message → all clients receive → layoutMode: 'sidebar' → 'grid'
// 2. Reverse animation — sidebar collapses, grid mode restores (280ms)
// 3. @tldraw/sync disconnects — canvas state is preserved on Yjs server for the session
// Students cannot trigger close — whiteboard button renders as disabled for role === 'student'

// Collaborative permission (student requests whiteboard access):
// Student publishes data message: { type: 'whiteboard-request', from: participantIdentity }
// Teacher receives it, shows permission toast UI, approves/denies
// Approval message: { type: 'whiteboard-grant', to: participantIdentity }
// Granted student gets canDraw: true — their @tldraw/sync instance switches from readonly to edit mode
```

### Speaking Indicator

```typescript
// Drive from LiveKit's useSpeakingParticipants() hook:
// const speakingParticipants = useSpeakingParticipants()
// const isSpeaking = speakingParticipants.some(p => p.identity === participant.identity)

// When isSpeaking === true:
// tile border transitions to --accent-primary (1.5px → 2px, 100ms)
// No pulse animation — just a clean colored border
// LiveKit fires speaking events with ~800ms debounce built-in — no manual timeout needed
```

### Screenshare vs Whiteboard

```
- Both use Mode B layout (sidebar mode)
- Screenshare: shows video feed in main content area
- Whiteboard: shows Tldraw canvas in main content area
- Only one can be active at a time
- If teacher switches from screenshare to whiteboard, main content area cross-fades (200ms)
```

---

## What NOT to Do (anti-AI-slop rules)

- No gradients on tiles or backgrounds — flat, disciplined dark colors only
- No box shadows on tiles — borders do the work
- No animated gradient borders (the "AI glow" look)
- No card hover lift/shadow effects
- No emoji in the UI
- No rounded squares for icons — use icon libraries (Lucide or Phosphor)
- No hero sections, no marketing copy — this is a utility UI
- No skeleton loaders that pulse with gradient — use simple opacity fade instead
- Name chips are hover-only — never floating labels visible by default
- Control bar tooltips: plain, no arrow decorations
- Do not add features not listed here (no reactions panel, no chat, no recording button)

---

## File Structure Suggestion

```
/app
  /classroom/[roomId]
    page.tsx                 ← fetches LiveKit token from API, renders ClassroomLayout

/components
  /classroom
    ClassroomLayout.tsx      ← switches between 'grid' and 'sidebar' layoutMode
    VideoTile.tsx            ← single participant tile (uses useParticipant hook)
    TeacherTile.tsx          ← pinned teacher tile variant (role === 'teacher')
    ControlBar.tsx           ← floating pill; teacher/student role controls visibility
    SidebarPanel.tsx         ← right sidebar in sidebar mode (stacked tiles)
    WhiteboardPanel.tsx      ← <Tldraw /> connected to @tldraw/sync; readonly for students
    JoinRoleModal.tsx        ← host/student selection on entry (stubs role in metadata)
    Header.tsx               ← session title + time + participants count

/lib
  livekit.ts                 ← token fetch helper (calls /api/token)
  useWhiteboardSync.ts       ← hook: listens to LiveKit data channel for whiteboard events
  useParticipantRole.ts      ← hook: parses role from participant.metadata

/api
  /token/route.ts            ← POST: validates request, calls livekit-server-sdk, returns JWT
  /turn/route.ts             ← GET: fetches OpenRelay TURN credentials, forwards to client

/styles
  globals.css                ← @import "tailwindcss"; @theme { ...all tokens... }
```

---

## Final Notes for the Generator

- **Tailwind v4 token setup**: do NOT use `tailwind.config.js` to extend colors — that pattern is removed in v4. Define all design tokens using the `@theme` directive in your global CSS file instead:
  ```css
  @import "tailwindcss";

  @theme {
    --color-bg-base: #0D0D12;
    --color-bg-surface: #14141C;
    --color-bg-elevated: #1C1C28;
    --color-border-subtle: #2A2A3D;
    --color-accent-primary: #7C5CFC;
    --color-accent-glow: #9D7FFF;
    --color-text-primary: #F0EEFF;
    --color-text-muted: #6B6A85;
    --color-danger: #FF4C6A;
    --color-success: #3DDC97;
    --radius-tile: 16px;
    --radius-pill: 999px;
    --radius-badge: 6px;
  }
  ```
  Once defined in `@theme`, use them as standard Tailwind utilities: `bg-bg-base`, `text-text-muted`, `border-border-subtle`, etc. Do not reach for `bg-purple-500` or any default Tailwind palette color.
- Rubik must be imported via `next/font/google` and applied to the root layout
- All transitions must respect `prefers-reduced-motion: reduce` — wrap motion in `@media (prefers-reduced-motion: no-preference)`
- The layout is desktop-first — do not add mobile breakpoints unless explicitly asked
- Use Lucide React for all icons
- Do not add TypeScript `any` types — stub with proper interfaces even if logic is empty
