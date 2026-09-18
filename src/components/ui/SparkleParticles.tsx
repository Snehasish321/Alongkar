import React from 'react';
import { motion } from 'framer-motion';

export const SparkleParticles: React.FC = () => {
  const sparkles = Array.from({ length: 12 });

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {sparkles.map((_, i) => {
        const top = Math.random() * 90 + 5;
        const left = Math.random() * 90 + 5;
        const size = Math.random() * 12 + 6;
        const duration = Math.random() * 3 + 2;
        const delay = Math.random() * 2;

        return (
          <motion.div
            key={i}
            className="absolute text-gold-champagne opacity-75"
            style={{
              top: `${top}%`,
              left: `${left}%`,
              width: `${size}px`,
              height: `${size}px`,
            }}
            animate={{
              scale: [0, 1, 0.4, 1, 0],
              opacity: [0, 0.9, 0.3, 0.8, 0],
              rotate: [0, 45, 90, 135, 180],
            }}
            transition={{
              duration,
              repeat: Infinity,
              delay,
              ease: 'easeInOut',
            }}
          >
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full drop-shadow-[0_0_8px_rgba(214,184,120,0.8)]">
              <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
            </svg>
          </motion.div>
        );
      })}
    </div>
  );
};
