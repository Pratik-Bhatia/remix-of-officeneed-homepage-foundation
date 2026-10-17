import { useRef, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { FieldError } from '@/components/ui/field-error'
import { Loader2, PackageSearch, AlertCircle, CheckCircle2 } from 'lucide-react'
import {
  trackOrder,
  sortTrackingEvents,
  type TrackingOutcome,
  type ShiplysticShipment,
} from '@/lib/shiplystic.functions'

const SITE = 'https://officeneed.store'
const TITLE = 'Track Your Order — Officeneed'
const DESC = 'Track your Officeneed shipment in real time using your Order ID, AWB, or tracking number — no sign-in required.'

export const Route = createFileRoute('/track-order')({
  component: TrackOrderPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESC },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESC },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE}/track-order` },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: `${SITE}/track-order` }],
  }),
})

// Mirrors shiplystic.functions.ts's parseIdentifier rules, for instant
// client-side feedback -- the server re-validates authoritatively.
const IDENTIFIER_PATTERN = /^[A-Za-z0-9#\-_/]+$/
const MAX_IDENTIFIER_LENGTH = 64

function apiErrorMessage(outcome: TrackingOutcome): string {
  switch (outcome.state) {
    case 'rate_limited':
      return "You've checked a lot of shipments in a short time. Please wait a minute and try again."
    case 'timeout':
      return "That's taking longer than expected. Please try again in a moment."
    case 'invalid_input':
      // Unreachable in normal use (the form validates the same rules
      // before ever calling the server) -- kept as a graceful fallback
      // rather than rendering nothing if it's ever reached some other way.
      return 'Please enter a valid Order ID, AWB, or tracking number.'
    default:
      return "We couldn't reach the tracking service right now. Please try again shortly."
  }
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value ?? '—'}</dd>
    </div>
  )
}

function ResultCard({ shipment, query }: { shipment: ShiplysticShipment; query?: string }) {
  const events = sortTrackingEvents(shipment.events)
  const reference =
    shipment.waybill ?? shipment.awb ?? shipment.trackingNumber ?? shipment.orderId ?? shipment.enteredOrderId ?? query ?? '—'
  return (
    <div role="status" className="rounded-md border border-border bg-secondary/40 p-6 text-left space-y-6">
      <div className="flex items-center gap-3">
        <CheckCircle2 className="size-5 text-foreground" strokeWidth={1.6} />
        <div>
          <p className="text-sm font-medium text-foreground">Shipment found</p>
          <p className="text-xs text-muted-foreground">Reference: {reference}</p>
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Field label="Status" value={shipment.currentStatus ?? shipment.orderStatus} />
        <Field label="Courier" value={shipment.courier} />
        <Field label="Current location" value={shipment.currentLocation} />
        <Field label="Pickup city" value={shipment.pickupCity} />
        <Field label="Delivery city" value={shipment.deliveryCity} />
      </dl>
      {events.length > 0 ? (
        <div>
          <h2 className="text-sm font-medium text-foreground mb-3">Tracking history</h2>
          <ol className="space-y-4 border-l border-border pl-4">
            {events.map((ev, i) => (
              <li key={i} className="relative">
                <span className="absolute -left-[21px] top-1 size-2 rounded-full bg-foreground/60" />
                <p className="text-sm text-foreground">
                  {ev.status ?? 'Update'}
                  {ev.subStatus ? ` — ${ev.subStatus}` : ''}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[ev.city, ev.state].filter(Boolean).join(', ') || ev.location || '—'}
                  {ev.eventTime && !Number.isNaN(Date.parse(ev.eventTime))
                    ? ` · ${new Date(ev.eventTime).toLocaleString('en-IN')}`
                    : ''}
                </p>
                {ev.message ? <p className="text-xs text-muted-foreground mt-0.5">{ev.message}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No tracking events are available yet.</p>
      )}
    </div>
  )
}

function NoResultsCard({ query, onRetry }: { query?: string; onRetry: () => void }) {
  return (
    <div role="alert" className="rounded-md border border-border bg-secondary/40 p-6 text-center space-y-3">
      <PackageSearch className="size-6 mx-auto text-muted-foreground" strokeWidth={1.5} />
      <p className="text-sm font-medium text-foreground">We couldn't find a shipment matching "{query}".</p>
      <p className="text-sm text-muted-foreground">Please double-check your Order ID, AWB, or tracking number and try again.</p>
      <Button type="button" variant="outline" className="rounded-full" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function ApiErrorCard({ message, onRetry, busy }: { message: string; onRetry: () => void; busy: boolean }) {
  return (
    <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 p-6 text-center space-y-3">
      <AlertCircle className="size-6 mx-auto text-destructive" strokeWidth={1.5} />
      <p className="text-sm text-destructive">{message}</p>
      <Button type="button" variant="outline" disabled={busy} className="rounded-full" onClick={onRetry}>
        {busy ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
        Retry
      </Button>
    </div>
  )
}

function TrackOrderPage() {
  const inputRef = useRef<HTMLInputElement>(null)
  const [identifier, setIdentifier] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [outcome, setOutcome] = useState<TrackingOutcome | null>(null)

  const runTrack = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setValidationError('Please enter an Order ID, AWB, or tracking number.')
      inputRef.current?.focus()
      return
    }
    if (trimmed.length > MAX_IDENTIFIER_LENGTH) {
      setValidationError('That looks too long for an order ID, AWB, or tracking number.')
      inputRef.current?.focus()
      return
    }
    if (!IDENTIFIER_PATTERN.test(trimmed)) {
      setValidationError('Please use only letters, numbers, and the symbols # - _ /')
      inputRef.current?.focus()
      return
    }
    setValidationError(null)
    setLoading(true)
    setOutcome(null)
    try {
      setOutcome(await trackOrder({ data: { identifier: trimmed } }))
    } catch {
      setOutcome({ state: 'network_error' })
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    void runTrack(identifier)
  }
  const onRetry = () => void runTrack(identifier)

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        <section className="pt-24 pb-4 px-6 max-w-2xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-light mb-4 text-foreground tracking-tight">Track your order</h1>
          <p className="text-base text-muted-foreground font-light max-w-md mx-auto">
            Enter your Order ID, AWB number, or tracking number to see its latest status — right here, no sign-in required.
          </p>
        </section>

        <section className="pb-6 px-6 max-w-xl mx-auto">
          <form onSubmit={onSubmit} noValidate className="space-y-3 text-left">
            <div className="space-y-2">
              <Label htmlFor="track-identifier">Order ID, AWB, or tracking number</Label>
              <Input
                id="track-identifier"
                ref={inputRef}
                name="identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                maxLength={MAX_IDENTIFIER_LENGTH}
                autoComplete="off"
                placeholder="e.g. OFN12345 or 1234567890"
                aria-invalid={validationError ? true : undefined}
                aria-describedby={validationError ? 'track-identifier-error' : undefined}
              />
              {validationError ? <FieldError id="track-identifier-error" message={validationError} /> : null}
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-full">
              {loading ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
              {loading ? 'Tracking…' : 'Track order'}
            </Button>
          </form>
        </section>

        <section className="pb-24 px-6 max-w-xl mx-auto" aria-live="polite">
          {outcome?.state === 'found' && <ResultCard shipment={outcome.shipment} query={outcome.query} />}
          {outcome?.state === 'not_found' && <NoResultsCard query={outcome.query} onRetry={onRetry} />}
          {outcome && outcome.state !== 'found' && outcome.state !== 'not_found' && (
            <ApiErrorCard message={apiErrorMessage(outcome)} onRetry={onRetry} busy={loading} />
          )}
        </section>
      </main>
      <Footer />
    </div>
  )
}
