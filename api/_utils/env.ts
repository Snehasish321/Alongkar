import 'dotenv/config';

export type EnvCategory =
  | 'required_production'
  | 'conditional_production'
  | 'optional_production'
  | 'client_exposed';

export type VariableScope = 'server_only' | 'client_exposed' | 'build_time';

export interface EnvVarSpec {
  name: string;
  category: EnvCategory;
  scope: VariableScope;
  description: string;
  isSecret: boolean;
  placeholderPrefixes?: string[];
}

export const ENV_CATALOG: readonly EnvVarSpec[] = [
  {
    name: 'DATABASE_URL',
    category: 'required_production',
    scope: 'server_only',
    description: 'PostgreSQL connection string (Neon pooled connection) for Prisma queries',
    isSecret: true,
    placeholderPrefixes: ['postgresql://user:password@host', 'postgres://user:password@host'],
  },
  {
    name: 'DIRECT_URL',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Direct PostgreSQL connection string for migrations and schema introspection',
    isSecret: true,
    placeholderPrefixes: ['postgresql://user:password@host', 'postgres://user:password@host'],
  },
  {
    name: 'CLERK_SECRET_KEY',
    category: 'required_production',
    scope: 'server_only',
    description: 'Clerk backend API secret key for session verification and user management',
    isSecret: true,
    placeholderPrefixes: ['sk_test_your_clerk_secret_key_here'],
  },
  {
    name: 'CLERK_PUBLISHABLE_KEY',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Clerk publishable key fallback for server-side auth verification',
    isSecret: false,
    placeholderPrefixes: ['pk_test_your_clerk_publishable_key_here'],
  },
  {
    name: 'VITE_CLERK_PUBLISHABLE_KEY',
    category: 'client_exposed',
    scope: 'client_exposed',
    description: 'Clerk publishable key exposed to Vite React frontend and server fallback',
    isSecret: false,
    placeholderPrefixes: ['pk_test_your_clerk_publishable_key_here'],
  },
  {
    name: 'CLOUDINARY_CLOUD_NAME',
    category: 'conditional_production',
    scope: 'server_only',
    description: 'Cloudinary cloud name for product & jewellery image uploads',
    isSecret: false,
    placeholderPrefixes: ['your_cloudinary_cloud_name'],
  },
  {
    name: 'CLOUDINARY_API_KEY',
    category: 'conditional_production',
    scope: 'server_only',
    description: 'Cloudinary API key for server-side image uploads',
    isSecret: false,
    placeholderPrefixes: ['your_cloudinary_api_key'],
  },
  {
    name: 'CLOUDINARY_API_SECRET',
    category: 'conditional_production',
    scope: 'server_only',
    description: 'Cloudinary API secret for server-side image upload signing',
    isSecret: true,
    placeholderPrefixes: ['your_cloudinary_api_secret'],
  },
  {
    name: 'UPSTASH_REDIS_REST_URL',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Upstash Redis REST endpoint for distributed catalog caching and rate limiting',
    isSecret: false,
  },
  {
    name: 'UPSTASH_REDIS_REST_TOKEN',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Upstash Redis REST bearer token for authentication',
    isSecret: true,
  },
  {
    name: 'REDIS_URL',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Standard Redis connection string (IORedis fallback)',
    isSecret: true,
  },
  {
    name: 'NODE_ENV',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Runtime environment mode (development, production, test)',
    isSecret: false,
  },
  {
    name: 'LOG_LEVEL',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Application log level (DEBUG, INFO, WARN, ERROR)',
    isSecret: false,
  },
  {
    name: 'SLOW_REQUEST_THRESHOLD_MS',
    category: 'optional_production',
    scope: 'server_only',
    description: 'Threshold in ms above which API requests emit performance warnings',
    isSecret: false,
  },
] as const;

export interface EnvValidationResult {
  isValid: boolean;
  missingRequired: string[];
  placeholderValues: string[];
  warnings: string[];
  services: {
    database: 'configured' | 'missing';
    clerk: 'configured' | 'missing';
    cloudinary: 'configured' | 'not_configured';
    redis: 'configured' | 'not_configured';
  };
}

/**
 * Validates environment configuration without leaking secrets.
 */
export function validateEnvironment(env: Record<string, string | undefined> = process.env): EnvValidationResult {
  const missingRequired: string[] = [];
  const placeholderValues: string[] = [];
  const warnings: string[] = [];

  // 1. Validate Database
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl || databaseUrl.trim().length === 0) {
    missingRequired.push('DATABASE_URL');
  } else if (databaseUrl.includes('user:password@host')) {
    placeholderValues.push('DATABASE_URL');
  }

  // 2. Validate Clerk
  const clerkSecret = env.CLERK_SECRET_KEY;
  const clerkPub = env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY;

  if (!clerkSecret || clerkSecret.trim().length === 0) {
    missingRequired.push('CLERK_SECRET_KEY');
  } else if (clerkSecret.includes('your_clerk_secret_key_here')) {
    placeholderValues.push('CLERK_SECRET_KEY');
  }

  if (!clerkPub || clerkPub.trim().length === 0) {
    missingRequired.push('VITE_CLERK_PUBLISHABLE_KEY (or CLERK_PUBLISHABLE_KEY)');
  } else if (clerkPub.includes('your_clerk_publishable_key_here')) {
    placeholderValues.push('VITE_CLERK_PUBLISHABLE_KEY');
  }

  // 3. Check Cloudinary (conditional service)
  const cName = env.CLOUDINARY_CLOUD_NAME;
  const cKey = env.CLOUDINARY_API_KEY;
  const cSecret = env.CLOUDINARY_API_SECRET;

  const isCloudinaryPartiallySet = Boolean(cName || cKey || cSecret);
  const isCloudinaryFullyConfigured = Boolean(
    cName &&
    cKey &&
    cSecret &&
    cName !== 'your_cloudinary_cloud_name' &&
    cKey !== 'your_cloudinary_api_key' &&
    cSecret !== 'your_cloudinary_api_secret'
  );

  if (isCloudinaryPartiallySet && !isCloudinaryFullyConfigured) {
    warnings.push('Cloudinary credentials are partially defined. Image uploads will be disabled until all 3 keys are configured.');
  }

  // 4. Check Redis (optional service)
  const upstashUrl = env.UPSTASH_REDIS_REST_URL;
  const upstashToken = env.UPSTASH_REDIS_REST_TOKEN;
  const redisUrl = env.REDIS_URL;

  const isRedisConfigured = Boolean((upstashUrl && upstashToken) || redisUrl);

  const isValid = missingRequired.length === 0 && placeholderValues.length === 0;

  return {
    isValid,
    missingRequired,
    placeholderValues,
    warnings,
    services: {
      database: databaseUrl && !placeholderValues.includes('DATABASE_URL') ? 'configured' : 'missing',
      clerk: clerkSecret && clerkPub ? 'configured' : 'missing',
      cloudinary: isCloudinaryFullyConfigured ? 'configured' : 'not_configured',
      redis: isRedisConfigured ? 'configured' : 'not_configured',
    },
  };
}
