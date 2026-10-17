import 'dotenv/config';
import { v2 as cloudinary } from 'cloudinary';

// ─── Account A: Storefront Products & Media ──────────────────────────────────
// Note: Never prefix these secrets with VITE_ or expose them to browser code.
const productCloudName = process.env.CLOUDINARY_CLOUD_NAME || '';
const productApiKey = process.env.CLOUDINARY_API_KEY || '';
const productApiSecret = process.env.CLOUDINARY_API_SECRET || '';

// Initialize shared Cloudinary singleton strictly for Account A
cloudinary.config({
  cloud_name: productCloudName,
  api_key: productApiKey,
  api_secret: productApiSecret,
  secure: true,
});

export interface CloudinaryAccountConfig {
  cloud_name: string;
  api_key: string;
  api_secret: string;
  secure: boolean;
}

/**
 * Checks if Account A (Storefront Products) Cloudinary credentials are fully configured.
 */
export function isCloudinaryProductsConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  const cName = env.CLOUDINARY_CLOUD_NAME || '';
  const cKey = env.CLOUDINARY_API_KEY || '';
  const cSecret = env.CLOUDINARY_API_SECRET || '';

  return Boolean(
    cName &&
    cKey &&
    cSecret &&
    cName !== 'your_cloudinary_cloud_name' &&
    cKey !== 'your_cloudinary_api_key' &&
    cSecret !== 'your_cloudinary_api_secret'
  );
}

/**
 * Checks if Account A credentials are fully configured.
 * Backward-compatible function name used across existing codebase.
 */
export function isCloudinaryConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  return isCloudinaryProductsConfigured(env);
}

/**
 * Retrieves Account A credentials for server-side callers.
 */
export function getCloudinaryProductsConfig(
  env: Record<string, string | undefined> = process.env
): CloudinaryAccountConfig | null {
  if (!isCloudinaryProductsConfigured(env)) {
    return null;
  }
  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME!,
    api_key: env.CLOUDINARY_API_KEY!,
    api_secret: env.CLOUDINARY_API_SECRET!,
    secure: true,
  };
}

/**
 * Builds isolated upload options for Account A (Storefront Products).
 * Passing these per-call options to `upload_stream` guarantees explicit Account A targeting.
 */
export function getCloudinaryProductsUploadOptions(
  extraOptions: Record<string, any> = {},
  env: Record<string, string | undefined> = process.env
): Record<string, any> {
  const config = getCloudinaryProductsConfig(env);
  if (!config) {
    throw new Error('Cloudinary Account A (Products) is not configured.');
  }
  return {
    ...extraOptions,
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
    secure: true,
  };
}


// ─── Account B: Customer Request Jewellery Media ─────────────────────────────

/**
 * Checks if Account B (Request Jewellery Inspiration) Cloudinary credentials are fully configured.
 */
export function isCloudinaryRequestsConfigured(
  env: Record<string, string | undefined> = process.env
): boolean {
  const cName = env.CLOUDINARY_REQUESTS_CLOUD_NAME || '';
  const cKey = env.CLOUDINARY_REQUESTS_API_KEY || '';
  const cSecret = env.CLOUDINARY_REQUESTS_API_SECRET || '';

  return Boolean(
    cName &&
    cKey &&
    cSecret &&
    cName !== 'your_cloudinary_requests_cloud_name' &&
    cKey !== 'your_cloudinary_requests_api_key' &&
    cSecret !== 'your_cloudinary_requests_api_secret'
  );
}

/**
 * Retrieves Account B credentials for server-side callers.
 */
export function getCloudinaryRequestsConfig(
  env: Record<string, string | undefined> = process.env
): CloudinaryAccountConfig | null {
  if (!isCloudinaryRequestsConfigured(env)) {
    return null;
  }
  return {
    cloud_name: env.CLOUDINARY_REQUESTS_CLOUD_NAME!,
    api_key: env.CLOUDINARY_REQUESTS_API_KEY!,
    api_secret: env.CLOUDINARY_REQUESTS_API_SECRET!,
    secure: true,
  };
}

/**
 * Builds isolated upload options for Account B.
 * Passing these per-call options to `upload_stream` safely overrides the default configuration
 * without mutating the shared SDK singleton (which remains bound to Account A).
 */
export function getCloudinaryRequestsUploadOptions(
  extraOptions: Record<string, any> = {},
  env: Record<string, string | undefined> = process.env
): Record<string, any> {
  const config = getCloudinaryRequestsConfig(env);
  if (!config) {
    throw new Error('Cloudinary Account B (Request Jewellery) is not configured.');
  }
  return {
    ...extraOptions,
    cloud_name: config.cloud_name,
    api_key: config.api_key,
    api_secret: config.api_secret,
    secure: true,
  };
}

export { cloudinary };
