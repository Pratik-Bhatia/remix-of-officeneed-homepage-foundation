import { createFileRoute, Link } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

const SITE = 'https://officeneed.store'
const TITLE = 'About Us — Officeneed'
const DESC = 'Officeneed brings corporate gifting, office stationery, computer peripherals and fragrances together under one supplier for businesses across India.'

export const Route = createFileRoute('/about-us')({
  component: AboutUsPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESC },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESC },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE}/about-us` },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: `${SITE}/about-us` }],
  }),
})

const capabilities = [
  { title: 'Corporate Gifting', text: 'Gift sets and hampers for employees, clients and events, with logo branding available on selected products.' },
  { title: 'Office Stationery', text: 'Everyday essentials such as notebooks, pens, files, folders and printing paper.' },
  { title: 'Computer Peripherals', text: 'Keyboards, mice and accessories from established brands for your workplace.' },
  { title: 'Fragrances', text: 'Perfumes and gift sets suited to personal use and corporate gifting.' },
]

function AboutUsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        <section className="py-20 px-6 max-w-7xl mx-auto">
          <h1 className="text-4xl md:text-5xl font-light mb-6 text-foreground tracking-tight">About Officeneed</h1>
          <p className="text-xl text-muted-foreground max-w-3xl font-light">One vendor for the products businesses buy every day — from office supplies to corporate gifts.</p>
        </section>

        <section className="py-16 px-6 max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-16">
          <div>
            <h2 className="text-2xl mb-4 text-foreground font-medium">Our Story</h2>
            <p className="text-muted-foreground leading-relaxed mb-4">Instead of managing separate vendors for corporate gifting, office stationery, computer peripherals and fragrances, Officeneed brings them together in one place.</p>
            <p className="text-muted-foreground leading-relaxed">Our goal is simple — to save businesses time and make buying for the workplace easier.</p>
          </div>
          <div>
            <h2 className="text-2xl mb-4 text-foreground font-medium">What We Do</h2>
            <p className="text-muted-foreground leading-relaxed">Customers can buy online with secure checkout and delivery across India. Registered business accounts can see corporate pricing, and teams can request quotes for bulk or branded orders.</p>
          </div>
        </section>

        <section className="py-16 px-6 max-w-7xl mx-auto">
          <h2 className="text-3xl mb-8 text-foreground font-medium text-center">What We Offer</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {capabilities.map((c) => (
              <div key={c.title} className="p-6 border border-border rounded-lg bg-background">
                <h3 className="text-lg font-medium mb-2">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="py-24 px-6 text-center">
          <h2 className="text-3xl font-light mb-6">Ready to elevate your workspace?</h2>
          <Link
            to="/contact-us"
            className="inline-block px-8 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Contact Our Team
          </Link>
        </section>
      </main>
      <Footer />
    </div>
  )
}
