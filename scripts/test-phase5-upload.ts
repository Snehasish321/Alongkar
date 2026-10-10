import './testDbGuard.js';
import prisma from '../src/lib/prisma.ts';
import { validateImageMagicBytes, ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../api/_utils/multipart.ts';
import uploadHandler from '../api/uploads/product-image.ts';
import productHandler from '../api/products.ts';

// Helper mock response object
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

async function runTests() {
  console.log('====================================================');
  console.log('Starting Phase 5 - Product Image Upload Pipeline Tests');
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

  // ==========================================
  // Test Suite 1: Multipart & Magic Byte Validation
  // ==========================================
  console.log('--- Test Suite 1: Multipart & Magic Byte Image Validation ---');

  // 1. Allowed MIME types
  assert(
    ALLOWED_MIME_TYPES.includes('image/jpeg') &&
      ALLOWED_MIME_TYPES.includes('image/png') &&
      ALLOWED_MIME_TYPES.includes('image/webp') &&
      ALLOWED_MIME_TYPES.includes('image/avif'),
    'Allowed MIME types list includes JPEG, PNG, WebP, AVIF'
  );

  // 2. Max size
  assert(MAX_FILE_SIZE_BYTES === 10 * 1024 * 1024, 'Max upload file size is exactly 10MB');

  // 3. JPEG magic bytes verification
  const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  assert(
    validateImageMagicBytes(validJpegBuffer, 'image/jpeg') === true,
    'Valid JPEG magic bytes pass validation'
  );

  // 4. PNG magic bytes verification
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  assert(
    validateImageMagicBytes(validPngBuffer, 'image/png') === true,
    'Valid PNG magic bytes pass validation'
  );

  // 5. WebP magic bytes verification
  const validWebpBuffer = Buffer.from([
    0x52, 0x49, 0x46, 0x46, // RIFF
    0x24, 0x00, 0x00, 0x00, // length
    0x57, 0x45, 0x42, 0x50, // WEBP
  ]);
  assert(
    validateImageMagicBytes(validWebpBuffer, 'image/webp') === true,
    'Valid WebP magic bytes pass validation'
  );

  // 6. Masquerading file (plain text with .jpg extension)
  const fakeJpgBuffer = Buffer.from('This is a text file claiming to be an image');
  assert(
    validateImageMagicBytes(fakeJpgBuffer, 'image/jpeg') === false,
    'Masquerading text file disguised as JPEG is rejected by magic byte check'
  );

  // 7. Multipart stream parser with valid WebP file
  const boundary = '----WebKitFormBoundaryTest123';
  const bodyBuffer = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.webp"\r\nContent-Type: image/webp\r\n\r\n`),
    validWebpBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  const { Readable } = await import('stream');
  const mockStream: any = Readable.from([bodyBuffer]);
  mockStream.headers = {
    'content-type': `multipart/form-data; boundary=${boundary}`,
  };

  const { parseMultipartForm } = await import('../api/_utils/multipart.ts');
  const parseResult = await parseMultipartForm(mockStream);
  assert(
    Boolean(parseResult.file && parseResult.file.mimetype === 'image/webp' && parseResult.file.size > 0),
    'Multipart parser successfully extracts valid WebP file buffer and metadata'
  );

  // 8. Multipart stream parser with unsupported MIME type (PDF)
  const pdfBody = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="doc.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.5`),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const pdfStream: any = Readable.from([pdfBody]);
  pdfStream.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  const pdfResult = await parseMultipartForm(pdfStream);
  assert(
    Boolean(pdfResult.error && pdfResult.error.includes('Unsupported file type')),
    'Multipart parser rejects unsupported MIME type (application/pdf)'
  );

  // 9. Multipart stream parser with missing file
  const emptyBody = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="name"\r\n\r\nSample\r\n--${boundary}--\r\n`);
  const emptyStream: any = Readable.from([emptyBody]);
  emptyStream.headers = { 'content-type': `multipart/form-data; boundary=${boundary}` };
  const emptyResult = await parseMultipartForm(emptyStream);
  assert(
    Boolean(emptyResult.error && emptyResult.error.includes('No image file')),
    'Multipart parser returns validation error when file is missing'
  );

  // ==========================================
  // Test Suite 2: Upload API Security & Authorization
  // ==========================================
  console.log('\n--- Test Suite 2: Upload API Security & Authorization ---');

  // 10. Unauthenticated upload request -> 401
  const unauthReq = {
    method: 'POST',
    url: '/api/uploads/product-image',
    headers: {},
  };
  const unauthRes = createMockRes();
  await uploadHandler(unauthReq, unauthRes);
  assert(
    unauthRes.statusCode === 401,
    'Unauthenticated upload request returns HTTP 401',
    `Received: ${unauthRes.statusCode}`
  );

  // 11. Unsupported HTTP method -> 405
  const getReq = {
    method: 'GET',
    url: '/api/uploads/product-image',
    headers: {},
  };
  const getRes = createMockRes();
  await uploadHandler(getReq, getRes);
  assert(
    getRes.statusCode === 405,
    'GET request to upload endpoint returns HTTP 405 Method Not Allowed',
    `Received: ${getRes.statusCode}`
  );

  // ==========================================
  // Test Suite 3: Database & Product Lifecycle with Cloudinary URLs
  // ==========================================
  console.log('\n--- Test Suite 3: Product Lifecycle with Cloudinary Image URLs ---');

  // 9. Check existing products count in PostgreSQL
  const initialCount = await prisma.product.count();
  console.log(`Database currently contains ${initialCount} real products.`);
  assert(initialCount >= 24, `Initial product catalog contains ${initialCount} products`);

  // 10. Create a temporary product with Cloudinary image URLs
  const testProductSlug = `test-phase5-ring-${Date.now()}`;
  const mockCloudinaryImage = 'https://res.cloudinary.com/alongkar/image/upload/v1720000000/alongkar/products/test_ring_primary.webp';
  const mockCloudinaryHover = 'https://res.cloudinary.com/alongkar/image/upload/v1720000000/alongkar/products/test_ring_hover.webp';

  const createdProduct = await prisma.product.create({
    data: {
      name: 'Phase 5 Test Imperial Kundan Solitaire Ring',
      slug: testProductSlug,
      category: 'rings',
      collectionId: 'statement',
      price: 1499,
      originalPrice: 2999,
      discountPercent: 50,
      rating: 4.9,
      reviewCount: 12,
      isNew: true,
      isBestSeller: true,
      isTrending: false,
      image: mockCloudinaryImage,
      hoverImage: mockCloudinaryHover,
      description: 'Handcrafted artisan test ring with 24K gold micron plating.',
      finish: '24K Micron Gold Plated',
      baseMaterial: 'High-Grade Brass Alloy',
      stoneType: 'AAA Cubic Zirconia',
      warranty: '6 Months Polish Guarantee',
      inStock: true,
    },
  });

  assert(
    Boolean(createdProduct && createdProduct.id),
    'Temporary product created in PostgreSQL with Cloudinary URLs'
  );
  assert(
    createdProduct.image === mockCloudinaryImage && createdProduct.hoverImage === mockCloudinaryHover,
    'Product.image and Product.hoverImage correctly store Cloudinary HTTPS URLs'
  );

  // 11. Retrieve product via GET /api/products?slug=...
  const getProductReq = {
    method: 'GET',
    url: `/api/products?slug=${testProductSlug}`,
    query: { slug: testProductSlug },
  };
  const getProductRes = createMockRes();
  await productHandler(getProductReq, getProductRes);

  assert(
    getProductRes.statusCode === 200 &&
      getProductRes.data?.product?.slug === testProductSlug &&
      getProductRes.data?.product?.image === mockCloudinaryImage,
    'GET /api/products returns newly created product with Cloudinary image'
  );

  // 12. Update / Replace Product Images
  const updatedCloudinaryImage = 'https://res.cloudinary.com/alongkar/image/upload/v1720000001/alongkar/products/test_ring_replaced.webp';
  const updatedCloudinaryHover = 'https://res.cloudinary.com/alongkar/image/upload/v1720000001/alongkar/products/test_ring_hover_replaced.webp';

  const updatedProduct = await prisma.product.update({
    where: { id: createdProduct.id },
    data: {
      image: updatedCloudinaryImage,
      hoverImage: updatedCloudinaryHover,
    },
  });

  assert(
    updatedProduct.image === updatedCloudinaryImage &&
      updatedProduct.hoverImage === updatedCloudinaryHover,
    'Product.image and Product.hoverImage successfully replaced with new Cloudinary URLs'
  );

  // 13. Clean up: Delete temporary product
  const deleted = await prisma.product.delete({
    where: { id: createdProduct.id },
  });

  assert(deleted.id === createdProduct.id, 'Temporary test product deleted successfully');

  // 14. Verify database count is restored to initial count
  const finalCount = await prisma.product.count();
  assert(
    finalCount === initialCount,
    `Database restored to exact original count of ${initialCount} products without any data loss`
  );

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n====================================================');
  console.log(`Test Summary: Passed ${passed} / ${passed + failed} tests`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test execution error:', err);
  process.exit(1);
});
