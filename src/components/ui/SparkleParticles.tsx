import React from 'react';

const SPARKLE_DATA = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  top: ((i * 37) % 85) + 5,
  left: ((i * 53) % 85) + 5,
  size: ((i * 17) % 8) + 8,
}));

export const SparkleParticles: React.FC = () => {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      {SPARKLE_DATA.map((s) => (
        <div
          key={s.id}
          className="absolute text-gold-champagne opacity-75 animate-pulse"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
          }}
        >
          <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full drop-shadow-[0_0_8px_rgba(214,184,120,0.8)]">
            <path d="M12 0L14.59 9.41L24 12L14.59 14.59L12 24L9.41 14.59L0 12L9.41 9.41L12 0Z" />
          </svg>
        </div>
      ))}
    </div>
  );
};

