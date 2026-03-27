import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'

const LOCAL_PROXY_PATH = '/__mtk_asset_proxy'
const ALLOWED_PROXY_HOSTS = new Set([
  'api.github.com',
  'github.com',
  'release-assets.githubusercontent.com',
  'objects.githubusercontent.com',
])

async function handleGithubAssetProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  try {
    const requestUrl = new URL(req.url ?? '', 'http://localhost')
    const target = requestUrl.searchParams.get('target')
    const accept = requestUrl.searchParams.get('accept') || '*/*'

    if (!target) {
      res.statusCode = 400
      res.end('Missing target query')
      return
    }

    let upstreamUrl: URL
    try {
      upstreamUrl = new URL(target)
    } catch {
      res.statusCode = 400
      res.end('Invalid target URL')
      return
    }

    if (upstreamUrl.protocol !== 'https:' || !ALLOWED_PROXY_HOSTS.has(upstreamUrl.hostname)) {
      res.statusCode = 403
      res.end('Target host is not allowed')
      return
    }

    const upstream = await fetch(upstreamUrl.toString(), {
      headers: {
        Accept: accept,
      },
      redirect: 'follow',
    })

    if (!upstream.ok) {
      const bodyText = await upstream.text().catch(() => '')
      res.statusCode = upstream.status
      res.setHeader('content-type', 'text/plain; charset=utf-8')
      res.end(bodyText || `Upstream request failed: ${upstream.status}`)
      return
    }

    const contentType = upstream.headers.get('content-type')
    if (contentType) {
      res.setHeader('content-type', contentType)
    }

    const contentDisposition = upstream.headers.get('content-disposition')
    if (contentDisposition) {
      res.setHeader('content-disposition', contentDisposition)
    }

    const payload = Buffer.from(await upstream.arrayBuffer())
    res.statusCode = 200
    res.setHeader('cache-control', 'no-store')
    res.setHeader('content-length', String(payload.byteLength))
    res.end(payload)
  } catch (error) {
    res.statusCode = 502
    res.setHeader('content-type', 'text/plain; charset=utf-8')
    res.end(`Proxy request failed: ${String(error)}`)
  }
}

type MiddlewareHandler = (req: IncomingMessage, res: ServerResponse, next: () => void) => void

function createGithubAssetProxyMiddleware(): MiddlewareHandler {
  return (req, res, next) => {
    void handleGithubAssetProxy(req, res).catch(() => {
      next()
    })
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/mtk-launchpad/',
  plugins: [
    react(),
    {
      name: 'github-asset-local-proxy',
      configureServer(server) {
        server.middlewares.use(LOCAL_PROXY_PATH, createGithubAssetProxyMiddleware())
      },
      configurePreviewServer(server) {
        server.middlewares.use(LOCAL_PROXY_PATH, createGithubAssetProxyMiddleware())
      },
    },
  ],
  test: {
    globals: true,
  },
})
