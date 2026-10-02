import React from 'react';

const marqueeItems = [
  'CASH ON DELIVERY AVAILABLE PAN-INDIA',
  'FLAT 5% OFF ON PREPAID CHECKOUT · CODE: PREPAID5',
  'BUY 2 GET 10% OFF · AUTOMATIC AT CART',
  'BUY 3+ GET 15% OFF · ATELIER BUNDLE SAVINGS',
  'COMPLIMENTARY INSURED SHIPPING PAN-INDIA',
  '100% HANDCRAFTED LUXURY & 24K MICRON GOLD FINISH',
  '6 MONTHS COMPLIMENTARY POLISH GUARANTEE',
  'HYPOALLERGENIC SKIN-FRIENDLY BRASS ALLOY',
  'SIGNATURE ROYAL VELVET GIFT UNBOXING INCLUDED',
];

export const AnnouncementBar: React.FC = () => {
  return (
    <div className="bg-black text-white text-[11px] sm:text-xs font-medium tracking-[0.16em] uppercase py-2.5 overflow-hidden select-none border-b border-white/10 relative z-50">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {[0, 1].map((groupIdx) => (
          <div
            key={groupIdx}
            className="flex items-center gap-6 sm:gap-8 shrink-0 pr-6 sm:pr-8"
            aria-hidden={groupIdx === 1 ? 'true' : undefined}
          >
            {marqueeItems.map((item, idx) => (
              <React.Fragment key={`${groupIdx}-${idx}`}>
                <span className="text-white/40 text-[10px] sm:text-xs font-light select-none">
                  +
                </span>
                <span className="whitespace-nowrap transition-colors duration-200 hover:text-[#E8C98A]">
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
