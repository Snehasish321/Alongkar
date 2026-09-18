import React from 'react';
import { motion } from 'framer-motion';
import { Quote } from 'lucide-react';
import { testimonialsData } from '../../data/testimonials';
import { StarRating } from '../ui/StarRating';
import { SectionHeading } from '../ui/SectionHeading';

export const CustomerStoriesSection: React.FC = () => {
  return (
    <section className="py-16 sm:py-24 bg-ivory-pearl border-y border-gold/15 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Customer Stories"
          subtitle="Real Words From Our Alongkar Family"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
          {testimonialsData.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-6 sm:p-8 bg-ivory rounded-brand border border-gold/20 shadow-soft hover:shadow-elevated transition-all flex flex-col justify-between relative"
            >
              <Quote className="absolute top-6 right-6 text-gold/20 w-10 h-10" />

              <div>
                <StarRating rating={review.rating} size={16} className="mb-4" />
                <p className="text-xs sm:text-sm text-espresso-light italic leading-relaxed mb-6 font-light">
                  &quot;{review.reviewText}&quot;
                </p>
              </div>

              <div className="pt-4 border-t border-gold/10 flex items-center justify-between">
                <div>
                  <h4 className="font-serif text-sm font-semibold text-espresso">
                    {review.customerName}
                  </h4>
                  <p className="text-[11px] text-gray-500">{review.location}</p>
                </div>
                {review.productName && (
                  <span className="text-[10px] bg-gold/15 text-espresso font-medium px-2.5 py-1 rounded-brand border border-gold/20">
                    {review.productName}
                  </span>
                )}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
