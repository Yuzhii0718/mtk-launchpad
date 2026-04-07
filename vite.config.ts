import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'

type PackageMeta = {
  version?: string
  author?: string | { name?: string }
}

const packageMeta = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as PackageMeta

function resolveGitShortHash(): string {
  const fromEnv = process.env.VITE_GIT_COMMIT_SHORT
    ?? process.env.GITHUB_SHA
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.CF_PAGES_COMMIT_SHA

  if (fromEnv) {
    return fromEnv.slice(0, 7)
  }

  try {
    return execSync('git rev-parse --short=7 HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
  } catch {
    return 'nogit'
  }
}

function hasDirtyWorkingTree(): boolean {
  try {
    const status = execSync('git status --porcelain', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
    return status.length > 0
  } catch {
    return false
  }
}

function resolveAppVersion(isDevMode: boolean): string {
  const version = `${APP_VERSION_BASE}+${resolveGitShortHash()}`
  if (!isDevMode) {
    return version
  }

  return hasDirtyWorkingTree() ? `${version}-dirty` : version
}

const APP_VERSION_BASE = packageMeta.version ? `v${packageMeta.version}` : 'v0.0.0'
const APP_AUTHOR = typeof packageMeta.author === 'string'
  ? packageMeta.author
  : packageMeta.author?.name ?? '-'

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
export default defineConfig(({ command, mode }) => {
  const isDevMode = command === 'serve' && mode === 'development'
  const appVersion = resolveAppVersion(isDevMode)

  return {
    base: '/mtk-launchpad/',
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __APP_AUTHOR__: JSON.stringify(APP_AUTHOR),
    },
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
  }
})
