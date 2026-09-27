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
}

/**
 * Fetches all products (or filtered products) from the database via GET /api/products.
 */
export async function fetchProducts(options?: FetchProductsOptions): Promise<Product[]> {
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
  return rawList.map(normalizeProduct);
}

/**
 * Fetches a single product by its unique slug via GET /api/products?slug=<slug>.
 * Returns null if the product is not found (404).
 */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  if (!slug || typeof slug !== 'string' || !slug.trim()) {
    return null;
  }

  const cleanSlug = slug.trim();
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

  return normalizeProduct(data.product);
}

/**
 * Fetches a single product by its unique ID via GET /api/products?id=<id>.
 * Returns null if the product is not found (404).
 */
export async function fetchProductById(id: string): Promise<Product | null> {
  if (!id || typeof id !== 'string' || !id.trim()) {
    return null;
  }

  const cleanId = id.trim();
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

  return normalizeProduct(data.product);
}

/**
 * Resolves a product by identifier (slug or ID).
 */
export async function fetchProductByIdOrSlug(identifier: string): Promise<Product | null> {
  if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
    return null;
  }

  // Try slug first
  try {
    const product = await fetchProductBySlug(identifier);
    if (product) return product;
  } catch {
    // Fall back to ID lookup
  }

  // Try ID lookup
  try {
    return await fetchProductById(identifier);
  } catch {
    return null;
  }
}
