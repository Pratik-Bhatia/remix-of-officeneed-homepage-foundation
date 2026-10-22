import { createFileRoute } from "@tanstack/react-router";
import { Navbar } from "@/components/officeneed/Navbar";
import { Hero } from "@/components/officeneed/Hero";
import { Bestsellers } from "@/components/officeneed/Bestsellers";
import { ShopByCategory } from "@/components/officeneed/ShopByCategory";
import { CorporateGiftingCarousel } from "@/components/officeneed/CorporateGiftingCarousel";
import { Footer } from "@/components/officeneed/Footer";

export const Route = createFileRoute("/")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Officeneed — One Vendor. Multiple Solutions." },
      {
        name: "description",
        content:
          "Corporate procurement made simpler: gifting, office stationery, IT infrastructure, printing & branding and luxury gifting from one accountable partner.",
      },
      { property: "og:title", content: "Officeneed — One Vendor. Multiple Solutions." },
      {
        property: "og:description",
        content:
          "Premium corporate procurement across gifting, stationery, IT, printing and luxury — under one platform.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main>
        <Hero />
        <ShopByCategory />
        <Bestsellers />
        <CorporateGiftingCarousel />
      </main>
      <Footer />
    </div>

  );
}
