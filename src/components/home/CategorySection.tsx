import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { categoriesData } from '../../data/categories';
import { SectionHeading } from '../ui/SectionHeading';
import { ArrowUpRight } from 'lucide-react';

export const CategorySection: React.FC = () => {
  return (
    <section className="py-16 sm:py-24 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Shop By Category"
          subtitle="Explore Our Signature Pieces"
        />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {categoriesData.map((category, index) => (
            <Link key={category.id} to={`/shop?category=${category.slug}`}>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8 }}
                className="group relative aspect-[3/4] rounded-brand overflow-hidden shadow-soft hover:shadow-elevated transition-all duration-500 border border-gold/20 flex flex-col justify-end p-4 sm:p-6"
              >
                {/* Background Image */}
                <img
                  src={category.image}
                  alt={category.name}
                  className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 brightness-95"
                />

                {/* Dark Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/30 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                {/* Content */}
                <div className="relative z-10">
                  <div className="flex justify-between items-end">
                    <div>
                      <span className="text-[10px] uppercase tracking-widest text-gold-champagne font-semibold">
                        {category.itemCount} Designs
                      </span>
                      <h3 className="font-serif text-lg sm:text-2xl font-bold text-ivory-pearl tracking-wide mt-0.5">
                        {category.name}
                      </h3>
                    </div>

                    <div className="w-8 h-8 rounded-full bg-gold/30 backdrop-blur-md text-ivory-pearl flex items-center justify-center group-hover:bg-gold group-hover:text-espresso transition-all duration-300">
                      <ArrowUpRight size={16} />
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
