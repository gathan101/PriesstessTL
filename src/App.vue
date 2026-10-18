<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { getGeminiModel, testGeminiKey, translateText } from './services/gemini'
import { DEFAULT_PROMPTS, STYLE_OPTIONS, promptForStyle } from './services/prompts'
import { detectPage, readCrop } from './services/localEngine'

const fileInput = ref(null)
const editorInput = ref(null)
const pages = ref([])
const imageUrl = ref('')
const imageName = ref('')
const currentFile = ref(null)
const pageIndex = ref(1)
const status = ref('Ready')
const activeTool = ref('select')
const activeBubble = ref(0)
const settingsOpen = ref(false)
const exportOpen = ref(false)
const exportFormat = ref('png')
const exportQuality = ref(0.95)
const exportName = ref('translated-page')
const settingsTab = ref('api')
const isTesting = ref(false)
const isTranslating = ref(false)
const notice = ref('')
const apiKey = ref('')
const targetLanguage = ref('Indonesian')
const translationStyle = ref('Santai')
const styleKey = ref('casual')
const stylePrompt = ref('')
const detectionModel = ref('Koharu YOLO26s')
const confidence = ref(0.4)
const strictFiltering = ref(true)
const selectedFont = ref('Wild Words')
const fontPresets = ref([
  { font: 'Wild Words', bold: true, italic: false },
  { font: 'Wild Words', bold: true, italic: false },
  { font: 'Wild Words', bold: true, italic: false },
])
const autoFit = ref(true)
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const isPanning = ref(false)
const panStart = ref({ x: 0, y: 0 })
const drawing = ref(false)
const drawStart = ref({ x: 0, y: 0 })
const draftBox = ref(null)
const boxDrag = ref(null)
const textVertical = ref(false)

const bubbles = ref([
  { id: 1, type: 'text', bbox: [57, 12, 15, 13], original: 'ã²ã¨ã‚Šé£²ã¿ã ã£ãŸ', translated: 'Aku terbiasa minum sendirian.' },
  { id: 2, type: 'text', bbox: [77, 31, 16, 19], original: 'ãã®æ–¹ãŒæ¥½ã ã— æ°—å…¼ã­ã‚‚ã—ãªã„', translated: 'Begitu lebih nyaman dan tidak perlu sungkan.' },
  { id: 3, type: 'bubble', bbox: [12, 34, 13, 20], original: 'ã™ã¿ã¾ã›ã‚“ã€ãƒã‚¤ãƒœãƒ¼ãƒ«ã²ã¨ã¤', translated: 'Permisi, satu highball ya.' },
  { id: 4, type: 'text', bbox: [31, 46, 11, 14], original: 'ãã£ã¨ã“ã‚Œã‹ã‚‰ã ã£ã¦', translated: 'Pasti mulai sekarang juga.' },
  { id: 5, type: 'bubble', bbox: [39, 61, 13, 19], original: 'ã„ã¤ã§ã‚‚ãã†', translated: 'Kapan pun akan begitu.' },
  { id: 6, type: 'text', bbox: [78, 61, 12, 13], original: 'è¶³å…ƒã«ã¯æ¡œ', translated: 'Di bawah kaki ada bunga sakura.' },
])

const selectedBubble = computed(() => bubbles.value[activeBubble.value] || null)
const hasImage = computed(() => Boolean(imageUrl.value))
const model = getGeminiModel()

onMounted(() => {
  apiKey.value = localStorage.getItem('daikantl_gemini_api_key') || ''
  styleKey.value = localStorage.getItem('daikantl_style_key') || 'casual'
  stylePrompt.value = localStorage.getItem(`daikantl_prompt_${styleKey.value}`) || promptForStyle(styleKey.value)
  translationStyle.value = STYLE_OPTIONS.find((option) => option.value === styleKey.value)?.label || 'Casual / Santai'
  window.addEventListener('keydown', shortcut)
})

function chooseFile() { fileInput.value?.click() }
function saveCurrentPageState() {
  const page = pages.value[pageIndex.value - 1]
  if (page) page.bubbles = bubbles.value
}
function showPage(index) {
  if (!pages.value.length) return
  saveCurrentPageState()
  pageIndex.value = Math.max(1, Math.min(pages.value.length, index))
  const page = pages.value[pageIndex.value - 1]
  imageUrl.value = page.url
  imageName.value = page.name
  currentFile.value = page.file
  bubbles.value = page.bubbles
  activeBubble.value = Math.min(activeBubble.value, Math.max(0, bubbles.value.length - 1))
  status.value = `Halaman ${pageIndex.value}/${pages.value.length}`
  notice.value = ''
}
function loadFiles(fileList) {
  const files = Array.from(fileList || []).filter((file) => file?.type?.startsWith('image/'))
  if (!files.length) { notice.value = 'Pilih satu atau beberapa file gambar manga.'; return }
  pages.value.forEach((page) => URL.revokeObjectURL(page.url))
  pages.value = files.map((file) => ({ file, name: file.name, url: URL.createObjectURL(file), bubbles: [] }))
  pageIndex.value = 1
  bubbles.value = []
  activeBubble.value = 0
  showPage(1)
  status.value = `${pages.value.length} halaman dimuat — klik Detect untuk mulai AI`
}
function loadFile(file) { loadFiles(file ? [file] : []) }
function onFilesChange(event) { loadFiles(event.target.files); event.target.value = '' }
function previousPage() { if (pageIndex.value > 1) showPage(pageIndex.value - 1) }
function nextPage() { if (pageIndex.value < pages.value.length) showPage(pageIndex.value + 1) }
function getActivePage() { return pages.value[pageIndex.value - 1] }
function syncActivePage() { const page = getActivePage(); if (page) page.bubbles = bubbles.value }
async function detectCurrentPage() {
  if (!currentFile.value) {
    notice.value = 'Buka gambar terlebih dahulu.'
    return
  }
  await runDetection(currentFile.value)
}
async function runDetection(file) {
  status.value = 'Loading local AI...'
  try {
    const result = await detectPage(file, (message) => { status.value = message })
    const detected = result.regions.filter((region) => region.type !== 'frame').map((region, index) => ({
      id: index + 1,
      type: region.type === 'balloon' ? 'bubble' : 'text',
      vertical: false,
      bbox: [region.bbox[0] / result.width * 100, region.bbox[1] / result.height * 100, (region.bbox[2] - region.bbox[0]) / result.width * 100, (region.bbox[3] - region.bbox[1]) / result.height * 100],
      original: region.original || '',
      translated: '',
    }))
    if (detected.length) {
      bubbles.value = detected
      syncActivePage()
      activeBubble.value = 0
      const ocrCount = detected.filter((bubble) => bubble.original.trim()).length
      status.value = `Detected ${detected.length} regions — OCR ${ocrCount}/${detected.length}`
      notice.value = ocrCount ? `${ocrCount} teks OCR siap diterjemahkan.` : 'Area terdeteksi, tetapi OCR belum membaca teks. Coba ulang Detect atau isi teks pada editor.'
    }
    else status.value = 'No text region found — gunakan Shape Tool'
  } catch (error) {
    status.value = 'Local AI unavailable'
    notice.value = `${error.message} Kamu masih bisa membuat area manual.`
  }
}
function selectBubble(index) { activeBubble.value = index; activeTool.value = 'select' }
function setBubbleShape(shape) {
  if (selectedBubble.value) selectedBubble.value.type = shape
}
function toggleTextOrientation() {
  if (!selectedBubble.value) return
  selectedBubble.value.vertical = !selectedBubble.value.vertical
  textVertical.value = selectedBubble.value.vertical
}
function startBoxDrag(event, index, mode = 'move') {
  if (activeTool.value !== 'select' || event.button !== 0) return
  event.stopPropagation()
  selectBubble(index)
  const bubble = bubbles.value[index]
  const rect = event.currentTarget.closest('.page-wrap').getBoundingClientRect()
  boxDrag.value = { index, mode, startX: event.clientX, startY: event.clientY, rect, bbox: [...bubble.bbox] }
}
function updateBoxDrag(event) {
  if (!boxDrag.value) return
  const drag = boxDrag.value
  const bubble = bubbles.value[drag.index]
  const dx = (event.clientX - drag.startX) / drag.rect.width * 100
  const dy = (event.clientY - drag.startY) / drag.rect.height * 100
  let [left, top, width, height] = drag.bbox
  if (drag.mode === 'move') {
    left = Math.max(0, Math.min(100 - width, left + dx)); top = Math.max(0, Math.min(100 - height, top + dy))
  } else {
    if (drag.mode.includes('e')) width = Math.max(1, Math.min(100 - left, width + dx))
    if (drag.mode.includes('w')) { const nextLeft = Math.max(0, Math.min(left + width - 1, left + dx)); width += left - nextLeft; left = nextLeft }
    if (drag.mode.includes('s')) height = Math.max(1, Math.min(100 - top, height + dy))
    if (drag.mode.includes('n')) { const nextTop = Math.max(0, Math.min(top + height - 1, top + dy)); height += top - nextTop; top = nextTop }
  }
  bubble.bbox = [left, top, width, height]
}
function finishBoxDrag() { boxDrag.value = null }
function toggleFontStyle(index, style) {
  fontPresets.value[index][style] = !fontPresets.value[index][style]
}
function addBubble() { activeTool.value = 'draw'; notice.value = 'Shape Tool aktif — drag di gambar kiri untuk membuat area.' }
function startPan(event) {
  if (event.button !== 1 && event.button !== 2) return
  event.preventDefault(); isPanning.value = true; panStart.value = { x: event.clientX - pan.value.x, y: event.clientY - pan.value.y }
}
function movePan(event) { if (isPanning.value) pan.value = { x: event.clientX - panStart.value.x, y: event.clientY - panStart.value.y } }
function stopPan() { isPanning.value = false }
function zoomCanvas(event) { event.preventDefault(); zoom.value = Math.min(3, Math.max(.4, zoom.value + (event.deltaY < 0 ? .1 : -.1))) }
function beginDraw(event) {
  if (activeTool.value !== 'draw' || event.button !== 0) return
  event.preventDefault()
  event.currentTarget.setPointerCapture?.(event.pointerId)
  const rect = event.currentTarget.querySelector('.page-wrap')?.getBoundingClientRect()
  if (!rect) return
  const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100))
  const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
  drawing.value = true
  drawStart.value = { x, y }
  draftBox.value = { x, y, width: 0, height: 0 }
}
function updateDraw(event) {
  if (!drawing.value) return
  const rect = event.currentTarget.querySelector('.page-wrap')?.getBoundingClientRect(); if (!rect) return
  const x = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100)); const y = Math.max(0, Math.min(100, (event.clientY - rect.top) / rect.height * 100))
  const left = Math.min(drawStart.value.x, x); const top = Math.min(drawStart.value.y, y)
  draftBox.value = { x: left, y: top, width: Math.abs(x - drawStart.value.x), height: Math.abs(y - drawStart.value.y) }
}
async function finishDraw(event) {
  if (!drawing.value || !draftBox.value) return
  event?.currentTarget.releasePointerCapture?.(event.pointerId)
  if (draftBox.value.width < 1 || draftBox.value.height < 1) { drawing.value = false; draftBox.value = null; return }
  const box = { x: Math.max(0, Math.min(100, draftBox.value.x)), y: Math.max(0, Math.min(100, draftBox.value.y)), width: Math.max(1, Math.min(100, draftBox.value.width)), height: Math.max(1, Math.min(100, draftBox.value.height)) }
  box.width = Math.min(box.width, 100 - box.x)
  box.height = Math.min(box.height, 100 - box.y)
  const bubble = { id: bubbles.value.length + 1, type: 'text', vertical: false, manual: true, bbox: [box.x, box.y, box.width, box.height], original: '', translated: '' }
  bubbles.value.push(bubble)
  activeBubble.value = bubbles.value.length - 1
  activeTool.value = 'select'
  drawing.value = false
  draftBox.value = null
  notice.value = 'Area manual dibuat. Membaca teks di area ini...'
  await nextTick()
  editorInput.value?.focus()
  if (currentFile.value) {
    try {
      bubble.original = await readCrop(currentFile.value, bubble.bbox, (message) => { status.value = message })
      notice.value = bubble.original ? 'Area manual siap diterjemahkan.' : 'Area manual siap — teks tidak terbaca, isi manual di editor.'
    } catch {
      notice.value = 'OCR area manual gagal — isi teksnya secara manual di editor.'
    }
  }
}
function removeBubble() {
  if (!selectedBubble.value) return
  bubbles.value.splice(activeBubble.value, 1)
  bubbles.value.forEach((bubble, index) => { bubble.id = index + 1 })
  activeBubble.value = Math.max(0, Math.min(activeBubble.value, bubbles.value.length - 1))
}
function openExportDialog() {
  if (!imageUrl.value) { notice.value = 'Buka gambar manga terlebih dahulu.'; return }
  exportName.value = imageName.value.replace(/\.[^.]+$/, '') + '-daikantl'
  exportFormat.value = 'png'
  exportOpen.value = true
}
function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1]
  const binary = atob(base64)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}
async function exportResult() {
  if (!imageUrl.value) { notice.value = 'Buka gambar manga terlebih dahulu.'; return }
  const image = new Image(); image.src = imageUrl.value
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject })
  const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight
  const context = canvas.getContext('2d'); context.drawImage(image, 0, 0)
  bubbles.value.forEach((bubble) => {
    const [left, top, width, height] = bubble.bbox; const x = left / 100 * canvas.width; const y = top / 100 * canvas.height; const w = width / 100 * canvas.width; const h = height / 100 * canvas.height
    context.fillStyle = '#f8f8f5'; context.fillRect(x, y, w, h); context.fillStyle = '#121212'; context.textAlign = 'center'; context.textBaseline = 'middle'
    const fontStyle = fontPresets.value[0]
    const fontSize = Math.max(12, Math.min(34, h / 4)); context.font = `${fontStyle.italic ? 'italic ' : ''}${fontStyle.bold ? '700' : '400'} ${fontSize}px Arial`
    const lines = []; let line = ''
    ;(bubble.translated || '').split(' ').forEach((word) => { const candidate = line ? `${line} ${word}` : word; if (context.measureText(candidate).width > w - 12 && line) { lines.push(line); line = word } else line = candidate })
    if (line) lines.push(line); const lineHeight = fontSize * 1.15; const startY = y + h / 2 - ((lines.length - 1) * lineHeight) / 2
    lines.forEach((text, index) => context.fillText(text, x + w / 2, startY + index * lineHeight, w - 12))
  })
  const mime = exportFormat.value === 'jpg' ? 'image/jpeg' : exportFormat.value === 'webp' ? 'image/webp' : 'image/png'
  const extension = exportFormat.value === 'jpg' ? 'jpg' : exportFormat.value
  const dataUrl = canvas.toDataURL(mime, Number(exportQuality.value))
  const path = await save({ title: 'Simpan hasil terjemahan', defaultPath: `${exportName.value}.${extension}`, filters: [{ name: extension.toUpperCase(), extensions: [extension] }] })
  if (!path) return
  await writeFile(path, dataUrlBytes(dataUrl))
  exportOpen.value = false
  notice.value = `Hasil berhasil disimpan sebagai ${extension.toUpperCase()}.`
}
function saveSettings() {
  localStorage.setItem('daikantl_gemini_api_key', apiKey.value.trim())
  localStorage.setItem('daikantl_style_key', styleKey.value)
  localStorage.setItem(`daikantl_prompt_${styleKey.value}`, stylePrompt.value)
  settingsOpen.value = false
  notice.value = 'Pengaturan disimpan di perangkat ini.'
}
function changeStyle() {
  stylePrompt.value = localStorage.getItem(`daikantl_prompt_${styleKey.value}`) || promptForStyle(styleKey.value)
  translationStyle.value = STYLE_OPTIONS.find((option) => option.value === styleKey.value)?.label || 'Custom'
}
function resetPrompt() {
  stylePrompt.value = promptForStyle(styleKey.value)
  localStorage.removeItem(`daikantl_prompt_${styleKey.value}`)
  notice.value = 'Prompt dikembalikan ke default DaikanTL.'
}
async function testKey() {
  isTesting.value = true; notice.value = ''
  try { await testGeminiKey(apiKey.value); notice.value = 'API key valid dan Gemini siap digunakan.' }
  catch (error) { notice.value = error.message }
  finally { isTesting.value = false }
}
async function translateSelected() {
  if (!selectedBubble.value) return
  isTranslating.value = true; status.value = 'Translating...'; notice.value = ''
  try {
    selectedBubble.value.translated = await translateText(
      selectedBubble.value.original,
      apiKey.value,
      stylePrompt.value.replaceAll('{targetLanguage}', targetLanguage.value),
      (message) => { status.value = message },
    )
    status.value = 'Ready'
  }
  catch (error) { notice.value = error.message; status.value = 'Translation failed' }
  finally { isTranslating.value = false }
}
async function translatePage() {
  const originalPage = pageIndex.value
  const totalJobs = pages.value.reduce((total, page) => total + page.bubbles.filter((bubble) => bubble.original?.trim()).length, 0)
  if (!totalJobs) {
    notice.value = 'Belum ada teks OCR. Klik Detect atau buat area manual lalu isi teks aslinya.'
    return
  }
  if (!apiKey.value.trim()) {
    notice.value = 'API key Gemini belum diatur di Settings > API.'
    settingsOpen.value = true
    settingsTab.value = 'api'
    return
  }
  isTranslating.value = true
  notice.value = ''
  let completed = 0
  try {
    for (let pageNumber = 1; pageNumber <= pages.value.length; pageNumber += 1) {
      showPage(pageNumber)
      const jobs = bubbles.value.map((bubble, index) => ({ bubble, index })).filter(({ bubble }) => bubble.original?.trim())
      for (const { bubble, index } of jobs) {
        activeBubble.value = index
        status.value = `Menerjemahkan halaman ${pageNumber}/${pages.value.length} — ${completed + 1}/${totalJobs}`
        bubble.translated = await translateText(
          bubble.original,
          apiKey.value,
          stylePrompt.value.replaceAll('{targetLanguage}', targetLanguage.value),
          (message) => { status.value = `${completed + 1}/${totalJobs} — ${message}` },
        )
        completed += 1
        syncActivePage()
      }
    }
    showPage(originalPage)
    status.value = `Terjemahan ${completed} bubble di ${pages.value.length} halaman selesai`
  } catch (error) {
    notice.value = error.message
    status.value = 'Translation stopped'
  } finally {
    isTranslating.value = false
  }
}
function resetWorkspace() {
  pages.value.forEach((page) => URL.revokeObjectURL(page.url))
  pages.value = []
  imageUrl.value = ''; imageName.value = ''; currentFile.value = null; bubbles.value = []; pageIndex.value = 1
  status.value = 'Ready'; notice.value = ''; pan.value = { x: 0, y: 0 }; zoom.value = 1
}
function shortcut(event) {
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return
  if (event.key.toLowerCase() === 'a') addBubble()
  if (event.key.toLowerCase() === 'v') activeTool.value = 'select'
  if (event.key.toLowerCase() === 'o' && currentFile.value) runDetection(currentFile.value)
  if (event.key === 'Delete' || event.key === 'Backspace') removeBubble()
}
</script>

<template>
  <div class="app-shell">
    <header class="toolbar">
      <div class="toolbar-left">
         <button class="tool active" title="Buka satu atau beberapa gambar" @click="chooseFile"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V3m0 0L7 8m5-5 5 5M4 14v5h16v-5"/></svg></button>
        <button class="tool" :class="{ selected: activeTool === 'select' }" title="Pilih bubble" @click="activeTool = 'select'"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4zM8 8h8v8H8z"/></svg></button>
         <button class="tool" :class="{ selected: activeTool === 'draw' }" title="Buat area manual" @click="addBubble"><svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg></button>
         <button class="tool" title="Deteksi bubble &amp; OCR" :disabled="!currentFile" @click="detectCurrentPage"><svg viewBox="0 0 24 24"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12a5 5 0 1 0 10 0a5 5 0 1 0-10 0zM12 9v6m-3-3h6"/></svg></button>
        <button class="tool" title="Fit canvas" @click="zoom = 1; status = 'Canvas fitted'"><svg viewBox="0 0 24 24"><path d="M8 3H3v5M16 3h5v5M8 21H3v-5M21 16v5h-5"/></svg></button>
         <button class="tool" title="Terjemahkan semua halaman" :disabled="isTranslating || !pages.length" @click="translatePage"><svg viewBox="0 0 24 24"><path d="M4 5h8M8 3v2m-3 0c1 5 4 8 8 10M5 15l5-5 5 5M15 4h5l-4 15-3-8h6"/></svg></button>
      </div>
      <div class="status">{{ status }}</div>
      <div class="toolbar-right">
         <button class="page-arrow" :disabled="pageIndex <= 1" aria-label="Halaman sebelumnya" @click="previousPage">‹</button><b class="page-count">{{ pages.length ? pageIndex : 0 }}/{{ pages.length }}</b><button class="page-arrow" :disabled="pageIndex >= pages.length" aria-label="Halaman berikutnya" @click="nextPage">›</button>
         <button class="tool" title="Export hasil" @click="openExportDialog"><svg viewBox="0 0 24 24"><path d="M12 3v13m0 0-5-5m5 5 5-5M5 14v5h14v-5"/></svg></button>
        <button class="tool" title="Buka file" @click="chooseFile"><svg viewBox="0 0 24 24"><path d="M3 6h7l2 2h9v11H3z"/></svg></button>
        <button class="tool" title="Pengaturan" @click="settingsOpen = true"><svg viewBox="0 0 24 24"><path d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4M15.5 12A3.5 3.5 0 1 1 8.5 12a3.5 3.5 0 0 1 7 0z"/></svg></button>
      </div>
    </header>

     <input ref="fileInput" hidden multiple type="file" accept="image/png,image/jpeg,image/webp" @change="onFilesChange">
    <div class="workspace-labels"><b>ORIGINAL</b><b>TRANSLATED</b></div>
    <main class="split-workspace">
       <section class="canvas-panel original-panel" :class="{ panning: isPanning, drawing: activeTool === 'draw' }" @drop.prevent="loadFiles($event.dataTransfer.files)" @dragover.prevent @wheel="zoomCanvas" @mousedown="startPan" @mousemove="movePan" @mouseup="stopPan" @mouseleave="stopPan" @contextmenu.prevent @pointerdown="beginDraw" @pointermove="updateDraw" @pointerup="finishDraw" @pointercancel="finishDraw" @pointermove.capture="updateBoxDrag" @pointerup.capture="finishBoxDrag">
        <div v-if="!hasImage" class="empty-canvas" @click="chooseFile"><svg class="empty-icon" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg><b>Open manga page</b><small>klik atau drop gambar ke sini</small></div>
        <div v-else class="page-wrap" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"><img :src="imageUrl" :alt="imageName"><div v-for="(bubble, index) in bubbles" :key="bubble.id" class="bubble-box" :class="[{ current: index === activeBubble }, bubble.type]" :style="{ left: bubble.bbox[0] + '%', top: bubble.bbox[1] + '%', width: bubble.bbox[2] + '%', height: bubble.bbox[3] + '%' }" @pointerdown.stop="startBoxDrag($event, index)"><i>{{ bubble.id }}</i><template v-if="index === activeBubble"><span class="resize-handle nw" @pointerdown.stop="startBoxDrag($event, index, 'nw')"></span><span class="resize-handle ne" @pointerdown.stop="startBoxDrag($event, index, 'ne')"></span><span class="resize-handle sw" @pointerdown.stop="startBoxDrag($event, index, 'sw')"></span><span class="resize-handle se" @pointerdown.stop="startBoxDrag($event, index, 'se')"></span></template></div><div v-if="draftBox" class="draft-box" :style="{ left: draftBox.x + '%', top: draftBox.y + '%', width: draftBox.width + '%', height: draftBox.height + '%' }"></div></div>
      </section>
      <section class="canvas-panel translated-panel">
        <div v-if="!hasImage" class="empty-canvas muted"><svg class="empty-icon muted-icon" viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0M8 12h8"/></svg><b>Translated preview</b><small>hasil akan muncul di sini</small></div>
         <div v-else class="page-wrap" :style="{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }"><img :src="imageUrl" :alt="imageName"><div v-for="(bubble, index) in bubbles" :key="`translated-${bubble.id}`" class="translated-box" :class="[{ current: index === activeBubble }, bubble.type, { vertical: bubble.vertical, empty: !bubble.translated }]" :style="{ left: bubble.bbox[0] + '%', top: bubble.bbox[1] + '%', width: bubble.bbox[2] + '%', height: bubble.bbox[3] + '%' }" @click="selectBubble(index)">{{ bubble.translated || '...' }}</div></div>
      </section>
    </main>

    <div class="editor-bar">
      <span class="id-badge">ID: {{ selectedBubble?.id || '-' }}</span><textarea v-if="selectedBubble" ref="editorInput" v-model="selectedBubble.translated" rows="1" :placeholder="isTranslating ? 'Translating...' : 'Teks terjemahan...'"></textarea><span v-else class="editor-placeholder">Pilih bubble di gambar kiri untuk mengedit teks</span><button class="bar-tool" :class="{ active: selectedBubble?.type === 'bubble' }" title="Bentuk oval" @click="setBubbleShape('bubble')"><svg viewBox="0 0 24 24"><ellipse cx="12" cy="12" rx="8" ry="5.5"/></svg></button><button class="bar-tool" :class="{ active: selectedBubble?.type !== 'bubble' }" title="Bentuk kotak" @click="setBubbleShape('text')"><svg viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="1"/></svg></button><button class="bar-tool" :class="{ active: selectedBubble?.vertical }" title="Orientasi teks vertikal" @click="toggleTextOrientation"><svg viewBox="0 0 24 24"><path d="M8 5v14M12 5v14M16 5v14"/></svg></button><button class="bar-tool delete-tool" title="Hapus area" @click="removeBubble"><svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6m4-6v6M9 7l1-2h4l1 2m-9 0 1 14h12l1-14"/></svg></button>
    </div>
     <div v-if="notice" class="notice">{{ notice }} <button @click="notice = ''">×</button></div>
     <div v-if="exportOpen" class="settings-backdrop" @click.self="exportOpen = false"><section class="settings-modal export-modal"><div class="settings-head"><h2>Export hasil</h2><button @click="exportOpen = false">×</button></div><div class="settings-content"><label>Nama file<input v-model="exportName" placeholder="translated-page"></label><label>Format<select v-model="exportFormat"><option value="png">PNG — kualitas lossless</option><option value="jpg">JPEG — file lebih kecil</option><option value="webp">WebP — ukuran efisien</option></select></label><label v-if="exportFormat !== 'png'">Kualitas<input v-model.number="exportQuality" type="range" min="0.5" max="1" step="0.05"><small>{{ Math.round(exportQuality * 100) }}%</small></label><small>Setelah menekan Simpan, pilih folder dan nama file pada dialog Windows.</small><div class="modal-actions"><button class="reset-button" @click="exportOpen = false">Batal</button><button class="apply-button" @click="exportResult">Pilih folder &amp; simpan</button></div></div></section></div>

    <div v-if="settingsOpen" class="settings-backdrop" @click.self="settingsOpen = false"><section class="settings-modal"><div class="settings-head"><h2>Settings</h2><button @click="settingsOpen = false">×</button></div><div class="settings-tabs"><button v-for="tab in [['api','API'],['style','Style'],['bubble','Bubble'],['text','Text']]" :key="tab[0]" :class="{ active: settingsTab === tab[0] }" @click="settingsTab = tab[0]">{{ tab[1] }}</button></div><div v-if="settingsTab === 'api'" class="settings-content"><div class="form-grid"><label>Target Language<select v-model="targetLanguage"><option>Indonesian</option><option>English</option></select></label><label>Translation Mode<select><option>Multi-Page (Fast)</option><option>Single Page</option></select></label><label>Translation Provider<select><option>Gemini</option></select></label><label>Gemini Model<input :value="model" readonly></label></div><label>Gemini API Key<div class="key-row"><input v-model="apiKey" type="password" placeholder="Masukkan API key milikmu"><button @click="testKey">{{ isTesting ? '...' : 'Test' }}</button></div></label><a class="api-link" href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer">Get key from Google AI Studio ↗</a></div><div v-else-if="settingsTab === 'style'" class="settings-content"><label>Translation Style<select v-model="styleKey" @change="changeStyle"><option v-for="option in STYLE_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option></select></label><textarea v-model="stylePrompt" class="prompt-editor" placeholder="Tulis aturan gaya terjemahanmu..."></textarea><div class="prompt-actions"><small>{targetLanguage} akan diganti otomatis saat menerjemahkan.</small><button class="reset-button" @click="resetPrompt">Reset to default</button></div></div><div v-else-if="settingsTab === 'bubble'" class="settings-content"><label>Bubble Detector Model<select v-model="detectionModel"><option>Koharu YOLO26s</option><option>ogkalu RT-DETR</option></select></label><label>Detection Confidence <b class="range-value">{{ confidence.toFixed(2) }}</b><input v-model="confidence" class="range" type="range" min="0.1" max="0.9" step="0.05"></label><div class="toggle-row"><span><b>Strict Bubble Filtering</b><small>Filter deteksi dengan confidence rendah</small></span><button class="switch" :class="{ on: strictFiltering }" role="switch" :aria-checked="strictFiltering" @click="strictFiltering = !strictFiltering"><span></span></button></div></div><div v-else class="settings-content"><label v-for="(slot, i) in 3" :key="slot">Preset {{ i + 1 }}<div class="font-row"><select v-model="fontPresets[i].font"><option>Wild Words</option><option>Comic Neue</option><option>Bangers</option><option>Noto Sans</option></select><button :class="{ on: fontPresets[i].bold }" @click="toggleFontStyle(i, 'bold')">B</button><button :class="{ on: fontPresets[i].italic }" @click="toggleFontStyle(i, 'italic')"><i>I</i></button></div></label><div class="form-grid"><label>Font Size<select><option>Auto-Fit</option><option>Small</option><option>Medium</option></select></label><label>Letter Case<select><option>Original</option><option>UPPERCASE</option></select></label></div></div><div class="settings-actions"><button class="support">â™¥ Support</button><button class="save" @click="saveSettings">Save & Close</button></div></section></div>
  </div>
</template>

<style>
:root{font-family:Arial,Helvetica,sans-serif;color:#eee;background:#0d0d0f;font-synthesis:none;-webkit-font-smoothing:antialiased}*{box-sizing:border-box}body{margin:0;min-width:900px;overflow:hidden;background:#0d0d0f}.app-shell{height:100vh;display:flex;flex-direction:column;background:#0d0d0f}.toolbar{height:72px;flex-shrink:0;display:flex;align-items:center;justify-content:space-between;padding:0 14px;border-bottom:1px solid #29292c;background:#101012}.toolbar-left,.toolbar-right{display:flex;align-items:center;gap:7px}.tool,.page-arrow,.bar-tool{border:0;background:#202023;color:#eee;border-radius:9px;height:40px;min-width:40px;font-size:19px;cursor:pointer}.tool:hover,.tool.selected,.page-arrow:hover,.bar-tool:hover{background:#303035}.tool.active{color:#f23843}.status{color:#89898d;font-size:13px}.page-arrow{color:#777;font-size:29px}.page-arrow:disabled{opacity:.4}.page-count{margin:0 9px;font-size:14px}.workspace-labels{height:34px;flex-shrink:0;display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid #2c2c2f;text-align:center;align-items:center;font-size:12px}.workspace-labels b+ b{border-left:1px solid #2c2c2f}.split-workspace{display:grid;grid-template-columns:1fr 1fr;min-height:0;flex:1}.canvas-panel{position:relative;display:flex;justify-content:center;align-items:center;overflow:hidden;background:#0b0b0c}.canvas-panel+ .canvas-panel{border-left:1px solid #303033}.canvas-panel.panning{cursor:grabbing}.canvas-panel.drawing{cursor:crosshair}.draft-box{position:absolute;border:2px dashed #ef3542;background:#ef354222;pointer-events:none;z-index:3}.page-wrap{position:relative;max-height:calc(100vh - 195px);max-width:82%;display:inline-block;line-height:0}.page-wrap>img{max-height:calc(100vh - 195px);max-width:100%;object-fit:contain}.empty-canvas{width:70%;height:70%;border:1px dashed #4a4a4d;border-radius:8px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#a5a5a8;cursor:pointer}.empty-canvas:hover{border-color:#ef3542;background:#151517}.empty-canvas span{font-size:35px;color:#ef3542}.empty-canvas b{font-size:14px;margin-top:12px}.empty-canvas small{font-size:11px;color:#6d6d72;margin-top:7px}.empty-canvas.muted{opacity:.6;cursor:default}.bubble-box{position:absolute;border:2px solid #ee3542;background:#ee354226;cursor:pointer;line-height:normal}.bubble-box i{position:absolute;left:-2px;top:-21px;background:#ee3542;color:#fff;font:bold 12px Arial;padding:4px 6px;border-radius:4px;font-style:normal}.bubble-box.current{border-color:#08b9e7;background:#08b9e726}.bubble-box.current i{background:#08b9e7}.bubble-box.bubble{border-radius:45%}.translated-box{position:absolute;display:flex;align-items:center;justify-content:center;text-align:center;padding:5px;color:#141414;background:#f5f5f5e8;font-weight:700;font-size:clamp(7px,1.1vw,14px);line-height:1.1;cursor:pointer;overflow:hidden}.translated-box.current{outline:2px solid #08b9e7;outline-offset:1px}.zoom-bar{position:fixed;right:18px;bottom:75px;z-index:2;display:flex;align-items:center;gap:8px;background:#202023;border:1px solid #38383c;border-radius:7px;padding:4px 7px;color:#aaa;font-size:11px}.zoom-bar button{width:24px;height:24px;border:0;border-radius:4px;background:#303035;color:#fff;cursor:pointer}.editor-bar{height:58px;flex-shrink:0;border-top:1px solid #303034;background:#141416;display:flex;align-items:center;gap:10px;padding:8px 15px}.id-badge{border:2px solid #ee3542;border-radius:8px;padding:8px 12px;font:bold 12px Arial;color:#fff}.editor-bar textarea{flex:1;resize:none;background:#202023;border:0;outline:0;border-radius:8px;color:#eee;padding:10px 13px;font:13px Arial}.editor-placeholder{flex:1;color:#777;font-size:12px}.bar-tool{height:39px;min-width:39px;font-size:13px}.apply-button{height:39px;border:0;border-radius:8px;background:#ee3542;color:#fff;padding:0 15px;font-weight:bold;cursor:pointer}.apply-button:disabled{opacity:.45}.notice{position:fixed;right:18px;bottom:75px;background:#29292d;border:1px solid #444;border-radius:6px;padding:11px 14px;font-size:12px;box-shadow:0 8px 30px #0008}.notice button{border:0;background:none;color:#aaa;margin-left:10px;cursor:pointer}.settings-backdrop{position:fixed;inset:0;background:#000b;display:flex;justify-content:flex-end;align-items:flex-start;padding:8px 10px;z-index:5}.settings-modal{width:475px;max-height:calc(100vh - 16px);overflow:auto;background:#111113;border:1px solid #444;border-radius:9px;padding:17px 18px;box-shadow:0 15px 60px #000}.settings-head{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #454548;padding-bottom:14px}.settings-head h2{font-size:18px;margin:0}.settings-head button{border:0;background:none;color:#aaa;font-size:25px;cursor:pointer}.settings-tabs{display:flex;gap:17px;border-bottom:1px solid #363639;padding:12px 0 0}.settings-tabs button{border:0;background:none;color:#777;padding:0 0 10px;font-size:12px;cursor:pointer}.settings-tabs button.active{color:#fff;border-bottom:2px solid #ef3542}.settings-content{padding-top:20px;min-height:340px}label{display:block;color:#999;font-size:12px;margin-bottom:19px}select,.settings-content input:not(.range){display:block;width:100%;background:#222225;border:0;color:#eee;border-radius:8px;padding:12px;margin-top:7px;font-size:12px;outline:0}.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:0 10px}.key-row{display:flex;gap:8px}.key-row input{flex:1!important}.key-row button{margin-top:7px;border:0;background:#ef3542;color:#fff;border-radius:8px;padding:0 15px;cursor:pointer}.settings-content a.api-link{color:#43a9e3;font-size:11px;text-decoration:underline;cursor:pointer}.prompt-box{background:#222225;border-radius:8px;padding:13px;color:#eee;line-height:1.5;font-size:12px;min-height:150px}.range-value{float:right;color:#ef3542}.range{width:100%;accent-color:#ef3542;margin-top:17px}.toggle-row{display:flex;justify-content:space-between;align-items:center;background:#222225;padding:14px;border-radius:8px}.toggle-row b,.toggle-row small{display:block}.toggle-row small{font-size:10px;color:#777;margin-top:4px}.toggle-row input{width:38px;height:20px;accent-color:#ef3542}.font-row{display:flex;gap:7px}.font-row select{flex:1;margin-top:0}.font-row button{width:35px;border:0;border-radius:7px;background:#333;color:#fff;cursor:pointer}.font-row button.on{background:#ef3542}.settings-actions{border-top:1px solid #454548;padding-top:14px;display:flex;justify-content:space-between;gap:10px}.settings-actions button{border:0;border-radius:7px;height:37px;padding:0 20px;cursor:pointer;font-weight:bold}.support{background:#281518;color:#ef3542}.save{flex:1;background:#ef3542;color:#fff}
.tool svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}.prompt-editor{width:100%;min-height:190px;resize:vertical;background:#222225;border:0;border-radius:8px;color:#eee;padding:13px;font:12px/1.55 Arial;outline:0}.prompt-editor:focus{outline:1px solid #ef3542}.prompt-actions{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:8px}.prompt-actions small{color:#777;font-size:10px}.reset-button{border:0;border-radius:6px;background:#333;color:#eee;padding:8px 10px;font-size:10px;cursor:pointer}.reset-button:hover{background:#ef3542}.empty-icon{width:34px;height:34px;fill:none;stroke:#ef3542;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;margin-bottom:12px}.muted-icon{stroke:#8d3038}.switch{position:relative;width:42px;height:23px;border:0;border-radius:20px;background:#3a3a3e;padding:3px;cursor:pointer;transition:.2s}.switch span{display:block;width:17px;height:17px;border-radius:50%;background:#aaa;transition:.2s}.switch.on{background:#ef3542}.switch.on span{background:#fff;transform:translateX(19px)}.font-row button{font-size:16px}.font-row button i{font-family:Georgia,serif}.font-row button:not(.on){color:#aaa}.bubble-box{touch-action:none}.bubble-box.current{z-index:4}.resize-handle{position:absolute;width:9px;height:9px;border:2px solid #fff;background:#08b9e7;border-radius:2px;z-index:5}.resize-handle.nw{left:-5px;top:-5px;cursor:nwse-resize}.resize-handle.ne{right:-5px;top:-5px;cursor:nesw-resize}.resize-handle.sw{left:-5px;bottom:-5px;cursor:nesw-resize}.resize-handle.se{right:-5px;bottom:-5px;cursor:nwse-resize}.translated-box.bubble{border-radius:50%}.translated-box.empty{background:#f8f8f544;border:1px dashed #ef3542;color:#ef3542;font-size:12px;display:flex;align-items:center;justify-content:center}.translated-box.vertical{writing-mode:vertical-rl;text-orientation:mixed}.bar-tool svg{width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;vertical-align:middle}.bar-tool.active{background:#ef3542;color:#fff}.delete-tool:hover{background:#ef3542;color:#fff}</style>












