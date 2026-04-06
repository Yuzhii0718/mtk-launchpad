import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import i18n from './i18n'
import {
  CHIP_CONFIG,
  DDR_OPTIONS_BY_CHIP,
  GITHUB_PROJECT_URL,
  EEPROM_TOOL_URL,
  APP_VERSION,
  APP_AUTHOR,
} from './constants'
import type { Chip, DdrType } from './types'
import { toNumber, stringifyError } from './utils/common'
import { ConnectionSection } from './components/sections/ConnectionSection'
import { FirmwareSection } from './components/sections/FirmwareSection'
import { ConsoleSection } from './components/sections/ConsoleSection'
import { useLogs } from './hooks/useLogs'
import { useTerminalController } from './hooks/useTerminalController'
import { useFirmwareFlow } from './hooks/useFirmwareFlow'
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

  const [isTerminating, setIsTerminating] = useState(false)

  const connectionRef = useRef<SerialConnection | null>(null)
  const terminateRequestedRef = useRef(false)
  const reconnectAfterTerminateRef = useRef(false)

  const { logs, addLog, clearLogs } = useLogs()

  const getText = useCallback((key: string): string => String(t(key)), [t])

  const {
    loadMode,
    setLoadMode,
    bl2Source,
    setBl2Source,
    fipSource,
    setFipSource,
    bl2ReleaseApi,
    setBl2ReleaseApi,
    bl2ReleaseTag,
    isLoadingBl2Release,
    fipReleaseApi,
    setFipReleaseApi,
    fipReleaseTag,
    isLoadingFipRelease,
    boardFilter,
    setBoardFilter,
    selectedBuiltinBl2Key,
    setSelectedBuiltinBl2Key,
    selectedReleaseBl2Key,
    setSelectedReleaseBl2Key,
    selectedExecutionRemoteBl2Candidate,
    selectedReleaseFipKey,
    setSelectedReleaseFipKey,
    selectedExecutionRemoteFipCandidate,
    setUploadedBl2File,
    setUploadedFipFile,
    builtinBl2Options,
    releaseBl2Options,
    releaseFipOptions,
    canDownloadRambootPreloader,
    canUseRemoteBl2ForExecution,
    canDownloadBoardBl2,
    canDownloadFip,
    canUseRemoteFipForExecution,
    bl2ExpectedMd5,
    bl2ActualMd5,
    bl2Md5Passed,
    fipExpectedMd5,
    fipActualMd5,
    fipMd5Passed,
    handleFetchBl2Release,
    handleFetchFipRelease,
    handleUseRemoteBl2ForExecution,
    handleUseRemoteFipForExecution,
    runBl2Md5Check,
    runFipMd5Check,
    handleDownloadRambootPreloader,
    handleDownloadBoardBl2,
    handleDownloadFip,
    resolveVerifiedBl2ForRun,
    resolveVerifiedFipForRun,
  } = useFirmwareFlow({
    chip,
    ddr,
    addLog,
    getText,
  })

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

  useEffect(() => {
    setDdr(ddrOptions[0])
    setLoadAddress(CHIP_CONFIG[chip].defaultLoadAddress)
  }, [chip, ddrOptions])

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
      const fip = await resolveVerifiedFipForRun()
      const bl2 = await resolveVerifiedBl2ForRun()

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
