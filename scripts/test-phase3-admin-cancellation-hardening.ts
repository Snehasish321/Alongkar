import './testDbGuard.js';
import 'dotenv/config';
process.env.NODE_ENV = 'test';
import prisma from '../src/lib/prisma.js';
import {
  cancelAdminOrderWorkflow,
  retryAdminOrderRefundWorkflow,
} from '../api/_utils/orderCancellation.js';
import {
  deductOrderInventoryTx,
  getOrderInventoryMovementsTx,
  calculateOrderInventoryLedger,
} from '../api/_utils/inventory.js';
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
  console.log('PHASE 3-I-R1 TEST SUITE: Admin Cancellation & Refund Recovery Hardening');
  console.log('====================================================================\n');

  const timestamp = Date.now();
  const testUser = await prisma.user.create({
    data: {
      clerkUserId: `user_p3ir1_${timestamp}`,
      email: `test_p3ir1_${timestamp}@example.com`,
    },
  });

  const testProduct = await prisma.product.create({
    data: {
      name: `Hardened Gold Ring ${timestamp}`,
      slug: `hardened-gold-ring-${timestamp}`,
      category: 'Rings',
      price: 5000,
      originalPrice: 6000,
      availableStock: 25,
      inStock: true,
      image: '/images/test-ring.jpg',
      hoverImage: '/images/test-ring-h.jpg',
      description: 'Test product for Phase 3-I-R1 hardening tests',
      finish: 'High Polish',
      baseMaterial: '18k Gold',
      warranty: 'Lifetime',
    },
  });

  try {
    // ─── 1. Direct PATCH bypass prevention ─────────────────────────────────────
    console.log('--- 1. Direct PATCH Bypass Prevention ---');
    const orderForPatch = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3IR1-PATCH-${timestamp}`,
        userId: testUser.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Patch Test Customer',
        customerEmail: 'patch@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: '456 Test Way',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paymentTransactionId: `pay_patch_${timestamp}`,
        items: {
          create: [
            {
              productId: testProduct.id,
              productName: testProduct.name,
              productSlug: testProduct.slug,
              productImage: testProduct.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    // Helper for adminOrdersHandler mock invocation
    const invokeAdminOrders = async (method: string, body: any, testAdminOverride?: any) => {
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

      const req: any = {
        method,
        url: '/api/admin/orders',
        headers: {},
        body,
        query: {},
        _testAdmin: testAdminOverride !== undefined ? testAdminOverride : {
          authorized: true,
          status: 200,
          clerkUserId: 'admin_test_p3ir1',
          user: { id: 'admin_db_id' },
        },
      };

      await adminOrdersHandler(req, res);
      return { status: res.statusCode, body: res.data };
    };

    // Test: Directly setting shippingStatus to CANCELLED via PATCH is blocked
    const directShippingPatch = await invokeAdminOrders('PATCH', {
      orderId: orderForPatch.id,
      shippingStatus: 'CANCELLED',
    });
    assert(directShippingPatch.status === 400, 'Direct PATCH with shippingStatus: "CANCELLED" returns HTTP 400');
    assert(
      directShippingPatch.body?.code === 'DIRECT_SHIPPING_CANCELLATION_DISALLOWED',
      'Direct shipping cancellation error code matches DIRECT_SHIPPING_CANCELLATION_DISALLOWED'
    );

    // Test: Directly setting paymentStatus to CANCELLED via PATCH is blocked
    const directPaymentPatch = await invokeAdminOrders('PATCH', {
      orderId: orderForPatch.id,
      paymentStatus: 'CANCELLED',
    });
    assert(directPaymentPatch.status === 400, 'Direct PATCH with paymentStatus: "CANCELLED" returns HTTP 400');
    assert(
      directPaymentPatch.body?.code === 'DIRECT_PAYMENT_CANCELLATION_DISALLOWED',
      'Direct payment cancellation error code matches DIRECT_PAYMENT_CANCELLATION_DISALLOWED'
    );

    // Test: Directly setting paymentStatus to REFUNDED via PATCH is blocked
    const directRefundPatch = await invokeAdminOrders('PATCH', {
      orderId: orderForPatch.id,
      paymentStatus: 'REFUNDED',
    });
    assert(directRefundPatch.status === 400, 'Direct PATCH with paymentStatus: "REFUNDED" returns HTTP 400');
    assert(
      directRefundPatch.body?.code === 'DIRECT_REFUND_DISALLOWED',
      'Direct payment refund error code matches DIRECT_REFUND_DISALLOWED'
    );

    // Verify order in database remained untouched by rejected bypasses
    const freshOrderAfterPatchAttempts = await prisma.order.findUnique({
      where: { id: orderForPatch.id },
    });
    assert(freshOrderAfterPatchAttempts?.status === 'CONFIRMED', 'Order status remained CONFIRMED after rejected bypass attempts');
    assert(freshOrderAfterPatchAttempts?.paymentStatus === 'PAID', 'Payment status remained PAID after rejected bypass attempts');
    assert(freshOrderAfterPatchAttempts?.shippingStatus === 'READY', 'Shipping status remained READY after rejected bypass attempts');

    // ─── 2. Shipped order cannot be transitioned to CANCELLED ─────────────────
    console.log('\n--- 2. Shipped Order Protection ---');
    const shippedOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3IR1-SHIPPED-${timestamp}`,
        userId: testUser.id,
        status: 'SHIPPED',
        paymentStatus: 'PAID',
        shippingStatus: 'SHIPPED',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Shipped Customer',
        customerEmail: 'shipped@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: '789 Shipping Way',
        shippingCity: 'Mumbai',
        shippingState: 'Maharashtra',
        shippingPincode: '400001',
        paymentProvider: 'RAZORPAY',
        paymentTransactionId: `pay_shipped_${timestamp}`,
        items: {
          create: [
            {
              productId: testProduct.id,
              productName: testProduct.name,
              productSlug: testProduct.slug,
              productImage: testProduct.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    const shippedCancelAttempt = await invokeAdminOrders('PATCH', {
      orderId: shippedOrder.id,
      status: 'CANCELLED',
    });
    assert(shippedCancelAttempt.status === 400, 'Direct PATCH to cancel a SHIPPED order returns HTTP 400');
    assert(
      shippedCancelAttempt.body?.code === 'CANNOT_CANCEL_SHIPPED',
      'Error code correctly returns CANNOT_CANCEL_SHIPPED'
    );

    // ─── 3. Prepaid Order: Cancellation with Refund Timeout leaves recoverable state ───
    console.log('\n--- 3. Refund Timeout Leaves Recoverable State ---');
    // Deduct stock first to simulate confirmed order
    await prisma.$transaction(async (tx) => {
      await deductOrderInventoryTx(tx, [{ productId: testProduct.id, quantity: 2 }], {
        orderId: orderForPatch.id,
        reason: 'order_confirmed',
      });
    });

    const stockBeforeCancel = (await prisma.product.findUnique({ where: { id: testProduct.id } }))?.availableStock || 0;

    // Custom mock Razorpay client that throws timeout error
    const timingOutRazorpayClient = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async () => {
          throw new Error('Razorpay gateway timeout after 15000ms');
        },
      },
    };

    const cancelWithTimeoutResult = await cancelAdminOrderWorkflow({
      orderIdOrNumber: orderForPatch.id,
      cancelReason: 'Customer requested cancellation before dispatch',
      adminClerkUserId: 'admin_test_p3ir1',
      customRazorpayClient: timingOutRazorpayClient,
    });

    assert(cancelWithTimeoutResult.success === true, 'Order cancellation returns success: true even if external refund timed out');
    assert(cancelWithTimeoutResult.refundStatus === 'REFUND_FAILED', 'Refund status is flagged as REFUND_FAILED');
    assert(cancelWithTimeoutResult.inventoryRestored === true, 'Inventory was successfully restored atomically');

    const stockAfterCancel = (await prisma.product.findUnique({ where: { id: testProduct.id } }))?.availableStock || 0;
    assert(stockAfterCancel === stockBeforeCancel + 2, 'Available stock restored exactly 2 pcs');

    const orderInDb = await prisma.order.findUnique({ where: { id: orderForPatch.id } });
    assert(orderInDb?.status === 'CANCELLED', 'Order status is CANCELLED');
    assert(orderInDb?.shippingStatus === 'CANCELLED', 'Shipping status is CANCELLED');
    assert(orderInDb?.paymentStatus === 'PAID', 'Payment status remains PAID (ready for retry/recovery)');
    assert(
      (orderInDb?.paymentFailureReason || '').includes('timeout'),
      'paymentFailureReason contains diagnostic timeout information'
    );

    // ─── 4. Refund Retry after cancellation: Safe & Does NOT touch inventory ──
    console.log('\n--- 4. Refund Retry on Cancelled Order (Zero Inventory Re-Restoration) ---');
    let refundApiCallCount = 0;
    const successfulRazorpayClient = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async (payId: string, params: any) => {
          refundApiCallCount++;
          return {
            id: `rfnd_success_${timestamp}`,
            payment_id: payId,
            amount: params.amount,
            status: 'processed',
            receipt: params.receipt,
          };
        },
      },
    };

    const stockBeforeRetry = (await prisma.product.findUnique({ where: { id: testProduct.id } }))?.availableStock || 0;

    // Call retryAdminOrderRefundWorkflow
    const retryResult = await retryAdminOrderRefundWorkflow({
      orderIdOrNumber: orderForPatch.id,
      adminClerkUserId: 'admin_test_p3ir1',
      customRazorpayClient: successfulRazorpayClient,
    });

    assert(retryResult.success === true, 'Refund retry succeeds with success: true');
    assert(retryResult.refundStatus === 'REFUNDED', 'Refund status updated to REFUNDED');
    assert(retryResult.refundId === `rfnd_success_${timestamp}`, 'Refund ID captured accurately');
    assert(refundApiCallCount === 1, 'External Razorpay refund API was invoked exactly once');

    // CRITICAL: Stock check
    const stockAfterRetry = (await prisma.product.findUnique({ where: { id: testProduct.id } }))?.availableStock || 0;
    assert(stockAfterRetry === stockBeforeRetry, 'Product stock is completely unchanged during refund retry');

    // Ledger check: exactly one RESTORATION_CANCELLATION movement exists for this order
    const movements = await prisma.inventoryMovement.findMany({
      where: { orderId: orderForPatch.id, type: 'RESTORATION_CANCELLATION' },
    });
    assert(movements.length === 1, 'Exactly 1 RESTORATION_CANCELLATION movement exists (no duplicate ledger entries)');

    const orderAfterRefund = await prisma.order.findUnique({ where: { id: orderForPatch.id } });
    assert(orderAfterRefund?.paymentStatus === 'REFUNDED', 'Order paymentStatus in DB is now REFUNDED');
    assert(orderAfterRefund?.paymentFailureReason === null, 'paymentFailureReason was cleared on success');

    // ─── 5. Idempotent Retry: Already REFUNDED order does not call gateway again ──
    console.log('\n--- 5. Idempotent Retry on Already-Refunded Order ---');
    let secondRefundCallCount = 0;
    const shouldNotBeCalledRazorpay = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async () => {
          secondRefundCallCount++;
          return {};
        },
      },
    };

    const idempotentRetryResult = await retryAdminOrderRefundWorkflow({
      orderIdOrNumber: orderForPatch.id,
      adminClerkUserId: 'admin_test_p3ir1',
      customRazorpayClient: shouldNotBeCalledRazorpay,
    });

    assert(idempotentRetryResult.success === true, 'Retry on already-refunded order returns success: true');
    assert(idempotentRetryResult.refundStatus === 'ALREADY_REFUNDED', 'refundStatus indicates ALREADY_REFUNDED');
    assert(secondRefundCallCount === 0, 'Razorpay payments.refund was NOT called again');

    // ─── 6. Ambiguous Provider Response: Gateway Pre-Check avoids double refund ─
    console.log('\n--- 6. Ambiguous Provider Response (Gateway Pre-Check Protection) ---');
    // Create an order simulating a case where the previous refund call timed out from client perspective,
    // but Razorpay actually processed it!
    const ambiguousOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3IR1-AMBIG-${timestamp}`,
        userId: testUser.id,
        status: 'CANCELLED',
        paymentStatus: 'PAID',
        shippingStatus: 'CANCELLED',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'Ambiguous Customer',
        customerEmail: 'ambig@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: '999 Gateway St',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paymentTransactionId: `pay_ambig_${timestamp}`,
        paymentFailureReason: 'Refund failed: Gateway timed out',
        items: {
          create: [
            {
              productId: testProduct.id,
              productName: testProduct.name,
              productSlug: testProduct.slug,
              productImage: testProduct.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    let newRefundCallCount = 0;
    const existingRefundAtGateway = {
      id: `rfnd_already_there_${timestamp}`,
      payment_id: `pay_ambig_${timestamp}`,
      amount: 500000, // 5000 * 100 paise
      status: 'processed',
      receipt: `ref_ORD-P3IR1-AMBIG-${timestamp}`,
    };

    const razorpayWithPreexistingRefund = {
      payments: {
        fetchMultipleRefund: async () => ({
          items: [existingRefundAtGateway],
        }),
        refund: async () => {
          newRefundCallCount++;
          return { id: `rfnd_duplicate_${timestamp}` };
        },
      },
    };

    const ambiguousRetryResult = await retryAdminOrderRefundWorkflow({
      orderIdOrNumber: ambiguousOrder.id,
      adminClerkUserId: 'admin_test_p3ir1',
      customRazorpayClient: razorpayWithPreexistingRefund,
    });

    assert(ambiguousRetryResult.success === true, 'Ambiguous retry successfully completed');
    assert(ambiguousRetryResult.refundStatus === 'REFUNDED', 'Refund status is REFUNDED');
    assert(
      ambiguousRetryResult.refundId === `rfnd_already_there_${timestamp}`,
      'Captured pre-existing gateway refund ID'
    );
    assert(newRefundCallCount === 0, 'Did NOT issue a duplicate refund call to Razorpay');

    const ambiguousOrderDb = await prisma.order.findUnique({ where: { id: ambiguousOrder.id } });
    assert(ambiguousOrderDb?.paymentStatus === 'REFUNDED', 'Ambiguous order paymentStatus in DB transitioned to REFUNDED');
    assert(ambiguousOrderDb?.paymentFailureReason === null, 'paymentFailureReason was cleared');

    // ─── 7. Admin Orders POST API Endpoint: action: "retry_refund" ────────────
    console.log('\n--- 7. Admin Orders POST action: "retry_refund" Endpoint ---');
    const endpointOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3IR1-API-${timestamp}`,
        userId: testUser.id,
        status: 'CANCELLED',
        paymentStatus: 'PAID',
        shippingStatus: 'CANCELLED',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'API Refund Customer',
        customerEmail: 'api_refund@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: '321 API Ave',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paymentTransactionId: `pay_api_${timestamp}`,
        items: {
          create: [
            {
              productId: testProduct.id,
              productName: testProduct.name,
              productSlug: testProduct.slug,
              productImage: testProduct.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    // Unauthorized call (no admin role)
    const unauthorizedResponse = await invokeAdminOrders(
      'POST',
      { action: 'retry_refund', orderId: endpointOrder.id },
      {
        authorized: false,
        status: 403,
        error: 'Forbidden: Admin access required',
      }
    );
    assert(unauthorizedResponse.status === 403, 'Unauthorized non-admin request to retry_refund returns HTTP 403');

    // Authorized call
    const authorizedResponse = await invokeAdminOrders(
      'POST',
      { action: 'retry_refund', orderId: endpointOrder.id }
    );
    // Note: since test mode or mock razorpay is used without real live transaction,
    // it will either succeed with mock or return a safe error from gateway, but must not crash
    assert(
      authorizedResponse.status === 200 || authorizedResponse.status === 502,
      `Authorized retry_refund responded with expected status (${authorizedResponse.status})`
    );

    // ─── 8. COD Order: Retry Refund Rejected ──────────────────────────────────
    console.log('\n--- 8. COD Order: Retry Refund Rejected ---');
    const codOrderForRetry = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3IR1-COD-RETRY-${timestamp}`,
        userId: testUser.id,
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        shippingStatus: 'CANCELLED',
        subtotal: 5000,
        grandTotal: 5000,
        customerName: 'COD Retry Customer',
        customerEmail: 'cod_retry@example.com',
        customerPhone: '+919876543210',
        shippingAddressLine1: '555 COD St',
        shippingCity: 'Kolkata',
        shippingState: 'West Bengal',
        shippingPincode: '700001',
        paymentProvider: 'COD',
        items: {
          create: [
            {
              productId: testProduct.id,
              productName: testProduct.name,
              productSlug: testProduct.slug,
              productImage: testProduct.image,
              quantity: 1,
              unitPrice: 5000,
              lineTotal: 5000,
            },
          ],
        },
      },
    });

    const codRetryResult = await retryAdminOrderRefundWorkflow({
      orderIdOrNumber: codOrderForRetry.id,
      adminClerkUserId: 'admin_test_p3ir1',
    });
    assert(codRetryResult.success === false, 'COD order refund retry returns success: false');
    assert(codRetryResult.error === 'COD_NOT_REFUNDABLE', 'COD order returns error: COD_NOT_REFUNDABLE');

  } catch (err: any) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    // ─── Cleanup ──────────────────────────────────────────────────────────────
    console.log('\n--- Cleaning up test records ---');
    await prisma.inventoryMovement.deleteMany({
      where: {
        order: {
          userId: testUser.id,
        },
      },
    });
    await prisma.orderItem.deleteMany({
      where: {
        order: {
          userId: testUser.id,
        },
      },
    });
    await prisma.order.deleteMany({
      where: {
        userId: testUser.id,
      },
    });
    await prisma.product.delete({
      where: { id: testProduct.id },
    });
    await prisma.user.delete({
      where: { id: testUser.id },
    });
    console.log('Cleanup completed.');
  }

  console.log('\n====================================================================');
  console.log(`PHASE 3-I-R1 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch((e) => {
  console.error('Fatal test runner error:', e);
  process.exit(1);
});
