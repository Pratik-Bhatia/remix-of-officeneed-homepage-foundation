import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/about-us')({
  component: AboutUsPage,
  head: () => ({
    meta: [
      { title: 'About Us — OfficeNeed' },
      { name: 'description', content: 'Learn about Officeneed, our story, and our B2B focus.' },
    ],
  }),
})

function AboutUsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        {/* Hero Section */}
        <section className="py-20 px-6 max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-light mb-6 text-foreground tracking-tight">About Officeneed</h1>
          <p className="text-xl text-muted-foreground max-w-3xl font-light">We are dedicated to providing premium workspace solutions for B2B clients, elevating the standard of modern corporate environments.</p>
        </section>

        {/* Our Story & What We Do */}
        <section className="py-16 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-2xl mb-4 text-foreground font-medium">Our Story</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">For over 20 years, we've helped businesses simplify procurement. Instead of managing multiple vendors for corporate gifting, printing, office supplies, IT hardware, furniture, and pantry essentials, Officeneed brings everything together under one trusted partner.</p>
            <p className="text-muted-foreground leading-relaxed">Our goal is simple—to save businesses time, reduce procurement hassles, and deliver reliable products and services that help teams work more efficiently.</p>
          </div>
          <div>
            <h2 className="text-2xl mb-4 text-foreground font-medium">What We Do</h2>
            <p className="text-muted-foreground leading-relaxed">With a reliable supply network and dedicated account managers, we help businesses save time, reduce costs, and focus on what matters most—growing their business.</p>
          </div>
        </section>

        {/* Why Officeneed */}
        <section className="py-16 px-6 max-w-7xl mx-auto bg-secondary/30 rounded-2xl my-10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl mb-6 text-foreground font-medium">Why Officeneed</h2>
            <p className="text-muted-foreground leading-relaxed mb-8">We combine uncompromising quality with a seamless procurement process. Our dedicated account managers ensure your business receives priority support, competitive pricing, and curated catalogs.</p>
          </div>
        </section>

        {/* Our Capabilities */}
        <section className="py-16 px-6 max-w-7xl mx-auto">
          <h2 className="text-3xl mb-8 text-foreground font-medium text-center">Our Capabilities</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
             {['Bulk Procurement', 'Custom Solutions', 'Dedicated Support', 'Fast Fulfillment'].map((capability, idx) => (
                <div key={idx} className="p-6 border border-border rounded-lg bg-background">
                   <h3 className="text-lg font-medium mb-2">{capability}</h3>
                   <p className="text-sm text-muted-foreground">Expertly managed services tailored for corporate efficiency.</p>
                </div>
             ))}
          </div>
        </section>

        {/* CTA */}
        <section className="py-24 px-6 text-center">
          <h2 className="text-3xl font-light mb-6">Ready to elevate your workspace?</h2>
          <button className="px-8 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Contact Our Team
          </button>
        </section>
      </main>
      <Footer />
    </div>
  )
}
