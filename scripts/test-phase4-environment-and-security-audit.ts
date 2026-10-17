import fs from 'fs';
import path from 'path';
import {
  isCloudinaryProductsConfigured,
  isCloudinaryRequestsConfigured,
  getCloudinaryProductsConfig,
  getCloudinaryRequestsConfig,
  getCloudinaryProductsUploadOptions,
  getCloudinaryRequestsUploadOptions,
  cloudinary,
} from '../api/_utils/cloudinary.js';
import { validateEnvironment, ENV_CATALOG } from '../api/_utils/env.js';
import { maskSensitiveString } from '../api/_utils/logger.js';
import { getSafeErrorMessage } from '../api/_utils/security.js';
import {
  handleJewelleryInspirationUpload,
  handleProductImageUpload,
} from '../api/uploads.js';
import healthHandler from '../api/health.js';

process.env.NODE_ENV = 'test';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {} as Record<string, string>,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    json(payload: any) {
      this.data = payload;
      return this;
    },
    end(str: string) {
      if (str) {
        try {
          this.data = JSON.parse(str);
        } catch {
          this.data = str;
        }
      }
      return this;
    },
  };
  return res;
}

async function runPhase4AuditTests() {
  console.log('================================================================');
  console.log('PHASE 4: ENVIRONMENT CONFIGURATION AND SECURITY AUDIT SUITE');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  const baseValidEnv: Record<string, string> = {
    DATABASE_URL: 'postgresql://postgres:valid_password@localhost:5432/alongkar?sslmode=require',
    CLERK_SECRET_KEY: 'sk_test_valid_clerk_secret_key_12345',
    CLERK_PUBLISHABLE_KEY: 'pk_test_valid_clerk_publishable_key_12345',
  };

  const mockRealSecret = 'very_sensitive_production_secret_999xyz';

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 1: Independent Configuration Behavior (Task 2)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Independent Configuration Behavior ---');

  // 1. Account A configured, Account B missing -> Product upload enabled, Inspiration upload disabled
  const envAOnly: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: 'account-a-prod',
    CLOUDINARY_API_KEY: 'key-a-prod',
    CLOUDINARY_API_SECRET: 'secret-a-prod',
  };
  assert(
    isCloudinaryProductsConfigured(envAOnly) === true,
    'Account A reports configured when Account A credentials are set'
  );
  assert(
    isCloudinaryRequestsConfigured(envAOnly) === false,
    'Account B reports unconfigured when Account B credentials are omitted'
  );
  const valResAOnly = validateEnvironment(envAOnly);
  assert(
    valResAOnly.services.cloudinaryProducts === 'configured',
    'validateEnvironment marks Account A as configured'
  );
  assert(
    valResAOnly.services.cloudinaryRequests === 'not_configured',
    'validateEnvironment marks Account B as not_configured'
  );

  // 2. Account B configured, Account A missing -> Inspiration upload enabled, Product upload disabled
  const envBOnly: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'account-b-req',
    CLOUDINARY_REQUESTS_API_KEY: 'key-b-req',
    CLOUDINARY_REQUESTS_API_SECRET: 'secret-b-req',
  };
  assert(
    isCloudinaryProductsConfigured(envBOnly) === false,
    'Account A reports unconfigured when Account A credentials are unset'
  );
  assert(
    isCloudinaryRequestsConfigured(envBOnly) === true,
    'Account B reports configured when Account B credentials are set'
  );
  const valResBOnly = validateEnvironment(envBOnly);
  assert(
    valResBOnly.services.cloudinaryProducts === 'not_configured',
    'validateEnvironment marks Account A as not_configured'
  );
  assert(
    valResBOnly.services.cloudinaryRequests === 'configured',
    'validateEnvironment marks Account B as configured'
  );

  // 3. Partial Account B configuration is detected and emits diagnostic warning
  const envPartialB: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'account-b-req',
    CLOUDINARY_REQUESTS_API_KEY: 'key-b-req',
    // Missing SECRET
  };
  const valPartialB = validateEnvironment(envPartialB);
  assert(
    isCloudinaryRequestsConfigured(envPartialB) === false,
    'Partial Account B configuration is treated as unconfigured'
  );
  assert(
    valPartialB.warnings.some((w) => w.includes('Cloudinary Account B') && w.includes('partially defined')),
    'Partial Account B configuration emits actionable diagnostic warning'
  );

  // 4. Partial Account A configuration is detected and emits diagnostic warning
  const envPartialA: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: 'account-a-prod',
    // Missing KEY and SECRET
  };
  const valPartialA = validateEnvironment(envPartialA);
  assert(
    isCloudinaryProductsConfigured(envPartialA) === false,
    'Partial Account A configuration is treated as unconfigured'
  );
  assert(
    valPartialA.warnings.some((w) => w.includes('Cloudinary Account A') && w.includes('partially defined')),
    'Partial Account A configuration emits actionable diagnostic warning'
  );

  // 5. Placeholder template values are rejected
  const envPlaceholders: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: 'your_cloudinary_cloud_name',
    CLOUDINARY_API_KEY: 'your_cloudinary_api_key',
    CLOUDINARY_API_SECRET: 'your_cloudinary_api_secret',
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'your_cloudinary_requests_cloud_name',
    CLOUDINARY_REQUESTS_API_KEY: 'your_cloudinary_requests_api_key',
    CLOUDINARY_REQUESTS_API_SECRET: 'your_cloudinary_requests_api_secret',
  };
  assert(
    isCloudinaryProductsConfigured(envPlaceholders) === false,
    'Account A template placeholder values are treated as unconfigured'
  );
  assert(
    isCloudinaryRequestsConfigured(envPlaceholders) === false,
    'Account B template placeholder values are treated as unconfigured'
  );

  // 6. Missing optional Account B credentials do not block application startup
  const envNoAccountB: Record<string, string> = {
    ...baseValidEnv,
  };
  const valResNoB = validateEnvironment(envNoAccountB);
  assert(
    valResNoB.isValid === true,
    'validateEnvironment.isValid remains true when Account B credentials are not set (conditional startup)'
  );
  assert(
    valResNoB.missingRequired.length === 0,
    'Account B variables are NOT in missingRequired'
  );

  // 7. Cloudinary singleton is never mutated by Account B operations
  const singletonBefore = cloudinary.config();
  const accountBOptions = getCloudinaryRequestsUploadOptions(
    { folder: 'alongkar/jewellery-requests' },
    {
      CLOUDINARY_REQUESTS_CLOUD_NAME: 'account-b-no-mutate',
      CLOUDINARY_REQUESTS_API_KEY: 'key-b-no-mutate',
      CLOUDINARY_REQUESTS_API_SECRET: 'sec-b-no-mutate',
    }
  );
  const singletonAfter = cloudinary.config();
  assert(
    singletonAfter.cloud_name === singletonBefore.cloud_name &&
      singletonAfter.api_key === singletonBefore.api_key &&
      singletonAfter.api_secret === singletonBefore.api_secret,
    'Shared Cloudinary singleton is not mutated by Account B options generation'
  );
  assert(
    accountBOptions.cloud_name === 'account-b-no-mutate',
    'Account B options explicitly contain targeted cloud_name'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 2: Secret Exposure Audit (Task 3)
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Secret Exposure Audit ---');

  // 1. Verify no VITE_CLOUDINARY client-exposed variables exist in process.env
  const viteCloudinaryKeys = Object.keys(process.env).filter((k) =>
    k.toUpperCase().startsWith('VITE_CLOUDINARY')
  );
  assert(
    viteCloudinaryKeys.length === 0,
    'No VITE_CLOUDINARY environment variables exist in runtime environment'
  );

  // 2. ENV_CATALOG classifies both Account A & B as server_only
  const accountAVarSpecs = ENV_CATALOG.filter((spec) =>
    spec.name.startsWith('CLOUDINARY_') && !spec.name.startsWith('CLOUDINARY_REQUESTS_')
  );
  const accountBVarSpecs = ENV_CATALOG.filter((spec) =>
    spec.name.startsWith('CLOUDINARY_REQUESTS_')
  );
  assert(
    accountAVarSpecs.every((spec) => spec.scope === 'server_only'),
    'All Account A variables in ENV_CATALOG are strictly server_only'
  );
  assert(
    accountBVarSpecs.every((spec) => spec.scope === 'server_only'),
    'All Account B variables in ENV_CATALOG are strictly server_only'
  );
  assert(
    ENV_CATALOG.find((s) => s.name === 'CLOUDINARY_API_SECRET')?.isSecret === true,
    'CLOUDINARY_API_SECRET is marked as isSecret: true'
  );
  assert(
    ENV_CATALOG.find((s) => s.name === 'CLOUDINARY_REQUESTS_API_SECRET')?.isSecret === true,
    'CLOUDINARY_REQUESTS_API_SECRET is marked as isSecret: true'
  );

  // 3. Logger redaction of sensitive strings
  const testLog1 = `Upload failed: CLOUDINARY_REQUESTS_API_SECRET=${mockRealSecret}`;
  const masked1 = maskSensitiveString(testLog1);
  assert(!masked1.includes(mockRealSecret), 'maskSensitiveString redacts CLOUDINARY_REQUESTS_API_SECRET');
  assert(masked1.includes('CLOUDINARY_REQUESTS_API_SECRET=[REDACTED]'), 'Formatted as [REDACTED]');

  const testLog2 = `Account A error: CLOUDINARY_API_SECRET=${mockRealSecret}`;
  const masked2 = maskSensitiveString(testLog2);
  assert(!masked2.includes(mockRealSecret), 'maskSensitiveString redacts CLOUDINARY_API_SECRET');

  const testLog3 = `Cloudinary config JSON: {"api_secret":"${mockRealSecret}","cloud_name":"alongkar"}`;
  const masked3 = maskSensitiveString(testLog3);
  assert(!masked3.includes(mockRealSecret), 'maskSensitiveString redacts JSON api_secret key');

  const testLog4 = `Key secret format: api_secret=${mockRealSecret}&cloud_name=test`;
  const masked4 = maskSensitiveString(testLog4);
  assert(!masked4.includes(mockRealSecret), 'maskSensitiveString redacts api_secret key-value query format');

  // 4. Safe error message sanitizer (case-insensitive & secret stripping)
  const errWithSecret1 = new Error(`Authentication failure: invalid api_secret "${mockRealSecret}"`);
  const safeMsg1 = getSafeErrorMessage(errWithSecret1, 'Default safe message');
  assert(safeMsg1 === 'Default safe message', 'getSafeErrorMessage strips lowercase api_secret errors');

  const errWithSecret2 = new Error(`Connection to Cloudinary failed at line 42 with api_key mismatch`);
  const safeMsg2 = getSafeErrorMessage(errWithSecret2, 'Default safe message');
  assert(safeMsg2 === 'Default safe message', 'getSafeErrorMessage strips lowercase api_key errors');

  const errWithSecret3 = new Error(`CLOUDINARY_REQUESTS_API_SECRET is missing`);
  const safeMsg3 = getSafeErrorMessage(errWithSecret3, 'Default safe message');
  assert(safeMsg3 === 'Default safe message', 'getSafeErrorMessage strips CLOUDINARY_REQUESTS_ errors');

  // 5. Audit .env.example for accidental real credentials
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');
  assert(
    !envExampleContent.includes('alongkar-account-') &&
      !envExampleContent.includes(mockRealSecret) &&
      envExampleContent.includes('CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name') &&
      envExampleContent.includes('CLOUDINARY_REQUESTS_CLOUD_NAME=your_cloudinary_requests_cloud_name'),
    '.env.example contains only template placeholder values and zero real credentials'
  );

  // 6. Audit README.md for accidental credentials
  const readmePath = path.resolve(process.cwd(), 'README.md');
  const readmeContent = fs.readFileSync(readmePath, 'utf8');
  assert(
    readmeContent.includes('CLOUDINARY_REQUESTS_CLOUD_NAME') &&
      readmeContent.includes('CLOUDINARY_REQUESTS_API_KEY') &&
      readmeContent.includes('CLOUDINARY_REQUESTS_API_SECRET') &&
      !readmeContent.includes(mockRealSecret),
    'README.md accurately documents Account B variables without publishing secrets'
  );

  // 7. Verify /api/health does not expose Cloudinary configuration
  const healthRes = createMockRes();
  await healthHandler({ method: 'GET', url: '/api/health' }, healthRes);
  const healthDataStr = JSON.stringify(healthRes.data || {});
  assert(
    !healthDataStr.toLowerCase().includes('cloudinary') &&
      !healthDataStr.toLowerCase().includes('secret'),
    '/api/health public endpoint does NOT expose any Cloudinary configurations or secrets'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Summary
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n================================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase4AuditTests().catch((err) => {
  console.error('Fatal error running Phase 4 tests:', err);
  process.exit(1);
});
