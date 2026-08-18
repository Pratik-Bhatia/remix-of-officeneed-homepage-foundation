import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/terms-and-conditions')({
  component: TermsConditionsPage,
  head: () => ({
    meta: [
      { title: 'Terms & Conditions — OfficeNeed' },
      { name: 'description', content: 'Terms and conditions for using OfficeNeed.' },
    ],
  }),
})

function TermsConditionsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col text-foreground">
      <Navbar />
      <main className="flex-1 w-full py-16 px-4 md:px-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-light tracking-tight mb-12">Terms & Conditions</h1>
          
          <div className="space-y-12">
            <section>
              <h2 className="text-2xl font-medium mb-4">Introduction</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for introductory text. E.g., Welcome to OfficeNeed. These terms and conditions outline the rules and regulations for the use of OfficeNeed's Website.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Intellectual Property Rights</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for IP rights. E.g., Other than the content you own, under these Terms, OfficeNeed and/or its licensors own all the intellectual property rights and materials contained in this Website.]
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Restrictions</h2>
              <p className="text-muted-foreground leading-relaxed mb-4">
                [Placeholder for user restrictions. E.g., You are specifically restricted from all of the following:]
              </p>
              <ul className="list-disc pl-6 text-muted-foreground space-y-2">
                <li>publishing any Website material in any other media;</li>
                <li>selling, sublicensing and/or otherwise commercializing any Website material;</li>
                <li>publicly performing and/or showing any Website material;</li>
                <li>using this Website in any way that is or may be damaging to this Website;</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-medium mb-4">Limitation of Liability</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for limitation of liability. E.g., In no event shall OfficeNeed, nor any of its officers, directors and employees, be held liable for anything arising out of or in any way connected with your use of this Website.]
              </p>
            </section>
            
            <section>
              <h2 className="text-2xl font-medium mb-4">Governing Law & Jurisdiction</h2>
              <p className="text-muted-foreground leading-relaxed">
                [Placeholder for governing law. E.g., These Terms will be governed by and interpreted in accordance with the laws of the State/Country, and you submit to the non-exclusive jurisdiction of the state and federal courts located in State/Country for the resolution of any disputes.]
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
