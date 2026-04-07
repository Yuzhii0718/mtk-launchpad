import { useCallback, useEffect, useRef } from 'react'
import type { KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import type { LogEntry } from '../../types'
import type { TerminalNewlineMode, TerminalSpecialKey } from '../../utils/terminalControl'

type ConsoleTab = 'logs' | 'terminal'

type ConsoleSectionProps = {
  isConnected: boolean
  isRunning: boolean
  isTerminating: boolean
  activeConsoleTab: ConsoleTab
  logs: LogEntry[]
  terminalOutput: string
  terminalInput: string
  isTerminalRunning: boolean
  terminalAppendNewline: boolean
  terminalNewlineMode: TerminalNewlineMode
  terminalRxBytes: number
  terminalHexDisplay: boolean
  terminalShowTimestamp: boolean
  terminalShowControlChars: boolean
  isUbootInterrupting: boolean
  onRunWorkflow: () => Promise<void>
  onTerminateExecution: () => Promise<void>
  onClearLogs: () => void
  onActiveConsoleTabChange: (value: ConsoleTab) => void
  onStartTerminal: () => Promise<void>
  onStopTerminal: () => Promise<void>
  onClearTerminalOutput: () => void
  onSaveTerminalOutput: () => void
  onTerminalInputChange: (value: string) => void
  onTerminalInputKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void
  onTerminalNewlineModeChange: (value: TerminalNewlineMode) => void
  onTerminalAppendNewlineChange: (value: boolean) => void
  onTerminalHexDisplayChange: (value: boolean) => void
  onTerminalShowTimestampChange: (value: boolean) => void
  onTerminalShowControlCharsChange: (value: boolean) => void
  onSendTerminalInput: () => Promise<void>
  onSendTerminalSpecialKey: (key: TerminalSpecialKey) => Promise<void>
  onInterruptIntoUboot: () => Promise<void>
  onInterruptIntoFailsafe: () => Promise<void>
}

export function ConsoleSection(props: ConsoleSectionProps) {
  const { t } = useTranslation()
  const logsPanelRef = useRef<HTMLDivElement | null>(null)
  const terminalPanelRef = useRef<HTMLDivElement | null>(null)
  const shouldFollowLogsRef = useRef(true)
  const shouldFollowTerminalRef = useRef(true)

  const {
    isConnected,
    isRunning,
    isTerminating,
    activeConsoleTab,
    logs,
    terminalOutput,
    terminalInput,
    isTerminalRunning,
    terminalAppendNewline,
    terminalNewlineMode,
    terminalRxBytes,
    terminalHexDisplay,
    terminalShowTimestamp,
    terminalShowControlChars,
    isUbootInterrupting,
    onRunWorkflow,
    onTerminateExecution,
    onClearLogs,
    onActiveConsoleTabChange,
    onStartTerminal,
    onStopTerminal,
    onClearTerminalOutput,
    onSaveTerminalOutput,
    onTerminalInputChange,
    onTerminalInputKeyDown,
    onTerminalNewlineModeChange,
    onTerminalAppendNewlineChange,
    onTerminalHexDisplayChange,
    onTerminalShowTimestampChange,
    onTerminalShowControlCharsChange,
    onSendTerminalInput,
    onSendTerminalSpecialKey,
    onInterruptIntoUboot,
    onInterruptIntoFailsafe,
  } = props

  const isNearBottom = useCallback((panel: HTMLDivElement): boolean => {
    return panel.scrollHeight - panel.scrollTop - panel.clientHeight <= 24
  }, [])

  const handleLogsPanelScroll = useCallback((): void => {
    const panel = logsPanelRef.current
    if (!panel) {
      return
    }
    shouldFollowLogsRef.current = isNearBottom(panel)
  }, [isNearBottom])

  const handleTerminalPanelScroll = useCallback((): void => {
    const panel = terminalPanelRef.current
    if (!panel) {
      return
    }
    shouldFollowTerminalRef.current = isNearBottom(panel)
  }, [isNearBottom])

  useEffect(() => {
    if (activeConsoleTab !== 'logs') {
      return
    }
    const panel = logsPanelRef.current
    if (!panel || !shouldFollowLogsRef.current) {
      return
    }
    panel.scrollTop = panel.scrollHeight
  }, [activeConsoleTab, logs])

  useEffect(() => {
    if (activeConsoleTab !== 'terminal') {
      return
    }
    const panel = terminalPanelRef.current
    if (!panel || !shouldFollowTerminalRef.current) {
      return
    }
    panel.scrollTop = panel.scrollHeight
  }, [activeConsoleTab, terminalOutput])

  return (
    <section className={`card ${activeConsoleTab === 'terminal' ? 'console-terminal-focused' : ''}`}>
      <div className="button-row workflow-action-row">
        <button type="button" onClick={() => void onRunWorkflow()} disabled={!isConnected || isRunning}>
          {isRunning ? t('running') : t('startFlash')}
        </button>
        <button type="button" onClick={() => void onTerminateExecution()} disabled={!isRunning || isTerminating}>
          {t('terminateExecution')}
        </button>
      </div>

      <div className="console-toolbar-row">
        <div className="console-segmented" role="tablist" aria-label={t('logs')}>
          <button
            type="button"
            className={`segment-button ${activeConsoleTab === 'logs' ? 'active' : ''}`}
            onClick={() => onActiveConsoleTabChange('logs')}
          >
            {t('logs')}
          </button>
          <button
            type="button"
            className={`segment-button ${activeConsoleTab === 'terminal' ? 'active' : ''}`}
            onClick={() => onActiveConsoleTabChange('terminal')}
          >
            {t('terminal')}
          </button>
        </div>

        <div className="console-tab-actions">
          {activeConsoleTab === 'logs' && (
            <button type="button" onClick={onClearLogs}>{t('clearLogs')}</button>
          )}

          {activeConsoleTab === 'terminal' && (
            <>
              <button
                type="button"
                onClick={() => void onStartTerminal()}
                disabled={!isConnected || isRunning || isTerminalRunning}
              >
                {t('startTerminal')}
              </button>
              <button
                type="button"
                onClick={() => void onStopTerminal()}
                disabled={!isTerminalRunning}
              >
                {t('stopTerminal')}
              </button>
            </>
          )}
        </div>
      </div>

      {activeConsoleTab === 'logs' && (
        <>
          <h2>{t('logs')}</h2>
          <div className="log-panel" ref={logsPanelRef} onScroll={handleLogsPanelScroll}>
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
            <div className="terminal-meta-actions">
              <div className="terminal-meta-group">
                <label className="terminal-toggle">
                  <input
                    type="checkbox"
                    checked={terminalHexDisplay}
                    onChange={(event) => onTerminalHexDisplayChange(event.target.checked)}
                  />
                  {t('terminalHexDisplay')}
                </label>
                <label className="terminal-toggle">
                  <input
                    type="checkbox"
                    checked={terminalShowTimestamp}
                    onChange={(event) => onTerminalShowTimestampChange(event.target.checked)}
                  />
                  {t('terminalShowTimestamp')}
                </label>
                <label className="terminal-toggle">
                  <input
                    type="checkbox"
                    checked={terminalShowControlChars}
                    onChange={(event) => onTerminalShowControlCharsChange(event.target.checked)}
                  />
                  {t('terminalShowControlChars')}
                </label>
              </div>
              {isTerminalRunning && (
                <div className="terminal-meta-group">
                  <button
                    type="button"
                    onClick={() => void onInterruptIntoUboot()}
                    disabled={isUbootInterrupting || isTerminating}
                  >
                    {isUbootInterrupting ? t('ubootInterrupting') : t('interruptIntoUboot')}
                  </button>
                  <button
                    type="button"
                    onClick={() => void onInterruptIntoFailsafe()}
                    disabled={isUbootInterrupting || isTerminating}
                  >
                    {t('interruptIntoFailsafe')}
                  </button>
                </div>
              )}
              <div className="terminal-meta-group terminal-meta-group-tight">
                <button type="button" onClick={onClearTerminalOutput}>{t('terminalClear')}</button>
                <button type="button" onClick={onSaveTerminalOutput}>{t('terminalSave')}</button>
              </div>
            </div>
          </div>
          <div className="terminal-panel" ref={terminalPanelRef} onScroll={handleTerminalPanelScroll}>
            {terminalOutput || t('terminalNoOutput')}
          </div>
          <div className="terminal-input-row">
            <input
              value={terminalInput}
              onChange={(event) => onTerminalInputChange(event.target.value)}
              onKeyDown={onTerminalInputKeyDown}
              placeholder={t('terminalInputPlaceholder')}
              disabled={!isTerminalRunning}
            />
            <select
              value={terminalNewlineMode}
              onChange={(event) => onTerminalNewlineModeChange(event.target.value as TerminalNewlineMode)}
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
                onChange={(event) => onTerminalAppendNewlineChange(event.target.checked)}
                disabled={!isTerminalRunning}
              />
              {t('terminalAppendNewline')}
            </label>
            <button
              type="button"
              onClick={() => void onSendTerminalInput()}
              disabled={!isTerminalRunning || !terminalInput.trim()}
            >
              {t('terminalSend')}
            </button>
          </div>
          <div className="terminal-special-row">
            <span>{t('terminalSpecialActions')}:</span>
            <button type="button" onClick={() => void onSendTerminalSpecialKey('esc')} disabled={!isTerminalRunning}>{t('specialEsc')}</button>
            <button type="button" onClick={() => void onSendTerminalSpecialKey('enter')} disabled={!isTerminalRunning}>{t('specialEnter')}</button>
            <button type="button" onClick={() => void onSendTerminalSpecialKey('up')} disabled={!isTerminalRunning}>{t('specialArrowUp')}</button>
            <button type="button" onClick={() => void onSendTerminalSpecialKey('down')} disabled={!isTerminalRunning}>{t('specialArrowDown')}</button>
            <button type="button" onClick={() => void onSendTerminalSpecialKey('left')} disabled={!isTerminalRunning}>{t('specialArrowLeft')}</button>
            <button type="button" onClick={() => void onSendTerminalSpecialKey('right')} disabled={!isTerminalRunning}>{t('specialArrowRight')}</button>
          </div>
          <p className="hint">{isTerminalRunning ? t('terminalRunningHint') : t('terminalStoppedHint')}</p>
        </>
      )}
    </section>
  )
}
