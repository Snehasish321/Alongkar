import React from 'react';

const tickerPhrases = [
  '24K MICRON CITY GOLD',
  'ANTI-TARNISH ELECTROPLATING',
  'HANDCRAFTED IN BENGAL',
  '6 MONTHS POLISH GUARANTEE',
  'CASH ON DELIVERY AVAILABLE',
  'COMPLIMENTARY INSURED SHIPPING',
  'HYPOALLERGENIC BRASS ALLOY',
  'ROYAL VELVET UNBOXING',
];

export const SecondaryTicker: React.FC = () => {
  return (
    <div className="w-full bg-neutral-950 text-white py-3.5 sm:py-4 overflow-hidden select-none border-y border-neutral-800">
      <div className="flex w-max animate-marquee hover:[animation-play-state:paused]">
        {[...Array(3)].map((_, groupIdx) => (
          <div
            key={groupIdx}
            className="flex items-center space-x-6 sm:space-x-10 shrink-0 pr-6 sm:pr-10"
          >
            {tickerPhrases.map((phrase, idx) => (
              <React.Fragment key={`${groupIdx}-${idx}`}>
                <span className="text-[#D4AF37] text-xs sm:text-sm">✦</span>
                <span className="text-[11px] sm:text-xs tracking-[0.24em] font-bold uppercase whitespace-nowrap text-neutral-200 hover:text-white transition-colors">
                  {phrase}
                </span>
              </React.Fragment>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
