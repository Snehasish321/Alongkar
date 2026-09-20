import React from 'react';
import { Sparkles } from 'lucide-react';

export const AnnouncementBar: React.FC = () => {
  return (
    <div className="bg-[#2A0008] text-[#F8F1E3] text-[11px] sm:text-xs py-2 px-4 border-b border-[#E8C98A]/10 relative z-50">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="hidden md:flex items-center gap-2 text-gold-champagne/80 font-medium">
          <Sparkles size={12} className="text-gold" />
          <span>City Gold Jewellery Crafted for Generations</span>
        </div>

        <div className="w-full md:w-auto text-center font-medium tracking-wide flex items-center justify-center gap-2">
          <span>Free Shipping Across India on Orders Above ₹499</span>
          <span className="hidden sm:inline text-gold">|</span>
          <span className="hidden sm:inline text-gold-champagne text-[10px] uppercase font-semibold tracking-widest bg-gold/20 px-2 py-0.5 rounded">
            Use Code: ALONGKAR
          </span>
        </div>

        <div className="hidden md:flex items-center gap-4 text-gray-300 text-[11px]">
          <span className="hover:text-gold cursor-pointer transition-colors">100% Quality Checked</span>
          <span>•</span>
          <span className="hover:text-gold cursor-pointer transition-colors">Easy Returns</span>
        </div>
      </div>
    </div>
  );
};
