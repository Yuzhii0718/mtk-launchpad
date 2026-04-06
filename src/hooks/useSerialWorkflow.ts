import { useCallback, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import { CHIP_CONFIG } from '../constants'
import type { Chip, LogLevel } from '../types'
import { stringifyError } from '../utils/common'
import { SerialConnection } from '../services/serial/SerialConnection'
import { MtkUartProtocol } from '../services/serial/MtkUartProtocol'

export type SerialTerminalActions = {
  stopTerminalSession: (withLog: boolean) => Promise<void>
  startTerminalSession: (withLog: boolean) => Promise<void>
  setActiveConsoleTab: (value: 'logs' | 'terminal') => void
}

type ResolvedPayload = {
  payload: ArrayBuffer
}

type UseSerialWorkflowParams = {
  chip: Chip
  connectBaudRate: number
  bromLoadBaudRate: number
  bl2LoadBaudRate: number
  loadAddress: number
  addLog: (level: LogLevel, message: string) => void
  getText: (key: string) => string
  terminalActionsRef: MutableRefObject<SerialTerminalActions | null>
  resolveVerifiedBl2ForRun: () => Promise<ResolvedPayload>
  resolveVerifiedFipForRun: () => Promise<ResolvedPayload | null>
}

export function useSerialWorkflow(input: UseSerialWorkflowParams) {
  const {
    chip,
    connectBaudRate,
    bromLoadBaudRate,
    bl2LoadBaudRate,
    loadAddress,
    addLog,
    getText,
    terminalActionsRef,
    resolveVerifiedBl2ForRun,
    resolveVerifiedFipForRun,
  } = input

  const [detectedPortInfo, setDetectedPortInfo] = useState('-')
  const [isConnected, setIsConnected] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [isTerminating, setIsTerminating] = useState(false)

  const connectionRef = useRef<SerialConnection | null>(null)
  const terminateRequestedRef = useRef(false)
  const reconnectAfterTerminateRef = useRef(false)

  const handleConnect = useCallback(async (): Promise<void> => {
    if (!SerialConnection.isSupported()) {
      addLog('error', getText('unsupported'))
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
        ? getText('autoDetectedAuthorizedPort')
        : getText('selectedFromPicker')
      addLog('success', `${getText('connected')} (${connection.portInfo}; ${connectMode})`)
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }, [addLog, connectBaudRate, getText])

  const handleDisconnect = useCallback(async (): Promise<void> => {
    if (!connectionRef.current) {
      return
    }

    reconnectAfterTerminateRef.current = false
    if (terminalActionsRef.current) {
      await terminalActionsRef.current.stopTerminalSession(false)
    }
    await connectionRef.current.close()
    connectionRef.current = null
    setIsConnected(false)
    setDetectedPortInfo('-')
    addLog('info', getText('disconnected'))
  }, [addLog, getText, terminalActionsRef])

  const handleForgetDevice = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection) {
      addLog('warn', getText('serialNotConnected'))
      return
    }

    try {
      const forgotten = await connection.forgetCurrentPort()
      connectionRef.current = null
      setIsConnected(false)
      setDetectedPortInfo('-')
      if (forgotten) {
        addLog('success', getText('deviceForgotten'))
      } else {
        addLog('warn', getText('deviceForgetUnsupported'))
      }
    } catch (error) {
      addLog('error', stringifyError(error))
    }
  }, [addLog, getText])

  const reconnectSerialAfterTerminate = useCallback(async (): Promise<void> => {
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
        ? getText('autoDetectedAuthorizedPort')
        : getText('selectedFromPicker')
      addLog('success', `${getText('reconnectedAfterTerminate')} (${connection.portInfo}; ${connectMode})`)
    } catch (error) {
      addLog('error', `${getText('reconnectAfterTerminateFailed')}: ${stringifyError(error)}`)
    } finally {
      reconnectAfterTerminateRef.current = false
    }
  }, [addLog, connectBaudRate, getText])

  const runWorkflow = useCallback(async (): Promise<void> => {
    const connection = connectionRef.current
    if (!connection || !isConnected) {
      addLog('error', getText('serialNotConnected'))
      return
    }

    if (terminalActionsRef.current) {
      await terminalActionsRef.current.stopTerminalSession(false)
    }
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

      addLog('success', getText('stepDone'))
    } catch (error) {
      if (terminateRequestedRef.current) {
        addLog('warn', getText('stepTerminated'))
      } else {
        addLog('error', `${getText('stepFailed')}: ${stringifyError(error)}`)
      }
    } finally {
      const terminated = terminateRequestedRef.current
      terminateRequestedRef.current = false
      setIsRunning(false)
      setIsTerminating(false)
      if (terminated) {
        await reconnectSerialAfterTerminate()
      } else if (connectionRef.current?.isOpen && terminalActionsRef.current) {
        terminalActionsRef.current.setActiveConsoleTab('terminal')
        await terminalActionsRef.current.startTerminalSession(true)
      }
    }
  }, [
    addLog,
    bl2LoadBaudRate,
    bromLoadBaudRate,
    chip,
    getText,
    isConnected,
    loadAddress,
    reconnectSerialAfterTerminate,
    resolveVerifiedBl2ForRun,
    resolveVerifiedFipForRun,
    terminalActionsRef,
  ])

  const handleTerminateExecution = useCallback(async (): Promise<void> => {
    if (!isRunning) {
      addLog('warn', getText('nothingToTerminate'))
      return
    }

    setIsTerminating(true)
    terminateRequestedRef.current = true
    reconnectAfterTerminateRef.current = true
    addLog('warn', getText('terminatingExecution'))

    if (terminalActionsRef.current) {
      await terminalActionsRef.current.stopTerminalSession(false)
    }

    const connection = connectionRef.current
    if (connection) {
      await connection.close().catch(() => undefined)
      connectionRef.current = null
      setIsConnected(false)
      setDetectedPortInfo('-')
      addLog('warn', getText('executionTerminatedPortReleasedWillReconnect'))
    }
  }, [addLog, getText, isRunning, terminalActionsRef])

  return {
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
  }
}
