import { createFileRoute, Link } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'
import { Mail } from 'lucide-react'
import { contactConfig } from '@/config/contact'

export const Route = createFileRoute('/contact-us')({
  component: ContactUsPage,
  head: () => ({
    meta: [
      { title: 'Contact Us — OfficeNeed' },
      { name: 'description', content: 'Get in touch with Officeneed.' },
    ],
  }),
})

function ContactUsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full flex items-center">
        <div className="w-full">
          <section className="pt-24 px-6 max-w-2xl mx-auto text-center">
            <h1 className="text-4xl md:text-5xl font-light mb-4 text-foreground tracking-tight">Contact Us</h1>
            <p className="text-lg font-medium text-foreground mb-3">Let's Chat</p>
            <p className="text-base text-muted-foreground font-light max-w-md mx-auto">
              Have a question or need help with your requirement? We're here to help.
            </p>

            <Link
              to="/faqs"
              className="mt-8 inline-flex items-center justify-center rounded-md border border-foreground px-8 py-3 text-xs font-medium uppercase tracking-widest text-foreground transition-colors hover:bg-foreground hover:text-background"
            >
              Help Center
            </Link>

            <div className="mt-14 flex flex-col items-center gap-3">
              <span className="inline-flex items-center justify-center rounded-full border border-border p-3 text-muted-foreground">
                <Mail className="size-5" strokeWidth={1.5} />
              </span>
              <a
                href={`mailto:${contactConfig.email}`}
                className="text-sm text-foreground underline underline-offset-4 hover:text-muted-foreground transition-colors"
              >
                {contactConfig.email}
              </a>
            </div>
          </section>

          <section className="pt-14 pb-24 px-6 max-w-3xl mx-auto">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
              <div className="rounded-md bg-secondary/40 p-6">
                <h2 className="text-sm font-medium text-foreground">Business hours</h2>
                <p className="mt-2 text-sm text-muted-foreground">{contactConfig.businessHours}</p>
              </div>
              <div className="rounded-md bg-secondary/40 p-6">
                <h2 className="text-sm font-medium text-foreground">Office</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {contactConfig.address.line1}
                  <br />
                  {contactConfig.address.line2}
                </p>
              </div>
            </div>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  )
}
