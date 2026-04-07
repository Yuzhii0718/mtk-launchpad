export type Chip = 'mt7622' | 'mt7629' | 'mt7981' | 'mt7986' | 'mt7987' | 'mt7988'

export type DdrType = 'default' | 'flyby' | 'ddr3' | 'ddr4'

export type Architecture = 'aarch64' | 'armv7'

export type FirmwareKind = 'bl2' | 'fip'

export type FirmwareSource = 'builtin' | 'github-release' | 'upload'

export type SerialDataBits = 7 | 8

export type SerialStopBits = 1 | 2

export type SerialParity = 'none' | 'even' | 'odd'

export interface SerialOpenOptions {
  baudRate: number
  dataBits: SerialDataBits
  stopBits: SerialStopBits
  parity: SerialParity
}

export interface ParsedFirmwareName {
  kind: FirmwareKind
  fileName: string
  chip: Chip | null
  board?: string
  ddr?: DdrType
  version?: string
  variant?: string
  featureTags?: string
  expectedMd5?: string
}

export interface FirmwareCandidate extends ParsedFirmwareName {
  source: FirmwareSource
  url?: string
  githubAssetApiUrl?: string
  size?: number
}

export interface ChipConfig {
  label: string
  arch: Architecture
  defaultLoadAddress: number
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success'

export interface LogEntry {
  id: number
  level: LogLevel
  message: string
  timestamp: string
}
