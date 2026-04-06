import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import i18n from './i18n'
import {
  DEFAULT_BL2_RELEASE_API,
  DEFAULT_FIP_RELEASE_API,
  CHIP_CONFIG,
  CHIP_OPTIONS,
  DDR_OPTIONS_BY_CHIP,
  GITHUB_PROJECT_URL,
  EEPROM_TOOL_URL,
  APP_VERSION,
  APP_AUTHOR,
} from './constants'
import type { Chip, DdrType, FirmwareCandidate, FirmwareSource, LogEntry, LogLevel } from './types'
import { BUILTIN_BL2_CANDIDATES } from './data/builtinRamboot'
import { candidateKey, formatCandidateLabel, parseFirmwareName } from './utils/fileNameParsers'
import { compareMd5, computeMd5 } from './utils/md5'
import { downloadFirmwareCandidate, fetchReleaseCandidates, triggerBrowserFileDownload } from './utils/githubRelease'
import { SerialConnection } from './services/serial/SerialConnection'
import { MtkUartProtocol } from './services/serial/MtkUartProtocol'

function App() {
  const { t } = useTranslation()

  const [chip, setChip] = useState<Chip>('mt7981')
  const [ddr, setDdr] = useState<DdrType>('ddr4')
  const [connectBaudRate, setConnectBaudRate] = useState(115200)
  const [bromLoadBaudRate, setBromLoadBaudRate] = useState(115200)
  const [bl2LoadBaudRate, setBl2LoadBaudRate] = useState(115200)
  const [loadAddress, setLoadAddress] = useState(CHIP_CONFIG.mt7981.defaultLoadAddress)
  const [detectedPortInfo, setDetectedPortInfo] = useState('-')

  const [isConnected, setIsConnected] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  const [loadMode, setLoadMode] = useState<'bl2-only' | 'bl2-fip'>('bl2-fip')
  const [bl2Source, setBl2Source] = useState<FirmwareSource>('builtin')
  const [fipSource, setFipSource] = useState<Exclude<FirmwareSource, 'builtin'>>('upload')

  const [bl2ReleaseApi, setBl2ReleaseApi] = useState(DEFAULT_BL2_RELEASE_API)
  const [bl2ReleaseTag, setBl2ReleaseTag] = useState('-')
  const [bl2ReleaseCandidates, setBl2ReleaseCandidates] = useState<FirmwareCandidate[]>([])
  const [isLoadingBl2Release, setIsLoadingBl2Release] = useState(false)

  const [fipReleaseApi, setFipReleaseApi] = useState(DEFAULT_FIP_RELEASE_API)
  const [fipReleaseTag, setFipReleaseTag] = useState('-')
  const [fipReleaseCandidates, setFipReleaseCandidates] = useState<FirmwareCandidate[]>([])
  const [isLoadingFipRelease, setIsLoadingFipRelease] = useState(false)
  const [boardFilter, setBoardFilter] = useState('')

  const [selectedBuiltinBl2Key, setSelectedBuiltinBl2Key] = useState('')
  const [selectedReleaseBl2Key, setSelectedReleaseBl2Key] = useState('')
  const [executionRemoteBl2Key, setExecutionRemoteBl2Key] = useState('')
  const [selectedReleaseFipKey, setSelectedReleaseFipKey] = useState('')
  const [executionRemoteFipKey, setExecutionRemoteFipKey] = useState('')

  const [uploadedBl2File, setUploadedBl2File] = useState<File | null>(null)
  const [uploadedFipFile, setUploadedFipFile] = useState<File | null>(null)

  const [bl2ExpectedMd5, setBl2ExpectedMd5] = useState<string | undefined>()
  const [bl2ActualMd5, setBl2ActualMd5] = useState<string | undefined>()
  const [bl2Md5Passed, setBl2Md5Passed] = useState<boolean | null>(null)

  const [fipExpectedMd5, setFipExpectedMd5] = useState<string | undefined>()
  const [fipActualMd5, setFipActualMd5] = useState<string | undefined>()
  const [fipMd5Passed, setFipMd5Passed] = useState<boolean | null>(null)

  const [logs, setLogs] = useState<LogEntry[]>([])
  const [activeConsoleTab, setActiveConsoleTab] = useState<'logs' | 'terminal'>('logs')
  const [terminalOutput, setTerminalOutput] = useState('')
  const [terminalInput, setTerminalInput] = useState('')
  const [isTerminalRunning, setIsTerminalRunning] = useState(false)
  const [terminalAppendNewline, setTerminalAppendNewline] = useState(true)
  const [terminalNewlineMode, setTerminalNewlineMode] = useState<'crlf' | 'lf' | 'cr' | 'none'>('crlf')
  const [terminalRxBytes, setTerminalRxBytes] = useState(0)
  const [isUbootInterrupting, setIsUbootInterrupting] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)

  const connectionRef = useRef<SerialConnection | null>(null)
  const logCounterRef = useRef(0)
  const terminalStopRequestedRef = useRef(false)
  const terminalLoopPromiseRef = useRef<Promise<void> | null>(null)
  const terminalPanelRef = useRef<HTMLDivElement | null>(null)
  const terminateRequestedRef = useRef(false)
  const reconnectAfterTerminateRef = useRef(false)
  const terminalScreenRef = useRef<TerminalScreenState>(createTerminalScreenState())

  const ddrOptions = DDR_OPTIONS_BY_CHIP[chip]

  const builtinBl2Options = useMemo(
    () => BUILTIN_BL2_CANDIDATES.filter((candidate) => candidate.chip === chip && candidate.ddr === ddr),
    [chip, ddr],
  )

  const releaseBl2Options = useMemo(() => {
    return bl2ReleaseCandidates.filter((candidate) => {
      if (candidate.kind !== 'bl2' || candidate.chip !== chip) {
        return false
      }
      return candidate.ddr === ddr
    })
  }, [bl2ReleaseCandidates, chip, ddr])

  const releaseFipOptions = useMemo(() => {
    const filter = boardFilter.trim().toLowerCase()
    return fipReleaseCandidates.filter((candidate) => {
      if (candidate.kind !== 'fip' || candidate.chip !== chip) {
        return false
      }
      if (!filter) {
        return true
      }
      return candidate.fileName.toLowerCase().includes(filter)
    })
  }, [boardFilter, chip, fipReleaseCandidates])

  const selectedReleaseFipCandidate = useMemo(
    () => releaseFipOptions.find((candidate) => candidateKey(candidate) === selectedReleaseFipKey),
    [releaseFipOptions, selectedReleaseFipKey],
  )

  const selectedReleaseBl2Candidate = useMemo(
    () => releaseBl2Options.find((candidate) => candidateKey(candidate) === selectedReleaseBl2Key),
    [releaseBl2Options, selectedReleaseBl2Key],
  )

  const selectedExecutionRemoteBl2Candidate = useMemo(
    () => releaseBl2Options.find((candidate) => candidateKey(candidate) === executionRemoteBl2Key),
    [executionRemoteBl2Key, releaseBl2Options],
  )

  const selectedExecutionRemoteFipCandidate = useMemo(
    () => releaseFipOptions.find((candidate) => candidateKey(candidate) === executionRemoteFipKey),
    [executionRemoteFipKey, releaseFipOptions],
  )

  const matchedBoardBl2FromFipRelease = useMemo(() => {
    if (!selectedReleaseFipCandidate) {
      return undefined
    }

    const withVersion = fipReleaseCandidates.find((candidate) => (
      candidate.kind === 'bl2'
      && candidate.chip === selectedReleaseFipCandidate.chip
      && candidate.board === selectedReleaseFipCandidate.board
      && candidate.version === selectedReleaseFipCandidate.version
    ))
    if (withVersion) {
      return withVersion
    }

    return fipReleaseCandidates.find((candidate) => (
      candidate.kind === 'bl2'
      && candidate.chip === selectedReleaseFipCandidate.chip
      && candidate.board === selectedReleaseFipCandidate.board
    ))
  }, [fipReleaseCandidates, selectedReleaseFipCandidate])

  const canDownloadRambootPreloader = bl2Source === 'github-release' && Boolean(selectedReleaseBl2Candidate)
  const canUseRemoteBl2ForExecution = bl2Source === 'github-release' && Boolean(selectedReleaseBl2Candidate)
  const canDownloadBoardBl2 = loadMode === 'bl2-fip' && fipSource === 'github-release' && Boolean(matchedBoardBl2FromFipRelease)
  const canDownloadFip = loadMode === 'bl2-fip' && fipSource === 'github-release' && Boolean(selectedReleaseFipCandidate)
  const canUseRemoteFipForExecution = loadMode === 'bl2-fip' && fipSource === 'github-release' && Boolean(selectedReleaseFipCandidate)

  useEffect(() => {
    setDdr(ddrOptions[0])
    setLoadAddress(CHIP_CONFIG[chip].defaultLoadAddress)
  }, [chip, ddrOptions])

  useEffect(() => {
    setSelectedBuiltinBl2Key(builtinBl2Options[0] ? candidateKey(builtinBl2Options[0]) : '')
  }, [builtinBl2Options])

  useEffect(() => {
    setSelectedReleaseBl2Key(releaseBl2Options[0] ? candidateKey(releaseBl2Options[0]) : '')
  }, [releaseBl2Options])

  useEffect(() => {
    if (bl2Source !== 'github-release') {
      setExecutionRemoteBl2Key('')
      return
    }

    if (!executionRemoteBl2Key) {
      return
    }

    const exists = releaseBl2Options.some((candidate) => candidateKey(candidate) === executionRemoteBl2Key)
    if (!exists) {
      setExecutionRemoteBl2Key('')
    }
  }, [bl2Source, executionRemoteBl2Key, releaseBl2Options])

  useEffect(() => {
    setSelectedReleaseFipKey(releaseFipOptions[0] ? candidateKey(releaseFipOptions[0]) : '')
  }, [releaseFipOptions])

  useEffect(() => {
    if (fipSource !== 'github-release') {
      setExecutionRemoteFipKey('')
      return
    }

    if (!executionRemoteFipKey) {
      return
    }

    const exists = releaseFipOptions.some((candidate) => candidateKey(candidate) === executionRemoteFipKey)
    if (!exists) {
      setExecutionRemoteFipKey('')
    }
  }, [executionRemoteFipKey, fipSource, releaseFipOptions])

  const addLog = useCallback((level: LogLevel, message: string): void => {
    logCounterRef.current += 1
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, { id: logCounterRef.current, level, message, timestamp }])
  }, [])

  const clearLogs = (): void => {
    setLogs([])
  }

  const clearTerminalOutput = (): void => {
    resetTerminalScreenState(terminalScreenRef.current)
    setTerminalOutput('')
    setTerminalRxBytes(0)
  }

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

  useEffect(() => {
    if (activeConsoleTab !== 'terminal') {
      return
    }
    const panel = terminalPanelRef.current
    if (!panel) {
      return
    }
    panel.scrollTop = panel.scrollHeight
  }, [activeConsoleTab, terminalOutput])

  const stopTerminalSession = useCallback(async (withLog: boolean): Promise<void> => {
    terminalStopRequestedRef.current = true
    const loop = terminalLoopPromiseRef.current
    if (loop) {
      await loop.catch(() => undefined)
    }
    terminalLoopPromiseRef.current = null
    setIsTerminalRunning(false)
    if (withLog) {
      addLog('info', t('terminalStopped'))
    }
  }, [addLog, t])

  const startTerminalSession = useCallback(async (withLog: boolean): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }
    if (isRunning) {
      addLog('warn', t('terminalWaitForWorkflow'))
      return
    }
    if (terminalLoopPromiseRef.current) {
      return
    }

    terminalStopRequestedRef.current = false
    setIsTerminalRunning(true)
    setActiveConsoleTab('terminal')
    if (withLog) {
      addLog('info', t('terminalStarted'))
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
        addLog('error', `${t('terminalReadFailed')}: ${stringifyError(error)}`)
      } finally {
        terminalLoopPromiseRef.current = null
        setIsTerminalRunning(false)
      }
    })()
  }, [addLog, appendTerminalOutput, isConnected, isRunning, t])

  const handleSendTerminalInput = async (): Promise<void> => {
    const connection = connectionRef.current
    const raw = terminalInput
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }
    if (!isTerminalRunning) {
      addLog('warn', t('terminalStartBeforeSend'))
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
      addLog('error', `${t('terminalWriteFailed')}: ${stringifyError(error)}`)
    }
  }

  const sendTerminalSpecialKey = useCallback(async (key: TerminalSpecialKey): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }
    if (!isTerminalRunning) {
      addLog('warn', t('terminalStartBeforeSend'))
      return
    }

    const payload = buildSpecialKeyPayload(key, terminalNewlineMode)
    if (!payload.length) {
      return
    }

    try {
      appendTerminalOutput(`\n> [${formatSpecialKeyLabel(key, t)}] ${visualizeControlChars(payload)}\n`)
      await connection.write(new TextEncoder().encode(payload))
    } catch (error) {
      addLog('error', `${t('terminalWriteFailed')}: ${stringifyError(error)}`)
    }
  }, [addLog, appendTerminalOutput, isConnected, isTerminalRunning, t, terminalNewlineMode])

  const runUbootInterruptSequence = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }

    if (!terminalLoopPromiseRef.current) {
      await startTerminalSession(false)
    }

    setIsUbootInterrupting(true)
    addLog('info', t('ubootInterruptRunning'))

    const encoder = new TextEncoder()
    const payload = buildSpecialKeyPayload('esc', terminalNewlineMode)
    const deadline = Date.now() + 5000
    let sent = 0

    try {
      appendTerminalOutput(`\n> [${t('interruptIntoUboot')}] ${visualizeControlChars(payload)} x ~5s\n`)
      while (Date.now() < deadline) {
        await connection.write(encoder.encode(payload))
        sent += 1
        await sleepMs(80)
      }
      addLog('success', `${t('ubootInterruptDone')} (${sent} ESC)`)
    } catch (error) {
      addLog('error', `${t('ubootInterruptFailed')}: ${stringifyError(error)}`)
    } finally {
      setIsUbootInterrupting(false)
    }
  }, [addLog, appendTerminalOutput, isConnected, startTerminalSession, t, terminalNewlineMode])

  const runFailsafeInterruptSequence = useCallback(async (): Promise<void> => {
    await runUbootInterruptSequence()

    const connection = connectionRef.current
    if (!connection || !isConnected || !isTerminalRunning) {
      return
    }

    const newline = resolveLineEnding(terminalNewlineMode === 'none' ? 'crlf' : terminalNewlineMode)
    const payload = `httpd${newline}`
    const encoder = new TextEncoder()

    addLog('info', t('failsafeInterruptRunning'))
    try {
      appendTerminalOutput(`\n> [${t('interruptIntoFailsafe')}] ${visualizeControlChars(payload)}\n`)
      await sleepMs(120)
      await connection.write(encoder.encode(payload))
      addLog('success', t('failsafeInterruptDone'))
    } catch (error) {
      addLog('error', `${t('failsafeInterruptFailed')}: ${stringifyError(error)}`)
    }
  }, [addLog, appendTerminalOutput, isConnected, isTerminalRunning, runUbootInterruptSequence, t, terminalNewlineMode])

  const handleInterruptIntoUboot = async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }

    await runUbootInterruptSequence()
  }

  const handleInterruptIntoFailsafe = async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }

    await runFailsafeInterruptSequence()
  }

  const handleTerminalInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
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
  }

  const handleConnect = async (): Promise<void> => {
    if (!SerialConnection.isSupported()) {
      addLog('error', t('unsupported'))
      return
    }

    try {
      setDetectedPortInfo('-')
      const connection = new SerialConnection()
      await connection.open(connectBaudRate)
      connectionRef.current = connection
      setIsConnected(true)
      setDetectedPortInfo(connection.portInfo)
      const connectMode = connection.isAutoSelectedFromAuthorizedPorts
        ? t('autoDetectedAuthorizedPort')
        : t('selectedFromPicker')
      addLog('success', `${t('connected')} (${connection.portInfo}; ${connectMode})`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const handleDisconnect = async (): Promise<void> => {
    if (!connectionRef.current) {
      return
    }
    reconnectAfterTerminateRef.current = false
    await stopTerminalSession(false)
    await connectionRef.current.close()
    connectionRef.current = null
    setIsConnected(false)
    setDetectedPortInfo('-')
    addLog('info', t('disconnected'))
  }

  const handleForgetDevice = async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection) {
      addLog('warn', t('serialNotConnected'))
      return
    }

    try {
      const forgotten = await connection.forgetCurrentPort()
      connectionRef.current = null
      setIsConnected(false)
      setDetectedPortInfo('-')
      if (forgotten) {
        addLog('success', t('deviceForgotten'))
      } else {
        addLog('warn', t('deviceForgetUnsupported'))
      }
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const handleFetchBl2Release = async (): Promise<void> => {
    setIsLoadingBl2Release(true)
    setExecutionRemoteBl2Key('')
    addLog('info', t('loadingRelease'))
    try {
      const result = await fetchReleaseCandidates(bl2ReleaseApi.trim())
      setBl2ReleaseCandidates(result.candidates)
      setBl2ReleaseTag(result.tag)
      addLog('success', `${t('releaseLoaded')} (${result.candidates.length})`)
    } catch (error) {
      addLog('error', stringifyError(error))
    } finally {
      setIsLoadingBl2Release(false)
    }
  }

  const handleFetchFipRelease = async (): Promise<void> => {
    setIsLoadingFipRelease(true)
    setExecutionRemoteFipKey('')
    addLog('info', t('loadingRelease'))
    try {
      const result = await fetchReleaseCandidates(fipReleaseApi.trim())
      setFipReleaseCandidates(result.candidates)
      setFipReleaseTag(result.tag)
      addLog('success', `${t('releaseLoaded')} (${result.candidates.length})`)
    } catch (error) {
      addLog('error', stringifyError(error))
    } finally {
      setIsLoadingFipRelease(false)
    }
  }

  const handleUseRemoteFipForExecution = async (): Promise<void> => {
    if (fipSource !== 'github-release') {
      return
    }

    if (!selectedReleaseFipCandidate) {
      addLog('warn', t('noSelectedFipDownloadHint'))
      return
    }

    const pickedKey = candidateKey(selectedReleaseFipCandidate)
    setExecutionRemoteFipKey(pickedKey)
    addLog('info', `${t('remoteFipSelectedForRun')}: ${selectedReleaseFipCandidate.fileName}`)

    try {
      const resolved = await resolveFipSelection({
        fipSource,
        releaseFipOptions,
        selectedReleaseFipKey,
        uploadedFipFile,
        executionRemoteFipKey: pickedKey,
      })

      const actual = computeMd5(resolved.payload)
      const passed = compareMd5(resolved.candidate.expectedMd5, actual)

      setFipExpectedMd5(resolved.candidate.expectedMd5)
      setFipActualMd5(actual)
      setFipMd5Passed(passed)
      addLog(passed ? 'success' : 'error', passed ? t('md5Passed') : t('md5Failed'))
    } catch (error) {
      setFipExpectedMd5(undefined)
      setFipActualMd5(undefined)
      setFipMd5Passed(null)
      addLog('error', stringifyError(error))
    }
  }

  const handleUseRemoteBl2ForExecution = async (): Promise<void> => {
    if (bl2Source !== 'github-release') {
      return
    }

    if (!selectedReleaseBl2Candidate) {
      addLog('warn', t('noSelectedBl2DownloadHint'))
      return
    }

    const pickedKey = candidateKey(selectedReleaseBl2Candidate)
    setExecutionRemoteBl2Key(pickedKey)
    addLog('info', `${t('remoteBl2SelectedForRun')}: ${selectedReleaseBl2Candidate.fileName}`)

    try {
      const resolved = await resolveBl2Selection({
        bl2Source,
        builtinBl2Options,
        selectedBuiltinBl2Key,
        releaseBl2Options,
        selectedReleaseBl2Key,
        uploadedBl2File,
        executionRemoteBl2Key: pickedKey,
      })

      const actual = computeMd5(resolved.payload)
      const passed = compareMd5(resolved.candidate.expectedMd5, actual)

      setBl2ExpectedMd5(resolved.candidate.expectedMd5)
      setBl2ActualMd5(actual)
      setBl2Md5Passed(passed)
      addLog(passed ? 'success' : 'error', passed ? t('md5Passed') : t('md5Failed'))
    } catch (error) {
      setBl2ExpectedMd5(undefined)
      setBl2ActualMd5(undefined)
      setBl2Md5Passed(null)
      addLog('error', stringifyError(error))
    }
  }

  const runBl2Md5Check = useCallback(async (withLog: boolean): Promise<void> => {
    if (bl2Source === 'github-release' && !executionRemoteBl2Key) {
      setBl2ExpectedMd5(undefined)
      setBl2ActualMd5(undefined)
      setBl2Md5Passed(null)
      if (withLog) {
        addLog('warn', t('remoteBl2NotSelectedForRun'))
      }
      return
    }

    try {
      const resolved = await resolveBl2Selection({
        bl2Source,
        builtinBl2Options,
        selectedBuiltinBl2Key,
        releaseBl2Options,
        selectedReleaseBl2Key,
        uploadedBl2File,
        executionRemoteBl2Key,
      })

      const actual = computeMd5(resolved.payload)
      const passed = compareMd5(resolved.candidate.expectedMd5, actual)

      setBl2ExpectedMd5(resolved.candidate.expectedMd5)
      setBl2ActualMd5(actual)
      setBl2Md5Passed(passed)

      if (withLog) {
        addLog(passed ? 'success' : 'error', passed ? t('md5Passed') : t('md5Failed'))
      }
    } catch (error) {
      setBl2ExpectedMd5(undefined)
      setBl2ActualMd5(undefined)
      setBl2Md5Passed(null)
      if (withLog) {
        addLog('error', stringifyError(error))
      }
    }
  }, [
    addLog,
    bl2Source,
    builtinBl2Options,
    releaseBl2Options,
    executionRemoteBl2Key,
    selectedBuiltinBl2Key,
    selectedReleaseBl2Key,
    t,
    uploadedBl2File,
  ])

  const runFipMd5Check = useCallback(async (withLog: boolean): Promise<void> => {
    if (loadMode !== 'bl2-fip') {
      setFipExpectedMd5(undefined)
      setFipActualMd5(undefined)
      setFipMd5Passed(null)
      return
    }

    if (fipSource === 'github-release' && !executionRemoteFipKey) {
      setFipExpectedMd5(undefined)
      setFipActualMd5(undefined)
      setFipMd5Passed(null)
      if (withLog) {
        addLog('warn', t('remoteFipNotSelectedForRun'))
      }
      return
    }

    try {
      const resolved = await resolveFipSelection({
        fipSource,
        releaseFipOptions,
        selectedReleaseFipKey,
        uploadedFipFile,
        executionRemoteFipKey,
      })

      const actual = computeMd5(resolved.payload)
      const passed = compareMd5(resolved.candidate.expectedMd5, actual)

      setFipExpectedMd5(resolved.candidate.expectedMd5)
      setFipActualMd5(actual)
      setFipMd5Passed(passed)

      if (withLog) {
        addLog(passed ? 'success' : 'error', passed ? t('md5Passed') : t('md5Failed'))
      }
    } catch (error) {
      setFipExpectedMd5(undefined)
      setFipActualMd5(undefined)
      setFipMd5Passed(null)
      if (withLog) {
        addLog('error', stringifyError(error))
      }
    }
  }, [addLog, executionRemoteFipKey, fipSource, loadMode, releaseFipOptions, selectedReleaseFipKey, t, uploadedFipFile])

  useEffect(() => {
    void runBl2Md5Check(false)
  }, [runBl2Md5Check])

  useEffect(() => {
    void runFipMd5Check(false)
  }, [runFipMd5Check])

  const handleDownloadRambootPreloader = async (): Promise<void> => {
    try {
      if (!selectedReleaseBl2Candidate) {
        throw new Error(t('noSelectedBl2DownloadHint'))
      }
      triggerBrowserFileDownload(selectedReleaseBl2Candidate)
      addLog('success', `BL2 ${selectedReleaseBl2Candidate.fileName} downloaded`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const handleDownloadBoardBl2 = async (): Promise<void> => {
    if (loadMode !== 'bl2-fip' || fipSource !== 'github-release') {
      return
    }

    try {
      if (!matchedBoardBl2FromFipRelease) {
        throw new Error(t('noMatchedBoardBl2'))
      }
      triggerBrowserFileDownload(matchedBoardBl2FromFipRelease)
      addLog('success', `BL2 ${matchedBoardBl2FromFipRelease.fileName} downloaded`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const handleDownloadFip = async (): Promise<void> => {
    if (loadMode !== 'bl2-fip' || fipSource !== 'github-release') {
      return
    }

    try {
      if (!selectedReleaseFipCandidate) {
        throw new Error('FIP release file is not selected')
      }
      triggerBrowserFileDownload(selectedReleaseFipCandidate)
      addLog('success', `FIP ${selectedReleaseFipCandidate.fileName} downloaded`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }

  const reconnectSerialAfterTerminate = async (): Promise<void> => {
    if (!reconnectAfterTerminateRef.current || connectionRef.current?.isOpen) {
      return
    }

    try {
      const connection = new SerialConnection()
      await connection.open(connectBaudRate)
      connectionRef.current = connection
      setIsConnected(true)
      setDetectedPortInfo(connection.portInfo)
      const connectMode = connection.isAutoSelectedFromAuthorizedPorts
        ? t('autoDetectedAuthorizedPort')
        : t('selectedFromPicker')
      addLog('success', `${t('reconnectedAfterTerminate')} (${connection.portInfo}; ${connectMode})`)
    } catch (error) {
      addLog('error', `${t('reconnectAfterTerminateFailed')}: ${stringifyError(error)}`)
    } finally {
      reconnectAfterTerminateRef.current = false
    }
  }

  const runWorkflow = async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', t('serialNotConnected'))
      return
    }

    await stopTerminalSession(false)
    terminateRequestedRef.current = false
    setIsTerminating(false)
    setIsRunning(true)
    addLog('info', '-------------------------')

    try {
      if (bl2Source === 'github-release' && !executionRemoteBl2Key) {
        throw new Error(t('remoteBl2NotSelectedForRun'))
      }

      if (loadMode === 'bl2-fip' && fipSource === 'github-release' && !executionRemoteFipKey) {
        throw new Error(t('remoteFipNotSelectedForRun'))
      }

      const fip = loadMode === 'bl2-fip'
        ? await resolveFipSelection({
          fipSource,
          releaseFipOptions,
          selectedReleaseFipKey,
          uploadedFipFile,
          executionRemoteFipKey,
        })
        : null

      if (fip) {
        const fipMd5 = computeMd5(fip.payload)
        const fipOk = compareMd5(fip.candidate.expectedMd5, fipMd5)
        setFipExpectedMd5(fip.candidate.expectedMd5)
        setFipActualMd5(fipMd5)
        setFipMd5Passed(fipOk)
        if (!fipOk) {
          throw new Error(`${t('md5Failed')}: FIP`)
        }
      }

      const bl2 = await resolveBl2Selection({
        bl2Source,
        builtinBl2Options,
        selectedBuiltinBl2Key,
        releaseBl2Options,
        selectedReleaseBl2Key,
        uploadedBl2File,
        executionRemoteBl2Key,
      })

      const bl2Md5 = computeMd5(bl2.payload)
      const bl2Ok = compareMd5(bl2.candidate.expectedMd5, bl2Md5)
      setBl2ExpectedMd5(bl2.candidate.expectedMd5)
      setBl2ActualMd5(bl2Md5)
      setBl2Md5Passed(bl2Ok)
      if (!bl2Ok) {
        throw new Error(`${t('md5Failed')}: BL2`)
      }

      await connection.reopenAtBaudRate(115200)

      const protocol = new MtkUartProtocol(connection, addLog)
      await protocol.loadBl2({
        payload: bl2.payload,
        loadAddress,
        isAarch64: CHIP_CONFIG[chip].arch === 'aarch64',
        bromLoadBaudRate,
      })

      if (fip) {
        await protocol.loadFip({
          payload: fip.payload,
          bl2LoadBaudRate,
        })
      }

      addLog('success', t('stepDone'))
    } catch (error) {
      if (terminateRequestedRef.current) {
        addLog('warn', t('stepTerminated'))
      } else {
        addLog('error', `${t('stepFailed')}: ${stringifyError(error)}`)
      }
    } finally {
      const terminated = terminateRequestedRef.current
      terminateRequestedRef.current = false
      setIsRunning(false)
      setIsTerminating(false)
      if (terminated) {
        await reconnectSerialAfterTerminate()
      } else if (connectionRef.current?.isOpen) {
        setActiveConsoleTab('terminal')
        await startTerminalSession(true)
      }
    }
  }

  const handleTerminateExecution = async (): Promise<void> => {
    if (!isRunning) {
      addLog('warn', t('nothingToTerminate'))
      return
    }

    setIsTerminating(true)
    terminateRequestedRef.current = true
    reconnectAfterTerminateRef.current = true
    addLog('warn', t('terminatingExecution'))

    await stopTerminalSession(false)
    const connection = connectionRef.current
    if (connection) {
      await connection.close().catch(() => undefined)
      connectionRef.current = null
      setIsConnected(false)
      setDetectedPortInfo('-')
      addLog('warn', t('executionTerminatedPortReleasedWillReconnect'))
    }
  }

  return (
    <main className="app">
      <header className="header card">
        <div>
          <h1>{t('appTitle')}</h1>
          <p>{t('appSubtitle')}</p>
        </div>
        <div className="header-actions">
          <a
            className="nav-link"
            href={GITHUB_PROJECT_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('navGithubProject')}
          </a>
          <a
            className="nav-link"
            href={EEPROM_TOOL_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('navEepromTool')}
          </a>
          <div className="lang-switch">
            <label htmlFor="lang">{t('language')}</label>
            <select
              id="lang"
              value={i18n.language.startsWith('zh') ? 'zh' : 'en'}
              onChange={(event) => {
                void i18n.changeLanguage(event.target.value)
              }}
            >
              <option value="zh">中文</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>
      </header>

      <section className="card grid two-cols">
        <div>
          <h2>{t('connectTitle')}</h2>
          <p className="hint">{t('webSerialLimit')}</p>
          <div className="field-row">
            <label>{t('detectedPort')}</label>
            <input value={detectedPortInfo} readOnly />
          </div>
          <p className="hint">{t('detectedPortHint')}</p>
          <div className="field-row">
            <label>{t('baudRate')}</label>
            <input
              type="number"
              value={connectBaudRate}
              onChange={(event) => setConnectBaudRate(toNumber(event.target.value, 115200))}
            />
          </div>
          <div className="button-row">
            <button type="button" onClick={() => void handleConnect()} disabled={isConnected}>
              {t('connect')}
            </button>
            <button type="button" onClick={() => void handleDisconnect()} disabled={!isConnected}>
              {t('disconnect')}
            </button>
            <button type="button" onClick={() => void handleForgetDevice()} disabled={!isConnected || isRunning}>
              {t('forgetDevice')}
            </button>
          </div>
          <p className={`status ${isConnected ? 'ok' : 'warn'}`}>
            {isConnected ? t('connected') : t('disconnected')}
          </p>
        </div>

        <div>
          <h2>{t('firmwareLabel')}</h2>
          <div className="field-row">
            <label>{t('chip')}</label>
            <select value={chip} onChange={(event) => setChip(event.target.value as Chip)}>
              {CHIP_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {CHIP_CONFIG[option].label}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label>{t('ddr')}</label>
            <select value={ddr} onChange={(event) => setDdr(event.target.value as DdrType)}>
              {ddrOptions.map((option) => (
                <option key={option} value={option}>
                  {option.toUpperCase()}
                </option>
              ))}
            </select>
          </div>
          <div className="field-row">
            <label>{t('loadAddress')}</label>
            <input
              type="number"
              value={loadAddress}
              onChange={(event) => setLoadAddress(toNumber(event.target.value, CHIP_CONFIG[chip].defaultLoadAddress))}
            />
          </div>
          <div className="field-row">
            <label>{t('bromBaudRate')}</label>
            <input
              type="number"
              value={bromLoadBaudRate}
              onChange={(event) => setBromLoadBaudRate(toNumber(event.target.value, 115200))}
            />
          </div>
          <div className="field-row">
            <label>{t('bl2BaudRate')}</label>
            <input
              type="number"
              value={bl2LoadBaudRate}
              onChange={(event) => setBl2LoadBaudRate(toNumber(event.target.value, 115200))}
            />
          </div>
        </div>
      </section>

      <section className={`card grid ${loadMode === 'bl2-fip' ? 'two-cols' : ''}`}>
        <div>
          <h2>{t('rambootBl2Source')}</h2>
          <div className="field-row">
            <label>{t('loadMode')}</label>
            <select value={loadMode} onChange={(event) => setLoadMode(event.target.value as 'bl2-only' | 'bl2-fip')}>
              <option value="bl2-only">{t('bl2Only')}</option>
              <option value="bl2-fip">{t('bl2AndFip')}</option>
            </select>
          </div>

          <div className="field-row">
            <label>{t('rambootBl2Source')}</label>
            <select value={bl2Source} onChange={(event) => setBl2Source(event.target.value as FirmwareSource)}>
              <option value="builtin">{t('builtin')}</option>
              <option value="github-release">{t('githubRelease')}</option>
              <option value="upload">{t('uploadLocal')}</option>
            </select>
          </div>

          {bl2Source === 'builtin' && (
            <div className="field-row">
              <label>{t('chooseBl2')}</label>
              <select
                className="candidate-select"
                value={selectedBuiltinBl2Key}
                onChange={(event) => setSelectedBuiltinBl2Key(event.target.value)}
              >
                {builtinBl2Options.map((candidate) => (
                  <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                    {formatCandidateLabel(candidate)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {bl2Source === 'github-release' && (
            <>
              <div className="field-row">
                <label>{t('bl2ReleaseApi')}</label>
                <input value={bl2ReleaseApi} onChange={(event) => setBl2ReleaseApi(event.target.value)} />
              </div>
              <div className="button-row">
                <button type="button" onClick={() => void handleFetchBl2Release()} disabled={isLoadingBl2Release}>
                  {t('fetchBl2Release')}
                </button>
              </div>
              <p className="hint">{t('releaseTag')}: {bl2ReleaseTag}</p>
              <div className="field-row">
                <label>{t('chooseBl2')}</label>
                <select
                  className="candidate-select"
                  value={selectedReleaseBl2Key}
                  onChange={(event) => setSelectedReleaseBl2Key(event.target.value)}
                >
                  {releaseBl2Options.map((candidate) => (
                    <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                      {formatCandidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => void handleUseRemoteBl2ForExecution()}
                  disabled={!canUseRemoteBl2ForExecution}
                >
                  {t('useRemoteBl2ForRun')}
                </button>
              </div>
              {!selectedExecutionRemoteBl2Candidate && <p className="hint hint-warning">{t('remoteBl2NotSelectedForRun')}</p>}
              {selectedExecutionRemoteBl2Candidate && (
                <p className="hint">{t('remoteBl2InUse')}: {selectedExecutionRemoteBl2Candidate.fileName}</p>
              )}
              <div className="button-row">
                <button
                  type="button"
                  onClick={() => void handleDownloadRambootPreloader()}
                  disabled={!canDownloadRambootPreloader}
                >
                  {t('downloadRambootPreloaderToLocal')}
                </button>
              </div>
              {!canDownloadRambootPreloader && <p className="hint hint-warning">{t('noSelectedBl2DownloadHint')}</p>}
              <p className="hint">{t('downloadUsesBrowserHint')}</p>
            </>
          )}

          {bl2Source === 'upload' && (
            <div className="field-row">
              <label>{t('uploadLocal')}</label>
              <input
                type="file"
                onChange={(event) => setUploadedBl2File(event.target.files?.[0] ?? null)}
                accept=".bin,.img"
              />
            </div>
          )}

          <div className="button-row">
            <button type="button" onClick={() => void runBl2Md5Check(true)}>
              {t('verifyMd5')} (BL2)
            </button>
          </div>
          <p className="hint">{t('autoVerifyHint')}</p>
          <Md5Line
            expectedLabel={t('expectedMd5')}
            actualLabel={t('actualMd5')}
            expected={bl2ExpectedMd5}
            actual={bl2ActualMd5}
            passed={bl2Md5Passed}
          />
        </div>

        {loadMode === 'bl2-fip' && (
          <div>
            <h2>{t('fipSource')}</h2>
            <div className="field-row">
              <label>{t('fipSource')}</label>
              <select value={fipSource} onChange={(event) => setFipSource(event.target.value as Exclude<FirmwareSource, 'builtin'>)}>
                <option value="github-release">{t('githubRelease')}</option>
                <option value="upload">{t('uploadLocal')}</option>
              </select>
            </div>

            {fipSource === 'github-release' && (
              <>
                <div className="field-row">
                  <label>{t('fipReleaseApi')}</label>
                  <input value={fipReleaseApi} onChange={(event) => setFipReleaseApi(event.target.value)} />
                </div>
                <div className="field-row">
                  <label>{t('boardFilter')}</label>
                  <input value={boardFilter} onChange={(event) => setBoardFilter(event.target.value)} placeholder={t('boardFilterPlaceholder')} />
                </div>
                <div className="button-row">
                  <button type="button" onClick={() => void handleFetchFipRelease()} disabled={isLoadingFipRelease}>
                    {t('fetchFipRelease')}
                  </button>
                </div>
                <p className="hint">{t('releaseTag')}: {fipReleaseTag}</p>

                <div className="field-row">
                  <label>{t('chooseFip')}</label>
                  <select
                    className="candidate-select"
                    value={selectedReleaseFipKey}
                    onChange={(event) => setSelectedReleaseFipKey(event.target.value)}
                  >
                    {releaseFipOptions.map((candidate) => (
                      <option key={candidateKey(candidate)} value={candidateKey(candidate)}>
                        {formatCandidateLabel(candidate)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void handleUseRemoteFipForExecution()}
                    disabled={!canUseRemoteFipForExecution}
                  >
                    {t('useRemoteFipForRun')}
                  </button>
                </div>
                {!selectedExecutionRemoteFipCandidate && <p className="hint hint-warning">{t('remoteFipNotSelectedForRun')}</p>}
                {selectedExecutionRemoteFipCandidate && (
                  <p className="hint">{t('remoteFipInUse')}: {selectedExecutionRemoteFipCandidate.fileName}</p>
                )}

                <div className="button-row">
                  <button
                    type="button"
                    onClick={() => void handleDownloadBoardBl2()}
                    disabled={!canDownloadBoardBl2}
                  >
                    {t('downloadBl2ToLocal')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDownloadFip()}
                    disabled={!canDownloadFip}
                  >
                    {t('downloadFipToLocal')}
                  </button>
                </div>
                {!canDownloadBoardBl2 && <p className="hint hint-warning">{t('noMatchedBoardBl2')}</p>}
                {!canDownloadFip && <p className="hint hint-warning">{t('noSelectedFipDownloadHint')}</p>}
                <p className="hint">{t('downloadUsesBrowserHint')}</p>
              </>
            )}

            {fipSource === 'upload' && (
              <div className="field-row">
                <label>{t('uploadLocal')}</label>
                <input
                  type="file"
                  onChange={(event) => setUploadedFipFile(event.target.files?.[0] ?? null)}
                  accept=".bin,.img"
                />
              </div>
            )}

            <div className="button-row">
              <button type="button" onClick={() => void runFipMd5Check(true)}>
                {t('verifyMd5')} (FIP)
              </button>
            </div>
            <p className="hint">{t('autoVerifyHint')}</p>
            <Md5Line
              expectedLabel={t('expectedMd5')}
              actualLabel={t('actualMd5')}
              expected={fipExpectedMd5}
              actual={fipActualMd5}
              passed={fipMd5Passed}
            />
          </div>
        )}
      </section>

      <section className="card">
        <div className="button-row">
          <button type="button" onClick={() => void runWorkflow()} disabled={!isConnected || isRunning}>
            {isRunning ? t('running') : t('startFlash')}
          </button>
          <button type="button" onClick={() => void handleTerminateExecution()} disabled={!isRunning || isTerminating}>
            {t('terminateExecution')}
          </button>
          <button type="button" onClick={clearLogs} disabled={activeConsoleTab !== 'logs'}>{t('clearLogs')}</button>
        </div>

        <div className="button-row">
          <button
            type="button"
            className={`tab-button ${activeConsoleTab === 'logs' ? 'active' : ''}`}
            onClick={() => setActiveConsoleTab('logs')}
          >
            {t('logs')}
          </button>
          <button
            type="button"
            className={`tab-button ${activeConsoleTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveConsoleTab('terminal')}
          >
            {t('terminal')}
          </button>
          <button
            type="button"
            onClick={() => void startTerminalSession(true)}
            disabled={!isConnected || isRunning || isTerminalRunning}
          >
            {t('startTerminal')}
          </button>
          <button
            type="button"
            onClick={() => void stopTerminalSession(true)}
            disabled={!isTerminalRunning}
          >
            {t('stopTerminal')}
          </button>
        </div>

        {activeConsoleTab === 'logs' && (
          <>
            <h2>{t('logs')}</h2>
            <div className="log-panel">
              {logs.map((entry) => (
                <div key={entry.id} className={`log-line ${entry.level}`}>
                  [{entry.timestamp}] {entry.message}
                </div>
              ))}
            </div>
          </>
        )}

        {activeConsoleTab === 'terminal' && (
          <>
            <h2>{t('terminal')}</h2>
            <div className="terminal-meta-row">
              <span>{t('terminalRxBytes')}: {terminalRxBytes}</span>
              <button type="button" onClick={clearTerminalOutput}>{t('terminalClear')}</button>
            </div>
            <div className="terminal-panel" ref={terminalPanelRef}>
              {terminalOutput || t('terminalNoOutput')}
            </div>
            <div className="terminal-input-row">
              <input
                value={terminalInput}
                onChange={(event) => setTerminalInput(event.target.value)}
                onKeyDown={handleTerminalInputKeyDown}
                placeholder={t('terminalInputPlaceholder')}
                disabled={!isTerminalRunning}
              />
              <select
                value={terminalNewlineMode}
                onChange={(event) => setTerminalNewlineMode(event.target.value as 'crlf' | 'lf' | 'cr' | 'none')}
                disabled={!isTerminalRunning || !terminalAppendNewline}
              >
                <option value="crlf">{t('newlineCRLF')}</option>
                <option value="lf">{t('newlineLF')}</option>
                <option value="cr">{t('newlineCR')}</option>
                <option value="none">{t('newlineNone')}</option>
              </select>
              <label className="terminal-toggle">
                <input
                  type="checkbox"
                  checked={terminalAppendNewline}
                  onChange={(event) => setTerminalAppendNewline(event.target.checked)}
                  disabled={!isTerminalRunning}
                />
                {t('terminalAppendNewline')}
              </label>
              <button
                type="button"
                onClick={() => void handleSendTerminalInput()}
                disabled={!isTerminalRunning || !terminalInput.trim()}
              >
                {t('terminalSend')}
              </button>
            </div>
            <div className="terminal-special-row">
              <span>{t('terminalSpecialActions')}:</span>
              <button type="button" onClick={() => void sendTerminalSpecialKey('esc')} disabled={!isTerminalRunning}>{t('specialEsc')}</button>
              <button type="button" onClick={() => void sendTerminalSpecialKey('enter')} disabled={!isTerminalRunning}>{t('specialEnter')}</button>
              <button type="button" onClick={() => void sendTerminalSpecialKey('up')} disabled={!isTerminalRunning}>{t('specialArrowUp')}</button>
              <button type="button" onClick={() => void sendTerminalSpecialKey('down')} disabled={!isTerminalRunning}>{t('specialArrowDown')}</button>
              <button type="button" onClick={() => void sendTerminalSpecialKey('left')} disabled={!isTerminalRunning}>{t('specialArrowLeft')}</button>
              <button type="button" onClick={() => void sendTerminalSpecialKey('right')} disabled={!isTerminalRunning}>{t('specialArrowRight')}</button>
            </div>
            {isTerminalRunning && (
              <div className="terminal-interrupt-row">
                <button
                  type="button"
                  onClick={() => void handleInterruptIntoUboot()}
                  disabled={isUbootInterrupting || isTerminating}
                >
                  {isUbootInterrupting ? t('ubootInterrupting') : t('interruptIntoUboot')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleInterruptIntoFailsafe()}
                  disabled={isUbootInterrupting || isTerminating}
                >
                  {t('interruptIntoFailsafe')}
                </button>
              </div>
            )}
            <p className="hint">{isTerminalRunning ? t('terminalRunningHint') : t('terminalStoppedHint')}</p>
          </>
        )}
      </section>

      <footer className="card footer">
        <span>{t('appVersionLabel')}: {APP_VERSION}</span>
        <span>{t('appAuthorLabel')}: {APP_AUTHOR}</span>
      </footer>
    </main>
  )
}

function Md5Line(props: {
  expectedLabel: string
  actualLabel: string
  expected?: string
  actual?: string
  passed: boolean | null
}) {
  const { expectedLabel, actualLabel, expected, actual, passed } = props
  return (
    <div className="md5-line">
      <div>
        {expectedLabel}: <code>{expected ?? '-'}</code>
      </div>
      <div>
        {actualLabel}: <code>{actual ?? '-'}</code>
      </div>
      {passed !== null && <div className={passed ? 'status ok' : 'status err'}>{passed ? '✔' : '✖'}</div>}
    </div>
  )
}

async function resolveBl2Selection(input: {
  bl2Source: FirmwareSource
  builtinBl2Options: FirmwareCandidate[]
  selectedBuiltinBl2Key: string
  releaseBl2Options: FirmwareCandidate[]
  selectedReleaseBl2Key: string
  uploadedBl2File: File | null
  executionRemoteBl2Key?: string
}): Promise<{ candidate: FirmwareCandidate; payload: ArrayBuffer }> {
  const {
    bl2Source,
    builtinBl2Options,
    selectedBuiltinBl2Key,
    releaseBl2Options,
    selectedReleaseBl2Key,
    uploadedBl2File,
    executionRemoteBl2Key,
  } = input
  if (bl2Source === 'builtin') {
    const candidate = builtinBl2Options.find((item) => candidateKey(item) === selectedBuiltinBl2Key)
    if (!candidate) {
      throw new Error('BL2 built-in file is not selected')
    }
    return {
      candidate,
      payload: await downloadFirmwareCandidate(candidate),
    }
  }

  if (bl2Source === 'github-release') {
    const pickKey = executionRemoteBl2Key || selectedReleaseBl2Key
    const candidate = releaseBl2Options.find((item) => candidateKey(item) === pickKey)
    if (!candidate) {
      throw new Error('BL2 release file is not selected')
    }
    return {
      candidate,
      payload: await downloadFirmwareCandidate(candidate),
    }
  }

  if (!uploadedBl2File) {
    throw new Error('BL2 upload file is required')
  }

  const parsed = parseFirmwareName(uploadedBl2File.name)
  const candidate: FirmwareCandidate = parsed
    ? { ...parsed, source: 'upload' }
    : {
      kind: 'bl2',
      fileName: uploadedBl2File.name,
      chip: null,
      source: 'upload',
    }

  return {
    candidate,
    payload: await uploadedBl2File.arrayBuffer(),
  }
}

async function resolveFipSelection(input: {
  fipSource: Exclude<FirmwareSource, 'builtin'>
  releaseFipOptions: FirmwareCandidate[]
  selectedReleaseFipKey: string
  uploadedFipFile: File | null
  executionRemoteFipKey?: string
}): Promise<{ candidate: FirmwareCandidate; payload: ArrayBuffer }> {
  const { fipSource, releaseFipOptions, selectedReleaseFipKey, uploadedFipFile, executionRemoteFipKey } = input
  if (fipSource === 'github-release') {
    const pickKey = executionRemoteFipKey || selectedReleaseFipKey
    const candidate = releaseFipOptions.find((item) => candidateKey(item) === pickKey)
    if (!candidate) {
      throw new Error('FIP release file is not selected')
    }
    return {
      candidate,
      payload: await downloadFirmwareCandidate(candidate),
    }
  }

  if (!uploadedFipFile) {
    throw new Error('FIP upload file is required')
  }

  const parsed = parseFirmwareName(uploadedFipFile.name)
  const candidate: FirmwareCandidate = parsed
    ? { ...parsed, source: 'upload' }
    : {
      kind: 'fip',
      fileName: uploadedFipFile.name,
      chip: null,
      source: 'upload',
    }

  return {
    candidate,
    payload: await uploadedFipFile.arrayBuffer(),
  }
}

function toNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

function resolveLineEnding(mode: 'crlf' | 'lf' | 'cr' | 'none'): string {
  if (mode === 'crlf') {
    return '\r\n'
  }
  if (mode === 'lf') {
    return '\n'
  }
  if (mode === 'cr') {
    return '\r'
  }
  return ''
}

function visualizeControlChars(value: string): string {
  return value
    .split('\u001b').join('\\x1b')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

type TerminalScreenState = {
  lines: string[]
  cursorRow: number
  cursorCol: number
  parserMode: 'normal' | 'esc' | 'csi'
  csiBuffer: string
  maxLines: number
}

function createTerminalScreenState(maxLines = 600): TerminalScreenState {
  return {
    lines: [''],
    cursorRow: 0,
    cursorCol: 0,
    parserMode: 'normal',
    csiBuffer: '',
    maxLines,
  }
}

function resetTerminalScreenState(state: TerminalScreenState): void {
  state.lines = ['']
  state.cursorRow = 0
  state.cursorCol = 0
  state.parserMode = 'normal'
  state.csiBuffer = ''
}

function applyTerminalChunk(state: TerminalScreenState, chunk: string): string {
  for (const char of chunk) {
    if (state.parserMode === 'normal') {
      if (char === '\u001b') {
        state.parserMode = 'esc'
        continue
      }
      applyNormalChar(state, char)
      continue
    }

    if (state.parserMode === 'esc') {
      if (char === '[') {
        state.parserMode = 'csi'
        state.csiBuffer = ''
        continue
      }
      state.parserMode = 'normal'
      applyNormalChar(state, char)
      continue
    }

    state.csiBuffer += char
    if (isAnsiFinalByte(char)) {
      applyCsiSequence(state, state.csiBuffer)
      state.csiBuffer = ''
      state.parserMode = 'normal'
    }
  }

  trimTerminalLines(state)
  return state.lines.join('\n')
}

function applyNormalChar(state: TerminalScreenState, char: string): void {
  if (char === '\r') {
    state.cursorCol = 0
    return
  }
  if (char === '\n') {
    state.cursorRow += 1
    ensureLine(state, state.cursorRow)
    state.cursorCol = 0
    return
  }
  if (char === '\b') {
    state.cursorCol = Math.max(0, state.cursorCol - 1)
    return
  }
  if (char === '\t') {
    for (let i = 0; i < 4; i += 1) {
      putChar(state, ' ')
    }
    return
  }
  if (char < ' ' || char === '\u007f') {
    return
  }
  putChar(state, char)
}

function applyCsiSequence(state: TerminalScreenState, sequence: string): void {
  const command = sequence.at(-1)
  if (!command) {
    return
  }

  const paramsText = sequence.slice(0, -1)
  const normalizedParamsText = paramsText.startsWith('?') ? paramsText.slice(1) : paramsText
  const params = normalizedParamsText.split(';').map((part) => {
    if (!part) {
      return 0
    }
    const value = Number.parseInt(part, 10)
    return Number.isFinite(value) ? value : 0
  })

  if (command === 'm' || command === 'h' || command === 'l') {
    return
  }

  if (command === 'J') {
    const mode = params[0] ?? 0
    if (mode === 2) {
      state.lines = ['']
      state.cursorRow = 0
      state.cursorCol = 0
    }
    return
  }

  if (command === 'K') {
    const mode = params[0] ?? 0
    ensureLine(state, state.cursorRow)
    const line = state.lines[state.cursorRow]
    if (mode === 2) {
      state.lines[state.cursorRow] = ''
      state.cursorCol = 0
      return
    }
    if (mode === 1) {
      state.lines[state.cursorRow] = line.slice(state.cursorCol)
      state.cursorCol = 0
      return
    }
    state.lines[state.cursorRow] = line.slice(0, state.cursorCol)
    return
  }

  if (command === 'H' || command === 'f') {
    const row = Math.max(1, params[0] || 1) - 1
    const col = Math.max(1, params[1] || 1) - 1
    state.cursorRow = row
    state.cursorCol = col
    ensureLine(state, state.cursorRow)
    return
  }

  if (command === 'A') {
    const offset = Math.max(1, params[0] || 1)
    state.cursorRow = Math.max(0, state.cursorRow - offset)
    return
  }
  if (command === 'B') {
    const offset = Math.max(1, params[0] || 1)
    state.cursorRow += offset
    ensureLine(state, state.cursorRow)
    return
  }
  if (command === 'C') {
    const offset = Math.max(1, params[0] || 1)
    state.cursorCol += offset
    return
  }
  if (command === 'D') {
    const offset = Math.max(1, params[0] || 1)
    state.cursorCol = Math.max(0, state.cursorCol - offset)
  }
}

function putChar(state: TerminalScreenState, char: string): void {
  ensureLine(state, state.cursorRow)
  const line = state.lines[state.cursorRow]
  if (state.cursorCol >= line.length) {
    const padding = ' '.repeat(state.cursorCol - line.length)
    state.lines[state.cursorRow] = `${line}${padding}${char}`
  } else {
    state.lines[state.cursorRow] = `${line.slice(0, state.cursorCol)}${char}${line.slice(state.cursorCol + 1)}`
  }
  state.cursorCol += 1
}

function ensureLine(state: TerminalScreenState, row: number): void {
  while (state.lines.length <= row) {
    state.lines.push('')
  }
}

function trimTerminalLines(state: TerminalScreenState): void {
  const overflow = state.lines.length - state.maxLines
  if (overflow <= 0) {
    return
  }
  state.lines.splice(0, overflow)
  state.cursorRow = Math.max(0, state.cursorRow - overflow)
}

function isAnsiFinalByte(char: string): boolean {
  if (char.length === 0) {
    return false
  }
  const code = char.charCodeAt(0)
  return code >= 0x40 && code <= 0x7e
}

type TerminalSpecialKey = 'esc' | 'enter' | 'up' | 'down' | 'left' | 'right'

function mapKeyboardEventToSpecialKey(key: string): TerminalSpecialKey | null {
  if (key === 'Escape') {
    return 'esc'
  }
  if (key === 'ArrowUp') {
    return 'up'
  }
  if (key === 'ArrowDown') {
    return 'down'
  }
  if (key === 'ArrowLeft') {
    return 'left'
  }
  if (key === 'ArrowRight') {
    return 'right'
  }
  return null
}

function buildSpecialKeyPayload(key: TerminalSpecialKey, newlineMode: 'crlf' | 'lf' | 'cr' | 'none'): string {
  if (key === 'esc') {
    return '\u001b'
  }
  if (key === 'enter') {
    return resolveLineEnding(newlineMode === 'none' ? 'crlf' : newlineMode)
  }
  if (key === 'up') {
    return '\u001b[A'
  }
  if (key === 'down') {
    return '\u001b[B'
  }
  if (key === 'right') {
    return '\u001b[C'
  }
  return '\u001b[D'
}

function formatSpecialKeyLabel(key: TerminalSpecialKey, t: (key: string) => string): string {
  if (key === 'esc') {
    return t('specialEsc')
  }
  if (key === 'enter') {
    return t('specialEnter')
  }
  if (key === 'up') {
    return t('specialArrowUp')
  }
  if (key === 'down') {
    return t('specialArrowDown')
  }
  if (key === 'left') {
    return t('specialArrowLeft')
  }
  return t('specialArrowRight')
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}

export default App
