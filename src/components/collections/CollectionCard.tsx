import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { Collection } from '../../types';

interface CollectionCardProps {
  collection: Collection;
}

export const CollectionCard: React.FC<CollectionCardProps> = ({ collection }) => {
  return (
    <Link to={`/collections#${collection.slug}`}>
      <motion.div
        whileHover={{ y: -6 }}
        className="group relative h-96 sm:h-[420px] rounded-brand overflow-hidden shadow-soft hover:shadow-elevated transition-all duration-500 cursor-pointer border border-gold/20 flex flex-col justify-end p-6 sm:p-8"
      >
        {/* Background Image */}
        <img
          src={collection.image}
          alt={collection.name}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-110 transition-transform duration-700 brightness-95"
        />

        {/* Gradient Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-espresso via-espresso/50 to-transparent opacity-85 group-hover:opacity-90 transition-opacity" />

        {/* Content */}
        <div className="relative z-10 space-y-2">
          <span className="text-[10px] uppercase tracking-[0.25em] text-gold-champagne font-semibold bg-gold/20 px-2.5 py-1 rounded border border-gold/30">
            Curated Collection
          </span>

          <h3 className="font-serif text-2xl sm:text-3xl font-bold text-ivory-pearl tracking-wide pt-1">
            {collection.name}
          </h3>

          <p className="text-xs sm:text-sm text-gray-300 font-light line-clamp-2">
            {collection.tagline}
          </p>

          <div className="pt-2 flex items-center gap-2 text-xs uppercase tracking-widest font-semibold text-gold-champagne group-hover:text-ivory transition-colors">
            <span>EXPLORE PIECES</span>
            <ArrowRight size={14} className="group-hover:translate-x-1.5 transition-transform" />
          </div>
        </div>
      </motion.div>
    </Link>
  );
};
