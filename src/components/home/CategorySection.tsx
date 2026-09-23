import React from 'react';
import { Link } from 'react-router-dom';

const categories = [
  {
    name: 'Necklaces & Chokers',
    slug: 'necklaces',
    image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f?q=80&w=800&auto=format&fit=crop',
    link: '/category/necklaces',
  },
  {
    name: 'Kadas & Bangles',
    slug: 'bracelets',
    image: 'https://images.unsplash.com/photo-1535632787350-4e68ef0ac584?q=80&w=800&auto=format&fit=crop',
    link: '/category/bracelets',
  },
  {
    name: 'Earrings & Jhumkas',
    slug: 'earrings',
    image: 'https://images.unsplash.com/photo-1630019852942-f89202989a59?q=80&w=800&auto=format&fit=crop',
    link: '/category/earrings',
  },
  {
    name: 'Rings & Solitaires',
    slug: 'rings',
    image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e?q=80&w=800&auto=format&fit=crop',
    link: '/category/rings',
  },
];

export const CategorySection: React.FC = () => {
  return (
    <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16">
      {/* Section Header */}
      <div className="text-center mb-8 sm:mb-12">
        <h2 className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight text-neutral-950">
          Shop By Category
        </h2>
        <p className="text-[11px] sm:text-xs tracking-[0.22em] uppercase text-neutral-500 font-semibold mt-1.5">
          Explore Our Exclusive Collections
        </p>
      </div>

      {/* 4 Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
        {categories.map((cat) => (
          <Link
            key={cat.name}
            to={cat.link}
            className="group relative aspect-[4/5] rounded-2xl sm:rounded-3xl overflow-hidden bg-neutral-100 shadow-xs"
          >
            <img
              src={cat.image}
              alt={cat.name}
              className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-105"
              loading="lazy"
            />
            {/* Dark gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent pointer-events-none" />

            {/* Bottom Content */}
            <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6 z-10 text-white">
              <h3 className="text-base sm:text-xl md:text-2xl font-bold tracking-tight mb-2">
                {cat.name}
              </h3>
              <div className="flex items-center gap-2">
                <span className="w-5 h-[2px] bg-[#B08D57] rounded-full" />
                <span className="text-[10px] sm:text-xs font-semibold tracking-widest uppercase text-white/90 group-hover:translate-x-1 transition-transform">
                  SHOP NOW →
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Full-width Statement Banner */}
      <div className="mt-4 sm:mt-6">
        <Link
          to="/shop"
          className="group relative block w-full aspect-[2.4/1] sm:aspect-[3.2/1] md:aspect-[3.8/1] rounded-2xl sm:rounded-3xl overflow-hidden bg-neutral-950 shadow-xs"
        >
          <img
            src="https://images.unsplash.com/photo-1611591475819-79b8b730ab8c?q=80&w=1800&auto=format&fit=crop"
            alt="Bridal & Heritage Jewellery"
            className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-102"
            loading="lazy"
          />
          {/* Subtle gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/35 to-transparent pointer-events-none" />

          {/* Banner content */}
          <div className="absolute inset-y-0 left-6 sm:left-10 md:left-14 flex flex-col justify-center z-10 text-white">
            <h3 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl font-black tracking-tight mb-2 sm:mb-3">
              Heritage & Bridal Atelier
            </h3>
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-[2.5px] bg-[#B08D57] rounded-full" />
              <span className="text-xs sm:text-sm font-semibold tracking-widest uppercase text-white/95 group-hover:translate-x-1.5 transition-transform">
                EXPLORE COLLECTION →
              </span>
            </div>
          </div>
        </Link>
      </div>
    </section>
  );
};
