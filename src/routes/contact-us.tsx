import { CLARITY_MASK } from "@/lib/clarity";
import { useState, type FormEvent } from 'react'
import { createFileRoute, Link } from '@tanstack/react-router'
import { z } from 'zod'
import { toast } from 'sonner'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'
import { Mail } from 'lucide-react'
import { contactConfig } from '@/config/contact'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { submitEnquiry } from '@/lib/enquiries.functions'
import { trackLead } from '@/lib/meta-pixel'

const SITE = 'https://officeneed.store'
const TITLE = 'Contact Us — Officeneed'
const DESC = 'Send Officeneed an enquiry about corporate gifting, office stationery, computer peripherals or fragrances, or email care@officeneed.in.'

export const Route = createFileRoute('/contact-us')({
  staticData: { sitemap: true },
  component: ContactUsPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: 'description', content: DESC },
      { property: 'og:title', content: TITLE },
      { property: 'og:description', content: DESC },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: `${SITE}/contact-us` },
      { name: 'twitter:card', content: 'summary' },
    ],
    links: [{ rel: 'canonical', href: `${SITE}/contact-us` }],
  }),
})

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Please enter your name.').max(120, 'Name must be under 120 characters.'),
  company: z.string().trim().max(160, 'Company must be under 160 characters.'),
  email: z.string().trim().email('Please enter a valid email address.').max(255),
  message: z.string().trim().min(10, 'Please tell us a little more (at least 10 characters).').max(4000, 'Message must be under 4000 characters.'),
})
type FieldErrors = Partial<Record<keyof z.infer<typeof contactSchema>, string>>

function ContactForm() {
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    const parsed = contactSchema.safeParse({
      name: String(fd.get('name') ?? ''),
      company: String(fd.get('company') ?? ''),
      email: String(fd.get('email') ?? ''),
      message: String(fd.get('message') ?? ''),
    })
    if (!parsed.success) {
      const next: FieldErrors = {}
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof FieldErrors
        if (!next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }
    setErrors({})
    setSubmitting(true)
    try {
      const result = await submitEnquiry({
        data: {
          productSlug: 'contact-us',
          productName: 'General enquiry',
          category: 'Contact Us',
          name: parsed.data.name,
          ...(parsed.data.company ? { company: parsed.data.company } : {}),
          email: parsed.data.email,
          message: parsed.data.message,
        },
      })
      if (!result.ok) throw new Error(result.error)
      trackLead('Contact Us', { email: parsed.data.email }, { content_name: 'General enquiry' })
      setSent(true)
    } catch {
      toast.error(`We couldn't send your enquiry. Please try again or email ${contactConfig.email}.`)
    } finally {
      setSubmitting(false)
    }
  }

  if (sent) {
    return (
      <div role="status" className="rounded-md border border-border bg-secondary/40 p-8 text-center">
        <h2 className="text-lg font-medium text-foreground">Thank you — your enquiry has been received.</h2>
        <p className="mt-2 text-sm text-muted-foreground">Our team will get back to you by email.</p>
      </div>
    )
  }

  const field = (name: keyof FieldErrors) => ({
    id: `contact-${name}`,
    name,
    'aria-invalid': errors[name] ? true : undefined,
    'aria-describedby': errors[name] ? `contact-${name}-error` : undefined,
  })
  const err = (name: keyof FieldErrors) =>
    errors[name] ? (
      <p id={`contact-${name}-error`} role="alert" className="text-xs text-destructive">{errors[name]}</p>
    ) : null

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5 text-left" {...CLARITY_MASK}>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="contact-name">Name *</Label>
          <Input {...field('name')} autoComplete="name" maxLength={120} />
          {err('name')}
        </div>
        <div className="space-y-2">
          <Label htmlFor="contact-company">Company</Label>
          <Input {...field('company')} autoComplete="organization" maxLength={160} />
          {err('company')}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-email">Email *</Label>
        <Input {...field('email')} type="email" autoComplete="email" maxLength={255} />
        {err('email')}
      </div>
      <div className="space-y-2">
        <Label htmlFor="contact-message">How can we help? *</Label>
        <Textarea {...field('message')} rows={5} maxLength={4000} />
        {err('message')}
      </div>
      <p className="text-xs text-muted-foreground">
        By sending this form you agree to our <Link to="/privacy-policy" className="underline underline-offset-2">Privacy Policy</Link>.
      </p>
      <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
        {submitting ? 'Sending…' : 'Send enquiry'}
      </Button>
    </form>
  )
}

function ContactUsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        <section className="pt-24 px-6 max-w-2xl mx-auto text-center">
          <h1 className="text-4xl md:text-5xl font-light mb-4 text-foreground tracking-tight">Contact Us</h1>
          <p className="text-lg font-medium text-foreground mb-3">Let's Chat</p>
          <p className="text-base text-muted-foreground font-light max-w-md mx-auto">
            Have a question or need help with your requirement? Send us a message below.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3">
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

        <section className="pt-12 pb-10 px-6 max-w-2xl mx-auto">
          <ContactForm />
        </section>

        <section className="pb-24 px-6 max-w-2xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left">
            <div className="rounded-md bg-secondary/40 p-6">
              <h2 className="text-sm font-medium text-foreground">Business hours</h2>
              <p className="mt-2 text-sm text-muted-foreground">{contactConfig.businessHours}</p>
            </div>
            <div className="rounded-md bg-secondary/40 p-6">
              <h2 className="text-sm font-medium text-foreground">Help Center</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Find quick answers in our <Link to="/faqs" className="underline underline-offset-2">FAQs</Link>.
              </p>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
