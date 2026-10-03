import prisma from '../src/lib/prisma.js';
import { clerkClient } from '../api/_utils/auth.js';
import productsHandler from '../api/products.js';
import adminJewelleryRequestsHandler from '../api/admin/jewellery-requests.js';
import productImageUploadHandler from '../api/uploads/product-image.js';

function createMockRes() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  let data: any = null;

  const res: any = {
    statusCode: 200,
    headers,
    status(code: number) {
      statusCode = code;
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
      return this;
    },
    set(hdrs: Record<string, string>) {
      for (const [k, v] of Object.entries(hdrs)) {
        headers[k.toLowerCase()] = v;
      }
      return this;
    },
    json(payload: any) {
      data = payload;
      this.data = payload;
      return this;
    },
    end(str: string) {
      if (str) {
        try {
          data = JSON.parse(str);
        } catch {
          data = str;
        }
      }
      this.data = data;
      return this;
    },
    _getStatus: () => statusCode,
    _getData: () => data,
  };
  return res;
}

async function runAdminRoleVerificationTests() {
  console.log('====================================================');
  console.log('VERIFYING NON-ADMIN 403 FORBIDDEN & ADMIN SUCCESS');
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

  // Create test records in database for test mutations
  const adminClerkId = `test_admin_user_${Date.now()}`;
  const nonAdminClerkId = `test_customer_user_${Date.now()}`;

  const adminUser = await prisma.user.create({
    data: {
      clerkUserId: adminClerkId,
      email: 'admin.test@alongkar.com',
    },
  });

  const nonAdminUser = await prisma.user.create({
    data: {
      clerkUserId: nonAdminClerkId,
      email: 'customer.test@alongkar.com',
    },
  });

  const testProduct = await prisma.product.create({
    data: {
      name: 'Auth Test Product',
      slug: `auth-test-prod-${Date.now()}`,
      category: 'Necklaces',
      price: 1999,
      originalPrice: 2499,
      image: 'https://images.alongkar.com/test.jpg',
      hoverImage: 'https://images.alongkar.com/test-hover.jpg',
      description: 'Test product description',
      finish: '18K Gold',
      baseMaterial: 'Silver',
      warranty: '6 Months',
    },
  });

  const testJewelleryRequest = await (prisma as any).jewelleryRequest.create({
    data: {
      requestNumber: `REQ-AUTH-${Date.now()}`,
      userId: nonAdminUser.id,
      jewelleryType: 'Ring',
      description: 'Custom ring for testing auth',
      inspirationImageUrl: 'https://images.alongkar.com/insp.jpg',
      quantity: 1,
      phone: '9876543210',
      status: 'PENDING',
    },
  });

  // Save original authenticateRequest and users.getUser
  const originalAuthenticateRequest = clerkClient.authenticateRequest;
  const originalGetUser = clerkClient.users.getUser;

  try {
    // ──────────────────────────────────────────────────────────────────────────
    // PART 1: Authenticated NON-ADMIN User -> MUST receive HTTP 403 Forbidden
    // ──────────────────────────────────────────────────────────────────────────
    console.log('--- PART 1: Non-Admin Authenticated User -> Expecting HTTP 403 Forbidden ---');

    clerkClient.authenticateRequest = async () => {
      return {
        isAuthenticated: true,
        toAuth: () => ({
          userId: nonAdminClerkId,
          sessionClaims: {
            publicMetadata: { role: 'customer' },
          },
        }),
      } as any;
    };

    clerkClient.users.getUser = async () => {
      return {
        id: nonAdminClerkId,
        publicMetadata: { role: 'customer' },
        privateMetadata: {},
        emailAddresses: [{ emailAddress: 'customer.test@alongkar.com' }],
      } as any;
    };

    // 1. POST /api/products (Create)
    {
      const res = createMockRes();
      const req = {
        method: 'POST',
        url: '/api/products',
        body: {
          name: 'Hacked Product',
          slug: 'hacked-product',
          category: 'Rings',
          price: 100,
          originalPrice: 150,
          image: 'https://img.com/1.jpg',
          hoverImage: 'https://img.com/2.jpg',
          description: 'Hacked',
          finish: 'Gold',
          baseMaterial: 'Brass',
          warranty: '6 Months',
        },
      };
      await productsHandler(req, res);
      assert(
        res._getStatus() === 403,
        'POST /api/products returns 403 Forbidden for non-admin user',
        `Received ${res._getStatus()}: ${JSON.stringify(res._getData())}`
      );
    }

    // 2. PATCH / PUT /api/products (Update)
    {
      const res = createMockRes();
      const req = {
        method: 'PATCH',
        url: `/api/products?id=${testProduct.id}`,
        body: {
          price: 50,
        },
      };
      await productsHandler(req, res);
      assert(
        res._getStatus() === 403,
        'PATCH /api/products returns 403 Forbidden for non-admin user',
        `Received ${res._getStatus()}: ${JSON.stringify(res._getData())}`
      );
    }

    // 3. DELETE /api/products (Delete)
    {
      const res = createMockRes();
      const req = {
        method: 'DELETE',
        url: `/api/products?id=${testProduct.id}`,
      };
      await productsHandler(req, res);
      assert(
        res._getStatus() === 403,
        'DELETE /api/products returns 403 Forbidden for non-admin user',
        `Received ${res._getStatus()}: ${JSON.stringify(res._getData())}`
      );
    }

    // 4. GET /api/admin/jewellery-requests (List)
    {
      const res = createMockRes();
      const req = {
        method: 'GET',
        url: '/api/admin/jewellery-requests',
      };
      await adminJewelleryRequestsHandler(req, res);
      assert(
        res._getStatus() === 403,
        'GET /api/admin/jewellery-requests returns 403 Forbidden for non-admin user',
        `Received ${res._getStatus()}: ${JSON.stringify(res._getData())}`
      );
    }

    // 5. PATCH / PUT /api/admin/jewellery-requests (Status/Note Update)
    {
      const res = createMockRes();
      const req = {
        method: 'PATCH',
        url: `/api/admin/jewellery-requests?id=${testJewelleryRequest.id}`,
        body: {
          status: 'UNDER_REVIEW',
          adminNote: 'Hacked note',
        },
      };
      await adminJewelleryRequestsHandler(req, res);
      assert(
        res._getStatus() === 403,
        'PATCH /api/admin/jewellery-requests returns 403 Forbidden for non-admin user',
        `Received ${res._getStatus()}: ${JSON.stringify(res._getData())}`
      );
    }

    // 6. POST /api/uploads/product-image (Admin Image Upload)
    {
      const res = createMockRes();
      const req = {
        method: 'POST',
        url: '/api/uploads/product-image',
      };
      await productImageUploadHandler(req, res);
      assert(
        res._getStatus() === 403,
        'POST /api/uploads/product-image returns 403 Forbidden for non-admin user',
        `Received ${res._getStatus()}: ${JSON.stringify(res._getData())}`
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // PART 2: Legitimate ADMIN User -> MUST Succeed
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- PART 2: Legitimate Admin User -> Expecting Success ---');

    clerkClient.authenticateRequest = async () => {
      return {
        isAuthenticated: true,
        toAuth: () => ({
          userId: adminClerkId,
          sessionClaims: {
            publicMetadata: { role: 'admin' },
          },
        }),
      } as any;
    };

    clerkClient.users.getUser = async () => {
      return {
        id: adminClerkId,
        publicMetadata: { role: 'admin' },
        privateMetadata: {},
        emailAddresses: [{ emailAddress: 'admin.test@alongkar.com' }],
      } as any;
    };

    // 1. GET /api/admin/jewellery-requests (List as Admin)
    {
      const res = createMockRes();
      const req = {
        method: 'GET',
        url: '/api/admin/jewellery-requests',
      };
      await adminJewelleryRequestsHandler(req, res);
      assert(
        res._getStatus() === 200 && res._getData()?.success === true,
        'GET /api/admin/jewellery-requests succeeds with 200 OK for admin',
        `Status: ${res._getStatus()}`
      );
    }

    // 2. PATCH /api/admin/jewellery-requests (Update as Admin)
    {
      const res = createMockRes();
      const req = {
        method: 'PATCH',
        url: `/api/admin/jewellery-requests?id=${testJewelleryRequest.id}`,
        body: {
          status: 'UNDER_REVIEW',
          adminNote: 'Verified by Master Goldsmith',
        },
      };
      await adminJewelleryRequestsHandler(req, res);
      assert(
        res._getStatus() === 200 && res._getData()?.request?.status === 'UNDER_REVIEW',
        'PATCH /api/admin/jewellery-requests succeeds with 200 OK for admin',
        `Status: ${res._getStatus()}`
      );
    }

    // 3. POST /api/products (Create Product as Admin)
    const newAdminProductSlug = `admin-created-${Date.now()}`;
    let createdAdminProductId: string | null = null;
    {
      const res = createMockRes();
      const req = {
        method: 'POST',
        url: '/api/products',
        body: {
          name: 'Admin Created Choker',
          slug: newAdminProductSlug,
          category: 'Chokers',
          price: 4999,
          originalPrice: 5999,
          image: 'https://images.alongkar.com/choker.jpg',
          hoverImage: 'https://images.alongkar.com/choker-hover.jpg',
          description: 'Handcrafted royal choker',
          finish: '22K Gold Vermeil',
          baseMaterial: 'Silver',
          warranty: '1 Year',
        },
      };
      await productsHandler(req, res);
      const data = res._getData();
      createdAdminProductId = data?.product?.id;
      assert(
        res._getStatus() === 201 && data?.product?.slug === newAdminProductSlug,
        'POST /api/products succeeds with 201 Created for admin',
        `Status: ${res._getStatus()}`
      );
    }

    // 4. PATCH /api/products (Update Product as Admin)
    if (createdAdminProductId) {
      const res = createMockRes();
      const req = {
        method: 'PATCH',
        url: `/api/products?id=${createdAdminProductId}`,
        body: {
          price: 4499,
        },
      };
      await productsHandler(req, res);
      const data = res._getData();
      assert(
        res._getStatus() === 200 && data?.product?.price === 4499,
        'PATCH /api/products succeeds with 200 OK for admin',
        `Status: ${res._getStatus()}`
      );
    }

    // 5. DELETE /api/products (Delete Product as Admin)
    if (createdAdminProductId) {
      const res = createMockRes();
      const req = {
        method: 'DELETE',
        url: `/api/products?id=${createdAdminProductId}`,
      };
      await productsHandler(req, res);
      assert(
        res._getStatus() === 200,
        'DELETE /api/products succeeds with 200 OK for admin',
        `Status: ${res._getStatus()}`
      );
    }

  } finally {
    // Restore original Clerk SDK methods
    clerkClient.authenticateRequest = originalAuthenticateRequest;
    clerkClient.users.getUser = originalGetUser;

    // Clean up database test fixtures
    await prisma.product.deleteMany({
      where: { id: testProduct.id },
    });
    await (prisma as any).jewelleryRequest.deleteMany({
      where: { id: testJewelleryRequest.id },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminUser.id, nonAdminUser.id] } },
    });
  }

  console.log('\n====================================================');
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runAdminRoleVerificationTests()
  .catch((err) => {
    console.error('Test execution failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
