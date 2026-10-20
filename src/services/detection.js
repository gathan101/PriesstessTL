export const CLASS_NAMES = ['frame', 'dialogue_text', 'balloon', 'onomatopoeia_text']
export const TEXT_CLASS_NAMES = new Set(['dialogue_text', 'onomatopoeia_text'])

export const DEFAULT_SCORE_THRESHOLD = 0.25
export const DEFAULT_IOU_THRESHOLD = 0.6
export const DEFAULT_MAX_AREA_RATIO = 8

export function boxArea(bbox) {
  return Math.max(0, bbox[2] - bbox[0]) * Math.max(0, bbox[3] - bbox[1])
}

export function intersectionArea(first, second) {
  const width = Math.min(first[2], second[2]) - Math.max(first[0], second[0])
  const height = Math.min(first[3], second[3]) - Math.max(first[1], second[1])
  if (width <= 0 || height <= 0) return 0
  return width * height
}

export function iou(first, second) {
  const intersection = intersectionArea(first, second)
  if (intersection === 0) return 0
  const union = boxArea(first) + boxArea(second) - intersection
  return union <= 0 ? 0 : intersection / union
}

export function centerInside(outer, inner) {
  const centerX = (inner[0] + inner[2]) / 2
  const centerY = (inner[1] + inner[3]) / 2
  return centerX >= outer[0] && centerX <= outer[2] && centerY >= outer[1] && centerY <= outer[3]
}

export function nms(regions, threshold = DEFAULT_IOU_THRESHOLD) {
  const sorted = [...regions].sort((first, second) => (second.score ?? 0) - (first.score ?? 0))
  const kept = []
  sorted.forEach((region) => {
    const overlaps = kept.some((candidate) => (
      candidate.type === region.type && iou(candidate.bbox, region.bbox) > threshold
    ))
    if (!overlaps) kept.push(region)
  })
  return kept
}

export function mergeNestedRegions(regions, options = {}) {
  const iouThreshold = options.iouThreshold ?? DEFAULT_IOU_THRESHOLD
  const maxAreaRatio = options.maxAreaRatio ?? DEFAULT_MAX_AREA_RATIO
  const scoreThreshold = options.scoreThreshold ?? 0
  const filtered = regions.filter((region) => (
    region?.bbox?.length === 4
    && !/^frame$/i.test(region.type)
    && (region.score ?? 0) >= scoreThreshold
  ))

  const deduped = nms(filtered, iouThreshold)
  const balloons = deduped.filter((region) => region.type === 'balloon')
  const texts = deduped.filter((region) => TEXT_CLASS_NAMES.has(region.type))
  const absorbed = new Set()

  balloons.forEach((balloon) => {
    const balloonArea = boxArea(balloon.bbox)
    texts.forEach((text) => {
      if (absorbed.has(text)) return
      if (!centerInside(balloon.bbox, text.bbox)) return
      const textArea = boxArea(text.bbox)
      if (textArea <= 0) return
      if (balloonArea / textArea > maxAreaRatio) return
      absorbed.add(text)
      balloon.textBbox = text.bbox
      balloon.mergedCount = (balloon.mergedCount ?? 0) + 1
    })
  })

  const standaloneTexts = texts.filter((text) => !absorbed.has(text))
  return [...balloons, ...standaloneTexts].sort((first, second) => (second.score ?? 0) - (first.score ?? 0))
}
