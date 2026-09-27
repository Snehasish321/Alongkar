import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary using server-side environment variables
// Note: Never prefix these secrets with VITE_ or expose them to browser code.
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const apiKey = process.env.CLOUDINARY_API_KEY || '';
const apiSecret = process.env.CLOUDINARY_API_SECRET || '';

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true,
});

/**
 * Checks if Cloudinary credentials are fully configured.
 */
export function isCloudinaryConfigured(): boolean {
  return Boolean(
    cloudName &&
    apiKey &&
    apiSecret &&
    cloudName !== 'your_cloudinary_cloud_name' &&
    apiKey !== 'your_cloudinary_api_key' &&
    apiSecret !== 'your_cloudinary_api_secret'
  );
}

export { cloudinary };
