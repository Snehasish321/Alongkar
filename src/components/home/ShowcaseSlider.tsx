import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { formatPrice } from '../../lib/utils';

interface ShowcaseSliderProps {
  title: string;
  items: Array<{
    title: string;
    badge?: 'SALE' | 'SOLD OUT' | 'LIMITED';
    price: number;
    originalPrice?: number;
    image: string;
    link: string;
  }>;
}

export const ShowcaseSlider: React.FC<ShowcaseSliderProps> = ({ title, items }) => {
  const [startIndex, setStartIndex] = useState(0);

  const handlePrev = () => {
    setStartIndex((prev) => (prev === 0 ? Math.max(0, items.length - 2) : prev - 1));
  };

  const handleNext = () => {
    setStartIndex((prev) => (prev + 2 >= items.length ? 0 : prev + 1));
  };

  const visibleItems = items.slice(startIndex, startIndex + 2);

  return (
    <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Title */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-neutral-950">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            className="p-2 rounded-full border border-neutral-300 text-neutral-700 hover:text-black hover:border-black transition-colors cursor-pointer"
            aria-label="Previous items"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={handleNext}
            className="p-2 rounded-full border border-neutral-300 text-neutral-700 hover:text-black hover:border-black transition-colors cursor-pointer"
            aria-label="Next items"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* 2-Column Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 lg:gap-8">
        {visibleItems.map((item, idx) => (
          <Link
            key={idx}
            to={item.link}
            className="group relative block aspect-[4/5] sm:aspect-square w-full rounded-2xl overflow-hidden bg-neutral-100 shadow-xs"
          >
            <img
              src={item.image}
              alt={item.title}
              className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-103"
              loading="lazy"
            />

            {/* Badge */}
            {item.badge && (
              <div
                className={`absolute top-4 left-4 text-[10px] sm:text-xs font-bold uppercase tracking-wider px-2.5 py-1 rounded shadow-xs ${
                  item.badge === 'SOLD OUT'
                    ? 'bg-black text-white'
                    : 'bg-white/95 text-black'
                }`}
              >
                {item.badge}
              </div>
            )}

            {/* Bottom Gradient overlay & info */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent flex flex-col justify-end p-6 text-white">
              <h3 className="text-lg sm:text-2xl font-bold tracking-tight mb-1">
                {item.title}
              </h3>
              <div className="flex items-center gap-2 text-sm sm:text-base font-semibold">
                <span>{formatPrice(item.price)}</span>
                {item.originalPrice && (
                  <span className="text-xs sm:text-sm text-white/60 line-through">
                    {formatPrice(item.originalPrice)}
                  </span>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
};
