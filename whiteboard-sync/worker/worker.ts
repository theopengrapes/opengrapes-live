import { AutoRouter, error, IRequest, cors } from 'itty-router'
import { handleAssetDownload, handleAssetUpload, handlePdfUpload, handlePdfDownload } from './assetUploads'

// Export TldrawDurableObject and TranscriptDurableObject for Cloudflare Durable Objects to find them
export { TldrawDurableObject } from './TldrawDurableObject'
export { TranscriptDurableObject } from './TranscriptDurableObject'

export interface Env {
	TLDRAW_DURABLE_OBJECT: DurableObjectNamespace
	TRANSCRIPT_DURABLE_OBJECT: DurableObjectNamespace
	TLDRAW_BUCKET: R2Bucket
	WORKER_API_SECRET: string
}

const { preflight, corsify } = cors()

const router = AutoRouter<IRequest, [env: Env, ctx: ExecutionContext]>({
	before: [preflight],
	finally: [corsify],
	catch: (e) => {
		console.error(e)
		const res = error(e)
		res.headers.set('Access-Control-Allow-Origin', '*')
		return res
	},
})

	// secure transcript DO routing
	.all('/api/transcript/:roomId/*', (request, env) => {
		const secret = request.headers.get('X-Worker-Secret')
		if (!env.WORKER_API_SECRET || secret !== env.WORKER_API_SECRET) {
			return error(401, 'Unauthorized')
		}
	})
	.all('/api/transcript/:roomId/*', (request, env) => {
		const id = env.TRANSCRIPT_DURABLE_OBJECT.idFromName(request.params.roomId)
		const transcriptDo = env.TRANSCRIPT_DURABLE_OBJECT.get(id)
		const fetchOpts: RequestInit = {
			method: request.method,
			headers: request.headers,
		}
		if (request.method !== 'GET' && request.method !== 'HEAD') {
			fetchOpts.body = request.body
		}
		return transcriptDo.fetch(request.url, fetchOpts)
	})

	// real-time websocket sync endpoint
	.get('/api/connect/:roomId', (request, env) => {
		const id = env.TLDRAW_DURABLE_OBJECT.idFromName(request.params.roomId)
		const room = env.TLDRAW_DURABLE_OBJECT.get(id)
		return room.fetch(request.url, { headers: request.headers, body: request.body })
	})

	// assets upload/download
	.post('/api/uploads/:uploadId', handleAssetUpload)
	.get('/api/uploads/:uploadId', handleAssetDownload)

	// PDF whiteboard export upload/download
	.post('/api/pdf/:sessionId', handlePdfUpload)
	.get('/api/pdf/:sessionId', handlePdfDownload)

	.all('*', () => {
		return new Response('Not found', { status: 404 })
	})

export default {
	fetch: router.fetch,
}
