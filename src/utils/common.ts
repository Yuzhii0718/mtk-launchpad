export function toNumber(value: string, fallback: number): number {
  const parsed = Number(value)
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.floor(parsed)
  }
  return fallback
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

export function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  return String(error)
}
