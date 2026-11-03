import { createServer, type Server } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import config from '../native-auth.config.ts'
import {
  REST_DELETE, REST_GET, REST_OPTIONS, REST_PATCH, REST_POST,
  REST_PUT, GRAPHQL_POST,
} from '@payloadcms/next/routes'

// This uses the real Payload/Next route-handler implementation, not a mock.
// An actual loopback TCP server bridges Node IncomingMessage -> Web Request.
// No external host/port is opened, and only synthetic credentials are used.
const rest = {
  GET: REST_GET(config),
  POST: REST_POST(config),
  PATCH: REST_PATCH(config),
  PUT: REST_PUT(config),
  DELETE: REST_DELETE(config),
  OPTIONS: REST_OPTIONS(config),
} as Record<string, (request: Request, context: unknown) => Promise<Response>>
const graphql = GRAPHQL_POST(config)

async function sendNative(req: IncomingMessage, res: ServerResponse) {
  try {
    const path = req.url ?? '/'
    if (!path.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end('{"error":"Not found"}')
      return
    }
    const method = req.method || 'GET'
    const isGraphql = path.split('?')[0] === '/api/graphql'
    if (!isGraphql && !rest[method]) {
      res.writeHead(405)
      res.end()
      return
    }
    const host = 'http://127.0.0.1:3000'
    const inputHeaders = new Headers()
    for (const [key, value] of Object.entries(req.headers)) {
      if (value == null || key === 'host' || key === 'content-length') continue
      inputHeaders.set(key, Array.isArray(value) ? value.join(',') : value)
    }
    const body = method === 'GET' || method === 'HEAD'
      ? undefined : Buffer.concat(await Array.fromAsync(req)).toString('utf8')
    const request = new Request(host + path, {
      method, headers: inputHeaders,
      ...(body === undefined ? {} : { body }),
    })
    const segments = new URL(host + path).pathname.slice('/api/'.length).split('/')
    const context = { params: Promise.resolve({ slug: segments }) }
    const result = isGraphql
      ? await graphql(request as never, context as never)
      : await rest[method](request, context)
    const outputHeaders: Record<string,string|string[]> = {}
    result.headers.forEach((v,k) => {
      if (k.toLowerCase() !== 'set-cookie') outputHeaders[k] = v
    })
    const cookies = result.headers.getSetCookie?.()
    if (cookies?.length) outputHeaders['set-cookie'] = cookies
    const bytes = Buffer.from(await result.arrayBuffer())
    res.writeHead(result.status, outputHeaders)
    res.end(bytes)
  } catch (error) {
    // Keep errors out of browser responses; errors are still visible in
    // isolated CI logs for debugging (never log request tokens or passwords).
    console.error('G1_NATIVE_HTTP_HANDLER_ERROR', (error as Error)?.message || String(error))
    res.writeHead(500, { 'Content-Type':'application/json' })
    res.end('{"error":"Internal server error"}')
  }
}

export function nativePayloadHttp(): Server {
  return createServer(sendNative)
}
