import {
	DurableObjectSqliteSyncWrapper,
	type SessionStateSnapshot,
	SQLiteSyncStorage,
	TLSocketRoom,
	type RoomSnapshot,
} from '@tldraw/sync-core'
import {
	createTLSchema,
	defaultShapeSchemas,
	TLRecord,
} from '@tldraw/tlschema'
import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { Env } from './worker'

const schema = createTLSchema({
	shapes: { ...defaultShapeSchemas },
})

interface SocketAttachment {
	sessionId: string
	snapshot: SessionStateSnapshot | null
}

export class TldrawDurableObject extends DurableObject {
	private room: TLSocketRoom<TLRecord, void> | null = null
	private readonly sessionIdToWs = new Map<string, WebSocket>()

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		// Set auto response for keepalive pings without waking the Durable Object
		this.ctx.setWebSocketAutoResponse(
			new WebSocketRequestResponsePair('{"type":"ping"}', '{"type":"pong"}')
		)
	}

	private async ensureAlarmScheduled() {
		const currentAlarm = await this.ctx.storage.getAlarm()
		if (currentAlarm === null) {
			await this.ctx.storage.setAlarm(Date.now() + 10000)
		}
	}

	private checkpoint() {
		if (!this.room) return
		try {
			const snapshot = this.room.getCurrentSnapshot()
			// RoomSnapshot contains primitive properties, arrays of objects, and simple key-value maps.
			// It is fully JSON-serializable out of the box.
			const serialized = JSON.stringify(snapshot)

			this.ctx.storage.sql.exec(
				`INSERT OR REPLACE INTO whiteboard_snapshots (key, snapshot) VALUES (?, ?)`,
				'snapshot_v1',
				serialized
			)
		} catch (err) {
			console.error('Failed to save checkpoint snapshot:', err)
		}
	}

	override async alarm() {
		this.checkpoint()
		// Only reschedule if we still have active connections
		if (this.ctx.getWebSockets().length > 0) {
			await this.ctx.storage.setAlarm(Date.now() + 10000)
		}
	}

	private getOrCreateRoom(): TLSocketRoom<TLRecord, void> {
		if (!this.room) {
			// Initialize the snapshot table if it doesn't exist
			this.ctx.storage.sql.exec(`
				CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
					key TEXT PRIMARY KEY,
					snapshot TEXT NOT NULL
				);
			`)

			// Fetch the saved snapshot if one exists
			const rows = this.ctx.storage.sql.exec(
				`SELECT snapshot FROM whiteboard_snapshots WHERE key = ?`,
				'snapshot_v1'
			).toArray() as Array<{ snapshot: string }>

			let initialSnapshot: RoomSnapshot | undefined = undefined
			if (rows.length > 0) {
				try {
					initialSnapshot = JSON.parse(rows[0].snapshot) as RoomSnapshot
				} catch (err) {
					console.error('Failed to parse saved snapshot:', err)
				}
			}

			// We omit the 'storage' parameter so TLSocketRoom defaults to InMemorySyncStorage,
			// bypassing incremental SQLite persistence. We pass initialSnapshot to restore state.
			this.room = new TLSocketRoom<TLRecord, void>({
				schema,
				initialSnapshot,
				clientTimeout: Infinity,
				onSessionSnapshot: (sessionId, snapshot) => {
					const ws = this.sessionIdToWs.get(sessionId)
					if (ws) ws.serializeAttachment({ sessionId, snapshot })
				},
			})

			// Resume existing WebSocket connections that survived hibernation
			let hasResumed = false
			for (const ws of this.ctx.getWebSockets()) {
				const attachment = ws.deserializeAttachment() as SocketAttachment | null
				if (!attachment?.sessionId) continue

				if (attachment.snapshot) {
					this.room.handleSocketResume({
						sessionId: attachment.sessionId,
						socket: ws,
						snapshot: attachment.snapshot,
					})
					hasResumed = true
				}
			}

			if (hasResumed) {
				this.ctx.blockConcurrencyWhile(async () => {
					await this.ensureAlarmScheduled()
				})
			}
		}
		return this.room
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) }).get(
		'/api/connect/:roomId',
		(request) => this.handleConnect(request)
	)

	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	async handleConnect(request: IRequest) {
		const sessionId = request.query.sessionId as string
		if (!sessionId) return error(400, 'Missing sessionId')

		const { 0: clientWebSocket, 1: serverWebSocket } = new WebSocketPair()
		this.ctx.acceptWebSocket(serverWebSocket)

		const attachment: SocketAttachment = { sessionId, snapshot: null }
		serverWebSocket.serializeAttachment(attachment)

		this.getOrCreateRoom().handleSocketConnect({ sessionId, socket: serverWebSocket })

		// Call ensureAlarmScheduled when a new WebSocket connection is accepted
		this.ctx.blockConcurrencyWhile(async () => {
			await this.ensureAlarmScheduled()
		})

		return new Response(null, { status: 101, webSocket: clientWebSocket })
	}

	// --- WebSocket Hibernation Event Handlers ---

	private getSessionId(ws: WebSocket): string | null {
		const attachment = ws.deserializeAttachment() as SocketAttachment | null
		return attachment?.sessionId ?? null
	}

	override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
		const sessionId = this.getSessionId(ws)
		if (!sessionId) return

		this.sessionIdToWs.set(sessionId, ws)
		this.getOrCreateRoom().handleSocketMessage(sessionId, message)
	}

	override async webSocketClose(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketClose')
	}

	override async webSocketError(ws: WebSocket) {
		this.handleWebSocketEnd(ws, 'handleSocketError')
	}

	private handleWebSocketEnd(ws: WebSocket, method: 'handleSocketClose' | 'handleSocketError') {
		const attachment = ws.deserializeAttachment() as SocketAttachment | null
		if (!attachment?.sessionId) return

		this.sessionIdToWs.delete(attachment.sessionId)
		const room = this.getOrCreateRoom()

		if (attachment.snapshot && !room.getSessionSnapshot(attachment.sessionId)) {
			room.handleSocketResume({
				sessionId: attachment.sessionId,
				socket: ws,
				snapshot: attachment.snapshot,
			})
		}

		room[method](attachment.sessionId)

		// Check if this was the last connection
		const remainingSockets = this.ctx.getWebSockets().filter(socket => socket !== ws)
		if (remainingSockets.length === 0) {
			this.ctx.storage.deleteAlarm()
			this.checkpoint()
		}
	}
}
