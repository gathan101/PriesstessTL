import * as ort from 'onnxruntime-web'
import { pipeline } from '@huggingface/transformers'

const DETECTOR_URL = 'https://huggingface.co/Liiesl/bubble-segment-onnx/resolve/main/koharu-yolo26s-seg.onnx'
const CLASS_NAMES = ['frame', 'dialogue_text', 'balloon', 'onomatopoeia_text']
let detectorPromise
let ocrPromise

function extractOcrText(result) {
  const candidates = Array.isArray(result) ? result : [result]
  return candidates.map((item) => {
    if (typeof item === 'string') return item
    return item?.generated_text || item?.text || item?.output_text || ''
  }).join(' ').replace(/\s+/g, ' ').trim()
}

function makeInput(image, size = 1024) {
  const ratio = Math.min(size / image.width, size / image.height)
  const width = Math.round(image.width * ratio)
  const height = Math.round(image.height * ratio)
  const dx = Math.floor((size - width) / 2)
  const dy = Math.floor((size - height) / 2)
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  context.fillStyle = 'rgb(114,114,114)'
  context.fillRect(0, 0, size, size)
  context.drawImage(image, dx, dy, width, height)
  const pixels = context.getImageData(0, 0, size, size).data
  const plane = size * size
  const data = new Float32Array(plane * 3)
  for (let index = 0; index < plane; index += 1) {
    data[index] = pixels[index * 4] / 255
    data[plane + index] = pixels[index * 4 + 1] / 255
    data[plane * 2 + index] = pixels[index * 4 + 2] / 255
  }
  return { data, ratio, dx, dy }
}

async function getDetector() {
  if (!detectorPromise) {
    detectorPromise = fetch(DETECTOR_URL).then(async (response) => {
      if (!response.ok) throw new Error('Model detektor Koharu gagal diunduh.')
      return ort.InferenceSession.create(await response.arrayBuffer(), { executionProviders: ['wasm'] })
    })
  }
  return detectorPromise
}

async function getOcr() {
  if (!ocrPromise) ocrPromise = pipeline('image-to-text', 'onnx-community/manga-ocr-base-ONNX', { dtype: 'q4' })
  return ocrPromise
}

export async function readCrop(file, bbox, onProgress = () => {}) {
  if (!file || file.size === 0) throw new Error('File gambar tidak tersedia untuk OCR.')
  onProgress('Memuat Manga OCR lokal...')
  const image = await createImageBitmap(file)
  const [left, top, width, height] = bbox
  const crop = document.createElement('canvas')
  crop.width = Math.max(1, Math.round(image.width * width / 100))
  crop.height = Math.max(1, Math.round(image.height * height / 100))
  crop.getContext('2d').drawImage(image, image.width * left / 100, image.height * top / 100, crop.width, crop.height, 0, 0, crop.width, crop.height)
  const ocr = await getOcr()
  const result = await ocr(crop.toDataURL('image/png'))
  image.close?.()
  return extractOcrText(result)
}

export async function detectPage(file, onProgress = () => {}) {
  if (file.size === 0) throw new Error('File gambar tidak tersedia untuk deteksi.')
  onProgress('Mengunduh / memuat Koharu detector...')
  const image = await createImageBitmap(file)
  const session = await getDetector()
  const { data, ratio, dx, dy } = makeInput(image)
  const tensor = new ort.Tensor('float32', data, [1, 3, 1024, 1024])
  const output = await session.run({ [session.inputNames[0]]: tensor })
  const values = output.output0.data
  const regions = []
  for (let offset = 0; offset < values.length; offset += 38) {
    const score = Number(values[offset + 4])
    const classId = Math.round(Number(values[offset + 5]))
    if (score < 0.25 || !CLASS_NAMES[classId] || classId === 0) continue
    const x1 = Math.max(0, (Number(values[offset]) - dx) / ratio)
    const y1 = Math.max(0, (Number(values[offset + 1]) - dy) / ratio)
    const x2 = Math.min(image.width, (Number(values[offset + 2]) - dx) / ratio)
    const y2 = Math.min(image.height, (Number(values[offset + 3]) - dy) / ratio)
    if (x2 <= x1 || y2 <= y1) continue
    regions.push({ type: CLASS_NAMES[classId], score, bbox: [x1, y1, x2, y2], original: '' })
  }
  const textRegions = regions.filter((region) => region.type === 'dialogue_text' || region.type === 'onomatopoeia_text' || region.type === 'balloon')
  if (textRegions.length) {
    try {
      onProgress('Memuat Manga OCR lokal...')
      const ocr = await getOcr()
      for (let index = 0; index < textRegions.length; index += 1) {
        const region = textRegions[index]
        const crop = document.createElement('canvas')
        crop.width = Math.max(1, Math.round(region.bbox[2] - region.bbox[0]))
        crop.height = Math.max(1, Math.round(region.bbox[3] - region.bbox[1]))
        crop.getContext('2d').drawImage(image, region.bbox[0], region.bbox[1], crop.width, crop.height, 0, 0, crop.width, crop.height)
        try {
          const result = await ocr(crop.toDataURL('image/png'))
          region.original = extractOcrText(result)
        } catch { region.original = '' }
        onProgress(`Manga OCR: ${index + 1}/${textRegions.length}`)
      }
    } catch {
      onProgress('OCR lokal belum tersedia — area tetap bisa diedit manual')
    }
  }
  onProgress(`Deteksi selesai: ${regions.length} area`)
  const pageWidth = image.width
  const pageHeight = image.height
  image.close?.()
  return { width: pageWidth, height: pageHeight, regions }
}
