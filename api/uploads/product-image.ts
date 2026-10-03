import { requireAdmin, respond } from '../_utils/auth.js';
import { parseMultipartForm } from '../_utils/multipart.js';
import { cloudinary, isCloudinaryConfigured } from '../_utils/cloudinary.js';
import { getSafeErrorMessage, logServerError } from '../_utils/security.js';
import type { UploadApiResponse } from 'cloudinary';

/**
 * Uploads an image buffer to Cloudinary with automatic optimization.
 */
async function uploadToCloudinary(
  fileBuffer: Buffer,
  filename: string
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    // Generate clean unique filename identifier without extensions
    const cleanName = filename
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'alongkar/products',
        resource_type: 'image',
        public_id: `${cleanName}_${Date.now()}`,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Cloudinary upload returned empty response'));
        }
        resolve(result);
      }
    );

    uploadStream.end(fileBuffer);
  });
}

/**
 * Server-side Product Image Upload Handler
 *
 * Supported methods:
 * - POST /api/uploads/product-image : Protected admin-only image upload to Cloudinary
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  if (method !== 'POST') {
    return respond(res, 405, { error: `Method ${method} Not Allowed. Use POST.` });
  }

  try {
    // 1. Verify Admin Authorization via Clerk session
    const authCheck = await requireAdmin(req);
    if (!authCheck.authorized) {
      return respond(res, authCheck.status, {
        error: authCheck.error || 'Authentication / Authorization required',
      });
    }

    // 2. Parse Multipart Form & Validate Image (Type, Magic Bytes, Size)
    const { file, error: parseError } = await parseMultipartForm(req);

    if (parseError || !file) {
      return respond(res, 400, {
        error: parseError || 'Image file is missing or invalid.',
      });
    }

    // 3. Verify Cloudinary Configuration
    if (!isCloudinaryConfigured()) {
      return respond(res, 503, {
        error:
          'Cloudinary image service is not configured on the server. Please set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.',
      });
    }

    // 4. Upload Image to Cloudinary in alongkar/products
    const uploadResult = await uploadToCloudinary(file.buffer, file.filename);

    // 5. Return secure delivery URL and metadata (never secrets!)
    return respond(res, 200, {
      success: true,
      url: uploadResult.secure_url,
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes,
    });
  } catch (error: any) {
    logServerError(error, {
      endpoint: '/api/uploads/product-image',
      method,
    });
    return respond(res, 500, {
      error: getSafeErrorMessage(error, 'Failed to upload image to Cloudinary. Please try again.'),
    });
  }
}
