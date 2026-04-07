import type { FirmwareCandidate } from '../types'
import { parseFirmwareName } from './fileNameParsers'

interface GithubReleaseAsset {
  url: string
  name: string
  size: number
  browser_download_url: string
}

interface GithubReleaseResponse {
  tag_name: string
  assets: GithubReleaseAsset[]
}

export interface ReleaseQueryResult {
  tag: string
  candidates: FirmwareCandidate[]
}

const LOCAL_PROXY_PATH = '/__mtk_asset_proxy'

const CORS_PROXIES: Array<{ label: string; buildUrl: (url: string) => string }> = [
  {
    label: 'codetabs-proxy',
    buildUrl: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
  },
]

const NOISY_FALLBACK_PROXIES: Array<{ label: string; buildUrl: (url: string) => string }> = [
  {
    label: 'corsproxy-io',
    buildUrl: (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
  },
  {
    label: 'isomorphic-git-proxy',
    buildUrl: (url) => `https://cors.isomorphic-git.org/${url}`,
  },
]

function buildLocalProxyUrl(targetUrl: string, accept?: string): string {
  const params = new URLSearchParams({
    target: targetUrl,
  })
  if (accept) {
    params.set('accept', accept)
  }
  return `${LOCAL_PROXY_PATH}?${params.toString()}`
}

function shouldTryLocalDevProxy(): boolean {
  if (typeof window === 'undefined') {
    return true
  }

  const host = window.location.hostname.toLowerCase()
  return host === 'localhost'
    || host === '127.0.0.1'
    || host === '[::1]'
}

export async function fetchReleaseCandidates(apiUrl: string): Promise<ReleaseQueryResult> {
  const response = await fetch(apiUrl, {
    headers: {
      Accept: 'application/vnd.github+json',
    },
  })

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`)
  }

  const json = (await response.json()) as GithubReleaseResponse

  const candidates: FirmwareCandidate[] = json.assets.flatMap((asset) => {
    const parsed = parseFirmwareName(asset.name)
    if (!parsed) {
      return []
    }

    const candidate: FirmwareCandidate = {
      ...parsed,
      source: 'github-release',
      size: asset.size,
      url: asset.browser_download_url,
      githubAssetApiUrl: asset.url,
    }
    return [candidate]
  })

  return {
    tag: json.tag_name,
    candidates,
  }
}

export async function downloadFirmwareCandidate(candidate: FirmwareCandidate): Promise<ArrayBuffer> {
  if (candidate.source !== 'github-release') {
    if (!candidate.url) {
      throw new Error('Missing firmware URL')
    }

    const response = await fetch(candidate.url)
    if (!response.ok) {
      throw new Error(`File download failed: ${response.status}`)
    }
    return response.arrayBuffer()
  }

  const attempts: Array<{ url: string; init?: RequestInit; label: string }> = []
  const localDevProxyEnabled = shouldTryLocalDevProxy()
  const includeNoisyFallbacks = localDevProxyEnabled

  if (candidate.githubAssetApiUrl) {
    if (localDevProxyEnabled) {
      attempts.push({
        url: buildLocalProxyUrl(candidate.githubAssetApiUrl, 'application/octet-stream'),
        label: 'local-dev-proxy-github-asset-api',
      })

      attempts.push({
        url: candidate.githubAssetApiUrl,
        init: {
          headers: {
            Accept: 'application/octet-stream',
          },
        },
        label: 'github-asset-api',
      })
    }
  }
  if (candidate.url) {
    if (localDevProxyEnabled) {
      attempts.push({
        url: buildLocalProxyUrl(candidate.url),
        label: 'local-dev-proxy-github-browser-download-url',
      })

      attempts.push({
        url: candidate.url,
        label: 'github-browser-download-url',
      })
    }
  }

  if (candidate.githubAssetApiUrl) {
    for (const proxy of CORS_PROXIES) {
      attempts.push({
        url: proxy.buildUrl(candidate.githubAssetApiUrl),
        init: {
          headers: {
            Accept: 'application/octet-stream',
          },
        },
        label: `${proxy.label}-github-asset-api`,
      })
    }

    if (includeNoisyFallbacks) {
      for (const proxy of NOISY_FALLBACK_PROXIES) {
        attempts.push({
          url: proxy.buildUrl(candidate.githubAssetApiUrl),
          init: {
            headers: {
              Accept: 'application/octet-stream',
            },
          },
          label: `${proxy.label}-github-asset-api`,
        })
      }
    }
  }

  if (candidate.url) {
    for (const proxy of CORS_PROXIES) {
      attempts.push({
        url: proxy.buildUrl(candidate.url),
        label: `${proxy.label}-github-browser-download-url`,
      })
    }

    if (includeNoisyFallbacks) {
      for (const proxy of NOISY_FALLBACK_PROXIES) {
        attempts.push({
          url: proxy.buildUrl(candidate.url),
          label: `${proxy.label}-github-browser-download-url`,
        })
      }
    }
  }

  if (attempts.length === 0) {
    throw new Error('Missing firmware URL')
  }

  const errors: string[] = []

  for (const attempt of attempts) {
    try {
      const response = await fetch(attempt.url, attempt.init)
      if (!response.ok) {
        errors.push(`${attempt.label}: HTTP ${response.status}`)
        continue
      }

      const contentType = response.headers.get('content-type')?.toLowerCase() ?? ''
      if (contentType.includes('application/json')) {
        const text = await response.text()
        errors.push(`${attempt.label}: unexpected json response (${text.slice(0, 120)})`)
        continue
      }

      return response.arrayBuffer()
    } catch (error) {
      errors.push(`${attempt.label}: ${String(error)}`)
    }
  }

  const extraHint = localDevProxyEnabled
    ? ''
    : ' Hint: this site is running in static mode; local dev proxy is unavailable, so remote loading depends on CORS-capable relay endpoints.'

  throw new Error(
    `Remote asset fetch failed. ${errors.join(' | ')}${extraHint}`,
  )
}

export function triggerBrowserFileDownload(candidate: FirmwareCandidate): void {
  if (!candidate.url) {
    throw new Error('Missing browser download URL')
  }

  const anchor = document.createElement('a')
  anchor.href = candidate.url
  anchor.download = candidate.fileName
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

export function triggerBrowserFileDownloadFromApi(candidate: FirmwareCandidate): void {
  if (!candidate.githubAssetApiUrl) {
    triggerBrowserFileDownload(candidate)
    return
  }

  const anchor = document.createElement('a')
  anchor.href = candidate.githubAssetApiUrl
  anchor.rel = 'noopener noreferrer'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}
