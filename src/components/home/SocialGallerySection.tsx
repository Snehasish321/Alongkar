import React from 'react';
import { motion } from 'framer-motion';
import { Heart } from 'lucide-react';
import { SectionHeading } from '../ui/SectionHeading';
import { InstagramIcon } from '../ui/SocialIcons';

export const SocialGallerySection: React.FC = () => {
  const galleryImages = [
    {
      id: 1,
      image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?q=80&w=600&auto=format&fit=crop',
      likes: 1420,
      handle: '@alongkar_jewels',
    },
    {
      id: 2,
      image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=600&auto=format&fit=crop',
      likes: 2150,
      handle: '@alongkar_jewels',
    },
    {
      id: 3,
      image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=600&auto=format&fit=crop',
      likes: 980,
      handle: '@alongkar_jewels',
    },
    {
      id: 4,
      image: 'https://images.unsplash.com/photo-1611591475143-be232935ee37?q=80&w=600&auto=format&fit=crop',
      likes: 1840,
      handle: '@alongkar_jewels',
    },
    {
      id: 5,
      image: 'https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?q=80&w=600&auto=format&fit=crop',
      likes: 3120,
      handle: '@alongkar_jewels',
    },
    {
      id: 6,
      image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?q=80&w=600&auto=format&fit=crop',
      likes: 1670,
      handle: '@alongkar_jewels',
    },
  ];

  return (
    <section className="py-16 sm:py-24 bg-ivory">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          title="Follow #AlongkarJourneys"
          subtitle="Tag Us On Instagram To Be Featured"
        />

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
          {galleryImages.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: index * 0.08 }}
              className="group relative aspect-square rounded-brand overflow-hidden shadow-soft cursor-pointer border border-gold/20"
            >
              <img
                src={item.image}
                alt="Alongkar Social Post"
                className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-espresso/70 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-ivory-pearl p-2 text-center space-y-1">
                <InstagramIcon size={24} className="text-gold" />
                <span className="text-[10px] font-semibold tracking-wider">{item.handle}</span>
                <span className="text-[10px] text-gold-champagne flex items-center gap-1">
                  <Heart size={10} className="fill-gold" /> {item.likes}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};
