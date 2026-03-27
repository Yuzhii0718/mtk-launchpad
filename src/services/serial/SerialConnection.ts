const DEFAULT_TIMEOUT_MS = 2000

type WebSerialLike = {
  getPorts?: () => Promise<WebSerialPortLike[]>
  requestPort: () => Promise<WebSerialPortLike>
}

type WebSerialPortInfoLike = {
  usbVendorId?: number
  usbProductId?: number
  bluetoothServiceClassId?: number
}

type WebSerialPortLike = {
  open: (options: {
    baudRate: number
    dataBits: 8
    stopBits: 1
    parity: 'none'
    flowControl: 'none'
  }) => Promise<void>
  close: () => Promise<void>
  forget?: () => Promise<void>
  getInfo?: () => WebSerialPortInfoLike
  readable?: ReadableStream<Uint8Array>
  writable?: WritableStream<Uint8Array>
}

export class SerialConnection {
  private port: WebSerialPortLike | null = null
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null
  private unreadBuffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  private pendingReadPromise: Promise<ReadableStreamReadResult<Uint8Array>> | null = null
  private baudRate = 115200
  private autoSelectedAuthorizedPort = false

  static isSupported(): boolean {
    const nav = navigator as Navigator & { serial?: WebSerialLike }
    return Boolean(nav.serial)
  }

  get isOpen(): boolean {
    return this.port !== null
  }

  get currentBaudRate(): number {
    return this.baudRate
  }

  get portInfo(): string {
    const info = this.port?.getInfo?.()
    if (!info) {
      return 'unknown'
    }
    return formatPortInfo(info)
  }

  get isAutoSelectedFromAuthorizedPorts(): boolean {
    return this.autoSelectedAuthorizedPort
  }

  async open(baudRate: number): Promise<void> {
    const nav = navigator as Navigator & { serial?: WebSerialLike }
    if (!nav.serial) {
      throw new Error('Web Serial not supported')
    }

    if (this.port) {
      await this.close()
    }

    this.autoSelectedAuthorizedPort = false
    const authorizedPorts = (await nav.serial.getPorts?.()) ?? []
    if (authorizedPorts.length === 1) {
      this.port = authorizedPorts[0]
      this.autoSelectedAuthorizedPort = true
    } else {
      this.port = await nav.serial.requestPort()
    }

    await this.port.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    })

    this.reader = this.port.readable?.getReader() ?? null
    this.writer = this.port.writable?.getWriter() ?? null
    this.unreadBuffer = new Uint8Array(0)
    this.pendingReadPromise = null
    this.baudRate = baudRate
  }

  async reopenAtBaudRate(baudRate: number): Promise<void> {
    if (!this.port) {
      throw new Error('Serial port is not open')
    }

    const reusedPort = this.port
    await this.close()
    await reusedPort.open({
      baudRate,
      dataBits: 8,
      stopBits: 1,
      parity: 'none',
      flowControl: 'none',
    })

    this.port = reusedPort
    this.reader = this.port.readable?.getReader() ?? null
    this.writer = this.port.writable?.getWriter() ?? null
    this.unreadBuffer = new Uint8Array(0)
    this.pendingReadPromise = null
    this.baudRate = baudRate
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.writer) {
      throw new Error('Serial writer is not ready')
    }
    await this.writer.write(data)
  }

  async readExact(length: number, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Uint8Array> {
    if (!this.reader) {
      throw new Error('Serial reader is not ready')
    }

    const deadline = Date.now() + timeoutMs

    while (this.unreadBuffer.length < length) {
      const timeLeft = deadline - Date.now()
      if (timeLeft <= 0) {
        throw new Error(`Serial read timeout (${timeoutMs} ms)`)
      }

      const chunk = await this.readChunk(timeLeft)
      this.unreadBuffer = concat(this.unreadBuffer, chunk)
    }

    const result = this.unreadBuffer.slice(0, length)
    this.unreadBuffer = this.unreadBuffer.slice(length)
    return result
  }

  async readUntilPattern(pattern: string, timeoutMs: number): Promise<string> {
    const decoder = new TextDecoder()
    let text = ''
    const deadline = Date.now() + timeoutMs

    while (Date.now() < deadline) {
      const byte = await this.readExact(1, Math.max(100, deadline - Date.now()))
      text += decoder.decode(byte, { stream: true })
      if (text.includes(pattern)) {
        return text
      }
    }

    throw new Error(`Pattern timeout: ${pattern}`)
  }

  async drainInput(maxIdleMs = 100): Promise<void> {
    try {
      while (true) {
        await this.readExact(1, maxIdleMs)
      }
    } catch {
      // no-op, timeout means drained
    }
  }

  async close(): Promise<void> {
    if (this.reader) {
      await this.reader.cancel().catch(() => undefined)
      this.reader.releaseLock()
      this.reader = null
    }

    if (this.writer) {
      await this.writer.close().catch(() => undefined)
      this.writer.releaseLock()
      this.writer = null
    }

    if (this.port) {
      await this.port.close().catch(() => undefined)
      this.port = null
    }

    this.autoSelectedAuthorizedPort = false
    this.unreadBuffer = new Uint8Array(0)
    this.pendingReadPromise = null
  }

  async forgetCurrentPort(): Promise<boolean> {
    const target = this.port
    if (!target) {
      return false
    }

    await this.close()

    if (typeof target.forget !== 'function') {
      return false
    }

    await target.forget()
    return true
  }

  private async readChunk(timeoutMs: number): Promise<Uint8Array> {
    if (!this.reader) {
      throw new Error('Serial reader is not ready')
    }

    if (!this.pendingReadPromise) {
      const reader = this.reader
      this.pendingReadPromise = reader.read().finally(() => {
        if (this.pendingReadPromise) {
          this.pendingReadPromise = null
        }
      })
    }

    const readPromise = this.pendingReadPromise
    let timer: ReturnType<typeof setTimeout> | null = null
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error('Serial read timeout'))
      }, timeoutMs)
    })

    let result: ReadableStreamReadResult<Uint8Array>
    try {
      result = (await Promise.race([readPromise, timeoutPromise])) as ReadableStreamReadResult<Uint8Array>
    } finally {
      if (timer) {
        clearTimeout(timer)
      }
    }
    if (result.done || !result.value) {
      throw new Error('Serial stream closed')
    }

    const value = result.value
    return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }
}

function concat(left: Uint8Array<ArrayBufferLike>, right: Uint8Array<ArrayBufferLike>): Uint8Array<ArrayBufferLike> {
  const next = new Uint8Array(left.length + right.length)
  next.set(left, 0)
  next.set(right, left.length)
  return next
}

function formatPortInfo(info: WebSerialPortInfoLike): string {
  const vid = typeof info.usbVendorId === 'number' ? `0x${info.usbVendorId.toString(16).padStart(4, '0')}` : 'n/a'
  const pid = typeof info.usbProductId === 'number' ? `0x${info.usbProductId.toString(16).padStart(4, '0')}` : 'n/a'

  if (typeof info.bluetoothServiceClassId === 'number') {
    return `BT:${info.bluetoothServiceClassId} VID:${vid} PID:${pid}`
  }

  return `VID:${vid} PID:${pid}`
}
