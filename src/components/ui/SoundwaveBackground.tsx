import React from 'react';
import { SkyBackground, type SkyBackgroundProps, MADDER_DUSK_PRESET } from './SkyBackground';

export interface SoundwaveBackgroundProps extends SkyBackgroundProps {}

/**
 * SoundwaveBackground (Alias to SkyBackground with 'Madder dusk' preset)
 * Maintained for backward compatibility.
 */
export const SoundwaveBackground: React.FC<SoundwaveBackgroundProps> = (props) => {
  return <SkyBackground {...props} />;
};

export { SkyBackground, MADDER_DUSK_PRESET };
export default SoundwaveBackground;
