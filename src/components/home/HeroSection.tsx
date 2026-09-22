import React from 'react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { BlossomSky } from '../ui/BlossomSky';
import { BlurReveal } from '../ui/BlurReveal';

export interface HeroSectionProps {
  startAnimation?: boolean;
}

export const HeroSection: React.FC<HeroSectionProps> = ({ startAnimation = true }) => {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-[#FFEFF6] flex items-center justify-center select-none">
      {/* Dynamic Blossom Sky WebGL Shader Background */}
      <BlossomSky speed={22} />

      {/* Fresh Centered Typography with GeistSans & GeistMono */}
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-10 px-4 text-center gap-2 sm:gap-3">
        {/* Minimalist Mono Overline */}
        <BlurReveal
          as="span"
          trigger={startAnimation}
          delay={0.15}
          speedReveal={1.6}
          className={`${GeistMono.className} text-[10px] sm:text-xs md:text-sm uppercase tracking-[0.32em] font-medium text-[#55364E] select-none`}
        >
          Alongkar • City Gold
        </BlurReveal>

        {/* Main Bold Italic Headline with GeistSans */}
        <BlurReveal
          as="h1"
          trigger={startAnimation}
          delay={0.32}
          speedReveal={1.2}
          speedSegment={0.6}
          className={`${GeistSans.className} italic font-bold text-4xl sm:text-6xl md:text-7xl lg:text-8xl text-[#1E101D] tracking-tight select-none`}
        >
          Everyday Elegance
        </BlurReveal>
      </div>
    </section>
  );
};
