"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const livekit_server_sdk_1 = require("livekit-server-sdk");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const crypto_1 = __importDefault(require("crypto"));
const multer_1 = __importDefault(require("multer"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const auth_1 = require("./auth");
const ai_provider_1 = require("./ai-provider");
// Ensure uploads folder exists
const uploadsDir = path_1.default.join(__dirname, '../uploads');
if (!fs_1.default.existsSync(uploadsDir)) {
    fs_1.default.mkdirSync(uploadsDir, { recursive: true });
}
// Multer configuration for speech WAV uploads
const upload = (0, multer_1.default)({ dest: uploadsDir });
dotenv_1.default.config();
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        if (!origin)
            return callback(null, true);
        const isAllowed = origin.includes('localhost') ||
            origin.includes('127.0.0.1') ||
            origin.includes('opengrapes.local') ||
            origin.includes('opengrapes.com') ||
            /^https?:\/\/192\.168\.\d+\.\d+/.test(origin);
        if (isAllowed) {
            return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
    },
}));
app.use(express_1.default.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));
app.use(express_1.default.urlencoded({ limit: '10mb', extended: true }));
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';
const SESSION_TOKEN_SECRET = process.env.SESSION_TOKEN_SECRET || 'opengrapes';
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'fallback-access-secret';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'fallback-refresh-secret';
const LMS_JWT_SECRET = process.env.LMS_JWT_SECRET || 'fallback-secret';
const PORT = parseInt(process.env.PORT || '3001', 10);
const livekitUrl = process.env.LIVEKIT_URL || `ws://192.168.1.22:7880`;
// RoomServiceClient needs an HTTP/HTTPS URL, not WebSocket wss:// or ws://
const getLivekitHttpUrl = (wsUrl) => {
    return wsUrl.replace(/^ws(s)?:\/\//, 'http$1://');
};
const roomService = new livekit_server_sdk_1.RoomServiceClient(getLivekitHttpUrl(livekitUrl), LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const webhookReceiver = new livekit_server_sdk_1.WebhookReceiver(LIVEKIT_API_KEY, LIVEKIT_API_SECRET);
const teacherLeftTimeouts = new Map();
async function isTeacherPresent(roomId) {
    try {
        const participants = await roomService.listParticipants(roomId);
        return participants.some(p => p.metadata === 'teacher');
    }
    catch (error) {
        return false;
    }
}
// GET /api/auth/me
app.get('/api/auth/me', auth_1.requireAuth, (req, res) => {
    res.json({ user: req.user });
});
// POST /api/exchange-lms-token
app.post('/api/exchange-lms-token', async (req, res) => {
    const { token } = req.body;
    if (!token) {
        res.status(400).json({ error: 'LMS token is required' });
        return;
    }
    try {
        // Verify token signature
        const decoded = jsonwebtoken_1.default.verify(token, LMS_JWT_SECRET);
        const userEmail = decoded.email;
        const userName = decoded.name || 'Participant';
        const rawRole = decoded.role;
        const meetingId = decoded.meetingId;
        if (!userEmail || !meetingId) {
            res.status(400).json({ error: 'Invalid LMS token payload' });
            return;
        }
        // Check if user exists in the PostgreSQL "User" table
        const userRes = await db_1.db.query('SELECT id, name, email, role FROM "User" WHERE email = $1', [userEmail]);
        let userId;
        let finalRole = rawRole;
        if (userRes.rows.length === 0) {
            // Map role to Prisma enum values
            const prismaRole = (rawRole === 'teacher' || rawRole === 'ADMIN') ? 'ADMIN' : 'STUDENT';
            userId = decoded.userId || decoded.id || crypto_1.default.randomUUID();
            await db_1.db.query('INSERT INTO "User" (id, name, email, role, status, "updatedAt") VALUES ($1, $2, $3, $4, \'APPROVED\', NOW())', [userId, userName, userEmail, prismaRole]);
            finalRole = prismaRole;
        }
        else {
            userId = userRes.rows[0].id;
            finalRole = userRes.rows[0].role;
        }
        // Ensure a "LiveSession" record exists for meetingId (roomId)
        const sessionRes = await db_1.db.query('SELECT id, "batchId", "roomId", status, "startedAt", "teacherJoined", "hasNotes" FROM "LiveSession" WHERE "roomId" = $1', [meetingId]);
        let liveSession = sessionRes.rows[0];
        const isTeacher = finalRole === 'ADMIN' || finalRole === 'teacher' || rawRole === 'teacher';
        if (!liveSession) {
            if (isTeacher) {
                // Find batchId from Meeting or token
                let batchId = decoded.batchId;
                if (!batchId) {
                    const meetingRes = await db_1.db.query('SELECT "batchId" FROM "Meeting" WHERE id = $1', [meetingId]);
                    batchId = meetingRes.rows[0]?.batchId;
                }
                if (!batchId) {
                    res.status(400).json({ error: 'Could not resolve batchId for meeting' });
                    return;
                }
                const sessionId = crypto_1.default.randomUUID();
                // Insert live session
                const insertRes = await db_1.db.query('INSERT INTO "LiveSession" (id, "batchId", "roomId", status, "startedAt", "teacherJoined", "hasNotes") VALUES ($1, $2, $3, \'live\', NOW(), false, false) RETURNING id, "batchId", "roomId", status, "startedAt", "teacherJoined", "hasNotes"', [sessionId, batchId, meetingId]);
                liveSession = insertRes.rows[0];
                // Trigger Sync Worker DO initialization
                const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
                const workerSecret = process.env.WORKER_API_SECRET || '';
                try {
                    const batchRes = await db_1.db.query('SELECT name FROM "Batch" WHERE id = $1', [batchId]);
                    const batchName = batchRes.rows[0]?.name || 'Class';
                    const expressBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL || `http://localhost:${PORT}`;
                    console.log(`[Init DO] Calling DO init for room ${meetingId} with backend ${expressBackendUrl}`);
                    await fetch(`${workerUrl}/api/transcript/${meetingId}/init`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Worker-Secret': workerSecret
                        },
                        body: JSON.stringify({
                            backendUrl: expressBackendUrl,
                            sessionMeta: {
                                teacherId: userId,
                                topicNotes: batchName,
                                startedAt: Date.now()
                            }
                        })
                    });
                }
                catch (doInitErr) {
                    console.error('[Init DO] Failed to initialize Transcript DO:', doInitErr);
                }
            }
            else {
                res.status(403).json({ error: 'Meeting session has not been started by the teacher' });
                return;
            }
        }
        // Sign and return native accessToken and refreshToken
        const nativeRole = isTeacher ? 'teacher' : 'student';
        const claims = {
            userId,
            role: nativeRole,
            roomId: meetingId,
            batchId: liveSession.batchId,
            name: userName,
            email: userEmail,
        };
        const accessToken = jsonwebtoken_1.default.sign({ ...claims, type: 'access' }, ACCESS_TOKEN_SECRET, { expiresIn: '30m' });
        const refreshToken = jsonwebtoken_1.default.sign({ ...claims, type: 'refresh' }, REFRESH_TOKEN_SECRET, { expiresIn: '2.5h' });
        // Get startedAtMs
        const startedAtMs = new Date(liveSession.startedAt).getTime();
        res.json({
            accessToken,
            refreshToken,
            roomName: meetingId,
            startedAtMs
        });
    }
    catch (error) {
        console.error('Exchange LMS token error:', error);
        res.status(401).json({ error: 'Invalid or expired LMS token' });
    }
});
// POST /api/renew-session
app.post('/api/renew-session', async (req, res) => {
    const { refreshToken } = req.body;
    if (!refreshToken) {
        res.status(400).json({ error: 'Refresh token required' });
        return;
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(refreshToken, REFRESH_TOKEN_SECRET);
        if (decoded.type !== 'refresh') {
            res.status(401).json({ error: 'Invalid token type' });
            return;
        }
        // Check if session status is still live in PostgreSQL
        const sessionRes = await db_1.db.query('SELECT status FROM "LiveSession" WHERE "roomId" = $1', [decoded.roomId]);
        const session = sessionRes.rows[0];
        if (!session || session.status !== 'live') {
            res.status(401).json({ error: 'Classroom session is no longer active' });
            return;
        }
        const newAccessToken = jsonwebtoken_1.default.sign({
            userId: decoded.userId,
            role: decoded.role,
            roomId: decoded.roomId,
            batchId: decoded.batchId,
            name: decoded.name,
            email: decoded.email,
            type: 'access',
        }, ACCESS_TOKEN_SECRET, { expiresIn: '30m' });
        res.status(200).json({ accessToken: newAccessToken });
    }
    catch (e) {
        res.status(401).json({ error: 'Expired or invalid refresh token' });
    }
});
// POST /api/token
// Body: { roomName: string, sessionToken: string }
app.post('/api/token', async (req, res) => {
    const { roomName, sessionToken } = req.body;
    if (!roomName || !sessionToken) {
        res.status(400).json({ error: 'roomName and sessionToken are required' });
        return;
    }
    try {
        // Verify session token
        const decoded = jsonwebtoken_1.default.verify(sessionToken, ACCESS_TOKEN_SECRET);
        if (decoded.type !== 'access') {
            res.status(401).json({ error: 'Invalid token type' });
            return;
        }
        if (decoded.roomId !== roomName) {
            res.status(403).json({ error: 'Session token is not valid for this roomName' });
            return;
        }
        const at = new livekit_server_sdk_1.AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
            identity: decoded.userId,
            name: decoded.name,
            ttl: '3h',
        });
        // Embed the role in participant metadata
        at.metadata = decoded.role;
        if (decoded.role === 'teacher') {
            try {
                await db_1.db.query('UPDATE "LiveSession" SET "teacherJoined" = true WHERE "roomId" = $1', [roomName]);
            }
            catch (dbErr) {
                console.error('Failed to update teacherJoined status in database:', dbErr);
            }
        }
        at.addGrant({
            roomJoin: true,
            room: roomName,
            canPublish: true,
            canSubscribe: true,
        });
        const token = await at.toJwt();
        res.json({ token });
    }
    catch (error) {
        console.error('Token generation or session verification error:', error);
        res.status(401).json({ error: 'Invalid or expired session token' });
    }
});
// GET /api/my-batches
app.get('/api/my-batches', auth_1.requireAuth, async (req, res) => {
    try {
        if (req.user.role === 'teacher') {
            const batchesRes = await db_1.db.query(`
        SELECT b.id, b.name,
               ls."roomId" as "activeRoomId", ls."startedAt" as "activeStartedAt"
        FROM "Batch" b
        LEFT JOIN "LiveSession" ls ON ls."batchId" = b.id AND ls.status = 'live'
        WHERE b."teacherId" = $1
      `, [req.user.userId]);
            const batches = batchesRes.rows;
            const result = await Promise.all(batches.map(async (b) => {
                const studentsRes = await db_1.db.query(`
          SELECT u.id, u.name, u.email
          FROM "Enrollment" e
          JOIN "User" u ON e."studentId" = u.id
          WHERE e."batchId" = $1 AND e.status = 'APPROVED'
        `, [b.id]);
                const students = studentsRes.rows;
                const pastSessionsRes = await db_1.db.query(`
          SELECT "roomId" as "roomId", "startedAt" as "startedAt", "endedAt" as "endedAt", "hasNotes" as "hasNotes",
                 (SELECT COUNT(*) FROM "MeetingMinutes" mm WHERE mm."sessionId" = "roomId")::integer as "hasMom"
          FROM "LiveSession"
          WHERE "batchId" = $1 AND status IN ('completed', 'expired')
          ORDER BY "startedAt" DESC
        `, [b.id]);
                const pastSessions = pastSessionsRes.rows;
                let activeSession = null;
                if (b.activeRoomId) {
                    activeSession = { roomId: b.activeRoomId, startedAt: b.activeStartedAt };
                }
                return {
                    id: b.id,
                    name: b.name,
                    teacherName: req.user.name,
                    studentCount: students.length,
                    students: students.map(s => ({ id: s.id, name: s.name, email: s.email })),
                    activeSession,
                    pastSessions: pastSessions.map(ps => ({
                        roomId: ps.roomId,
                        startedAt: ps.startedAt,
                        endedAt: ps.endedAt,
                        hasNotes: ps.hasNotes === true,
                        hasMom: ps.hasMom > 0
                    }))
                };
            }));
            res.json({ batches: result });
        }
        else {
            const batchesRes = await db_1.db.query(`
        SELECT b.id, b.name, u.name as "teacherName",
               ls."roomId" as "activeRoomId", ls."startedAt" as "activeStartedAt", ls."teacherJoined" as "activeTeacherJoined"
        FROM "Enrollment" e
        JOIN "Batch" b ON e."batchId" = b.id
        JOIN "User" u ON b."teacherId" = u.id
        LEFT JOIN "LiveSession" ls ON ls."batchId" = b.id AND ls.status = 'live'
        WHERE e."studentId" = $1 AND e.status = 'APPROVED'
      `, [req.user.userId]);
            const batches = batchesRes.rows;
            const result = await Promise.all(batches.map(async (b) => {
                const pastSessionsRes = await db_1.db.query(`
          SELECT "roomId" as "roomId", "startedAt" as "startedAt", "endedAt" as "endedAt", "hasNotes" as "hasNotes",
                 (SELECT COUNT(*) FROM "MeetingMinutes" mm WHERE mm."sessionId" = "roomId")::integer as "hasMom"
          FROM "LiveSession"
          WHERE "batchId" = $1 AND status IN ('completed', 'expired')
          ORDER BY "startedAt" DESC
        `, [b.id]);
                const pastSessions = pastSessionsRes.rows;
                let activeSession = null;
                if (b.activeRoomId && b.activeTeacherJoined === true) {
                    activeSession = { roomId: b.activeRoomId, startedAt: b.activeStartedAt };
                }
                return {
                    id: b.id,
                    name: b.name,
                    teacherName: b.teacherName,
                    studentCount: 0,
                    students: [],
                    activeSession,
                    pastSessions: pastSessions.map(ps => ({
                        roomId: ps.roomId,
                        startedAt: ps.startedAt,
                        endedAt: ps.endedAt,
                        hasNotes: ps.hasNotes === true,
                        hasMom: ps.hasMom > 0
                    }))
                };
            }));
            res.json({ batches: result });
        }
    }
    catch (error) {
        console.error('Get my batches error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/end-class
app.post('/api/end-class', auth_1.requireLMSOrClassroomAuth, (0, auth_1.requireRole)('teacher'), async (req, res) => {
    const { batchId, hasNotes } = req.body;
    if (!batchId) {
        res.status(400).json({ error: 'batchId is required' });
        return;
    }
    try {
        // Check batch ownership
        const batchRes = await db_1.db.query('SELECT * FROM "Batch" WHERE id = $1 AND "teacherId" = $2', [batchId, req.user.userId]);
        const batch = batchRes.rows[0];
        if (!batch) {
            res.status(403).json({ error: 'You are not the teacher of this batch' });
            return;
        }
        // Get the active session room_id before updating
        const activeSessionRes = await db_1.db.query('SELECT "roomId" FROM "LiveSession" WHERE "batchId" = $1 AND status = \'live\'', [batchId]);
        const activeSession = activeSessionRes.rows[0];
        if (activeSession && activeSession.roomId) {
            const sessionId = activeSession.roomId;
            const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
            const workerSecret = process.env.WORKER_API_SECRET || '';
            // 1. Fetch transcript segments and rolling summary from DO
            let transcriptData = { segments: [], rollingSummary: '', sessionMeta: {} };
            try {
                const doRes = await fetch(`${workerUrl}/api/transcript/${sessionId}/data`, {
                    headers: { 'X-Worker-Secret': workerSecret }
                });
                if (doRes.ok) {
                    transcriptData = await doRes.json();
                }
            }
            catch (err) {
                console.error('Failed to fetch DO data on end class:', err);
            }
            // 2. Fetch all doubts from PostgreSQL
            let doubtsList = [];
            try {
                const doubtsRes = await db_1.db.query('SELECT "doubtText", answer FROM "Doubt" WHERE "sessionId" = $1', [sessionId]);
                doubtsList = doubtsRes.rows;
            }
            catch (err) {
                console.error('Failed to fetch doubts on end class:', err);
            }
            // 3. Generate structured meeting notes (MoM) using Gemini
            let momContent = 'No notes generated.';
            const geminiKey = process.env.GEMINI_API_KEY;
            if (geminiKey && (transcriptData.segments.length > 0 || doubtsList.length > 0)) {
                try {
                    const sortedSegments = (transcriptData.segments || []).sort((a, b) => a.sessionElapsedMs - b.sessionElapsedMs);
                    const fullTranscript = sortedSegments.map((s) => {
                        const min = Math.floor(s.sessionElapsedMs / 60000);
                        const sec = Math.floor((s.sessionElapsedMs % 60000) / 1000).toString().padStart(2, '0');
                        return `[${min}:${sec}] ${s.name} (${s.role}): ${s.text}`;
                    }).join('\n');
                    const doubtsText = doubtsList.map((d, idx) => `${idx + 1}. Doubt: "${d.doubtText}" -> Answer: "${d.answer.substring(0, 100)}..."`).join('\n') || 'None';
                    const topicNotes = transcriptData.sessionMeta?.topicNotes || batch.name || '';
                    const prompt = `You are a professional live class assistant. Your job is to compile a structured Minutes of Meeting (MoM) report for a live class based on the full transcript, topics covered, and student doubts asked.

Class Topic: ${topicNotes}
Topics Covered Summary (compiled during class):
${transcriptData.rollingSummary || 'Not compiled'}

Student Doubts Asked:
${doubtsText}

Full Class Transcript:
${fullTranscript || 'No speech transcribed'}

Generate structured meeting notes under 600 words. Format the response cleanly in Markdown. Include:
- **Topics Covered**: Summary of the main topics.
- **Key Concepts Explained**: Details of the formulas, definitions, or core explanations given.
- **Student doubts raised**: Summary of doubts asked by students and the answers provided.
- **Action Items & Homework**: Any future tasks, homework, or revisions mentioned.
Make the tone professional, structured, and easy for students to study from.`;
                    let geminiRes;
                    try {
                        geminiRes = await (0, ai_provider_1.requestAI)({
                            contents: [{ parts: [{ text: prompt }] }]
                        });
                        if (geminiRes.ok) {
                            const data = await geminiRes.json();
                            momContent = (data.choices?.[0]?.message?.content || '').trim();
                        }
                        else {
                            console.error('[End Class MoM] AI returned error:', geminiRes.status, await geminiRes.text());
                        }
                    }
                    catch (err) {
                        console.error('[End Class MoM] AI call failed:', err.message);
                    }
                }
                catch (err) {
                    console.error('Failed to generate MoM with Gemini:', err);
                }
            }
            // 4. Save MoM to PostgreSQL database
            try {
                await db_1.db.query(`INSERT INTO "MeetingMinutes" (id, "sessionId", content, "generatedAt")
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT ("sessionId")
           DO UPDATE SET content = $3, "generatedAt" = NOW()`, [crypto_1.default.randomUUID(), sessionId, momContent]);
                console.log(`[End Class] Saved MoM for session: ${sessionId}`);
            }
            catch (err) {
                console.error('Failed to save MoM to database:', err);
            }
            // 5. Delete DO storage (cleanup)
            try {
                const doDelRes = await fetch(`${workerUrl}/api/transcript/${sessionId}`, {
                    method: 'DELETE',
                    headers: { 'X-Worker-Secret': workerSecret }
                });
                if (doDelRes.ok) {
                    console.log(`[End Class] Successfully cleaned up Transcript DO: ${sessionId}`);
                }
            }
            catch (err) {
                console.error('Failed to clean up Transcript DO:', err);
            }
        }
        // Set session as completed and store hasNotes
        await db_1.db.query('UPDATE "LiveSession" SET status = \'completed\', "endedAt" = NOW(), "hasNotes" = $1 WHERE "batchId" = $2 AND status = \'live\'', [hasNotes === true, batchId]);
        if (activeSession && activeSession.roomId) {
            try {
                await roomService.deleteRoom(activeSession.roomId);
            }
            catch (lkErr) {
                console.error(`Failed to delete LiveKit room ${activeSession.roomId}:`, lkErr);
            }
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error('End class error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/kick-participant
app.post('/api/kick-participant', auth_1.requireClassroomAuth, (0, auth_1.requireRole)('teacher'), async (req, res) => {
    const { roomId, participantIdentity } = req.body;
    if (!roomId || !participantIdentity) {
        res.status(400).json({ error: 'roomId and participantIdentity are required' });
        return;
    }
    try {
        await roomService.removeParticipant(roomId, participantIdentity);
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Error kicking participant:', error);
        res.status(500).json({ error: error.message || 'Failed to kick participant' });
    }
});
// POST /api/mute-participant
app.post('/api/mute-participant', auth_1.requireClassroomAuth, (0, auth_1.requireRole)('teacher'), async (req, res) => {
    const { roomId, participantIdentity, trackType, muted } = req.body;
    if (!roomId || !participantIdentity || !trackType || muted === undefined) {
        res.status(400).json({ error: 'roomId, participantIdentity, trackType, and muted are required' });
        return;
    }
    if (trackType !== 'audio' && trackType !== 'video') {
        res.status(400).json({ error: "trackType must be 'audio' or 'video'" });
        return;
    }
    try {
        const participants = await roomService.listParticipants(roomId);
        const participant = participants.find(p => p.identity === participantIdentity);
        if (!participant) {
            res.status(404).json({ error: 'Participant not found' });
            return;
        }
        // Find the track by type
        const targetType = trackType === 'audio' ? livekit_server_sdk_1.TrackType.AUDIO : livekit_server_sdk_1.TrackType.VIDEO;
        const trackInfo = participant.tracks.find(t => t.type === targetType);
        if (!trackInfo) {
            res.status(404).json({ error: `No published ${trackType} track found for this participant` });
            return;
        }
        await roomService.mutePublishedTrack(roomId, participantIdentity, trackInfo.sid, muted);
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Error muting participant:', error);
        res.status(500).json({ error: error.message || 'Failed to mute participant' });
    }
});
// GET /api/turn
// Returns TURN credentials fetched from Metered.ca API
const METERED_API_KEY = process.env.METERED_API_KEY || '';
const METERED_APP_NAME = process.env.METERED_APP_NAME || '';
let cachedIceServers = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
app.get('/api/turn', async (_req, res) => {
    try {
        if (!METERED_API_KEY || !METERED_APP_NAME) {
            console.warn('METERED_API_KEY or METERED_APP_NAME not set in .env — using fallback STUN');
            res.json({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ],
            });
            return;
        }
        const now = Date.now();
        if (cachedIceServers && (now - cacheTimestamp) < CACHE_TTL_MS) {
            res.json({ iceServers: cachedIceServers });
            return;
        }
        const response = await fetch(`https://${METERED_APP_NAME}.metered.live/api/v1/turn/credentials?apiKey=${METERED_API_KEY}`);
        if (!response.ok) {
            throw new Error(`Metered API returned ${response.status}: ${response.statusText}`);
        }
        const iceServers = await response.json();
        cachedIceServers = iceServers;
        cacheTimestamp = now;
        res.json({ iceServers });
    }
    catch (error) {
        console.error('Failed to fetch TURN credentials:', error);
        res.json({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
            ],
        });
    }
});
// GET /api/livekit-url
app.get('/api/livekit-url', (req, res) => {
    const livekitUrl = process.env.LIVEKIT_URL || `ws://192.168.1.22:7880`;
    res.json({ url: livekitUrl });
});
app.post('/api/livekit-webhook', async (req, res) => {
    try {
        const rawBody = req.rawBody;
        const authHeader = req.headers.authorization;
        if (!authHeader) {
            res.status(401).send('Unauthorized');
            return;
        }
        const event = await webhookReceiver.receive(rawBody, authHeader);
        console.log(`[Webhook] Received event: ${event.event}`);
        const roomName = event.room?.name;
        if (!roomName) {
            res.status(200).send('OK');
            return;
        }
        if (event.event === 'room_finished') {
            const pendingTimeout = teacherLeftTimeouts.get(roomName);
            if (pendingTimeout) {
                clearTimeout(pendingTimeout);
                teacherLeftTimeouts.delete(roomName);
                console.log(`[Webhook][room_finished] Cleared pending teacher absent timeout for room: ${roomName}`);
            }
            await db_1.db.query('UPDATE "LiveSession" SET status = \'completed\', "endedAt" = NOW() WHERE "roomId" = $1 AND status = \'live\'', [roomName]);
            console.log(`[Webhook] Room finished, marked session as completed for room: ${roomName}`);
        }
        else if (event.event === 'participant_left') {
            const participantMetadata = event.participant?.metadata;
            if (participantMetadata === 'teacher') {
                console.log(`[Webhook] Teacher left room: ${roomName}. Checking remaining teachers...`);
                setTimeout(async () => {
                    try {
                        const hasTeacher = await isTeacherPresent(roomName);
                        if (!hasTeacher) {
                            if (teacherLeftTimeouts.has(roomName))
                                return;
                            console.log(`[Webhook] No teacher present in room ${roomName}. Starting 10-minute grace period timer...`);
                            const timeout = setTimeout(async () => {
                                try {
                                    console.log(`[Webhook] 10-minute grace period expired. Auto-terminating room: ${roomName}...`);
                                    await db_1.db.query('UPDATE "LiveSession" SET status = \'completed\', "endedAt" = NOW() WHERE "roomId" = $1 AND status = \'live\'', [roomName]);
                                    await roomService.deleteRoom(roomName);
                                    teacherLeftTimeouts.delete(roomName);
                                    console.log(`[Webhook] Successfully auto-terminated room: ${roomName}`);
                                }
                                catch (timeoutErr) {
                                    console.error(`[Webhook] Error terminating room ${roomName} after grace period:`, timeoutErr);
                                }
                            }, 600000); // 10 minutes
                            teacherLeftTimeouts.set(roomName, timeout);
                        }
                        else {
                            console.log(`[Webhook] Another teacher is still present in room: ${roomName}`);
                        }
                    }
                    catch (chkErr) {
                        console.error('[Webhook] Error checking teacher presence after participant left:', chkErr);
                    }
                }, 3000);
            }
        }
        else if (event.event === 'participant_joined') {
            const participantMetadata = event.participant?.metadata;
            if (participantMetadata === 'teacher') {
                const pendingTimeout = teacherLeftTimeouts.get(roomName);
                if (pendingTimeout) {
                    clearTimeout(pendingTimeout);
                    teacherLeftTimeouts.delete(roomName);
                    console.log(`[Webhook] Teacher rejoined room ${roomName} within grace period. Cancelled auto-termination timer.`);
                }
                await db_1.db.query('UPDATE "LiveSession" SET "teacherJoined" = true WHERE "roomId" = $1 AND status = \'live\'', [roomName]);
                console.log(`[Webhook] Teacher joined room ${roomName}. Marked teacherJoined as true.`);
            }
        }
        res.status(200).send('OK');
    }
    catch (err) {
        console.error('[Webhook] Signature verification failed or handler error:', err);
        res.status(401).send('Invalid signature');
    }
});
// Health check
app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
// Periodic stale session cleanup sweep (every 60 seconds)
setInterval(async () => {
    try {
        const expiredRes = await db_1.db.query(`
      SELECT id, "roomId" as "room_id" FROM "LiveSession"
      WHERE status = 'live' AND "startedAt" < NOW() - INTERVAL '2 hours'
    `);
        const expired = expiredRes.rows;
        if (expired.length > 0) {
            for (const sess of expired) {
                await db_1.db.query(`
          UPDATE "LiveSession"
          SET status = 'expired', "endedAt" = NOW()
          WHERE id = $1
        `, [sess.id]);
                console.log(`[Sweep] Automatically expired live session ${sess.id} (room: ${sess.room_id})`);
            }
        }
    }
    catch (error) {
        console.error('[Sweep] Error during stale session cleanup:', error);
    }
}, 60000);
// =========================================================================
// SPEECH SYNC, VAD TRANSCRIPTION, AND AI DOUBT SOLVER ENDPOINTS
// =========================================================================
// POST /api/transcribe: Transcribes audio speech chunk using Groq Whisper and sends it to Durable Object
app.post('/api/transcribe', auth_1.requireClassroomAuth, upload.single('audio'), async (req, res) => {
    try {
        const file = req.file;
        const { sessionId, participantId, role, name, sessionElapsedMs, duration } = req.body;
        if (!file) {
            res.status(400).json({ error: 'No audio file provided' });
            return;
        }
        const groqKey = process.env.GROQ_API_KEY;
        if (!groqKey) {
            res.status(500).json({ error: 'GROQ_API_KEY is not set' });
            return;
        }
        // Read temp file and convert to Blob for native FormData
        const fileBuffer = fs_1.default.readFileSync(file.path);
        const audioBlob = new Blob([fileBuffer], { type: 'audio/wav' });
        const formData = new FormData();
        formData.append('file', audioBlob, 'speech.wav');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');
        const groqRes = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqKey}`,
            },
            body: formData
        });
        // Clean up temporary file
        fs_1.default.unlink(file.path, () => { });
        if (!groqRes.ok) {
            const errText = await groqRes.text();
            console.error('[Transcribe] Groq API returned error:', groqRes.status, errText);
            res.status(500).json({ error: 'Failed to transcribe audio' });
            return;
        }
        const groqData = await groqRes.json();
        const transcriptText = (groqData.text || '').trim();
        // Skip saving empty transcripts or transcription junk placeholders like "[blank_audio]"
        if (transcriptText.length > 0 && !/^\[.*\]$/.test(transcriptText)) {
            const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
            const workerSecret = process.env.WORKER_API_SECRET || '';
            await fetch(`${workerUrl}/api/transcript/${sessionId}/segment`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Worker-Secret': workerSecret
                },
                body: JSON.stringify({
                    participantId,
                    role,
                    name,
                    text: transcriptText,
                    sessionElapsedMs: parseInt(sessionElapsedMs, 10),
                    duration: parseInt(duration, 10)
                })
            });
            console.log(`[Transcribe] Saved segment: "${transcriptText}" for ${name} (${role})`);
            res.json({ ok: true, text: transcriptText });
        }
        else {
            res.json({ ok: true, text: '', skipped: true });
        }
    }
    catch (error) {
        console.error('Transcribe error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/doubt: Streams Gemini 2.5 Flash response to student doubts and logs to SQLite
app.post('/api/doubt', auth_1.requireClassroomAuth, async (req, res) => {
    const { sessionId, doubtText, screenshot, enableThinking } = req.body;
    const studentId = req.user.userId;
    const studentName = req.user.name;
    if (!sessionId || !doubtText) {
        res.status(400).json({ error: 'sessionId and doubtText are required' });
        return;
    }
    const hasGeminiKey = process.env.GEMINI_API_KEY || process.env.GEMINI_KEY_1;
    if (!hasGeminiKey) {
        res.status(500).json({ error: 'No Gemini API keys configured' });
        return;
    }
    try {
        // 1. Fetch class transcript segments and rolling summary from DO
        const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
        const workerSecret = process.env.WORKER_API_SECRET || '';
        let segments = [];
        let rollingSummary = '';
        let topicNotes = '';
        try {
            const doRes = await fetch(`${workerUrl}/api/transcript/${sessionId}/data`, {
                headers: { 'X-Worker-Secret': workerSecret }
            });
            if (doRes.ok) {
                const doData = await doRes.json();
                segments = doData.segments || [];
                rollingSummary = doData.rollingSummary || '';
                topicNotes = doData.sessionMeta?.topicNotes || '';
            }
        }
        catch (doFetchErr) {
            console.warn('[Doubt Solver] Worker is unreachable, proceeding with empty class context:', doFetchErr);
        }
        // Sort segments chronologically
        segments.sort((a, b) => a.sessionElapsedMs - b.sessionElapsedMs);
        // Filter recent segments (last 15 minutes)
        const last15Mins = 15 * 60 * 1000;
        const maxElapsedMs = segments.length > 0 ? segments[segments.length - 1].sessionElapsedMs : 0;
        const recentSegments = segments.filter((s) => (maxElapsedMs - s.sessionElapsedMs) <= last15Mins);
        // Format transcript lines
        const transcriptFormatted = recentSegments.map((s) => {
            const min = Math.floor(s.sessionElapsedMs / 60000);
            const sec = Math.floor((s.sessionElapsedMs % 60000) / 1000).toString().padStart(2, '0');
            return `[${min}:${sec}] ${s.name} (${s.role}): ${s.text}`;
        }).join('\n');
        // 2. Build Gemini prompt content
        const systemPrompt = `You are a doubt-solving AI for a live Indian classroom (JEE/NEET/Board Exams/competitive exams). Answer the student's question accurately and concisely using the provided class context (topic, rolling summary, recent transcript) and any attached screenshot.

TRANSCRIPT HANDLING:
- The transcript is raw real-time Speech-To-Text output. It WILL contain errors: mishearing, wrong spellings, broken words, or phonetic substitutions (e.g. "FITJ" = "FIITJEE", "JAdvanced" = "JEE Advanced", "nit" = "NEET", "limit ex" = "lim x→∞").
- Treat the transcript as noisy signal, not ground truth. Infer the intended meaning from context.
- NEVER quote transcript text verbatim. NEVER say "you mentioned" or "the transcript says". Explain concepts in your own words only.

ANSWERING:
- Answer the student's actual doubt, not a literal interpretation of potentially garbled text.
- If the doubt is ambiguous due to transcription noise, pick the most likely intended interpretation given the class topic and answer that.
- Use **bold** for key terms, bullet points for steps or lists.
- Stay under 250 words.
- If the screenshot is provided, prioritize it over transcript for understanding the doubt.`;
        const userMessageContent = [];
        let contextStr = `Class Topic: ${topicNotes || 'Not Specified'}\n\n`;
        contextStr += `Class Summary So Far:\n${rollingSummary || 'No summary compiled yet.'}\n\n`;
        contextStr += `Recent Transcript (Last 15 minutes):\n${transcriptFormatted || 'No speech captured.'}\n\n`;
        contextStr += `Student Question: ${doubtText}`;
        userMessageContent.push({ text: contextStr });
        if (screenshot) {
            let screenshotUrls = [];
            try {
                if (screenshot.startsWith('[')) {
                    screenshotUrls = JSON.parse(screenshot);
                }
                else {
                    screenshotUrls = [screenshot];
                }
            }
            catch (e) {
                screenshotUrls = [screenshot];
            }
            for (const attachedImage of screenshotUrls) {
                if (attachedImage.startsWith('data:')) {
                    const commaIndex = attachedImage.indexOf(',');
                    if (commaIndex !== -1) {
                        const meta = attachedImage.substring(0, commaIndex);
                        const mimeMatch = meta.match(/data:(.*?);/);
                        const base64Data = attachedImage.substring(commaIndex + 1);
                        if (mimeMatch && base64Data) {
                            userMessageContent.push({
                                inlineData: {
                                    mimeType: mimeMatch[1],
                                    data: base64Data
                                }
                            });
                        }
                    }
                }
                else if (attachedImage.startsWith('http://') || attachedImage.startsWith('https://')) {
                    const ext = attachedImage.split('.').pop()?.toLowerCase();
                    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
                    userMessageContent.push({
                        fileData: {
                            fileUri: attachedImage,
                            mimeType: mimeType
                        }
                    });
                }
            }
        }
        let geminiRes;
        try {
            geminiRes = await (0, ai_provider_1.requestAI)({
                contents: [{ role: 'user', parts: userMessageContent }],
                systemInstruction: { parts: [{ text: systemPrompt }] },
                enableThinking: enableThinking !== undefined ? enableThinking : true
            }, { stream: true });
        }
        catch (err) {
            console.error('[Doubt] AI call failed:', err.message);
            res.status(500).json({ error: 'Failed to stream doubt solver' });
            return;
        }
        // Set headers for Server-Sent Events (SSE)
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no');
        const decoder = new TextDecoder();
        let answerText = '';
        let tempBuffer = '';
        // Stream and parse incoming chunked SSE payload
        for await (const chunk of geminiRes.body) {
            tempBuffer += decoder.decode(chunk, { stream: true });
            const lines = tempBuffer.split('\n');
            // Save last potentially incomplete line back to buffer
            tempBuffer = lines.pop() || '';
            for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith('data: ')) {
                    const dataStr = cleanLine.substring(6).trim();
                    if (dataStr === '[DONE]') {
                        continue;
                    }
                    try {
                        const parsed = JSON.parse(dataStr);
                        const reasoning = parsed.choices?.[0]?.delta?.reasoning_content;
                        const content = parsed.choices?.[0]?.delta?.content;
                        if (reasoning) {
                            res.write(`data: ${JSON.stringify({ thinking: reasoning })}\n\n`);
                        }
                        if (content) {
                            answerText += content;
                            res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
                        }
                    }
                    catch (e) {
                        // Ignore JSON parsing errors for partial stream chunks
                    }
                }
            }
        }
        // 4. Save doubt history to PostgreSQL (do this BEFORE closing response to prevent race condition)
        try {
            const doubtId = crypto_1.default.randomUUID();
            await db_1.db.query(`
        INSERT INTO "Doubt" (id, "sessionId", "studentId", "doubtText", answer, screenshot)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [doubtId, sessionId, studentId, doubtText, answerText, screenshot || null]);
        }
        catch (dbErr) {
            console.error('[Doubt] PostgreSQL log error:', dbErr);
        }
        res.write('data: [DONE]\n\n');
        res.end();
    }
    catch (error) {
        console.error('Doubt solver error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});
// POST /api/summary/update: Called by Worker DO Alarm/Manual refresh to generate rolling summary
app.post('/api/summary/update', async (req, res) => {
    const secret = req.headers['x-worker-secret'];
    const workerSecret = process.env.WORKER_API_SECRET || '';
    if (!workerSecret || secret !== workerSecret) {
        res.status(401).send('Unauthorized');
        return;
    }
    const { sessionId, rollingSummary, newSegments } = req.body;
    if (!sessionId || !newSegments) {
        res.status(400).send('Missing fields');
        return;
    }
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
        res.status(500).send('GEMINI_API_KEY not set');
        return;
    }
    try {
        newSegments.sort((a, b) => a.sessionElapsedMs - b.sessionElapsedMs);
        const newTranscript = newSegments.map((s) => {
            const min = Math.floor(s.sessionElapsedMs / 60000);
            const sec = Math.floor((s.sessionElapsedMs % 60000) / 1000).toString().padStart(2, '0');
            return `[${min}:${sec}] ${s.name} (${s.role}): ${s.text}`;
        }).join('\n');
        const prompt = `You are a live class summary compiler.
Existing summary so far:
${rollingSummary || 'No summary yet.'}

New transcript from the last 10 minutes:
${newTranscript}

Append a new bullet point to the summary covering what was just discussed in the new transcript.
Requirements:
1. Keep the new entry under 50 words.
2. Format: "[MM-MM min]: <summary>" where MM-MM represents the minutes range (e.g., "[10-20 min]: Teacher introduced the concept of F=ma").
3. Do not rewrite the existing summary, only return the new entry that should be appended to it.`;
        // Call Gemini API - Using gemini-2.5-flash-lite directly for speed and quota stability
        let geminiRes;
        try {
            geminiRes = await (0, ai_provider_1.requestAI)({
                contents: [{ parts: [{ text: prompt }] }]
            });
        }
        catch (err) {
            console.error('[Summary Update] AI call failed:', err.message);
            res.status(500).send('Failed to generate summary');
            return;
        }
        if (!geminiRes.ok) {
            console.error('[Summary Update] AI error:', geminiRes.status, await geminiRes.text());
            res.status(500).send('Failed to generate summary');
            return;
        }
        const data = await geminiRes.json();
        const newEntry = (data.choices?.[0]?.message?.content || '').trim();
        const updatedSummary = rollingSummary
            ? `${rollingSummary}\n${newEntry}`
            : newEntry;
        console.log(`[Summary Update] Updated summary for room ${sessionId}: "${newEntry}"`);
        res.json({ rollingSummary: updatedSummary });
    }
    catch (error) {
        console.error('Summary update error:', error);
        res.status(500).send('Internal server error');
    }
});
// POST /api/summary/trigger: Client calls this to force DO to run the summary pipeline
app.post('/api/summary/trigger', auth_1.requireClassroomAuth, async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        res.status(400).json({ error: 'sessionId required' });
        return;
    }
    try {
        const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
        const workerSecret = process.env.WORKER_API_SECRET || '';
        const doRes = await fetch(`${workerUrl}/api/transcript/${sessionId}/trigger-summary`, {
            method: 'POST',
            headers: { 'X-Worker-Secret': workerSecret }
        });
        if (!doRes.ok) {
            const errText = await doRes.text();
            res.status(500).json({ error: `DO returned error: ${errText}` });
            return;
        }
        const data = await doRes.json();
        res.json({ ok: true, rollingSummary: data.rollingSummary });
    }
    catch (error) {
        console.error('Trigger summary error:', error);
        res.status(503).json({ error: 'Sync server is currently unreachable. Please ensure the whiteboard worker is running.' });
    }
});
// GET /api/summary/:sessionId: Fetch summary from DO
app.get('/api/summary/:sessionId', auth_1.requireClassroomAuth, async (req, res) => {
    const { sessionId } = req.params;
    try {
        const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
        const workerSecret = process.env.WORKER_API_SECRET || '';
        let rollingSummary = '';
        let topicNotes = '';
        let syncError = false;
        try {
            const doRes = await fetch(`${workerUrl}/api/transcript/${sessionId}/data`, {
                headers: { 'X-Worker-Secret': workerSecret }
            });
            if (doRes.ok) {
                const data = await doRes.json();
                rollingSummary = data.rollingSummary || '';
                topicNotes = data.sessionMeta?.topicNotes || '';
            }
            else {
                syncError = true;
            }
        }
        catch (fetchErr) {
            console.warn('[Summary API] Worker is unreachable:', fetchErr);
            syncError = true;
        }
        res.json({
            rollingSummary,
            topicNotes,
            error: syncError ? 'Sync server is currently unreachable' : undefined
        });
    }
    catch (error) {
        console.error('Fetch summary error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/transcript/:sessionId: Fetch raw transcript segments from DO
app.get('/api/transcript/:sessionId', auth_1.requireClassroomAuth, async (req, res) => {
    const { sessionId } = req.params;
    try {
        const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
        const workerSecret = process.env.WORKER_API_SECRET || '';
        const doRes = await fetch(`${workerUrl}/api/transcript/${sessionId}/data`, {
            headers: { 'X-Worker-Secret': workerSecret }
        });
        if (!doRes.ok) {
            res.status(doRes.status).json({ error: 'Failed to fetch transcript from sync server' });
            return;
        }
        const data = await doRes.json();
        res.json({ ok: true, segments: data.segments || [] });
    }
    catch (error) {
        console.error('Fetch transcript error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/doubts/:sessionId: Fetch doubts list for classroom display (private per student/user)
app.get('/api/doubts/:sessionId', auth_1.requireClassroomAuth, async (req, res) => {
    const { sessionId } = req.params;
    const currentUserId = req.user.userId;
    try {
        const isTeacher = req.user.role === 'teacher' || req.user.role === 'ADMIN';
        let doubtsRes;
        if (isTeacher) {
            // Teachers see all doubts in the session
            doubtsRes = await db_1.db.query(`
        SELECT d.id, d."sessionId", d."studentId", d."doubtText", d.answer, d.screenshot, d.timestamp, u.name as "studentName" 
        FROM "Doubt" d
        JOIN "User" u ON d."studentId" = u.id
        WHERE d."sessionId" = $1
        ORDER BY d.timestamp ASC
      `, [sessionId]);
        }
        else {
            // Students only see their own doubts in the session
            doubtsRes = await db_1.db.query(`
        SELECT d.id, d."sessionId", d."studentId", d."doubtText", d.answer, d.screenshot, d.timestamp, u.name as "studentName" 
        FROM "Doubt" d
        JOIN "User" u ON d."studentId" = u.id
        WHERE d."sessionId" = $1 AND d."studentId" = $2
        ORDER BY d.timestamp ASC
      `, [sessionId, currentUserId]);
        }
        const doubts = doubtsRes.rows.map(d => ({
            id: d.id,
            session_id: d.sessionId,
            sessionId: d.sessionId,
            student_id: d.studentId,
            studentId: d.studentId,
            doubt_text: d.doubtText,
            doubtText: d.doubtText,
            answer: d.answer,
            screenshot: d.screenshot,
            timestamp: d.timestamp,
            studentName: d.studentName
        }));
        res.json({ doubts });
    }
    catch (error) {
        console.error('Fetch doubts error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /api/transcript/:sessionId/topic: Dynamically updates topic notes in DO
app.post('/api/transcript/:sessionId/topic', auth_1.requireClassroomAuth, (0, auth_1.requireRole)('teacher'), async (req, res) => {
    const { sessionId } = req.params;
    const { topicNotes } = req.body;
    if (!topicNotes) {
        res.status(400).json({ error: 'topicNotes required' });
        return;
    }
    try {
        const workerUrl = (process.env.NEXT_PUBLIC_SYNC_WORKER_URL || 'http://localhost:8787').replace(/\/+$/, '');
        const workerSecret = process.env.WORKER_API_SECRET || '';
        const doRes = await fetch(`${workerUrl}/api/transcript/${sessionId}/update-topic`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Worker-Secret': workerSecret
            },
            body: JSON.stringify({ topicNotes })
        });
        if (!doRes.ok) {
            res.status(500).json({ error: 'Failed to update topic notes' });
            return;
        }
        res.json({ ok: true });
    }
    catch (error) {
        console.error('Update topic error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /api/mom/:sessionId: Fetch post-class meeting minutes (MoM)
app.get('/api/mom/:sessionId', auth_1.requireLMSOrClassroomAuth, async (req, res) => {
    const { sessionId } = req.params;
    try {
        const momRes = await db_1.db.query('SELECT id, "sessionId", content, "generatedAt" FROM "MeetingMinutes" WHERE "sessionId" = $1', [sessionId]);
        const row = momRes.rows[0];
        if (!row) {
            res.status(404).json({ error: 'Minutes of meeting not found' });
            return;
        }
        res.json({ mom: row.content, generatedAt: row.generatedAt });
    }
    catch (error) {
        console.error('Fetch MoM error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running on http://0.0.0.0:${PORT}`);
});
