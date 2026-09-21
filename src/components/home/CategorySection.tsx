import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { categoriesData } from '../../data/categories';
import { SectionHeading } from '../ui/SectionHeading';
import { ArrowUpRight, Sparkles } from 'lucide-react';

export const CategorySection: React.FC = () => {
  return (
    <section className="py-20 sm:py-28 bg-[#FAF7F2] relative overflow-hidden">
      {/* Decorative ambient gold glow */}
      <div className="absolute top-1/2 left-0 w-96 h-96 bg-[#E8C98A]/10 rounded-full blur-3xl pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <SectionHeading
          title="Curated Categories"
          subtitle="Discover Handcrafted City Gold Masterpieces For Every Moment"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 sm:gap-6 mt-12">
          {categoriesData.map((category, index) => (
            <Link key={category.id} to={`/shop?category=${category.slug}`} className="group block">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.08 }}
                className="relative aspect-[3/4.2] rounded-t-[28px] rounded-b-xl overflow-hidden shadow-md group-hover:shadow-2xl transition-all duration-500 border border-[#D6B878]/30 group-hover:border-[#C9A45D] flex flex-col justify-end p-4 sm:p-5"
              >
                {/* Background Image with Zoom */}
                <img
                  src={category.image}
                  alt={category.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 brightness-[0.92]"
                />

                {/* Haute Couture Vignette Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#1C0106]/95 via-[#1C0106]/40 to-transparent group-hover:from-[#1C0106] transition-colors duration-500" />

                {/* Content */}
                <div className="relative z-10">
                  <div className="flex justify-between items-end">
                    <div>
                      <div className="flex items-center gap-1 text-[9px] uppercase tracking-[0.2em] text-[#E8C98A] font-semibold mb-1">
                        <Sparkles size={10} />
                        <span>{category.itemCount} Designs</span>
                      </div>
                      <h3 className="font-serif text-base sm:text-xl font-bold text-[#F8F1E3] tracking-wide group-hover:text-[#E8C98A] transition-colors">
                        {category.name}
                      </h3>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-white/10 backdrop-blur-md text-[#E8C98A] flex items-center justify-center border border-[#E8C98A]/30 group-hover:bg-[#E8C98A] group-hover:text-[#1C0106] group-hover:scale-110 transition-all duration-300 shadow-sm">
                      <ArrowUpRight size={15} />
                    </div>
                  </div>
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
};
