/**
 * Alongkar Production Image Optimization & Delivery Utility
 *
 * Provides centralized Cloudinary & external CDN image transformation,
 * automatic format selection (WebP/AVIF via f_auto), automatic quality (q_auto),
 * responsive srcSet generation, and standard display presets.
 */

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  crop?: 'limit' | 'fill' | 'fit' | 'scale' | 'thumb' | 'pad' | 'crop';
  quality?: 'auto' | 'auto:good' | 'auto:best' | 'auto:eco' | 'auto:low' | number;
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  dpr?: 'auto' | number;
}

export const IMAGE_PRESETS = {
  /** Small thumbnails: Search modal, admin & customer table rows (36px - 60px display) */
  THUMB_SM: { width: 120, height: 120, crop: 'fill' as const, quality: 'auto' as const },
  /** Medium thumbnails: Cart drawer, Wishlist drawer, Product detail thumbs (64px - 100px display) */
  THUMB_MD: { width: 200, height: 240, crop: 'fill' as const, quality: 'auto' as const },
  /** Product card & Category grid: Shop page, homepage grids, collections (280px - 400px display) */
  CARD: { width: 600, crop: 'limit' as const, quality: 'auto' as const },
  /** Product detail main & Quick view main: High-res interactive zoom / gallery (500px - 800px display) */
  DETAIL_HERO: { width: 1000, crop: 'limit' as const, quality: 'auto' as const },
  /** Editorial & story banners: About page, category banner, story section (800px - 1400px display) */
  BANNER: { width: 1400, crop: 'limit' as const, quality: 'auto' as const },
  /** Jewellery inspiration upload preview & modal reference (200px - 450px display) */
  INSPIRATION_PREVIEW: { width: 500, crop: 'limit' as const, quality: 'auto' as const },
} as const;

/**
 * Checks if a given URL is hosted on Cloudinary CDN.
 */
export function isCloudinaryUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('res.cloudinary.com') && url.includes('/image/upload/');
}

/**
 * Checks if a given URL is hosted on Unsplash CDN.
 */
export function isUnsplashUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  return url.includes('images.unsplash.com');
}

// In-memory transformation cache for instant O(1) retrieval across React renders
const urlCache = new Map<string, string>();
const MAX_CACHE_SIZE = 500;

/**
 * Returns an optimized delivery URL for Cloudinary, Unsplash, or local assets.
 * Applies f_auto, q_auto, dimension constraints, and correct cropping.
 */
export function getOptimizedImageUrl(
  url: string | null | undefined,
  options: ImageTransformOptions = {}
): string {
  if (!url || typeof url !== 'string') {
    return '';
  }

  // Fast path for non-CDN or local/data URLs
  if (url.startsWith('data:') || url.startsWith('blob:') || url.endsWith('.svg') || url.startsWith('/')) {
    return url;
  }

  // Construct cache key
  const cacheKey = `${url}|${options.width || 0}|${options.height || 0}|${options.crop || ''}|${options.quality || ''}|${options.format || ''}|${options.dpr || ''}`;
  const cached = urlCache.get(cacheKey);
  if (cached) return cached;

  let result = url;

  if (isCloudinaryUrl(url)) {
    result = transformCloudinaryUrl(url, options);
  } else if (isUnsplashUrl(url)) {
    result = transformUnsplashUrl(url, options);
  }

  // Save to cache with simple size ceiling
  if (urlCache.size >= MAX_CACHE_SIZE) {
    const firstKey = urlCache.keys().next().value;
    if (firstKey) urlCache.delete(firstKey);
  }
  urlCache.set(cacheKey, result);

  return result;
}

/**
 * Transforms a Cloudinary URL with optimal delivery parameters.
 */
function transformCloudinaryUrl(url: string, options: ImageTransformOptions): string {
  const uploadToken = '/image/upload/';
  const uploadIndex = url.indexOf(uploadToken);
  if (uploadIndex === -1) return url;

  const prefix = url.substring(0, uploadIndex + uploadToken.length);
  let rest = url.substring(uploadIndex + uploadToken.length);

  // Check if first segment contains existing transformations
  const slashIndex = rest.indexOf('/');
  if (slashIndex !== -1) {
    const firstSegment = rest.substring(0, slashIndex);
    // Cloudinary transformation segments consist of comma-separated parameter flags (e.g., f_auto,q_auto,w_500,c_fill)
    const isTransformSegment = /^(?:[a-z]{1,4}_[^/,]+(?:,|$))+$/.test(firstSegment);
    if (isTransformSegment) {
      rest = rest.substring(slashIndex + 1);
    }
  }

  // Build transformation parts
  const parts: string[] = [];

  // 1. Format: automatic modern format negotiation (AVIF -> WebP -> original)
  const format = options.format || 'auto';
  parts.push(`f_${format}`);

  // 2. Quality: automatic perceptual compression
  const quality = options.quality !== undefined ? options.quality : 'auto';
  parts.push(`q_${quality}`);

  // 3. Dimensions and crop
  if (options.width) {
    parts.push(`w_${options.width}`);
  }
  if (options.height) {
    parts.push(`h_${options.height}`);
  }

  const crop = options.crop || (options.width && options.height ? 'fill' : 'limit');
  parts.push(`c_${crop}`);

  // 4. Device pixel ratio if specified
  if (options.dpr) {
    parts.push(`dpr_${options.dpr}`);
  }

  const transformString = parts.join(',');
  return `${prefix}${transformString}/${rest}`;
}

/**
 * Transforms an Unsplash URL with optimal width, quality, and format parameters.
 */
function transformUnsplashUrl(url: string, options: ImageTransformOptions): string {
  try {
    const parsed = new URL(url);
    if (options.width) {
      parsed.searchParams.set('w', String(options.width));
    }
    if (options.height) {
      parsed.searchParams.set('h', String(options.height));
    }
    parsed.searchParams.set('auto', 'format');
    parsed.searchParams.set('fit', options.crop === 'fill' ? 'crop' : 'max');
    if (options.quality && typeof options.quality === 'number') {
      parsed.searchParams.set('q', String(options.quality));
    } else if (!parsed.searchParams.has('q')) {
      parsed.searchParams.set('q', '80');
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Generates a responsive srcSet string for Cloudinary or Unsplash images.
 */
export function getResponsiveSrcSet(
  url: string | null | undefined,
  widths: number[] = [320, 480, 640, 800, 1080],
  options: Omit<ImageTransformOptions, 'width'> = {}
): string {
  if (!url || typeof url !== 'string') return '';
  if (!isCloudinaryUrl(url) && !isUnsplashUrl(url)) return '';

  return widths
    .map((w) => `${getOptimizedImageUrl(url, { ...options, width: w })} ${w}w`)
    .join(', ');
}
