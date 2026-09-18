import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

export const AlongkarStorySection: React.FC = () => {
  return (
    <section className="py-20 bg-ivory-pearl border-y border-gold/15 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center">
          {/* Visual Column */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative"
          >
            <div className="relative aspect-[4/5] rounded-brand overflow-hidden shadow-elevated border border-gold/20">
              <img
                src="https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=1000&auto=format&fit=crop"
                alt="ALONGKAR Craftsmanship Story"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-espresso/60 via-transparent to-transparent" />
            </div>

            {/* Accent Floating Badge */}
            <div className="absolute -bottom-6 -right-6 hidden sm:flex bg-espresso text-ivory-pearl p-6 rounded-brand shadow-2xl border border-gold/30 max-w-xs flex-col space-y-1">
              <span className="text-gold font-serif text-2xl font-bold">24K Micron</span>
              <span className="text-xs text-gray-300 font-light">
                City Gold electroplating ensuring anti-tarnish radiance.
              </span>
            </div>
          </motion.div>

          {/* Narrative Column */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.25em] text-gold font-bold">
              <Sparkles size={14} />
              <span>THE ALONGKAR LEGACY</span>
            </div>

            <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-espresso leading-tight">
              Your Jewellery. <br />
              <span className="text-gold-shimmer font-serif italic">Your Story.</span>
            </h2>

            <div className="w-16 h-[2px] bg-gold/50" />

            <p className="text-sm sm:text-base text-espresso-light leading-relaxed font-light">
              Founded with the belief that true luxury lies in emotion, ALONGKAR reimagines traditional Indian jewellery for the modern woman. We specialize in high-grade city gold — combining the grandeur of Kundan, Polki, and antique temple motifs with featherlight comfort.
            </p>

            <p className="text-sm sm:text-base text-espresso-light leading-relaxed font-light">
              Every curve, stone setting, and polish is strictly inspected to ensure a flawless heirloom finish. Whether celebrating daily milestones or wedding festivities, ALONGKAR is your trusted companion.
            </p>

            <div className="pt-4 flex flex-wrap items-center gap-8 text-center sm:text-left border-t border-gold/15">
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-espresso">50,000+</span>
                <p className="text-xs text-gold uppercase tracking-wider font-semibold">Happy Women</p>
              </div>
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-espresso">100%</span>
                <p className="text-xs text-gold uppercase tracking-wider font-semibold">Quality Guarantee</p>
              </div>
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-espresso">4.9 ★</span>
                <p className="text-xs text-gold uppercase tracking-wider font-semibold">Average Rating</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
