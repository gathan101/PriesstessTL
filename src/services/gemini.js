const GEMINI_MODEL = 'gemini-3.1-flash-lite'
const MAX_RETRIES = 3
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504])

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

function getErrorMessage(data, status) {
  return data?.error?.message || (status === 429
    ? 'Batas penggunaan Gemini tercapai.'
    : status >= 500
      ? 'Server Gemini sedang sibuk.'
      : 'Gemini gagal menerjemahkan.')
}

export function getGeminiModel() {
  return GEMINI_MODEL
}

export async function translateText(text, apiKey, prompt = '', onStatus = () => {}) {
  if (!apiKey?.trim()) throw new Error('API key Gemini belum diatur.')
  if (!text?.trim()) return ''

  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${prompt || 'Terjemahkan dari Bahasa Jepang ke Bahasa Indonesia secara natural.'}\nBalas hanya hasil terjemahan tanpa penjelasan.` }] },
      contents: [{ parts: [{ text }] }],
      generationConfig: { temperature: 0.4, maxOutputTokens: 512 },
    }),
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey.trim())}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response
    let data
    try {
      response = await fetch(url, request)
      data = await response.json().catch(() => ({}))
    } catch (error) {
      if (attempt === MAX_RETRIES) throw new Error('Koneksi ke Gemini gagal. Periksa internet lalu coba lagi.')
      const seconds = 2 ** attempt
      onStatus(`Koneksi bermasalah — mencoba lagi dalam ${seconds} dtk (${attempt + 1}/${MAX_RETRIES})`)
      await wait(seconds * 1000)
      continue
    }

    if (response.ok) {
      return data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || ''
    }

    if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
      const message = response.status === 429
        ? 'Batas Gemini tercapai. Tunggu sebentar atau periksa kuota API key.'
        : response.status >= 500
          ? 'Server Gemini sedang sibuk. Coba lagi beberapa saat.'
          : getErrorMessage(data, response.status)
      throw new Error(message)
    }

    const retryAfter = Number(response.headers.get('Retry-After'))
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) : 2 ** attempt
    onStatus(`Server Gemini sibuk — mencoba lagi dalam ${seconds} dtk (${attempt + 1}/${MAX_RETRIES})`)
    await wait(seconds * 1000)
  }
}

function parseVisionResult(data) {
  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || ''
  if (!text || /^skip$/i.test(text)) return { original: '', translated: '' }
  try {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || text
    const parsed = JSON.parse(fenced)
    return {
      original: String(parsed.original || parsed.source || '').trim(),
      translated: String(parsed.translated || parsed.translation || '').trim(),
    }
  } catch {
    return { original: '', translated: text }
  }
}

export async function translateCropVision(cropDataUrl, apiKey, prompt = '', onStatus = () => {}) {
  if (!apiKey?.trim()) throw new Error('API key Gemini belum diatur.')
  if (!cropDataUrl?.includes(',')) return { original: '', translated: '' }

  const [header, data] = cropDataUrl.split(',', 2)
  const mimeType = header.match(/^data:([^;]+);/)?.[1] || 'image/jpeg'
  const request = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${prompt || 'Terjemahkan teks Jepang manga ke Bahasa Indonesia secara natural.'}\nKamu menerima satu crop area manga. Baca hanya teks yang benar-benar terlihat. Jika tidak ada teks dialog, balas SKIP. Balas JSON valid saja dengan format {"original":"teks Jepang", "translated":"terjemahan Bahasa Indonesia"}.` }] },
      contents: [{ parts: [{ text: 'Baca dan terjemahkan teks pada crop ini.' }, { inlineData: { mimeType, data } }] }],
      generationConfig: { temperature: 0.25, maxOutputTokens: 512, responseMimeType: 'application/json' },
    }),
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey.trim())}`

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    let response
    let result
    try {
      response = await fetch(url, request)
      result = await response.json().catch(() => ({}))
    } catch {
      if (attempt === MAX_RETRIES) throw new Error('Koneksi ke Gemini gagal. Periksa internet lalu coba lagi.')
      const seconds = 2 ** attempt
      onStatus(`Koneksi bermasalah — mencoba lagi dalam ${seconds} dtk (${attempt + 1}/${MAX_RETRIES})`)
      await wait(seconds * 1000)
      continue
    }
    if (response.ok) return parseVisionResult(result)
    if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_RETRIES) {
      throw new Error(getErrorMessage(result, response.status))
    }
    const retryAfter = Number(response.headers.get('Retry-After'))
    const seconds = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 30) : 2 ** attempt
    onStatus(`Server Gemini sibuk — mencoba lagi dalam ${seconds} dtk (${attempt + 1}/${MAX_RETRIES})`)
    await wait(seconds * 1000)
  }
}

export async function testGeminiKey(apiKey) {
  return translateText('こんにちは', apiKey, 'Terjemahkan secara natural ke Bahasa Indonesia.')
}
