import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/privacy-policy')({
  component: PrivacyPolicyPage,
  head: () => ({
    meta: [
      { title: 'Privacy Policy — OfficeNeed' },
      { name: 'description', content: 'How we collect, use, and protect your data.' },
    ],
  }),
})

function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Navbar />
      <main className="flex-1 w-full py-16 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-light tracking-tight mb-12">Privacy Policy</h1>
          
          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">Information Collected</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                [Placeholder for data collection practices. E.g., We collect information from you when you register on our site, place an order, subscribe to our newsletter, respond to a survey or fill out a form.]
              </p>
              <p className="text-muted-foreground leading-relaxed">
                [E.g., When ordering or registering on our site, as appropriate, you may be asked to enter your: name, e-mail address, mailing address, phone number or credit card information.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Data Usage</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                [Placeholder for how data is used. E.g., Any of the information we collect from you may be used in one of the following ways:]
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>To personalize your experience</li>
                <li>To improve our website</li>
                <li>To improve customer service</li>
                <li>To process transactions</li>
                <li>To send periodic emails</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Data Protection</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for security measures. E.g., We implement a variety of security measures to maintain the safety of your personal information when you place an order or enter, submit, or access your personal information.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Cookies</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for cookie policy. E.g., Yes. Cookies are small files that a site or its service provider transfers to your computers hard drive through your Web browser (if you allow) that enables the sites or service providers systems to recognize your browser and capture and remember certain information.]
              </p>
            </section>
            
            <section>
              <h2 className="text-2xl font-medium mb-4">Third-Party Disclosure</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for third party sharing. E.g., We do not sell, trade, or otherwise transfer to outside parties your personally identifiable information.]
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
