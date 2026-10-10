import './testDbGuard.js';
import prisma from '../src/lib/prisma.js';
import uploadHandler from '../api/uploads/jewellery-inspiration.js';
import { isCloudinaryConfigured } from '../api/_utils/cloudinary.js';
import {
  ALLOWED_MIME_TYPES,
  validateImageMagicBytes,
  parseMultipartForm,
} from '../api/_utils/multipart.js';
import { Readable } from 'stream';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    headers: {},
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value;
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

async function runTask4Tests() {
  console.log('====================================================');
  console.log('TASK 4: CLOUDINARY INSPIRATION UPLOAD & INTEGRATION TESTS');
  console.log('====================================================\n');

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

  // ==============================================================
  // Test Suite 1: Cloudinary Configuration & Secrets Isolation
  // ==============================================================
  console.log('--- Test Suite 1: Cloudinary Configuration & Security ---');

  const configured = isCloudinaryConfigured();
  console.log(`Cloudinary configured in current environment: ${configured ? 'YES' : 'NO'}`);

  // 1. Verify secrets are not exposed to client bundle environment
  assert(
    process.env.VITE_CLOUDINARY_API_SECRET === undefined,
    'CLOUDINARY_API_SECRET is strictly hidden from client-side (no VITE_ prefix)'
  );

  // ==============================================================
  // Test Suite 2: File Format & Magic Byte Verification
  // ==============================================================
  console.log('\n--- Test Suite 2: Image Format & Magic Byte Validation ---');

  // 2. Allowed MIME types
  assert(
    ALLOWED_MIME_TYPES.includes('image/jpeg') &&
      ALLOWED_MIME_TYPES.includes('image/png') &&
      ALLOWED_MIME_TYPES.includes('image/webp') &&
      ALLOWED_MIME_TYPES.includes('image/avif'),
    'Supported formats include JPEG, PNG, WebP, and AVIF'
  );

  // 3. Valid JPEG magic bytes
  const validJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert(validateImageMagicBytes(validJpeg, 'image/jpeg') === true, 'Valid JPEG magic bytes pass validation');

  // 4. Valid PNG magic bytes
  const validPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert(validateImageMagicBytes(validPng, 'image/png') === true, 'Valid PNG magic bytes pass validation');

  // 5. Valid WebP magic bytes
  const validWebp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  assert(validateImageMagicBytes(validWebp, 'image/webp') === true, 'Valid WebP magic bytes pass validation');

  // 6. Masquerading text file disguised as JPEG
  const fakeJpg = Buffer.from('This is a text file claiming to be a jpeg image.');
  assert(validateImageMagicBytes(fakeJpg, 'image/jpeg') === false, 'Disguised text file is rejected');

  // ==============================================================
  // Test Suite 3: Multipart Form Parser Stream Tests
  // ==============================================================
  console.log('\n--- Test Suite 3: Multipart Form Stream Parsing ---');

  const boundary = '----WebKitFormBoundaryTask4Test';
  const validWebpBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="inspiration.webp"\r\nContent-Type: image/webp\r\n\r\n`),
    validWebp,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const mockStream: any = Readable.from([validWebpBody]);
  mockStream.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };

  const parseResult = await parseMultipartForm(mockStream);
  assert(
    Boolean(parseResult.file && parseResult.file.mimetype === 'image/webp' && parseResult.file.size > 0),
    'Multipart parser successfully parses valid image stream'
  );

  // Unsupported PDF document
  const pdfBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="document.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.5`),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const pdfStream: any = Readable.from([pdfBody]);
  pdfStream.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  const pdfResult = await parseMultipartForm(pdfStream);
  assert(
    Boolean(pdfResult.error && pdfResult.error.includes('Unsupported file type')),
    'PDF file is rejected by multipart parser'
  );

  // ==============================================================
  // Test Suite 4: Upload Endpoint Unauthenticated Access Control
  // ==============================================================
  console.log('\n--- Test Suite 4: Upload Endpoint Access Control ---');

  const unauthUploadReq = {
    method: 'POST',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
  const unauthUploadRes = createMockRes();
  await uploadHandler(unauthUploadReq, unauthUploadRes);
  assert(unauthUploadRes.statusCode === 401, 'Unauthenticated upload request is rejected with 401');
  assert(unauthUploadRes.data?.success === false, 'Upload rejection response has success: false');

  // Method not allowed (GET)
  const getUploadReq = { method: 'GET', headers: {} };
  const getUploadRes = createMockRes();
  await uploadHandler(getUploadReq, getUploadRes);
  assert(getUploadRes.statusCode === 405, 'GET method on upload endpoint is rejected with 405');

  // ==============================================================
  // Test Suite 5: End-to-End Flow & Database Storage
  // ==============================================================
  console.log('\n--- Test Suite 5: Sourcing Request with Cloudinary URL Storage ---');

  const testClerkUserId = `test_clerk_insp_${Date.now()}`;
  let testUser: any = null;
  let createdReqId: string | null = null;

  try {
    testUser = await prisma.user.create({
      data: {
        clerkUserId: testClerkUserId,
        email: 'customer_insp_test@alongkar.in',
      },
    });

    const mockCloudinaryUrl =
      'https://res.cloudinary.com/alongkar/image/upload/v1720000000/alongkar/jewellery-requests/insp_test_98765.webp';

    // Simulate creation of request with Cloudinary URL
    const createdReq = await prisma.jewelleryRequest.create({
      data: {
        requestNumber: `REQ-${Date.now()}-TEST4`,
        userId: testUser.id,
        jewelleryType: 'Jhumka',
        description: 'Floral filigree temple jhumka with south sea pearls',
        inspirationImageUrl: mockCloudinaryUrl,
        quantity: 1,
        phone: '9876543210',
        budget: 3500,
        status: 'PENDING',
      },
    });
    createdReqId = createdReq.id;

    assert(Boolean(createdReq.id), 'JewelleryRequest record created in PostgreSQL');
    assert(
      createdReq.inspirationImageUrl === mockCloudinaryUrl,
      'JewelleryRequest.inspirationImageUrl stores Cloudinary CDN URL'
    );
    assert(createdReq.status === 'PENDING', 'Request status is PENDING');

    // Retrieve via Prisma query
    const fetchedReq = await prisma.jewelleryRequest.findUnique({
      where: { id: createdReq.id },
    });
    assert(
      fetchedReq?.inspirationImageUrl.startsWith('https://res.cloudinary.com/'),
      'Retrieved record verifies Cloudinary URL persistence'
    );
  } finally {
    if (createdReqId) {
      await prisma.jewelleryRequest.delete({ where: { id: createdReqId } }).catch(() => {});
    }
    if (testUser) {
      await prisma.user.delete({ where: { id: testUser.id } }).catch(() => {});
    }
    console.log('🧹 Cleaned up test records.');
  }

  // ==============================================================
  // Summary
  // ==============================================================
  console.log('\n====================================================');
  console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
  console.log('====================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTask4Tests()
  .catch((err) => {
    console.error('Fatal error running tests:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
