import { getAuthenticatedUser, respond } from '../_utils/auth.js';
import { parseMultipartForm } from '../_utils/multipart.js';
import { cloudinary, isCloudinaryConfigured } from '../_utils/cloudinary.js';
import type { UploadApiResponse } from 'cloudinary';

const MAX_INSPIRATION_SIZE_BYTES = 5 * 1024 * 1024; // 5MB limit for customer inspiration images

/**
 * Uploads an inspiration image buffer to Cloudinary in alongkar/jewellery-requests folder.
 */
async function uploadInspirationToCloudinary(
  fileBuffer: Buffer
): Promise<UploadApiResponse> {
  return new Promise((resolve, reject) => {
    // Generate clean, non-sensitive unique public_id
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const publicId = `insp_${Date.now()}_${randomSuffix}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'alongkar/jewellery-requests',
        resource_type: 'image',
        public_id: publicId,
        transformation: [{ quality: 'auto', fetch_format: 'auto' }],
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }
        if (!result) {
          return reject(new Error('Cloudinary upload returned an empty response.'));
        }
        resolve(result);
      }
    );

    uploadStream.end(fileBuffer);
  });
}

/**
 * Server-side Jewellery Inspiration Image Upload Handler
 *
 * Supported methods:
 * - POST /api/upload/jewellery-inspiration : Authenticated customer upload of jewellery inspiration image
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  if (method !== 'POST') {
    return respond(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed. Use POST.`,
    });
  }

  try {
    // 1. Verify Authenticated Customer via Clerk session
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return respond(res, 401, {
        success: false,
        error: 'Unauthorized: Valid Clerk session required to upload inspiration images.',
      });
    }

    // 2. Parse Multipart Form & Validate Image
    const { file, error: parseError } = await parseMultipartForm(req);

    if (parseError || !file) {
      return respond(res, 400, {
        success: false,
        error: parseError || 'Image file is missing or invalid.',
      });
    }

    // 3. Enforce 5MB limit for inspiration photos
    if (file.size > MAX_INSPIRATION_SIZE_BYTES) {
      return respond(res, 400, {
        success: false,
        error: `File size exceeds the 5MB limit for inspiration images. Uploaded size: ${(
          file.size /
          (1024 * 1024)
        ).toFixed(2)}MB.`,
      });
    }

    // 4. Verify Cloudinary Configuration
    if (!isCloudinaryConfigured()) {
      return respond(res, 503, {
        success: false,
        error:
          'Cloudinary image service is not configured on the server. Please ensure CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET are set.',
      });
    }

    // 5. Upload Image to Cloudinary folder: alongkar/jewellery-requests
    const uploadResult = await uploadInspirationToCloudinary(file.buffer);

    // 6. Return secure delivery URL and metadata (never secrets!)
    return respond(res, 200, {
      success: true,
      url: uploadResult.secure_url,
      secure_url: uploadResult.secure_url,
      public_id: uploadResult.public_id,
      format: uploadResult.format,
      bytes: uploadResult.bytes,
    });
  } catch (error: any) {
    console.error('Inspiration image upload error:', error?.message || error);
    return respond(res, 500, {
      success: false,
      error: 'Failed to upload inspiration image to Cloudinary. Please try again.',
      details: error?.message,
    });
  }
}
