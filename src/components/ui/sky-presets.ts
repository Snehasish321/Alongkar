export interface SkyColorStop {
  name?: string;
  hex?: string;
  rgb: [number, number, number];
  position?: number;
}

export interface SkyPresetConfig {
  name: string;
  type: 'sky';
  profile: 'sRGB';
  dividers: [number, number, number];
  soften: number;
  noise: number;
  speed: number;
  stops: SkyColorStop[];
}

export const MADDER_DUSK_PRESET: SkyPresetConfig = {
  name: 'Madder dusk',
  type: 'sky',
  profile: 'sRGB',
  dividers: [0.25, 0.5, 0.75],
  soften: 0,
  noise: 6,
  speed: 20,
  stops: [
    {
      name: 'PALE CORAL',
      hex: '#FFE3C7',
      rgb: [255, 227, 199],
      position: 0.125,
    },
    {
      name: 'IBIS HAZE',
      hex: '#F2B8A0',
      rgb: [242, 184, 160],
      position: 0.375,
    },
    {
      name: 'PERSIMMON RED',
      hex: '#C77E9E',
      rgb: [199, 126, 158],
      position: 0.625,
    },
    {
      name: 'CLEAR WISTERIA',
      hex: '#7A5E9E',
      rgb: [122, 94, 158],
      position: 0.875,
    },
  ],
};
