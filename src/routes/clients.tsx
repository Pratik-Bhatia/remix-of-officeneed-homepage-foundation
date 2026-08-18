import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/clients')({
  component: ClientsPage,
  head: () => ({
    meta: [
      { title: 'Our Clients — OfficeNeed' },
      { name: 'description', content: 'See the businesses that trust Officeneed.' },
    ],
  }),
})

function ClientsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        <section className="py-20 px-6 max-w-7xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-light mb-6 text-foreground tracking-tight">Trusted by Industry Leaders</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto font-light">We are proud to partner with forward-thinking businesses, providing them with the premium workspace solutions they need to thrive.</p>
        </section>
        
        <section className="py-16 px-6 max-w-7xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="aspect-[3/2] bg-secondary rounded-lg flex items-center justify-center text-muted-foreground text-sm border border-border/50">
                Client Logo
              </div>
            ))}
          </div>
        </section>

        <section className="py-24 px-6 max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-medium mb-4">Join our network of B2B partners</h2>
          <p className="text-muted-foreground mb-8">Discover how Officeneed can streamline your corporate procurement process.</p>
          <button className="px-8 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity">
            Become a Client
          </button>
        </section>
      </main>
      <Footer />
    </div>
  )
}
