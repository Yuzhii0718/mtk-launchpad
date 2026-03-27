import { parseBl2FileName, parseFipFileName } from './fileNameParsers'

describe('parseBl2FileName', () => {
  it('parses ramboot naming style', () => {
    const parsed = parseBl2FileName(
      'bl2-mt7981-ddr4-ram-2025-Yuzhii_md5-f909d64ec53c82ffb16d2875e87feb5f.bin',
    )

    expect(parsed.kind).toBe('bl2')
    expect(parsed.chip).toBe('mt7981')
    expect(parsed.ddr).toBe('ddr4')
    expect(parsed.board).toBeUndefined()
    expect(parsed.version).toBe('2025')
    expect(parsed.expectedMd5).toBe('f909d64ec53c82ffb16d2875e87feb5f')
  })

  it('parses release naming style', () => {
    const parsed = parseBl2FileName(
      'bl2-mt7981_ax3000t_2025_md5-0cc06785bda48f185125af84ca173b43_20260323-121813.img',
    )

    expect(parsed.kind).toBe('bl2')
    expect(parsed.chip).toBe('mt7981')
    expect(parsed.board).toBe('ax3000t')
    expect(parsed.version).toBe('2025')
    expect(parsed.expectedMd5).toBe('0cc06785bda48f185125af84ca173b43')
  })
})

describe('parseFipFileName', () => {
  it('parses fip naming style with feature tags', () => {
    const parsed = parseFipFileName(
      'fip-mt7981_ax3000t_2025-Yuzhii-dhcpd-fixed-parts-multi-layout_md5-a07ec2376726094ef699449e3f8d83fd_20260323-121813.bin',
    )

    expect(parsed.kind).toBe('fip')
    expect(parsed.chip).toBe('mt7981')
    expect(parsed.board).toBe('ax3000t')
    expect(parsed.version).toBe('2025')
    expect(parsed.featureTags).toContain('dhcpd')
    expect(parsed.expectedMd5).toBe('a07ec2376726094ef699449e3f8d83fd')
  })
})
