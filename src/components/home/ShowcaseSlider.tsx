import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { formatPrice } from '../../lib/utils';

export interface ShowcaseItem {
  id?: string;
  title: string;
  badge?: 'SALE' | 'SOLD OUT' | 'LIMITED' | 'NEW';
  price: number;
  originalPrice?: number;
  image: string;
  link: string;
}

interface ShowcaseSliderProps {
  title: string;
  items: ShowcaseItem[];
}

export const ShowcaseSlider: React.FC<ShowcaseSliderProps> = ({ title, items }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const itemsPerView = isMobile ? 1 : 2;
  const maxIndex = Math.max(0, items.length - itemsPerView);

  // Clamp current index if resize changes itemsPerView
  useEffect(() => {
    if (currentIndex > maxIndex) {
      setCurrentIndex(maxIndex);
    }
  }, [currentIndex, maxIndex]);

  const handlePrev = useCallback(() => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
  }, [maxIndex]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const touchEndX = e.changedTouches[0].clientX;
    const diff = touchStartX.current - touchEndX;

    if (diff > 50) {
      handleNext();
    } else if (diff < -50) {
      handlePrev();
    }
    touchStartX.current = null;
  };

  return (
    <section className="w-full max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
      {/* Clean Title and Controls */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h2 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-neutral-950">
          {title}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={handlePrev}
            disabled={currentIndex === 0}
            className="p-2 sm:p-2.5 rounded-full border border-neutral-300 text-neutral-700 hover:text-black hover:border-black disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer active:scale-95"
            aria-label="Previous items"
          >
            <ArrowLeft size={16} />
          </button>
          <button
            onClick={handleNext}
            disabled={currentIndex >= maxIndex}
            className="p-2 sm:p-2.5 rounded-full border border-neutral-300 text-neutral-700 hover:text-black hover:border-black disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer active:scale-95"
            aria-label="Next items"
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </div>

      {/* Smooth Carousel Track */}
      <div
        className="overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <motion.div
          className="flex -mx-2 sm:-mx-3 lg:-mx-4"
          animate={{
            x: `-${currentIndex * (100 / itemsPerView)}%`,
          }}
          transition={{
            type: 'spring',
            stiffness: 260,
            damping: 30,
          }}
        >
          {items.map((item, idx) => (
            <div
              key={idx}
              className="w-full md:w-1/2 shrink-0 px-2 sm:px-3 lg:px-4"
            >
              <Link
                to={item.link}
                className="group relative block aspect-[4/5] sm:aspect-square w-full rounded-2xl overflow-hidden bg-neutral-100 shadow-xs hover:shadow-md transition-shadow"
              >
                <img
                  src={item.image}
                  alt={item.title}
                  className="w-full h-full object-cover object-center transition-transform duration-700 ease-out group-hover:scale-103"
                  loading="lazy"
                />

                {/* Minimal Clean Badge */}
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

                {/* Bottom Clean Dark Gradient & Text */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent flex flex-col justify-end p-6 text-white pointer-events-none">
                  <h3 className="text-lg sm:text-2xl font-bold tracking-tight mb-1 text-white">
                    {item.title}
                  </h3>
                  <div className="flex items-center gap-2 text-sm sm:text-base font-semibold">
                    <span className="text-white">{formatPrice(item.price)}</span>
                    {item.originalPrice && item.originalPrice > item.price && (
                      <span className="text-xs sm:text-sm text-white/60 line-through font-normal">
                        {formatPrice(item.originalPrice)}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Clean Subtle Pagination Indicators */}
      {maxIndex > 0 && (
        <div className="flex justify-center items-center gap-2 mt-6">
          {Array.from({ length: maxIndex + 1 }).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              className={`transition-all duration-300 rounded-full cursor-pointer ${
                idx === currentIndex
                  ? 'w-6 h-1.5 bg-neutral-900'
                  : 'w-1.5 h-1.5 bg-neutral-300 hover:bg-neutral-500'
              }`}
              aria-label={`Go to slide ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </section>
  );
};
