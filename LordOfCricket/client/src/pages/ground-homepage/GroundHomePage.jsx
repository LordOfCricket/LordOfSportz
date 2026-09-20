import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Star } from 'lucide-react'
import { useSeoMeta } from '../../hooks/useSeoMeta.js'
import { useJsonLd } from '../../hooks/useJsonLd.js'
import Navbar from '../../components/home/Navbar.jsx'
import Hero from '../../components/home/Hero.jsx'
import SiteFooter from '../../components/home/SiteFooter.jsx'
import MatchActivitySection from '../../components/homepage/MatchActivitySection.jsx'
import AmenityCatalogGrid from '../../components/common/AmenityCatalogGrid.jsx'
import BookingModal from '../../components/booking/BookingModal.jsx'
import PublicAvailabilityPreview from '../../components/booking/PublicAvailabilityPreview.jsx'
import { MouseParallaxProvider } from '../../context/MouseParallaxContext.jsx'
import ScrollReveal from '../../components/common/ScrollReveal.jsx'
import GroundAbout from '../../components/ground/GroundAbout.jsx'
import FollowButton from '../../components/common/FollowButton.jsx'
import ShareButton from '../../components/common/ShareButton.jsx'
import LocationMap from '../../components/ground/LocationMap.jsx'
import GroundNotFound from '../../components/ground/GroundNotFound.jsx'
import GalleryModal from '../../components/ground/GalleryModal.jsx'
import UpcomingFixtures from '../../components/homepage/UpcomingFixtures.jsx'
import RecentResults from '../../components/homepage/RecentResults.jsx'
import { useGround } from '../../hooks/useGround.js'
import { fadeUpSoft, spotlightReveal } from '../../lib/revealVariants.js'

function PageLoading() {
  return (
    <div className="loc-page flex min-h-screen items-center justify-center" role="status" aria-label="Loading ground">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-loc-border border-t-loc-green" />
    </div>
  )
}

function PageError({ message, onRetry }) {
  return (
    <div className="loc-page flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="text-red-600">{message}</p>
      <button type="button" onClick={onRetry} className="loc-btn">
        Retry
      </button>
    </div>
  )
}

function SectionHead({ eyebrow, title, subtitle }) {
  return (
    <ScrollReveal variant={fadeUpSoft} amount={0.3} className="mb-10 flex flex-col items-center gap-3 text-center">
      {eyebrow && <span className="loc-eyebrow">{eyebrow}</span>}
      <h2 className="loc-heading text-4xl sm:text-5xl">{title}</h2>
      {subtitle && <p className="max-w-2xl text-lg text-loc-muted">{subtitle}</p>}
    </ScrollReveal>
  )
}

export default function GroundHomePage() {
  const { publicGroundId } = useParams()
  const { ground, loading, error, notFound, retry } = useGround(publicGroundId)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)

  const heroPhoto = ground?.photos?.find((p) => p.isFeatured) || ground?.photos?.[0]
  const location = ground ? [ground.city, ground.state].filter(Boolean).join(', ') : ''
  useSeoMeta({
    title: ground ? `${ground.name}${location ? ` — ${location}` : ''} | Lord Of Cricket` : 'Lord Of Cricket',
    description: ground
      ? (ground.description?.trim() || `Book ${ground.name}${location ? ` in ${location}` : ''} on Lord Of Cricket — view photos, amenities, and availability.`).slice(0, 300)
      : undefined,
    canonical: ground ? `${window.location.origin}/grounds/${ground.publicGroundId}` : undefined,
    ogImage: heroPhoto?.imageUrl,
  })

  // Phase 12 — SportsActivityLocation + BreadcrumbList, built only from
  // fields the ground profile API actually returned for THIS ground; a
  // field is omitted from the schema entirely rather than filled with a
  // placeholder when the ground doesn't have it (no fabricated address/
  // phone/rating/review data). Phase 13 — aggregateRating now included, but
  // ONLY when ratingCount > 0: a ground with zero reviews has no rating to
  // honestly report, so the field is omitted entirely rather than a fake
  // "0 stars" (same honest-absence convention as the visible rating badge
  // above and Google's own guidance against a zero/placeholder aggregateRating).
  useJsonLd(
    ground && {
      '@context': 'https://schema.org',
      '@type': 'SportsActivityLocation',
      name: ground.name,
      ...(ground.description ? { description: ground.description } : {}),
      url: `${window.location.origin}/grounds/${ground.publicGroundId}`,
      ...(heroPhoto?.imageUrl ? { image: heroPhoto.imageUrl } : {}),
      ...(ground.phone ? { telephone: ground.phone } : {}),
      ...(ground.addressLine || ground.city
        ? {
            address: {
              '@type': 'PostalAddress',
              ...(ground.addressLine ? { streetAddress: ground.addressLine } : {}),
              ...(ground.city ? { addressLocality: ground.city } : {}),
              ...(ground.state ? { addressRegion: ground.state } : {}),
              ...(ground.postalCode ? { postalCode: ground.postalCode } : {}),
              ...(ground.country ? { addressCountry: ground.country } : {}),
            },
          }
        : {}),
      ...(ground.latitude != null && ground.longitude != null
        ? { geo: { '@type': 'GeoCoordinates', latitude: ground.latitude, longitude: ground.longitude } }
        : {}),
      ...(ground.ratingCount > 0
        ? {
            aggregateRating: {
              '@type': 'AggregateRating',
              ratingValue: ground.ratingAvg,
              reviewCount: ground.ratingCount,
            },
          }
        : {}),
    },
  )
  useJsonLd(
    ground && {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: window.location.origin },
        { '@type': 'ListItem', position: 2, name: 'Grounds', item: `${window.location.origin}/grounds` },
        { '@type': 'ListItem', position: 3, name: ground.name, item: `${window.location.origin}/grounds/${ground.publicGroundId}` },
      ],
    },
  )

  if (loading) return <PageLoading />
  if (notFound) return <GroundNotFound />
  if (error) return <PageError message={error} onRetry={retry} />
  if (!ground) return null

  return (
    <div id="home" className="loc-page relative isolate overflow-x-hidden">
      {/* Hero — the one deliberate dark cinematic band; 3D scene + parallax
          preserved. Everything below it is the LOC light theme. */}
      <MouseParallaxProvider>
        <Navbar theme="light" />
        <Hero ground={ground} onViewGallery={() => setGalleryOpen(true)} onBook={() => setBookingOpen(true)} />
      </MouseParallaxProvider>

      {/* ABOUT THE GROUND */}
      <section className="w-full bg-loc-surface px-6 py-12 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <ScrollReveal variant={fadeUpSoft} amount={0.3} className="mb-10 flex flex-col items-center gap-3 text-center">
            <span className="loc-eyebrow">The Story</span>
            <h2 className="loc-heading text-4xl sm:text-5xl lg:text-6xl">
              About <span className="text-loc-green">{ground.name}</span>
            </h2>
            <p className="flex items-center gap-2 text-sm font-semibold">
              {ground.ratingAvg !== null && ground.ratingAvg !== undefined ? (
                <>
                  <Star className="h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-hidden="true" />
                  <span className="text-loc-navy">{ground.ratingAvg.toFixed(1)}</span>
                  <span className="text-loc-faint">
                    ({ground.ratingCount} {ground.ratingCount === 1 ? 'review' : 'reviews'})
                  </span>
                </>
              ) : (
                <span className="text-loc-faint">No reviews yet</span>
              )}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <FollowButton type="ground" id={ground.publicGroundId} />
              <ShareButton
                title={ground.name}
                text={`${ground.name}${location ? ` — ${location}` : ''} on Lord Of Cricket`}
                path={`/grounds/${ground.publicGroundId}`}
              />
            </div>
          </ScrollReveal>
          <div className="flex justify-center">
            <GroundAbout ground={ground} />
          </div>
        </div>
      </section>

      {/* CANTEEN — customer entry point, only when this ground has a canteen */}
      {ground.canteens?.length > 0 && (
        <section className="w-full bg-loc-mint px-6 py-12 lg:py-16">
          <div className="mx-auto max-w-4xl text-center">
            <SectionHead eyebrow="Refreshments" title="Canteen" subtitle="Order food and refreshments for pickup at the ground" />
            <div className="flex flex-wrap items-center justify-center gap-4">
              {ground.canteens.map((canteen) =>
                canteen.isActive ? (
                  <Link
                    key={canteen.publicCanteenId}
                    to={`/grounds/${ground.publicGroundId}/canteen/${canteen.publicCanteenId}/menu`}
                    className="loc-btn uppercase tracking-wide"
                  >
                    {ground.canteens.length > 1 ? `Order from ${canteen.name}` : 'Order Food'}
                  </Link>
                ) : (
                  <span
                    key={canteen.publicCanteenId}
                    className="rounded-full border border-loc-border px-8 py-3 text-sm font-semibold text-loc-faint"
                  >
                    {canteen.name} — Currently closed
                  </span>
                ),
              )}
            </div>
          </div>
        </section>
      )}

      {/* AMENITIES */}
      <section className="w-full bg-loc-surface px-6 py-12 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <SectionHead title="Amenities" subtitle="Everything you need for a perfect day at the ground" />
          <div className="flex justify-center">
            {ground.amenityCatalog?.length > 0 || ground.amenities?.length > 0 ? (
              <AmenityCatalogGrid amenities={ground.amenityCatalog?.length > 0 ? ground.amenityCatalog : ground.amenities} light />
            ) : (
              <p className="text-loc-muted">No amenities added yet</p>
            )}
          </div>
        </div>
      </section>

      {/* UPCOMING MATCHES */}
      <section className="w-full bg-loc-mint px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <div id="matches" className="mb-16 w-full">
            <MatchActivitySection />
          </div>
          <SectionHead title="Upcoming Matches" subtitle="Fixtures scheduled for today and tomorrow" />
          <div className="w-full">
            <UpcomingFixtures groundId={ground.id} />
          </div>
        </div>
      </section>

      {/* RECENT RESULTS */}
      <section className="w-full bg-loc-surface px-6 py-20 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <SectionHead title="Recent Results" subtitle="Past matches and final scores" />
          <div className="w-full">
            <RecentResults groundId={ground.id} />
          </div>
        </div>
      </section>

      {/* PRICING — only when this ground has active pricing configured */}
      {ground.pricingSlots?.length > 0 && (
        <section className="w-full bg-loc-mint px-6 py-12 lg:py-16">
          <div className="mx-auto max-w-4xl text-center">
            <SectionHead eyebrow="Rates" title="Pricing" subtitle="Time slot rates for booking this ground" />
            <div className="flex flex-wrap items-center justify-center gap-4">
              {ground.pricingSlots.map((slot) => (
                <div key={`${slot.startTime}-${slot.endTime}`} className="loc-card px-6 py-4">
                  <p className="text-sm text-loc-muted">
                    {slot.startTime.slice(0, 5)} – {slot.endTime.slice(0, 5)}
                  </p>
                  <p className="mt-1 text-2xl font-bold text-loc-green">₹{slot.price.toLocaleString('en-IN')}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* BOOKING + LOCATION */}
      <section id="booking" className="w-full bg-loc-surface px-6 py-12 lg:py-16">
        <div className="mx-auto max-w-7xl">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-2">
            <div className="flex flex-col justify-start lg:pr-6">
              <ScrollReveal variant={spotlightReveal} amount={0.3} className="flex h-full flex-col space-y-6">
                <div className="space-y-3">
                  <h2 className="loc-heading text-4xl sm:text-5xl">Check Availability &amp; Book</h2>
                  <p className="text-lg text-loc-muted">Reserve your pitch, nets, or the entire ground for your next match</p>
                </div>
                <div className="loc-card flex flex-col space-y-3 p-5">
                  <PublicAvailabilityPreview publicGroundId={ground.publicGroundId} light />
                  <button type="button" onClick={() => setBookingOpen(true)} className="loc-btn w-full uppercase tracking-wide">
                    Book {ground.name}
                  </button>
                </div>
              </ScrollReveal>
            </div>

            <div className="flex flex-col justify-start lg:border-l lg:border-loc-border lg:pl-6">
              <ScrollReveal variant={spotlightReveal} amount={0.3} className="flex h-full flex-col space-y-6">
                <div className="space-y-3">
                  <h2 className="loc-heading text-4xl sm:text-5xl">Location</h2>
                  <p className="text-lg text-loc-muted">Find us and get directions</p>
                </div>
                <div className="loc-card flex flex-1 flex-col p-5">
                  <LocationMap ground={ground} light />
                </div>
              </ScrollReveal>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter theme="light" />

      <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} publicGroundId={ground.publicGroundId} />
      <GalleryModal open={galleryOpen} onClose={() => setGalleryOpen(false)} photos={ground.photos} groundName={ground.name} />
    </div>
  )
}
