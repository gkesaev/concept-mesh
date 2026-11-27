import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'

const BLANK_DOMINANT_RATIO_THRESHOLD = 0.995

export interface ScreenshotAnalysis {
  isBlank: boolean
  hash: string
  width: number
  height: number
  dominantRatio: number
  uniqueColors: number
}

/**
 * Computes a SHA-256 hash of a PNG screenshot and detects blank / single-color renders.
 * RGB values are quantized to 5 bits per channel so negligible compression or
 * subpixel dithering noise does not defeat blank detection.
 */
export function analyzeScreenshot(pngBuffer: Buffer): ScreenshotAnalysis {
  const hash = createHash('sha256').update(pngBuffer).digest('hex')
  const png = PNG.sync.read(pngBuffer)
  const totalPixels = png.width * png.height

  if (totalPixels === 0) {
    return {
      isBlank: true,
      hash,
      width: png.width,
      height: png.height,
      dominantRatio: 1,
      uniqueColors: 0,
    }
  }

  const buckets = new Map<number, number>()
  let maxCount = 0
  const data = png.data

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] >> 3
    const g = data[i + 1] >> 3
    const b = data[i + 2] >> 3
    const a = data[i + 3] >> 3
    const key = (r << 15) | (g << 10) | (b << 5) | a
    const count = (buckets.get(key) ?? 0) + 1
    buckets.set(key, count)
    if (count > maxCount) maxCount = count
  }

  const dominantRatio = maxCount / totalPixels
  const uniqueColors = buckets.size
  const isBlank = uniqueColors <= 1 || dominantRatio >= BLANK_DOMINANT_RATIO_THRESHOLD

  return {
    isBlank,
    hash,
    width: png.width,
    height: png.height,
    dominantRatio,
    uniqueColors,
  }
}
