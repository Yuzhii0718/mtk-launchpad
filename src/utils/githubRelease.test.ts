import { beforeEach, describe, expect, it, vi } from 'vitest'
import { downloadFirmwareCandidate } from './githubRelease'
import type { FirmwareCandidate } from '../types'

const releaseCandidate: FirmwareCandidate = {
  kind: 'fip',
  fileName: 'fip-mt7981-test_md5-deadbeef.bin',
  chip: 'mt7981',
  source: 'github-release',
  url: 'https://github.com/example/release/download/file.bin',
  githubAssetApiUrl: 'https://api.github.com/repos/example/repo/releases/assets/123',
}

function mockFailedFetchCollector(): { calls: string[]; restore: () => void } {
  const calls: string[] = []
  const originalFetch = globalThis.fetch
  const mockedFetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    calls.push(url)
    return new Response('nope', {
      status: 404,
      headers: {
        'content-type': 'text/plain',
      },
    })
  })
  vi.stubGlobal('fetch', mockedFetch)
  return {
    calls,
    restore: () => {
      vi.stubGlobal('fetch', originalFetch)
    },
  }
}

describe('downloadFirmwareCandidate', () => {
  const originalWindow = globalThis.window

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('skips local dev proxy attempts on non-localhost production host', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: 'yuzhii0718.eu.org',
        },
      },
      configurable: true,
    })

    const { calls, restore } = mockFailedFetchCollector()

    await expect(downloadFirmwareCandidate(releaseCandidate)).rejects.toThrow('Remote asset fetch failed')

    restore()

    expect(calls.some((url) => url.includes('/__mtk_asset_proxy'))).toBe(false)
    expect(calls.some((url) => url.startsWith('https://api.github.com/'))).toBe(false)
    expect(calls.some((url) => url.startsWith('https://github.com/'))).toBe(false)
    expect(calls.some((url) => url.startsWith('https://corsproxy.io/'))).toBe(false)
    expect(calls.some((url) => url.startsWith('https://cors.isomorphic-git.org/'))).toBe(false)
  })

  it('tries local dev proxy first on localhost', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: 'localhost',
        },
      },
      configurable: true,
    })

    const { calls, restore } = mockFailedFetchCollector()

    await expect(downloadFirmwareCandidate(releaseCandidate)).rejects.toThrow('Remote asset fetch failed')

    restore()

    expect(calls[0]).toContain('/__mtk_asset_proxy?')
  })

  it('includes codetabs proxy in fallback attempts', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: 'yuzhii0718.eu.org',
        },
      },
      configurable: true,
    })

    const { calls, restore } = mockFailedFetchCollector()

    await expect(downloadFirmwareCandidate(releaseCandidate)).rejects.toThrow('Remote asset fetch failed')

    restore()

    expect(calls.some((url) => url.startsWith('https://api.codetabs.com/v1/proxy/?quest='))).toBe(true)
  })

  it('returns binary payload when codetabs proxy succeeds', async () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        location: {
          hostname: 'yuzhii0718.eu.org',
        },
      },
      configurable: true,
    })

    const expectedPayload = new Uint8Array([1, 2, 3, 4]).buffer
    const originalFetch = globalThis.fetch
    const mockedFetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.startsWith('https://api.codetabs.com/v1/proxy/?quest=')) {
        return new Response(expectedPayload, {
          status: 200,
          headers: {
            'content-type': 'application/octet-stream',
          },
        })
      }

      return new Response('nope', {
        status: 404,
        headers: {
          'content-type': 'text/plain',
        },
      })
    })
    vi.stubGlobal('fetch', mockedFetch)

    const result = await downloadFirmwareCandidate(releaseCandidate)
    expect(new Uint8Array(result)).toEqual(new Uint8Array(expectedPayload))

    vi.stubGlobal('fetch', originalFetch)
  })

  afterEach(() => {
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
    })
  })
})