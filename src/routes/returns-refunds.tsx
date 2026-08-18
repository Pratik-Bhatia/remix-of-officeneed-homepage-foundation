import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/returns-refunds')({
  component: ReturnsRefundsPage,
  head: () => ({
    meta: [
      { title: 'Returns & Refunds — OfficeNeed' },
      { name: 'description', content: 'Our return and refund policy.' },
    ],
  }),
})

function ReturnsRefundsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Navbar />
      <main className="flex-1 w-full py-16 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-light tracking-tight mb-12">Returns & Refunds</h1>
          
          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">Return Policy</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                [Placeholder for return window. E.g., You have 30 calendar days to return an item from the date you received it.]
              </p>
              <p className="text-muted-foreground leading-relaxed">
                [Explain the conditions for a return. E.g., To be eligible for a return, your item must be unused and in the same condition that you received it. Your item must be in the original packaging. Your item needs to have the receipt or proof of purchase.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Refunds</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                [Placeholder for refund process. E.g., Once we receive your item, we will inspect it and notify you that we have received your returned item. We will immediately notify you on the status of your refund after inspecting the item.]
              </p>
              <p className="text-muted-foreground leading-relaxed">
                [Explain when and how they receive the refund. E.g., If your return is approved, we will initiate a refund to your credit card (or original method of payment). You will receive the credit within a certain amount of days, depending on your card issuer's policies.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Shipping Returns</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for return shipping costs. E.g., You will be responsible for paying for your own shipping costs for returning your item. Shipping costs are non-refundable. If you receive a refund, the cost of return shipping will be deducted from your refund.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Contact Us</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Provide contact information for returns. E.g., If you have any questions on how to return your item to us, contact us at returns@officeneed.com.]
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
