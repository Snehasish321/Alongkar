import React from 'react';
import { motion } from 'framer-motion';
import { Quote, Sparkles, CheckCircle2 } from 'lucide-react';
import { testimonialsData } from '../../data/testimonials';
import { StarRating } from '../ui/StarRating';
import { SectionHeading } from '../ui/SectionHeading';

export const CustomerStoriesSection: React.FC = () => {
  return (
    <section className="py-20 sm:py-28 bg-[#FFFDF8] border-b border-[#E8C98A]/20 overflow-hidden relative">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Patron Testimonials"
          subtitle="Real Reflections from Our Alongkar Circle"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 mt-12">
          {testimonialsData.map((review, index) => (
            <motion.div
              key={review.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.1 }}
              className="p-8 sm:p-10 bg-white rounded-2xl border border-[#E8C98A]/30 shadow-[0_6px_28px_rgba(0,0,0,0.03)] hover:shadow-[0_16px_40px_rgba(42,0,8,0.07),0_0_20px_rgba(232,201,138,0.12)] transition-all duration-500 flex flex-col justify-between relative group"
            >
              <Quote className="absolute top-8 right-8 text-[#E8C98A]/25 w-12 h-12 group-hover:text-[#E8C98A]/40 transition-colors pointer-events-none" />

              <div>
                <div className="flex items-center gap-2 mb-4">
                  <StarRating rating={review.rating} size={15} />
                  <span className="text-[10px] text-[#B08D57] font-semibold uppercase tracking-widest ml-1">
                    Verified Patron
                  </span>
                </div>

                <p className="text-sm sm:text-base text-[#292522] italic leading-relaxed mb-8 font-light">
                  &ldquo;{review.reviewText}&rdquo;
                </p>
              </div>

              <div className="pt-6 border-t border-[#E8C98A]/20 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-[#2A0008] text-[#E8C98A] font-serif font-bold text-sm flex items-center justify-center shadow-xs">
                    {review.customerName.charAt(0)}
                  </div>
                  <div>
                    <h4 className="font-serif text-sm font-bold text-[#211A17] flex items-center gap-1.5">
                      <span>{review.customerName}</span>
                      <CheckCircle2 size={13} className="text-emerald-700" />
                    </h4>
                    <p className="text-[11px] text-gray-500 font-light">{review.location}</p>
                  </div>
                </div>

                {review.productName && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-[10px] bg-[#FAF7F2] text-[#2A0008] font-medium px-3 py-1.5 rounded-full border border-[#E8C98A]/35 shadow-2xs">
                    <Sparkles size={9} className="text-[#B08D57]" />
                    <span>{review.productName}</span>
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
