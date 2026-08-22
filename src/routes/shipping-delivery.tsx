import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/shipping-delivery')({
  component: ShippingDeliveryPage,
  head: () => ({
    meta: [
      { title: 'Shipping & Delivery — OfficeNeed' },
      { name: 'description', content: 'We currently ship across India only. Orders are dispatched within 24 hours.' },
      { property: 'og:title', content: 'Shipping & Delivery — OfficeNeed' },
      { property: 'og:description', content: 'We currently ship across India only. Orders are dispatched within 24 hours.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
})

function ShippingDeliveryPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Navbar />
      <main className="flex-1 w-full py-16 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-light tracking-tight mb-12">Shipping & Delivery</h1>

          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">Shipping Coverage</h2>
              <p className="text-muted-foreground leading-relaxed">
                We currently ship across India only. International shipping is not available at this time.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Dispatch Time</h2>
              <p className="text-muted-foreground leading-relaxed">
                Orders are dispatched within 24 hours of placing your order. Custom-branded orders are dispatched after
                artwork approval and production, as confirmed on your order or quotation.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Shipping Charges</h2>
              <p className="text-muted-foreground leading-relaxed">
                Applicable shipping charges for your order are calculated and displayed before payment.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Shipment Confirmation & Order Tracking</h2>
              <p className="text-muted-foreground leading-relaxed">
                You will receive a shipment confirmation with tracking details once your order has been dispatched.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Damages in Transit</h2>
              <p className="text-muted-foreground leading-relaxed">
                Please inspect your shipment on delivery and report any transit damage or discrepancy in writing within
                48 hours so we can take it up with our logistics partner.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
