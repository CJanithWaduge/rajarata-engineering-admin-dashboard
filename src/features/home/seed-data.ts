import type { CardDraft, HomeContent, HomeDraft } from './types'

/**
 * Build-time copy from the public site's Home ServicesGrid and ProjectsSection
 * components, written verbatim so seeding recreates the live page.
 * Keep this in sync with `rajarata-engineering-public-site/src/components/home/ServicesGrid.astro`
 * and with the public site's standalone `featuredHomeProjects` array (the
 * nine featured cards on the Home page's carousel).
 *
 * Project copy is seeded without inventing image URLs. Existing uploaded
 * images are retained; otherwise the public site's fallback artwork remains.
 */
export const SEED_HOME_SERVICES: HomeContent['featuredServices'] = [
  {
    icon: 'home_repair_service',
    title: 'Residential, Commercial & Industrial Electrical Installations',
    description:
      'Complete electrical wiring, power distribution, and installation for homes, offices, commercial buildings, and industrial facilities with high safety standards.',
    href: '/services#service-01',
  },
  {
    icon: 'security',
    title: 'CCTV Camera Installation & Maintenance',
    description:
      'Professional security camera setup, advanced surveillance configuration, and regular maintenance to ensure maximum protection for your premises.',
    href: '/services#service-07',
  },
  {
    icon: 'electric_meter',
    title: 'MDB / SMDB Panel Installation',
    description:
      'Expert installation, wiring, and configuration of Main Distribution Boards (MDB) and Sub Main Distribution Boards (SMDB) for reliable and efficient power control.',
    href: '/services#service-03',
  },
]

const SEED_HOME_PROJECTS: Array<Omit<CardDraft, 'image'>> = [
  {
    alt: 'Rajarata Engineering technicians installing a CCTV security camera on a building wall',
    category: 'Security Systems',
    venue: 'Pubudupura, Anuradhapura',
    topic: 'CCTV Security Systems & Installations',
    tag: 'ELV',
  },
  {
    alt: 'Rajarata Engineering technicians working on indoor electrical wiring and wall socket installations in a house',
    category: 'Residential',
    venue: 'Kuruduwatta, Colombo',
    topic: 'Indoor Electrical Wiring & Installations',
    tag: 'LV',
  },
  {
    alt: 'Rajarata Engineering technicians wearing safety harnesses while installing solar panels on a rooftop',
    category: 'Commercial',
    venue: 'Wijayapura, Anuradhapura',
    topic: 'Solar Power Systems & Installations',
    tag: 'Renewable',
  },
  {
    alt: 'MV/LV distribution boards, cable trays and cable laying inside an industrial facility',
    category: 'Industrial',
    venue: 'Anuradhapura, Sri Lanka',
    topic: 'Industrial Power Distribution & Installation',
    tag: 'HV/LV',
  },
  {
    alt: 'Main and sub-main distribution board installation for a commercial building',
    category: 'Commercial',
    venue: 'Anuradhapura, Sri Lanka',
    topic: 'Commercial Panel & Distribution Work',
    tag: 'MDB Panels',
  },
  {
    alt: 'Structured cabling, containment and low-voltage control equipment for building automation',
    category: 'ELV Solutions',
    venue: 'Anuradhapura, Sri Lanka',
    topic: 'ELV & Building Automation Systems',
    tag: 'Automation',
  },
  {
    alt: 'House wiring, distribution board and power point installation for a residential building',
    category: 'Residential',
    venue: 'Anuradhapura, Sri Lanka',
    topic: 'Residential & Commercial Wiring',
    tag: 'Smart Power',
  },
  {
    alt: 'Air terminals, down conductors and earthing installed for lightning and surge protection',
    category: 'Lightning Protection',
    venue: 'Anuradhapura, Sri Lanka',
    topic: 'Lightning & Surge Protection Systems',
    tag: 'Surge Safe',
  },
  {
    alt: 'Electrical testing and commissioning checks on a completed installation',
    category: 'Testing & Commissioning',
    venue: 'Anuradhapura, Sri Lanka',
    topic: 'Electrical Testing & Commissioning',
    tag: 'Inspection',
  },
]

function storedOrNone(image: HomeContent['hero'] | undefined) {
  return image?.url ? { kind: 'stored' as const, image } : { kind: 'none' as const }
}

/** Builds seeded Home copy while retaining any existing hero/project images. */
export function seedHomeDraft(previous: HomeContent | null = null): HomeDraft {
  return {
    hero: {
      image: storedOrNone(previous?.hero),
      alt: previous?.hero?.alt ?? '',
    },
    cards: SEED_HOME_PROJECTS.map((project, index) => {
      const previousImage = previous?.featuredProjects?.[index]?.image
      return {
        image: storedOrNone(previousImage),
        alt: previousImage?.url ? previousImage.alt || project.alt : project.alt,
        category: project.category,
        venue: project.venue,
        topic: project.topic,
        tag: project.tag,
        visible: true,
      }
    }),
    services: SEED_HOME_SERVICES,
  }
}
