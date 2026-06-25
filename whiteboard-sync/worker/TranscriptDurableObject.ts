import { DurableObject } from 'cloudflare:workers'
import { AutoRouter, error, IRequest } from 'itty-router'
import { Env } from './worker'

export class TranscriptDurableObject extends DurableObject {
	private readonly envVal: Env;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env)
		this.envVal = env
	}

	private readonly router = AutoRouter({ catch: (e) => error(e) })
		.post('/api/transcript/:roomId/init', (req) => this.handleInit(req))
		.post('/api/transcript/:roomId/segment', (req) => this.handleSegment(req))
		.get('/api/transcript/:roomId/data', () => this.handleGetData())
		.post('/api/transcript/:roomId/trigger-summary', () => this.handleTriggerSummary())
		.post('/api/transcript/:roomId/update-summary', (req) => this.handleUpdateSummary(req))
		.post('/api/transcript/:roomId/update-topic', (req) => this.handleUpdateTopic(req))
		.delete('/api/transcript/:roomId', () => this.handleDelete())

	fetch(request: Request): Response | Promise<Response> {
		return this.router.fetch(request)
	}

	private async handleInit(request: IRequest) {
		const body = await request.json() as any
		if (!body.backendUrl) return error(400, 'Missing backendUrl')

		await this.ctx.storage.put('backendUrl', body.backendUrl)
		await this.ctx.storage.put('sessionMeta', {
			teacherId: body.sessionMeta?.teacherId || 0,
			topicNotes: body.sessionMeta?.topicNotes || '',
			startedAt: body.sessionMeta?.startedAt || Date.now(),
		})
		await this.ctx.storage.put('segments', [])
		await this.ctx.storage.put('rollingSummary', '')
		await this.ctx.storage.put('lastSummaryElapsedMs', 0)

		// Schedule first alarm in 10 minutes (600,000 ms)
		await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000)

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async handleSegment(request: IRequest) {
		const segment = await request.json() as any
		if (!segment.participantId || segment.sessionElapsedMs === undefined) {
			return error(400, 'Invalid segment payload')
		}

		const segments = (await this.ctx.storage.get<any[]>('segments')) || []
		segments.push({
			participantId: segment.participantId,
			role: segment.role || 'student',
			name: segment.name || 'Participant',
			text: segment.text || '',
			sessionElapsedMs: segment.sessionElapsedMs,
			duration: segment.duration || 0,
			timestamp: Date.now()
		})
		await this.ctx.storage.put('segments', segments)

		return new Response(JSON.stringify({ ok: true, count: segments.length }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async handleGetData() {
		const segments = (await this.ctx.storage.get<any[]>('segments')) || []
		const rollingSummary = (await this.ctx.storage.get<string>('rollingSummary')) || ''
		const sessionMeta = await this.ctx.storage.get<any>('sessionMeta') || {}

		return new Response(JSON.stringify({ segments, rollingSummary, sessionMeta }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async handleUpdateTopic(request: IRequest) {
		const body = await request.json() as any
		if (!body.topicNotes) return error(400, 'Missing topicNotes')

		const sessionMeta = await this.ctx.storage.get<any>('sessionMeta') || {}
		sessionMeta.topicNotes = body.topicNotes
		await this.ctx.storage.put('sessionMeta', sessionMeta)

		return new Response(JSON.stringify({ ok: true, sessionMeta }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async handleTriggerSummary() {
		// Manually run the pipeline right now
		const success = await this.runSummaryPipeline()
		
		// Reset alarm to 10 minutes from now, since we just generated a summary
		await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000)

		const rollingSummary = (await this.ctx.storage.get<string>('rollingSummary')) || ''
		return new Response(JSON.stringify({ ok: success, rollingSummary }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async handleUpdateSummary(request: IRequest) {
		const body = await request.json() as any
		if (body.rollingSummary === undefined) return error(400, 'Missing rollingSummary')

		await this.ctx.storage.put('rollingSummary', body.rollingSummary)
		if (body.lastSummaryElapsedMs !== undefined) {
			await this.ctx.storage.put('lastSummaryElapsedMs', body.lastSummaryElapsedMs)
		}

		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	private async handleDelete() {
		// Clear all storage keys
		await this.ctx.storage.deleteAlarm()
		await this.ctx.storage.deleteAll()
		return new Response(JSON.stringify({ ok: true }), {
			headers: { 'Content-Type': 'application/json' },
		})
	}

	override async alarm() {
		console.log('[DO Alarm] Alarm fired for summary generation.')
		const success = await this.runSummaryPipeline()
		if (success) {
			// Schedule next alarm in 10 minutes
			await this.ctx.storage.setAlarm(Date.now() + 10 * 60 * 1000)
			console.log('[DO Alarm] Scheduled next alarm in 10 minutes.')
		} else {
			// Retry in 1 minute if call failed
			await this.ctx.storage.setAlarm(Date.now() + 60 * 1000)
			console.log('[DO Alarm] Run failed, retrying alarm in 1 minute.')
		}
	}

	private async runSummaryPipeline(): Promise<boolean> {
		const backendUrl = await this.ctx.storage.get<string>('backendUrl')
		if (!backendUrl) {
			console.warn('[DO] Cannot run summary pipeline: backendUrl not set.')
			return false
		}

		const segments = (await this.ctx.storage.get<any[]>('segments')) || []
		const rollingSummary = (await this.ctx.storage.get<string>('rollingSummary')) || ''
		const lastSummaryElapsedMs = (await this.ctx.storage.get<number>('lastSummaryElapsedMs')) || 0

		// Filter segments added since the last summary
		const newSegments = segments.filter(s => s.sessionElapsedMs > lastSummaryElapsedMs)
		if (newSegments.length === 0) {
			console.log('[DO] No new segments since last summary. Skipping LLM generation.')
			return true
		}

		// Find the latest session elapsed ms in the new segments to set as our next checkpoint
		const maxElapsedMs = Math.max(...newSegments.map(s => s.sessionElapsedMs))

		try {
			// Get DO id (which is our sessionId)
			const sessionId = this.ctx.id.toString()

			console.log(`[DO] Triggering summary update request to Express backend at ${backendUrl}/api/summary/update`)
			const response = await fetch(`${backendUrl}/api/summary/update`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'X-Worker-Secret': this.envVal.WORKER_API_SECRET || '',
				},
				body: JSON.stringify({
					sessionId,
					rollingSummary,
					newSegments,
					lastSummaryElapsedMs: maxElapsedMs
				})
			})

			if (!response.ok) {
				const errText = await response.text()
				console.error(`[DO] Backend summary update failed: ${response.status} - ${errText}`)
				return false
			}

			const data = await response.json() as any
			if (data.rollingSummary !== undefined) {
				await this.ctx.storage.put('rollingSummary', data.rollingSummary)
				await this.ctx.storage.put('lastSummaryElapsedMs', maxElapsedMs)
				console.log('[DO] Successfully updated rollingSummary.')
				return true
			}

			return false
		} catch (err) {
			console.error('[DO] Error calling backend summary endpoint:', err)
			return false
		}
	}
}
