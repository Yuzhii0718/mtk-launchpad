import { useCallback, useRef, useState } from 'react'
import type { KeyboardEvent, MutableRefObject } from 'react'
import type { LogLevel } from '../types'
import { sleepMs, stringifyError } from '../utils/common'
import {
  applyTerminalChunk,
  createTerminalScreenState,
  resetTerminalScreenState,
  type TerminalScreenState,
} from '../utils/terminalScreen'
import {
  buildSpecialKeyPayload,
  formatSpecialKeyLabel,
  mapKeyboardEventToSpecialKey,
  resolveLineEnding,
  visualizeControlChars,
  type TerminalNewlineMode,
  type TerminalSpecialKey,
} from '../utils/terminalControl'
import { SerialConnection } from '../services/serial/SerialConnection'

export type ConsoleTab = 'logs' | 'terminal'

type UseTerminalControllerParams = {
  connectionRef: MutableRefObject<SerialConnection | null>
  isConnected: boolean
  isRunning: boolean
  addLog: (level: LogLevel, message: string) => void
  getText: (key: string) => string
}

export function useTerminalController(input: UseTerminalControllerParams) {
  const { connectionRef, isConnected, isRunning, addLog, getText } = input

  const [activeConsoleTab, setActiveConsoleTab] = useState<ConsoleTab>('logs')
  const [terminalOutput, setTerminalOutput] = useState('')
  const [terminalInput, setTerminalInput] = useState('')
  const [isTerminalRunning, setIsTerminalRunning] = useState(false)
  const [terminalAppendNewline, setTerminalAppendNewline] = useState(true)
  const [terminalNewlineMode, setTerminalNewlineMode] = useState<TerminalNewlineMode>('crlf')
  const [terminalRxBytes, setTerminalRxBytes] = useState(0)
  const [isUbootInterrupting, setIsUbootInterrupting] = useState(false)

  const terminalStopRequestedRef = useRef(false)
  const terminalLoopPromiseRef = useRef<Promise<void> | null>(null)
  const terminalScreenRef = useRef<TerminalScreenState>(createTerminalScreenState())

  const clearTerminalOutput = useCallback((): void => {
    resetTerminalScreenState(terminalScreenRef.current)
    setTerminalOutput('')
    setTerminalRxBytes(0)
  }, [])

  const appendTerminalOutput = useCallback((chunk: string): void => {
    if (!chunk) {
      return
    }
    const normalized = applyTerminalChunk(terminalScreenRef.current, chunk)
    const next = normalized
    if (next.length <= 200000) {
      setTerminalOutput(next)
      return
    }
    setTerminalOutput(next.slice(next.length - 200000))
  }, [])

  const stopTerminalSession = useCallback(async (withLog: boolean): Promise<void> => {
    terminalStopRequestedRef.current = true
    const loop = terminalLoopPromiseRef.current
    if (loop) {
      await loop.catch(() => undefined)
    }
    terminalLoopPromiseRef.current = null
    setIsTerminalRunning(false)
    if (withLog) {
      addLog('info', getText('terminalStopped'))
    }
  }, [addLog, getText])

  const startTerminalSession = useCallback(async (withLog: boolean): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }
    if (isRunning) {
      addLog('warn', getText('terminalWaitForWorkflow'))
      return
    }
    if (terminalLoopPromiseRef.current) {
      return
    }

    terminalStopRequestedRef.current = false
    setIsTerminalRunning(true)
    setActiveConsoleTab('terminal')
    if (withLog) {
      addLog('info', getText('terminalStarted'))
    }

    const decoder = new TextDecoder()
    terminalLoopPromiseRef.current = (async () => {
      try {
        while (!terminalStopRequestedRef.current) {
          try {
            const bytes = await connection.readExact(1, 300)
            setTerminalRxBytes((prev) => prev + bytes.length)
            appendTerminalOutput(decoder.decode(bytes, { stream: true }))
          } catch (error) {
            if (terminalStopRequestedRef.current) {
              break
            }
            const message = stringifyError(error)
            if (message.toLowerCase().includes('timeout')) {
              continue
            }
            throw error
          }
        }
      } catch (error) {
        addLog('error', `${getText('terminalReadFailed')}: ${stringifyError(error)}`)
      } finally {
        terminalLoopPromiseRef.current = null
        setIsTerminalRunning(false)
      }
    })()
  }, [addLog, appendTerminalOutput, connectionRef, getText, isConnected, isRunning])

  const handleSendTerminalInput = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    const raw = terminalInput
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }
    if (!isTerminalRunning) {
      addLog('warn', getText('terminalStartBeforeSend'))
      return
    }
    if (!raw.length) {
      return
    }

    try {
      const lineEnding = terminalAppendNewline ? resolveLineEnding(terminalNewlineMode) : ''
      const payload = `${raw}${lineEnding}`
      if (!payload.length) {
        return
      }
      appendTerminalOutput(`\n> ${visualizeControlChars(payload)}\n`)
      await connection.write(new TextEncoder().encode(payload))
      setTerminalInput('')
    } catch (error) {
      addLog('error', `${getText('terminalWriteFailed')}: ${stringifyError(error)}`)
    }
  }, [
    addLog,
    appendTerminalOutput,
    connectionRef,
    getText,
    isConnected,
    isTerminalRunning,
    terminalAppendNewline,
    terminalInput,
    terminalNewlineMode,
  ])

  const sendTerminalSpecialKey = useCallback(async (key: TerminalSpecialKey): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }
    if (!isTerminalRunning) {
      addLog('warn', getText('terminalStartBeforeSend'))
      return
    }

    const payload = buildSpecialKeyPayload(key, terminalNewlineMode)
    if (!payload.length) {
      return
    }

    try {
      appendTerminalOutput(`\n> [${formatSpecialKeyLabel(key, getText)}] ${visualizeControlChars(payload)}\n`)
      await connection.write(new TextEncoder().encode(payload))
    } catch (error) {
      addLog('error', `${getText('terminalWriteFailed')}: ${stringifyError(error)}`)
    }
  }, [addLog, appendTerminalOutput, connectionRef, getText, isConnected, isTerminalRunning, terminalNewlineMode])

  const runUbootInterruptSequence = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }

    if (!terminalLoopPromiseRef.current) {
      await startTerminalSession(false)
    }

    setIsUbootInterrupting(true)
    addLog('info', getText('ubootInterruptRunning'))

    const encoder = new TextEncoder()
    const payload = buildSpecialKeyPayload('esc', terminalNewlineMode)
    const deadline = Date.now() + 5000
    let sent = 0

    try {
      appendTerminalOutput(`\n> [${getText('interruptIntoUboot')}] ${visualizeControlChars(payload)} x ~5s\n`)
      while (Date.now() < deadline) {
        await connection.write(encoder.encode(payload))
        sent += 1
        await sleepMs(80)
      }
      addLog('success', `${getText('ubootInterruptDone')} (${sent} ESC)`)
    } catch (error) {
      addLog('error', `${getText('ubootInterruptFailed')}: ${stringifyError(error)}`)
    } finally {
      setIsUbootInterrupting(false)
    }
  }, [addLog, appendTerminalOutput, connectionRef, getText, isConnected, startTerminalSession, terminalNewlineMode])

  const runFailsafeInterruptSequence = useCallback(async (): Promise<void> => {
    await runUbootInterruptSequence()

    const connection = connectionRef.current
    if (!connection || !isConnected || !isTerminalRunning) {
      return
    }

    const newline = resolveLineEnding(terminalNewlineMode === 'none' ? 'crlf' : terminalNewlineMode)
    const payload = `httpd${newline}`
    const encoder = new TextEncoder()

    addLog('info', getText('failsafeInterruptRunning'))
    try {
      appendTerminalOutput(`\n> [${getText('interruptIntoFailsafe')}] ${visualizeControlChars(payload)}\n`)
      await sleepMs(120)
      await connection.write(encoder.encode(payload))
      addLog('success', getText('failsafeInterruptDone'))
    } catch (error) {
      addLog('error', `${getText('failsafeInterruptFailed')}: ${stringifyError(error)}`)
    }
  }, [
    addLog,
    appendTerminalOutput,
    connectionRef,
    getText,
    isConnected,
    isTerminalRunning,
    runUbootInterruptSequence,
    terminalNewlineMode,
  ])

  const handleInterruptIntoUboot = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }

    await runUbootInterruptSequence()
  }, [addLog, connectionRef, getText, isConnected, runUbootInterruptSequence])

  const handleInterruptIntoFailsafe = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }

    await runFailsafeInterruptSequence()
  }, [addLog, connectionRef, getText, isConnected, runFailsafeInterruptSequence])

  const handleTerminalInputKeyDown = useCallback((event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (terminalInput.length === 0) {
        void sendTerminalSpecialKey('enter')
      } else {
        void handleSendTerminalInput()
      }
      return
    }

    const specialKey = mapKeyboardEventToSpecialKey(event.key)
    if (!specialKey) {
      return
    }

    event.preventDefault()
    void sendTerminalSpecialKey(specialKey)
  }, [handleSendTerminalInput, sendTerminalSpecialKey, terminalInput])

  return {
    activeConsoleTab,
    setActiveConsoleTab,
    terminalOutput,
    terminalInput,
    setTerminalInput,
    isTerminalRunning,
    terminalAppendNewline,
    setTerminalAppendNewline,
    terminalNewlineMode,
    setTerminalNewlineMode,
    terminalRxBytes,
    isUbootInterrupting,
    clearTerminalOutput,
    stopTerminalSession,
    startTerminalSession,
    handleSendTerminalInput,
    sendTerminalSpecialKey,
    handleInterruptIntoUboot,
    handleInterruptIntoFailsafe,
    handleTerminalInputKeyDown,
  }
}
