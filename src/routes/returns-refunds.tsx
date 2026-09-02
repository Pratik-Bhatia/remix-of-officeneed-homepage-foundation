import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/returns-refunds')({
  component: ReturnsRefundsPage,
  head: () => ({
    meta: [
      { title: 'Returns, Exchanges & Replacements ? OfficeNeed' },
      { name: 'description', content: 'OfficeNeed has a strict no return, no exchange, and no replacement policy.' },
      { property: 'og:title', content: 'Returns, Exchanges & Replacements ? OfficeNeed' },
      { property: 'og:description', content: 'OfficeNeed has a strict no return, no exchange, and no replacement policy.' },
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
          <h1 className="text-4xl font-light tracking-tight mb-12">Returns, Exchanges & Replacements</h1>

          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">No Returns or Exchanges</h2>
              <p className="text-muted-foreground leading-relaxed">
                All products sold by OfficeNeed are strictly non-returnable and non-exchangeable under any circumstances. We do not accept returns or offer exchanges on any product.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">No Replacements</h2>
              <p className="text-muted-foreground leading-relaxed">
                We have a strict no replacement policy under any circumstances. Once an order has been successfully delivered, it is final. We do not provide replacements for any reason.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                For any questions about this policy, contact us at contact@officeneed.in.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
