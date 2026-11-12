import { describe, expect, it } from 'vitest'
import {
  EXISTING_MEDIA_MIN_PSNR,
  INLINE_IMAGE_MAX_BYTES,
} from '../constants'
import {
  byteCeiling,
  computeDisplayPsnr,
  dataUrlToFile,
  evaluateCandidate,
  existingMediaTargetDimensions,
  isExcludedKind,
  optimizeExistingMedia,
  passesQualityGuard,
} from '../existingMedia'

const CARD_URL = `data:image/jpeg;base64,${btoa('phase-8a-test-payload')}`

describe('policy helpers', () => {
  it('excludes the hero kind by policy and allows card and logo', () => {
    expect(isExcludedKind('hero')).toBe(true)
    expect(isExcludedKind('card')).toBe(false)
    expect(isExcludedKind('logo')).toBe(false)
  })

  it('requires a candidate to be at most 90% of the stored bytes', () => {
    expect(byteCeiling(100_000)).toBe(90_000)
    expect(byteCeiling(78_000)).toBe(70_200)
    expect(byteCeiling(0)).toBe(0)
  })

  it('fits cards to 1080 x 720 and logos to 384 x 384 with exact aspects', () => {
    expect(existingMediaTargetDimensions(1200, 800, 'card')).toEqual({
      width: 1080,
      height: 720,
    })
    expect(existingMediaTargetDimensions(1080, 1080, 'logo')).toEqual({
      width: 384,
      height: 384,
    })
    // The hero target is unchanged (the hero itself is excluded upstream).
    expect(existingMediaTargetDimensions(1920, 1080, 'hero')).toEqual({
      width: 1920,
      height: 1080,
    })

    const card = existingMediaTargetDimensions(1200, 800, 'card')
    expect(card.width / card.height).toBeCloseTo(3 / 2, 10)
    const logo = existingMediaTargetDimensions(1080, 1080, 'logo')
    expect(logo.width / logo.height).toBe(1)
  })
})

describe('computeDisplayPsnr', () => {
  it('returns Infinity for identical buffers', () => {
    const a = new Uint8ClampedArray([0, 128, 255, 255])
    const b = new Uint8ClampedArray([0, 128, 255, 255])
    expect(computeDisplayPsnr(a, b)).toBe(Number.POSITIVE_INFINITY)
  })

  it('computes dB from the mean squared error', () => {
    const a = new Uint8ClampedArray(4)
    const b = new Uint8ClampedArray([1, 1, 1, 1])
    // MSE = 1, so PSNR = 10 * log10(255^2) ~= 48.13 dB.
    expect(computeDisplayPsnr(a, b)).toBeCloseTo(48.13, 1)
  })

  it('scores mismatched or empty buffers as 0 so a compare bug cannot pass', () => {
    expect(computeDisplayPsnr(new Uint8ClampedArray(3), new Uint8ClampedArray(4))).toBe(0)
    expect(computeDisplayPsnr(new Uint8ClampedArray(0), new Uint8ClampedArray(0))).toBe(0)
  })
})

describe('passesQualityGuard', () => {
  it('accepts at or above the 33 dB floor and rejects below it', () => {
    expect(passesQualityGuard(EXISTING_MEDIA_MIN_PSNR)).toBe(true)
    expect(passesQualityGuard(33.4)).toBe(true)
    expect(passesQualityGuard(Number.POSITIVE_INFINITY)).toBe(true)
    expect(passesQualityGuard(32.99)).toBe(false)
    expect(passesQualityGuard(Number.NaN)).toBe(false)
    expect(EXISTING_MEDIA_MIN_PSNR).toBe(33)
  })
})

describe('evaluateCandidate', () => {
  const card = {
    kind: 'card' as const,
    originalSize: 78_000,
    width: 1080,
    height: 720,
    size: 55_000,
    name: 'card-optimized.webp',
    type: 'image/webp',
  }

  it('accepts a smaller 1080 x 720 card even though the storage rule minimum is 1200 x 800', () => {
    // The inline pipeline already relaxes minimum dimensions for its own
    // downscales; the optimizer uses the same policy.
    expect(evaluateCandidate(card)).toEqual({ ok: true })
  })

  it('accepts a 384 x 384 JPEG logo within the byte target', () => {
    expect(
      evaluateCandidate({
        kind: 'logo',
        originalSize: 63_355,
        width: 384,
        height: 384,
        size: 16_200,
        name: 'logo-optimized.jpg',
        type: 'image/jpeg',
      }),
    ).toEqual({ ok: true })
  })

  it('rejects a candidate that is not at least 10% smaller', () => {
    expect(evaluateCandidate({ ...card, size: 70_500 })).toEqual({
      ok: false,
      reason: 'bytes',
    })
  })

  it('rejects a candidate above the per-kind inline byte cap', () => {
    const result = evaluateCandidate({
      ...card,
      originalSize: 1_000_000,
      size: INLINE_IMAGE_MAX_BYTES.card + 1,
    })
    expect(result).toEqual({ ok: false, reason: 'cap' })
  })

  it('rejects a candidate whose aspect ratio drifted', () => {
    expect(evaluateCandidate({ ...card, width: 1080, height: 700 })).toEqual({
      ok: false,
      reason: 'metadata',
    })
  })

  it('rejects a candidate whose extension and MIME type disagree', () => {
    expect(
      evaluateCandidate({ ...card, name: 'card-optimized.png', type: 'image/webp' }),
    ).toEqual({ ok: false, reason: 'metadata' })
  })
})

describe('dataUrlToFile', () => {
  it('turns a raster data URL back into a typed File', () => {
    const file = dataUrlToFile(CARD_URL, 'card')
    expect(file).not.toBeNull()
    expect(file?.type).toBe('image/jpeg')
    expect(file?.name).toBe('card-optimized.jpg')
    expect(file?.size).toBeGreaterThan(0)
  })

  it('returns null for a Storage https URL', () => {
    expect(
      dataUrlToFile('https://firebasestorage.googleapis.com/v0/b/bucket/o/home.jpg', 'card'),
    ).toBeNull()
  })

  it('returns null for a payload that is not plain base64', () => {
    expect(dataUrlToFile('data:image/jpeg;base64,***', 'card')).toBeNull()
    expect(dataUrlToFile('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'card')).toBeNull()
  })
})

describe('optimizeExistingMedia', () => {
  it('reports the hero as excluded before touching the payload', async () => {
    const result = await optimizeExistingMedia(
      { url: CARD_URL, width: 1920, height: 1080, size: 151_371 },
      'hero',
    )
    expect(result.status).toBe('excluded')
  })

  it('reports unavailable for non-inline images', async () => {
    const result = await optimizeExistingMedia(
      {
        url: 'https://firebasestorage.googleapis.com/v0/b/bucket/o/home.jpg',
        width: 1200,
        height: 800,
        size: 78_000,
      },
      'card',
    )
    expect(result.status).toBe('unavailable')
  })

  it('reports unavailable when the stored metadata is missing', async () => {
    const result = await optimizeExistingMedia(
      { url: CARD_URL, width: 0, height: 0, size: 0 },
      'card',
    )
    expect(result.status).toBe('unavailable')
  })

  it('fails cleanly when the stored payload cannot be parsed', async () => {
    const result = await optimizeExistingMedia(
      { url: 'data:image/jpeg;base64,***', width: 1200, height: 800, size: 78_000 },
      'card',
    )
    expect(result.status).toBe('error')
  })
})
