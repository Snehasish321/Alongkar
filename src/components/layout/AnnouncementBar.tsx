import React from 'react';

const marqueeItems = [
  'CASH ON DELIVERY AVAILABLE',
  'GET 5% FLAT OFF ON PREPAID ORDERS',
  'BUY 2 GET 10% OFF ON PREPAID ORDERS',
  'BUY 3 GET 15% OFF ON PREPAID ORDERS',
  'COMPLIMENTARY INSURED SHIPPING ACROSS INDIA',
  '100% HANDCRAFTED LUXURY & CERTIFIED FINISH',
];

export const AnnouncementBar: React.FC = () => {
  return (
    <div className="bg-black text-white text-[11px] sm:text-xs font-medium tracking-[0.16em] uppercase py-2.5 overflow-hidden select-none border-b border-white/10 relative z-50">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {[...Array(3)].map((_, groupIdx) => (
          <div key={groupIdx} className="flex items-center space-x-6 sm:space-x-8 shrink-0 pr-6 sm:pr-8">
            {marqueeItems.map((item, idx) => (
              <React.Fragment key={`${groupIdx}-${idx}`}>
                <span className="text-white/40 text-[10px] sm:text-xs font-light">+</span>
                <span className="whitespace-nowrap transition-colors duration-200 hover:text-white/80">
                  {item}
                </span>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
