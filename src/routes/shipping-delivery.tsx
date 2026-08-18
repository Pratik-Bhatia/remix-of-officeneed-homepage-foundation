import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/shipping-delivery')({
  component: ShippingDeliveryPage,
  head: () => ({
    meta: [
      { title: 'Shipping & Delivery — OfficeNeed' },
      { name: 'description', content: 'Information about our shipping and delivery processes.' },
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
              <h2 className="text-2xl font-medium mb-4">Processing Time</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for processing time policy. Explain how long it takes to process an order before it ships. E.g., All orders are processed within 1-2 business days. Orders are not shipped or delivered on weekends or holidays.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Shipping Rates & Delivery Estimates</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                [Placeholder for shipping rates. Mention that shipping charges for your order will be calculated and displayed at checkout.]
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>Standard Shipping: [E.g., 3-5 business days]</li>
                <li>Expedited Shipping: [E.g., 1-2 business days]</li>
                <li>International Shipping: [E.g., 7-14 business days]</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Shipment Confirmation & Order Tracking</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for tracking information. Explain that customers will receive a Shipment Confirmation email once their order has shipped containing their tracking number(s).]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Damages</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for damages policy. State that OfficeNeed is not liable for any products damaged or lost during shipping. If you received your order damaged, please contact the shipment carrier to file a claim.]
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
