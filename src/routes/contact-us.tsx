import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'
import { Mail, Phone, MapPin, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { submitEnquiry } from '@/lib/enquiries.functions'
import { toast } from 'sonner'

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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      name: String(formData.get('name') ?? '').trim(),
      company: String(formData.get('company') ?? '').trim(),
      email: String(formData.get('email') ?? '').trim(),
      phone: String(formData.get('phone') ?? '').trim(),
      message: String(formData.get('message') ?? '').trim(),
    };

    if (!data.name || !data.email || !data.message) {
      toast.error('Please fill out all required fields.');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await submitEnquiry({
        data: {
          ...data,
          category: 'Contact Form',
        },
      });

      if (!result.ok) {
        toast.error(result.error || 'Failed to submit form.');
      } else {
        toast.success('Message sent successfully! We will get back to you soon.');
        (e.target as HTMLFormElement).reset();
      }
    } catch (err) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

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
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="name" className="text-sm font-medium text-foreground">Full Name</label>
                  <input type="text" id="name" name="name" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="John Doe" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="company" className="text-sm font-medium text-foreground">Company</label>
                  <input type="text" id="company" name="company" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="Acme Corp" required />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label htmlFor="email" className="text-sm font-medium text-foreground">Email</label>
                  <input type="email" id="email" name="email" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="john@example.com" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="phone" className="text-sm font-medium text-foreground">Phone Number</label>
                  <input type="tel" id="phone" name="phone" className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground" placeholder="+1 (555) 000-0000" />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="message" className="text-sm font-medium text-foreground">Message</label>
                <textarea id="message" name="message" rows={5} className="w-full p-3 border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-foreground resize-none" placeholder="How can we help you?" required></textarea>
              </div>
              <button 
                type="submit" 
                disabled={isSubmitting}
                className="px-8 py-3 bg-foreground text-background rounded-md text-sm font-medium hover:opacity-90 transition-opacity w-full md:w-auto flex justify-center items-center"
              >
                {isSubmitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Send Message
              </button>
            </form>
          </div>
          
          <div className="space-y-10 lg:pl-10">
            <div>
              <h2 className="text-2xl font-medium mb-6">Contact Information</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                
                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">Corporate Gifting</h3>
                  <a href="tel:+919922655975" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Phone className="w-4 h-4" /> +91 99226 55975</a>
                  <a href="mailto:gifting@officeneed.in" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Mail className="w-4 h-4" /> gifting@officeneed.in</a>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">Stationery</h3>
                  <a href="tel:+917972797965" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Phone className="w-4 h-4" /> +91 79727 97965</a>
                  <a href="mailto:contact@officeneed.in" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Mail className="w-4 h-4" /> contact@officeneed.in</a>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">Hardware & IT</h3>
                  <a href="tel:+919762136698" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Phone className="w-4 h-4" /> +91 97621 36698</a>
                  <a href="mailto:computer@officeneed.in" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Mail className="w-4 h-4" /> computer@officeneed.in</a>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="font-medium">Printing & Branding</h3>
                  <a href="tel:+917972398840" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Phone className="w-4 h-4" /> +91 79723 98840</a>
                  <a href="mailto:print@officeneed.in" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"><Mail className="w-4 h-4" /> print@officeneed.in</a>
                </div>

              </div>

              <div className="mt-8 pt-8 border-t border-border flex items-start gap-4">
                  <MapPin className="w-5 h-5 text-muted-foreground mt-1" />
                  <div>
                    <h3 className="font-medium">Primary Office</h3>
                    <p className="text-muted-foreground text-sm mt-1">Officeneed, India</p>
                    <p className="text-muted-foreground text-sm mt-2 font-medium">Business Hours</p>
                    <p className="text-muted-foreground text-sm">Mon-Fri, 9am-6pm IST</p>
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
