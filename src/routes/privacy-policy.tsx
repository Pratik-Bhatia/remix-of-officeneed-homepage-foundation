import { createFileRoute } from "@tanstack/react-router";
import { Navbar as Nav } from "@/components/officeneed/Navbar";
import { Footer } from "@/components/officeneed/Footer";

import { motion } from "motion/react";

export const Route = createFileRoute("/privacy-policy")({
  component: PrivacyPolicyPage,
  head: () => ({
    meta: [
      { title: "Privacy Policy" },
      { name: "description", content: "Read Officeneed's Privacy Policy to understand how we collect, use, and protect your information when you interact with our website and services." },
      { property: "og:title", content: "Privacy Policy" },
      { name: "twitter:title", content: "Privacy Policy" },
    ],
  }),
});

function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-white text-foreground">
      <Nav />

      
      {/* Compact Hero */}
      <section className="relative flex min-h-[40vh] md:min-h-[50vh] flex-col items-center justify-center overflow-hidden bg-[#FAFAF8] px-6 py-24 text-center md:px-10" style={{ fontFamily: "var(--font-nexa)" }}>
        
        {/* Subtle Background Pattern */}
        <div 
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: "radial-gradient(circle at 50% 50%, var(--s-dark) 0%, transparent 60%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-3xl">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 mx-auto inline-flex items-center rounded-full border border-[rgba(0,0,0,0.06)] bg-white px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--s-dark)] shadow-sm"
          >
            LEGAL
          </motion.div>
          
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
            className="mb-6 font-display text-[32px] font-bold leading-tight tracking-tight text-[var(--s-dark)] md:text-[48px] lg:text-[56px]"
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
      <section className="py-16 md:py-20" style={{ fontFamily: "var(--font-nexa)" }}>
        <div className="mx-auto max-w-[850px] px-6 md:px-10">
          <div className="prose prose-lg mx-auto max-w-none text-[rgb(15_17_23_/_0.7)] prose-headings:text-[var(--s-dark)] prose-headings:font-bold prose-h2:mt-12 prose-h2:mb-6 prose-h2:text-[24px] prose-h2:tracking-tight md:prose-h2:text-[28px] prose-p:mb-6 prose-p:leading-[1.8] prose-p:text-[16px] prose-li:text-[16px] prose-li:marker:text-[var(--s-dark)] prose-a:text-[var(--s-dark)] hover:prose-a:text-black">
            
            <p><strong>Last Updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</strong></p>

            <h2>Introduction</h2>
            <p>
              Welcome to Officeneed. We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you visit our website, submit quote requests, download catalogues, or engage with our corporate procurement services.
            </p>

            <h2>Information We Collect</h2>
            <p>
              We collect information that you voluntarily provide to us when you express an interest in obtaining information about our services, when you participate in activities on the website, or otherwise when you contact us. The personal information that we collect depends on the context of your interactions with us and the website, the choices you make, and the products and features you use.
            </p>
            <ul>
              <li><strong>Contact Information:</strong> Name, job title, company name, email address, and phone number when you fill out contact forms or quote requests.</li>
              <li><strong>Business Information:</strong> Details regarding your procurement needs, bulk ordering requirements, and customization preferences.</li>
              <li><strong>Usage Data:</strong> Information automatically collected when you navigate through the site (e.g., IP addresses, browser types, and pages visited).</li>
            </ul>

            <h2>How We Use Information</h2>
            <p>
              We use personal information collected via our website for a variety of business purposes described below. We process your personal information for these purposes in reliance on our legitimate business interests, in order to enter into or perform a contract with you, with your consent, and/or for compliance with our legal obligations.
            </p>
            <ul>
              <li>To facilitate corporate account creation and logon processes.</li>
              <li>To fulfill and manage your orders, payments, and corporate gifting deliveries.</li>
              <li>To respond to your inquiries, quote requests, and offer tailored procurement solutions.</li>
              <li>To send you marketing and promotional communications (if you have opted in).</li>
            </ul>

            <h2>Cookies & Analytics</h2>
            <p>
              We may use cookies and similar tracking technologies to access or store information. You can set your browser to refuse all or some browser cookies or to alert you when websites set or access cookies. If you disable or refuse cookies, please note that some parts of this website may become inaccessible or not function properly. We utilize these tools primarily to understand website traffic patterns, optimize user experience, and ensure our catalogue downloads function seamlessly.
            </p>

            <h2>Third-Party Services</h2>
            <p>
              We may share your data with third-party vendors, service providers, contractors, or agents who perform services for us or on our behalf and require access to such information to do that work. Examples include: logistics and delivery partners executing Pan-India shipping, payment processors, and customer relationship management (CRM) tools used to manage your corporate account.
            </p>

            <h2>Data Security</h2>
            <p>
              We have implemented appropriate technical and organizational security measures designed to protect the security of any personal information we process. However, despite our safeguards and efforts to secure your information, no electronic transmission over the Internet or information storage technology can be guaranteed to be 100% secure, so we cannot promise or guarantee that hackers, cybercriminals, or other unauthorized third parties will not be able to defeat our security.
            </p>

            <h2>Your Rights</h2>
            <p>
              Depending on your location, you may have certain rights regarding your personal information, including the right to request access to the data we collect from you, change that information, or delete it in some circumstances. To request to review, update, or delete your personal information, please submit a request using our contact information below.
            </p>

            <h2>Contact Information</h2>
            <p>
              If you have questions or comments about this policy, you may email us at privacy@officeneed.com or contact us by post at our corporate headquarters in Maharashtra, India. If you need immediate assistance regarding an active corporate order, please reach out to your dedicated account manager.
            </p>

            <h2>Updates to this Policy</h2>
            <p>
              We may update this privacy notice from time to time. The updated version will be indicated by an updated "Last Updated" date and the updated version will be effective as soon as it is accessible. We encourage you to review this privacy notice frequently to be informed of how we are protecting your information.
            </p>

          </div>
        </div>
      </section>

      {/* Final CTA */}
      <FinalCTA 
        heading={<>Ready to streamline your<br className="hidden md:block"/> corporate procurement?</>}
        description="Connect with our experts today to set up your corporate account."
      />

      <Footer />
    </main>
  );
}
