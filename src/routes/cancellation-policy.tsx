import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/cancellation-policy')({
  component: CancellationPolicyPage,
  head: () => ({
    meta: [
      { title: 'Cancellation Policy — OfficeNeed' },
      { name: 'description', content: 'Our order cancellation policy.' },
    ],
  }),
})

function CancellationPolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Navbar />
      <main className="flex-1 w-full py-16 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-light tracking-tight mb-12">Cancellation Policy</h1>
          
          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">Order Cancellation</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                You may cancel your order at any time before it has been processed for dispatch. Once an order has been dispatched, it cannot be cancelled. Please note that all products are non-returnable and non-exchangeable.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">How to Cancel</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                To cancel your order, please contact our customer support team immediately with your order number. You can reach us via:
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Email: support@officeneed.in</li>
                
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Refunds for Cancelled Orders</h2>
              <p className="text-muted-foreground leading-relaxed">
                If your order is successfully cancelled before dispatch, we will issue a refund to your original online payment method. Please allow 5-7 business days for the amount to reflect in your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Exceptions</h2>
              <p className="text-muted-foreground leading-relaxed">
                Custom, branded, or personalized orders cannot be cancelled once production has begun.
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
