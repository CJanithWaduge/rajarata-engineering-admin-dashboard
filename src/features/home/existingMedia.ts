import {
  EXISTING_MEDIA_BYTE_TARGET,
  EXISTING_MEDIA_DISPLAY_WIDTH,
  EXISTING_MEDIA_EXCLUDED_KINDS,
  EXISTING_MEDIA_MIN_PSNR,
  EXISTING_MEDIA_QUALITIES,
  EXTENSION_BY_TYPE,
  INLINE_IMAGE_MAX_BYTES,
  INLINE_IMAGE_TARGETS,
  type ImageKind,
} from './constants'
import {
  compressionDimensions,
  encodeCanvasBlob,
  loadDrawable,
} from './imageCompression'
import { validateImageMetadata } from './imageValidation'
import type { ImageContentType } from './types'

/**
 * Phase 8A existing-media optimizer.
 *
 * Reads a stored (inline data-URL) image out of a Firestore document, generates
 * smaller re-encode candidates against the approved guardrails, and reports the
 * first candidate that passes — the admin then approves it explicitly. Nothing
 * here writes anywhere: the original stored bytes stay in the document until an
 * approved candidate flows through the feature's normal draft/save pipeline.
 *
 * Guardrails (all must hold, in order):
 * 1. the hero kind is excluded by policy and never re-encoded;
 * 2. the candidate is at most `EXISTING_MEDIA_BYTE_TARGET` (90%) of the stored
 *    bytes, so an accepted image always shrinks the document;
 * 3. the candidate fits the per-kind inline byte cap;
 * 4. display-scale PSNR against the stored original is at least
 *    `EXISTING_MEDIA_MIN_PSNR` (33 dB), measured at the width the public page
 *    actually renders the slot at;
 * 5. the candidate passes the shared `validateImageMetadata` rules (type,
 *    extension, aspect) with minimum dimensions relaxed — the same relaxation
 *    the inline upload pipeline already applies to its own downscales.
 *
 * If no candidate passes every guardrail, the result is `kept` and the stored
 * image is left untouched.
 */

/** The stored image handed to the optimizer. */
export type StoredMedia = {
  url: string
  width: number
  height: number
  size: number
}

export type ExistingMediaCandidate = {
  file: File
  width: number
  height: number
  size: number
  contentType: ImageContentType
  /** Stored byte size the candidate replaces; drives the "optimized from" label. */
  originalSize: number
  /** Display-scale PSNR of the candidate against the stored original. */
  psnr: number
}

export type ExistingMediaResult =
  | { status: 'excluded'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'kept'; message: string }
  | { status: 'optimized'; candidate: ExistingMediaCandidate }
  | { status: 'error'; message: string }

export type CandidateRejection = 'bytes' | 'cap' | 'psnr' | 'metadata'

export type CandidateInput = {
  kind: ImageKind
  originalSize: number
  width: number
  height: number
  size: number
  name: string
  type: string
}

/** True for kinds the Phase 8A approval excludes from optimization. */
export function isExcludedKind(kind: ImageKind): boolean {
  return EXISTING_MEDIA_EXCLUDED_KINDS.includes(kind)
}

/** A candidate must be at most this share of the stored bytes. */
export function byteCeiling(originalSize: number): number {
  return Math.floor(originalSize * EXISTING_MEDIA_BYTE_TARGET)
}

/**
 * Dimensions a candidate is encoded at: the stored image fit inside the
 * kind's inline ceiling, aspect preserved. Minimum-dimension enforcement is off
 * because the stored original already passed it (same policy as the inline
 * upload path's own downscales).
 */
export function existingMediaTargetDimensions(
  width: number,
  height: number,
  kind: ImageKind,
): { width: number; height: number } {
  return compressionDimensions(width, height, kind, INLINE_IMAGE_TARGETS[kind], false)
}

/**
 * PSNR over raw RGBA buffers of equal length. `Infinity` means the buffers are
 * identical; mismatched or empty buffers score 0 so a comparison bug can never
 * pass the quality guard.
 */
export function computeDisplayPsnr(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  if (a.length === 0 || a.length !== b.length) return 0

  let sum = 0
  for (let index = 0; index < a.length; index += 1) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0)
    sum += delta * delta
  }

  const mse = sum / a.length
  if (mse === 0) return Number.POSITIVE_INFINITY
  return 10 * Math.log10((255 * 255) / mse)
}

/** Quality guard: display-scale PSNR must stay at or above the approved floor. */
export function passesQualityGuard(psnr: number): boolean {
  return psnr >= EXISTING_MEDIA_MIN_PSNR
}

/**
 * Size/type/aspect guardrails for one candidate. PSNR is checked separately
 * because it needs a decode the cheap checks can skip when they already fail.
 */
export function evaluateCandidate(
  candidate: CandidateInput,
): { ok: true } | { ok: false; reason: CandidateRejection } {
  if (candidate.size > byteCeiling(candidate.originalSize)) {
    return { ok: false, reason: 'bytes' }
  }

  if (candidate.size > INLINE_IMAGE_MAX_BYTES[candidate.kind]) {
    return { ok: false, reason: 'cap' }
  }

  const metadata = validateImageMetadata(
    {
      name: candidate.name,
      type: candidate.type,
      size: candidate.size,
      width: candidate.width,
      height: candidate.height,
    },
    candidate.kind,
    { requireMinimumDimensions: false },
  )
  if (!metadata.ok) return { ok: false, reason: 'metadata' }

  return { ok: true }
}

const DATA_URL_PATTERN = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/

/**
 * Turns an inline data URL back into a File so the shared decode path can be
 * reused. Returns null for anything that is not a plain raster data URL — a
 * Storage https URL, a malformed payload, or a non-raster MIME type.
 */
export function dataUrlToFile(dataUrl: string, kind: ImageKind): File | null {
  const match = DATA_URL_PATTERN.exec(dataUrl.trim())
  if (!match) return null

  const mime = match[1]
  const base64 = match[2]
  if (!mime || !base64) return null

  const contentType = mime.toLowerCase() as ImageContentType

  let binary: string
  try {
    binary = atob(base64)
  } catch {
    return null
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }

  return new File([bytes], `${kind}-optimized.${EXTENSION_BY_TYPE[contentType]}`, {
    type: contentType,
  })
}

function contentTypeOf(blob: Blob): ImageContentType {
  if (blob.type === 'image/webp') return 'image/webp'
  if (blob.type === 'image/png') return 'image/png'
  return 'image/jpeg'
}

/** Renders `source` into a fresh canvas scaled to the display box. */
function renderAtDisplaySize(
  source: CanvasImageSource,
  displayWidth: number,
  displayHeight: number,
): ImageData | null {
  const canvas = document.createElement('canvas')
  canvas.width = displayWidth
  canvas.height = displayHeight
  const context = canvas.getContext('2d')
  if (!context) return null

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, displayWidth, displayHeight)
  context.drawImage(source, 0, 0, displayWidth, displayHeight)
  return context.getImageData(0, 0, displayWidth, displayHeight)
}

/**
 * Analyzes one stored image and returns the first candidate that passes every
 * guardrail, or a status explaining why nothing should change. Pure policy
 * lives in the exported helpers; this function only orchestrates decode,
 * encode, and measurement, and never touches Firestore or Storage.
 */
export async function optimizeExistingMedia(
  stored: StoredMedia,
  kind: ImageKind,
): Promise<ExistingMediaResult> {
  if (isExcludedKind(kind)) {
    return {
      status: 'excluded',
      message:
        'Hero images are excluded from optimization: original dimensions and quality are preserved by policy.',
    }
  }

  if (
    !stored.url.startsWith('data:image/') ||
    stored.size <= 0 ||
    stored.width <= 0 ||
    stored.height <= 0
  ) {
    return {
      status: 'unavailable',
      message:
        'Only an inline-stored image with known dimensions can be optimized here.',
    }
  }

  const file = dataUrlToFile(stored.url, kind)
  if (!file) {
    return {
      status: 'error',
      message: 'The stored image could not be read for optimization.',
    }
  }

  let drawable: Awaited<ReturnType<typeof loadDrawable>>
  try {
    drawable = await loadDrawable(file)
  } catch {
    return {
      status: 'error',
      message: 'The stored image could not be decoded for optimization.',
    }
  }

  try {
    const target = existingMediaTargetDimensions(stored.width, stored.height, kind)

    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height
    const context = canvas.getContext('2d')
    if (!context) {
      return {
        status: 'error',
        message: 'This browser could not optimize the stored image.',
      }
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    // JPEG has no alpha channel; flatten transparency onto white.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, target.width, target.height)
    context.drawImage(drawable.source, 0, 0, target.width, target.height)

    // PSNR is measured at the width the public page renders this slot at, so
    // the guard reflects what a visitor actually sees rather than full
    // resolution differences they never perceive.
    const displayWidth = Math.max(
      1,
      Math.min(EXISTING_MEDIA_DISPLAY_WIDTH[kind], stored.width, target.width),
    )
    const displayHeight = Math.max(
      1,
      Math.round((displayWidth * stored.height) / stored.width),
    )
    const reference = renderAtDisplaySize(drawable.source, displayWidth, displayHeight)
    if (!reference) {
      return {
        status: 'error',
        message: 'This browser could not measure the stored image quality.',
      }
    }

    const allowWebp = kind !== 'logo'
    const baseName = `${kind}-optimized`

    for (const quality of EXISTING_MEDIA_QUALITIES) {
      const blob = await encodeCanvasBlob(canvas, quality, allowWebp)
      const contentType = contentTypeOf(blob)
      const name = `${baseName}.${EXTENSION_BY_TYPE[contentType]}`

      const guard = evaluateCandidate({
        kind,
        originalSize: stored.size,
        width: target.width,
        height: target.height,
        size: blob.size,
        name,
        type: contentType,
      })
      if (!guard.ok) continue

      const candidateFile = new File([blob], name, { type: contentType })
      let candidateDrawable: Awaited<ReturnType<typeof loadDrawable>>
      try {
        candidateDrawable = await loadDrawable(candidateFile)
      } catch {
        continue
      }

      try {
        const measured = renderAtDisplaySize(
          candidateDrawable.source,
          displayWidth,
          displayHeight,
        )
        if (!measured) continue

        const psnr = computeDisplayPsnr(reference.data, measured.data)
        if (!passesQualityGuard(psnr)) continue

        return {
          status: 'optimized',
          candidate: {
            file: candidateFile,
            width: target.width,
            height: target.height,
            size: blob.size,
            contentType,
            originalSize: stored.size,
            psnr,
          },
        }
      } finally {
        candidateDrawable.release()
      }
    }

    return {
      status: 'kept',
      message:
        'No candidate met the size and quality guardrails, so the stored image was kept unchanged.',
    }
  } catch {
    return {
      status: 'error',
      message: 'This browser could not optimize the stored image.',
    }
  } finally {
    drawable.release()
  }
}
