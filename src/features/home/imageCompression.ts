import {
  COMPRESSION_QUALITIES,
  COMPRESSION_TARGETS,
  EXTENSION_BY_TYPE,
  IMAGE_RULES,
  INLINE_COMPRESSION_QUALITIES,
  INLINE_IMAGE_MAX_BYTES,
  INLINE_IMAGE_MAX_BYTES_LABEL,
  INLINE_IMAGE_TARGETS,
  type ImageKind,
} from './constants'
import type { ImageContentType } from './types'

export type CompressedImage = {
  file: File
  width: number
  height: number
  size: number
  contentType: ImageContentType
}

export type CompressImageResult =
  | { ok: true; image: CompressedImage }
  | { ok: false; message: string }

type Drawable = {
  source: CanvasImageSource
  release: () => void
}

/**
 * Fits the source inside the kind's compression ceiling while keeping the
 * aspect ratio. Rounding can land just outside the allowed aspect range, so the
 * result is nudged back inside it.
 */
export function compressionDimensions(
  width: number,
  height: number,
  kind: ImageKind,
  target = COMPRESSION_TARGETS[kind],
  enforceMinimum = true,
): { width: number; height: number } {
  const rule = IMAGE_RULES[kind]
  const scale = Math.min(1, target.maxWidth / width, target.maxHeight / height)

  let targetWidth = Math.max(1, Math.round(width * scale))
  let targetHeight = Math.max(1, Math.round(height * scale))

  if (targetWidth / targetHeight > rule.maxAspect) {
    targetWidth = Math.floor(targetHeight * rule.maxAspect)
  } else if (targetWidth / targetHeight < rule.minAspect) {
    targetHeight = Math.floor(targetWidth / rule.minAspect)
  }

  // Storage keeps the original when a downscale would fall below the source
  // minimum. Inline mode intentionally allows that: the source already passed
  // the minimum check, and fitting inside the inline box keeps the document
  // small. The public hero/cards use object-cover, so the aspect is preserved.
  if (enforceMinimum && (targetWidth < rule.minWidth || targetHeight < rule.minHeight)) {
    return { width, height }
  }

  return { width: targetWidth, height: targetHeight }
}

/**
 * Decodes a File into something `drawImage` accepts, preferring
 * `createImageBitmap` and falling back to an `Image` element. Shared by the
 * upload compressor and the Phase 8A existing-media optimizer.
 */
export async function loadDrawable(file: File): Promise<Drawable> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return { source: bitmap, release: () => bitmap.close() }
    } catch {
      // Fall through to the Image element path.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('decode-failed'))
      element.src = url
    })
    return { source: image, release: () => URL.revokeObjectURL(url) }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: ImageContentType,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), type, quality)
    } catch {
      resolve(null)
    }
  })
}

/**
 * Canvas WebP encoding support, detected once per session by encoding a 1x1
 * probe and checking the type that comes back. Browsers that cannot encode
 * WebP silently return PNG instead, which is what makes the type check the
 * reliable signal. Cached so the ladder only pays for the probe once.
 */
let webpEncodeSupported: boolean | null = null

async function detectWebpEncoding(): Promise<boolean> {
  if (webpEncodeSupported !== null) return webpEncodeSupported
  try {
    const probe = document.createElement('canvas')
    probe.width = 1
    probe.height = 1
    const blob = await canvasToBlob(probe, 'image/webp', 0.5)
    webpEncodeSupported = blob !== null && blob.type === 'image/webp'
  } catch {
    webpEncodeSupported = false
  }
  return webpEncodeSupported
}

/**
 * Encodes one quality rung. WebP is attempted first (it is materially smaller
 * than JPEG at the same visual quality); browsers without WebP canvas encoding
 * fall back to JPEG, and the logo always uses JPEG because the public site
 * also points the favicon at the logo data URL.
 */
export async function encodeCanvasBlob(
  canvas: HTMLCanvasElement,
  quality: number,
  allowWebp: boolean,
): Promise<Blob> {
  if (allowWebp && (await detectWebpEncoding())) {
    const webp = await canvasToBlob(canvas, 'image/webp', quality)
    if (webp && webp.type === 'image/webp') return webp
    // The probe passed but this encode did not come back as WebP: treat the
    // browser as unable to encode WebP and fall through to JPEG.
    webpEncodeSupported = false
  }

  const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality)
  if (!jpeg) throw new Error('encode-failed')
  return jpeg
}

/**
 * Downscales and re-encodes an already-decoded image. WebP is preferred for
 * photographic slots because it stores the same visual quality in fewer bytes;
 * JPEG remains the universal fallback (and the only format used for the logo).
 * The caller revalidates the result before it can be saved.
 */
export async function compressImage(
  file: File,
  kind: ImageKind,
  dimensions: { width: number; height: number },
  mode: 'storage' | 'inline' = 'storage',
): Promise<CompressImageResult> {
  const inline = mode === 'inline'
  const rule = IMAGE_RULES[kind]
  const targetConfig = inline ? INLINE_IMAGE_TARGETS[kind] : COMPRESSION_TARGETS[kind]
  const maxBytes = inline ? INLINE_IMAGE_MAX_BYTES[kind] : rule.maxBytes
  const maxBytesLabel = inline ? INLINE_IMAGE_MAX_BYTES_LABEL[kind] : rule.maxBytesLabel
  const qualities = inline ? INLINE_COMPRESSION_QUALITIES : COMPRESSION_QUALITIES
  const target = compressionDimensions(
    dimensions.width,
    dimensions.height,
    kind,
    targetConfig,
    !inline,
  )

  let drawable: Drawable
  try {
    drawable = await loadDrawable(file)
  } catch {
    return {
      ok: false,
      message: 'This image could not be decoded. Choose a different file.',
    }
  }

  try {
    const canvas = document.createElement('canvas')
    canvas.width = target.width
    canvas.height = target.height

    const context = canvas.getContext('2d')
    if (!context) {
      return {
        ok: false,
        message: 'The image could not be optimized in this browser. Choose a smaller file.',
      }
    }

    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    // JPEG has no alpha channel; flatten transparency onto white.
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, target.width, target.height)
    context.drawImage(drawable.source, 0, 0, target.width, target.height)

    const allowWebp = kind !== 'logo'

    for (const quality of qualities) {
      const blob = await encodeCanvasBlob(canvas, quality, allowWebp)
      if (blob.size <= maxBytes) {
        const contentType: ImageContentType =
          blob.type === 'image/png'
            ? 'image/png'
            : blob.type === 'image/webp'
              ? 'image/webp'
              : 'image/jpeg'
        const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
        return {
          ok: true,
          image: {
            file: new File([blob], `${baseName}.${EXTENSION_BY_TYPE[contentType]}`, {
              type: contentType,
              lastModified: file.lastModified,
            }),
            width: target.width,
            height: target.height,
            size: blob.size,
            contentType,
          },
        }
      }
    }

    return {
      ok: false,
      message: `The image could not be reduced below ${maxBytesLabel}. Choose a smaller file.`,
    }
  } catch {
    return {
      ok: false,
      message: 'The image could not be optimized. Choose a smaller file.',
    }
  } finally {
    drawable.release()
  }
}
