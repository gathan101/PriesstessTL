const MAX_LINE_WIDTH_RATIO = 0.82
const MAX_BLOCK_HEIGHT_RATIO = 0.82
const LINE_HEIGHT_RATIO = 1.08
const MIN_FONT_SIZE = 9
const MAX_FONT_SIZE = 42
const VERTICAL_MAX_FONT_SIZE = 28
const VERTICAL_MIN_FONT_SIZE = 9
const VERTICAL_FILL_RATIO = 0.78
const FALLBACK_CHAR_WIDTH_RATIO = 0.64

let measureContext

function getMeasureContext(fontSize) {
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  if (!measureContext) {
    const canvas = document.createElement('canvas')
    measureContext = canvas.getContext('2d')
  }
  if (!measureContext) return null
  measureContext.font = `700 ${fontSize}px Arial, sans-serif`
  return measureContext
}

function measureWidth(value, fontSize) {
  const context = getMeasureContext(fontSize)
  if (context) return context.measureText(value).width
  return Array.from(value).length * fontSize * FALLBACK_CHAR_WIDTH_RATIO
}

export function typesetText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
}

export function wrapWords(words, maxWidth, measure) {
  const lines = []
  let line = ''
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word
    if (line && measure(candidate) > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  })
  if (line) lines.push(line)
  return lines
}

export function measureTypeset(text, width, height, vertical = false) {
  const value = typesetText(text)
  if (!value) return { text: '', fontSize: 12, lineHeight: 1.1 }

  if (vertical) {
    const characters = Array.from(value.replace(/\s/g, ''))
    const fontSize = Math.max(
      VERTICAL_MIN_FONT_SIZE,
      Math.min(VERTICAL_MAX_FONT_SIZE, (height / Math.max(characters.length, 1)) * VERTICAL_FILL_RATIO),
    )
    return { text: characters.join('\n'), fontSize, lineHeight: 1.02 }
  }

  const words = value.split(' ')
  const maxWidth = Math.max(20, width * MAX_LINE_WIDTH_RATIO)
  const maxHeight = height * MAX_BLOCK_HEIGHT_RATIO
  const startFontSize = Math.min(MAX_FONT_SIZE, Math.max(10, height * 0.22))
  let best = { text: value, fontSize: MIN_FONT_SIZE, lineHeight: LINE_HEIGHT_RATIO }

  for (let fontSize = startFontSize; fontSize >= MIN_FONT_SIZE; fontSize -= 1) {
    const lines = wrapWords(words, maxWidth, (candidate) => measureWidth(candidate, fontSize))
    const lineHeight = fontSize * LINE_HEIGHT_RATIO
    if (lines.length * lineHeight <= maxHeight) {
      best = { text: lines.join('\n'), fontSize, lineHeight: LINE_HEIGHT_RATIO }
      break
    }
  }

  return best
}
