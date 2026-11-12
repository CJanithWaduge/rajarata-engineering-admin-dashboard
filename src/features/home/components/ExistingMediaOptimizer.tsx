import { useEffect, useRef, useState } from 'react'
import { Button } from '../../../components/ui/Button'
import { EXISTING_MEDIA_MIN_PSNR, type ImageKind } from '../constants'
import {
  isExcludedKind,
  optimizeExistingMedia,
  type ExistingMediaCandidate,
  type ExistingMediaResult,
  type StoredMedia,
} from '../existingMedia'
import { formatBytes } from '../imageValidation'
import { INLINE_MEDIA_ENABLED } from '../mediaMode'

type Props = {
  id: string
  kind: ImageKind
  /** The image currently stored in the document; null when there is none. */
  stored: StoredMedia | null
  disabled?: boolean
  /** Called when the admin approves the optimized candidate for the draft. */
  onApprove: (candidate: ExistingMediaCandidate) => void
}

/** Width each slot actually renders at on the public page (CSS px). */
const DISPLAY_WIDTH: Record<ImageKind, number> = {
  hero: 690,
  card: 384,
  logo: 40,
}

type AnalysisView = {
  result: ExistingMediaResult
  /** Object URL for the candidate preview; null unless a candidate exists. */
  url: string | null
}

function displayBox(kind: ImageKind, stored: StoredMedia): { width: number; height: number } {
  const width = DISPLAY_WIDTH[kind]
  const height =
    kind === 'logo'
      ? width
      : Math.max(1, Math.round((width * stored.height) / stored.width))
  return { width, height }
}

/**
 * Per-image optimizer panel: analyzes the stored image, then shows the stored
 * and optimized versions side by side at the width the public page renders
 * them at, with byte sizes, reduction, and measured PSNR. The stored image is
 * never replaced until the admin presses "Use optimized image", and even then
 * the change only lands when the form is saved through its normal pipeline.
 */
export function ExistingMediaOptimizer({
  id,
  kind,
  stored,
  disabled = false,
  onApprove,
}: Props) {
  const [busy, setBusy] = useState(false)
  const [view, setView] = useState<AnalysisView | null>(null)
  const previewUrlRef = useRef<string | null>(null)

  const releasePreview = () => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current)
      previewUrlRef.current = null
    }
  }

  useEffect(() => releasePreview, [])

  if (!stored) return null

  const excluded = isExcludedKind(kind)
  const analyze = async () => {
    setBusy(true)
    try {
      const outcome = await optimizeExistingMedia(stored, kind)
      releasePreview()
      const url =
        outcome.status === 'optimized'
          ? URL.createObjectURL(outcome.candidate.file)
          : null
      if (url) previewUrlRef.current = url
      setView({ result: outcome, url })
    } catch {
      releasePreview()
      setView({
        result: {
          status: 'error',
          message: 'The stored image could not be analyzed.',
        },
        url: null,
      })
    } finally {
      setBusy(false)
    }
  }

  const reset = () => {
    releasePreview()
    setView(null)
  }

  const note = excluded
    ? 'Hero images are excluded from optimization: original dimensions and quality are preserved by policy.'
    : !INLINE_MEDIA_ENABLED
      ? 'The optimizer applies to inline-stored images. This image is served from Firebase Storage, so there is nothing to shrink in the document.'
      : !stored.url.startsWith('data:image/') || stored.width <= 0 || stored.height <= 0
        ? 'Only an inline-stored image with known dimensions can be optimized here.'
        : null

  const box = displayBox(kind, stored)
  const result = view?.result ?? null
  const candidateUrl = view?.url ?? null

  return (
    <div
      id={id}
      className="flex flex-col gap-3 rounded-card border border-outline-variant bg-surface-container-low/40 p-4"
    >
      <div className="flex flex-col gap-1">
        <p className="font-label-caps text-label-caps uppercase tracking-wider text-secondary">
          Existing image optimizer
        </p>
        <p className="font-body-sm text-body-sm text-secondary">
          {note ??
            'Re-encode the stored image at a smaller size and compare it here. Nothing changes until you approve the candidate and save the form.'}
        </p>
      </div>

      {note ? null : busy ? (
        <div>
          <Button type="button" variant="outline" size="sm" isLoading disabled>
            Analyzing stored image…
          </Button>
        </div>
      ) : result === null ? (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => void analyze()}
          >
            Analyze stored image
          </Button>
        </div>
      ) : null}

      {result?.status === 'optimized' && candidateUrl ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-start gap-6">
            <figure className="flex flex-col gap-1.5">
              <figcaption className="font-label-sm text-label-sm text-secondary">
                Stored · {formatBytes(stored.size)}
              </figcaption>
              <img
                src={stored.url}
                alt="Stored image as it appears now"
                width={box.width}
                height={box.height}
                className="rounded-chip border border-outline-variant bg-white"
              />
            </figure>
            <figure className="flex flex-col gap-1.5">
              <figcaption className="font-label-sm text-label-sm text-secondary">
                Optimized · {formatBytes(result.candidate.size)}
              </figcaption>
              <img
                src={candidateUrl}
                alt="Optimized image candidate"
                width={box.width}
                height={box.height}
                className="rounded-chip border border-outline-variant bg-white"
              />
            </figure>
          </div>

          <p className="font-label-sm text-label-sm text-on-surface">
            {stored.width} × {stored.height} px → {result.candidate.width} ×{' '}
            {result.candidate.height} px · {formatBytes(stored.size)} →{' '}
            {formatBytes(result.candidate.size)} (
            {Math.max(1, Math.round((1 - result.candidate.size / stored.size) * 100))}%
            smaller) · PSNR{' '}
            {Number.isFinite(result.candidate.psnr)
              ? result.candidate.psnr.toFixed(1)
              : '∞'}{' '}
            dB (≥ {EXISTING_MEDIA_MIN_PSNR} dB required)
          </p>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              size="sm"
              disabled={disabled}
              onClick={() => onApprove(result.candidate)}
            >
              Use optimized image
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={reset}
            >
              Keep stored image
            </Button>
          </div>
          <p className="font-body-sm text-body-sm text-secondary">
            The stored image stays in the document until you approve a candidate
            and save the form.
          </p>
        </div>
      ) : result && result.status !== 'optimized' ? (
        <div className="flex flex-col gap-3">
          <p className="font-body-sm text-body-sm text-on-surface">{result.message}</p>
          <div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || busy}
              onClick={() => void analyze()}
            >
              Try again
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
