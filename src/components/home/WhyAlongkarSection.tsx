import React from 'react';
import { motion } from 'framer-motion';
import { Award, ShieldCheck, Truck, Sparkles } from 'lucide-react';
import { SectionHeading } from '../ui/SectionHeading';

export const WhyAlongkarSection: React.FC = () => {
  const features = [
    {
      step: '01',
      icon: Award,
      title: '24K Micron Gold Bond',
      description: 'Electroplated with pure 24K bullion gold over hypoallergenic brass for authentic heirloom radiance.',
    },
    {
      step: '02',
      icon: ShieldCheck,
      title: 'Heirloom Anti-Tarnish',
      description: 'Treated with an invisible protective shield to withstand Indian weather, moisture, and daily wear.',
    },
    {
      step: '03',
      icon: Truck,
      title: 'Insured Express Transit',
      description: 'Direct-to-door insured packaging with real-time tracking across 20,000+ PIN codes in India.',
    },
    {
      step: '04',
      icon: Sparkles,
      title: 'Handcrafted Heritage',
      description: 'Individually sculpted by master filigree goldsmiths with precision-set stones and pearls.',
    },
  ];

  return (
    <section className="py-20 sm:py-28 bg-[#FAF7F2] relative border-b border-[#E8C98A]/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="The Alongkar Standard"
          subtitle="Uncompromising Standards Of Royal Indian Jewellery Making"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 sm:gap-8 mt-12">
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className="group p-8 bg-white rounded-2xl border border-[#E8C98A]/25 hover:border-[#C9A45D] shadow-[0_4px_24px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_36px_rgba(42,0,8,0.08),0_0_20px_rgba(232,201,138,0.15)] transition-all duration-500 relative flex flex-col justify-between"
              >
                {/* Step indicator watermark */}
                <div className="absolute top-4 right-5 text-4xl font-serif font-bold text-[#E8C98A]/20 group-hover:text-[#E8C98A]/40 transition-colors pointer-events-none">
                  {item.step}
                </div>

                <div>
                  <div className="w-12 h-12 rounded-xl bg-[#2A0008] text-[#E8C98A] flex items-center justify-center mb-6 shadow-md group-hover:scale-110 group-hover:bg-[#40000D] transition-all duration-300">
                    <Icon size={22} />
                  </div>

                  <h3 className="font-serif text-lg font-bold text-[#211A17] mb-2.5 group-hover:text-[#2A0008] transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-xs text-[#3D3430]/85 font-light leading-relaxed">
                    {item.description}
                  </p>
                </div>

                <div className="w-8 h-[1px] bg-[#E8C98A]/40 mt-6 group-hover:w-full transition-all duration-500" />
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
