import { describe, expect, it } from 'vitest'
import { measureTypeset, typesetText, wrapWords } from '../src/services/typesetting'

describe('TC-28 normalisasi teks', () => {
  it('mengubah teks menjadi huruf kapital', () => {
    expect(typesetText('aku sudah biasa')).toBe('AKU SUDAH BIASA')
  })

  it('merapikan spasi berlebih', () => {
    expect(typesetText('  halo   dunia  ')).toBe('HALO DUNIA')
  })

  it('menangani nilai kosong', () => {
    expect(typesetText(null)).toBe('')
    expect(typesetText(undefined)).toBe('')
  })
})

describe('TC-26 dan TC-27 auto-fit serta word wrap', () => {
  it('mengecilkan font sampai seluruh teks muat di kotak', () => {
    const layout = measureTypeset('AKU UDAH TERBIASA MINUM SENDIRIAN.', 200, 120)
    expect(layout.fontSize).toBeGreaterThanOrEqual(9)
    expect(layout.fontSize).toBeLessThanOrEqual(26)
    const lines = layout.text.split('\n')
    expect(lines.length).toBeGreaterThan(1)
    expect(lines.length * layout.fontSize * layout.lineHeight).toBeLessThanOrEqual(120 * 0.82)
  })

  it('tidak memotong kata di tengah', () => {
    const layout = measureTypeset('AKU UDAH TERBIASA MINUM SENDIRIAN.', 200, 120)
    const words = new Set(layout.text.split('\n').join(' ').split(' '))
    ;['AKU', 'UDAH', 'TERBIASA', 'MINUM', 'SENDIRIAN.'].forEach((word) => {
      expect(words.has(word)).toBe(true)
    })
  })

  it('mempertahankan satu baris bila teks pendek', () => {
    const layout = measureTypeset('HALO', 200, 80)
    expect(layout.text).toBe('HALO')
    expect(layout.text.split('\n')).toHaveLength(1)
  })

  it('mengecilkan font untuk kotak sempit', () => {
    const wide = measureTypeset('KALIMAT YANG CUKUP PANJANG UNTUK DIUJI', 320, 160)
    const narrow = measureTypeset('KALIMAT YANG CUKUP PANJANG UNTUK DIUJI', 90, 160)
    expect(narrow.fontSize).toBeLessThanOrEqual(wide.fontSize)
  })

  it('membungkus kata sesuai lebar maksimum', () => {
    const lines = wrapWords(['SATU', 'DUA', 'TIGA'], 50, (value) => value.length * 10)
    expect(lines).toEqual(['SATU', 'DUA', 'TIGA'])
  })

  it('menggabungkan kata bila masih muat dalam satu baris', () => {
    const lines = wrapWords(['SATU', 'DUA'], 100, (value) => value.length * 10)
    expect(lines).toEqual(['SATU DUA'])
  })

  it('mengembalikan layout kosong untuk teks kosong', () => {
    const layout = measureTypeset('', 200, 100)
    expect(layout.text).toBe('')
    expect(layout.fontSize).toBe(12)
  })
})

describe('TC-31 teks vertikal', () => {
  it('memecah teks menjadi satu karakter per baris', () => {
    const layout = measureTypeset('こんにちは', 60, 240, true)
    expect(layout.text.split('\n')).toHaveLength(5)
    expect(layout.lineHeight).toBe(1.02)
  })

  it('membatasi ukuran font vertikal antara 9 dan 28', () => {
    const tiny = measureTypeset('あ'.repeat(40), 60, 240, true)
    const huge = measureTypeset('あ'.repeat(3), 60, 400, true)
    expect(tiny.fontSize).toBeGreaterThanOrEqual(9)
    expect(huge.fontSize).toBeLessThanOrEqual(28)
  })

  it('menghapus spasi pada mode vertikal', () => {
    const layout = measureTypeset('あ い う', 60, 240, true)
    expect(layout.text.includes(' ')).toBe(false)
    expect(layout.text.split('\n')).toHaveLength(3)
  })
})

describe('TC-32 konsistensi preview dan export', () => {
  it('memberi hasil deterministik untuk input yang sama', () => {
    const first = measureTypeset('TEKS YANG SAMA UNTUK DIBANDINGKAN', 180, 110)
    const second = measureTypeset('TEKS YANG SAMA UNTUK DIBANDINGKAN', 180, 110)
    expect(first).toEqual(second)
  })
})
