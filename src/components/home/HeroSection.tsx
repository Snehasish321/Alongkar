import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export interface HeroSectionProps {
  startAnimation?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = () => {
  return (
    <section className="relative w-full h-[calc(100vh-80px)] min-h-[580px] max-h-[960px] overflow-hidden bg-neutral-900 select-none">
      {/* Editorial Hero Background Image */}
      <img
        src="/hero-campaign.jpg"
        alt="Alongkar Luxury Campaign"
        className="w-full h-full object-cover object-center brightness-[0.94]"
        loading="eager"
      />

      {/* Subtle vignette / atmospheric overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 pointer-events-none" />

      {/* Split Editorial Typography Overlay */}
      <div className="absolute inset-0 flex items-center justify-between px-6 sm:px-12 md:px-16 lg:px-20 pointer-events-none z-10">
        
        {/* Left Headline */}
        <motion.div
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          className="max-w-[45%]"
        >
          <span className="block text-[#D4AF37] text-[10px] sm:text-xs tracking-[0.3em] font-semibold uppercase mb-2">
            Haute City Gold
          </span>
          <h1 className="text-white font-extrabold text-2xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl tracking-[-0.02em] uppercase leading-[0.95] drop-shadow-md">
            ROYAL HEIRLOOMS
          </h1>
        </motion.div>

        {/* Right Headline */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
          className="max-w-[45%] text-right"
        >
          <span className="block text-[#D4AF37] text-[10px] sm:text-xs tracking-[0.3em] font-semibold uppercase mb-2">
            Bengal Mastercraft
          </span>
          <h2 className="text-white font-extrabold text-2xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl tracking-[-0.02em] uppercase leading-[0.95] drop-shadow-md">
            TIMELESS RADIANCE
          </h2>
        </motion.div>
      </div>

      {/* Bottom Center: Minimalist Action (SHOP NOW) */}
      <div className="absolute bottom-8 sm:bottom-12 inset-x-0 flex flex-col items-center justify-center z-20">
        <Link
          to="/shop"
          className="group relative inline-flex flex-col items-center text-white text-xs sm:text-sm tracking-[0.24em] uppercase font-semibold transition-transform duration-200 hover:scale-105 active:scale-95 drop-shadow-md"
        >
          <span>SHOP NOW</span>
          <span className="w-full h-[1.5px] bg-white scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center mt-1" />
        </Link>
      </div>

      {/* WhatsApp Floating Action */}
      <a
        href="https://wa.me/919876543210?text=Hi%20Alongkar%2C%20I%20would%20like%20to%20inquire%20about%20your%20collection"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Chat with us on WhatsApp"
        className="fixed bottom-6 right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-[#25D366] hover:bg-[#20bd5a] text-white rounded-full flex items-center justify-center shadow-lg shadow-black/25 transition-all duration-300 hover:scale-110 active:scale-95"
      >
        <svg
          viewBox="0 0 24 24"
          width="28"
          height="28"
          stroke="currentColor"
          strokeWidth="0"
          fill="currentColor"
        >
          <path d="M17.472 14.382c-.301-.15-1.781-.878-2.056-.978-.276-.1-.477-.15-.678.15-.2.301-.777.978-.952 1.179-.176.2-.351.226-.652.075s-1.272-.469-2.423-1.496c-.896-.798-1.501-1.784-1.677-2.085-.176-.301-.019-.464.132-.614.136-.135.301-.351.452-.527.151-.176.201-.301.302-.502.1-.2.05-.376-.025-.527-.075-.15-.678-1.631-.929-2.233-.244-.587-.493-.507-.678-.517-.176-.01-.376-.01-.577-.01s-.527.075-.803.376c-.276.301-1.054 1.029-1.054 2.509s1.079 2.91 1.229 3.111c.15.2 2.123 3.242 5.144 4.546.719.311 1.28.497 1.718.636.723.23 1.38.198 1.9-.12.58-.354 1.781-1.308 2.032-2.056.251-.749.251-1.391.176-1.542-.075-.15-.276-.251-.577-.401m-5.467 7.406c-1.95 0-3.864-.524-5.541-1.515l-.398-.236-4.116 1.079 1.098-4.013-.258-.411a11.172 11.172 0 0 1-1.712-5.945c0-6.176 5.025-11.2 11.202-11.2 2.993 0 5.807 1.166 7.923 3.283 2.117 2.117 3.283 4.93 3.283 7.924 0 6.176-5.025 11.2-11.202 11.2m9.549-17.472C19.199 1.96 16.099.792 12.805.792c-6.634 0-12.032 5.398-12.032 12.032 0 2.119.553 4.185 1.604 6.007L.5 24l5.313-1.394c1.76 1.058 3.784 1.616 5.867 1.616h.005c6.633 0 12.032-5.398 12.032-12.032 0-3.214-1.251-6.234-3.524-8.508z" />
        </svg>
      </a>
    </section>
  );
};
