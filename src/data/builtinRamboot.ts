import type { FirmwareCandidate } from '../types'
import { parseFirmwareName } from '../utils/fileNameParsers'

import mt7622FlybyUrl from '../../ramboot/mt7622/bl2-mt7622-flyby-ram-2025-Yuzhii_md5-28bb286ad18c5ea5ad0c818638776276.bin?url'
import mt7622DefaultUrl from '../../ramboot/mt7622/bl2-mt7622-ram-2025-Yuzhii_md5-e25b05d15dc7b41b87c4c9ff8f3293dd.bin?url'
import mt7629DefaultUrl from '../../ramboot/mt7629/bl2-mt7629-ram-2025-Yuzhii_md5-ca58e6b844a8cfef95a193ce2c98c203.bin?url'
import mt7981Ddr3Url from '../../ramboot/mt7981/bl2-mt7981-ddr3-bga-ram-2025-Yuzhii_md5-64a636c1b53805a12b9e88b820eb7c8e.bin?url'
import mt7981Ddr4Url from '../../ramboot/mt7981/bl2-mt7981-ddr4-ram-2025-Yuzhii_md5-f909d64ec53c82ffb16d2875e87feb5f.bin?url'
import mt7986Ddr3Url from '../../ramboot/mt7986/bl2-mt7986-ddr3-ram-2025-Yuzhii_md5-ce03374a0e2bb1bb14e6a182f73b9af2.bin?url'
import mt7986Ddr4Url from '../../ramboot/mt7986/bl2-mt7986-ddr4-ram-2025-Yuzhii_md5-70dc942444d7af78d1c488f9edebfb0b.bin?url'
import mt7987DefaultUrl from '../../ramboot/mt7987/bl2-mt7987-ram-2025-Yuzhii_md5-fe4f0fb4cf5b549706c9df4ea054a3a3.bin?url'
import mt7988DefaultUrl from '../../ramboot/mt7988/bl2-mt7988-ram-2025-Yuzhii_md5-9979bf4eaccab8f3d56004b136013ff4.bin?url'

function asBuiltin(fileName: string, url: string): FirmwareCandidate {
  const parsed = parseFirmwareName(fileName)
  if (!parsed) {
    throw new Error(`Failed to parse built-in firmware name: ${fileName}`)
  }

  return {
    ...parsed,
    source: 'builtin',
    url,
  }
}

export const BUILTIN_BL2_CANDIDATES: FirmwareCandidate[] = [
  asBuiltin(
    'bl2-mt7622-flyby-ram-2025-Yuzhii_md5-28bb286ad18c5ea5ad0c818638776276.bin',
    mt7622FlybyUrl,
  ),
  asBuiltin(
    'bl2-mt7622-ram-2025-Yuzhii_md5-e25b05d15dc7b41b87c4c9ff8f3293dd.bin',
    mt7622DefaultUrl,
  ),
  asBuiltin(
    'bl2-mt7629-ram-2025-Yuzhii_md5-ca58e6b844a8cfef95a193ce2c98c203.bin',
    mt7629DefaultUrl,
  ),
  asBuiltin(
    'bl2-mt7981-ddr3-bga-ram-2025-Yuzhii_md5-64a636c1b53805a12b9e88b820eb7c8e.bin',
    mt7981Ddr3Url,
  ),
  asBuiltin(
    'bl2-mt7981-ddr4-ram-2025-Yuzhii_md5-f909d64ec53c82ffb16d2875e87feb5f.bin',
    mt7981Ddr4Url,
  ),
  asBuiltin(
    'bl2-mt7986-ddr3-ram-2025-Yuzhii_md5-ce03374a0e2bb1bb14e6a182f73b9af2.bin',
    mt7986Ddr3Url,
  ),
  asBuiltin(
    'bl2-mt7986-ddr4-ram-2025-Yuzhii_md5-70dc942444d7af78d1c488f9edebfb0b.bin',
    mt7986Ddr4Url,
  ),
  asBuiltin(
    'bl2-mt7987-ram-2025-Yuzhii_md5-fe4f0fb4cf5b549706c9df4ea054a3a3.bin',
    mt7987DefaultUrl,
  ),
  asBuiltin(
    'bl2-mt7988-ram-2025-Yuzhii_md5-9979bf4eaccab8f3d56004b136013ff4.bin',
    mt7988DefaultUrl,
  ),
]
