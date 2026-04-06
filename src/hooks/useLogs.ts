import { useCallback, useRef, useState } from 'react'
import type { LogEntry, LogLevel } from '../types'

export function useLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const logCounterRef = useRef(0)

  const addLog = useCallback((level: LogLevel, message: string): void => {
    logCounterRef.current += 1
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prev) => [...prev, { id: logCounterRef.current, level, message, timestamp }])
  }, [])

  const clearLogs = useCallback((): void => {
    setLogs([])
  }, [])

  return {
    logs,
    addLog,
    clearLogs,
  }
}
