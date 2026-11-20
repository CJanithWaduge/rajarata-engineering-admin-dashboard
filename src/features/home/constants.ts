import { isIconifyIconName } from '../../lib/iconify'
import type { ImageContentType } from './types'

/**
 * Fixed number of featured project cards on the Home page's "Featured
 * Engineering Projects" carousel. The public page renders this many static
 * cards, and the admin form edits all of them from `site/home`.
 */
export const CARD_COUNT = 9

/**
 * Minimum cards left visible on the Home carousel. The public layout shows
 * exactly three cards per row on desktop, so fewer than three would leave an
 * incomplete row and break the visual rhythm.
 */
export const MIN_VISIBLE_CARDS = 3

/** Fixed number of cards in the Home page's "Our Electrical Services" grid. */
export const HOME_SERVICE_COUNT = 3

/**
 * Material Symbols names the public Home grid can render. This is the union of
 * the icons already used by the build-time grid and the Services page
 * allowlist, so every option is present in the self-hosted icon subset.
 */
export const HOME_SERVICE_ICONS = [
  'home_repair_service',
  'precision_manufacturing',
  'assignment_turned_in',
  'build_circle',
  'lan',
  'bolt',
  'security',
  'electric_meter',
  'apartment',
  'developer_board',
  'linear_scale',
  'fact_check',
  'build',
  'router',
  'factory',
  'settings_ethernet',
] as const

export type HomeServiceIcon = (typeof HOME_SERVICE_ICONS)[number]

/** UI labels only; these are not site copy. */
export const HOME_SERVICE_ICON_OPTIONS = HOME_SERVICE_ICONS.map((value) => ({
  value,
  label: value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' '),
}))

/** Internal "Learn More" targets reachable from a Home service card. */
export const HOME_SERVICE_HREFS = [
  '/services#service-01',
  '/services#service-02',
  '/services#service-03',
  '/services#service-04',
  '/services#service-05',
  '/services#service-06',
  '/services#service-07',
  '/services#service-08',
] as const

export type HomeServiceHref = (typeof HOME_SERVICE_HREFS)[number]

export const HOME_SERVICE_LINK_OPTIONS = HOME_SERVICE_HREFS.map((value) => ({
  value,
  label: `Services · Service ${value.slice(-2)}`,
}))

export function isHomeServiceIcon(value: string): value is HomeServiceIcon {
  return (HOME_SERVICE_ICONS as readonly string[]).includes(value)
}

/**
 * A stored icon is either a curated name from the self-hosted subset or an
 * Iconify name picked from the internet search.
 */
export function isHomeServiceIconValue(value: string): boolean {
  return isHomeServiceIcon(value) || isIconifyIconName(value)
}

export function isHomeServiceHref(value: string): value is HomeServiceHref {
  return (HOME_SERVICE_HREFS as readonly string[]).includes(value)
}

export const HOME_SERVICE_TEXT_LIMITS = {
  title: 80,
  description: 320,
} as const

export const ALLOWED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'] as const

export const ALLOWED_CONTENT_TYPES: ImageContentType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

export const EXTENSION_BY_TYPE: Record<ImageContentType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export type ImageKind = 'hero' | 'card' | 'logo'

export type ImageRule = {
  label: string
  maxBytes: number
  maxBytesLabel: string
  minWidth: number
  minHeight: number
  maxWidth: number
  maxHeight: number
  minAspect: number
  maxAspect: number
  /** Human-readable ratio for the UI hint, e.g. `16:9`. */
  aspectLabel: string
}

/**
 * The single source of truth for image limits. Keep the byte limits in
 * `storage.rules` in sync when these change.
 */
export const IMAGE_RULES: Record<ImageKind, ImageRule> = {
  hero: {
    label: 'Hero image',
    maxBytes: 5 * 1024 * 1024,
    maxBytesLabel: '5 MB',
    minWidth: 1920,
    minHeight: 1080,
    maxWidth: 1920,
    maxHeight: 1080,
    minAspect: 16 / 9,
    maxAspect: 16 / 9,
    aspectLabel: '16:9',
  },
  card: {
    label: 'Project image',
    maxBytes: 3 * 1024 * 1024,
    maxBytesLabel: '3 MB',
    minWidth: 1200,
    minHeight: 800,
    maxWidth: 1200,
    maxHeight: 800,
    minAspect: 3 / 2,
    maxAspect: 3 / 2,
    aspectLabel: '3:2',
  },
  logo: {
    label: 'Logo image',
    maxBytes: 5 * 1024 * 1024,
    maxBytesLabel: '5 MB',
    minWidth: 1080,
    minHeight: 1080,
    maxWidth: 1080,
    maxHeight: 1080,
    minAspect: 1,
    maxAspect: 1,
    aspectLabel: '1:1',
  },
}

/**
 * Files above these limits are rejected before decoding so a very large source
 * cannot exhaust memory. Files above the per-kind byte limit are optimized
 * instead, provided they fit within these source caps.
 */
export const MAX_SOURCE_BYTES = 25 * 1024 * 1024
export const MAX_SOURCE_BYTES_LABEL = '25 MB'
export const MAX_SOURCE_PIXELS = 60_000_000
export const MAX_SOURCE_PIXELS_LABEL = '60 megapixels'

/**
 * One hint line for every image field, so the slot limits read the same on the
 * Home, About, Projects, and Settings pages.
 */
export function imageRuleHint(rule: ImageRule): string {
  return `Exactly ${rule.maxWidth} × ${rule.maxHeight} px (${rule.aspectLabel}) · JPEG, PNG or WebP · source up to ${MAX_SOURCE_BYTES_LABEL} · large files are optimized automatically.`
}

/**
 * Downscale ceiling for optimized uploads. The public cards render at roughly
 * 384 x 224 px, so these keep retina quality without storing camera-sized files.
 */
export const COMPRESSION_TARGETS: Record<ImageKind, { maxWidth: number; maxHeight: number }> = {
  hero: { maxWidth: 1920, maxHeight: 1080 },
  card: { maxWidth: 1200, maxHeight: 800 },
  logo: { maxWidth: 1080, maxHeight: 1080 },
}

/**
 * Photos above these sizes are downscaled/re-encoded even when they are under
 * the storage hard cap. A 4 MB hero is legal but slow to upload on a typical
 * connection, and the public page never renders it at that resolution.
 * Well-optimized files (for example a 1600x900 WebP under 200 KB) pass through
 * untouched.
 */
export const OPTIMIZE_ABOVE_BYTES: Record<ImageKind, number> = {
  hero: 600 * 1024,
  card: 400 * 1024,
  logo: 400 * 1024,
}

/** Tried in order until the encoded file fits the per-kind byte limit. */
export const COMPRESSION_QUALITIES = [0.82, 0.7, 0.58] as const

/**
 * Inline-media fallback used when Firebase Storage is not provisioned (for
 * example on the Spark plan). The encoded images are stored as data URLs inside
 * the `site/home` document, which Firestore caps at 1 MiB, so these limits are
 * deliberately much smaller than the Storage limits. The four worst-case data
 * URLs together are about 580 KB, leaving plenty of room for the card text.
 *
 * Phase 8A ceilings sized to how the public page actually renders: the logo
 * displays at ~40 CSS px (120 device px, so 384 is 3x oversampled) and the
 * cards at ~384 CSS px (1074 device px at 3x, covered by 1080 wide). The hero
 * keeps 1920 x 1080: it is the page's largest visual and stays untouched.
 * Aspect ratios are exact (384:384 = 1:1, 1080:720 = 3:2, 1920:1080 = 16:9).
 */
export const INLINE_IMAGE_TARGETS: Record<
  ImageKind,
  { maxWidth: number; maxHeight: number }
> = {
  hero: { maxWidth: 1920, maxHeight: 1080 },
  card: { maxWidth: 1080, maxHeight: 720 },
  logo: { maxWidth: 384, maxHeight: 384 },
}

export const INLINE_IMAGE_MAX_BYTES: Record<ImageKind, number> = {
  hero: 160 * 1024,
  card: 90 * 1024,
  logo: 90 * 1024,
}

export const INLINE_IMAGE_MAX_BYTES_LABEL: Record<ImageKind, string> = {
  hero: '160 KB',
  card: '90 KB',
  logo: '90 KB',
}

export const INLINE_COMPRESSION_QUALITIES = [0.7, 0.6, 0.5, 0.4, 0.3, 0.22] as const

/**
 * Existing-media optimizer (Phase 8A). A stored image is replaced only when a
 * candidate meets every guardrail at once:
 *
 * - `EXISTING_MEDIA_BYTE_TARGET` — the candidate must be at most 90% of the
 *   stored bytes, so an accepted image always shrinks the document.
 * - `EXISTING_MEDIA_MIN_PSNR` — display-scale PSNR (measured at the size the
 *   public page actually renders) must stay at or above 33 dB, so accepted
 *   images are visually indistinguishable at their on-page size.
 * - the per-kind inline byte cap still applies.
 *
 * When no candidate passes, the stored image is kept unchanged. The hero is
 * excluded from optimization entirely: its original dimensions and quality are
 * preserved by policy.
 */
export const EXISTING_MEDIA_BYTE_TARGET = 0.9

export const EXISTING_MEDIA_MIN_PSNR = 33

/** Tried in order (highest quality first) until a candidate passes. */
export const EXISTING_MEDIA_QUALITIES = [0.7, 0.65, 0.6, 0.55, 0.5] as const

/** Kinds the optimizer must never re-encode (Phase 8A approval). */
export const EXISTING_MEDIA_EXCLUDED_KINDS: readonly ImageKind[] = ['hero']

/**
 * Worst-case device-pixel width each slot is rendered at on the public page
 * (CSS px x device pixel ratio). PSNR is measured after scaling both images to
 * this width, which is what a visitor actually sees: logo 40 CSS px at 3x,
 * cards ~358 CSS px at 3x.
 */
export const EXISTING_MEDIA_DISPLAY_WIDTH: Record<ImageKind, number> = {
  hero: 1380,
  card: 1074,
  logo: 120,
}

/** Leaves headroom below Firestore's 1 MiB document limit. */
export const INLINE_MEDIA_DOC_BUDGET = 900_000



export const TEXT_LIMITS = {
  alt: 160,
  category: 40,
  venue: 80,
  topic: 90,
  tag: 40,
} as const

export const STORAGE_ROOTS = {
  hero: 'home/hero',
  projects: 'home/projects',
} as const
