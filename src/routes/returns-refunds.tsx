import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/returns-refunds')({
  component: ReturnsRefundsPage,
  head: () => ({
    meta: [
      { title: 'Returns & Exchanges — OfficeNeed' },
      { name: 'description', content: 'All products are non-returnable and non-exchangeable.' },
      { property: 'og:title', content: 'Returns & Exchanges — OfficeNeed' },
      { property: 'og:description', content: 'All products are non-returnable and non-exchangeable.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary' },
    ],
  }),
})

function ReturnsRefundsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Navbar />
      <main className="flex-1 w-full py-16 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-light tracking-tight mb-12">Returns & Exchanges</h1>

          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">No Returns</h2>
              <p className="text-muted-foreground leading-relaxed">
                All products sold by OfficeNeed are non-returnable. We do not accept returns on any product.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">No Exchanges</h2>
              <p className="text-muted-foreground leading-relaxed">
                All products are non-exchangeable. We do not offer exchanges on any product.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Damaged or Defective Goods</h2>
              <p className="text-muted-foreground leading-relaxed">
                Please inspect your shipment on delivery. Transit damage, quantity discrepancies, or manufacturing
                defects must be reported in writing within 48 hours of delivery, and will be handled as required under
                applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                For any questions about this policy, contact us at support@officeneed.in.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
