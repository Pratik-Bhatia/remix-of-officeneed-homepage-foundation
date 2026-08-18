import { createFileRoute, Link } from '@tanstack/react-router'
import { Navbar } from '@/components/officeneed/Navbar'
import { Footer } from '@/components/officeneed/Footer'

export const Route = createFileRoute('/blog')({
  component: BlogPage,
  head: () => ({
    meta: [
      { title: 'Blog — OfficeNeed' },
      { name: 'description', content: 'Read our latest articles, insights, and news.' },
    ],
  }),
})

const featuredArticle = {
  slug: "future-of-workspaces",
  title: "The Future of Workspaces: Hybrid and Beyond",
  category: "Insights",
  date: "Oct 12, 2023",
  excerpt: "Explore how companies are redesigning their offices to support hybrid work models, focusing on collaboration and employee well-being.",
  image: "https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200&h=600"
}

const articles = [
  {
    slug: "top-10-ergonomic-chairs",
    title: "Top 10 Ergonomic Chairs for 2024",
    category: "Buying Guide",
    date: "Sep 28, 2023",
    image: "https://images.unsplash.com/photo-1505843490538-5133c6c7d0e1?auto=format&fit=crop&q=80&w=600&h=400"
  },
  {
    slug: "sustainable-office-supplies",
    title: "How to Switch to Sustainable Office Supplies",
    category: "Sustainability",
    date: "Sep 15, 2023",
    image: "https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&q=80&w=600&h=400"
  },
  {
    slug: "essential-tech-upgrades",
    title: "Essential Tech Upgrades for Your Startup",
    category: "Hardware",
    date: "Sep 02, 2023",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=600&h=400"
  },
  {
    slug: "corporate-gifting-ideas",
    title: "Unique Corporate Gifting Ideas for the Holidays",
    category: "Gifting",
    date: "Aug 20, 2023",
    image: "https://images.unsplash.com/photo-1512909006721-3d6018887383?auto=format&fit=crop&q=80&w=600&h=400"
  }
]

function BlogPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 py-16 sm:px-6 lg:px-8">
        <header className="mb-12">
          <h1 className="text-4xl font-light tracking-tight text-foreground mb-4">Editorial & Insights</h1>
          <p className="text-lg text-muted-foreground">Discover the latest trends, guides, and stories from OfficeNeed.</p>
        </header>

        {/* Featured Article */}
        <section className="mb-16">
          <Link to={`/blog/${featuredArticle.slug}`} className="group block">
            <div className="relative h-96 md:h-[32rem] rounded-xl overflow-hidden mb-6">
              <img src={featuredArticle.image} alt={featuredArticle.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
              <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors" />
            </div>
            <div className="max-w-3xl">
              <div className="flex items-center space-x-3 text-sm mb-3">
                <span className="font-medium text-foreground bg-secondary px-3 py-1 rounded-full">{featuredArticle.category}</span>
                <span className="text-muted-foreground">{featuredArticle.date}</span>
              </div>
              <h2 className="text-3xl font-medium text-foreground mb-3 group-hover:text-muted-foreground transition-colors">{featuredArticle.title}</h2>
              <p className="text-muted-foreground text-lg">{featuredArticle.excerpt}</p>
            </div>
          </Link>
        </section>

        {/* Article Grid */}
        <section>
          <h3 className="text-2xl font-light text-foreground mb-8">Latest Articles</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {articles.map((article, idx) => (
              <Link key={idx} to={`/blog/${article.slug}`} className="group flex flex-col">
                <div className="relative h-48 rounded-lg overflow-hidden mb-4 bg-secondary">
                  <img src={article.image} alt={article.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" />
                </div>
                <div className="flex items-center space-x-2 text-sm mb-2">
                  <span className="font-medium text-foreground">{article.category}</span>
                  <span className="text-muted-foreground">&bull;</span>
                  <span className="text-muted-foreground">{article.date}</span>
                </div>
                <h4 className="text-lg font-medium text-foreground group-hover:text-muted-foreground transition-colors leading-tight">{article.title}</h4>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  )
}
