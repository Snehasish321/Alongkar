import type { Product } from '../types';

/**
 * Normalizes an API product object into the strictly-typed frontend Product interface.
 * Handles both flat and nested 'details' properties gracefully.
 */
export function normalizeProduct(raw: any): Product {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid product data received from API');
  }

  const finish = raw.finish || raw.details?.finish || '24K Micron Gold Plated';
  const baseMaterial = raw.baseMaterial || raw.details?.baseMaterial || 'Skin-friendly Brass Alloy';
  const stoneType = raw.stoneType !== undefined ? raw.stoneType : raw.details?.stoneType;
  const warranty = raw.warranty || raw.details?.warranty || '6 Months Polish Guarantee';

  const price = typeof raw.price === 'number' ? raw.price : Number(raw.price) || 0;
  const originalPrice =
    typeof raw.originalPrice === 'number'
      ? raw.originalPrice
      : raw.originalPrice !== undefined
        ? Number(raw.originalPrice)
        : price;

  let discountPercent = typeof raw.discountPercent === 'number' ? raw.discountPercent : Number(raw.discountPercent) || 0;
  if (!discountPercent && originalPrice > price && originalPrice > 0) {
    discountPercent = Math.round(((originalPrice - price) / originalPrice) * 100);
  }

  return {
    id: String(raw.id || ''),
    name: String(raw.name || ''),
    slug: String(raw.slug || ''),
    category: raw.category || 'necklaces',
    collectionId: raw.collectionId || undefined,
    price,
    originalPrice,
    discountPercent,
    rating: typeof raw.rating === 'number' ? raw.rating : Number(raw.rating) || 0,
    reviewCount: typeof raw.reviewCount === 'number' ? raw.reviewCount : Number(raw.reviewCount) || 0,
    isNew: Boolean(raw.isNew),
    isBestSeller: Boolean(raw.isBestSeller),
    isTrending: Boolean(raw.isTrending),
    image: raw.image || '',
    hoverImage: raw.hoverImage || raw.image || '',
    description: raw.description || '',
    finish,
    baseMaterial,
    stoneType: stoneType || undefined,
    warranty,
    details: {
      finish,
      baseMaterial,
      ...(stoneType ? { stoneType } : {}),
      warranty,
    },
    inStock: raw.inStock !== false,
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

export interface FetchProductsOptions {
  category?: string;
  collectionId?: string;
  forceRefresh?: boolean;
}

// ─── Client-Side High-Speed Cache & In-Flight Deduplication ───────────────────
interface CacheRecord<T> {
  data: T;
  timestamp: number;
}

const CATALOG_CACHE_TTL = 60 * 1000; // 60 seconds
const ITEM_CACHE_TTL = 120 * 1000;   // 2 minutes

const catalogCache = new Map<string, CacheRecord<Product[]>>();
const itemCache = new Map<string, CacheRecord<Product>>();
const inFlightRequests = new Map<string, Promise<any>>();

/**
 * Manually invalidates client-side memory cache (e.g. after admin updates).
 */
export function clearProductApiCache(): void {
  catalogCache.clear();
  itemCache.clear();
  inFlightRequests.clear();
}

/**
 * Pre-seeds the individual item cache from a product list for instant page transitions.
 */
function seedItemCache(products: Product[]): void {
  const now = Date.now();
  for (const product of products) {
    if (product.id) itemCache.set(`id:${product.id}`, { data: product, timestamp: now });
    if (product.slug) itemCache.set(`slug:${product.slug}`, { data: product, timestamp: now });
  }
}

/**
 * Fetches all products (or filtered products) from the database via GET /api/products.
 * Features in-memory caching and request deduplication.
 */
export async function fetchProducts(options?: FetchProductsOptions): Promise<Product[]> {
  const cat = options?.category && options.category !== 'all' ? options.category : 'all';
  const col = options?.collectionId ? options.collectionId : 'all';
  const cacheKey = `catalog:${cat}:${col}`;

  // 1. Check client memory cache unless forceRefresh requested
  if (!options?.forceRefresh) {
    const cached = catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CATALOG_CACHE_TTL) {
      return cached.data;
    }
  }

  // 2. Request deduplication: reuse any in-flight Promise for this query
  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const params = new URLSearchParams();
      if (options?.category && options.category !== 'all') {
        params.set('category', options.category);
      }
      if (options?.collectionId) {
        params.set('collectionId', options.collectionId);
      }

      const query = params.toString() ? `?${params.toString()}` : '';
      const response = await fetch(`/api/products${query}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch products: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const rawList = Array.isArray(data.products) ? data.products : [];
      const normalizedList = rawList.map(normalizeProduct);

      // Store in catalog cache
      catalogCache.set(cacheKey, { data: normalizedList, timestamp: Date.now() });

      // Pre-seed item cache so detail pages open instantly (0ms)
      seedItemCache(normalizedList);

      return normalizedList;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Fetches a single product by its unique slug via GET /api/products?slug=<slug>.
 * Features in-memory caching and request deduplication.
 * Returns null if the product is not found (404).
 */
export async function fetchProductBySlug(slug: string, forceRefresh = false): Promise<Product | null> {
  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    return null;
  }

  const cleanSlug = slug.trim();
  const cacheKey = `slug:${cleanSlug}`;

  if (!forceRefresh) {
    const cached = itemCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ITEM_CACHE_TTL) {
      return cached.data;
    }
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(`/api/products?slug=${encodeURIComponent(cleanSlug)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch product by slug "${cleanSlug}": ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.product) {
        return null;
      }

      const product = normalizeProduct(data.product);
      itemCache.set(cacheKey, { data: product, timestamp: Date.now() });
      if (product.id) {
        itemCache.set(`id:${product.id}`, { data: product, timestamp: Date.now() });
      }

      return product;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Fetches a single product by its unique ID via GET /api/products?id=<id>.
 * Features in-memory caching and request deduplication.
 * Returns null if the product is not found (404).
 */
export async function fetchProductById(id: string, forceRefresh = false): Promise<Product | null> {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return null;
  }

  const cleanId = id.trim();
  const cacheKey = `id:${cleanId}`;

  if (!forceRefresh) {
    const cached = itemCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < ITEM_CACHE_TTL) {
      return cached.data;
    }
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const fetchPromise = (async () => {
    try {
      const response = await fetch(`/api/products?id=${encodeURIComponent(cleanId)}`, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
        },
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch product by id "${cleanId}": ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (!data.product) {
        return null;
      }

      const product = normalizeProduct(data.product);
      itemCache.set(cacheKey, { data: product, timestamp: Date.now() });
      if (product.slug) {
        itemCache.set(`slug:${product.slug}`, { data: product, timestamp: Date.now() });
      }

      return product;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, fetchPromise);
  return fetchPromise;
}

/**
 * Resolves a product by identifier (slug or ID).
 */
export async function fetchProductByIdOrSlug(identifier: string, forceRefresh = false): Promise<Product | null> {
  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return null;
  }

  // Try slug first
  try {
    const product = await fetchProductBySlug(identifier, forceRefresh);
    if (product) return product;
  } catch {
    // Fall back to ID lookup
  }

  // Try ID lookup
  try {
    return await fetchProductById(identifier, forceRefresh);
  } catch {
    return null;
  }
}
