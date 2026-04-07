import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import './App.css'
import i18n from './i18n'
import {
  CHIP_CONFIG,
  DDR_OPTIONS_BY_CHIP,
  GITHUB_BOOTLOADER_URL,
  GITHUB_PROJECT_URL,
  EEPROM_TOOL_URL,
} from './constants'
import type { Chip, DdrType, SerialDataBits, SerialParity, SerialStopBits } from './types'
import { toNumber } from './utils/common'
import { ConnectionSection } from './components/sections/ConnectionSection'
import { FirmwareSection } from './components/sections/FirmwareSection'
import { ConsoleSection } from './components/sections/ConsoleSection'
import { useLogs } from './hooks/useLogs'
import { useTerminalController } from './hooks/useTerminalController'
import { useFirmwareFlow } from './hooks/useFirmwareFlow'
import { useSerialWorkflow, type SerialTerminalActions } from './hooks/useSerialWorkflow'

function App() {
  const { t } = useTranslation()

  const [chip, setChip] = useState<Chip>('mt7981')
  const [ddr, setDdr] = useState<DdrType>('ddr4')
  const [connectBaudRateOption, setConnectBaudRateOption] = useState('115200')
  const [customConnectBaudRate, setCustomConnectBaudRate] = useState(115200)
  const [connectDataBits, setConnectDataBits] = useState<SerialDataBits>(8)
  const [connectStopBits, setConnectStopBits] = useState<SerialStopBits>(1)
  const [connectParity, setConnectParity] = useState<SerialParity>('none')
  const [bromLoadBaudRate, setBromLoadBaudRate] = useState(115200)
  const [bl2LoadBaudRate, setBl2LoadBaudRate] = useState(115200)
  const [loadAddress, setLoadAddress] = useState(CHIP_CONFIG.mt7981.defaultLoadAddress)

  const connectBaudRate = connectBaudRateOption === 'custom'
    ? customConnectBaudRate
    : toNumber(connectBaudRateOption, 115200)

  const connectSerialOptions = useMemo(() => ({
    baudRate: connectBaudRate,
    dataBits: connectDataBits,
    stopBits: connectStopBits,
    parity: connectParity,
  }), [connectBaudRate, connectDataBits, connectParity, connectStopBits])

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
    handleSelectedReleaseFipKeyChange,
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

  const terminalActionsRef = useRef<SerialTerminalActions | null>(null)

  const {
    connectionRef,
    isConnected,
    isRunning,
    isTerminating,
    detectedPortInfo,
    handleConnect,
    handleDisconnect,
    handleForgetDevice,
    runWorkflow,
    handleTerminateExecution,
  } = useSerialWorkflow({
    chip,
    connectSerialOptions,
    bromLoadBaudRate,
    bl2LoadBaudRate,
    loadAddress,
    addLog,
    getText,
    terminalActionsRef,
    resolveVerifiedBl2ForRun,
    resolveVerifiedFipForRun,
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
    terminalHexDisplay,
    setTerminalHexDisplay,
    terminalShowTimestamp,
    setTerminalShowTimestamp,
    terminalShowControlChars,
    setTerminalShowControlChars,
    isUbootInterrupting,
    clearTerminalOutput,
    saveTerminalOutputToFile,
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

  useEffect(() => {
    terminalActionsRef.current = {
      stopTerminalSession,
      startTerminalSession,
      setActiveConsoleTab,
    }

    return () => {
      terminalActionsRef.current = null
    }
  }, [setActiveConsoleTab, startTerminalSession, stopTerminalSession])

  const ddrOptions = DDR_OPTIONS_BY_CHIP[chip]

  const handleChipChange = useCallback((nextChip: Chip): void => {
    setChip(nextChip)
    setDdr(DDR_OPTIONS_BY_CHIP[nextChip][0])
    setLoadAddress(CHIP_CONFIG[nextChip].defaultLoadAddress)
  }, [])

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
            href={GITHUB_BOOTLOADER_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('navBootloaderProject')}
          </a>
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
        connectBaudRateOption={connectBaudRateOption}
        customConnectBaudRate={customConnectBaudRate}
        connectDataBits={connectDataBits}
        connectStopBits={connectStopBits}
        connectParity={connectParity}
        isConnected={isConnected}
        isRunning={isRunning}
        chip={chip}
        ddr={ddr}
        ddrOptions={ddrOptions}
        loadAddress={loadAddress}
        bromLoadBaudRate={bromLoadBaudRate}
        bl2LoadBaudRate={bl2LoadBaudRate}
        onConnectBaudRateSelect={setConnectBaudRateOption}
        onCustomConnectBaudRateInput={(value) => setCustomConnectBaudRate(toNumber(value, 115200))}
        onConnectDataBitsChange={(value) => setConnectDataBits(value)}
        onConnectStopBitsChange={(value) => setConnectStopBits(value)}
        onConnectParityChange={(value) => setConnectParity(value)}
        onChipChange={handleChipChange}
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
        onSelectedReleaseFipKeyChange={handleSelectedReleaseFipKeyChange}
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
        terminalHexDisplay={terminalHexDisplay}
        terminalShowTimestamp={terminalShowTimestamp}
        terminalShowControlChars={terminalShowControlChars}
        isUbootInterrupting={isUbootInterrupting}
        onRunWorkflow={runWorkflow}
        onTerminateExecution={handleTerminateExecution}
        onClearLogs={clearLogs}
        onActiveConsoleTabChange={setActiveConsoleTab}
        onStartTerminal={() => startTerminalSession(true)}
        onStopTerminal={() => stopTerminalSession(true)}
        onClearTerminalOutput={clearTerminalOutput}
        onSaveTerminalOutput={saveTerminalOutputToFile}
        onTerminalInputChange={setTerminalInput}
        onTerminalInputKeyDown={handleTerminalInputKeyDown}
        onTerminalNewlineModeChange={setTerminalNewlineMode}
        onTerminalAppendNewlineChange={setTerminalAppendNewline}
        onTerminalHexDisplayChange={setTerminalHexDisplay}
        onTerminalShowTimestampChange={setTerminalShowTimestamp}
        onTerminalShowControlCharsChange={setTerminalShowControlChars}
        onSendTerminalInput={handleSendTerminalInput}
        onSendTerminalSpecialKey={sendTerminalSpecialKey}
        onInterruptIntoUboot={handleInterruptIntoUboot}
        onInterruptIntoFailsafe={handleInterruptIntoFailsafe}
      />

      <footer className="card footer">
        <span>{t('appVersionLabel')}: {__APP_VERSION__}</span>
        <span>{t('appAuthorLabel')}: {__APP_AUTHOR__}</span>
      </footer>
    </main>
  )
}

export default App
