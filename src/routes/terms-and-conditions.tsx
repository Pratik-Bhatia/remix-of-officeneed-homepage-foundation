import React, { useState, useEffect } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "motion/react";
import {
  FileText,
  ChevronRight,
  ChevronDown,
  Mail,
  Phone,
  MapPin,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  BookOpen,
  Building2,
} from "lucide-react";
import { Navbar as Nav } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";
import { contactConfig } from "@/config/contact";
import patternSeamless from "@/assets/pattern-seamless.svg";

export const Route = createFileRoute("/terms-and-conditions")({
  component: TermsAndConditionsPage,
  head: () => ({
    meta: [
      { title: "Terms & Conditions" },
      {
        name: "description",
        content:
          "Read the Terms & Conditions governing the use of Officeneed's website, products, and services, including ordering, payments, deliveries, returns, and legal information.",
      },
      { property: "og:title", content: "Terms & Conditions" },
      {
        property: "og:description",
        content:
          "Read the Terms & Conditions governing the use of Officeneed's website, products, and services, including ordering, payments, deliveries, returns, and legal information.",
      },
      { name: "twitter:title", content: "Terms & Conditions" },
    ],
  }),
});

interface SectionItem {
  id: string;
  number: string;
  title: string;
  content: string[];
}

const termsSections: SectionItem[] = [
  {
    id: "acceptance-of-terms",
    number: "01",
    title: "Acceptance of Terms",
    content: [
      "By accessing, browsing, or using the Officeneed website, requesting quotations, downloading product catalogues, or purchasing our products and services, you acknowledge that you have read, understood, and agree to be legally bound by these Terms & Conditions.",
      "If you are entering into these terms on behalf of a company or other legal entity, you represent that you have the authority to bind such entity to these Terms & Conditions. If you do not agree with any part of these terms, you must not use our website or services.",
    ],
  },
  {
    id: "company-information",
    number: "02",
    title: "Company Information",
    content: [
      "Officeneed operates as an enterprise B2B corporate procurement, branding, and gifting partner headquartered in Maharashtra, India. We specialize in printing solutions, corporate gifting, institutional apparel, luxury fragrances, office supplies, and hardware & IT products.",
      "Our services cater to enterprise clients, institutions, and corporate organizations across India and global markets, providing end-to-end customization, warehousing, and logistics solutions.",
    ],
  },
  {
    id: "use-of-website",
    number: "03",
    title: "Use of Website",
    content: [
      "You agree to use the Officeneed website solely for lawful corporate procurement, product research, catalogue downloads, and direct business communication.",
      "You must not use our website in any way that causes, or may cause, damage to the platform, impairment of accessibility, or for any unlawful, fraudulent, or harmful activity. Unauthorized attempts to scrape data, breach security protocols, or disrupt server infrastructure are strictly prohibited.",
    ],
  },
  {
    id: "product-information",
    number: "04",
    title: "Product Information",
    content: [
      "While we make every effort to display product specifications, dimensions, colors, and custom branding options accurately across our catalogues and website, slight variations may occur due to screen rendering differences, material batches, or artisan printing processes.",
      "All product photography, digital mockups, and illustrations are provided for conceptual reference. We reserve the right to modify product specifications or discontinue items without prior notice as part of our continuous quality improvement.",
    ],
  },
  {
    id: "pricing-quotations",
    number: "05",
    title: "Pricing & Quotations",
    content: [
      "All formal price quotations provided by Officeneed are customized based on order quantities, branding specifications, packaging requirements, and raw material market rates.",
      "Unless explicitly stated otherwise in writing, quotations remain valid for the validity period specified on the formal quote document (typically 15 to 30 days). Prices quoted exclude applicable Goods and Services Tax (GST) and statutory duties unless explicitly noted.",
    ],
  },
  {
    id: "orders-availability",
    number: "06",
    title: "Orders & Availability",
    content: [
      "An order is deemed officially confirmed only upon our receipt and written acceptance of a signed Purchase Order (PO) and/or mutually agreed advance payment.",
      "All products and promotional inventory are subject to stock availability at the time of PO confirmation. In the rare event that an ordered item becomes unavailable, your dedicated account manager will propose an equivalent premium alternative or adjust the order accordingly.",
    ],
  },
  {
    id: "payment-terms",
    number: "07",
    title: "Payment Terms",
    content: [
      "Standard commercial payment terms apply as stipulated in your formal quotation, invoice, or enterprise procurement agreement. Unless an approved credit facility has been established in writing, custom-branded orders require an agreed advance payment prior to commencing production.",
      "All invoices are payable in Indian Rupees (INR) via bank transfer, NEFT/RTGS, or approved corporate payment methods. Late payments may incur interest or delay subsequent shipment schedules.",
    ],
  },
  {
    id: "shipping-delivery",
    number: "08",
    title: "Shipping & Delivery",
    content: [
      "We provide Pan-India and global fulfillment through vetted logistics partners. Estimated dispatch and delivery schedules are calculated from the date of final artwork approval and payment confirmation.",
      "While we strive to meet all targeted delivery timelines, Officeneed is not liable for delays resulting from force majeure events, severe weather disruptions, transit carrier delays, or statutory clearance holds beyond our reasonable control.",
    ],
  },
  {
    id: "cancellation-policy",
    number: "09",
    title: "Cancellation Policy",
    content: [
      "Due to the bespoke, branded nature of corporate gifting and custom printing, orders cannot be cancelled once digital or physical artwork proofs have been approved and production has commenced.",
      "For standard unbranded merchandise, cancellation requests must be submitted in writing prior to warehouse dispatch and are subject to administrative and restocking review.",
    ],
  },
  {
    id: "returns-replacement",
    number: "10",
    title: "Returns & Replacement Policy",
    content: [
      "We enforce strict multi-point quality assurance inspections prior to every dispatch. Upon receiving your shipment, you must inspect the goods and report any transit damage, quantity discrepancies, or manufacturing defects in writing within 48 hours of delivery.",
      "Defective or damaged items verified by our quality assurance team will be promptly replaced or rectified at no additional expense to your organization. Customized products free from manufacturing defects cannot be returned.",
    ],
  },
  {
    id: "warranty-disclaimer",
    number: "11",
    title: "Warranty Disclaimer",
    content: [
      "Third-party branded products (including IT hardware, electronics, audio devices, and branded appliances) are covered exclusively by their respective Original Equipment Manufacturer (OEM) warranties and service network terms.",
      "Except as expressly stated in a signed written agreement, Officeneed makes no additional warranties, express or implied, including warranties of merchantability or fitness for a particular commercial purpose.",
    ],
  },
  {
    id: "intellectual-property",
    number: "12",
    title: "Intellectual Property",
    content: [
      "All website content, visual design systems, catalogue layouts, text, graphics, logos, and digital assets are the exclusive intellectual property of Officeneed and are protected by copyright, trademark, and intellectual property laws.",
      "Corporate logos, trademarks, and artwork files provided by clients for custom printing remain the sole intellectual property of the respective client. By submitting artwork, you grant Officeneed a limited license to print and produce the agreed physical deliverables.",
    ],
  },
  {
    id: "limitation-of-liability",
    number: "13",
    title: "Limitation of Liability",
    content: [
      "To the maximum extent permitted by applicable law, Officeneed, its directors, officers, employees, and logistics partners shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of revenue, profits, or business opportunities, arising from your use of our website or services.",
      "Our total cumulative liability for any claim arising out of or relating to an enterprise order shall not exceed the net commercial invoice value of the specific product or service giving rise to the claim.",
    ],
  },
  {
    id: "user-responsibilities",
    number: "14",
    title: "User Responsibilities",
    content: [
      "You are responsible for ensuring that all logos, typography, vector files, and brand guidelines submitted to Officeneed for production do not infringe upon any third-party copyrights, trademarks, or design rights.",
      "You agree to indemnify and hold harmless Officeneed from any legal claims, liabilities, or expenses arising from third-party intellectual property claims related to artwork or specifications supplied by your organization.",
    ],
  },
  {
    id: "third-party-links",
    number: "15",
    title: "Third-Party Links",
    content: [
      "Our website and digital catalogues may contain hyperlinks to external third-party websites, manufacturer portals, or industry partners for informational convenience.",
      "Officeneed does not endorse, monitor, or exercise control over the content, security protocols, or privacy practices of external third-party websites, and we assume no liability for your interaction with them.",
    ],
  },
  {
    id: "privacy",
    number: "16",
    title: "Privacy",
    content: [
      "Your privacy and data security are paramount to us. Our collection, processing, and safeguarding of personal and corporate data are governed by our comprehensive Privacy Policy.",
      "By using our website and submitting corporate inquiries, you consent to our data handling practices as described in our Privacy Policy.",
    ],
  },
  {
    id: "governing-law",
    number: "17",
    title: "Governing Law",
    content: [
      "These Terms & Conditions, along with all commercial procurement agreements entered into with Officeneed, shall be governed by and construed in accordance with the laws of India.",
      "Any legal disputes, controversies, or claims arising out of or in connection with these terms shall be subject to the exclusive jurisdiction of the competent courts in Maharashtra, India.",
    ],
  },
  {
    id: "changes-to-terms",
    number: "18",
    title: "Changes to Terms",
    content: [
      "Officeneed reserves the right to amend, update, or revise these Terms & Conditions at our discretion without prior individual notice. Revisions will be published on this page with an updated effective date.",
      "Your continued use of our website, catalogues, or procurement services following any published modifications constitutes your formal acknowledgment and acceptance of the revised terms.",
    ],
  },
  {
    id: "contact-information",
    number: "19",
    title: "Contact Information",
    content: [
      "For any formal legal notices, clarifications regarding these Terms & Conditions, or corporate compliance inquiries, please contact our administrative team at info@officeneed.com.",
      "You may also reach our corporate headquarters by post or phone during official working hours for immediate procurement support.",
    ],
  },
];

function TermsAndConditionsPage() {
  const [activeSection, setActiveSection] = useState<string>("acceptance-of-terms");
  const [isMobileTocOpen, setIsMobileTocOpen] = useState(false);

  // Scroll spy to highlight active TOC item
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY + 180;
      for (const section of termsSections) {
        const element = document.getElementById(section.id);
        if (element) {
          const top = element.offsetTop;
          const height = element.offsetHeight;
          if (scrollPosition >= top && scrollPosition < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const yOffset = -120;
      const y =
        element.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: "smooth" });
    }
    setIsMobileTocOpen(false);
  };

  return (
    <main className="min-h-screen bg-[#FAFAF8] text-foreground" style={{ fontFamily: "var(--font-nexa)" }}>
      <Nav />

      {/* Hero Section */}
      <section className="relative flex min-h-[38vh] md:min-h-[44vh] flex-col items-center justify-center overflow-hidden bg-[#FAFAF8] px-6 py-24 text-center md:px-10 border-b border-[rgba(0,0,0,0.06)]">
        {/* Subtle Geometric Background Pattern */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage: `url(${patternSeamless})`,
            backgroundSize: "300px",
            backgroundRepeat: "repeat",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl">
          {/* Breadcrumb: Home / Terms & Conditions */}
          <nav aria-label="Breadcrumb" className="mb-6 flex items-center justify-center gap-2 text-[13px] font-medium text-muted-foreground">
            <Link
              to="/"
              className="transition-colors duration-200 hover:text-[var(--s-dark)]"
            >
              Home
            </Link>
            <ChevronRight size={14} className="text-muted-foreground/60" />
            <span className="font-semibold text-[var(--s-dark)]">
              Terms & Conditions
            </span>
          </nav>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-5 mx-auto inline-flex items-center gap-2 rounded-full border border-[rgba(0,0,0,0.08)] bg-white px-4 py-1.5 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--s-dark)] shadow-sm"
          >
            <ShieldCheck size={14} className="text-[var(--s-dark)]" />
            <span>LEGAL & COMPLIANCE</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 font-display text-[36px] font-bold leading-tight tracking-tight text-[var(--s-dark)] md:text-[50px] lg:text-[58px]"
          >
            Terms & Conditions
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-2xl text-[16px] leading-relaxed text-[rgb(15_17_23_/_0.7)] md:text-[18px]"
          >
            Please read these Terms & Conditions carefully before using our website or purchasing our products and services.
          </motion.p>
        </div>
      </section>

      {/* Main Content Layout */}
      <section className="py-14 md:py-20">
        <div className="mx-auto max-w-[1360px] px-6 md:px-10">
          <div className="grid grid-cols-1 lg:grid-cols-[290px_1fr] gap-10 lg:gap-16 items-start">
            
            {/* Desktop Sticky Table of Contents Sidebar */}
            <aside className="hidden lg:block sticky top-28 max-h-[calc(100vh-140px)] overflow-y-auto pr-4 select-none">
              <div className="mb-4 flex items-center gap-2.5 px-3 text-[12px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                <BookOpen size={15} />
                <span>Table of Contents</span>
              </div>
              <nav className="space-y-1">
                {termsSections.map((sec) => {
                  const isActive = activeSection === sec.id;
                  return (
                    <button
                      key={sec.id}
                      onClick={() => scrollToSection(sec.id)}
                      className={`group flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-left text-[14px] transition-all duration-200 ${
                        isActive
                          ? "bg-[var(--s-dark)] text-white font-semibold shadow-sm"
                          : "text-[rgb(15_17_23_/_0.7)] hover:bg-white hover:text-[var(--s-dark)]"
                      }`}
                    >
                      <span
                        className={`text-[12px] font-mono font-bold ${
                          isActive
                            ? "text-white/80"
                            : "text-muted-foreground group-hover:text-[var(--s-dark)]"
                        }`}
                      >
                        {sec.number}
                      </span>
                      <span className="truncate">{sec.title}</span>
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* Mobile / Tablet Accordion TOC */}
            <div className="lg:hidden mb-2">
              <div className="rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white p-2 shadow-sm">
                <button
                  onClick={() => setIsMobileTocOpen(!isMobileTocOpen)}
                  className="flex w-full items-center justify-between rounded-xl bg-[#FAFAF8] px-4 py-3.5 text-left font-bold text-[15px] text-[var(--s-dark)] transition-colors hover:bg-[rgba(0,0,0,0.02)]"
                >
                  <span className="flex items-center gap-2.5">
                    <BookOpen size={17} />
                    <span>Table of Contents ({termsSections.length} Sections)</span>
                  </span>
                  <ChevronDown
                    size={18}
                    className={`transition-transform duration-300 ${
                      isMobileTocOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>

                <AnimatePresence>
                  {isMobileTocOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="max-h-[50vh] overflow-y-auto py-3 px-2 space-y-1">
                        {termsSections.map((sec) => (
                          <button
                            key={sec.id}
                            onClick={() => scrollToSection(sec.id)}
                            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-[rgb(15_17_23_/_0.75)] hover:bg-[#FAFAF8] hover:text-[var(--s-dark)] font-medium"
                          >
                            <span className="font-mono text-[12px] font-bold text-muted-foreground">
                              {sec.number}
                            </span>
                            <span>{sec.title}</span>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {/* Centered Content Container (~900px max-width on right side) */}
            <div className="mx-auto w-full max-w-[900px] space-y-8">
              {/* Effective Date Header */}
              <div className="flex items-center justify-between border-b border-[rgba(0,0,0,0.06)] pb-5 text-[14px] text-muted-foreground">
                <span>
                  <strong>Effective Date:</strong> 1st April 2026
                </span>
                <span>
                  <strong>Version:</strong> 2.4 (Enterprise B2B)
                </span>
              </div>

              {/* Numbered Section Cards */}
              <div className="space-y-6">
                {termsSections.map((section, idx) => (
                  <motion.div
                    key={section.id}
                    id={section.id}
                    initial={{ opacity: 0, y: 25 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-50px" }}
                    transition={{ duration: 0.4, delay: idx < 3 ? idx * 0.08 : 0, ease: [0.16, 1, 0.3, 1] }}
                    className="group relative rounded-2xl border border-[rgba(0,0,0,0.07)] bg-white p-7 md:p-9 md:px-11 shadow-[0_2px_15px_rgba(0,0,0,0.02)] transition-all duration-300 hover:border-[rgba(0,0,0,0.14)] hover:shadow-[0_10px_35px_rgba(0,0,0,0.05)]"
                  >
                    {/* Section Header */}
                    <div className="mb-5 flex items-center gap-4">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FAFAF8] border border-[rgba(0,0,0,0.06)] font-mono text-[16px] font-bold text-[var(--s-dark)] group-hover:bg-[var(--s-dark)] group-hover:text-white transition-colors duration-300">
                        {section.number}
                      </div>
                      <h2 className="font-display text-[22px] md:text-[26px] font-bold text-[var(--s-dark)] tracking-tight">
                        {section.title}
                      </h2>
                    </div>

                    {/* Section Content with Comfortable Line Height */}
                    <div className="space-y-4">
                      {section.content.map((paragraph, pIdx) => (
                        <p
                          key={pIdx}
                          className="text-[16px] leading-[1.8] text-[rgb(15_17_23_/_0.75)]"
                        >
                          {paragraph}
                        </p>
                      ))}
                    </div>

                    {/* Subtle Divider within Card for visual separation */}
                    {idx < termsSections.length - 1 && (
                      <div className="absolute -bottom-3 left-10 right-10 h-[1px] bg-transparent" />
                    )}
                  </motion.div>
                ))}
              </div>

              {/* Premium Contact Card */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="mt-14 overflow-hidden rounded-3xl bg-[#0a0a0a] text-white p-8 md:p-12 shadow-2xl relative border border-white/10"
              >
                {/* Decorative subtle pattern */}
                <div
                  className="pointer-events-none absolute inset-0 opacity-[0.08]"
                  style={{
                    backgroundImage: `url(${patternSeamless})`,
                    backgroundSize: "280px",
                    backgroundRepeat: "repeat",
                  }}
                />

                <div className="relative z-10 grid gap-8 md:grid-cols-2 md:items-center">
                  <div>
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white/80">
                      <Building2 size={13} />
                      <span>OFFICIAL CORPORATE OFFICE</span>
                    </div>
                    <h3 className="font-display text-[28px] md:text-[32px] font-bold text-white tracking-tight mb-3">
                      Officeneed
                    </h3>
                    <p className="text-white/70 text-[15px] leading-relaxed mb-6">
                      For legal compliance, contractual agreements, or immediate procurement inquiries, reach out to our headquarters.
                    </p>

                    <div className="space-y-3.5">
                      <div className="flex items-center gap-3 text-[15px] text-white/85">
                        <Mail size={17} className="text-white/60 shrink-0" />
                        <a href={`mailto:${contactConfig.email}`} className="hover:text-white transition-colors">
                          {contactConfig.email}
                        </a>
                      </div>
                      <div className="flex items-center gap-3 text-[15px] text-white/85">
                        <Phone size={17} className="text-white/60 shrink-0" />
                        <a href={`tel:${contactConfig.phone}`} className="hover:text-white transition-colors">
                          {contactConfig.phone}
                        </a>
                      </div>
                      <div className="flex items-start gap-3 text-[15px] text-white/85">
                        <MapPin size={18} className="text-white/60 shrink-0 mt-0.5" />
                        <span>
                          {contactConfig.address.line1}, {contactConfig.address.line2}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col justify-center md:items-end">
                    <Link
                      to="/contact-us"
                      className="group inline-flex items-center gap-3 rounded-xl bg-white px-7 py-4 text-[15px] font-bold text-black shadow-lg transition-all duration-300 hover:scale-[1.02] hover:bg-white/95 hover:shadow-xl"
                    >
                      <span>Contact Legal & Support</span>
                      <ArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
              </motion.div>

              {/* Need Assistance? CTA Section */}
              <motion.div
                initial={{ opacity: 0, y: 25 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                className="mt-12 rounded-3xl border border-[rgba(0,0,0,0.08)] bg-white p-8 md:p-12 text-center shadow-[0_4px_25px_rgba(0,0,0,0.03)]"
              >
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FAFAF8] border border-[rgba(0,0,0,0.07)] text-[var(--s-dark)]">
                  <HelpCircle size={24} />
                </div>
                <h3 className="font-display text-[26px] md:text-[32px] font-bold text-[var(--s-dark)] tracking-tight mb-3">
                  Need Assistance?
                </h3>
                <p className="mx-auto max-w-xl text-[16px] leading-relaxed text-[rgb(15_17_23_/_0.7)] mb-8">
                  If you have any questions regarding these Terms & Conditions, our team will be happy to assist you with tailored compliance or corporate contracting support.
                </p>

                <div className="flex flex-wrap items-center justify-center gap-4">
                  <Link
                    to="/contact-us"
                    className="inline-flex items-center gap-2.5 rounded-xl bg-[var(--s-dark)] px-7 py-3.5 text-[15px] font-bold text-white shadow-md transition-all duration-300 hover:bg-[var(--s-dark)]/90 hover:shadow-lg"
                  >
                    <span>Contact Us</span>
                    <ArrowRight size={17} />
                  </Link>
                  <Link
                    to="/catalogues"
                    className="inline-flex items-center gap-2.5 rounded-xl border border-[rgba(0,0,0,0.12)] bg-[#FAFAF8] px-7 py-3.5 text-[15px] font-bold text-[var(--s-dark)] transition-all duration-300 hover:bg-white hover:border-[rgba(0,0,0,0.25)]"
                  >
                    <span>Explore Catalogues</span>
                    <FileText size={17} />
                  </Link>
                </div>
              </motion.div>

            </div>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
