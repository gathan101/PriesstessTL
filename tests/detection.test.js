import { describe, expect, it } from 'vitest'
import {
  boxArea,
  centerInside,
  iou,
  mergeNestedRegions,
  nms,
  TEXT_CLASS_NAMES,
} from '../src/services/detection'

const balloon = (bbox, score = 0.9) => ({ type: 'balloon', score, bbox })
const text = (type, bbox, score = 0.8) => ({ type, score, bbox })

describe('geometri deteksi', () => {
  it('menghitung luas kotak', () => {
    expect(boxArea([0, 0, 10, 20])).toBe(200)
  })

  it('menghitung IoU dua kotak identik sebesar 1', () => {
    expect(iou([0, 0, 100, 100], [0, 0, 100, 100])).toBeCloseTo(1)
  })

  it('menghitung IoU kotak tanpa irisan sebesar 0', () => {
    expect(iou([0, 0, 10, 10], [50, 50, 60, 60])).toBe(0)
  })

  it('mendeteksi titik tengah di dalam kotak', () => {
    expect(centerInside([0, 0, 100, 100], [40, 40, 50, 50])).toBe(true)
    expect(centerInside([0, 0, 100, 100], [200, 200, 210, 210])).toBe(false)
  })
})

describe('TC-02 containment merge', () => {
  it('menggabungkan balloon dengan teks di dalamnya menjadi satu region', () => {
    const regions = [balloon([100, 100, 300, 300]), text('dialogue_text', [130, 130, 270, 230])]
    const result = mergeNestedRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('balloon')
    expect(result[0].bbox).toEqual([100, 100, 300, 300])
    expect(result[0].textBbox).toEqual([130, 130, 270, 230])
    expect(result[0].mergedCount).toBe(1)
  })

  it('tidak menggabungkan teks yang berada di luar balloon', () => {
    const regions = [balloon([0, 0, 100, 100]), text('dialogue_text', [400, 400, 500, 480])]
    expect(mergeNestedRegions(regions)).toHaveLength(2)
  })

  it('menolak merge bila balloon terlalu besar dibanding teks', () => {
    const regions = [balloon([0, 0, 1000, 1000]), text('dialogue_text', [400, 400, 440, 430])]
    const result = mergeNestedRegions(regions, { maxAreaRatio: 8 })
    expect(result.filter((region) => region.type === 'balloon')).toHaveLength(1)
    expect(result.filter((region) => region.type === 'dialogue_text')).toHaveLength(1)
  })
})

describe('TC-03 non-max suppression', () => {
  it('membuang kotak dengan IoU tinggi dan mempertahankan skor terbesar', () => {
    const regions = [balloon([0, 0, 100, 100], 0.9), balloon([10, 10, 110, 110], 0.6)]
    const result = nms(regions, 0.6)
    expect(result).toHaveLength(1)
    expect(result[0].score).toBe(0.9)
  })

  it('mempertahankan dua kotak yang tidak beririsan', () => {
    const regions = [balloon([0, 0, 40, 40]), balloon([200, 200, 240, 240])]
    expect(nms(regions, 0.6)).toHaveLength(2)
  })
})

describe('TC-04 dan TC-05 region mandiri', () => {
  it('mempertahankan SFX onomatopoeia di luar balon', () => {
    const regions = [balloon([0, 0, 100, 100]), text('onomatopoeia_text', [400, 400, 460, 440])]
    const result = mergeNestedRegions(regions)
    expect(result).toHaveLength(2)
    expect(result.some((region) => region.type === 'onomatopoeia_text')).toBe(true)
  })

  it('mempertahankan teks narasi tanpa balon', () => {
    const regions = [text('dialogue_text', [20, 500, 200, 560])]
    const result = mergeNestedRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('dialogue_text')
  })

  it('mengenali kelas teks yang valid', () => {
    expect(TEXT_CLASS_NAMES.has('dialogue_text')).toBe(true)
    expect(TEXT_CLASS_NAMES.has('onomatopoeia_text')).toBe(true)
    expect(TEXT_CLASS_NAMES.has('balloon')).toBe(false)
  })
})

describe('TC-06 sampai TC-08 penyaringan region', () => {
  it('membiarkan balloon kosong tetap ada untuk diproses SKIP', () => {
    const result = mergeNestedRegions([balloon([0, 0, 100, 100])])
    expect(result).toHaveLength(1)
    expect(result[0].mergedCount).toBeUndefined()
  })

  it('membuang kelas frame', () => {
    const regions = [{ type: 'frame', score: 0.99, bbox: [0, 0, 1000, 1000] }]
    expect(mergeNestedRegions(regions)).toHaveLength(0)
  })

  it('membuang region dengan skor di bawah ambang', () => {
    const regions = [balloon([0, 0, 100, 100], 0.2)]
    expect(mergeNestedRegions(regions, { scoreThreshold: 0.25 })).toHaveLength(0)
  })

  it('mengabaikan region dengan bbox tidak lengkap', () => {
    const regions = [{ type: 'balloon', score: 0.9, bbox: [0, 0, 10] }]
    expect(mergeNestedRegions(regions)).toHaveLength(0)
  })

  it('menggabungkan beberapa teks ke satu balloon', () => {
    const regions = [
      balloon([0, 0, 200, 200]),
      text('dialogue_text', [20, 20, 180, 90]),
      text('dialogue_text', [20, 110, 180, 180]),
    ]
    const result = mergeNestedRegions(regions)
    expect(result).toHaveLength(1)
    expect(result[0].mergedCount).toBe(2)
  })
})
