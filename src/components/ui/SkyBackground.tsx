import React, { type CSSProperties } from 'react';
import { SkyGradient } from './SkyGradient';

export { SkyGradient } from './SkyGradient';
export { MADDER_DUSK_PRESET } from './sky-presets';
export type { SkyPresetConfig, SkyColorStop } from './sky-presets';

export interface SkyBackgroundProps {
  className?: string;
  style?: CSSProperties;
  speed?: number;
  paused?: boolean;
  overlayOpacity?: number;
  noise?: number;
  soften?: number;
  dividers?: [number, number, number];
}

/**
 * SkyBackground: Wrapper around the authentic FeralUI Madder Dusk SkyGradient WebGL shader canvas.
 * Seamlessly fills any container as an animated background.
 */
export const SkyBackground: React.FC<SkyBackgroundProps> = ({
  className = '',
  style,
  speed = 20,
  paused = false,
  overlayOpacity = 0,
}) => {
  return (
    <div
      className={`absolute inset-0 w-full h-full overflow-hidden pointer-events-none ${className}`}
      style={style}
    >
      <SkyGradient fill speed={speed} paused={paused} className="w-full h-full" />
      {overlayOpacity > 0 && (
        <div
          className="absolute inset-0 w-full h-full pointer-events-none transition-opacity duration-500"
          style={{
            backgroundColor: `rgba(20, 1, 4, ${overlayOpacity})`,
          }}
        />
      )}
    </div>
  );
};

export default SkyBackground;
