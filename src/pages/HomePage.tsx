import React, { useState } from 'react';
import { HeroSection } from '../components/home/HeroSection';
import { GSAPPreloader } from '../components/ui/GSAPPreloader';

export const HomePage: React.FC = () => {
  const [preloaderDone, setPreloaderDone] = useState(false);
  const [isPreloaderActive, setIsPreloaderActive] = useState(true);

  return (
    <main className="relative w-full h-screen overflow-hidden">
      {isPreloaderActive && (
        <GSAPPreloader
          onComplete={() => setPreloaderDone(true)}
          onExitComplete={() => setIsPreloaderActive(false)}
        />
      )}
      <HeroSection startAnimation={preloaderDone} />
    </main>
  );
};
