import { SerialConnection } from './SerialConnection'
import type { LogLevel } from '../../types'

const BROM_HANDSHAKE = new Uint8Array([0xa0, 0x0a, 0x50, 0x05])
const BL2_REQ = new TextEncoder().encode('mudl')
const BL2_RESP = new TextEncoder().encode('TF-A')

interface Bl2Options {
  payload: ArrayBuffer
  loadAddress: number
  isAarch64: boolean
  bromLoadBaudRate: number
}

interface FipOptions {
  payload: ArrayBuffer
  bl2LoadBaudRate: number
}

export class MtkUartProtocol {
  private readonly serial: SerialConnection
  private readonly log: (level: LogLevel, message: string) => void

  constructor(serial: SerialConnection, log: (level: LogLevel, message: string) => void) {
    this.serial = serial
    this.log = log
  }

  async loadBl2(options: Bl2Options): Promise<void> {
    this.log('info', 'BootROM handshake...')
    await this.bootromHandshake()

    const hwCode = await this.getHwCode()
    this.log('info', `HW code: 0x${hwCode.toString(16)}`)

    const [hwSubCode, hwVer, swVer] = await this.getHwDict()
    this.log('info', `HW sub code: 0x${hwSubCode.toString(16)}`)
    this.log('info', `HW ver: 0x${hwVer.toString(16)}`)
    this.log('info', `SW ver: 0x${swVer.toString(16)}`)

    const config = await this.getTargetConfig()
    if (config.secureBoot) {
      throw new Error('Secure boot enabled')
    }
    if (config.serialLinkAuthorization) {
      throw new Error('Serial link authorization enabled')
    }
    if (config.downloadAgentAuthorization) {
      throw new Error('Download agent authorization enabled')
    }

    await this.setBootromBaudRate(options.bromLoadBaudRate)
    this.log('info', `BootROM load baudrate: ${options.bromLoadBaudRate}`)

    const payload = new Uint8Array(options.payload)
    const checksum = await this.sendDa(options.loadAddress, 0, payload)
    this.log('info', `Payload sent, checksum: 0x${checksum.toString(16)}`)

    await this.setBootromBaudRate(115200)
    this.log('info', 'BootROM baudrate switched back to 115200')

    if (options.isAarch64) {
      await this.jumpDa64(options.loadAddress)
      this.log('success', `Jumped to 0x${options.loadAddress.toString(16)} (aarch64)`)
      return
    }

    await this.jumpDa32(options.loadAddress)
    this.log('success', `Jumped to 0x${options.loadAddress.toString(16)} (aarch32)`)
  }

  async loadFip(options: FipOptions): Promise<void> {
    this.log('info', 'Waiting BL2 UART handshake banner...')
    await this.serial.readUntilPattern('Starting UART download handshake', 20000)
    this.log('info', 'BL2 handshake banner detected')
    await this.serial.drainInput(30)

    await this.bl2Handshake()
    const version = await this.bl2Version()
    this.log('info', `BL2 UART DL version: 0x${version.toString(16)}`)

    await this.bl2SetBaudrate(options.bl2LoadBaudRate)
    this.log('info', `BL2 baudrate switched to ${options.bl2LoadBaudRate}`)

    await this.bl2Handshake()

    const payload = new Uint8Array(options.payload)
    this.log('info', `FIP transfer start: ${formatByteSize(payload.length)}`)
    await this.bl2SendFip(payload, options.bl2LoadBaudRate)
    this.log('info', 'FIP sent')

    await this.bl2Go()
    this.log('success', 'BL2 GO command sent')
  }

  private async bootromHandshake(): Promise<void> {
    const deadline = Date.now() + 15000
    await this.serial.drainInput(20)
    let i = 0
    while (i < BROM_HANDSHAKE.length) {
      if (Date.now() > deadline) {
        throw new Error('BootROM handshake timeout. Please replug/reset device into BootROM mode and retry.')
      }
      const tx = BROM_HANDSHAKE[i]
      await this.serial.write(new Uint8Array([tx]))
      try {
        const rx = await this.serial.readExact(1, 10)
        const expected = (~tx) & 0xff
        if (rx[0] === expected) {
          i += 1
          continue
        }
        i = 0
      } catch {
        // keep trying
      }
    }

    await sleep(200)
    await this.serial.drainInput(30)
  }

  private async echo(buffer: Uint8Array): Promise<void> {
    await this.serial.write(buffer)
    const received = await this.serial.readExact(buffer.length)
    for (let i = 0; i < buffer.length; i += 1) {
      if (received[i] !== buffer[i]) {
        throw new Error(`Echo mismatch at ${i}: ${buffer[i]} != ${received[i]}`)
      }
    }
  }

  private async readBe16(timeoutMs?: number): Promise<number> {
    const bytes = timeoutMs === undefined
      ? await this.serial.readExact(2)
      : await this.serial.readExact(2, timeoutMs)
    return (bytes[0] << 8) | bytes[1]
  }

  private async readBe32(timeoutMs?: number): Promise<number> {
    const bytes = timeoutMs === undefined
      ? await this.serial.readExact(4)
      : await this.serial.readExact(4, timeoutMs)
    return (
      (bytes[0] << 24) |
      (bytes[1] << 16) |
      (bytes[2] << 8) |
      bytes[3]
    ) >>> 0
  }

  private async getHwCode(): Promise<number> {
    await this.echo(Uint8Array.of(0xfd))
    const code = await this.readBe16()
    const status = await this.readBe16()
    ensureStatus(status, 'get_hw_code')
    return code
  }

  private async getHwDict(): Promise<[number, number, number]> {
    await this.echo(Uint8Array.of(0xfc))
    const subCode = await this.readBe16()
    const hwVer = await this.readBe16()
    const swVer = await this.readBe16()
    const status = await this.readBe16()
    ensureStatus(status, 'get_hw_dict')
    return [subCode, hwVer, swVer]
  }

  private async getTargetConfig(): Promise<{
    secureBoot: boolean
    serialLinkAuthorization: boolean
    downloadAgentAuthorization: boolean
  }> {
    await this.echo(Uint8Array.of(0xd8))
    const cfg = await this.readBe32()
    const status = await this.readBe16()
    ensureStatus(status, 'get_target_config')

    return {
      secureBoot: (cfg & 0x1) !== 0,
      serialLinkAuthorization: (cfg & 0x2) !== 0,
      downloadAgentAuthorization: (cfg & 0x4) !== 0,
    }
  }

  private async sendDa(daAddress: number, sigLength: number, payload: Uint8Array): Promise<number> {
    await this.echo(Uint8Array.of(0xd7))
    await this.echo(toBe32(daAddress))
    await this.echo(toBe32(payload.length - sigLength))
    await this.echo(toBe32(sigLength))

    const status = await this.readBe16()
    ensureStatus(status, 'send_da_prepare')

    this.log('info', `Payload transfer start: ${formatByteSize(payload.length)}`)
    await this.sendDaPayload(payload)
    const checksum = await this.readBe16()
    const endStatus = await this.readBe16()
    ensureStatus(endStatus, 'send_da_finish')
    return checksum
  }

  private async sendDaPayload(payload: Uint8Array): Promise<void> {
    if (payload.length === 0) {
      this.log('info', 'Payload progress 100% (0 B/0 B)')
      return
    }

    const chunkSize = 32 * 1024
    let sent = 0
    let lastProgress = -1

    while (sent < payload.length) {
      const next = Math.min(payload.length, sent + chunkSize)
      const chunk = payload.slice(sent, next)
      await this.serial.write(chunk)
      sent = next

      const percent = Math.min(100, Math.floor((sent * 100) / payload.length))
      if (percent >= 100 || percent - lastProgress >= 5) {
        this.log('info', `Payload progress ${percent}% (${formatByteSize(sent)}/${formatByteSize(payload.length)})`)
        lastProgress = percent
      }
    }
  }

  private async setBootromBaudRate(baudRate: number): Promise<void> {
    await this.echo(Uint8Array.of(0xdc))
    await this.echo(toBe32(baudRate))
    const status = await this.readBe16()
    if (status === 0x1d1d) {
      throw new Error(`Baudrate too high for BootROM: ${baudRate}`)
    }
    ensureStatus(status, 'set_bootrom_baudrate')
    await this.serial.reopenAtBaudRate(baudRate)
  }

  private async jumpDa32(address: number): Promise<void> {
    await this.echo(Uint8Array.of(0xd5))
    await this.echo(toBe32(address))
    const status = await this.readBe16()
    ensureStatus(status, 'jump_da')
  }

  private async jumpDa64(address: number): Promise<void> {
    await this.echo(Uint8Array.of(0xde))
    await this.echo(toBe32(address))
    await this.echo(Uint8Array.of(1))
    ensureStatus(await this.readBe16(), 'jump_da64')
    await this.echo(Uint8Array.of(100))
    ensureStatus(await this.readBe16(), 'jump_da64_magic')
  }

  private async bl2Handshake(): Promise<void> {
    const deadline = Date.now() + 20000
    let i = 0
    while (i < BL2_REQ.length) {
      if (Date.now() > deadline) {
        throw new Error('BL2 handshake timeout. Please power-cycle device and retry.')
      }
      await this.serial.write(Uint8Array.of(BL2_REQ[i]))
      try {
        const rx = await this.serial.readExact(1, 500)
        if (rx[0] === BL2_RESP[i]) {
          i += 1
        }
      } catch (error) {
        const message = String(error).toLowerCase()
        if (!message.includes('timeout')) {
          throw error
        }
      }
    }
    await sleep(200)
    await this.serial.drainInput(30)
  }

  private async bl2Version(): Promise<number> {
    await this.echo(Uint8Array.of(1))
    const version = await this.serial.readExact(1)
    return version[0]
  }

  private async bl2SetBaudrate(baudRate: number): Promise<void> {
    await this.echo(Uint8Array.of(2))
    await this.echo(toBe32(baudRate))
    await this.serial.reopenAtBaudRate(baudRate)
  }

  private static fipChecksum(chunk: Uint8Array): number {
    let csum = 0
    let index = 0
    while (index + 1 < chunk.length) {
      const value = (chunk[index] << 8) | chunk[index + 1]
      csum += value
      index += 2
    }

    if (index < chunk.length) {
      csum += chunk[index] << 8
    }

    while ((csum >>> 16) !== 0) {
      csum = ((csum >>> 16) & 0xffff) + (csum & 0xffff)
    }

    return csum & 0xffff
  }

  private async bl2SendFipPacket(index: number, packet: Uint8Array, ackTimeoutMs: number): Promise<boolean> {
    const checksum = MtkUartProtocol.fipChecksum(packet)
    await this.echo(toBe32(index))
    await this.echo(toBe16(packet.length))
    await this.echo(toBe16(checksum))
    await this.serial.write(packet)

    const expectedIndex = await this.readBe32(ackTimeoutMs)
    const actualChecksum = await this.readBe16(ackTimeoutMs)

    if (expectedIndex !== index) {
      this.log('warn', `Packet index mismatch: ${expectedIndex} != ${index}`)
      return false
    }

    if (actualChecksum !== checksum) {
      this.log('warn', `Packet checksum mismatch: 0x${actualChecksum.toString(16)} != 0x${checksum.toString(16)}`)
      return false
    }

    return true
  }

  private async bl2SendFip(payload: Uint8Array, baudRate: number): Promise<void> {
    await this.echo(Uint8Array.of(3))
    await this.echo(toBe32(payload.length))
    this.log('info', `FIP packets uploading at ${baudRate} baud...`)

    let packetIndex = 0
    let packetLength = 128
    let cursor = 0
    let lastProgress = -1

    const logProgress = (): void => {
      const percent = Math.min(100, Math.floor((cursor * 100) / payload.length))
      if (percent >= 100 || percent - lastProgress >= 5) {
        this.log('info', `FIP progress ${percent}% (${formatByteSize(cursor)}/${formatByteSize(payload.length)})`)
        lastProgress = percent
      }
    }

    while (payload.length - cursor > packetLength) {
      const packet = payload.slice(cursor, cursor + packetLength)
      const ackTimeoutMs = computeFipAckTimeoutMs(packet.length, baudRate)
      const sent = await this.bl2SendFipPacket(packetIndex, packet, ackTimeoutMs)
      if (sent) {
        packetIndex += 1
        cursor += packetLength
        logProgress()
        if (packetLength < 32768) {
          packetLength *= 2
        } else if (packetLength < 65536 - 1024) {
          packetLength += 1024
        }
      }
    }

    const finalPacket = payload.slice(cursor)
    const finalAckTimeoutMs = computeFipAckTimeoutMs(finalPacket.length, baudRate)
    while (!(await this.bl2SendFipPacket(packetIndex, finalPacket, finalAckTimeoutMs))) {
      // retry until success
    }
    cursor = payload.length
    logProgress()
  }

  private async bl2Go(): Promise<void> {
    await this.echo(Uint8Array.of(4))
  }
}

function toBe16(value: number): Uint8Array {
  return Uint8Array.of((value >>> 8) & 0xff, value & 0xff)
}

function toBe32(value: number): Uint8Array {
  return Uint8Array.of(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  )
}

function ensureStatus(status: number, action: string): void {
  if (status !== 0) {
    throw new Error(`${action} status: ${status}`)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function computeFipAckTimeoutMs(packetLength: number, baudRate: number): number {
  const safeBaudRate = Math.max(baudRate, 1)
  const transmitMs = Math.ceil((packetLength * 10 * 1000) / safeBaudRate)
  return Math.max(2000, transmitMs + 2500)
}

function formatByteSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
}
