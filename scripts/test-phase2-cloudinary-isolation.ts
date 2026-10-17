import {
  isCloudinaryConfigured,
  isCloudinaryProductsConfigured,
  isCloudinaryRequestsConfigured,
  getCloudinaryProductsConfig,
  getCloudinaryRequestsConfig,
  getCloudinaryRequestsUploadOptions,
  cloudinary,
} from '../api/_utils/cloudinary.js';
import { validateEnvironment } from '../api/_utils/env.js';
import { maskSensitiveString } from '../api/_utils/logger.js';
import { getSafeErrorMessage } from '../api/_utils/security.js';

async function runPhase2Tests() {
  console.log('================================================================');
  console.log('PHASE 2: CLOUDINARY ISOLATED ACCOUNT CONFIGURATION TEST SUITE');
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

  // Baseline base environment for testing
  const baseValidEnv: Record<string, string> = {
    DATABASE_URL: 'postgresql://postgres:test_pw@localhost:5432/alongkar?sslmode=require',
    CLERK_SECRET_KEY: 'sk_test_actual_valid_secret_key_12345',
    CLERK_PUBLISHABLE_KEY: 'pk_test_actual_valid_pub_key_12345',
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 1: Account A Configured & Account B Unconfigured
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Account A Configured & Account B Unconfigured ---');

  const envAccountAOnly: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: 'alongkar-account-a',
    CLOUDINARY_API_KEY: 'key-account-a-111',
    CLOUDINARY_API_SECRET: 'sec-account-a-222',
    // Account B variables completely omitted
  };

  assert(
    isCloudinaryProductsConfigured(envAccountAOnly) === true,
    'Account A products helper returns true when Account A credentials are set'
  );
  assert(
    isCloudinaryConfigured(envAccountAOnly) === true,
    'Backward-compatible isCloudinaryConfigured() returns true for Account A'
  );
  assert(
    isCloudinaryRequestsConfigured(envAccountAOnly) === false,
    'Account B requests helper returns false when Account B credentials are unset'
  );
  assert(
    getCloudinaryRequestsConfig(envAccountAOnly) === null,
    'getCloudinaryRequestsConfig() returns null when Account B is unconfigured'
  );

  let uploadOptionsErrorThrown = false;
  try {
    getCloudinaryRequestsUploadOptions({ folder: 'test' }, envAccountAOnly);
  } catch (err: any) {
    uploadOptionsErrorThrown = true;
    assert(
      err.message.includes('not configured'),
      'getCloudinaryRequestsUploadOptions throws actionable error when unconfigured'
    );
  }
  assert(uploadOptionsErrorThrown, 'Calling getCloudinaryRequestsUploadOptions throws when Account B unset');

  const valResAOnly = validateEnvironment(envAccountAOnly);
  assert(
    valResAOnly.services.cloudinaryProducts === 'configured',
    'validateEnvironment marks cloudinaryProducts as configured'
  );
  assert(
    valResAOnly.services.cloudinary === 'configured',
    'validateEnvironment marks legacy service cloudinary as configured'
  );
  assert(
    valResAOnly.services.cloudinaryRequests === 'not_configured',
    'validateEnvironment marks cloudinaryRequests as not_configured'
  );
  assert(
    !valResAOnly.warnings.some((w) => w.includes('Account B')),
    'No Account B warnings emitted when Account B is completely omitted (optional on startup)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 2: Account B Configured & Account A Unconfigured
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Account B Configured & Account A Unconfigured ---');

  const envAccountBOnly: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: '',
    CLOUDINARY_API_KEY: '',
    CLOUDINARY_API_SECRET: '',
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'alongkar-account-b',
    CLOUDINARY_REQUESTS_API_KEY: 'key-account-b-333',
    CLOUDINARY_REQUESTS_API_SECRET: 'sec-account-b-444',
  };

  assert(
    isCloudinaryProductsConfigured(envAccountBOnly) === false,
    'Account A products helper returns false when Account A credentials are unset'
  );
  assert(
    isCloudinaryConfigured(envAccountBOnly) === false,
    'Backward-compatible isCloudinaryConfigured() returns false when Account A unset'
  );
  assert(
    isCloudinaryRequestsConfigured(envAccountBOnly) === true,
    'Account B requests helper returns true when Account B credentials are set'
  );

  const reqConfig = getCloudinaryRequestsConfig(envAccountBOnly);
  assert(
    reqConfig !== null &&
      reqConfig.cloud_name === 'alongkar-account-b' &&
      reqConfig.api_key === 'key-account-b-333' &&
      reqConfig.api_secret === 'sec-account-b-444' &&
      reqConfig.secure === true,
    'getCloudinaryRequestsConfig() returns exact Account B credentials'
  );

  const reqUploadOpts = getCloudinaryRequestsUploadOptions(
    { folder: 'alongkar/jewellery-requests', resource_type: 'image' },
    envAccountBOnly
  );
  assert(
    reqUploadOpts.cloud_name === 'alongkar-account-b' &&
      reqUploadOpts.api_key === 'key-account-b-333' &&
      reqUploadOpts.api_secret === 'sec-account-b-444' &&
      reqUploadOpts.folder === 'alongkar/jewellery-requests' &&
      reqUploadOpts.resource_type === 'image',
    'getCloudinaryRequestsUploadOptions merges caller options with Account B credentials'
  );

  const valResBOnly = validateEnvironment(envAccountBOnly);
  assert(
    valResBOnly.services.cloudinaryProducts === 'not_configured',
    'validateEnvironment marks cloudinaryProducts as not_configured'
  );
  assert(
    valResBOnly.services.cloudinaryRequests === 'configured',
    'validateEnvironment marks cloudinaryRequests as configured'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 3: Missing & Partial Account B Credentials
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Missing & Partial Account B Credentials ---');

  // 3a. Only Cloud Name provided
  const envPartialB1: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'alongkar-account-b',
  };
  assert(
    isCloudinaryRequestsConfigured(envPartialB1) === false,
    'Account B is not configured when only cloud name is provided'
  );
  const valPartialB1 = validateEnvironment(envPartialB1);
  assert(
    valPartialB1.services.cloudinaryRequests === 'not_configured',
    'cloudinaryRequests is not_configured for cloud_name-only'
  );
  assert(
    valPartialB1.warnings.some((w) => w.includes('Cloudinary Account B (Request Jewellery) credentials are partially defined')),
    'Diagnostic warning emitted for partial Account B configuration (missing key & secret)'
  );

  // 3b. Cloud Name and API Key provided, Secret missing
  const envPartialB2: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'alongkar-account-b',
    CLOUDINARY_REQUESTS_API_KEY: 'key-account-b-333',
  };
  assert(
    isCloudinaryRequestsConfigured(envPartialB2) === false,
    'Account B is not configured when secret is missing'
  );
  const valPartialB2 = validateEnvironment(envPartialB2);
  assert(
    valPartialB2.warnings.some((w) => w.includes('Cloudinary Account B (Request Jewellery) credentials are partially defined')),
    'Diagnostic warning emitted for partial Account B configuration (missing secret)'
  );

  // 3c. Secret provided, Cloud Name & Key missing
  const envPartialB3: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_REQUESTS_API_SECRET: 'sec-account-b-444',
  };
  assert(
    isCloudinaryRequestsConfigured(envPartialB3) === false,
    'Account B is not configured when only secret is provided'
  );
  const valPartialB3 = validateEnvironment(envPartialB3);
  assert(
    valPartialB3.warnings.some((w) => w.includes('Cloudinary Account B (Request Jewellery) credentials are partially defined')),
    'Diagnostic warning emitted for partial Account B configuration (missing cloud_name & key)'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 4: Placeholder Values Treated as Unconfigured
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Placeholder Values Treated as Unconfigured ---');

  const envPlaceholderB: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'your_cloudinary_requests_cloud_name',
    CLOUDINARY_REQUESTS_API_KEY: 'your_cloudinary_requests_api_key',
    CLOUDINARY_REQUESTS_API_SECRET: 'your_cloudinary_requests_api_secret',
  };

  assert(
    isCloudinaryRequestsConfigured(envPlaceholderB) === false,
    'Account B with template placeholder values is treated as unconfigured'
  );

  const envPlaceholderA: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_CLOUD_NAME: 'your_cloudinary_cloud_name',
    CLOUDINARY_API_KEY: 'your_cloudinary_api_key',
    CLOUDINARY_API_SECRET: 'your_cloudinary_api_secret',
  };

  assert(
    isCloudinaryProductsConfigured(envPlaceholderA) === false,
    'Account A with template placeholder values is treated as unconfigured'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 5: Account B Configuration Does Not Mutate Shared SDK Singleton
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: Account B Does Not Mutate Shared SDK Singleton ---');

  // Read Account A singleton state before calling Account B methods
  const globalConfigBefore = cloudinary.config();
  const globalCloudNameBefore = globalConfigBefore.cloud_name;
  const globalApiKeyBefore = globalConfigBefore.api_key;
  const globalApiSecretBefore = globalConfigBefore.api_secret;

  // Generate Account B options
  const envBothAccounts: Record<string, string> = {
    CLOUDINARY_CLOUD_NAME: 'account-a-storefront-official',
    CLOUDINARY_API_KEY: 'key-a-prod-999',
    CLOUDINARY_API_SECRET: 'sec-a-prod-888',
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'account-b-requests-official',
    CLOUDINARY_REQUESTS_API_KEY: 'key-b-req-777',
    CLOUDINARY_REQUESTS_API_SECRET: 'sec-b-req-666',
  };

  const accountBOpts = getCloudinaryRequestsUploadOptions(
    { folder: 'alongkar/jewellery-requests' },
    envBothAccounts
  );

  // Check singleton configuration after Account B options generation
  const globalConfigAfter = cloudinary.config();
  assert(
    globalConfigAfter.cloud_name === globalCloudNameBefore,
    `Shared singleton cloud_name remains intact (${globalCloudNameBefore})`,
    `Received: ${globalConfigAfter.cloud_name}`
  );
  assert(
    globalConfigAfter.api_key === globalApiKeyBefore,
    `Shared singleton api_key remains intact (${globalApiKeyBefore})`,
    `Received: ${globalConfigAfter.api_key}`
  );
  assert(
    globalConfigAfter.api_secret === globalApiSecretBefore,
    'Shared singleton api_secret remains intact',
    `Received: ${globalConfigAfter.api_secret}`
  );

  // Verify that Account B options carry Account B credentials explicitly
  assert(
    accountBOpts.cloud_name === 'account-b-requests-official',
    'Account B options explicitly supply Account B cloud_name'
  );
  assert(
    accountBOpts.api_key === 'key-b-req-777',
    'Account B options explicitly supply Account B api_key'
  );
  assert(
    accountBOpts.api_secret === 'sec-b-req-666',
    'Account B options explicitly supply Account B api_secret'
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 6: Secret-Safe Diagnostics & Error Redaction
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 6: Secret-Safe Diagnostics & Error Redaction ---');

  // 6a. Verify VITE_ prefix is never used
  assert(
    process.env.VITE_CLOUDINARY_REQUESTS_API_SECRET === undefined,
    'VITE_CLOUDINARY_REQUESTS_API_SECRET is undefined in environment'
  );
  assert(
    process.env.VITE_CLOUDINARY_REQUESTS_API_KEY === undefined,
    'VITE_CLOUDINARY_REQUESTS_API_KEY is undefined in environment'
  );

  // 6b. Verify validation warnings never expose secret values
  const mockRealSecret = 'very_sensitive_production_secret_999xyz';
  const envWithSecretLeakTest: Record<string, string> = {
    ...baseValidEnv,
    CLOUDINARY_REQUESTS_CLOUD_NAME: 'test-leak-cloud',
    CLOUDINARY_REQUESTS_API_SECRET: mockRealSecret,
    // missing API_KEY to trigger warning
  };
  const valLeakTest = validateEnvironment(envWithSecretLeakTest);
  assert(
    valLeakTest.warnings.length > 0,
    'Validation warning triggered for missing API key'
  );
  assert(
    valLeakTest.warnings.every((w) => !w.includes(mockRealSecret)),
    'Validation warnings do NOT leak the secret value'
  );

  // 6c. Verify logger redacts CLOUDINARY_REQUESTS_API_SECRET
  const testLogString = `Error executing request with CLOUDINARY_REQUESTS_API_SECRET=${mockRealSecret}&other=123`;
  const maskedLog = maskSensitiveString(testLogString);
  assert(
    !maskedLog.includes(mockRealSecret),
    'maskSensitiveString redacts CLOUDINARY_REQUESTS_API_SECRET from log strings'
  );
  assert(
    maskedLog.includes('CLOUDINARY_REQUESTS_API_SECRET=[REDACTED]'),
    'maskSensitiveString formats redaction as [REDACTED]'
  );

  // 6d. Verify security error sanitizer catches CLOUDINARY_REQUESTS_ messages
  const rawSensitiveError = new Error(`Connection failed at CLOUDINARY_REQUESTS_API_SECRET=${mockRealSecret}`);
  const safeMessage = getSafeErrorMessage(rawSensitiveError, 'Default safe error');
  assert(
    safeMessage === 'Default safe error',
    'getSafeErrorMessage sanitizes errors referencing CLOUDINARY_REQUESTS_ and returns safe fallback'
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

runPhase2Tests().catch((err) => {
  console.error('Fatal error running Phase 2 tests:', err);
  process.exit(1);
});
