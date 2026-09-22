import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, ShieldCheck, Truck, Gift, Check, Copy } from 'lucide-react';

const announcements = [
  {
    icon: Truck,
    text: 'Complimentary Insured Delivery Across India on Orders Above ₹499',
    badge: 'FREE DELIVERY',
  },
  {
    icon: ShieldCheck,
    text: '24K Micron City Gold Plating • 1-Year Anti-Tarnish Guarantee',
    badge: 'ASSURED QUALITY',
  },
  {
    icon: Gift,
    text: 'Royal Festive Privilege: Use code ROYAL10 for extra 10% off',
    code: 'ROYAL10',
    badge: 'LIMITED OFFER',
  },
];

export const AnnouncementBar: React.FC = () => {
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((prev) => (prev + 1) % announcements.length);
    }, 4500);
    return () => clearInterval(timer);
  }, []);

  const current = announcements[index];
  const IconComponent = current.icon;

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-[#1C0106] text-[#F8F1E3] text-[11px] sm:text-xs py-2 px-4 border-b border-[#E8C98A]/15 relative z-50 overflow-hidden">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        {/* Left Trust Statement */}
        <div className="hidden lg:flex items-center gap-2 text-[#E8C98A]/85 font-serif italic text-xs tracking-wider">
          <Sparkles size={13} className="text-[#E8C98A]" />
          <span>Haute Joaillerie & City Gold Atelier</span>
        </div>

        {/* Center Animated Announcement Ticker */}
        <div className="w-full lg:w-auto flex items-center justify-center min-h-[22px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="flex items-center gap-2 text-center"
            >
              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-[#E8C98A]/20 text-[#E8C98A]">
                <IconComponent size={11} />
              </span>
              <span className="font-light tracking-wide text-xs text-[#F8F1E3]">
                {current.text}
              </span>
              {current.code && (
                <button
                  onClick={() => handleCopyCode(current.code!)}
                  className="inline-flex items-center gap-1 ml-1 px-2 py-0.5 rounded bg-[#E8C98A] text-[#1C0106] font-semibold text-[10px] tracking-wider uppercase hover:bg-[#F3DEB2] transition-colors cursor-pointer"
                  title="Click to copy voucher code"
                >
                  {copied ? <Check size={10} /> : <Copy size={10} />}
                  <span>{copied ? 'COPIED' : current.code}</span>
                </button>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Quick Perks */}
        <div className="hidden md:flex items-center gap-4 text-[#E9DDC8]/70 text-[11px] font-sans tracking-wide">
          <span className="hover:text-[#E8C98A] transition-colors flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#E8C98A]" />
            Hypoallergenic
          </span>
          <span>•</span>
          <span className="hover:text-[#E8C98A] transition-colors">7-Day Easy Replacement</span>
        </div>
      </div>
    </div>
  );
};
