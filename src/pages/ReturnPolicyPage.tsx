import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ChevronDown,
  Check,
  RotateCcw,
  Truck,
  Clock,
  ShieldCheck,
  Sparkles,
  HelpCircle,
  PackageCheck,
  AlertCircle,
} from 'lucide-react';
import { StorefrontLayout } from '../components/layout/StorefrontLayout';

interface FaqItem {
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    question: 'How many days do I have to return my order?',
    answer:
      'You can raise a return request within 7 days from the date your order is delivered.',
  },
  {
    question: 'Can I return a discounted or sale product?',
    answer:
      'Yes. Sale and discounted jewellery purchased from Alongkar is also eligible for return within the 7-day return window.',
  },
  {
    question: 'Do I have to pay for return shipping?',
    answer: 'No. Alongkar covers the applicable return shipping cost.',
  },
  {
    question: 'Will my return be picked up from my home?',
    answer:
      'Alongkar will arrange a doorstep reverse pickup where courier service is available at your address. If pickup is unavailable for your location, we will provide an alternative return method.',
  },
  {
    question: 'When will my refund be initiated?',
    answer:
      'Alongkar will initiate the refund within 2–3 days after successful pickup. The time for the amount to reflect in your account may vary depending on your payment method and bank or payment provider.',
  },
  {
    question: 'Is there a minimum order value for returns?',
    answer: 'No. Alongkar does not impose a minimum order value for requesting a return.',
  },
  {
    question: 'Is there a maximum order value for returns?',
    answer: 'No. Alongkar does not impose a maximum order value for returns.',
  },
  {
    question: 'What if I receive a damaged or incorrect product?',
    answer:
      "Damaged and incorrect products are also covered by Alongkar's return policy. Raise your return request within 7 days of delivery.",
  },
  {
    question: 'Can I exchange my jewellery for another product?',
    answer:
      'No. Alongkar currently supports returns only and does not offer product exchanges.',
  },
];

const POLICY_SNAPSHOT_ITEMS = [
  {
    title: '7-Day Window',
    description: 'Your return request must be raised within 7 days of delivery.',
  },
  {
    title: 'All Jewellery Eligible',
    description: 'All Alongkar jewellery orders are eligible for return within the return window.',
  },
  {
    title: 'Sale Orders Included',
    description: 'Discounted and sale purchases are also eligible for return.',
  },
  {
    title: 'Free Return Pickup',
    description: 'Alongkar covers the applicable return shipping cost.',
  },
  {
    title: 'No Minimum Order',
    description: 'There is no minimum order value required to request a return.',
  },
  {
    title: 'No Maximum Order',
    description: 'There is no maximum order value for returns.',
  },
];

const PROCESS_STEPS = [
  {
    number: '01',
    title: 'Raise your return request',
    description: 'Submit your return request within 7 days of receiving your order.',
  },
  {
    number: '02',
    title: 'We arrange the return',
    description:
      'Alongkar will arrange a reverse pickup through its logistics partner where pickup service is available.',
  },
  {
    number: '03',
    title: 'Your refund is initiated',
    description:
      'After successful pickup, Alongkar will initiate your refund within 2–3 days.',
  },
];

const REFUND_FLOW_STAGES = [
  { step: '1', title: 'Return request submitted' },
  { step: '2', title: 'Return pickup completed' },
  { step: '3', title: 'Refund initiated within 2–3 days' },
  { step: '4', title: 'Amount reaches your original payment method' },
];

export const ReturnPolicyPage: React.FC = () => {
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  useEffect(() => {
    document.title = '7-Day Return Policy | Alongkar';
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute(
        'content',
        "Learn about Alongkar's 7-day jewellery return policy, return pickup process, shipping coverage, and refund timeline."
      );
    }
  }, []);

  const toggleFaq = (index: number) => {
    setOpenFaqIndex((prev) => (prev === index ? null : index));
  };

  return (
    <StorefrontLayout>
      <div className="min-h-screen bg-[#FFFDF8] text-[#211A17]">
        {/* ── Breadcrumb & Editorial Hero ── */}
        <section className="border-b border-[#E8C98A]/25 bg-gradient-to-b from-[#F7F2EA]/70 to-[#FFFDF8] pt-8 pb-12 sm:pt-10 sm:pb-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-5xl mx-auto">
            {/* Breadcrumb Navigation */}
            <nav className="flex items-center gap-2 text-xs text-[#8C6C38] mb-6" aria-label="Breadcrumb">
              <Link to="/" className="hover:text-[#211A17] transition-colors">
                Home
              </Link>
              <span>/</span>
              <span className="font-semibold text-[#211A17]">Return Policy</span>
            </nav>

            {/* Hero Header Content */}
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#FAF0DC] border border-[#E8C98A]/50 text-[#8C6C38] text-[11px] font-semibold uppercase tracking-[0.2em] mb-4">
                <Sparkles size={13} className="text-[#B08D57]" />
                <span>ALONGKAR CARE</span>
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-normal text-[#211A17] tracking-tight leading-tight">
                7-Day Return Policy
              </h1>

              <p className="text-base sm:text-lg text-[#5C4A2A] mt-4 font-light leading-relaxed">
                We want you to love what you ordered. If something isn't right, we're here to make your return simple.
              </p>

              <p className="text-xs sm:text-sm text-[#8C6C38] mt-2 font-light">
                Every Alongkar jewellery order can be returned within 7 days of delivery.
              </p>
            </div>

            {/* Trust Statistics Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mt-8 sm:mt-10">
              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E8C98A]/35 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#8C6C38] shrink-0">
                    <Clock size={20} />
                  </div>
                  <div>
                    <div className="font-serif text-xl sm:text-2xl font-bold text-[#211A17]">7 Days</div>
                    <div className="text-xs text-[#8C6C38] font-light">Return Window</div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E8C98A]/35 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#8C6C38] shrink-0">
                    <Truck size={20} />
                  </div>
                  <div>
                    <div className="font-serif text-xl sm:text-2xl font-bold text-[#211A17]">₹0</div>
                    <div className="text-xs text-[#8C6C38] font-light">Return Shipping</div>
                  </div>
                </div>
              </div>

              <div className="p-4 sm:p-5 rounded-xl bg-white border border-[#E8C98A]/35 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#8C6C38] shrink-0">
                    <RotateCcw size={20} />
                  </div>
                  <div>
                    <div className="font-serif text-xl sm:text-2xl font-bold text-[#211A17]">2–3 Days</div>
                    <div className="text-xs text-[#8C6C38] font-light">Refund Initiation</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Main Policy Content ── */}
        <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14 space-y-12 sm:space-y-16">
          
          {/* 1. Quick Answer Card */}
          <section aria-labelledby="quick-answer-title">
            <div className="p-6 sm:p-8 rounded-2xl bg-gradient-to-br from-[#FAF0DC]/90 via-[#FAF7F2] to-[#FFFDF8] border border-[#E8C98A]/60 shadow-xs">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-full bg-[#E8C98A]/30 flex items-center justify-center text-[#8C6C38] shrink-0 mt-0.5">
                  <HelpCircle size={22} />
                </div>
                <div className="space-y-2">
                  <h2 id="quick-answer-title" className="font-serif text-lg sm:text-xl font-semibold text-[#211A17]">
                    Can I return my Alongkar order?
                  </h2>
                  <p className="text-xs sm:text-sm text-[#5C4A2A] font-light leading-relaxed">
                    Yes. All Alongkar jewellery orders are eligible for return within 7 days from the date of delivery.
                  </p>
                  <p className="text-xs sm:text-sm font-semibold text-[#8C6C38] pt-1">
                    ✨ Alongkar covers the return shipping cost.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* 2. Policy Snapshot */}
          <section aria-labelledby="policy-snapshot-title" className="space-y-6">
            <div className="border-b border-[#E8C98A]/25 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block mb-1">
                POLICY SNAPSHOT
              </span>
              <h2 id="policy-snapshot-title" className="font-serif text-2xl sm:text-3xl text-[#211A17] font-normal">
                Everything you need to know
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {POLICY_SNAPSHOT_ITEMS.map((item) => (
                <div
                  key={item.title}
                  className="p-5 rounded-xl bg-white border border-[#E8C98A]/30 shadow-2xs hover:border-[#E8C98A]/60 transition-colors space-y-1.5"
                >
                  <h3 className="font-serif text-base font-semibold text-[#211A17]">
                    {item.title}
                  </h3>
                  <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                    {item.description}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* 3. Return Process Timeline */}
          <section aria-labelledby="process-title" className="space-y-6">
            <div className="border-b border-[#E8C98A]/25 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block mb-1">
                STEP-BY-STEP
              </span>
              <h2 id="process-title" className="font-serif text-2xl sm:text-3xl text-[#211A17] font-normal">
                How your return works
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              {PROCESS_STEPS.map((step, idx) => (
                <div
                  key={step.number}
                  className="p-6 rounded-2xl bg-[#FAF7F2] border border-[#E8C98A]/35 shadow-xs flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-3">
                    <div className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-[#211A17] text-[#FAF7F2] text-xs font-mono font-bold">
                      {step.number}
                    </div>
                    <h3 className="font-serif text-base font-semibold text-[#211A17]">
                      {step.title}
                    </h3>
                    <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                      {step.description}
                    </p>
                  </div>

                  {idx < PROCESS_STEPS.length - 1 && (
                    <div className="hidden md:flex items-center text-[10px] text-[#8C6C38] font-medium pt-2">
                      <span>Next step</span>
                      <ArrowRight size={12} className="ml-1" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 4. Eligibility Details & Small Request */}
          <section aria-labelledby="eligibility-title" className="space-y-6">
            <div className="border-b border-[#E8C98A]/25 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block mb-1">
                CLEAR TERMS
              </span>
              <h2 id="eligibility-title" className="font-serif text-2xl sm:text-3xl text-[#211A17] font-normal">
                Your return eligibility
              </h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Eligibility points list (8 cols) */}
              <div className="lg:col-span-7 bg-white p-6 sm:p-8 rounded-2xl border border-[#E8C98A]/30 shadow-xs space-y-4">
                <p className="text-xs sm:text-sm text-[#5C4A2A] font-light leading-relaxed">
                  Alongkar keeps returns simple. Every jewellery order is eligible for return when the request is raised within 7 days of delivery.
                </p>

                <ul className="space-y-3 pt-2">
                  {[
                    'The return request must be raised within 7 days from the date of delivery.',
                    'All jewellery products are eligible for return.',
                    'Sale and discounted products are also eligible.',
                    'There is no minimum order value for requesting a return.',
                    'There is no maximum order value for requesting a return.',
                    'Damaged or incorrect products can also be returned.',
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2.5 text-xs text-[#211A17]">
                      <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Check size={12} strokeWidth={2.5} />
                      </div>
                      <span className="leading-relaxed font-light">{point}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* A small request from us (5 cols) */}
              <div className="lg:col-span-5 bg-[#FAF0DC]/70 p-6 sm:p-8 rounded-2xl border border-[#E8C98A]/50 shadow-xs flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-[#8C6C38]">
                    <PackageCheck size={20} />
                    <h3 className="font-serif text-base font-semibold text-[#211A17]">
                      A small request from us
                    </h3>
                  </div>
                  <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                    Please keep your jewellery and its original packaging safely prepared until the return pickup.
                  </p>
                </div>

                <div className="pt-4 border-t border-[#E8C98A]/30 flex items-center gap-2 text-[11px] text-[#8C6C38]">
                  <ShieldCheck size={15} className="shrink-0 text-[#B08D57]" />
                  <span>Complimentary pickup insured by Alongkar</span>
                </div>
              </div>
            </div>
          </section>

          {/* 5. Damaged or Wrong Item & Return Pickup Cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Damaged or Incorrect Item */}
            <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#E8C98A]/35 shadow-xs space-y-3">
              <div className="w-9 h-9 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#8C6C38]">
                <Sparkles size={18} />
              </div>
              <h3 className="font-serif text-lg font-semibold text-[#211A17]">
                Something isn't right?
              </h3>
              <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                If your jewellery arrives damaged or you receive a different product than the one you ordered, don't worry. These orders are also covered by Alongkar's return policy.
              </p>
              <p className="text-xs text-[#8C6C38] font-light pt-1">
                Raise your return request within the 7-day return window and we'll guide you through the next steps.
              </p>
            </div>

            {/* Reverse Pickup */}
            <div className="p-6 sm:p-8 rounded-2xl bg-white border border-[#E8C98A]/35 shadow-xs space-y-3">
              <div className="w-9 h-9 rounded-full bg-[#FAF0DC] flex items-center justify-center text-[#8C6C38]">
                <Truck size={18} />
              </div>
              <h3 className="font-serif text-lg font-semibold text-[#211A17]">
                How will my return be picked up?
              </h3>
              <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                Alongkar will arrange a reverse pickup through its logistics partner, subject to courier serviceability at your delivery address.
              </p>
              <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                If doorstep pickup is not available for your location, Alongkar will provide an alternative return method. You do not need to arrange or pay for the return shipping yourself.
              </p>
              <div className="pt-2 text-xs font-semibold text-[#8C6C38]">
                Return shipping is covered by Alongkar.
              </div>
            </div>
          </section>

          {/* 6. Refund Timeline Section */}
          <section aria-labelledby="refund-title" className="p-6 sm:p-8 rounded-2xl bg-[#FAF7F2] border border-[#E8C98A]/35 shadow-xs space-y-6">
            <div className="border-b border-[#E8C98A]/25 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block mb-1">
                TRANSPARENT REFUNDS
              </span>
              <h2 id="refund-title" className="font-serif text-2xl text-[#211A17] font-normal">
                When will I receive my refund?
              </h2>
            </div>

            {/* Horizontal 4-Stage Flow */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {REFUND_FLOW_STAGES.map((stage) => (
                <div
                  key={stage.step}
                  className="p-4 rounded-xl bg-white border border-[#E8C98A]/25 space-y-2 shadow-2xs"
                >
                  <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#FAF0DC] text-[#63481A]">
                    Stage {stage.step}
                  </span>
                  <p className="text-xs font-medium text-[#211A17] leading-snug">
                    {stage.title}
                  </p>
                </div>
              ))}
            </div>

            <p className="text-xs text-[#5C4A2A] font-light leading-relaxed pt-2">
              Alongkar will initiate the refund within 2–3 days after successful pickup. The time taken for the refunded amount to appear in your account may vary depending on your original payment method, bank, or payment provider.
            </p>
          </section>

          {/* 7. No Exchange Notice Banner */}
          <section aria-label="Policy Note" className="p-4 sm:p-5 rounded-xl bg-[#FAF0DC]/80 border border-[#E8C98A]/45 flex items-start gap-3 text-[#211A17]">
            <AlertCircle size={18} className="text-[#8C6C38] shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="font-serif text-sm font-semibold text-[#211A17]">
                Please note
              </h4>
              <p className="text-xs text-[#5C4A2A] font-light leading-relaxed">
                Alongkar currently offers returns only. We do not offer product exchanges.
              </p>
            </div>
          </section>

          {/* 8. Frequently Asked Questions Accordion */}
          <section aria-labelledby="faq-title" className="space-y-6">
            <div className="border-b border-[#E8C98A]/25 pb-3">
              <span className="text-[10px] uppercase font-bold tracking-[0.2em] text-[#B08D57] block mb-1">
                HELP CENTER
              </span>
              <h2 id="faq-title" className="font-serif text-2xl sm:text-3xl text-[#211A17] font-normal">
                Frequently asked questions
              </h2>
            </div>

            <div className="space-y-3" role="tablist">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = openFaqIndex === idx;
                const faqId = `faq-q-${idx}`;
                const panelId = `faq-a-${idx}`;

                return (
                  <div
                    key={faq.question}
                    className="rounded-xl border border-[#E8C98A]/35 bg-white overflow-hidden transition-colors"
                  >
                    <button
                      id={faqId}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => toggleFaq(idx)}
                      className="w-full p-4 sm:p-5 text-left flex items-center justify-between gap-4 hover:bg-[#FAF7F2] transition-colors cursor-pointer"
                    >
                      <span className="font-serif text-sm sm:text-base font-medium text-[#211A17]">
                        {faq.question}
                      </span>
                      <ChevronDown
                        size={18}
                        className={`text-[#8C6C38] shrink-0 transition-transform duration-250 ${
                          isOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>

                    {isOpen && (
                      <div
                        id={panelId}
                        role="region"
                        aria-labelledby={faqId}
                        className="px-4 pb-4 sm:px-5 sm:pb-5 pt-1 text-xs sm:text-sm text-[#5C4A2A] font-light leading-relaxed border-t border-[#E8C98A]/15 animate-fade-in"
                      >
                        {faq.answer}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* 9. Final Call to Action */}
          <section aria-labelledby="cta-title" className="p-8 sm:p-12 rounded-2xl bg-gradient-to-b from-[#211A17] to-[#2E2420] text-[#FAF7F2] border border-[#E8C98A]/30 shadow-elevated text-center space-y-5">
            <div className="max-w-xl mx-auto space-y-2.5">
              <h2 id="cta-title" className="font-serif text-2xl sm:text-3xl font-normal text-[#FAF7F2]">
                Need to return something?
              </h2>
              <p className="text-xs sm:text-sm text-[#E8C98A]/85 font-light leading-relaxed">
                Start your return request and we'll guide you through the process.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <Link
                to="/orders"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#E8C98A] text-[#211A17] text-xs font-semibold uppercase tracking-wider hover:bg-[#F0D9A8] transition-all shadow-md cursor-pointer"
              >
                <span>Start a Return</span>
                <ArrowRight size={14} />
              </Link>

              <Link
                to="/contact"
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[#E8C98A]/40 text-[#FAF7F2] text-xs font-semibold uppercase tracking-wider hover:bg-white/10 transition-all cursor-pointer"
              >
                <span>Contact Alongkar</span>
              </Link>
            </div>

            <p className="text-[11px] text-[#E8C98A]/60 font-light pt-1">
              Keep your order number handy so we can help you faster.
            </p>
          </section>

        </main>
      </div>
    </StorefrontLayout>
  );
};
