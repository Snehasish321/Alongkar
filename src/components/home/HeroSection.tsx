import React from 'react';
import { BlossomSky } from '../ui/BlossomSky';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative w-full h-screen overflow-hidden bg-[#FFEFF6]">
      <BlossomSky speed={22} />
    </section>
  );
};
