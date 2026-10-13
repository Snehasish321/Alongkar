import React from 'react';
import { Link } from 'react-router-dom';

export interface HeroSectionProps {
  startAnimation?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = () => {
  return (
    <section className="relative w-full h-[calc(100vh-80px)] min-h-[580px] max-h-[960px] overflow-hidden bg-neutral-900 select-none">
      {/* Editorial Hero Background Image with Subtle Cinematic Scale (CSS GPU Accelerated) */}
      <img
        src="/hero-campaign.webp"
        srcSet="/hero-campaign-mobile.webp 768w, /hero-campaign-tablet.webp 1024w, /hero-campaign.webp 1376w"
        sizes="100vw"
        alt="Alongkar Luxury Campaign"
        width={1376}
        height={768}
        className="w-full h-full object-cover object-center animate-hero-fade-scale"
        loading="eager"
        fetchPriority="high"
        decoding="async"
      />

      {/* Atmospheric vignette & contrast gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/35 pointer-events-none" />
      <div className="absolute inset-0 bg-radial-[circle_at_center] from-transparent via-transparent to-black/40 pointer-events-none" />

      {/* Split Editorial Typography Overlay */}
      <div className="absolute inset-0 flex items-center justify-between px-5 sm:px-10 md:px-14 lg:px-20 pointer-events-none z-10">
        
        {/* Left Headline: ROYAL HEIRLOOMS */}
        <div className="max-w-[48%] sm:max-w-[45%] flex flex-col items-start">
          {/* Eyebrow with Expanding Gold Line */}
          <div className="flex items-center gap-2 mb-2 sm:mb-3 overflow-hidden">
            <span className="text-[#D4AF37] text-[9px] sm:text-xs tracking-[0.3em] font-semibold uppercase block drop-shadow-xs animate-hero-eyebrow-left">
              Haute City Gold
            </span>
            <span className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/70 origin-left hidden sm:inline-block animate-hero-line-left" />
          </div>

          {/* Masked Line 1: ROYAL */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <h1 className="text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md animate-hero-title-1">
              ROYAL
            </h1>
          </div>

          {/* Masked Line 2: HEIRLOOMS */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <span className="block text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md animate-hero-title-2">
              HEIRLOOMS
            </span>
          </div>
        </div>

        {/* Right Headline: TIMELESS RADIANCE */}
        <div className="max-w-[48%] sm:max-w-[45%] flex flex-col items-end text-right">
          {/* Eyebrow with Expanding Gold Line */}
          <div className="flex items-center justify-end gap-2 mb-2 sm:mb-3 overflow-hidden">
            <span className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/70 origin-right hidden sm:inline-block animate-hero-line-right" />
            <span className="text-[#D4AF37] text-[9px] sm:text-xs tracking-[0.3em] font-semibold uppercase block drop-shadow-xs animate-hero-eyebrow-right">
              Bengal Mastercraft
            </span>
          </div>

          {/* Masked Line 1: TIMELESS */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <h2 className="text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md animate-hero-title-3">
              TIMELESS
            </h2>
          </div>

          {/* Masked Line 2: RADIANCE */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <span className="block text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md animate-hero-title-4">
              RADIANCE
            </span>
          </div>
        </div>
      </div>

      {/* Bottom Center: Minimalist Action (SHOP NOW) */}
      <div className="absolute bottom-8 sm:bottom-12 inset-x-0 flex flex-col items-center justify-center z-20 pointer-events-auto animate-hero-action">
        <Link
          to="/shop"
          className="group relative inline-flex flex-col items-center text-white text-xs sm:text-sm tracking-[0.26em] uppercase font-semibold transition-transform duration-200 hover:scale-105 active:scale-95 drop-shadow-md"
        >
          <span>SHOP NOW</span>
          <span className="w-full h-[1.5px] bg-[#D4AF37] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center mt-1" />
        </Link>
      </div>

      {/* Floating Concierge Action */}
      <Link
        to="/contact"
        aria-label="Contact Alongkar Concierge"
        className="fixed bottom-6 right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-tr from-gold-dark to-gold text-ivory-pearl rounded-full flex items-center justify-center shadow-lg shadow-black/25 transition-all duration-300 hover:scale-110 active:scale-95 border border-gold/40"
      >
        <svg
          viewBox="0 0 24 24"
          width="24"
          height="24"
          stroke="currentColor"
          strokeWidth="1.75"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </Link>
    </section>
  );
};
