import type { Chip, ChipConfig, DdrType } from './types'

export const CHIP_OPTIONS: Chip[] = [
  'mt7622',
  'mt7629',
  'mt7981',
  'mt7986',
  'mt7987',
  'mt7988',
]

export const CHIP_CONFIG: Record<Chip, ChipConfig> = {
  mt7622: { label: 'MT7622', arch: 'aarch64', defaultLoadAddress: 0x201000 },
  mt7629: { label: 'MT7629', arch: 'armv7', defaultLoadAddress: 0x201000 },
  mt7981: { label: 'MT7981', arch: 'aarch64', defaultLoadAddress: 0x201000 },
  mt7986: { label: 'MT7986', arch: 'aarch64', defaultLoadAddress: 0x201000 },
  mt7987: { label: 'MT7987', arch: 'aarch64', defaultLoadAddress: 0x201000 },
  mt7988: { label: 'MT7988', arch: 'aarch64', defaultLoadAddress: 0x201000 },
}

export const DDR_OPTIONS_BY_CHIP: Record<Chip, DdrType[]> = {
  mt7622: ['default', 'flyby'],
  mt7629: ['default'],
  mt7981: ['ddr3', 'ddr4'],
  mt7986: ['ddr3', 'ddr4'],
  mt7987: ['default'],
  mt7988: ['default'],
}

export const DEFAULT_BL2_RELEASE_API =
  'https://api.github.com/repos/Yuzhii0718/bl-mt798x-dhcpd/releases/tags/2026.03.27-0159-bl2-preloader'

export const DEFAULT_FIP_RELEASE_API =
  'https://api.github.com/repos/Yuzhii0718/bl-mt798x-dhcpd/releases/tags/2026.05.01-2238-all'

export const GITHUB_BOOTLOADER_URL = 'https://github.com/Yuzhii0718/bl-mt798x-dhcpd'
export const GITHUB_PROJECT_URL = 'https://github.com/Yuzhii0718/mtk-launchpad'
export const EEPROM_TOOL_URL = 'https://yuzhii0718.eu.org/html/application/mt798x_eeprom/index.html'
