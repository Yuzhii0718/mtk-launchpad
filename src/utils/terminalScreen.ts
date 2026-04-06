export type TerminalScreenState = {
  lines: string[]
  cursorRow: number
  cursorCol: number
  parserMode: 'normal' | 'esc' | 'csi'
  csiBuffer: string
  maxLines: number
}

export function createTerminalScreenState(maxLines = 600): TerminalScreenState {
  return {
    lines: [''],
    cursorRow: 0,
    cursorCol: 0,
    parserMode: 'normal',
    csiBuffer: '',
    maxLines,
  }
}

export function resetTerminalScreenState(state: TerminalScreenState): void {
  state.lines = ['']
  state.cursorRow = 0
  state.cursorCol = 0
  state.parserMode = 'normal'
  state.csiBuffer = ''
}

export function applyTerminalChunk(state: TerminalScreenState, chunk: string): string {
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
