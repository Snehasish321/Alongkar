import prisma from '../src/lib/prisma.js';
import { requireAdmin, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import { Prisma } from '@prisma/client';
import {
  cacheGet,
  cacheSet,
  getCacheVersion,
  invalidateProducts,
  invalidateProductKeys,
  CacheKey,
  TTL,
} from './_utils/cache.js';
import {
  isValidString,
  isValidNumber,
  isValidInteger,
  isValidSlug as isValidSlugUtil,
  isValidIdentifier,
  sanitizeSearchQuery,
  sanitizeSortBy,
  getSafeErrorMessage,
  logServerError,
  withTimeout,
  checkRateLimit,
  MAX_PRODUCT_PRICE,
  MAX_DESCRIPTION_LENGTH,
  MAX_IMAGE_URL_LENGTH,
} from './_utils/security.js';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates slug format: lowercase letters, numbers, and hyphens only.
 */
export function isValidSlug(slug: string): boolean {
  return isValidSlugUtil(slug);
}

/**
 * Formats a database Product record to be 100% compatible with the frontend Product interface.
 */
export function formatProductResponse(product: any) {
  if (!product) return null;

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    category: product.category,
    ...(product.collectionId ? { collectionId: product.collectionId } : {}),
    price: product.price,
    originalPrice: product.originalPrice,
    discountPercent: product.discountPercent,
    rating: product.rating,
    reviewCount: product.reviewCount,
    isNew: product.isNew ?? false,
    isBestSeller: product.isBestSeller ?? false,
    isTrending: product.isTrending ?? false,
    image: product.image,
    hoverImage: product.hoverImage,
    description: product.description,
    finish: product.finish,
    baseMaterial: product.baseMaterial,
    ...(product.stoneType ? { stoneType: product.stoneType } : {}),
    warranty: product.warranty,
    details: {
      finish: product.finish,
      baseMaterial: product.baseMaterial,
      ...(product.stoneType ? { stoneType: product.stoneType } : {}),
      warranty: product.warranty,
    },
    inStock: product.inStock ?? true,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}

/**
 * Validates the complete creation payload for POST requests.
 * Uses strict length, numeric range, and type validation to prevent malformed or abusive inputs.
 */
export function validateProductCreatePayload(body: any): { errors: ValidationError[]; data?: any } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  // Name (1 - 200 chars)
  if (!isValidString(body.name, 1, 200)) {
    errors.push({ field: 'name', message: 'Product name is required and must be between 1 and 200 characters' });
  }

  // Slug (1 - 150 chars, lowercase alphanumeric with single hyphens)
  if (!body.slug || typeof body.slug !== 'string' || body.slug.trim().length === 0) {
    errors.push({ field: 'slug', message: 'Product slug is required and must be a non-empty string' });
  } else if (!isValidSlug(body.slug.trim())) {
    errors.push({
      field: 'slug',
      message: 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. "nitya-gold-bracelet")',
    });
  }

  // Category (1 - 50 chars)
  if (!isValidString(body.category, 1, 50)) {
    errors.push({ field: 'category', message: 'Product category is required (maximum 50 characters)' });
  }

  // Price (0 - 100,000,000, finite number)
  if (!isValidNumber(body.price, 0, MAX_PRODUCT_PRICE)) {
    errors.push({
      field: 'price',
      message: `Product price is required and must be a non-negative finite number (max ${MAX_PRODUCT_PRICE})`,
    });
  }

  // Original Price (0 - 100,000,000, finite number)
  if (!isValidNumber(body.originalPrice, 0, MAX_PRODUCT_PRICE)) {
    errors.push({
      field: 'originalPrice',
      message: `Original price is required and must be a non-negative finite number (max ${MAX_PRODUCT_PRICE})`,
    });
  }

  // Image (1 - 1000 chars)
  if (!isValidString(body.image, 1, MAX_IMAGE_URL_LENGTH)) {
    errors.push({ field: 'image', message: 'Main product image URL is required (maximum 1000 characters)' });
  }

  // Hover Image (1 - 1000 chars)
  if (!isValidString(body.hoverImage, 1, MAX_IMAGE_URL_LENGTH)) {
    errors.push({ field: 'hoverImage', message: 'Hover image URL is required (maximum 1000 characters)' });
  }

  // Description (1 - 5000 chars)
  if (!isValidString(body.description, 1, MAX_DESCRIPTION_LENGTH)) {
    errors.push({ field: 'description', message: 'Product description is required (maximum 5000 characters)' });
  }

  // Finish, BaseMaterial, Warranty (support both flat and nested under details)
  const finish = body.finish !== undefined ? body.finish : body.details?.finish;
  if (!isValidString(finish, 1, 100)) {
    errors.push({ field: 'finish', message: 'Product finish specification is required (maximum 100 characters)' });
  }

  const baseMaterial = body.baseMaterial !== undefined ? body.baseMaterial : body.details?.baseMaterial;
  if (!isValidString(baseMaterial, 1, 100)) {
    errors.push({ field: 'baseMaterial', message: 'Product base material is required (maximum 100 characters)' });
  }

  const warranty = body.warranty !== undefined ? body.warranty : body.details?.warranty;
  if (!isValidString(warranty, 1, 100)) {
    errors.push({ field: 'warranty', message: 'Product warranty is required (maximum 100 characters)' });
  }

  const stoneType = body.stoneType !== undefined ? body.stoneType : body.details?.stoneType;
  if (stoneType !== undefined && stoneType !== null) {
    if (!isValidString(stoneType, 1, 100)) {
      errors.push({ field: 'stoneType', message: 'Stone type must be a string up to 100 characters or null' });
    }
  }

  const collectionId = body.collectionId;
  if (collectionId !== undefined && collectionId !== null) {
    if (!isValidString(collectionId, 1, 50)) {
      errors.push({ field: 'collectionId', message: 'Collection ID must be a string up to 50 characters or null' });
    }
  }

  if (body.rating !== undefined && !isValidNumber(body.rating, 0, 5)) {
    errors.push({ field: 'rating', message: 'Rating must be a finite number between 0 and 5' });
  }

  if (body.reviewCount !== undefined && !isValidInteger(body.reviewCount, 0, 10_000_000)) {
    errors.push({ field: 'reviewCount', message: 'Review count must be a non-negative integer' });
  }

  if (body.discountPercent !== undefined && !isValidInteger(body.discountPercent, 0, 100)) {
    errors.push({ field: 'discountPercent', message: 'Discount percent must be an integer between 0 and 100' });
  }

  if (errors.length > 0) {
    return { errors };
  }

  let calculatedDiscount = body.discountPercent;
  if (
    calculatedDiscount === undefined &&
    typeof body.originalPrice === 'number' &&
    typeof body.price === 'number' &&
    body.originalPrice > 0
  ) {
    calculatedDiscount = Math.max(
      0,
      Math.round(((body.originalPrice - body.price) / body.originalPrice) * 100)
    );
  }

  // Explicit field allowlist preventing mass assignment
  const sanitizedData = {
    ...(body.id && isValidIdentifier(body.id) ? { id: String(body.id).trim() } : {}),
    name: body.name.trim(),
    slug: body.slug.trim(),
    category: body.category.trim(),
    collectionId: collectionId ? String(collectionId).trim() : null,
    price: Number(body.price),
    originalPrice: Number(body.originalPrice),
    discountPercent: typeof calculatedDiscount === 'number' ? Math.round(calculatedDiscount) : 0,
    rating: typeof body.rating === 'number' ? Number(body.rating) : 0,
    reviewCount: typeof body.reviewCount === 'number' ? Math.round(body.reviewCount) : 0,
    isNew: Boolean(body.isNew),
    isBestSeller: Boolean(body.isBestSeller),
    isTrending: Boolean(body.isTrending),
    image: body.image.trim(),
    hoverImage: body.hoverImage.trim(),
    description: body.description.trim(),
    finish: finish.trim(),
    baseMaterial: baseMaterial.trim(),
    stoneType: stoneType ? String(stoneType).trim() : null,
    warranty: warranty.trim(),
    inStock: body.inStock !== undefined ? Boolean(body.inStock) : true,
  };

  return { errors: [], data: sanitizedData };
}

/**
 * Validates partial update payload for PATCH / PUT requests.
 * Uses an explicit allowlist to prevent mass-assignment vulnerabilities.
 */
export function validateProductUpdatePayload(body: any): { errors: ValidationError[]; data?: any } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  const updateData: Record<string, any> = {};

  if (body.name !== undefined) {
    if (!isValidString(body.name, 1, 200)) {
      errors.push({ field: 'name', message: 'Name must be a string between 1 and 200 characters' });
    } else {
      updateData.name = body.name.trim();
    }
  }

  if (body.slug !== undefined) {
    if (!isValidString(body.slug, 1, 150)) {
      errors.push({ field: 'slug', message: 'Slug must be a non-empty string up to 150 characters' });
    } else if (!isValidSlug(body.slug.trim())) {
      errors.push({
        field: 'slug',
        message: 'Slug must contain only lowercase letters, numbers, and hyphens',
      });
    } else {
      updateData.slug = body.slug.trim();
    }
  }

  if (body.category !== undefined) {
    if (!isValidString(body.category, 1, 50)) {
      errors.push({ field: 'category', message: 'Category must be a non-empty string up to 50 characters' });
    } else {
      updateData.category = body.category.trim();
    }
  }

  if (body.collectionId !== undefined) {
    if (body.collectionId !== null && !isValidString(body.collectionId, 1, 50)) {
      errors.push({ field: 'collectionId', message: 'Collection ID must be a string up to 50 characters or null' });
    } else {
      updateData.collectionId = body.collectionId ? String(body.collectionId).trim() : null;
    }
  }

  if (body.price !== undefined) {
    if (!isValidNumber(body.price, 0, MAX_PRODUCT_PRICE)) {
      errors.push({ field: 'price', message: `Price must be a non-negative finite number (max ${MAX_PRODUCT_PRICE})` });
    } else {
      updateData.price = Number(body.price);
    }
  }

  if (body.originalPrice !== undefined) {
    if (!isValidNumber(body.originalPrice, 0, MAX_PRODUCT_PRICE)) {
      errors.push({ field: 'originalPrice', message: `Original price must be a non-negative finite number (max ${MAX_PRODUCT_PRICE})` });
    } else {
      updateData.originalPrice = Number(body.originalPrice);
    }
  }

  if (body.discountPercent !== undefined) {
    if (!isValidInteger(body.discountPercent, 0, 100)) {
      errors.push({ field: 'discountPercent', message: 'Discount percent must be an integer between 0 and 100' });
    } else {
      updateData.discountPercent = Math.round(body.discountPercent);
    }
  }

  if (body.rating !== undefined) {
    if (!isValidNumber(body.rating, 0, 5)) {
      errors.push({ field: 'rating', message: 'Rating must be a finite number between 0 and 5' });
    } else {
      updateData.rating = Number(body.rating);
    }
  }

  if (body.reviewCount !== undefined) {
    if (!isValidInteger(body.reviewCount, 0, 10_000_000)) {
      errors.push({ field: 'reviewCount', message: 'Review count must be a non-negative integer' });
    } else {
      updateData.reviewCount = Math.round(body.reviewCount);
    }
  }

  if (body.isNew !== undefined) {
    updateData.isNew = Boolean(body.isNew);
  }

  if (body.isBestSeller !== undefined) {
    updateData.isBestSeller = Boolean(body.isBestSeller);
  }

  if (body.isTrending !== undefined) {
    updateData.isTrending = Boolean(body.isTrending);
  }

  if (body.image !== undefined) {
    if (!isValidString(body.image, 1, MAX_IMAGE_URL_LENGTH)) {
      errors.push({ field: 'image', message: 'Image must be a valid URL string up to 1000 characters' });
    } else {
      updateData.image = body.image.trim();
    }
  }

  if (body.hoverImage !== undefined) {
    if (!isValidString(body.hoverImage, 1, MAX_IMAGE_URL_LENGTH)) {
      errors.push({ field: 'hoverImage', message: 'Hover image must be a valid URL string up to 1000 characters' });
    } else {
      updateData.hoverImage = body.hoverImage.trim();
    }
  }

  if (body.description !== undefined) {
    if (!isValidString(body.description, 1, MAX_DESCRIPTION_LENGTH)) {
      errors.push({ field: 'description', message: 'Description must be a non-empty string up to 5000 characters' });
    } else {
      updateData.description = body.description.trim();
    }
  }

  const finish = body.finish !== undefined ? body.finish : body.details?.finish;
  if (finish !== undefined) {
    if (!isValidString(finish, 1, 100)) {
      errors.push({ field: 'finish', message: 'Finish must be a non-empty string up to 100 characters' });
    } else {
      updateData.finish = finish.trim();
    }
  }

  const baseMaterial = body.baseMaterial !== undefined ? body.baseMaterial : body.details?.baseMaterial;
  if (baseMaterial !== undefined) {
    if (!isValidString(baseMaterial, 1, 100)) {
      errors.push({ field: 'baseMaterial', message: 'Base material must be a non-empty string up to 100 characters' });
    } else {
      updateData.baseMaterial = baseMaterial.trim();
    }
  }

  const warranty = body.warranty !== undefined ? body.warranty : body.details?.warranty;
  if (warranty !== undefined) {
    if (!isValidString(warranty, 1, 100)) {
      errors.push({ field: 'warranty', message: 'Warranty must be a non-empty string up to 100 characters' });
    } else {
      updateData.warranty = warranty.trim();
    }
  }

  const stoneType = body.stoneType !== undefined ? body.stoneType : body.details?.stoneType;
  if (stoneType !== undefined) {
    if (stoneType !== null && !isValidString(stoneType, 1, 100)) {
      errors.push({ field: 'stoneType', message: 'Stone type must be a string up to 100 characters or null' });
    } else {
      updateData.stoneType = stoneType ? String(stoneType).trim() : null;
    }
  }

  if (body.inStock !== undefined) {
    updateData.inStock = Boolean(body.inStock);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], data: updateData };
}

/**
 * Extracts product identifier (id or slug) from query parameters, path segments, or body.
 */
export function extractIdentifier(req: any, body: any): { id?: string; slug?: string; raw?: string } {
  let queryParams: Record<string, string> = {};
  if (req.query && typeof req.query === 'object') {
    queryParams = req.query;
  } else if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      url.searchParams.forEach((v, k) => {
        queryParams[k] = v;
      });
    } catch {}
  }

  if (queryParams.id) {
    const cleanId = String(queryParams.id).trim().slice(0, 100);
    return { id: cleanId, raw: cleanId };
  }
  if (queryParams.slug) {
    const cleanSlug = String(queryParams.slug).trim().slice(0, 150);
    return { slug: cleanSlug, raw: cleanSlug };
  }

  // Check sub-path segments, e.g. /api/products/prod-br-1
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const productsIdx = segments.indexOf('products');
      if (productsIdx !== -1 && segments.length > productsIdx + 1) {
        const seg = decodeURIComponent(segments[productsIdx + 1]).trim().slice(0, 150);
        if (seg && seg !== 'index') {
          return { raw: seg, id: seg, slug: seg };
        }
      }
    } catch {}
  }

  if (body && typeof body === 'object') {
    if (body.id && typeof body.id === 'string' && body.id.trim()) {
      const cleanId = body.id.trim().slice(0, 100);
      return { id: cleanId, raw: cleanId };
    }
    if (body.slug && typeof body.slug === 'string' && body.slug.trim() && !body.name) {
      const cleanSlug = body.slug.trim().slice(0, 150);
      return { slug: cleanSlug, raw: cleanSlug };
    }
  }

  return {};
}

/**
 * Server-side Product API Handler
 *
 * Supported methods:
 * - GET /api/products : List all products with bounded pagination, filters, sorting, and search
 * - GET /api/products?id=<id> OR ?slug=<slug> OR /api/products/<id|slug> : Get single product
 * - POST /api/products : Create product (Protected admin session required)
 * - PATCH / PUT /api/products : Update product (Protected admin session required)
 * - DELETE /api/products : Delete product (Protected admin session required)
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);

    // Enforce payload size and JSON structure protection
    if (isPayloadTooLarge(body)) {
      return respond(res, 413, { error: 'Payload too large: maximum allowed JSON body size is 1MB' });
    }
    if (isMalformedJson(body)) {
      return respond(res, 400, { error: 'Invalid JSON payload format' });
    }

    // ==========================================
    // GET: Retrieve All Products or Single Product (Redis L2 + PostgreSQL)
    // ==========================================
    if (method === 'GET') {
      const { id, slug, raw } = extractIdentifier(req, body);

      // Single Product Lookup
      if (id || slug || raw) {
        const identifier = (id || slug || raw)!;
        if (!isValidIdentifier(identifier) && !isValidSlug(identifier)) {
          return respond(res, 400, { error: 'Invalid product identifier format' });
        }

        const cacheKey = id
          ? CacheKey.productId(id)
          : slug
            ? CacheKey.productSlug(slug)
            : CacheKey.productRaw(raw!);

        const cached = await cacheGet<any>(cacheKey);
        if (cached.hit && cached.data) {
          return respond(
            res,
            200,
            { product: cached.data },
            {
              'X-Cache': 'HIT',
              'X-Cache-Source': cached.source,
              'Cache-Control': 'private, no-cache, no-transform',
            }
          );
        }

        // Capture cache version before DB read to detect race with mutations
        const cacheVersion = await getCacheVersion();

        let product = null;

        if (id && !slug) {
          product = await withTimeout(
            prisma.product.findUnique({ where: { id } }),
            8000,
            'Find product by id'
          );
        } else if (slug && !id) {
          product = await withTimeout(
            prisma.product.findUnique({ where: { slug } }),
            8000,
            'Find product by slug'
          );
        } else if (raw) {
          product = await withTimeout(
            prisma.product.findFirst({
              where: {
                OR: [{ id: raw }, { slug: raw }],
              },
            }),
            8000,
            'Find product by raw identifier'
          );
        }

        if (!product) {
          return respond(res, 404, {
            error: 'Product not found',
            identifier: id || slug || raw,
          });
        }

        const formatted = formatProductResponse(product);

        // Cache single product in Redis with version check to prevent stale GET race
        try {
          if (product.id) await cacheSet(CacheKey.productId(product.id), formatted, TTL.PRODUCT_ONE, cacheVersion);
          if (product.slug) await cacheSet(CacheKey.productSlug(product.slug), formatted, TTL.PRODUCT_ONE, cacheVersion);
          if (raw && raw !== product.id && raw !== product.slug) {
            await cacheSet(CacheKey.productRaw(raw), formatted, TTL.PRODUCT_ONE, cacheVersion);
          }
        } catch (cacheErr) {
          console.warn('[Cache] Non-critical cacheSet error:', cacheErr);
        }

        return respond(
          res,
          200,
          { product: formatted },
          {
            'X-Cache': 'MISS',
            'Cache-Control': 'private, no-cache, no-transform',
          }
        );
      }

      // Query parameters for filtering, searching, sorting & pagination
      let categoryFilter: string | undefined = undefined;
      let collectionFilter: string | undefined = undefined;
      let searchQuery: string | undefined = undefined;
      let sortBy: string | undefined = undefined;
      let inStockFilter: string | undefined = undefined;
      let minPrice: number | undefined = undefined;
      let maxPrice: number | undefined = undefined;
      let page: number | undefined = undefined;
      let limit: number | undefined = undefined;

      const rawParams: Record<string, string> = {};
      if (req.query && typeof req.query === 'object') {
        Object.assign(rawParams, req.query);
      } else if (req.url) {
        try {
          const url = new URL(req.url, 'http://localhost');
          url.searchParams.forEach((v, k) => {
            rawParams[k] = v;
          });
        } catch {}
      }

      // Sanitization & Bounded Parameter Enforcement
      if (rawParams.category) {
        const cat = rawParams.category.trim().slice(0, 50);
        if (cat.length > 0) categoryFilter = cat;
      }
      if (rawParams.collectionId) {
        const col = rawParams.collectionId.trim().slice(0, 50);
        if (col.length > 0) collectionFilter = col;
      }
      if (rawParams.search || rawParams.q) {
        searchQuery = sanitizeSearchQuery(rawParams.search || rawParams.q, 100);
      }
      if (rawParams.sortBy || rawParams.sort) {
        sortBy = sanitizeSortBy(rawParams.sortBy || rawParams.sort);
      }
      if (rawParams.inStock !== undefined) {
        const stk = rawParams.inStock.trim().toLowerCase();
        if (stk === 'true' || stk === 'false' || stk === 'all') {
          inStockFilter = stk;
        }
      }
      if (rawParams.minPrice) {
        const num = parseFloat(rawParams.minPrice);
        if (Number.isFinite(num) && !isNaN(num) && num >= 0 && num <= MAX_PRODUCT_PRICE) {
          minPrice = num;
        }
      }
      if (rawParams.maxPrice) {
        const num = parseFloat(rawParams.maxPrice);
        if (Number.isFinite(num) && !isNaN(num) && num >= 0 && num <= MAX_PRODUCT_PRICE) {
          maxPrice = num;
        }
      }
      if (rawParams.page) {
        const p = parseInt(rawParams.page, 10);
        if (!isNaN(p) && p >= 1 && p <= 10_000) {
          page = p;
        }
      }
      if (rawParams.limit) {
        const l = parseInt(rawParams.limit, 10);
        if (!isNaN(l) && l >= 1) {
          limit = Math.min(100, Math.max(1, l));
        }
      }

      // Rate limit abusive search attempts if needed (60 searches / minute per client)
      if (searchQuery) {
        const clientIp = req.headers?.['x-forwarded-for'] || req.socket?.remoteAddress || 'anonymous';
        const rateCheck = await checkRateLimit(String(clientIp), {
          keyPrefix: 'search',
          limit: 60,
          windowSeconds: 60,
        });
        if (!rateCheck.allowed) {
          return respond(
            res,
            429,
            { error: 'Too many search requests. Please slow down.' },
            { 'Retry-After': String(rateCheck.resetSeconds) }
          );
        }
      }

      const filterOptions = {
        category: categoryFilter,
        collectionId: collectionFilter,
        search: searchQuery,
        sortBy,
        inStock: inStockFilter,
        minPrice,
        maxPrice,
        page,
        limit,
      };

      const listCacheKey = CacheKey.productsList(filterOptions);
      const cachedList = await cacheGet<any>(listCacheKey);
      if (cachedList.hit && cachedList.data) {
        return respond(
          res,
          200,
          cachedList.data,
          {
            'X-Cache': 'HIT',
            'X-Cache-Source': cachedList.source,
            'Cache-Control': 'private, no-cache, no-transform',
          }
        );
      }

      // Capture cache version before DB query to guard against concurrent mutations
      const cacheVersion = await getCacheVersion();

      // Build database WHERE clause safely using typed Prisma builders
      const whereClause: Prisma.ProductWhereInput = {};
      if (categoryFilter && categoryFilter.toLowerCase() !== 'all') {
        whereClause.category = categoryFilter;
      }
      if (collectionFilter && collectionFilter.toLowerCase() !== 'all') {
        whereClause.collectionId = collectionFilter;
      }
      if (inStockFilter && inStockFilter.toLowerCase() !== 'all') {
        whereClause.inStock = inStockFilter.toLowerCase() === 'true';
      }
      if (minPrice !== undefined || maxPrice !== undefined) {
        whereClause.price = {
          ...(minPrice !== undefined ? { gte: minPrice } : {}),
          ...(maxPrice !== undefined ? { lte: maxPrice } : {}),
        };
      }
      if (searchQuery) {
        whereClause.OR = [
          { name: { contains: searchQuery, mode: 'insensitive' } },
          { description: { contains: searchQuery, mode: 'insensitive' } },
          { category: { contains: searchQuery, mode: 'insensitive' } },
        ];
      }

      // Build database ORDER BY clause with strict allowlist
      let orderByClause: Prisma.ProductOrderByWithRelationInput | Prisma.ProductOrderByWithRelationInput[] = { createdAt: 'desc' };
      if (sortBy) {
        const s = sortBy.toLowerCase();
        if (s === 'price-asc' || s === 'price-low-to-high') {
          orderByClause = { price: 'asc' };
        } else if (s === 'price-desc' || s === 'price-high-to-low') {
          orderByClause = { price: 'desc' };
        } else if (s === 'rating') {
          orderByClause = { rating: 'desc' };
        } else if (s === 'bestseller' || s === 'popular') {
          orderByClause = [{ isBestSeller: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }];
        } else if (s === 'newest') {
          orderByClause = { createdAt: 'desc' };
        }
      }

      let responseData: any;

      if (page !== undefined) {
        const pageSize = limit || 20;
        const skip = (page - 1) * pageSize;

        // Run data query and total count query in parallel with timeout protection
        const [products, totalCount] = await withTimeout(
          Promise.all([
            prisma.product.findMany({
              where: whereClause,
              orderBy: orderByClause,
              skip,
              take: pageSize,
            }),
            prisma.product.count({ where: whereClause }),
          ]),
          8000,
          'Paginated products query'
        );

        responseData = {
          products: products.map(formatProductResponse),
          count: products.length,
          total: totalCount,
          page,
          limit: pageSize,
          totalPages: Math.ceil(totalCount / pageSize) || 1,
        };
      } else {
        // Enforce safe maximum limit of 100 for unpaginated queries to protect DB
        const products = await withTimeout(
          prisma.product.findMany({
            where: whereClause,
            orderBy: orderByClause,
            take: limit || 100,
          }),
          8000,
          'Unpaginated products query'
        );

        responseData = {
          products: products.map(formatProductResponse),
          count: products.length,
        };
      }

      // Store in Redis with cache generation verification to prevent stale overwrite
      try {
        await cacheSet(listCacheKey, responseData, TTL.PRODUCTS_ALL, cacheVersion);
      } catch (cacheErr) {
        console.warn('[Cache] Non-critical cacheSet error:', cacheErr);
      }

      return respond(
        res,
        200,
        responseData,
        {
          'X-Cache': 'MISS',
          'Cache-Control': 'private, no-cache, no-transform',
        }
      );
    }

    // ==========================================
    // Protected Endpoints: POST, PATCH, PUT, DELETE
    // Enforce Secure Administrator Authorization (Clerk metadata role === 'admin')
    // ==========================================
    const authCheck = await requireAdmin(req, body);
    if (!authCheck.authorized) {
      return respond(res, authCheck.status, {
        error: authCheck.error,
      });
    }

    // ==========================================
    // POST: Create New Product
    // ==========================================
    if (method === 'POST') {
      const { errors, data } = validateProductCreatePayload(body);
      if (errors.length > 0) {
        return respond(res, 400, {
          error: 'Validation failed: Invalid or missing product fields',
          details: errors,
        });
      }

      try {
        const createdProduct = await withTimeout(
          prisma.product.create({
            data,
          }),
          8000,
          'Create product'
        );

        // Invalidate product caches gracefully
        try {
          await invalidateProducts();
        } catch (cacheErr) {
          console.warn('[Cache] Invalidation warning after product creation:', cacheErr);
        }

        return respond(res, 201, {
          message: 'Product created successfully',
          product: formatProductResponse(createdProduct),
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const target = error.meta?.target;
          const isSlug = Array.isArray(target) ? target.includes('slug') : String(target).includes('slug');
          return respond(res, 409, {
            error: isSlug
              ? `A product with slug "${data.slug}" already exists`
              : 'A product with this unique identifier already exists',
            field: isSlug ? 'slug' : 'id',
          });
        }
        logServerError({
          endpoint: '/api/products',
          method: 'POST',
          operation: 'create_product',
          error,
        });
        return respond(res, 500, { error: 'Failed to create product in database' });
      }
    }

    // ==========================================
    // PATCH / PUT: Update Existing Product
    // ==========================================
    if (method === 'PATCH' || method === 'PUT') {
      const { id, slug, raw } = extractIdentifier(req, body);

      if (!id && !slug && !raw) {
        return respond(res, 400, {
          error: 'Product identifier (id or slug) is required for updates',
        });
      }

      // Find target product
      const existingProduct = await withTimeout(
        prisma.product.findFirst({
          where: {
            OR: [{ id: id || raw || '' }, { slug: slug || raw || '' }],
          },
        }),
        8000,
        'Find product before update'
      );

      if (!existingProduct) {
        return respond(res, 404, {
          error: 'Product not found',
          identifier: id || slug || raw,
        });
      }

      const { errors, data: updateData } = validateProductUpdatePayload(body);
      if (errors.length > 0) {
        return respond(res, 400, {
          error: 'Validation failed: Invalid update values',
          details: errors,
        });
      }

      if (Object.keys(updateData).length === 0) {
        return respond(res, 400, {
          error: 'No valid update fields provided',
        });
      }

      try {
        const updatedProduct = await withTimeout(
          prisma.product.update({
            where: { id: existingProduct.id },
            data: updateData,
          }),
          8000,
          'Update product'
        );

        // Invalidate product catalog and specific item keys gracefully
        try {
          await invalidateProducts();
          await invalidateProductKeys(existingProduct.id, existingProduct.slug);
          if (updatedProduct.id || updatedProduct.slug) {
            await invalidateProductKeys(updatedProduct.id, updatedProduct.slug);
          }
        } catch (cacheErr) {
          console.warn('[Cache] Invalidation warning after product update:', cacheErr);
        }

        return respond(res, 200, {
          message: 'Product updated successfully',
          product: formatProductResponse(updatedProduct),
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          return respond(res, 409, {
            error: `A product with slug "${updateData.slug}" already exists`,
            field: 'slug',
          });
        }
        logServerError({
          endpoint: '/api/products',
          method: 'PATCH',
          operation: 'update_product',
          error,
        });
        return respond(res, 500, { error: 'Failed to update product in database' });
      }
    }

    // ==========================================
    // DELETE: Delete Product
    // ==========================================
    if (method === 'DELETE') {
      const { id, slug, raw } = extractIdentifier(req, body);

      if (!id && !slug && !raw) {
        return respond(res, 400, {
          error: 'Product identifier (id or slug) is required for deletion',
        });
      }

      // Find target product
      const existingProduct = await withTimeout(
        prisma.product.findFirst({
          where: {
            OR: [{ id: id || raw || '' }, { slug: slug || raw || '' }],
          },
        }),
        8000,
        'Find product before deletion'
      );

      if (!existingProduct) {
        return respond(res, 404, {
          error: 'Product not found',
          identifier: id || slug || raw,
        });
      }

      try {
        // Cascade onDelete in schema handles CartItem & WishlistItem relationships cleanly
        const deletedProduct = await withTimeout(
          prisma.product.delete({
            where: { id: existingProduct.id },
          }),
          8000,
          'Delete product'
        );

        // Invalidate product catalog and specific item keys gracefully
        try {
          await invalidateProducts();
          await invalidateProductKeys(existingProduct.id, existingProduct.slug);
        } catch (cacheErr) {
          console.warn('[Cache] Invalidation warning after product deletion:', cacheErr);
        }

        return respond(res, 200, {
          message: 'Product deleted successfully',
          deletedProductId: deletedProduct.id,
          product: formatProductResponse(deletedProduct),
        });
      } catch (error) {
        logServerError({
          endpoint: '/api/products',
          method: 'DELETE',
          operation: 'delete_product',
          error,
        });
        return respond(res, 500, { error: 'Failed to delete product from database' });
      }
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    logServerError({
      endpoint: '/api/products',
      method,
      operation: 'product_handler',
      error,
    });
    return respond(res, 500, { error: getSafeErrorMessage(error, 'Internal Server Error') });
  }
}
