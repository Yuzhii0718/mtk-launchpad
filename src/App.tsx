import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import i18n from './i18n'
import {
  DEFAULT_BL2_RELEASE_API,
  DEFAULT_FIP_RELEASE_API,
  CHIP_CONFIG,
  DDR_OPTIONS_BY_CHIP,
  GITHUB_PROJECT_URL,
  EEPROM_TOOL_URL,
  APP_VERSION,
  APP_AUTHOR,
} from './constants'
import type { Chip, DdrType, FirmwareCandidate, FirmwareSource } from './types'
import { BUILTIN_BL2_CANDIDATES } from './data/builtinRamboot'
import { candidateKey } from './utils/fileNameParsers'
import { compareMd5, computeMd5 } from './utils/md5'
import { fetchReleaseCandidates, triggerBrowserFileDownload } from './utils/githubRelease'
import { resolveBl2Selection, resolveFipSelection } from './utils/firmwareSelection'
import { toNumber, stringifyError } from './utils/common'
import { ConnectionSection } from './components/sections/ConnectionSection'
import { FirmwareSection } from './components/sections/FirmwareSection'
import { ConsoleSection } from './components/sections/ConsoleSection'
import { useLogs } from './hooks/useLogs'
import { useTerminalController } from './hooks/useTerminalController'
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

  const [isTerminating, setIsTerminating] = useState(false)

  const connectionRef = useRef<SerialConnection | null>(null)
  const terminateRequestedRef = useRef(false)
  const reconnectAfterTerminateRef = useRef(false)

  const { logs, addLog, clearLogs } = useLogs()

  const getText = useCallback((key: string): string => String(t(key)), [t])

  const {
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
  } = useTerminalController({
    connectionRef,
    isConnected,
    isRunning,
    addLog,
    getText,
  })

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

      <ConnectionSection
        detectedPortInfo={detectedPortInfo}
        connectBaudRate={connectBaudRate}
        isConnected={isConnected}
        isRunning={isRunning}
        chip={chip}
        ddr={ddr}
        ddrOptions={ddrOptions}
        loadAddress={loadAddress}
        bromLoadBaudRate={bromLoadBaudRate}
        bl2LoadBaudRate={bl2LoadBaudRate}
        onConnectBaudRateInput={(value) => setConnectBaudRate(toNumber(value, 115200))}
        onChipChange={setChip}
        onDdrChange={setDdr}
        onLoadAddressInput={(value) => setLoadAddress(toNumber(value, CHIP_CONFIG[chip].defaultLoadAddress))}
        onBromBaudRateInput={(value) => setBromLoadBaudRate(toNumber(value, 115200))}
        onBl2BaudRateInput={(value) => setBl2LoadBaudRate(toNumber(value, 115200))}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onForgetDevice={handleForgetDevice}
      />

      <FirmwareSection
        loadMode={loadMode}
        bl2Source={bl2Source}
        fipSource={fipSource}
        bl2ReleaseApi={bl2ReleaseApi}
        bl2ReleaseTag={bl2ReleaseTag}
        isLoadingBl2Release={isLoadingBl2Release}
        fipReleaseApi={fipReleaseApi}
        fipReleaseTag={fipReleaseTag}
        isLoadingFipRelease={isLoadingFipRelease}
        boardFilter={boardFilter}
        builtinBl2Options={builtinBl2Options}
        releaseBl2Options={releaseBl2Options}
        releaseFipOptions={releaseFipOptions}
        selectedBuiltinBl2Key={selectedBuiltinBl2Key}
        selectedReleaseBl2Key={selectedReleaseBl2Key}
        selectedExecutionRemoteBl2Candidate={selectedExecutionRemoteBl2Candidate}
        selectedReleaseFipKey={selectedReleaseFipKey}
        selectedExecutionRemoteFipCandidate={selectedExecutionRemoteFipCandidate}
        canDownloadRambootPreloader={canDownloadRambootPreloader}
        canUseRemoteBl2ForExecution={canUseRemoteBl2ForExecution}
        canDownloadBoardBl2={canDownloadBoardBl2}
        canDownloadFip={canDownloadFip}
        canUseRemoteFipForExecution={canUseRemoteFipForExecution}
        bl2ExpectedMd5={bl2ExpectedMd5}
        bl2ActualMd5={bl2ActualMd5}
        bl2Md5Passed={bl2Md5Passed}
        fipExpectedMd5={fipExpectedMd5}
        fipActualMd5={fipActualMd5}
        fipMd5Passed={fipMd5Passed}
        onLoadModeChange={setLoadMode}
        onBl2SourceChange={setBl2Source}
        onBl2ReleaseApiChange={setBl2ReleaseApi}
        onFetchBl2Release={handleFetchBl2Release}
        onSelectedBuiltinBl2KeyChange={setSelectedBuiltinBl2Key}
        onSelectedReleaseBl2KeyChange={setSelectedReleaseBl2Key}
        onUseRemoteBl2ForExecution={handleUseRemoteBl2ForExecution}
        onDownloadRambootPreloader={handleDownloadRambootPreloader}
        onUploadedBl2FileChange={setUploadedBl2File}
        onRunBl2Md5Check={() => runBl2Md5Check(true)}
        onFipSourceChange={setFipSource}
        onFipReleaseApiChange={setFipReleaseApi}
        onBoardFilterChange={setBoardFilter}
        onFetchFipRelease={handleFetchFipRelease}
        onSelectedReleaseFipKeyChange={setSelectedReleaseFipKey}
        onUseRemoteFipForExecution={handleUseRemoteFipForExecution}
        onDownloadBoardBl2={handleDownloadBoardBl2}
        onDownloadFip={handleDownloadFip}
        onUploadedFipFileChange={setUploadedFipFile}
        onRunFipMd5Check={() => runFipMd5Check(true)}
      />

      <ConsoleSection
        isConnected={isConnected}
        isRunning={isRunning}
        isTerminating={isTerminating}
        activeConsoleTab={activeConsoleTab}
        logs={logs}
        terminalOutput={terminalOutput}
        terminalInput={terminalInput}
        isTerminalRunning={isTerminalRunning}
        terminalAppendNewline={terminalAppendNewline}
        terminalNewlineMode={terminalNewlineMode}
        terminalRxBytes={terminalRxBytes}
        isUbootInterrupting={isUbootInterrupting}
        onRunWorkflow={runWorkflow}
        onTerminateExecution={handleTerminateExecution}
        onClearLogs={clearLogs}
        onActiveConsoleTabChange={setActiveConsoleTab}
        onStartTerminal={() => startTerminalSession(true)}
        onStopTerminal={() => stopTerminalSession(true)}
        onClearTerminalOutput={clearTerminalOutput}
        onTerminalInputChange={setTerminalInput}
        onTerminalInputKeyDown={handleTerminalInputKeyDown}
        onTerminalNewlineModeChange={setTerminalNewlineMode}
        onTerminalAppendNewlineChange={setTerminalAppendNewline}
        onSendTerminalInput={handleSendTerminalInput}
        onSendTerminalSpecialKey={sendTerminalSpecialKey}
        onInterruptIntoUboot={handleInterruptIntoUboot}
        onInterruptIntoFailsafe={handleInterruptIntoFailsafe}
      />

      <footer className="card footer">
        <span>{t('appVersionLabel')}: {APP_VERSION}</span>
        <span>{t('appAuthorLabel')}: {APP_AUTHOR}</span>
      </footer>
    </main>
  )
}

export default App
