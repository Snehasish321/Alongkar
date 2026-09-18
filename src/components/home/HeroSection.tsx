import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { SparkleParticles } from '../ui/SparkleParticles';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative min-h-[85vh] sm:min-h-[90vh] flex items-center justify-center overflow-hidden bg-espresso text-ivory-pearl">
      {/* Background Image with Warm Overlay */}
      <div className="absolute inset-0 z-0">
        <img
          src="https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=1920&auto=format&fit=crop"
          alt="ALONGKAR Premium City Gold Jewellery"
          className="w-full h-full object-cover object-center scale-105 filter brightness-[0.4] contrast-[1.05]"
        />
        {/* Cinematic Vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/40 to-espresso/70" />
      </div>

      {/* Gold Sparkle Particles Effect */}
      <SparkleParticles />

      {/* Content Container */}
      <div className="relative z-20 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center py-20 flex flex-col items-center">
        {/* Main Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 25 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
          className="font-serif text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight text-ivory-pearl max-w-4xl leading-[1.15] mb-6 drop-shadow-md"
        >
          Adornment That <br className="hidden sm:block" />
          <span className="text-gold-shimmer italic font-serif">Tells Your Story</span>
        </motion.h1>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="text-sm sm:text-lg md:text-xl font-light text-gray-200 max-w-2xl tracking-wide leading-relaxed mb-10"
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
            <Button variant="gold" size="lg" className="w-full sm:w-auto gap-2 group">
              <span>SHOP NOW</span>
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Button>
          </Link>

          <Link to="/collections" className="w-full sm:w-auto">
            <Button variant="outline" size="lg" className="w-full sm:w-auto border-ivory/40 text-ivory-pearl hover:border-gold-champagne hover:text-gold-champagne hover:bg-espresso/40">
              EXPLORE COLLECTIONS
            </Button>
          </Link>
        </motion.div>
      </div>

      {/* Bottom Scroll Indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 text-gold/60 text-[10px] uppercase tracking-[0.3em] font-medium flex flex-col items-center gap-1 z-20"
      >
        <span>SCROLL TO DISCOVER</span>
        <div className="w-4 h-6 rounded-full border border-gold/40 flex justify-center pt-1">
          <div className="w-1 h-1.5 bg-gold rounded-full" />
        </div>
      </motion.div>
    </section>
  );
};
