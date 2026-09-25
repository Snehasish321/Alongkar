import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

export interface HeroSectionProps {
  startAnimation?: boolean;
}

const LUXURY_EASE = [0.16, 1, 0.3, 1] as const;

export const HeroSection: React.FC<HeroSectionProps> = ({ startAnimation = true }) => {
  const animateState = startAnimation ? 'visible' : 'hidden';

  return (
    <section className="relative w-full h-[calc(100vh-80px)] min-h-[580px] max-h-[960px] overflow-hidden bg-neutral-900 select-none">
      {/* Editorial Hero Background Image with Subtle Cinematic Scale */}
      <motion.img
        src="/hero-campaign.jpg"
        alt="Alongkar Luxury Campaign"
        className="w-full h-full object-cover object-center"
        initial={{ scale: 1.12, filter: 'brightness(0.75)' }}
        animate={{ scale: 1, filter: 'brightness(0.94)' }}
        transition={{ duration: 1.8, ease: LUXURY_EASE }}
        loading="eager"
      />

      {/* Atmospheric vignette & contrast gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/35 pointer-events-none" />
      <div className="absolute inset-0 bg-radial-[circle_at_center] from-transparent via-transparent to-black/40 pointer-events-none" />

      {/* Split Editorial Typography Overlay */}
      <div className="absolute inset-0 flex items-center justify-between px-5 sm:px-10 md:px-14 lg:px-20 pointer-events-none z-10">
        
        {/* Left Headline: ROYAL HEIRLOOMS */}
        <motion.div
          initial="hidden"
          animate={animateState}
          className="max-w-[48%] sm:max-w-[45%] flex flex-col items-start"
        >
          {/* Eyebrow with Expanding Gold Line */}
          <div className="flex items-center gap-2 mb-2 sm:mb-3 overflow-hidden">
            <motion.span
              variants={{
                hidden: { opacity: 0, x: -15, letterSpacing: '0.15em' },
                visible: {
                  opacity: 1,
                  x: 0,
                  letterSpacing: '0.3em',
                  transition: { duration: 0.8, delay: 0.2, ease: LUXURY_EASE },
                },
              }}
              className="text-[#D4AF37] text-[9px] sm:text-xs tracking-[0.3em] font-semibold uppercase block drop-shadow-xs"
            >
              Haute City Gold
            </motion.span>
            <motion.span
              variants={{
                hidden: { scaleX: 0, opacity: 0 },
                visible: {
                  scaleX: 1,
                  opacity: 1,
                  transition: { duration: 0.8, delay: 0.35, ease: LUXURY_EASE },
                },
              }}
              className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/70 origin-left hidden sm:inline-block"
            />
          </div>

          {/* Masked Line 1: ROYAL */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <motion.h1
              variants={{
                hidden: { y: '115%', opacity: 0, rotate: 2 },
                visible: {
                  y: '0%',
                  opacity: 1,
                  rotate: 0,
                  transition: { duration: 1.05, delay: 0.3, ease: LUXURY_EASE },
                },
              }}
              className="text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md"
            >
              ROYAL
            </motion.h1>
          </div>

          {/* Masked Line 2: HEIRLOOMS */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <motion.span
              variants={{
                hidden: { y: '115%', opacity: 0, rotate: 2 },
                visible: {
                  y: '0%',
                  opacity: 1,
                  rotate: 0,
                  transition: { duration: 1.05, delay: 0.42, ease: LUXURY_EASE },
                },
              }}
              className="block text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md"
            >
              HEIRLOOMS
            </motion.span>
          </div>
        </motion.div>

        {/* Right Headline: TIMELESS RADIANCE */}
        <motion.div
          initial="hidden"
          animate={animateState}
          className="max-w-[48%] sm:max-w-[45%] flex flex-col items-end text-right"
        >
          {/* Eyebrow with Expanding Gold Line */}
          <div className="flex items-center justify-end gap-2 mb-2 sm:mb-3 overflow-hidden">
            <motion.span
              variants={{
                hidden: { scaleX: 0, opacity: 0 },
                visible: {
                  scaleX: 1,
                  opacity: 1,
                  transition: { duration: 0.8, delay: 0.45, ease: LUXURY_EASE },
                },
              }}
              className="h-[1px] w-6 sm:w-10 bg-[#D4AF37]/70 origin-right hidden sm:inline-block"
            />
            <motion.span
              variants={{
                hidden: { opacity: 0, x: 15, letterSpacing: '0.15em' },
                visible: {
                  opacity: 1,
                  x: 0,
                  letterSpacing: '0.3em',
                  transition: { duration: 0.8, delay: 0.3, ease: LUXURY_EASE },
                },
              }}
              className="text-[#D4AF37] text-[9px] sm:text-xs tracking-[0.3em] font-semibold uppercase block drop-shadow-xs"
            >
              Bengal Mastercraft
            </motion.span>
          </div>

          {/* Masked Line 1: TIMELESS */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <motion.h2
              variants={{
                hidden: { y: '115%', opacity: 0, rotate: -2 },
                visible: {
                  y: '0%',
                  opacity: 1,
                  rotate: 0,
                  transition: { duration: 1.05, delay: 0.4, ease: LUXURY_EASE },
                },
              }}
              className="text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md"
            >
              TIMELESS
            </motion.h2>
          </div>

          {/* Masked Line 2: RADIANCE */}
          <div className="overflow-hidden py-0.5 sm:py-1">
            <motion.span
              variants={{
                hidden: { y: '115%', opacity: 0, rotate: -2 },
                visible: {
                  y: '0%',
                  opacity: 1,
                  rotate: 0,
                  transition: { duration: 1.05, delay: 0.52, ease: LUXURY_EASE },
                },
              }}
              className="block text-white font-extrabold text-3xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl tracking-[-0.03em] uppercase leading-[0.92] drop-shadow-md"
            >
              RADIANCE
            </motion.span>
          </div>
        </motion.div>
      </div>

      {/* Bottom Center: Minimalist Action (SHOP NOW) */}
      <motion.div
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.85, delay: 0.85, ease: LUXURY_EASE }}
        className="absolute bottom-8 sm:bottom-12 inset-x-0 flex flex-col items-center justify-center z-20 pointer-events-auto"
      >
        <Link
          to="/shop"
          className="group relative inline-flex flex-col items-center text-white text-xs sm:text-sm tracking-[0.26em] uppercase font-semibold transition-transform duration-200 hover:scale-105 active:scale-95 drop-shadow-md"
        >
          <span>SHOP NOW</span>
          <span className="w-full h-[1.5px] bg-[#D4AF37] scale-x-0 group-hover:scale-x-100 transition-transform duration-300 origin-center mt-1" />
        </Link>
      </motion.div>

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
