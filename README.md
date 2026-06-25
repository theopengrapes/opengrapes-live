# LiveCollab — Video Calls with Collaborative Whiteboard

Real-time video calling with a **collaborative whiteboard**, built with LiveKit, Next.js, and Tldraw.

## Features

- **Video & Audio Calls** — WebRTC-powered via LiveKit SFU
- **Collaborative Whiteboard** — Real-time drawing sync with cursor presence (powered by tldraw + @tldraw/sync)
- **TURN Server** — Metered.ca TURN credentials for cross-network calls
- **LAN Hosting** — Host from your laptop and share with friends

## Tech Stack

- **Frontend**: Next.js 16, TypeScript, Tailwind CSS v4
- **Video/Audio**: LiveKit (`@livekit/components-react`, `livekit-client`)
- **Whiteboard**: Tldraw v5 + `@tldraw/sync` (real-time collaborative sync)
- **Backend**: Express.js with LiveKit Server SDK
- **Infrastructure**: LiveKit server via Docker, Metered.ca TURN

## Prerequisites

- **Docker Desktop** — [Download](https://www.docker.com/products/docker-desktop/)
- **Node.js 20+** — [Download](https://nodejs.org/)
- **npm** (comes with Node.js)

## Environment Variables

### Backend (`backend/.env`)
```env
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
PORT=3001
METERED_API_KEY=your_metered_api_key
METERED_APP_NAME=your_metered_app_name
```

### Frontend (`frontend/.env.local`)
```env
NEXT_PUBLIC_LIVEKIT_URL=ws://YOUR_IP:7880
NEXT_PUBLIC_BACKEND_URL=http://YOUR_IP:3001
```

## Port Summary

| Service | Port |
|---------|------|
| Next.js frontend | 3000 |
| Express backend | 3001 |
| LiveKit signaling | 7880 |
| LiveKit TURN/TCP | 7881 |
| LiveKit TURN/UDP | 7882 |

## Quick Start (3 terminals)

### Terminal 1 — LiveKit SFU Server (Docker)

```bash
docker compose up
```

Wait for `ready` log message before proceeding.

### Terminal 2 — Express Backend (token generation + TURN)

```bash
cd backend
npm install    # first time only
npm run dev
```

Should print: `Backend running on http://0.0.0.0:3001`

### Terminal 3 — Next.js Frontend

```bash
cd frontend
npm install    # first time only
npm run dev
```

Should print: `Ready on http://localhost:3000`

## Test Locally

1. Open **http://localhost:3000** in your browser
2. Enter your name and a room name (e.g., `test-room`), click **Join Room**
3. Allow camera/microphone access when prompted
4. Open a **second browser tab** (or a different browser)
5. Go to **http://localhost:3000**, enter a **different name** but the **same room name**
6. Both tabs should see each other's video and hear audio
7. Draw on the whiteboard — it syncs in real-time between both tabs!
8. You should see the other user's cursor with their name label

## Test with a Friend (over the internet)

1. Find your local IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
2. Update `frontend/.env.local` and `livekit.yaml` with your IP
3. Share your IP with your friend: `http://YOUR_IP:3000`
4. Make sure ports 3000, 3001, 7880 are open in your firewall
5. Both join the same room name — video + whiteboard will sync!

> **Note**: TURN server (Metered.ca) is required for cross-network calls where direct peer-to-peer connections are blocked by NAT/firewalls.

## Project Structure

```
├── docker-compose.yml         # LiveKit server Docker setup
├── livekit.yaml               # LiveKit server config
├── backend/                   # Express API server
│   ├── src/index.ts           # Token + TURN endpoints
│   ├── .env                   # API keys (not committed)
│   └── package.json
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Join page
│   │   └── room/
│   │       └── [roomName]/
│   │           └── page.tsx   # Video call + whiteboard room
│   ├── components/
│   │   ├── VideoRoom.tsx      # LiveKit room + whiteboard layout
│   │   ├── Whiteboard.tsx     # Tldraw collaborative whiteboard
│   │   └── WhiteboardWrapper.tsx  # SSR-safe dynamic import
│   ├── lib/
│   │   └── api.ts             # Backend API helpers
│   └── .env.local             # Frontend env vars
└── README.md
```

## Dev Credentials (local only)

- **LiveKit API Key**: `devkey`
- **LiveKit API Secret**: `secret`

> ⚠️ These are hardcoded for local development only. Never use in production.
