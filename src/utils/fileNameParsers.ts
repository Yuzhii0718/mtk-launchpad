import type { Chip, DdrType, FirmwareCandidate, ParsedFirmwareName } from '../types'

const CHIP_SET = new Set<Chip>(['mt7622', 'mt7629', 'mt7981', 'mt7986', 'mt7987', 'mt7988'])
const EXCLUDED_BOARD_TOKENS = new Set([
  'ram',
  'bga',
  'default',
  'ddr3',
  'ddr4',
  'flyby',
  'yuzhii',
  'bl2',
  'fip',
  'dhcpd',
  'fixed',
  'parts',
  'multi',
  'layout',
])

function stripExtension(fileName: string): string {
  return fileName.replace(/\.[A-Za-z0-9]+$/, '')
}

function tokenize(value: string): string[] {
  return value
    .split(/[-_]+/)
    .map((token) => token.trim())
    .filter(Boolean)
}

function asChip(value: string): Chip | null {
  const lower = value.toLowerCase()
  if (!CHIP_SET.has(lower as Chip)) {
    return null
  }
  return lower as Chip
}

export function extractExpectedMd5(fileName: string): string | undefined {
  const matched = fileName.match(/(?:^|[-_])md5[-_](?<md5>[a-f0-9]{32})(?:$|[-_.])/i)
  return matched?.groups?.md5?.toLowerCase()
}

function detectDdr(tokens: string[]): DdrType {
  if (tokens.includes('ddr3')) {
    return 'ddr3'
  }
  if (tokens.includes('ddr4')) {
    return 'ddr4'
  }
  if (tokens.includes('flyby')) {
    return 'flyby'
  }
  return 'default'
}

function detectVersion(tokens: string[]): string | undefined {
  const versionToken = tokens.find((token) => /^(20\d{2}|sp\d+)$/i.test(token))
  return versionToken
}

function parseBoardTokens(tokens: string[]): string | undefined {
  const filtered = tokens.filter((token) => !EXCLUDED_BOARD_TOKENS.has(token))
  if (filtered.length === 0) {
    return undefined
  }
  return filtered.join('-')
}

export function parseBl2FileName(fileName: string): ParsedFirmwareName {
  const stem = stripExtension(fileName)
  const matched = stem.match(/^bl2[-_](?<chip>mt\d{4})[-_](?<body>.+)$/i)
  const chip = asChip(matched?.groups?.chip ?? '')
  const body = (matched?.groups?.body ?? '').replace(/(?:[-_])md5[-_].*$/i, '')
  const bodyTokens = tokenize(body).map((token) => token.toLowerCase())
  const version = detectVersion(bodyTokens)
  const versionIndex = version ? bodyTokens.indexOf(version.toLowerCase()) : -1
  const boardTokenRange = versionIndex > -1 ? bodyTokens.slice(0, versionIndex) : bodyTokens

  return {
    kind: 'bl2',
    fileName,
    chip,
    ddr: detectDdr(bodyTokens),
    board: parseBoardTokens(boardTokenRange),
    version,
    expectedMd5: extractExpectedMd5(fileName),
  }
}

export function parseFipFileName(fileName: string): ParsedFirmwareName {
  const stem = stripExtension(fileName)
  const matched = stem.match(/^fip[-_](?<chip>mt\d{4})[-_](?<body>.+)$/i)
  const chip = asChip(matched?.groups?.chip ?? '')
  const body = (matched?.groups?.body ?? '').replace(/(?:[-_])md5[-_].*$/i, '')
  const tokens = tokenize(body)
  const lowerTokens = tokens.map((token) => token.toLowerCase())
  const version = detectVersion(lowerTokens)
  const versionIndex = version ? lowerTokens.indexOf(version.toLowerCase()) : -1
  const providerIndex = lowerTokens.findIndex((token) => token === 'yuzhii')

  const boardTokens = versionIndex > -1 ? lowerTokens.slice(0, versionIndex) : lowerTokens
  const variantStart = versionIndex > -1 ? versionIndex + 1 : lowerTokens.length
  const variantEnd = providerIndex > variantStart ? providerIndex : lowerTokens.length
  const variantTokens = lowerTokens.slice(variantStart, variantEnd)
  const featureTokens = providerIndex > -1 ? lowerTokens.slice(providerIndex + 1) : []

  return {
    kind: 'fip',
    fileName,
    chip,
    board: parseBoardTokens(boardTokens),
    version,
    variant: variantTokens.length > 0 ? variantTokens.join('-') : undefined,
    featureTags: featureTokens.length > 0 ? featureTokens.join('-') : undefined,
    expectedMd5: extractExpectedMd5(fileName),
  }
}

export function parseFirmwareName(fileName: string): ParsedFirmwareName | null {
  const normalized = fileName.trim()
  if (/^bl2[-_]/i.test(normalized)) {
    return parseBl2FileName(normalized)
  }
  if (/^fip[-_]/i.test(normalized)) {
    return parseFipFileName(normalized)
  }
  return null
}

export function candidateKey(candidate: FirmwareCandidate): string {
  return `${candidate.source}:${candidate.fileName}:${candidate.url ?? ''}`
}

export function formatCandidateLabel(candidate: FirmwareCandidate): string {
  const kind = candidate.kind.toUpperCase()
  const chip = candidate.chip?.toUpperCase() ?? 'UNKNOWN'
  const board = candidate.board ? ` | ${shorten(candidate.board, 24)}` : ''
  const ddr = candidate.ddr && candidate.ddr !== 'default' ? ` | ${candidate.ddr}` : ''
  const version = candidate.version ? ` | ${candidate.version}` : ''
  const md5 = candidate.expectedMd5 ? ` | md5:${candidate.expectedMd5.slice(0, 8)}…` : ''
  return `${kind} | ${chip}${board}${ddr}${version}${md5}`
}

function shorten(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value
  }
  return `${value.slice(0, maxLength - 1)}…`
}
