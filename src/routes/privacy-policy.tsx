import { createFileRoute } from "@tanstack/react-router";
import { Navbar as Nav } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";

import { motion } from "motion/react";

const SITE = "https://officeneed.store";
const TITLE = "Privacy Policy — Officeneed";
const DESC = "How Officeneed collects, uses and shares information when you browse, create an account, place an order or send us an enquiry.";
const LAST_UPDATED = "13 October 2026";

export const Route = createFileRoute("/privacy-policy")({
  staticData: { sitemap: true },
  component: PrivacyPolicyPage,
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE}/privacy-policy` },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: TITLE },
    ],
    links: [{ rel: "canonical", href: `${SITE}/privacy-policy` }],
  }),
});

function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-foreground">
      <Nav />

      
      {/* Compact Hero */}
      <section className="relative flex min-h-[40vh] md:min-h-[50vh] flex-col items-center justify-center overflow-hidden bg-[#FAFAF8] px-6 py-24 text-center md:px-10">
        
        {/* Subtle Background Pattern */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 50% 50%, rgba(0,0,0,0.1) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 mx-auto inline-flex items-center rounded-full border border-[rgba(0,0,0,0.06)] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-foreground shadow-sm"
          >
            LEGAL
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 font-display text-[32px] font-bold leading-tight tracking-tight text-foreground md:text-[48px] lg:text-[56px]"
          >
            Privacy Policy
          </motion.h1>
          
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto max-w-xl text-[16px] leading-relaxed text-muted-foreground md:text-[18px]"
          >
            Your privacy matters to us. Learn how Officeneed collects, uses and protects your information.
          </motion.p>
        </div>
      </section>

      {/* Privacy Content */}
      <section className="py-16 md:py-20">
        <div className="mx-auto max-w-[850px] px-6 md:px-10">
          <div className="prose prose-lg mx-auto max-w-none text-[rgb(15_17_23_/_0.7)] prose-headings:text-foreground prose-headings:font-bold prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-[24px] prose-h2:tracking-tight md:prose-h2:text-[28px] prose-p:mb-6 prose-p:leading-[1.8] prose-p:text-[16px] prose-li:text-[16px] prose-li:marker:text-foreground prose-a:text-foreground hover:prose-a:text-black">
            
            <p><strong>Last Updated: {LAST_UPDATED}</strong></p>

            <h2>Introduction</h2>
            <p>
              This Privacy Policy explains what information Officeneed collects when you use this website, why we use it, and who we share it with.
            </p>

            <h2>Information We Collect</h2>
            <ul>
              <li><strong>Account information:</strong> when you create a customer or business account, your name, email address, phone number and saved addresses. Business accounts also provide company name, GSTIN and business address.</li>
              <li><strong>Order information:</strong> items in your bag, delivery details and order history.</li>
              <li><strong>Enquiries and quote requests:</strong> the name, company, email, phone number and message you submit through our contact, product enquiry, chat assistant or corporate quote forms, and any files or logos you upload with them.</li>
              <li><strong>Newsletter:</strong> the email address you enter in the newsletter sign-up.</li>
              <li><strong>Product reviews:</strong> your name, email address, rating and review text. Your email is not shown publicly.</li>
              <li><strong>Saved products:</strong> the products you save to your account.</li>
              <li><strong>Usage information:</strong> pages and products viewed, items added to the bag, and campaign or referral details in the link you arrived from, collected through cookies and similar technologies.</li>
            </ul>

            <h2>How We Use Information</h2>
            <ul>
              <li>To create and manage your account, including corporate pricing for approved business accounts.</li>
              <li>To process your bag, checkout and orders.</li>
              <li>To respond to enquiries and quote requests, including sending you a confirmation email with a summary of your request.</li>
              <li>To publish approved product reviews.</li>
              <li>To measure and improve our website and advertising.</li>
              <li>If you are signed in with a phone number, to send you a WhatsApp reminder about a product you viewed.</li>
            </ul>

            <h2>Service Providers</h2>
            <p>We share information with the following providers only as needed to run this website:</p>
            <ul>
              <li><strong>Shopify</strong> — product catalogue, customer and business accounts, bag, checkout and orders. Payments are handled on the checkout page by the payment provider configured there; we do not receive or store your card details.</li>
              <li><strong>Lovable Cloud</strong> — stores enquiries, quote requests, uploaded files, reviews, saved products and business account details.</li>
              <li><strong>Resend</strong> — sends enquiry and quote confirmation emails and internal notifications.</li>
              <li><strong>Meta (Facebook)</strong> — the Meta Pixel and Conversions API record events such as page views, add to cart, checkout started and enquiries, to measure our advertising. Where available, a scrambled (hashed) version of your email or phone number may be sent to help match these events.</li>
              <li><strong>Google Analytics</strong> — records website traffic and ecommerce interaction events (page views, item views, bag additions and checkout starts) anonymously to help us understand storefront performance. Sensitive form entries, payment credentials and customer passwords are never collected.</li>
              <li><strong>Remove.bg</strong> — if you upload a logo to preview a branded product, the image is sent to this service to remove its background.</li>
              <li><strong>KwikEngage</strong> — sends WhatsApp messages on our behalf.</li>
            </ul>

            <h2>Cookies</h2>
            <p>
              We use cookies and browser storage to keep you signed in, remember your bag and record the analytics and advertising events described above. You can block or delete cookies in your browser settings, but parts of the website, such as the bag and sign-in, may then stop working.
            </p>

            <h2>Data Security</h2>
            <p>
              We take reasonable steps to protect your information, but no method of transmission or storage over the internet is completely secure.
            </p>

            <h2>Your Rights</h2>
            <p>
              You can view and update your account details from your account page. To request access to, correction of or deletion of your information, email us using the contact details below.
            </p>

            <h2>Contact Information</h2>
            <p>
              If you have questions about this policy, email us at care@officeneed.in.
            </p>

            <h2>Updates to this Policy</h2>
            <p>
              We may update this policy from time to time. The "Last Updated" date at the top shows when it was last changed.
            </p>

          </div>
        </div>
      </section>


      <Footer />
    </main>
  );
}
