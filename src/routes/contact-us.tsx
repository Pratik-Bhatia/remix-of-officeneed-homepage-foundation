import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'
import { Mail, Phone, MapPin } from 'lucide-react'

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
      <main className="flex-1 w-full">
        <section className="py-20 px-6 max-w-7xl mx-auto">
          <div className="max-w-2xl">
            <h1 className="text-4xl md:text-5xl font-light mb-6 text-foreground tracking-tight">Contact Us</h1>
            <p className="text-xl text-muted-foreground font-light">We are here to assist with your B2B inquiries. Reach out to our team to discuss your corporate workspace needs.</p>
          </div>
        </section>

        <section className="py-12 px-6 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16">
          <div>
            <form className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground">Full Name</label>
                  <input type="text" id="name" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="company" className="text-sm font-medium text-foreground">Company</label>
                  <input type="text" id="company" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="Acme Corp" required />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
                  <input type="email" id="email" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="john@example.com" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-foreground">Phone Number</label>
                  <input type="tel" id="phone" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="+1 (555) 000-0000" />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-foreground">Message</label>
                <textarea id="message" rows={5} className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground resize-none" placeholder="How can we help you?" required></textarea>
              </div>
              <button type="submit" className="px-8 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity w-full md:w-auto">
                Send Message
              </button>
            </form>
          </div>
          
          <div className="space-y-10 lg:pl-10">
            <div>
              <h2 className="text-2xl font-medium mb-6">Contact Information</h2>
              <div className="space-y-6">
                <div className="flex items-start gap-4">
                  <Mail className="w-5 h-5 text-muted-foreground mt-1" />
                  <div>
                    <h3 className="font-medium">Email Us</h3>
                    <p className="text-muted-foreground text-sm mt-1">support@officeneed.com</p>
                    <p className="text-muted-foreground text-sm">sales@officeneed.com</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <Phone className="w-5 h-5 text-muted-foreground mt-1" />
                  <div>
                    <h3 className="font-medium">Call Us</h3>
                    <p className="text-muted-foreground text-sm mt-1">+1 (800) 123-4567</p>
                    <p className="text-muted-foreground text-sm">Mon-Fri, 9am-6pm EST</p>
                  </div>
                </div>
                <div className="flex items-start gap-4">
                  <MapPin className="w-5 h-5 text-muted-foreground mt-1" />
                  <div>
                    <h3 className="font-medium">Headquarters</h3>
                    <p className="text-muted-foreground text-sm mt-1">123 Corporate Blvd, Suite 400<br />New York, NY 10001</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
