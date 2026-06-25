import { error, IRequest } from 'itty-router'
import { Env } from './worker'

function getAssetObjectName(uploadId: string) {
	return `uploads/${uploadId.replace(/[^a-zA-Z0-9_-]+/g, '_')}`
}

// Handles binary asset uploads (images/videos)
export async function handleAssetUpload(request: IRequest, env: Env) {
	const objectName = getAssetObjectName(request.params.uploadId)

	const contentType = request.headers.get('content-type') ?? ''
	if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
		return error(400, 'Invalid content type')
	}

	if (await env.TLDRAW_BUCKET.head(objectName)) {
		return error(409, 'Upload already exists')
	}

	await env.TLDRAW_BUCKET.put(objectName, request.body, {
		httpMetadata: request.headers,
	})

	return new Response(JSON.stringify({ ok: true }), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			'access-control-allow-origin': '*',
		}
	})
}

// Handles retrieving uploaded assets, utilizing caching
export async function handleAssetDownload(request: IRequest, env: Env, ctx: ExecutionContext) {
	const objectName = getAssetObjectName(request.params.uploadId)

	const cacheKey = new Request(request.url, { headers: request.headers })
	const cachedResponse = await caches.default.match(cacheKey)
	if (cachedResponse) {
		return cachedResponse
	}

	const object = await env.TLDRAW_BUCKET.get(objectName, {
		range: request.headers,
		onlyIf: request.headers,
	})

	if (!object) {
		return error(404)
	}

	const headers = new Headers()
	object.writeHttpMetadata(headers)

	headers.set('cache-control', 'public, max-age=31536000, immutable')
	headers.set('etag', object.httpEtag)
	headers.set('access-control-allow-origin', '*')
	headers.set('content-security-policy', "default-src 'none'")
	headers.set('x-content-type-options', 'nosniff')

	let contentRange
	if (object.range) {
		if ('suffix' in object.range) {
			const start = object.size - object.range.suffix
			const end = object.size - 1
			contentRange = `bytes ${start}-${end}/${object.size}`
		} else {
			const start = object.range.offset ?? 0
			const end = object.range.length ? start + object.range.length - 1 : object.size - 1
			if (start !== 0 || end !== object.size - 1) {
				contentRange = `bytes ${start}-${end}/${object.size}`
			}
		}
	}

	if (contentRange) {
		headers.set('content-range', contentRange)
	}

	const body = 'body' in object && object.body ? object.body : null
	const status = body ? (contentRange ? 206 : 200) : 304

	if (status === 200) {
		const [cacheBody, responseBody] = body!.tee()
		ctx.waitUntil(caches.default.put(cacheKey, new Response(cacheBody, { headers, status })))
		return new Response(responseBody, { headers, status })
	}

	return new Response(body, { headers, status })
}

// Handles whiteboard PDF exports upload
export async function handlePdfUpload(request: IRequest, env: Env) {
	const sessionId = request.params.sessionId.replace(/[^a-zA-Z0-9_-]+/g, '_')
	const objectName = `notes-pdfs/${sessionId}.pdf`

	const contentType = request.headers.get('content-type') ?? ''
	if (!contentType.startsWith('application/pdf')) {
		return error(400, 'Invalid content type')
	}

	await env.TLDRAW_BUCKET.put(objectName, request.body, {
		httpMetadata: request.headers,
	})

	return new Response(JSON.stringify({ ok: true, url: `/api/pdf/${sessionId}` }), {
		status: 200,
		headers: {
			'content-type': 'application/json',
			'access-control-allow-origin': '*',
		}
	})
}

// Handles retrieving whiteboard PDF exports
export async function handlePdfDownload(request: IRequest, env: Env) {
	const sessionId = request.params.sessionId.replace(/[^a-zA-Z0-9_-]+/g, '_')
	const objectName = `notes-pdfs/${sessionId}.pdf`

	const object = await env.TLDRAW_BUCKET.get(objectName)
	if (!object) {
		return new Response('PDF not found', {
			status: 404,
			headers: { 'access-control-allow-origin': '*' }
		})
	}

	const headers = new Headers()
	object.writeHttpMetadata(headers)
	headers.set('access-control-allow-origin', '*')
	headers.set('content-type', 'application/pdf')

	const body = 'body' in object && object.body ? object.body : null
	return new Response(body, { headers, status: 200 })
}
