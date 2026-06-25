# VSCode Agent Prompt — LiveKit Video Call + Whiteboard Prototype (Local)

## Project Overview

Build a local prototype of a real-time video calling web application with a collaborative whiteboard. This is a full-stack project using LiveKit as the SFU (media server), OpenRelay as the TURN server, and Tldraw for the collaborative whiteboard. The goal is to get a working prototype running entirely on localhost — no cloud deployment needed yet.

---

## Tech Stack

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Video/Audio SDK**: `@livekit/components-react` and `livekit-client`
- **Whiteboard**: `@tldraw/tldraw` with Yjs for multiplayer sync
- **Yjs WebSocket provider**: `y-websocket`

### Backend
- **Runtime**: Node.js
- **Framework**: Express.js
- **LiveKit Server SDK**: `livekit-server-sdk` (for generating access tokens)
- **Yjs WebSocket server**: `y-websocket` (standalone server for whiteboard sync)

### Infrastructure (local)
- **SFU**: LiveKit server running locally via Docker
- **TURN**: OpenRelay (cloud, free — credentials fetched via their REST API)
- **Whiteboard sync**: y-websocket server running locally on a separate port

---

## Architecture

```
Browser (Next.js frontend)
├── LiveKit Components  →  LiveKit Server (Docker, localhost:7880)  →  WebRTC media
├── Tldraw             →  y-websocket server (localhost:1234)        →  whiteboard sync
└── REST calls         →  Express API server (localhost:3001)        →  token generation
```

The Express backend has one primary job: generate LiveKit JWT access tokens so the frontend can join rooms securely. It also fetches OpenRelay TURN credentials and passes them to the frontend.

---

## Project Structure

```
/
├── frontend/                  # Next.js app
│   ├── app/
│   │   ├── page.tsx           # Landing/join page
│   │   └── room/
│   │       └── [roomName]/
│   │           └── page.tsx   # The actual video call + whiteboard room
│   ├── components/
│   │   ├── VideoRoom.tsx      # LiveKit room wrapper
│   │   ├── Whiteboard.tsx     # Tldraw multiplayer whiteboard
│   │   └── RoomLayout.tsx     # Layout: video on left, whiteboard on right
│   ├── lib/
│   │   └── api.ts             # API helper functions (token fetch, etc.)
│   └── package.json
│
├── backend/                   # Express API server
│   ├── src/
│   │   └── index.ts           # Express server — token endpoint + TURN endpoint
│   └── package.json
│
├── ybserver/                  # Yjs WebSocket server for whiteboard
│   ├── server.js              # y-websocket server
│   └── package.json
│
├── docker-compose.yml         # LiveKit server local setup
├── livekit.yaml               # LiveKit server config
└── README.md
```

---

## Step-by-Step Implementation

### Step 1 — LiveKit Local Server (Docker)

Create `docker-compose.yml`:

```yaml
version: '3'
services:
  livekit:
    image: livekit/livekit-server:latest
    command: --config /etc/livekit.yaml
    ports:
      - "7880:7880"      # HTTP/WebSocket signaling
      - "7881:7881"      # TURN/TCP
      - "7882:7882/udp"  # TURN/UDP
    volumes:
      - ./livekit.yaml:/etc/livekit.yaml
```

Create `livekit.yaml`:

```yaml
port: 7880
rtc:
  tcp_port: 7881
  udp_port: 7882
  use_external_ip: false

keys:
  devkey: secret

logging:
  level: debug

turn:
  enabled: false   # We use OpenRelay externally, not LiveKit's built-in TURN
```

**Important**: `devkey` is the API key and `secret` is the API secret. Use these exact values for local development — they are hardcoded throughout this prototype. Never use these in production.

---

### Step 2 — Backend Express Server

#### `backend/package.json`
```json
{
  "name": "video-backend",
  "version": "1.0.0",
  "scripts": {
    "dev": "ts-node-dev src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "cors": "^2.8.5",
    "dotenv": "^16.0.0",
    "express": "^4.18.0",
    "livekit-server-sdk": "^2.0.0",
    "node-fetch": "^3.3.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.13",
    "@types/express": "^4.17.17",
    "@types/node": "^20.0.0",
    "ts-node-dev": "^2.0.0",
    "typescript": "^5.0.0"
  }
}
```

#### `backend/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { AccessToken } from 'livekit-server-sdk';

const app = express();
app.use(cors());
app.use(express.json());

const LIVEKIT_API_KEY = 'devkey';
const LIVEKIT_API_SECRET = 'secret';

// POST /api/token
// Body: { roomName: string, participantName: string }
// Returns: { token: string }
app.post('/api/token', async (req, res) => {
  const { roomName, participantName } = req.body;

  if (!roomName || !participantName) {
    return res.status(400).json({ error: 'roomName and participantName are required' });
  }

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: participantName,
    ttl: '1h',
  });

  at.addGrant({
    roomJoin: true,
    room: roomName,
    canPublish: true,
    canSubscribe: true,
  });

  const token = await at.toJwt();
  res.json({ token });
});

// GET /api/turn
// Returns OpenRelay TURN credentials for the frontend to use
// OpenRelay gives 20GB/month free — no API key needed for basic usage
app.get('/api/turn', (req, res) => {
  // OpenRelay free TURN credentials — these are the public static credentials
  // For production, fetch dynamic credentials from https://www.metered.ca/api/v1/turn/credentials
  const iceServers = [
    { urls: 'stun:stun.openrelay.metered.ca:80' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turns:openrelay.metered.ca:443?transport=tcp',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ];
  res.json({ iceServers });
});

app.listen(3001, () => {
  console.log('Backend running on http://localhost:3001');
});
```

**Note**: OpenRelay's static public credentials above are suitable for prototyping. For production, sign up at openrelayproject.org and use the API to get dynamic credentials.

---

### Step 3 — Yjs WebSocket Server (Whiteboard Sync)

#### `ybserver/package.json`
```json
{
  "name": "yjs-server",
  "version": "1.0.0",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "y-websocket": "^1.5.0"
  }
}
```

#### `ybserver/server.js`
```js
const { createServer } = require('http');
const { setupWSConnection } = require('y-websocket/bin/utils');
const { WebSocketServer } = require('ws');

const host = 'localhost';
const port = 1234;

const server = createServer((req, res) => {
  res.writeHead(200);
  res.end('Yjs WebSocket server running');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req);
});

server.listen(port, host, () => {
  console.log(`Yjs WebSocket server running at ws://${host}:${port}`);
});
```

---

### Step 4 — Frontend (Next.js)

#### `frontend/package.json` dependencies to install:
```json
{
  "dependencies": {
    "@livekit/components-react": "^2.0.0",
    "@livekit/components-styles": "^1.0.0",
    "livekit-client": "^2.0.0",
    "@tldraw/tldraw": "^2.0.0",
    "yjs": "^13.6.0",
    "y-websocket": "^1.5.0",
    "next": "14.2.0",
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.4.0"
  }
}
```

#### `frontend/app/page.tsx` — Join Page

A clean form where the user enters:
- Their name (becomes the LiveKit participant identity)
- A room name (joining an existing room or creating a new one)

On submit, navigate to `/room/[roomName]?name=[participantName]`.

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const [name, setName] = useState('');
  const [room, setRoom] = useState('');
  const router = useRouter();

  const handleJoin = () => {
    if (!name.trim() || !room.trim()) return;
    router.push(`/room/${encodeURIComponent(room)}?name=${encodeURIComponent(name)}`);
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="bg-gray-900 p-8 rounded-2xl shadow-2xl w-full max-w-md space-y-4">
        <h1 className="text-2xl font-bold text-white">Join a Room</h1>
        <input
          className="w-full p-3 rounded-lg bg-gray-800 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Your name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <input
          className="w-full p-3 rounded-lg bg-gray-800 text-white placeholder-gray-500 outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Room name"
          value={room}
          onChange={e => setRoom(e.target.value)}
        />
        <button
          onClick={handleJoin}
          className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg transition"
        >
          Join
        </button>
      </div>
    </main>
  );
}
```

---

#### `frontend/app/room/[roomName]/page.tsx` — Room Page

```tsx
'use client';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import VideoRoom from '@/components/VideoRoom';

export default function RoomPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const roomName = decodeURIComponent(params.roomName as string);
  const participantName = decodeURIComponent(searchParams.get('name') || 'Anonymous');
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    fetch('http://localhost:3001/api/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, participantName }),
    })
      .then(r => r.json())
      .then(data => setToken(data.token));
  }, [roomName, participantName]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-950 text-white">
        Connecting...
      </div>
    );
  }

  return (
    <VideoRoom
      token={token}
      roomName={roomName}
      serverUrl="ws://localhost:7880"
    />
  );
}
```

---

#### `frontend/components/VideoRoom.tsx`

```tsx
'use client';
import '@livekit/components-styles';
import {
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import Whiteboard from './Whiteboard';

interface VideoRoomProps {
  token: string;
  roomName: string;
  serverUrl: string;
}

function VideoGrid() {
  const tracks = useTracks(
    [
      { source: Track.Source.Camera, withPlaceholder: true },
      { source: Track.Source.ScreenShare, withPlaceholder: false },
    ],
    { onlySubscribed: false }
  );

  return (
    <GridLayout tracks={tracks} className="h-full">
      <ParticipantTile />
    </GridLayout>
  );
}

export default function VideoRoom({ token, roomName, serverUrl }: VideoRoomProps) {
  return (
    <div className="flex h-screen bg-gray-950 text-white overflow-hidden">
      {/* Left panel: Video */}
      <div className="flex flex-col w-1/2 border-r border-gray-800">
        <LiveKitRoom
          token={token}
          serverUrl={serverUrl}
          connect={true}
          video={true}
          audio={true}
          className="flex flex-col h-full"
        >
          <div className="flex-1 overflow-hidden">
            <VideoGrid />
          </div>
          <RoomAudioRenderer />
          <ControlBar className="border-t border-gray-800 p-2" />
        </LiveKitRoom>
      </div>

      {/* Right panel: Whiteboard */}
      <div className="w-1/2 h-full">
        <Whiteboard roomName={roomName} />
      </div>
    </div>
  );
}
```

---

#### `frontend/components/Whiteboard.tsx`

```tsx
'use client';
import { useEffect, useState } from 'react';
import { Tldraw } from '@tldraw/tldraw';
import '@tldraw/tldraw/tldraw.css';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

// Note: Tldraw v2 multiplayer requires a sync store adapter.
// This component sets up a Yjs document synced over y-websocket.
// The room name is used as the Yjs document name so all participants
// in the same video room share the same whiteboard state.

interface WhiteboardProps {
  roomName: string;
}

export default function Whiteboard({ roomName }: WhiteboardProps) {
  return (
    <div className="w-full h-full">
      <Tldraw
        // Each room gets its own persistent whiteboard document
        // identified by roomName in the y-websocket server
        persistenceKey={`whiteboard-${roomName}`}
      />
    </div>
  );
}
```

**Implementation note for the agent**: Tldraw v2's multiplayer sync via Yjs requires `@tldraw/sync` or a custom store binding. If `@tldraw/sync` is available in the installed version, use it with `useSyncDemo` or a custom `TldrawEditorStoreWithStatus`. If not, use `persistenceKey` for local persistence as a fallback — whiteboard won't be multiplayer but everything else will work. Check the installed version of `@tldraw/tldraw` and implement accordingly. For full multiplayer whiteboard, refer to: https://tldraw.dev/docs/sync

---

### Step 5 — Environment & Config

#### `frontend/.env.local`
```
NEXT_PUBLIC_LIVEKIT_URL=ws://localhost:7880
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_YJS_SERVER=ws://localhost:1234
```

#### `backend/.env`
```
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
PORT=3001
```

---

### Step 6 — README with Run Instructions

Create a `README.md` with the following start sequence:

```
## Prerequisites
- Docker and Docker Compose installed
- Node.js 18+ installed
- npm or pnpm installed

## Start Order (run each in a separate terminal)

### Terminal 1 — LiveKit SFU Server
docker-compose up

### Terminal 2 — Yjs WebSocket Server (whiteboard sync)
cd ybserver && npm install && node server.js

### Terminal 3 — Express Backend (token generation)
cd backend && npm install && npm run dev

### Terminal 4 — Next.js Frontend
cd frontend && npm install && npm run dev

## Open
http://localhost:3000

## Test locally
Open two browser tabs (or two different browsers).
Enter the same room name but different participant names.
Both tabs should see each other's video and share the same whiteboard.
```

---

## Key Constraints & Notes for the Agent

1. **Do not use `create-next-app` boilerplate cruft** — set up only what's needed.

2. **LiveKit server URL** for local development is always `ws://localhost:7880` (not `wss://`). TLS is not needed locally.

3. **CORS**: The Express backend must have CORS enabled for `http://localhost:3000`.

4. **LiveKit `@livekit/components-react`** requires its CSS to be imported: `import '@livekit/components-styles'`. Without this, the UI will be unstyled.

5. **Tldraw** requires `@tldraw/tldraw/tldraw.css` to be imported in the component file.

6. **y-websocket server** must be running before the frontend loads the whiteboard, otherwise the Yjs provider will retry connections silently — this is fine behavior.

7. **Do not implement auth** — this is a local prototype. Tokens are generated freely by the backend. No login, no database.

8. **Do not use `pages/` router** — use Next.js App Router (`app/` directory) throughout.

9. **TypeScript strict mode** — use proper types, do not use `any` unless unavoidable.

10. **The two-panel layout** (video left, whiteboard right) is fixed for this prototype. No need to make it responsive yet.

11. **Test scenario**: Two browser windows on the same machine, same room name, different participant names. Both should see video feeds and share the whiteboard in real time.

12. **If LiveKit Docker image pull fails**, note that the image is `livekit/livekit-server:latest` from Docker Hub.

13. **Port summary**:
    - `3000` — Next.js frontend
    - `3001` — Express backend API
    - `7880` — LiveKit signaling (WebSocket + HTTP)
    - `7881` — LiveKit TURN/TCP
    - `7882` — LiveKit TURN/UDP
    - `1234` — Yjs WebSocket server

14. **OpenRelay TURN** is used as the ICE server configuration on the frontend side. The backend `/api/turn` endpoint returns these credentials. The frontend should fetch them on room join and pass them to the LiveKit room via the `options` prop if LiveKit's SDK supports custom ICE servers — check `LiveKitRoom` props for `options.rtcConfig.iceServers`. If not directly supported, OpenRelay will still help the underlying WebRTC connection since LiveKit uses WebRTC internally.

---

## What This Prototype Demonstrates

- A working video call between two or more participants in the same room
- Shared collaborative whiteboard visible to all room participants
- Real-time audio/video via WebRTC (LiveKit SFU)
- Whiteboard state synced via Yjs over WebSocket
- Clean split-panel UI: video on left, whiteboard on right
- Token-based room access via backend API
- Everything running locally — no cloud, no deployment needed

---

## What This Prototype Does NOT Include (intentionally)

- User authentication / login
- Persistent rooms or room history
- Recording
- Chat
- Screen sharing UI (LiveKit supports it but not wired up in UI yet)
- Mobile responsiveness
- Production TURN server setup (OpenRelay free tier is sufficient for local testing)
- AI features (planned for later iterations)
