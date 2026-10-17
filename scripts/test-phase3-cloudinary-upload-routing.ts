import { Readable } from 'stream';
import {
  isCloudinaryProductsConfigured,
  isCloudinaryRequestsConfigured,
  getCloudinaryProductsConfig,
  getCloudinaryRequestsConfig,
  getCloudinaryProductsUploadOptions,
  getCloudinaryRequestsUploadOptions,
  cloudinary,
} from '../api/_utils/cloudinary.js';
import handler, {
  handleJewelleryInspirationUpload,
  handleProductImageUpload,
  uploadInspirationToCloudinary,
  uploadProductImageToCloudinary,
  MAX_INSPIRATION_SIZE_BYTES,
} from '../api/uploads.js';

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

// 12-byte valid WebP buffer
const validWebpBuffer = Buffer.from([
  0x52, 0x49, 0x46, 0x46, // RIFF
  0x24, 0x00, 0x00, 0x00, // length
  0x57, 0x45, 0x42, 0x50, // WEBP
]);

function createMockMultipartReq(options: {
  method?: string;
  url?: string;
  filename?: string;
  mimetype?: string;
  buffer?: Buffer;
  user?: any;
  admin?: any;
  query?: any;
}) {
  const boundary = `----WebKitFormBoundaryTest${Date.now()}${Math.random().toString(36).substring(2, 6)}`;
  const buffer = options.buffer !== undefined ? options.buffer : validWebpBuffer;
  const filename = options.filename || 'sample.webp';
  const mimetype = options.mimetype || 'image/webp';

  const bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimetype}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const req: any = Readable.from([bodyBuffer]);
  req.method = options.method || 'POST';
  req.url = options.url || '/api/uploads/jewellery-inspiration';
  req.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };
  if (options.query) {
    req.query = options.query;
  }
  if (options.user !== undefined) {
    req._testUser = options.user;
  }
  if (options.admin !== undefined) {
    req._testAdmin = options.admin;
  }
  return req;
}

async function runPhase3Tests() {
  console.log('================================================================');
  console.log('PHASE 3: CLOUDINARY UPLOAD ROUTING & ACCOUNT SEPARATION TESTS');
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

  // Preserve initial environment
  const originalEnv = { ...process.env };

  const mockAccountA = {
    cloud_name: 'alongkar-account-a-prod',
    api_key: 'mock-key-a',
    api_secret: 'mock-secret-a',
  };

  const mockAccountB = {
    cloud_name: 'alongkar-account-b-requests',
    api_key: 'mock-key-b',
    api_secret: 'mock-secret-b',
  };

  // Helper to configure env for tests
  function setupEnv(opts: { accountA?: boolean; accountB?: boolean }) {
    if (opts.accountA) {
      process.env.CLOUDINARY_CLOUD_NAME = mockAccountA.cloud_name;
      process.env.CLOUDINARY_API_KEY = mockAccountA.api_key;
      process.env.CLOUDINARY_API_SECRET = mockAccountA.api_secret;
    } else {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
    }

    if (opts.accountB) {
      process.env.CLOUDINARY_REQUESTS_CLOUD_NAME = mockAccountB.cloud_name;
      process.env.CLOUDINARY_REQUESTS_API_KEY = mockAccountB.api_key;
      process.env.CLOUDINARY_REQUESTS_API_SECRET = mockAccountB.api_secret;
    } else {
      delete process.env.CLOUDINARY_REQUESTS_CLOUD_NAME;
      delete process.env.CLOUDINARY_REQUESTS_API_KEY;
      delete process.env.CLOUDINARY_REQUESTS_API_SECRET;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 1: Inspiration Upload Targets Account B & Correct Folder
  // ──────────────────────────────────────────────────────────────────────────
  console.log('--- Suite 1: Customer Inspiration Uploads Target Account B ---');
  {
    setupEnv({ accountA: true, accountB: true });

    let capturedOptions: any = null;
    const originalUploadStream = cloudinary.uploader.upload_stream;

    // Spy on upload_stream
    cloudinary.uploader.upload_stream = function (options: any, callback: any) {
      capturedOptions = options;
      const fakeStream: any = new (Readable as any)();
      fakeStream._read = () => {};
      fakeStream.end = (buf: any) => {
        if (callback) {
          callback(null, {
            secure_url: `https://res.cloudinary.com/${options.cloud_name}/image/upload/v1/alongkar/jewellery-requests/mock.webp`,
            public_id: options.public_id || 'insp_mock',
            format: 'webp',
            bytes: buf ? buf.length : 12,
          });
        }
      };
      return fakeStream;
    } as any;

    try {
      const result = await uploadInspirationToCloudinary(validWebpBuffer);

      assert(capturedOptions !== null, 'upload_stream was invoked for inspiration upload');
      assert(
        capturedOptions.cloud_name === mockAccountB.cloud_name,
        'Inspiration upload explicitly targets Account B cloud_name'
      );
      assert(
        capturedOptions.api_key === mockAccountB.api_key,
        'Inspiration upload explicitly targets Account B api_key'
      );
      assert(
        capturedOptions.api_secret === mockAccountB.api_secret,
        'Inspiration upload explicitly targets Account B api_secret'
      );
      assert(
        capturedOptions.folder === 'alongkar/jewellery-requests',
        'Inspiration upload retains folder alongkar/jewellery-requests'
      );
      assert(
        capturedOptions.resource_type === 'image',
        'Inspiration upload retains resource_type: image'
      );
      assert(
        Array.isArray(capturedOptions.transformation) &&
          capturedOptions.transformation[0]?.width === 1600 &&
          capturedOptions.transformation[0]?.height === 1600 &&
          capturedOptions.transformation[0]?.crop === 'limit',
        'Inspiration upload preserves 1600x1600 limit transformations'
      );
      assert(
        result.secure_url.includes(mockAccountB.cloud_name),
        'Returned result URL reflects Account B cloud delivery'
      );
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 2: Admin Product Image Upload Targets Account A & Correct Folder
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 2: Admin Product Image Uploads Target Account A ---');
  {
    setupEnv({ accountA: true, accountB: true });

    let capturedOptions: any = null;
    const originalUploadStream = cloudinary.uploader.upload_stream;

    cloudinary.uploader.upload_stream = function (options: any, callback: any) {
      capturedOptions = options;
      const fakeStream: any = new (Readable as any)();
      fakeStream._read = () => {};
      fakeStream.end = (buf: any) => {
        if (callback) {
          callback(null, {
            secure_url: `https://res.cloudinary.com/${options.cloud_name}/image/upload/v1/alongkar/products/royal_ring_mock.webp`,
            public_id: options.public_id || 'prod_mock',
            format: 'webp',
            width: 2000,
            height: 2000,
            bytes: buf ? buf.length : 12,
          });
        }
      };
      return fakeStream;
    } as any;

    try {
      const result = await uploadProductImageToCloudinary(validWebpBuffer, 'royal-ring.webp');

      assert(capturedOptions !== null, 'upload_stream was invoked for product upload');
      assert(
        capturedOptions.cloud_name === mockAccountA.cloud_name,
        'Product upload explicitly targets Account A cloud_name'
      );
      assert(
        capturedOptions.api_key === mockAccountA.api_key,
        'Product upload explicitly targets Account A api_key'
      );
      assert(
        capturedOptions.api_secret === mockAccountA.api_secret,
        'Product upload explicitly targets Account A api_secret'
      );
      assert(
        capturedOptions.folder === 'alongkar/products',
        'Product upload retains folder alongkar/products'
      );
      assert(
        capturedOptions.resource_type === 'image',
        'Product upload retains resource_type: image'
      );
      assert(
        Array.isArray(capturedOptions.transformation) &&
          capturedOptions.transformation[0]?.width === 2000 &&
          capturedOptions.transformation[0]?.height === 2000 &&
          capturedOptions.transformation[0]?.crop === 'limit',
        'Product upload preserves 2000x2000 limit transformations'
      );
      assert(
        result.secure_url.includes(mockAccountA.cloud_name),
        'Returned result URL reflects Account A cloud delivery'
      );
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 3: Account B Unconfigured Fails Safely with HTTP 503 & Never Falls Back to Account A
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 3: Account B Unconfigured Fails Safely with HTTP 503 & Never Falls Back ---');
  {
    // Account A configured, Account B unconfigured
    setupEnv({ accountA: true, accountB: false });

    let uploadStreamCalled = false;
    const originalUploadStream = cloudinary.uploader.upload_stream;
    cloudinary.uploader.upload_stream = function () {
      uploadStreamCalled = true;
      throw new Error('upload_stream should never be reached when Account B is unconfigured');
    } as any;

    try {
      // 1. Direct helper throws actionable error
      let helperErrorThrown = false;
      try {
        await uploadInspirationToCloudinary(validWebpBuffer);
      } catch (err: any) {
        helperErrorThrown = true;
        assert(
          err.message.includes('Account B') && err.message.includes('not configured'),
          'uploadInspirationToCloudinary rejects when Account B is unconfigured'
        );
      }
      assert(helperErrorThrown, 'uploadInspirationToCloudinary threw rejection when unconfigured');

      // 2. Request handler returns safe 503
      const req = createMockMultipartReq({
        user: { id: 'cust_valid_123', email: 'cust@alongkar.in' },
      });
      const res = createMockRes();

      await handleJewelleryInspirationUpload(req, res);

      assert(res.statusCode === 503, 'Inspiration upload returns HTTP 503 when Account B is unconfigured');
      assert(res.data?.success === false, '503 response has success: false');
      assert(
        typeof res.data?.error === 'string' &&
          res.data.error.includes('customer requests') &&
          !res.data.error.includes(mockAccountA.api_secret) &&
          !res.data.error.includes(mockAccountA.cloud_name),
        '503 response safely explains service is not configured without exposing secrets or credentials'
      );
      assert(
        uploadStreamCalled === false,
        'Cloudinary upload was NEVER attempted and NEVER fell back to Account A'
      );
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 4: Account A Unconfigured Fails Safely with HTTP 503 Without Affecting Account B
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 4: Account A Unconfigured Fails with 503 Without Affecting Account B ---');
  {
    // Account B configured, Account A unconfigured
    setupEnv({ accountA: false, accountB: true });

    const tracker = {
      uploadStreamCalledForProduct: false,
      uploadStreamCalledForInspiration: false,
    };
    const originalUploadStream = cloudinary.uploader.upload_stream;

    cloudinary.uploader.upload_stream = function (options: any, callback: any) {
      if (options.folder === 'alongkar/products') {
        tracker.uploadStreamCalledForProduct = true;
        throw new Error('Product upload stream should not be invoked when Account A is unconfigured');
      }
      if (options.folder === 'alongkar/jewellery-requests') {
        tracker.uploadStreamCalledForInspiration = true;
        const fakeStream: any = new (Readable as any)();
        fakeStream._read = () => {};
        fakeStream.end = (buf: any) => {
          if (callback) {
            callback(null, {
              secure_url: `https://res.cloudinary.com/${options.cloud_name}/image/upload/v1/alongkar/jewellery-requests/insp.webp`,
              public_id: 'insp_123',
              format: 'webp',
              bytes: 12,
            });
          }
        };
        return fakeStream;
      }
      throw new Error(`Unexpected folder: ${options.folder}`);
    } as any;

    try {
      // 1. Product upload returns 503
      const prodReq = createMockMultipartReq({
        url: '/api/uploads/product-image',
        filename: 'necklace.webp',
        admin: { authorized: true, status: 200, clerkUserId: 'admin_123' },
      });
      const prodRes = createMockRes();

      await handleProductImageUpload(prodReq, prodRes);

      assert(prodRes.statusCode === 503, 'Product upload returns HTTP 503 when Account A is unconfigured');
      assert(
        typeof prodRes.data?.error === 'string' &&
          prodRes.data.error.includes('CLOUDINARY_CLOUD_NAME') &&
          !prodRes.data.error.includes(mockAccountB.api_secret),
        'Product 503 response preserves expected configuration guidance without leaking secrets'
      );
      assert(tracker.uploadStreamCalledForProduct === false, 'Product upload was NOT invoked when Account A was unset');

      // 2. Inspiration upload remains fully functional on Account B
      const inspReq = createMockMultipartReq({
        user: { id: 'cust_active_456', email: 'cust456@alongkar.in' },
      });
      const inspRes = createMockRes();

      await handleJewelleryInspirationUpload(inspReq, inspRes);

      assert(inspRes.statusCode === 200, 'Inspiration upload succeeds on Account B despite Account A outage');
      assert(inspRes.data?.success === true, 'Inspiration upload response reports success: true');
      assert(tracker.uploadStreamCalledForInspiration === true, 'Inspiration upload correctly routes to Account B');
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 5: Account B Configuration Does Not Mutate Shared SDK Singleton
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 5: Shared Cloudinary Singleton Non-Mutation ---');
  {
    setupEnv({ accountA: true, accountB: true });

    // Inspect initial singleton state
    const singletonBefore = cloudinary.config();
    const origCloudName = singletonBefore.cloud_name;
    const origApiKey = singletonBefore.api_key;
    const origApiSecret = singletonBefore.api_secret;

    // Build Account B upload options
    const accountBOptions = getCloudinaryRequestsUploadOptions({
      folder: 'alongkar/jewellery-requests',
    });

    const singletonAfterOptions = cloudinary.config();
    assert(
      singletonAfterOptions.cloud_name === origCloudName,
      'Generating Account B options did NOT mutate singleton cloud_name'
    );
    assert(
      singletonAfterOptions.api_key === origApiKey,
      'Generating Account B options did NOT mutate singleton api_key'
    );
    assert(
      singletonAfterOptions.api_secret === origApiSecret,
      'Generating Account B options did NOT mutate singleton api_secret'
    );

    // Perform an inspiration upload
    const originalUploadStream = cloudinary.uploader.upload_stream;
    cloudinary.uploader.upload_stream = function (options: any, callback: any) {
      const fakeStream: any = new (Readable as any)();
      fakeStream._read = () => {};
      fakeStream.end = () => {
        if (callback) {
          callback(null, {
            secure_url: 'https://res.cloudinary.com/b/image/upload/sample.webp',
            public_id: 'sample',
            format: 'webp',
            bytes: 12,
          });
        }
      };
      return fakeStream;
    } as any;

    try {
      await uploadInspirationToCloudinary(validWebpBuffer);

      const singletonAfterUpload = cloudinary.config();
      assert(
        singletonAfterUpload.cloud_name === origCloudName,
        'Executing Account B upload did NOT mutate singleton cloud_name'
      );
      assert(
        singletonAfterUpload.api_key === origApiKey,
        'Executing Account B upload did NOT mutate singleton api_key'
      );
      assert(
        singletonAfterUpload.api_secret === origApiSecret,
        'Executing Account B upload did NOT mutate singleton api_secret'
      );
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 6: Security, Authentication, Authorization & File Validation
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 6: Security, Auth, Validation & Size Limits ---');
  {
    setupEnv({ accountA: true, accountB: true });

    // 1. Inspiration: Unauthenticated -> 401
    const unauthInspReq = createMockMultipartReq({ user: null });
    const unauthInspRes = createMockRes();
    await handleJewelleryInspirationUpload(unauthInspReq, unauthInspRes);
    assert(unauthInspRes.statusCode === 401, 'Unauthenticated inspiration upload returns HTTP 401');

    // 2. Inspiration: Method Not Allowed -> 405
    const getInspReq = createMockMultipartReq({ method: 'GET', user: { id: 'u1' } });
    const getInspRes = createMockRes();
    await handleJewelleryInspirationUpload(getInspReq, getInspRes);
    assert(getInspRes.statusCode === 405, 'GET on inspiration upload returns HTTP 405');

    // 3. Product: Unauthenticated -> 401
    const unauthProdReq = createMockMultipartReq({
      url: '/api/uploads/product-image',
      admin: { authorized: false, status: 401, error: 'Authentication required' },
    });
    const unauthProdRes = createMockRes();
    await handleProductImageUpload(unauthProdReq, unauthProdRes);
    assert(unauthProdRes.statusCode === 401, 'Unauthenticated product upload returns HTTP 401');

    // 4. Product: Non-admin -> 403
    const nonAdminReq = createMockMultipartReq({
      url: '/api/uploads/product-image',
      admin: { authorized: false, status: 403, error: 'Administrator access required' },
    });
    const nonAdminRes = createMockRes();
    await handleProductImageUpload(nonAdminReq, nonAdminRes);
    assert(nonAdminRes.statusCode === 403, 'Non-admin product upload returns HTTP 403 Forbidden');

    // 5. Product: Method Not Allowed -> 405
    const getProdReq = createMockMultipartReq({
      method: 'GET',
      url: '/api/uploads/product-image',
      admin: { authorized: true, status: 200 },
    });
    const getProdRes = createMockRes();
    await handleProductImageUpload(getProdReq, getProdRes);
    assert(getProdRes.statusCode === 405, 'GET on product upload returns HTTP 405');

    // 6. Inspiration: 5MB size limit enforced
    const oversizedBuffer = Buffer.concat([
      validWebpBuffer,
      Buffer.alloc(MAX_INSPIRATION_SIZE_BYTES + 1024),
    ]);
    const oversizedInspReq = createMockMultipartReq({
      buffer: oversizedBuffer,
      user: { id: 'user_oversized', email: 'oversized@alongkar.in' },
    });
    const oversizedInspRes = createMockRes();
    await handleJewelleryInspirationUpload(oversizedInspReq, oversizedInspRes);
    assert(
      oversizedInspRes.statusCode === 400 &&
        oversizedInspRes.data?.error?.includes('5MB limit'),
      'Inspiration upload exceeding 5MB is rejected with HTTP 400'
    );

    // 7. Masquerading text file disguised as JPEG rejected
    const masqueradeBuffer = Buffer.from('Plain text claiming to be a jpeg image file');
    const fakeFileReq = createMockMultipartReq({
      filename: 'fake.jpg',
      mimetype: 'image/jpeg',
      buffer: masqueradeBuffer,
      user: { id: 'user_fake', email: 'fake@alongkar.in' },
    });
    const fakeFileRes = createMockRes();
    await handleJewelleryInspirationUpload(fakeFileReq, fakeFileRes);
    assert(
      fakeFileRes.statusCode === 400 &&
        fakeFileRes.data?.error?.includes('Corrupt or invalid image content'),
      'Masquerading text file is rejected by magic-byte validation with HTTP 400'
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // Suite 7: Response Contracts & Dispatcher Sub-Routing
  // ──────────────────────────────────────────────────────────────────────────
  console.log('\n--- Suite 7: Response Contracts & Unified Dispatcher Routing ---');
  {
    setupEnv({ accountA: true, accountB: true });

    let lastFolder = '';
    const originalUploadStream = cloudinary.uploader.upload_stream;
    cloudinary.uploader.upload_stream = function (options: any, callback: any) {
      lastFolder = options.folder;
      const fakeStream: any = new (Readable as any)();
      fakeStream._read = () => {};
      fakeStream.end = (buf: any) => {
        if (callback) {
          callback(null, {
            secure_url: `https://res.cloudinary.com/${options.cloud_name}/image/upload/v1/${options.folder}/test.webp`,
            public_id: options.public_id || 'test_id',
            format: 'webp',
            width: 1200,
            height: 1200,
            bytes: buf ? buf.length : 12,
          });
        }
      };
      return fakeStream;
    } as any;

    try {
      // 1. Dispatcher: URL path /jewellery-inspiration
      const dispInspReq = createMockMultipartReq({
        url: '/api/uploads/jewellery-inspiration',
        user: { id: 'cust_disp_1', email: 'disp1@alongkar.in' },
      });
      const dispInspRes = createMockRes();
      await handler(dispInspReq, dispInspRes);

      assert(dispInspRes.statusCode === 200, 'Dispatcher routes /jewellery-inspiration to inspiration handler');
      assert(dispInspRes.data?.success === true, 'Inspiration response contains success: true');
      assert(typeof dispInspRes.data?.secure_url === 'string', 'Inspiration response contains secure_url');
      assert(typeof dispInspRes.data?.public_id === 'string', 'Inspiration response contains public_id');
      assert(typeof dispInspRes.data?.bytes === 'number', 'Inspiration response contains bytes');
      assert(lastFolder === 'alongkar/jewellery-requests', 'Dispatcher routed to jewellery-requests folder');

      // 2. Dispatcher: Query param ?type=jewellery-inspiration
      const queryInspReq = createMockMultipartReq({
        url: '/api/uploads?type=jewellery-inspiration',
        query: { type: 'jewellery-inspiration' },
        user: { id: 'cust_disp_2', email: 'disp2@alongkar.in' },
      });
      const queryInspRes = createMockRes();
      await handler(queryInspReq, queryInspRes);
      assert(queryInspRes.statusCode === 200, 'Dispatcher routes ?type=jewellery-inspiration to inspiration handler');

      // 3. Dispatcher: URL path /product-image
      const dispProdReq = createMockMultipartReq({
        url: '/api/uploads/product-image',
        admin: { authorized: true, status: 200, clerkUserId: 'admin_disp' },
      });
      const dispProdRes = createMockRes();
      await handler(dispProdReq, dispProdRes);

      assert(dispProdRes.statusCode === 200, 'Dispatcher routes /product-image to product handler');
      assert(dispProdRes.data?.success === true, 'Product response contains success: true');
      assert(typeof dispProdRes.data?.secure_url === 'string', 'Product response contains secure_url');
      assert(typeof dispProdRes.data?.public_id === 'string', 'Product response contains public_id');
      assert(typeof dispProdRes.data?.width === 'number', 'Product response contains width');
      assert(typeof dispProdRes.data?.height === 'number', 'Product response contains height');
      assert(lastFolder === 'alongkar/products', 'Dispatcher routed to products folder');

      // 4. Dispatcher: Query param ?type=product-image
      const queryProdReq = createMockMultipartReq({
        url: '/api/uploads?type=product-image',
        query: { type: 'product-image' },
        admin: { authorized: true, status: 200, clerkUserId: 'admin_disp_2' },
      });
      const queryProdRes = createMockRes();
      await handler(queryProdReq, queryProdRes);
      assert(queryProdRes.statusCode === 200, 'Dispatcher routes ?type=product-image to product handler');

      // 5. Dispatcher: Unknown route -> 404
      const unknownReq = createMockMultipartReq({ url: '/api/uploads/nonexistent' });
      const unknownRes = createMockRes();
      await handler(unknownReq, unknownRes);
      assert(unknownRes.statusCode === 404, 'Dispatcher returns 404 for unknown upload route');
    } finally {
      cloudinary.uploader.upload_stream = originalUploadStream;
    }
  }

  // Restore original environment
  process.env = originalEnv;

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

runPhase3Tests().catch((err) => {
  console.error('Fatal error running Phase 3 tests:', err);
  process.exit(1);
});
