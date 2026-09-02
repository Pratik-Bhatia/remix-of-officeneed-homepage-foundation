import { createFileRoute } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/faqs')({
  component: FaqsPage,
  head: () => ({
    meta: [
      { title: 'FAQs & Buying Guides — OfficeNeed' },
      { name: 'description', content: 'Frequently asked questions and guides for OfficeNeed.' },
    ],
  }),
})

const faqCategories = [
  {
    name: "Corporate Gifting",
    faqs: [
      { question: "How do I place a bulk corporate gifting order?", answer: "You can place a bulk order by contacting our sales team or using the bulk order form on the product page." },
      { question: "Can I customize gifts with my company logo?", answer: "Yes, we offer customization options for most of our corporate gifts. Please provide your logo in high resolution during checkout." },
    ]
  },
  {
    name: "Office Stationery",
    faqs: [
      { question: "What is the return policy for office supplies?", answer: "All products are non-returnable and non-exchangeable. If your order arrives damaged or defective, report it in writing within 48 hours of delivery." },
      { question: "Do you offer subscription services for regular supplies?", answer: "Yes, you can set up recurring deliveries for essential office supplies across India to ensure you never run out." },
      { question: "Do you offer Cash on Delivery?", answer: "No. Cash on Delivery (COD) is not available. We accept online payments only." },
      { question: "Do you ship internationally?", answer: "We currently ship across India only. International shipping is not available." },
    ]
  },
  {
    name: "Hardware & Electronics",
    faqs: [
      { question: "Are warranties included with hardware purchases?", answer: "All hardware comes with a standard manufacturer's warranty. Extended warranties are also available for purchase." },
      { question: "Do you provide installation services for IT equipment?", answer: "Installation services are available for enterprise customers. Please contact support for more details." },
    ]
  }
]

function FaqsPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-4xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-light tracking-tight text-foreground mb-4">FAQs & Buying Guides</h1>
        <p className="text-lg text-muted-foreground mb-12">Find answers to common questions and helpful guides for your office needs.</p>

        <div className="space-y-12">
          {faqCategories.map((category, idx) => (
            <div key={idx}>
              <h2 className="text-2xl font-medium text-foreground mb-6">{category.name}</h2>
              <div className="space-y-4">
                {category.faqs.map((faq, fIdx) => (
                  <details key={fIdx} className="group border border-border rounded-lg bg-secondary/20 overflow-hidden [&_summary::-webkit-details-marker]:hidden">
                    <summary className="flex cursor-pointer items-center justify-between p-4 font-medium text-foreground hover:bg-secondary/40 transition-colors">
                      {faq.question}
                      <span className="ml-4 flex-shrink-0 transition-transform duration-200 group-open:rotate-180">
                        <svg className="h-5 w-5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </span>
                    </summary>
                    <div className="px-4 pb-4 text-muted-foreground">
                      <p>{faq.answer}</p>
                    </div>
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </main>
      <Footer />
    </div>
  )
}
