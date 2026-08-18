import { createFileRoute, Link } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/blog/$slug')({
  component: BlogPost,
  head: () => ({
    meta: [
      { title: 'Article — OfficeNeed' },
      { name: 'description', content: 'Read full article on OfficeNeed.' },
    ],
  }),
})

function BlogPost() {
  const { slug } = Route.useParams()

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full">
        {/* Hero Image */}
        <div className="w-full h-[40vh] min-h-[300px] relative bg-secondary/50">
          <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1920&h=800" 
            alt="Article Hero" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/10" />
        </div>

        <div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
          {/* Back link */}
          <div className="mb-10">
            <Link to="/blog" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Blog
            </Link>
          </div>

          {/* Article Header */}
          <header className="mb-12">
            <div className="flex items-center space-x-3 text-sm mb-6">
              <span className="font-medium text-foreground bg-secondary px-3 py-1 rounded-full">Insights</span>
              <span className="text-muted-foreground">Oct 12, 2023</span>
            </div>
            <h1 className="text-4xl sm:text-5xl font-light tracking-tight text-foreground mb-6 leading-tight capitalize">
              {slug.split('-').join(' ')}
            </h1>
            <p className="text-xl text-muted-foreground leading-relaxed">
              Explore how companies are redesigning their offices to support hybrid work models, focusing on collaboration and employee well-being.
            </p>
          </header>

          {/* Article Body */}
          <div className="prose prose-lg prose-gray max-w-none">
            <p>
              The traditional office setup is undergoing a massive transformation. As organizations embrace flexible working arrangements, the physical workspace must evolve to meet new demands. In this era of hybrid work, the office is no longer just a place to do individual tasks—it is a hub for collaboration, culture-building, and innovation.
            </p>
            <h2>Designing for Collaboration</h2>
            <p>
              With employees dividing their time between home and the office, the primary reason to commute is often to collaborate with colleagues. Forward-thinking companies are replacing rows of individual desks with versatile collaboration zones. These areas include comfortable seating, whiteboards, and integrated technology to seamlessly connect with remote team members.
            </p>
            <blockquote>
              "The office of the future is not about where you sit, but how you connect."
            </blockquote>
            <h2>Prioritizing Well-being</h2>
            <p>
              Employee well-being has taken center stage in workspace design. Access to natural light, ergonomic furniture, and dedicated quiet zones are now considered essential. Incorporating biophilic design elements, such as indoor plants and natural materials, has been shown to reduce stress and boost creativity.
            </p>
            <h2>Technology as the Enabler</h2>
            <p>
              A successful hybrid workspace relies heavily on robust technology infrastructure. Meeting rooms equipped with advanced audiovisual tools ensure equitable experiences for both in-person and remote attendees. Additionally, smart office applications allow employees to book desks, navigate the building, and access amenities with ease.
            </p>
            <p>
              As we navigate this new landscape, it's clear that the office is not obsolete—it is simply being reimagined. By prioritizing flexibility, collaboration, and well-being, organizations can create spaces that inspire their teams and drive success in the modern world of work.
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  )
}
