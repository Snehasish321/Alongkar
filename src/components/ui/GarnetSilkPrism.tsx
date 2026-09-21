import React, { useEffect, useRef } from 'react';

// Color & math utilities extracted directly from FeralUI's engine
function hexToRgb(e: string): [number, number, number] {
  const t = parseInt(e.slice(1), 16);
  return [(t >> 16) & 255, (t >> 8) & 255, t & 255];
}

function rgbToOklab(e: string): [number, number, number] {
  const t = hexToRgb(e).map((r) => {
    const h = r / 255;
    return h <= 0.04045 ? h / 12.92 : Math.pow((h + 0.055) / 1.055, 2.4);
  });
  const [n, o, i] = t;
  const c = Math.cbrt(0.4122214708 * n + 0.5363325363 * o + 0.0514459929 * i);
  const l = Math.cbrt(0.2119034982 * n + 0.6806995451 * o + 0.1073969566 * i);
  const d = Math.cbrt(0.0883024619 * n + 0.2817188376 * o + 0.6299787005 * i);
  return [
    0.2104542553 * c + 0.793617785 * l - 0.0040720468 * d,
    1.9779984951 * c - 2.428592205 * l + 0.4505937099 * d,
    0.0259040371 * c + 0.7827717662 * l - 0.808675766 * d,
  ];
}

function oklabToRgb(e: number, t: number, n: number): [number, number, number] {
  const o = Math.pow(e + 0.3963377774 * t + 0.2158037573 * n, 3);
  const i = Math.pow(e - 0.1055613458 * t - 0.0638541728 * n, 3);
  const c = Math.pow(e - 0.0894841775 * t - 1.291485548 * n, 3);
  const r = 4.0767416621 * o - 3.3077115913 * i + 0.2309699292 * c;
  const g = -1.2684380046 * o + 2.6097574011 * i - 0.3413193965 * c;
  const b = -0.0041960863 * o - 0.7034186147 * i + 1.707614701 * c;
  const toRgb = (v: number) =>
    Math.min(
      255,
      Math.max(
        0,
        Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055))
      )
    );
  return [toRgb(r), toRgb(g), toRgb(b)];
}

function blendOklab(e: string, t: string, n: number): [number, number, number] {
  const o = rgbToOklab(e);
  const i = rgbToOklab(t);
  return oklabToRgb(o[0] + (i[0] - o[0]) * n, o[1] + (i[1] - o[1]) * n, o[2] + (i[2] - o[2]) * n);
}

function getDividers(e: number): number[] {
  return Array.from({ length: Math.max(0, e - 1) }, (_, n) => (n + 1) / e);
}

function calculateStops(length: number, divs?: number[]): number[] {
  if (length <= 1) return [50];
  const o = [0, ...(divs && divs.length === length - 1 ? divs : getDividers(length)), 1];
  return Array.from({ length }, (_, c) => ((o[c] + o[c + 1]) / 2) * 100);
}

function sampleColorAt(stops: string[], divs: number[], position: number): [number, number, number] {
  const offsets = calculateStops(stops.length, divs).map((i) => i / 100);
  if (position <= offsets[0]) return hexToRgb(stops[0]);
  if (position >= offsets[offsets.length - 1]) return hexToRgb(stops[stops.length - 1]);
  for (let i = 0; i < offsets.length - 1; i++) {
    if (position >= offsets[i] && position <= offsets[i + 1]) {
      const c = (position - offsets[i]) / Math.max(1e-6, offsets[i + 1] - offsets[i]);
      return blendOklab(stops[i], stops[i + 1], c);
    }
  }
  return hexToRgb(stops[stops.length - 1]);
}

const TOTAL_STOPS_PER_SLAT = 96;
const DEFAULT_F1_TIME = 20.75;
const TRANSITION_DURATION = 0.6;
const smoothStep = (e: number) => {
  const t = Math.min(1, Math.max(0, e));
  return t * t * (3 - 2 * t);
};

function lerpColorArray(palette: [number, number, number][], position: number): [number, number, number] {
  const n = Math.max(0, Math.min(1, position)) * (palette.length - 1);
  const o = Math.floor(n);
  const i = palette[o];
  const c = palette[Math.min(o + 1, palette.length - 1)];
  const l = n - o;
  return [i[0] + (c[0] - i[0]) * l, i[1] + (c[1] - i[1]) * l, i[2] + (c[2] - i[2]) * l];
}

export interface PrismFusionOptions {
  shape?: 'crest' | 'valley' | 'tide' | 'slant' | 'lens';
  direction?: number;
  size?: number;
  height?: number;
  focus?: number;
  position?: number;
  blend?: number;
  facets?: number;
  motion?: 'expand' | 'gather' | 'breathe';
  reverse?: boolean;
}

const DEFAULT_FUSION: PrismFusionOptions = {
  shape: 'crest',
  direction: 0,
  size: 100,
  height: 60,
  focus: 50,
  position: 50,
  blend: 65,
  facets: 35,
  motion: 'expand',
  reverse: false,
};

function computeSlats(
  stops: string[],
  divs: number[],
  count: number,
  fusionOpts: PrismFusionOptions,
  timeVal: number
) {
  const i = Number.isFinite(count) ? Math.max(3, Math.min(16, Math.round(count))) : 11;
  const c = { ...DEFAULT_FUSION, ...fusionOpts };
  const l = c.motion === 'breathe' ? DEFAULT_F1_TIME * 0.48 : timeVal * 0.48 * (c.motion === 'gather' ? -1 : 1);
  const d = smoothStep((timeVal - DEFAULT_F1_TIME + TRANSITION_DURATION) / TRANSITION_DURATION);
  const r = 1 - Math.pow(1 - d, 3);
  const h = sampleColorAt(stops, divs, c.reverse ? 1 : 0);
  const palette = Array.from({ length: 256 }, (_, M) => sampleColorAt(stops, divs, M / 255));
  const slats: { start: number; end: number; colors: string[] }[] = [];
  const f = Math.floor(-l);
  const C = Math.ceil(i - l);

  for (const F of [-1, 1]) {
    for (let M = f; M < C; M++) {
      const v = Math.max(0, (M + l) / i);
      const y = Math.min(1, (M + 1 + l) / i);
      if (y <= v) continue;
      const w = F < 0 ? (1 - y) / 2 : (1 + v) / 2;
      const O = F < 0 ? (1 - v) / 2 : (1 + y) / 2;
      const B = (w + O) / 2;
      const T = ((B - (c.focus ?? 50) / 100) * 2) / ((c.size ?? 100) / 100);
      const m = 0.5 - 0.5 * Math.cos(Math.min(1, Math.abs(T)) * Math.PI);
      const j =
        c.shape === 'valley'
          ? 1 - m
          : c.shape === 'tide'
          ? 0.5 + 0.34 * Math.sin(T * Math.PI * 1.3 + 0.6) + 0.14 * Math.sin(T * Math.PI * 2.1 - 0.8)
          : c.shape === 'slant'
          ? smoothStep(0.5 + T * 0.5)
          : m;
      const b = (c.motion === 'breathe' ? 0.045 : 0.015) * Math.sin(timeVal * 0.32);
      const L = ((c.position ?? 50) - 50) * 0.009;
      const k = 0.28 + j * ((c.height ?? 60) * 0.006) + (c.shape === 'lens' ? 0 : L) + b;
      const I =
        (0.025 * Math.sin(M * 1.8) + 0.012 * Math.sin(M * 0.73 + timeVal * 0.24)) *
        ((c.facets ?? 35) / 35);
      const S = Math.abs(B - 0.5) * 2;
      const E = d >= 1 ? 1 : d * (1 - smoothStep((S - r) / 0.16));
      const colors: string[] = [];

      for (let N = 0; N < TOTAL_STOPS_PER_SLAT; N++) {
        const $ = N / (TOTAL_STOPS_PER_SLAT - 1);
        const A = c.shape === 'lens' ? Math.abs($ - 0.5 - L) * 2 : $;
        const P = 0.22 + (c.blend ?? 65) * 0.008;
        const H = smoothStep((A - k + 0.22) / P);
        const _ = c.shape === 'lens' ? 0.16 : 0.02;
        const z = Math.min(1, Math.max(0, _ + (0.98 - _) * H + I));
        const G = lerpColorArray(palette, c.reverse ? 1 - z : z);
        colors.push(
          `rgb(${[h[0] + (G[0] - h[0]) * E, h[1] + (G[1] - h[1]) * E, h[2] + (G[2] - h[2]) * E]
            .map((W) => Math.round(W))
            .join(',')})`
        );
      }
      slats.push({ start: w, end: O, colors });
    }
  }
  return slats.sort((F, M) => F.start - M.start);
}

function getTransformMatrix(width: number, height: number, dir = 0): [number, number, number, number, number, number] {
  return dir === 1
    ? [0, height, -width, 0, width, 0]
    : dir === 2
    ? [-width, 0, 0, -height, width, height]
    : dir === 3
    ? [0, -height, width, 0, 0, height]
    : [width, 0, 0, height, 0, 0];
}

export interface GarnetSilkPrismProps {
  className?: string;
  speed?: number; // 40
  noise?: number; // 2
  animate?: boolean;
}

// Exact preset stops from user's JSON
const GARNET_SILK_STOPS = ['#491D36', '#893C64', '#C3758F', '#E1A4AF', '#F4D4CE'];
const GARNET_SILK_DIVS = [0.2, 0.4, 0.6, 0.8];

export const GarnetSilkPrism: React.FC<GarnetSilkPrismProps> = ({
  className = 'w-full h-full block',
  speed = 40,
  noise = 2,
  animate = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let currentTime = DEFAULT_F1_TIME;

    const handleResize = () => {
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(rect.width || window.innerWidth, 300) * dpr;
      canvas.height = Math.max(rect.height || window.innerHeight, 300) * dpr;
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    // Film grain noise generator
    const noiseCanvas = document.createElement('canvas');
    const noiseSize = 128;
    noiseCanvas.width = noiseSize;
    noiseCanvas.height = noiseSize;
    const nCtx = noiseCanvas.getContext('2d');
    let noisePattern: CanvasPattern | null = null;

    if (nCtx && noise > 0) {
      const imgData = nCtx.createImageData(noiseSize, noiseSize);
      const buffer = new Uint32Array(imgData.data.buffer);
      const alpha = Math.min(255, Math.floor(noise * 4));
      for (let i = 0; i < buffer.length; i++) {
        const val = Math.random() * 255;
        buffer[i] = (alpha << 24) | (val << 16) | (val << 8) | val;
      }
      nCtx.putImageData(imgData, 0, 0);
      noisePattern = ctx.createPattern(noiseCanvas, 'repeat');
    }

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;
      if (width === 0 || height === 0) return;

      // Base background fill: Midnight Plum
      const bgRgb = hexToRgb(GARNET_SILK_STOPS[0]);
      ctx.fillStyle = `rgb(${bgRgb.join(',')})`;
      ctx.fillRect(0, 0, width, height);

      // Slat seam overlap width to prevent hairline gaps
      const seamOverlap = 1 / (DEFAULT_FUSION.direction! % 2 ? height : width);

      ctx.save();
      ctx.transform(...getTransformMatrix(width, height, DEFAULT_FUSION.direction));

      const slats = computeSlats(
        GARNET_SILK_STOPS,
        GARNET_SILK_DIVS,
        11,
        DEFAULT_FUSION,
        currentTime
      );

      for (const slat of slats) {
        const grad = ctx.createLinearGradient(0, 0, 0, 1);
        const colCount = slat.colors.length;
        slat.colors.forEach((col, idx) => {
          grad.addColorStop(idx / (colCount - 1), col);
        });

        ctx.fillStyle = grad;
        ctx.fillRect(slat.start, 0, slat.end - slat.start + seamOverlap, 1);
      }

      ctx.restore();

      // Apply subtle grain noise
      if (noisePattern) {
        ctx.save();
        ctx.fillStyle = noisePattern;
        ctx.globalAlpha = 0.5;
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
      }

      if (animate && speed > 0) {
        currentTime += (speed / 100) * 0.03;
        animationFrameId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [speed, noise, animate]);

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{
        display: 'block',
        width: '100vw',
        height: '100vh',
      }}
    />
  );
};
