import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { SparkleParticles } from '../ui/SparkleParticles';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center overflow-hidden hero-ak-bg">

      {/* Subtle decorative gold ornamental elements */}
      <div className="absolute inset-0 z-0 pointer-events-none">
        {/* Top-left ornamental curve */}
        <svg
          className="absolute top-0 left-0 w-[300px] sm:w-[450px] h-[300px] sm:h-[450px] opacity-[0.04]"
          viewBox="0 0 400 400"
          fill="none"
        >
          <circle cx="0" cy="0" r="350" stroke="#E8C98A" strokeWidth="0.5" />
          <circle cx="0" cy="0" r="280" stroke="#E8C98A" strokeWidth="0.3" />
        </svg>

        {/* Bottom-right ornamental curve */}
        <svg
          className="absolute bottom-0 right-0 w-[250px] sm:w-[400px] h-[250px] sm:h-[400px] opacity-[0.04]"
          viewBox="0 0 400 400"
          fill="none"
        >
          <circle cx="400" cy="400" r="350" stroke="#E8C98A" strokeWidth="0.5" />
          <circle cx="400" cy="400" r="280" stroke="#E8C98A" strokeWidth="0.3" />
        </svg>

        {/* Center ornamental diamond */}
        <svg
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] sm:w-[900px] h-[600px] sm:h-[900px] opacity-[0.025]"
          viewBox="0 0 800 800"
          fill="none"
        >
          <rect
            x="400"
            y="50"
            width="500"
            height="500"
            rx="8"
            transform="rotate(45, 400, 400)"
            stroke="#E8C98A"
            strokeWidth="0.5"
          />
        </svg>
      </div>

      {/* Gold Sparkle Particles Effect — preserved */}
      <SparkleParticles />

      {/* Content Container */}
      <div className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20 flex flex-col items-center">

        {/* Ornamental line above headline */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="w-16 h-[1px] mb-8"
          style={{
            background: 'linear-gradient(90deg, transparent, #E8C98A, transparent)',
          }}
        />

        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-serif text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl leading-[1.15] mb-6 drop-shadow-md"
          style={{ color: '#F8F1E3' }}
        >
          Adornment That <br className="hidden sm:block" />
          <span className="text-ak-gold-shimmer italic font-serif">Tells Your Story</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-sm sm:text-lg md:text-xl font-light max-w-2xl tracking-wide leading-relaxed mb-12"
          style={{ color: '#E9DDC8' }}
        >
          Timeless designs. Everyday elegance. Discover 24K micron city-gold jewellery crafted for modern Indian celebrations.
        </motion.p>

        {/* Action CTAs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full sm:w-auto"
        >
          <Link to="/shop" className="w-full sm:w-auto">
            <motion.button
              whileTap={{ scale: 0.98 }}
              className="btn-ak-gold w-full sm:w-auto inline-flex items-center justify-center gap-2.5 px-8 py-4 text-sm rounded-brand group cursor-pointer"
            >
              <span>SHOP NOW</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </Link>

          <Link to="/collections" className="w-full sm:w-auto">
            <motion.button
              whileTap={{ scale: 0.98 }}
              className="btn-ak-outline w-full sm:w-auto inline-flex items-center justify-center px-8 py-4 text-sm rounded-brand cursor-pointer"
            >
              EXPLORE COLLECTIONS
            </motion.button>
          </Link>
        </motion.div>

        {/* Ornamental line below CTA */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="w-12 h-[1px] mt-14"
          style={{
            background: 'linear-gradient(90deg, transparent, rgba(232, 201, 138, 0.25), transparent)',
          }}
        />
      </div>

      {/* Bottom Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] uppercase tracking-[0.3em] font-medium flex flex-col items-center gap-1 z-20"
        style={{ color: 'rgba(232, 201, 138, 0.5)' }}
      >
        <span>SCROLL TO DISCOVER</span>
        <div
          className="w-4 h-6 rounded-full flex justify-center pt-1"
          style={{ border: '1px solid rgba(232, 201, 138, 0.3)' }}
        >
          <div
            className="w-1 h-1.5 rounded-full"
            style={{ backgroundColor: 'rgba(232, 201, 138, 0.5)' }}
          />
        </div>
      </motion.div>
    </section>
  );
};
