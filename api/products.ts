import prisma from '../src/lib/prisma';
import { requireAdmin, getRequestBody, respond } from './_utils/auth';
import { Prisma } from '@prisma/client';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates slug format: lowercase letters, numbers, and hyphens only.
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
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
 */
export function validateProductCreatePayload(body: any): { errors: ValidationError[]; data?: any } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  // Name
  if (!body.name || typeof body.name !== 'string' || body.name.trim().length === 0) {
    errors.push({ field: 'name', message: 'Product name is required and must be a non-empty string' });
  }

  // Slug
  if (!body.slug || typeof body.slug !== 'string' || body.slug.trim().length === 0) {
    errors.push({ field: 'slug', message: 'Product slug is required and must be a non-empty string' });
  } else if (!isValidSlug(body.slug.trim())) {
    errors.push({
      field: 'slug',
      message: 'Slug must contain only lowercase letters, numbers, and hyphens (e.g. "nitya-gold-bracelet")',
    });
  }

  // Category
  if (!body.category || typeof body.category !== 'string' || body.category.trim().length === 0) {
    errors.push({ field: 'category', message: 'Product category is required' });
  }

  // Price
  if (
    body.price === undefined ||
    body.price === null ||
    typeof body.price !== 'number' ||
    isNaN(body.price) ||
    body.price < 0
  ) {
    errors.push({ field: 'price', message: 'Product price is required and must be a non-negative number' });
  }

  // Original Price
  if (
    body.originalPrice === undefined ||
    body.originalPrice === null ||
    typeof body.originalPrice !== 'number' ||
    isNaN(body.originalPrice) ||
    body.originalPrice < 0
  ) {
    errors.push({
      field: 'originalPrice',
      message: 'Original price is required and must be a non-negative number',
    });
  }

  // Image
  if (!body.image || typeof body.image !== 'string' || body.image.trim().length === 0) {
    errors.push({ field: 'image', message: 'Main product image URL is required' });
  }

  // Hover Image
  if (!body.hoverImage || typeof body.hoverImage !== 'string' || body.hoverImage.trim().length === 0) {
    errors.push({ field: 'hoverImage', message: 'Hover image URL is required' });
  }

  // Description
  if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Product description is required' });
  }

  // Finish, BaseMaterial, Warranty (support both flat and nested under details)
  const finish = body.finish !== undefined ? body.finish : body.details?.finish;
  if (!finish || typeof finish !== 'string' || finish.trim().length === 0) {
    errors.push({ field: 'finish', message: 'Product finish specification is required' });
  }

  const baseMaterial = body.baseMaterial !== undefined ? body.baseMaterial : body.details?.baseMaterial;
  if (!baseMaterial || typeof baseMaterial !== 'string' || baseMaterial.trim().length === 0) {
    errors.push({ field: 'baseMaterial', message: 'Product base material is required' });
  }

  const warranty = body.warranty !== undefined ? body.warranty : body.details?.warranty;
  if (!warranty || typeof warranty !== 'string' || warranty.trim().length === 0) {
    errors.push({ field: 'warranty', message: 'Product warranty is required' });
  }

  const stoneType = body.stoneType !== undefined ? body.stoneType : body.details?.stoneType;
  if (stoneType !== undefined && stoneType !== null && typeof stoneType !== 'string') {
    errors.push({ field: 'stoneType', message: 'Stone type must be a string or null' });
  }

  const collectionId = body.collectionId;
  if (collectionId !== undefined && collectionId !== null && typeof collectionId !== 'string') {
    errors.push({ field: 'collectionId', message: 'Collection ID must be a string or null' });
  }

  if (
    body.rating !== undefined &&
    (typeof body.rating !== 'number' || isNaN(body.rating) || body.rating < 0 || body.rating > 5)
  ) {
    errors.push({ field: 'rating', message: 'Rating must be a number between 0 and 5' });
  }

  if (
    body.reviewCount !== undefined &&
    (typeof body.reviewCount !== 'number' ||
      isNaN(body.reviewCount) ||
      body.reviewCount < 0 ||
      !Number.isInteger(body.reviewCount))
  ) {
    errors.push({ field: 'reviewCount', message: 'Review count must be a non-negative integer' });
  }

  if (
    body.discountPercent !== undefined &&
    (typeof body.discountPercent !== 'number' ||
      isNaN(body.discountPercent) ||
      body.discountPercent < 0 ||
      body.discountPercent > 100)
  ) {
    errors.push({ field: 'discountPercent', message: 'Discount percent must be a number between 0 and 100' });
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

  const sanitizedData = {
    ...(body.id ? { id: String(body.id).trim() } : {}),
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
 */
export function validateProductUpdatePayload(body: any): { errors: ValidationError[]; data?: any } {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  const updateData: any = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || body.name.trim().length === 0) {
      errors.push({ field: 'name', message: 'Name must be a non-empty string' });
    } else {
      updateData.name = body.name.trim();
    }
  }

  if (body.slug !== undefined) {
    if (typeof body.slug !== 'string' || body.slug.trim().length === 0) {
      errors.push({ field: 'slug', message: 'Slug must be a non-empty string' });
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
    if (typeof body.category !== 'string' || body.category.trim().length === 0) {
      errors.push({ field: 'category', message: 'Category must be a non-empty string' });
    } else {
      updateData.category = body.category.trim();
    }
  }

  if (body.collectionId !== undefined) {
    if (body.collectionId !== null && typeof body.collectionId !== 'string') {
      errors.push({ field: 'collectionId', message: 'Collection ID must be a string or null' });
    } else {
      updateData.collectionId = body.collectionId ? String(body.collectionId).trim() : null;
    }
  }

  if (body.price !== undefined) {
    if (typeof body.price !== 'number' || isNaN(body.price) || body.price < 0) {
      errors.push({ field: 'price', message: 'Price must be a non-negative number' });
    } else {
      updateData.price = Number(body.price);
    }
  }

  if (body.originalPrice !== undefined) {
    if (typeof body.originalPrice !== 'number' || isNaN(body.originalPrice) || body.originalPrice < 0) {
      errors.push({ field: 'originalPrice', message: 'Original price must be a non-negative number' });
    } else {
      updateData.originalPrice = Number(body.originalPrice);
    }
  }

  if (body.discountPercent !== undefined) {
    if (
      typeof body.discountPercent !== 'number' ||
      isNaN(body.discountPercent) ||
      body.discountPercent < 0 ||
      body.discountPercent > 100
    ) {
      errors.push({ field: 'discountPercent', message: 'Discount percent must be a number between 0 and 100' });
    } else {
      updateData.discountPercent = Math.round(body.discountPercent);
    }
  }

  if (body.rating !== undefined) {
    if (typeof body.rating !== 'number' || isNaN(body.rating) || body.rating < 0 || body.rating > 5) {
      errors.push({ field: 'rating', message: 'Rating must be a number between 0 and 5' });
    } else {
      updateData.rating = Number(body.rating);
    }
  }

  if (body.reviewCount !== undefined) {
    if (
      typeof body.reviewCount !== 'number' ||
      isNaN(body.reviewCount) ||
      body.reviewCount < 0 ||
      !Number.isInteger(body.reviewCount)
    ) {
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
    if (typeof body.image !== 'string' || body.image.trim().length === 0) {
      errors.push({ field: 'image', message: 'Image must be a non-empty URL string' });
    } else {
      updateData.image = body.image.trim();
    }
  }

  if (body.hoverImage !== undefined) {
    if (typeof body.hoverImage !== 'string' || body.hoverImage.trim().length === 0) {
      errors.push({ field: 'hoverImage', message: 'Hover image must be a non-empty URL string' });
    } else {
      updateData.hoverImage = body.hoverImage.trim();
    }
  }

  if (body.description !== undefined) {
    if (typeof body.description !== 'string' || body.description.trim().length === 0) {
      errors.push({ field: 'description', message: 'Description must be a non-empty string' });
    } else {
      updateData.description = body.description.trim();
    }
  }

  const finish = body.finish !== undefined ? body.finish : body.details?.finish;
  if (finish !== undefined) {
    if (typeof finish !== 'string' || finish.trim().length === 0) {
      errors.push({ field: 'finish', message: 'Finish must be a non-empty string' });
    } else {
      updateData.finish = finish.trim();
    }
  }

  const baseMaterial = body.baseMaterial !== undefined ? body.baseMaterial : body.details?.baseMaterial;
  if (baseMaterial !== undefined) {
    if (typeof baseMaterial !== 'string' || baseMaterial.trim().length === 0) {
      errors.push({ field: 'baseMaterial', message: 'Base material must be a non-empty string' });
    } else {
      updateData.baseMaterial = baseMaterial.trim();
    }
  }

  const warranty = body.warranty !== undefined ? body.warranty : body.details?.warranty;
  if (warranty !== undefined) {
    if (typeof warranty !== 'string' || warranty.trim().length === 0) {
      errors.push({ field: 'warranty', message: 'Warranty must be a non-empty string' });
    } else {
      updateData.warranty = warranty.trim();
    }
  }

  const stoneType = body.stoneType !== undefined ? body.stoneType : body.details?.stoneType;
  if (stoneType !== undefined) {
    if (stoneType !== null && typeof stoneType !== 'string') {
      errors.push({ field: 'stoneType', message: 'Stone type must be a string or null' });
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

  if (queryParams.id) return { id: String(queryParams.id).trim(), raw: String(queryParams.id).trim() };
  if (queryParams.slug) return { slug: String(queryParams.slug).trim(), raw: String(queryParams.slug).trim() };

  // Check sub-path segments, e.g. /api/products/prod-br-1
  if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      const segments = parsed.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const productsIdx = segments.indexOf('products');
      if (productsIdx !== -1 && segments.length > productsIdx + 1) {
        const seg = decodeURIComponent(segments[productsIdx + 1]).trim();
        if (seg && seg !== 'index') {
          return { raw: seg, id: seg, slug: seg };
        }
      }
    } catch {}
  }

  if (body && typeof body === 'object') {
    if (body.id && typeof body.id === 'string' && body.id.trim()) {
      return { id: body.id.trim(), raw: body.id.trim() };
    }
    if (body.slug && typeof body.slug === 'string' && body.slug.trim() && !body.name) {
      return { slug: body.slug.trim(), raw: body.slug.trim() };
    }
  }

  return {};
}

/**
 * Server-side Product API Handler
 *
 * Supported methods:
 * - GET /api/products : List all products
 * - GET /api/products?id=<id> OR ?slug=<slug> OR /api/products/<id|slug> : Get single product
 * - POST /api/products : Create product (Protected session required; admin roles in next phase)
 * - PATCH / PUT /api/products : Update product (Protected session required; admin roles in next phase)
 * - DELETE /api/products : Delete product (Protected session required; admin roles in next phase)
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);

    // ==========================================
    // GET: Retrieve All Products or Single Product
    // ==========================================
    if (method === 'GET') {
      const { id, slug, raw } = extractIdentifier(req, body);

      // Single Product Lookup
      if (id || slug || raw) {
        let product = null;

        if (id && !slug) {
          product = await prisma.product.findUnique({ where: { id } });
        } else if (slug && !id) {
          product = await prisma.product.findUnique({ where: { slug } });
        } else if (raw) {
          product = await prisma.product.findFirst({
            where: {
              OR: [{ id: raw }, { slug: raw }],
            },
          });
        }

        if (!product) {
          return respond(res, 404, {
            error: 'Product not found',
            identifier: id || slug || raw,
          });
        }

        return respond(res, 200, {
          product: formatProductResponse(product),
        });
      }

      // Query parameter category / collection filtering if provided
      let categoryFilter: string | undefined = undefined;
      let collectionFilter: string | undefined = undefined;

      if (req.query) {
        if (req.query.category) categoryFilter = String(req.query.category).trim();
        if (req.query.collectionId) collectionFilter = String(req.query.collectionId).trim();
      } else if (req.url) {
        try {
          const url = new URL(req.url, 'http://localhost');
          if (url.searchParams.get('category')) categoryFilter = url.searchParams.get('category')!.trim();
          if (url.searchParams.get('collectionId')) collectionFilter = url.searchParams.get('collectionId')!.trim();
        } catch {}
      }

      const whereClause: any = {};
      if (categoryFilter) whereClause.category = categoryFilter;
      if (collectionFilter) whereClause.collectionId = collectionFilter;

      // List all products from database
      const products = await prisma.product.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
      });

      return respond(res, 200, {
        products: products.map(formatProductResponse),
        count: products.length,
      });
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
        const createdProduct = await prisma.product.create({
          data,
        });

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
        console.error('Prisma error during product creation:', error);
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
      const existingProduct = await prisma.product.findFirst({
        where: {
          OR: [{ id: id || raw || '' }, { slug: slug || raw || '' }],
        },
      });

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
        const updatedProduct = await prisma.product.update({
          where: { id: existingProduct.id },
          data: updateData,
        });

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
        console.error('Prisma error during product update:', error);
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
      const existingProduct = await prisma.product.findFirst({
        where: {
          OR: [{ id: id || raw || '' }, { slug: slug || raw || '' }],
        },
      });

      if (!existingProduct) {
        return respond(res, 404, {
          error: 'Product not found',
          identifier: id || slug || raw,
        });
      }

      try {
        // Cascade onDelete in schema handles CartItem & WishlistItem relationships cleanly
        const deletedProduct = await prisma.product.delete({
          where: { id: existingProduct.id },
        });

        return respond(res, 200, {
          message: 'Product deleted successfully',
          deletedProductId: deletedProduct.id,
          product: formatProductResponse(deletedProduct),
        });
      } catch (error) {
        console.error('Prisma error during product deletion:', error);
        return respond(res, 500, { error: 'Failed to delete product from database' });
      }
    }

    return respond(res, 405, { error: `Method ${method} Not Allowed` });
  } catch (error) {
    console.error('Product API unhandled error:', error);
    return respond(res, 500, { error: 'Internal Server Error' });
  }
}
