import React from 'react';
import { Truck, ShieldCheck, RefreshCw, Award } from 'lucide-react';

const confidencePillars = [
  {
    icon: Truck,
    title: 'CASH ON DELIVERY',
    subtitle: 'AVAILABLE ACROSS INDIA',
    description: 'Pay securely at your doorstep with verified OTP-based dispatch on all PIN codes.',
  },
  {
    icon: RefreshCw,
    title: '7-DAY EASY EXCHANGE',
    subtitle: 'HASSLE-FREE PROCESS',
    description: 'Complimentary size or design exchanges with doorstep reverse pickup support.',
  },
  {
    icon: Award,
    title: '24K MICRON GOLD PLATING',
    subtitle: '6-MONTH POLISH WARRANTY',
    description: 'Authentic heirloom sheen with certified multi-layer anti-tarnish immersion bath.',
  },
  {
    icon: ShieldCheck,
    title: 'INSURED TRANSIT',
    subtitle: 'TAMPER-EVIDENT PACKAGING',
    description: 'Packaged in signature royal velvet coffrets with full transit protection.',
  },
];

export const ShopWithConfidence: React.FC = () => {
  return (
    <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-20 border-t border-neutral-200/60">
      <div className="text-center mb-10 sm:mb-14">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-950 uppercase">
          SHOP WITH CONFIDENCE
        </h2>
        <p className="text-[11px] sm:text-xs tracking-[0.24em] uppercase text-neutral-500 font-semibold mt-2.5">
          THE ALONGKAR PROMISE & CUSTOMER CARE STANDARDS
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
        {confidencePillars.map((pillar, idx) => {
          const Icon = pillar.icon;
          return (
            <div
              key={idx}
              className="p-7 sm:p-8 rounded-2xl bg-white border border-neutral-200/90 hover:border-neutral-900 transition-all duration-300 flex flex-col items-center text-center group shadow-xs hover:shadow-md"
            >
              <div className="w-12 h-12 rounded-full bg-neutral-950 text-white flex items-center justify-center mb-5 group-hover:scale-105 transition-transform duration-300">
                <Icon size={20} strokeWidth={1.75} />
              </div>
              <h3 className="text-sm sm:text-base font-bold tracking-tight text-neutral-950 mb-1.5 uppercase">
                {pillar.title}
              </h3>
              <span className="text-[10px] sm:text-[11px] font-semibold text-[#B08D57] tracking-wider uppercase mb-2.5">
                {pillar.subtitle}
              </span>
              <p className="text-xs text-neutral-600 leading-relaxed max-w-[260px]">
                {pillar.description}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
};
