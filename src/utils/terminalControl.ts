export type TerminalNewlineMode = 'crlf' | 'lf' | 'cr' | 'none'

export type TerminalSpecialKey = 'esc' | 'enter' | 'up' | 'down' | 'left' | 'right'

export function resolveLineEnding(mode: TerminalNewlineMode): string {
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

export function visualizeControlChars(value: string): string {
  return value
    .split('\u001b').join('\\x1b')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
}

export function mapKeyboardEventToSpecialKey(key: string): TerminalSpecialKey | null {
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

export function buildSpecialKeyPayload(key: TerminalSpecialKey, newlineMode: TerminalNewlineMode): string {
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

export function formatSpecialKeyLabel(key: TerminalSpecialKey, t: (key: string) => string): string {
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
