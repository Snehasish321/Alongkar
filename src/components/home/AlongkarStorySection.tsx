import React from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Hammer, ShieldCheck, HeartHandshake } from 'lucide-react';
import { Link } from 'react-router-dom';

export const AlongkarStorySection: React.FC = () => {
  const craftPillars = [
    {
      icon: Hammer,
      title: 'Handcrafted Filigree Core',
      desc: 'Forged by third-generation Bengali artisans utilizing authentic hand-chased brass molds.',
    },
    {
      icon: ShieldCheck,
      title: '24K Micron Electroplating',
      desc: 'Multilayer immersion bath yielding deep mirror gold sheen resistant to humid climates and wear.',
    },
    {
      icon: HeartHandshake,
      title: 'Heirloom Finish Guarantee',
      desc: 'Rigorous 14-point laboratory test ensuring stone security, skin safety, and scratch resistance.',
    },
  ];

  return (
    <section className="py-24 bg-[#FDFBF7] text-[#211A17] relative overflow-hidden border-y border-[#B08D57]/20">

      {/* Subtle Background Ornamentation */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <svg className="w-full h-full" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="heritage-pattern" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M30 0 L60 30 L30 60 L0 30 Z" fill="none" stroke="#B08D57" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#heritage-pattern)" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">

          {/* Left Column: Visual Archival Frame (5 cols) */}
          <motion.div
            initial={{ opacity: 0, x: -35 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="lg:col-span-5 relative"
          >
            <div className="relative aspect-[4/5] rounded-xl overflow-hidden shadow-2xl border-2 border-[#D6B878]/30">
              <img
                src="https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=1000&auto=format&fit=crop"
                alt="ALONGKAR Craftsmanship & Heritage"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#2A0008]/70 via-transparent to-transparent" />

              {/* Bottom Quote Overlay on Photo */}
              <div className="absolute bottom-6 inset-x-6 text-white">
                <p className="font-serif italic text-sm text-[#F8F1E3] leading-snug">
                  "Every piece is born in Kolkata's historic lanes, shaped by hands carrying century-old secrets."
                </p>
                <span className="block mt-2 text-[10px] uppercase tracking-widest text-[#E8C98A] font-semibold">
                  Atelier Master Craftsman
                </span>
              </div>
            </div>

            {/* Floating Royal Seal Badge */}
            <div className="absolute -bottom-6 -right-6 hidden sm:flex bg-[#2A0008] text-[#F8F1E3] p-5 rounded-lg shadow-2xl border border-[#E8C98A]/35 max-w-xs flex-col space-y-1">
              <span className="text-[#E8C98A] font-serif text-2xl font-bold">24K Micron</span>
              <span className="text-xs text-[#E9DDC8]/85 font-light leading-snug">
                City Gold electroplating ensuring anti-tarnish lasting brilliance.
              </span>
            </div>
          </motion.div>

          {/* Right Column: Editorial Narrative & Craft Pillars (7 cols) */}
          <motion.div
            initial={{ opacity: 0, x: 35 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="lg:col-span-7 space-y-8"
          >
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#B08D57]/10 text-[#8C6C38] text-[11px] uppercase tracking-[0.25em] font-semibold border border-[#B08D57]/20">
                <Sparkles size={12} />
                <span>The Alongkar Philosophy</span>
              </div>

              <h2 className="font-serif text-3xl sm:text-4xl md:text-5xl font-bold text-[#211A17] leading-tight">
                Where Bengali Royal Heritage <br />
                <span className="text-gold-gradient italic font-serif">Meets Modern Poise</span>
              </h2>
            </div>

            <p className="text-sm sm:text-base text-[#3D3430] leading-relaxed font-light">
              Founded on the principle that royal elegance should not be preserved solely for bank vaults, ALONGKAR redefines high-grade city gold jewellery. We unite the majesty of Kundan, Polki, and antique temple motifs with featherlight wearability and guaranteed longevity.
            </p>

            {/* 3 Pillars */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 pt-2">
              {craftPillars.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <div key={pillar.title} className="p-4 rounded-lg bg-white border border-[#B08D57]/20 shadow-sm space-y-2">
                    <div className="w-8 h-8 rounded-full bg-[#B08D57]/15 flex items-center justify-center text-[#8C6C38]">
                      <Icon size={16} />
                    </div>
                    <h4 className="font-serif text-sm font-bold text-[#211A17]">{pillar.title}</h4>
                    <p className="text-[11px] text-gray-600 leading-relaxed font-light">{pillar.desc}</p>
                  </div>
                );
              })}
            </div>

            {/* Atelier Metrics */}
            <div className="pt-6 flex flex-wrap items-center gap-8 border-t border-[#B08D57]/20">
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-[#2A0008]">50,000+</span>
                <p className="text-[11px] text-[#8C6C38] uppercase tracking-wider font-semibold">Patrons Adorned</p>
              </div>
              <div className="h-8 w-[1px] bg-[#B08D57]/20 hidden sm:block" />
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-[#2A0008]">100%</span>
                <p className="text-[11px] text-[#8C6C38] uppercase tracking-wider font-semibold">Quality Certified</p>
              </div>
              <div className="h-8 w-[1px] bg-[#B08D57]/20 hidden sm:block" />
              <div>
                <span className="font-serif text-2xl sm:text-3xl font-bold text-[#2A0008]">4.9 ★</span>
                <p className="text-[11px] text-[#8C6C38] uppercase tracking-wider font-semibold">Customer Rating</p>
              </div>

              <div className="ml-auto">
                <Link to="/about">
                  <button className="px-5 py-2.5 rounded-md border border-[#2A0008] text-[#2A0008] hover:bg-[#2A0008] hover:text-[#F8F1E3] transition-all text-xs uppercase tracking-widest font-medium cursor-pointer">
                    Read Full Story
                  </button>
                </Link>
              </div>
            </div>

          </motion.div>
        </div>
      </div>
    </section>
  );
};
