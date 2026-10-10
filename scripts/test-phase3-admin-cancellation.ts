import './testDbGuard.js';
import 'dotenv/config';
process.env.NODE_ENV = 'test';
import prisma from '../src/lib/prisma.js';
import { cancelAdminOrderWorkflow } from '../api/_utils/orderCancellation.js';
import { deductOrderInventoryTx, getOrderInventoryMovementsTx, calculateOrderInventoryLedger } from '../api/_utils/inventory.js';
import adminOrdersHandler from '../api/admin/orders.js';

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`✅ [PASS] ${message}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${message}`);
    failed++;
  }
}

async function run() {
  console.log('====================================================================');
  console.log('PHASE 3-I TEST SUITE: Admin Order Cancellation & Inventory Restoration');
  console.log('====================================================================\n');

  const timestamp = Date.now();
  const testUser = await prisma.user.create({
    data: {
      clerkUserId: `user_p3i_${timestamp}`,
      email: `test_p3i_${timestamp}@example.com`,
    },
  });

  const testProduct1 = await prisma.product.create({
    data: {
      name: `Gold Ring P3I ${timestamp}`,
      slug: `gold-ring-p3i-${timestamp}`,
      category: 'Rings',
      price: 5000,
      originalPrice: 6000,
      availableStock: 20,
      inStock: true,
      image: '/images/test-p3i-1.jpg',
      hoverImage: '/images/test-p3i-1h.jpg',
      description: 'Test product for Phase 3-I cancellation tests',
      finish: 'High Polish',
      baseMaterial: '18k Gold',
      warranty: 'Lifetime',
    },
  });

  const testProduct2 = await prisma.product.create({
    data: {
      name: `Diamond Pendant P3I ${timestamp}`,
      slug: `diamond-pendant-p3i-${timestamp}`,
      category: 'Pendants',
      price: 15000,
      originalPrice: 18000,
      availableStock: 10,
      inStock: true,
      image: '/images/test-p3i-2.jpg',
      hoverImage: '/images/test-p3i-2h.jpg',
      description: 'Test product 2 for Phase 3-I cancellation tests',
      finish: 'High Polish',
      baseMaterial: 'Platinum',
      warranty: 'Lifetime',
    },
  });

  try {
    // ─── 1. COD Order: Cancellation & Inventory Restoration (No Refund) ───────
    console.log('--- 1. COD Order: Cancellation & Inventory Restoration (No Refund) ---');
    const codOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-COD-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        shippingStatus: 'NOT_READY',
        subtotal: 10000,
        grandTotal: 10000,
        customerName: 'Aarav Sharma',
        customerEmail: 'aarav@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: '123 Park Street',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700016',
        paymentProvider: 'COD',
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productSlug: testProduct1.slug,
              productImage: testProduct1.image,
              quantity: 2,
              unitPrice: 5000,
              lineTotal: 10000,
            },
          ],
        },
      },
      include: { items: true },
    });

    // Deduct stock conditionally and write durable ledger movement
    await prisma.$transaction(async (tx: any) => {
      const ded = await deductOrderInventoryTx(tx, [{ productId: testProduct1.id, quantity: 2 }], {
        orderId: codOrder.id,
        reason: 'cod_order_placed',
      });
      assert(ded.success, 'COD stock deduction succeeded');
    });

    const stockAfterDeduct = await prisma.product.findUnique({
      where: { id: testProduct1.id },
    });
    assert(stockAfterDeduct?.availableStock === 18, 'Product 1 availableStock decremented to 18');

    // Cancel COD order via workflow
    const cancelCodResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: codOrder.id,
      cancelReason: 'Customer requested cancellation before dispatch',
      adminClerkUserId: 'admin_test_p3i',
      customPrismaClient: prisma,
    });

    assert(cancelCodResult.success === true, 'COD cancellation returned success');
    assert(cancelCodResult.inventoryRestored === true, 'COD cancellation restored inventory');
    assert(cancelCodResult.refundStatus === 'NOT_APPLICABLE', 'COD cancellation does not trigger refund');
    assert(cancelCodResult.order?.status === 'CANCELLED', 'Order status transitioned to CANCELLED');
    assert(cancelCodResult.order?.paymentStatus === 'CANCELLED', 'COD paymentStatus transitioned to CANCELLED');
    assert(cancelCodResult.order?.shippingStatus === 'CANCELLED', 'ShippingStatus transitioned to CANCELLED');

    const stockAfterCancel = await prisma.product.findUnique({
      where: { id: testProduct1.id },
    });
    assert(stockAfterCancel?.availableStock === 20, 'Product 1 availableStock restored back to 20');

    const codMovements = await getOrderInventoryMovementsTx(prisma, codOrder.id);
    const codLedger = calculateOrderInventoryLedger(codMovements);
    assert(codLedger.isFullyRestored === true, 'COD order ledger confirms isFullyRestored = true');
    assert(codLedger.totalDeducted === 2 && codLedger.totalRestored === 2, 'Ledger matches: 2 deducted, 2 restored');

    // ─── 2. Prepaid Razorpay Order: Cancellation & Automatic Refund ───────────
    console.log('\n--- 2. Prepaid Razorpay Order: Cancellation & Automatic Refund ---');
    const prepaidOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-RZP-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 15000,
        grandTotal: 15000,
        customerName: 'Priya Sen',
        customerEmail: 'priya@example.com',
        customerPhone: '+919876543211',
        shippingAddressLine1: '456 Salt Lake',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700064',
        paymentProvider: 'RAZORPAY',
        paymentTransactionId: `pay_p3i_${timestamp}`,
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: testProduct2.id,
              productName: testProduct2.name,
              productSlug: testProduct2.slug,
              productImage: testProduct2.image,
              quantity: 1,
              unitPrice: 15000,
              lineTotal: 15000,
            },
          ],
        },
      },
      include: { items: true },
    });

    await prisma.$transaction(async (tx: any) => {
      await deductOrderInventoryTx(tx, [{ productId: testProduct2.id, quantity: 1 }], {
        orderId: prepaidOrder.id,
        reason: 'payment_confirmed',
      });
    });

    const stockP2AfterDeduct = await prisma.product.findUnique({
      where: { id: testProduct2.id },
    });
    assert(stockP2AfterDeduct?.availableStock === 9, 'Product 2 availableStock decremented to 9');

    // Mock Razorpay client for refund
    let mockRefundCalled = false;
    let mockRefundArgs: any = null;
    const mockRazorpayClient = {
      payments: {
        refund: async (paymentId: string, args: any) => {
          mockRefundCalled = true;
          mockRefundArgs = { paymentId, ...args };
          return {
            id: `rfnd_mock_${timestamp}`,
            entity: 'refund',
            amount: args.amount,
            currency: 'INR',
            payment_id: paymentId,
            status: 'processed',
          };
        },
      },
    };

    const cancelPrepaidResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: prepaidOrder.id,
      cancelReason: 'Customer changed mind',
      adminClerkUserId: 'admin_test_p3i',
      customPrismaClient: prisma,
      customRazorpayClient: mockRazorpayClient,
    });

    assert(cancelPrepaidResult.success === true, 'Prepaid cancellation succeeded');
    assert(cancelPrepaidResult.inventoryRestored === true, 'Prepaid cancellation restored inventory');
    assert(cancelPrepaidResult.refundStatus === 'REFUNDED', 'Refund status is REFUNDED');
    assert(cancelPrepaidResult.refundId === `rfnd_mock_${timestamp}`, 'Refund ID is captured');
    assert(mockRefundCalled === true, 'Razorpay payments.refund was called');
    assert(mockRefundArgs.paymentId === `pay_p3i_${timestamp}`, 'Refund passed correct paymentId');
    assert(mockRefundArgs.amount === 1500000, 'Refund passed amount in paise (15000 * 100)');

    const stockP2AfterCancel = await prisma.product.findUnique({
      where: { id: testProduct2.id },
    });
    assert(stockP2AfterCancel?.availableStock === 10, 'Product 2 availableStock restored back to 10');

    const freshPrepaidOrder = await prisma.order.findUnique({
      where: { id: prepaidOrder.id },
    });
    assert(freshPrepaidOrder?.status === 'CANCELLED', 'Order status is CANCELLED');
    assert(freshPrepaidOrder?.paymentStatus === 'REFUNDED', 'Payment status is REFUNDED');
    assert(freshPrepaidOrder?.adminNotes?.includes(`rfnd_mock_${timestamp}`), 'Admin notes contains refund ID');

    // ─── 3. Prepaid Razorpay Refund Failure & Recovery ────────────────────────
    console.log('\n--- 3. Prepaid Razorpay Refund Failure & Recovery ---');
    const failRefundOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-FAIL-RFND-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Debanjan Das',
        customerEmail: 'debanjan@example.com',
        customerPhone: '+919876543212',
        shippingAddressLine1: '789 Ballygunge',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700019',
        paymentProvider: 'RAZORPAY',
        paymentTransactionId: `pay_fail_${timestamp}`,
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productSlug: testProduct1.slug,
              productImage: testProduct1.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    await prisma.$transaction(async (tx: any) => {
      await deductOrderInventoryTx(tx, [{ productId: testProduct1.id, quantity: 1 }], {
        orderId: failRefundOrder.id,
        reason: 'payment_confirmed',
      });
    });

    const mockFailingRazorpayClient = {
      payments: {
        refund: async () => {
          throw new Error('GATEWAY_TIMEOUT: Razorpay refund API timed out');
        },
      },
    };

    const cancelFailRefundResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: failRefundOrder.id,
      cancelReason: 'Customer requested cancellation',
      adminClerkUserId: 'admin_test_p3i',
      customPrismaClient: prisma,
      customRazorpayClient: mockFailingRazorpayClient,
    });

    assert(cancelFailRefundResult.success === true, 'Cancellation returned success even when refund timed out');
    assert(cancelFailRefundResult.inventoryRestored === true, 'Inventory was restored despite refund failure');
    assert(cancelFailRefundResult.refundStatus === 'REFUND_FAILED', 'Refund status is REFUND_FAILED');

    const freshFailOrder = await prisma.order.findUnique({
      where: { id: failRefundOrder.id },
    });
    assert(freshFailOrder?.status === 'CANCELLED', 'Order status is CANCELLED');
    assert(freshFailOrder?.paymentStatus === 'PAID', 'Payment status remains PAID (recoverable state)');
    assert(freshFailOrder?.paymentFailureReason?.includes('GATEWAY_TIMEOUT'), 'paymentFailureReason recorded gateway error');

    // ─── 4. Duplicate and Replay Cancellation Protection ─────────────────────
    console.log('\n--- 4. Duplicate and Replay Cancellation Protection ---');
    const repeatCancelResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: codOrder.id,
      cancelReason: 'Attempt duplicate cancel',
      adminClerkUserId: 'admin_test_p3i',
      customPrismaClient: prisma,
    });

    assert(repeatCancelResult.success === false, 'Duplicate cancellation rejected');
    assert(repeatCancelResult.error === 'ALREADY_CANCELLED', 'Error is ALREADY_CANCELLED');

    const stockAfterRepeat = await prisma.product.findUnique({
      where: { id: testProduct1.id },
    });
    assert(stockAfterRepeat?.availableStock === 20, 'Stock was NOT duplicated on repeat cancellation');

    // ─── 5. Concurrent Cancellation Race Condition Test ──────────────────────
    console.log('\n--- 5. Concurrent Cancellation Race Condition Test ---');
    const raceOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-RACE-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        shippingStatus: 'NOT_READY',
        subtotal: 10000,
        grandTotal: 10000,
        customerName: 'Race Test',
        customerEmail: 'race@example.com',
        customerPhone: '+919876543213',
        shippingAddressLine1: 'Race St',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'COD',
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productSlug: testProduct1.slug,
              productImage: testProduct1.image,
              quantity: 3,
              unitPrice: 5000,
              lineTotal: 15000,
            },
          ],
        },
      },
    });

    await prisma.$transaction(async (tx: any) => {
      await deductOrderInventoryTx(tx, [{ productId: testProduct1.id, quantity: 3 }], {
        orderId: raceOrder.id,
        reason: 'cod_order_placed',
      });
    });

    const stockBeforeRace = (await prisma.product.findUnique({ where: { id: testProduct1.id } }))?.availableStock || 0;

    // Run 2 simultaneous cancellation attempts
    const [res1, res2] = await Promise.all([
      cancelAdminOrderWorkflow({
        orderIdOrNumber: raceOrder.id,
        cancelReason: 'Concurrent Worker 1',
        adminClerkUserId: 'admin_1',
        customPrismaClient: prisma,
      }),
      cancelAdminOrderWorkflow({
        orderIdOrNumber: raceOrder.id,
        cancelReason: 'Concurrent Worker 2',
        adminClerkUserId: 'admin_2',
        customPrismaClient: prisma,
      }),
    ]);

    const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
    assert(successCount === 1, 'Exactly 1 concurrent cancellation worker succeeded');

    const stockAfterRace = (await prisma.product.findUnique({ where: { id: testProduct1.id } }))?.availableStock || 0;
    assert(stockAfterRace === stockBeforeRace + 3, 'Stock incremented by exactly +3 once under concurrency');

    // ─── 6. Rejection of Ineligible Non-Cancellable Orders ───────────────────
    console.log('\n--- 6. Rejection of Ineligible Non-Cancellable Orders ---');
    // Delivered order
    const deliveredOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-DELV-${timestamp}`,
        userId: testUser.id,
        status: 'DELIVERED',
        paymentStatus: 'PAID',
        shippingStatus: 'DELIVERED',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Delivered User',
        customerEmail: 'delv@example.com',
        customerPhone: '+919876543214',
        shippingAddressLine1: 'Delivered St',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'COD',
      },
    });

    const cancelDeliveredResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: deliveredOrder.id,
      customPrismaClient: prisma,
    });
    assert(cancelDeliveredResult.success === false, 'Cancellation of DELIVERED order is rejected');
    assert(cancelDeliveredResult.error === 'CANNOT_CANCEL_DELIVERED', 'Error is CANNOT_CANCEL_DELIVERED');

    // Shipped order
    const shippedOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-SHIP-${timestamp}`,
        userId: testUser.id,
        status: 'SHIPPED',
        paymentStatus: 'PAID',
        shippingStatus: 'IN_TRANSIT',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Shipped User',
        customerEmail: 'ship@example.com',
        customerPhone: '+919876543215',
        shippingAddressLine1: 'Shipped St',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'COD',
      },
    });

    const cancelShippedResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: shippedOrder.id,
      customPrismaClient: prisma,
    });
    assert(cancelShippedResult.success === false, 'Cancellation of IN_TRANSIT order is rejected');
    assert(cancelShippedResult.error === 'CANNOT_CANCEL_SHIPPED', 'Error is CANNOT_CANCEL_SHIPPED');

    // ─── 7. Legacy Orders Without Deduction Records Safeguard ───────────────
    console.log('\n--- 7. Legacy Orders Without Deduction Records Safeguard ---');
    const legacyOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-LEGACY-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Legacy User',
        customerEmail: 'legacy@example.com',
        customerPhone: '+919876543216',
        shippingAddressLine1: 'Legacy St',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'COD',
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productSlug: testProduct1.slug,
              productImage: testProduct1.image,
              quantity: 5,
              unitPrice: 5000,
              lineTotal: 25000,
            },
          ],
        },
      },
    });

    const stockBeforeLegacy = (await prisma.product.findUnique({ where: { id: testProduct1.id } }))?.availableStock || 0;

    const cancelLegacyResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: legacyOrder.id,
      customPrismaClient: prisma,
    });

    assert(cancelLegacyResult.success === true, 'Legacy order cancellation succeeded');
    assert(cancelLegacyResult.inventoryRestored === false, 'Legacy order did NOT falsely restore unproven inventory');

    const stockAfterLegacy = (await prisma.product.findUnique({ where: { id: testProduct1.id } }))?.availableStock || 0;
    assert(stockAfterLegacy === stockBeforeLegacy, 'Product stock remained unchanged (zero phantom restock)');

    // ─── 8. Admin API Endpoint POST action: 'cancel_order' Authorization & Execution ──
    console.log('\n--- 8. Admin API Endpoint POST action: cancel_order ---');

    function createMockRes() {
      const res: any = {
        statusCode: 200,
        headers: {} as Record<string, string>,
        data: null as any,
        headersSent: false,
        setHeader(key: string, value: string) {
          this.headers[key.toLowerCase()] = value;
          return this;
        },
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        json(payload: any) {
          this.data = payload;
          this.headersSent = true;
          return this;
        },
        end(payload?: any) {
          if (payload && typeof payload === 'string') {
            try {
              this.data = JSON.parse(payload);
            } catch {
              this.data = payload;
            }
          }
          this.headersSent = true;
          return this;
        },
      };
      return res;
    }

    // 8.1 Unauthenticated request
    const unauthReq: any = {
      method: 'POST',
      url: '/api/admin/orders',
      body: {
        action: 'cancel_order',
        orderId: codOrder.id,
      },
      _testAdmin: {
        authorized: false,
        status: 401,
        error: 'Unauthorized: Valid authenticated session required',
      },
    };
    const unauthRes = createMockRes();
    await adminOrdersHandler(unauthReq, unauthRes);
    assert(unauthRes.statusCode === 401, 'Unauthenticated request receives HTTP 401');

    // 8.2 Non-admin customer request
    const nonAdminReq: any = {
      method: 'POST',
      url: '/api/admin/orders',
      body: {
        action: 'cancel_order',
        orderId: codOrder.id,
      },
      _testAdmin: {
        authorized: false,
        status: 403,
        error: 'Forbidden: Admin access required',
      },
    };
    const nonAdminRes = createMockRes();
    await adminOrdersHandler(nonAdminReq, nonAdminRes);
    assert(nonAdminRes.statusCode === 403, 'Non-admin customer request receives HTTP 403 Forbidden');

    // 8.3 Create a new test order for endpoint execution
    const endpointOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3I-API-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PENDING',
        shippingStatus: 'NOT_READY',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'API Cancel Test',
        customerEmail: 'api@example.com',
        customerPhone: '+919876543217',
        shippingAddressLine1: 'API Street',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'COD',
        items: {
          create: [
            {
              productId: testProduct1.id,
              productName: testProduct1.name,
              productSlug: testProduct1.slug,
              productImage: testProduct1.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    await prisma.$transaction(async (tx: any) => {
      await deductOrderInventoryTx(tx, [{ productId: testProduct1.id, quantity: 1 }], {
        orderId: endpointOrder.id,
        reason: 'cod_order_placed',
      });
    });

    // 8.4 Authorized Admin request to POST /api/admin/orders with action: 'cancel_order'
    const adminReq: any = {
      method: 'POST',
      url: '/api/admin/orders',
      body: {
        action: 'cancel_order',
        orderId: endpointOrder.id,
        cancelReason: 'Cancelled via Admin API endpoint',
      },
      _testAdmin: {
        authorized: true,
        status: 200,
        clerkUserId: 'admin_test_p3i',
        user: { id: 'admin_db_id' },
      },
    };
    const adminRes = createMockRes();
    await adminOrdersHandler(adminReq, adminRes);
    assert(adminRes.statusCode === 200, 'Authorized admin cancel request receives HTTP 200');
    assert(adminRes.data?.success === true, 'Response contains success: true');
    assert(adminRes.data?.order?.status === 'CANCELLED', 'Returned order has status CANCELLED');
    assert(adminRes.data?.inventoryRestored === true, 'Returned response confirms inventoryRestored: true');

  } finally {
    console.log('\n--- CLEANING UP TEST DATA ---');
    const cleanupErrors: string[] = [];
    try {
      await prisma.$transaction(async (tx: any) => {
        // Step 1: Inventory Movements
        await tx.inventoryMovement.deleteMany({
          where: { order: { userId: testUser.id } },
        });
        // Step 2: Order Items
        await tx.orderItem.deleteMany({
          where: { order: { userId: testUser.id } },
        });
        // Step 3: Orders
        await tx.order.deleteMany({
          where: { userId: testUser.id },
        });
        // Step 4: Products
        await tx.product.deleteMany({
          where: { id: { in: [testProduct1.id, testProduct2.id] } },
        });
        // Step 5: User
        await tx.user.deleteMany({
          where: { id: testUser.id },
        });
      });
      console.log('Cleanup completed successfully in transaction.');
    } catch (txErr: any) {
      cleanupErrors.push(`Transactional cleanup failed: ${txErr.message}`);
      console.warn('Transaction failed, attempting sequential fallback deletions...');

      try {
        await prisma.inventoryMovement.deleteMany({
          where: { order: { userId: testUser.id } },
        });
      } catch (e: any) {
        cleanupErrors.push(`InventoryMovement cleanup error: ${e.message}`);
      }
      try {
        await prisma.orderItem.deleteMany({
          where: { order: { userId: testUser.id } },
        });
      } catch (e: any) {
        cleanupErrors.push(`OrderItem cleanup error: ${e.message}`);
      }
      try {
        await prisma.order.deleteMany({
          where: { userId: testUser.id },
        });
      } catch (e: any) {
        cleanupErrors.push(`Order cleanup error: ${e.message}`);
      }
      try {
        await prisma.product.deleteMany({
          where: { id: { in: [testProduct1.id, testProduct2.id] } },
        });
      } catch (e: any) {
        cleanupErrors.push(`Product cleanup error: ${e.message}`);
      }
      try {
        await prisma.user.deleteMany({
          where: { id: testUser.id },
        });
      } catch (e: any) {
        cleanupErrors.push(`User cleanup error: ${e.message}`);
      }
    }

    if (cleanupErrors.length > 0) {
      console.error('\n⚠️ CLEANUP ENCOUNTERED ERRORS:');
      cleanupErrors.forEach(err => console.error(`  - ${err}`));
    }
  }

  console.log('\n====================================================================');
  console.log(`TEST RESULTS: ${passed}/${passed + failed} PASSED (${failed} FAILED)`);
  console.log('====================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((err) => {
  console.error('Test execution error:', err);
  process.exit(1);
});
