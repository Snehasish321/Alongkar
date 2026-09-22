import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';

// Register useGSAP plugin with GSAP
gsap.registerPlugin(useGSAP);

export interface GSAPPreloaderProps {
  /** Called when the curtain begins opening to trigger hero animations */
  onComplete?: () => void;
  /** Called when exit transition is complete to unmount the preloader */
  onExitComplete?: () => void;
}

export const GSAPPreloader: React.FC<GSAPPreloaderProps> = ({
  onComplete,
  onExitComplete,
}) => {
  const curtainRef = useRef<HTMLElement>(null);
  const counterRef = useRef<HTMLSpanElement>(null);
  const progressLineRef = useRef<HTMLDivElement>(null);
  const footerContentRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      // Initial states
      gsap.set(curtainRef.current, { yPercent: 0 });
      gsap.set(footerContentRef.current, { opacity: 0, y: 15 });
      gsap.set(brandRef.current, { opacity: 0, y: 10 });

      const tl = gsap.timeline({
        defaults: { ease: 'power3.out' },
      });

      // 1. Subtle, elegant entrance of corner elements
      tl.to([brandRef.current, footerContentRef.current], {
        opacity: 1,
        y: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
      }, 0.1);

      // 2. Smooth numerical counter (0 -> 100) and progress bar
      const counterObj = { val: 0 };
      tl.to(
        counterObj,
        {
          val: 100,
          duration: 1.8,
          ease: 'power2.inOut',
          onUpdate: () => {
            const current = Math.round(counterObj.val);
            if (counterRef.current) {
              counterRef.current.textContent = current < 10 ? `0${current}` : `${current}`;
            }
            if (progressLineRef.current) {
              progressLineRef.current.style.width = `${current}%`;
            }
          },
        },
        0.3
      );

      // 3. Brief hold at 100%, then corner elements fade out cleanly
      tl.to(
        [footerContentRef.current, brandRef.current],
        {
          opacity: 0,
          y: -15,
          duration: 0.35,
          ease: 'power2.in',
        },
        '+=0.15'
      );

      // 4. Curtain slides up majestically to open the site
      tl.to(
        curtainRef.current,
        {
          yPercent: -100,
          duration: 1.0,
          ease: 'expo.inOut',
        },
        '-=0.05'
      );

      // 5. Trigger hero animation as the curtain opens
      tl.call(
        () => {
          if (onComplete) onComplete();
        },
        undefined,
        '-=0.6'
      );

      // 6. Unmount preloader when completely offscreen
      tl.call(() => {
        if (onExitComplete) onExitComplete();
      });
    },
    { scope: curtainRef }
  );

  return (
    <aside
      ref={curtainRef}
      aria-label="Loading site"
      className="fixed inset-0 z-50 flex flex-col justify-between p-8 sm:p-12 md:p-16 bg-[#0E090D] text-[#FFF5F8] select-none pointer-events-auto overflow-hidden"
    >
      {/* Top Left: Ultra-minimal brand wordmark */}
      <div ref={brandRef} className="flex items-center gap-2">
        <span
          className={`${GeistSans.className} text-xs sm:text-sm tracking-[0.3em] uppercase font-light text-white/50`}
        >
          Alongkar
        </span>
      </div>

      {/* Empty Center for pure negative space */}
      <div className="flex-1" />

      {/* Bottom Row: Minimalist layout with loader percentage on right side corner */}
      <div
        ref={footerContentRef}
        className="w-full flex items-end justify-between"
      >
        {/* Bottom Left: Subtle status label */}
        <div className="flex items-center gap-2 text-white/30">
          <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
          <span className={`${GeistMono.className} text-[10px] sm:text-xs tracking-[0.25em] uppercase`}>
            Loading
          </span>
        </div>

        {/* Bottom Right Corner: Clean, large loader percentage & hairline track */}
        <div className="flex flex-col items-end gap-2.5">
          <div className="flex items-baseline gap-1">
            <span
              ref={counterRef}
              className={`${GeistMono.className} text-5xl sm:text-7xl md:text-8xl font-light tracking-tight text-white tabular-nums`}
            >
              00
            </span>
            <span
              className={`${GeistMono.className} text-lg sm:text-2xl font-light text-white/40`}
            >
              %
            </span>
          </div>

          {/* Hairline 1px progress track aligned to the right */}
          <div className="relative w-36 sm:w-48 md:w-56 h-[1.5px] bg-white/10 overflow-hidden rounded-full">
            <div
              ref={progressLineRef}
              className="absolute left-0 top-0 bottom-0 w-0 bg-white/80 transition-all"
            />
          </div>
        </div>
      </div>
    </aside>
  );
};

export default GSAPPreloader;
