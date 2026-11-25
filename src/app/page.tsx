import { Header } from "@/sections/Header";
import { Hero } from "@/sections/Hero";
import { LogoTicker } from "@/sections/LogoTicker";
import { Features } from "@/sections/Features";
import { Testimonials } from "@/sections/Testimonials";
import { CallToAction } from "@/sections/CallToAction";
import { Footer } from "@/sections/Footer";
import { Solutions } from "@/sections/Solutions";
import { KeyBenefits } from "@/sections/KeyBenefits";
import { Insights } from "@/sections/Insights";
import { AdvancedFeatures } from "@/sections/AdvancedFeatures";
import CopilotPopupClient from "@/components/CopilotPopupClient";
import ContactForm from "@/components/ContactForm";
import { Modules } from "@/sections/Modules";
import PlatformFeaturesPage from "@/components/platformFeaturesPage";
import AdditionalFeaturesPage from "@/components/additionalFeatures";
import SystemOfIntelligence from "@/sections/SystemofIntelligence";
import type { Metadata } from "next";
import { FAQSchema } from "@/components/SEOSchemas";
import { ServiceJsonLd, ReviewJsonLd } from "@/components/JsonLd";
import { getAllBlogPosts } from "@/lib/blogs";
//changes
export const metadata: Metadata = {
  title: "Space AI - AI Construction Management Platform",
  description:
    "Space AI is the leading AI construction management platform for scheduling, cost tracking, and delivery. Predict delays 45 days ahead. Free tier available.",
  keywords: [
    "space ai",
    "ai construction management",
    "construction management software",
    "best construction management software",
    "construction project management software",
    "construction software",
    "project management software for construction",
    "building project management software",
    "ai project management",
    "construction management system",
    "construction management platform",
    "ai construction software",
  ],
  alternates: {
    canonical: "https://pmspace.ai",
  },
  openGraph: {
    title: "Space AI - AI Construction Management Platform",
    description: "Space AI - The #1 AI construction management platform. Predict delays 45 days ahead, optimize schedules, and deliver projects on time. Free tier available.",
    url: "https://pmspace.ai",
    type: "website",
    images: [
      {
        url: "https://pmspace.ai/assets/images/og-image.jpeg",
        width: 1200,
        height: 630,
        alt: "Space AI - AI Construction Management Platform",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Space AI - AI Construction Management Platform",
    description: "Space AI - The #1 AI construction management platform. Predict delays 45 days ahead. Free tier available.",
    images: ["https://pmspace.ai/assets/images/og-image.jpeg"],
  },
};

import React from "react";
import Locations from "@/sections/Locations";

const homeFAQs = [
  {
    question: "Does Space AI replace Oracle Primavera?",
    answer: "Yes, Space AI is a modern alternative to  Oracle Primavera P6. It offers AI-driven predictive scheduling that is easier to use while providing powerful Critical Path Method (CPM) capabilities, often recovering 10-15% of schedule time compared to legacy tools."
  },
  {
    question: "Is Space AI compatible with Revit and BIM?",
    answer: "Absolutely. Space  AI integrates directly with Autodesk Revit and other BIM tools (IFC/BCF standards). You can visualize 3D models alongside your schedule and costs, enabling 4D and 5D BIM workflows without leaving the platform."
  },
  {
    question: "How does Space AI predict construction delays?",
    answer: "Space AI analyzes historical project data, weather patterns, and real-time site progress to identify risks before they happen. Its machine learning engine flags potential bottlenecks—like supply chain issues or labor shortages—weeks in advance."
  },
  {
    question: "Can I use Space AI for small contractors?",
    answer: "Yes, Space AI scales from small specialty contractors to massive infrastructure projects. Our 'Starter' plan is free for up to 3 projects, making it perfect for smaller teams to digitize their daily logs, RFIs, and scheduling."
  },
  {
    question: "How long does it take to implement Space AI on a project?",
    answer: "Most teams are up and running within a few days. Space AI imports existing schedules, documents, and contacts, so you can start predicting delays and tracking costs in the first week without a long implementation cycle."
  },
  {
    question: "Does Space AI integrate with existing construction software?",
    answer: "Yes. Space AI connects with common construction tools and file formats, including BIM/IFC models, spreadsheets, and document repositories, so teams can adopt connected workflows without replacing every system at once."
  },
  {
    question: "What kind of ROI can I expect from Space AI?",
    answer: "Teams typically see fewer schedule overruns and reduced coordination time. By predicting delays weeks in advance, Space AI helps recover schedule time and cut administrative effort across project controls workflows."
  }
];

export default function Home() {
  const enableCopilot = Boolean(process.env.NEXT_PUBLIC_COPILOTKIT_PUBLIC_API_KEY);
  const latestBlogPosts = getAllBlogPosts()
    .slice()
    .sort((a, b) => (b.datePublished || "").localeCompare(a.datePublished || ""))
    .slice(0, 3)
    .map(({ slug, title, description, imageSrc, href, datePublished, linkedinPostUrl, linkedinOrigin }) => ({
      slug,
      title,
      description,
      imageSrc,
      href,
      datePublished,
      linkedinPostUrl,
      linkedinOrigin,
    }));

  return ( 
    <div className="overflow-x-hidden">
      <FAQSchema faqs={homeFAQs} />
    <ServiceJsonLd serviceName="AI Construction Management Software" description="AI-powered construction management platform for scheduling, cost tracking, document workflows, and predictive project controls." areaServed={["Worldwide"]} />
    <ServiceJsonLd serviceName="Construction Scheduling" description="AI-driven predictive scheduling, critical path management, and delay risk detection for construction projects." areaServed={["Worldwide"]} />
    <ServiceJsonLd serviceName="Construction Cost Management" description="Budget visibility, cost reporting, and forward-looking project controls for construction delivery." areaServed={["Worldwide"]} />
    <ServiceJsonLd serviceName="Construction Document Management" description="Centralized project knowledge, retrieval, and connected document workflows." areaServed={["Worldwide"]} />
    <ServiceJsonLd serviceName="RFI and Submittals Management" description="Approval workflows and coordination visibility for requests and submittals." areaServed={["Worldwide"]} />
    <ReviewJsonLd reviews={[
      { author: 'Robert "Bobby" Diaz', reviewBody: "We were managing three commercial build-outs with Excel and buried emails. In two days on the Space AI free trial, our RFIs were centralized and the chaos finally stopped.", ratingValue: 5, datePublished: "2026-01-15" },
      { author: "Sarah Jenkins", reviewBody: "I typed one sentence for a concrete safety checklist, and Space AI built a mobile-ready form in seconds. My field crew actually uses it from the job site.", ratingValue: 5, datePublished: "2026-02-10" },
      { author: "Marcus Vance", reviewBody: "Procore was too expensive for our team. Space AI gave us a risk-free way to test real document management, contracts, and submittals from my phone.", ratingValue: 5, datePublished: "2026-03-05" },
    ]} />
  
    <Hero  />
    <SystemOfIntelligence showFreeTierVideo />
    <Solutions/>
    <PlatformFeaturesPage/>
    <KeyBenefits/>
    <Testimonials />
    <Insights posts={latestBlogPosts}/>
    {/* <Modules/> */}
    {/* <AdditionalFeaturesPage/> */}
    {/* <AdvancedFeatures/> */}
     <Locations/>
     <section className="relative overflow-hidden bg-black py-16 sm:py-20">
      <div className="absolute inset-0 bg-[url('/assets/images/contact-ai-black-background.png')] bg-cover bg-center opacity-70" />
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
       <ContactForm enableCopilot={enableCopilot} />
      </div>
     </section>
    
  
    {/* <LogoTicker />
    <Features />
    <CallToAction /> */}
     {enableCopilot ? (
     <div className="relative z-50">
        <CopilotPopupClient />
      </div>
     ) : null}
    </div>
  );
}
