import './testDbGuard.js';
import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../src/lib/prisma.js';
import {
  aggregateOrderItems,
  checkLiveStockAvailability,
  deductOrderInventoryTx,
  invalidateDeductedProductsCache,
} from '../api/_utils/inventory.js';
import ordersHandler from '../api/orders.js';
import {
  handleVerifyPayment as razorpayVerifyHandler,
  handleWebhook as razorpayWebhookHandler,
  handleReconcilePayment as razorpayReconcileHandler,
  handleCreatePaymentOrder as razorpayOrderHandler,
} from '../api/payments/razorpay.js';
import { transitionOrderToPaid, rupeesToPaise } from '../api/_utils/razorpay.js';
import { cacheGet, cacheSet, CacheKey } from '../api/_utils/cache.js';
import { Prisma } from '@prisma/client';

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${message}`);
  } else {
    failedTests++;
    console.error(`❌ [FAIL] ${message}`);
  }
}

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

function generateCheckoutSignature(orderId: string, paymentId: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(`${orderId}|${paymentId}`)
    .digest('hex');
}

function generateWebhookSignature(body: string, secret: string): string {
  return crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');
}

async function runPhase2Tests() {
  process.env.NODE_ENV = 'test';
  const testKeyId = 'rzp_test_alongkar_phase2';
  const testKeySecret = 'secret_alongkar_phase2_key_123456';
  const testWebhookSecret = 'webhook_secret_alongkar_phase2_789012';

  process.env.RAZORPAY_KEY_ID = testKeyId;
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

  console.log('====================================================================');
  console.log('PHASE 2: ATOMIC INVENTORY DEDUCTION & ORDER CONFIRMATION TESTS');
  console.log('====================================================================\n');

  const ts = Date.now();
  const createdProductIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdOrderIds: string[] = [];

  try {
    // ─── 1. Unit Validation & Aggregation Tests ──────────────────────────────
    console.log('--- 1. Unit Validation & Aggregation Tests ---');

    // 1.1 Non-array / empty items
    assert(aggregateOrderItems([] as any).success === false, 'Empty items array is rejected');
    assert(aggregateOrderItems(null as any).success === false, 'Null items parameter is rejected');

    // 1.2 Invalid quantities (negative, zero, fractional, NaN, string, out of bounds)
    assert(aggregateOrderItems([{ productId: 'prod_1', quantity: -1 }]).success === false, 'Negative quantity is rejected');
    assert(aggregateOrderItems([{ productId: 'prod_1', quantity: 0 }]).success === false, 'Zero quantity is rejected');
    assert(aggregateOrderItems([{ productId: 'prod_1', quantity: 1.5 }]).success === false, 'Fractional quantity is rejected');
    assert(aggregateOrderItems([{ productId: 'prod_1', quantity: NaN }]).success === false, 'NaN quantity is rejected');
    assert(aggregateOrderItems([{ productId: 'prod_1', quantity: '2' as any }]).success === false, 'String quantity is rejected');
    assert(aggregateOrderItems([{ productId: 'prod_1', quantity: 100 }]).success === false, 'Quantity > 99 is rejected');

    // 1.3 Invalid product IDs
    assert(aggregateOrderItems([{ productId: '', quantity: 1 }]).success === false, 'Empty product ID is rejected');
    assert(aggregateOrderItems([{ productId: 'invalid id with spaces!!', quantity: 1 }]).success === false, 'Malformed product ID is rejected');

    // 1.4 Valid aggregation of duplicate lines
    const aggResult = aggregateOrderItems([
      { productId: 'prod_a', quantity: 2 },
      { productId: 'prod_b', quantity: 1 },
      { productId: 'prod_a', quantity: 3 },
    ]);
    assert(aggResult.success === true, 'Valid duplicate lines aggregated successfully');
    assert(aggResult.aggregated?.length === 2, 'Result contains 2 distinct aggregated products');
    const itemA = aggResult.aggregated?.find((x) => x.productId === 'prod_a');
    const itemB = aggResult.aggregated?.find((x) => x.productId === 'prod_b');
    assert(itemA?.quantity === 5, 'Duplicate prod_a lines summed to quantity 5 (2 + 3)');
    assert(itemB?.quantity === 1, 'Single prod_b line preserved quantity 1');

    // ─── 2. Seed Test Products & Users ───────────────────────────────────────
    console.log('\n--- 2. Seeding Test Products & Users in PostgreSQL ---');

    const createProduct = async (name: string, initialStock: number, price: number = 1999) => {
      const p = await prisma.product.create({
        data: {
          name: `${name} ${ts}`,
          slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${ts}-${Math.random().toString(36).substring(2, 6)}`,
          category: 'Earrings',
          price,
          originalPrice: price + 500,
          discountPercent: 20,
          description: 'Phase 2 inventory test product',
          finish: 'Gold Polish',
          baseMaterial: 'Brass',
          warranty: '6 Months',
          availableStock: initialStock,
          inStock: initialStock > 0,
          image: 'https://example.com/test.jpg',
          hoverImage: 'https://example.com/test-h.jpg',
        },
      });
      createdProductIds.push(p.id);
      return p;
    };

    const createUser = async (label: string) => {
      const u = await prisma.user.create({
        data: {
          clerkUserId: `clerk_p2_${label}_${ts}_${Math.random().toString(36).substring(2, 6)}`,
          email: `${label}_${ts}@alongkar.test`,
        },
      });
      createdUserIds.push(u.id);
      return u;
    };

    const prodSingle = await createProduct('Jhumka Set Single', 1);
    const prodMulti = await createProduct('Jhumka Set Multi', 5);
    const prodZero = await createProduct('Jhumka Set Zero', 0);
    const prodRollbackA = await createProduct('Rollback Prod A', 5);
    const prodRollbackB = await createProduct('Rollback Prod B', 1);

    const userCustomerA = await createUser('custA');
    const userCustomerB = await createUser('custB');
    const userCustomerC = await createUser('custC');

    assert(prodSingle.id && prodMulti.id && prodZero.id, 'Test products created in PostgreSQL');

    // ─── 3. Atomic Database Deduction Transaction Helper Tests ───────────────
    console.log('\n--- 3. Atomic Database Deduction Transaction Helper Tests ---');

    // 3.1 availableStock 0 cannot satisfy quantity 1
    await prisma.$transaction(async (tx) => {
      const res = await deductOrderInventoryTx(tx, [{ productId: prodZero.id, quantity: 1 }]);
      assert(res.success === false, 'availableStock 0 cannot satisfy quantity 1');
      assert(res.conflictProductId === prodZero.id, 'Conflict product ID reported accurately');
    });

    const checkZeroStock = await prisma.product.findUnique({ where: { id: prodZero.id } });
    assert(checkZeroStock?.availableStock === 0, 'availableStock remains 0 after failed deduction');
    assert(checkZeroStock?.inStock === false, 'inStock remains false for zero stock product');

    // 3.2 availableStock 1 satisfies quantity 1 and becomes 0
    await prisma.$transaction(async (tx) => {
      const res = await deductOrderInventoryTx(tx, [{ productId: prodSingle.id, quantity: 1 }]);
      assert(res.success === true, 'availableStock 1 satisfies quantity 1');
    });

    const checkSingleStock = await prisma.product.findUnique({ where: { id: prodSingle.id } });
    assert(checkSingleStock?.availableStock === 0, 'availableStock 1 became exactly 0');
    assert(checkSingleStock?.inStock === false, 'inStock transitioned to false when stock reached 0');

    // 3.3 availableStock 5 satisfies quantity 3 and becomes 2
    await prisma.$transaction(async (tx) => {
      const res = await deductOrderInventoryTx(tx, [{ productId: prodMulti.id, quantity: 3 }]);
      assert(res.success === true, 'availableStock 5 satisfies quantity 3');
    });

    const checkMultiStock = await prisma.product.findUnique({ where: { id: prodMulti.id } });
    assert(checkMultiStock?.availableStock === 2, 'availableStock 5 became exactly 2 (5 - 3)');
    assert(checkMultiStock?.inStock === true, 'inStock remains true when availableStock > 0');

    // 3.4 Requesting more than available stock fails
    await prisma.$transaction(async (tx) => {
      const res = await deductOrderInventoryTx(tx, [{ productId: prodMulti.id, quantity: 5 }]); // available is 2
      assert(res.success === false, 'Requesting quantity 5 when available is 2 fails');
    });

    const checkMultiStockUnchanged = await prisma.product.findUnique({ where: { id: prodMulti.id } });
    assert(checkMultiStockUnchanged?.availableStock === 2, 'availableStock remains unchanged at 2 after failed attempt');

    // 3.5 Multi-product transaction rolls back all items when one product fails
    try {
      await prisma.$transaction(async (tx) => {
        // Attempt to deduct: Prod A qty 2 (avail: 5) and Prod B qty 2 (avail: 1 - should fail!)
        const resA = await deductOrderInventoryTx(tx, [
          { productId: prodRollbackA.id, quantity: 2 },
          { productId: prodRollbackB.id, quantity: 2 },
        ]);
        if (!resA.success) {
          throw new Error('ROLLBACK_TRIGGERED');
        }
      });
    } catch (e: any) {
      assert(e.message === 'ROLLBACK_TRIGGERED', 'Multi-item transaction caught rollback trigger');
    }

    const checkRollbackA = await prisma.product.findUnique({ where: { id: prodRollbackA.id } });
    const checkRollbackB = await prisma.product.findUnique({ where: { id: prodRollbackB.id } });
    assert(checkRollbackA?.availableStock === 5, 'Product A rolled back cleanly to stock 5');
    assert(checkRollbackB?.availableStock === 1, 'Product B rolled back cleanly to stock 1');

    // ─── 4. COD Order Creation & Atomic Inventory Deduction ──────────────────
    console.log('\n--- 4. COD Order Creation & Atomic Inventory Deduction ---');

    const prodCod = await createProduct('COD Jhumka Test', 10, 1500);

    // 4.1 Successful COD order confirmation for qty 2
    const codRes1 = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: userCustomerA,
        body: {
          customerName: 'Aarav Sharma',
          customerPhone: '9876543210',
          customerEmail: 'aarav@alongkar.test',
          shippingAddress: {
            line1: '12 Salt Lake Sector V',
            city: 'Kolkata',
            state: 'West Bengal',
            pincode: '700091',
          },
          idempotencyKey: `idem_cod_${ts}_1`,
          paymentMethod: 'COD',
          items: [{ productId: prodCod.id, quantity: 2 }],
        },
      },
      codRes1
    );

    assert(codRes1.statusCode === 201, 'COD order created successfully (201 Created)');
    assert(codRes1.data?.order?.status === 'CONFIRMED', 'COD order status is CONFIRMED');
    assert(codRes1.data?.order?.paymentProvider === 'COD', 'Payment provider is COD');

    const checkCodStock1 = await prisma.product.findUnique({ where: { id: prodCod.id } });
    assert(checkCodStock1?.availableStock === 8, 'COD confirmation atomically deducted stock from 10 to 8');

    // 4.2 COD order creation with insufficient stock (e.g. requesting 10 when available is 8)
    const codFailRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: userCustomerB,
        body: {
          customerName: 'Bhavna Patel',
          customerPhone: '9876543211',
          customerEmail: 'bhavna@alongkar.test',
          shippingAddress: {
            line1: '44 Park Street',
            city: 'Kolkata',
            state: 'West Bengal',
            pincode: '700016',
          },
          idempotencyKey: `idem_cod_${ts}_fail`,
          paymentMethod: 'COD',
          items: [{ productId: prodCod.id, quantity: 10 }],
        },
      },
      codFailRes
    );

    assert(codFailRes.statusCode === 400, 'COD order with insufficient stock is rejected with 400');
    assert(
      typeof codFailRes.data?.error === 'string' &&
        (codFailRes.data.error.includes('stock') || codFailRes.data.error.includes('available')),
      'Safe customer-facing stock error returned'
    );

    const checkCodStockAfterFail = await prisma.product.findUnique({ where: { id: prodCod.id } });
    assert(checkCodStockAfterFail?.availableStock === 8, 'availableStock remains unchanged at 8 after failed COD order');

    // ─── 5. Razorpay Pre-Validation & Atomic Payment Transition ───────────────
    console.log('\n--- 5. Razorpay Pre-Validation & Atomic Payment Confirmation ---');

    const prodRzp = await createProduct('Razorpay Royal Choker', 4, 3000);

    // 5.1 Create Alongkar order in PENDING_PAYMENT status
    const orderRzpRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: userCustomerA,
        body: {
          customerName: 'Aarav Sharma',
          customerPhone: '9876543210',
          customerEmail: 'aarav@alongkar.test',
          shippingAddress: {
            line1: '12 Salt Lake Sector V',
            city: 'Kolkata',
            state: 'West Bengal',
            pincode: '700091',
          },
          idempotencyKey: `idem_rzp_${ts}_1`,
          paymentMethod: 'RAZORPAY',
          items: [{ productId: prodRzp.id, quantity: 2 }],
        },
      },
      orderRzpRes
    );

    assert(orderRzpRes.statusCode === 201, 'Razorpay order created in PENDING_PAYMENT status (201)');
    const rzpOrderId = orderRzpRes.data?.order?.id;
    assert(orderRzpRes.data?.order?.status === 'PENDING_PAYMENT', 'Order status is PENDING_PAYMENT');

    // Stock must NOT be decremented upon order creation (still 4)
    const checkRzpStockBeforePay = await prisma.product.findUnique({ where: { id: prodRzp.id } });
    assert(checkRzpStockBeforePay?.availableStock === 4, 'Stock remains 4 during checkout before payment confirmation');

    // 5.2 Create Razorpay gateway order (POST /api/payments/razorpay/order)
    const gatewayOrderRes = createMockRes();
    const mockRzpGatewayOrder = { id: `order_rzp_p2_${ts}`, amount: 570000, currency: 'INR', status: 'created' };
    await razorpayOrderHandler(
      {
        method: 'POST',
        _testUser: userCustomerA,
        _testRazorpayOrder: mockRzpGatewayOrder,
        body: { orderId: rzpOrderId },
      },
      gatewayOrderRes
    );

    assert(gatewayOrderRes.statusCode === 201 || gatewayOrderRes.statusCode === 200, 'Razorpay gateway order created (201/200)');

    // 5.3 Verify payment (POST /api/payments/razorpay/verify)
    const testRzpPaymentId = `pay_rzp_p2_${ts}`;
    const testSig = generateCheckoutSignature(mockRzpGatewayOrder.id, testRzpPaymentId, testKeySecret);
    const mockCapturedPayment = {
      id: testRzpPaymentId,
      order_id: mockRzpGatewayOrder.id,
      amount: rupeesToPaise(orderRzpRes.data?.order?.grandTotal),
      currency: 'INR',
      status: 'captured',
    };

    const verifyRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: userCustomerA,
        _testPayment: mockCapturedPayment,
        body: {
          orderId: rzpOrderId,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: mockRzpGatewayOrder.id,
          razorpaySignature: testSig,
        },
      },
      verifyRes
    );

    assert(verifyRes.statusCode === 200, 'Payment verified successfully (200 OK)');
    assert(verifyRes.data?.order?.status === 'CONFIRMED', 'Order transitioned to CONFIRMED');
    assert(verifyRes.data?.order?.paymentStatus === 'PAID', 'Order transitioned to PAID');

    // Verify DB stock was atomically decremented from 4 to 2
    const checkRzpStockAfterPay = await prisma.product.findUnique({ where: { id: prodRzp.id } });
    assert(checkRzpStockAfterPay?.availableStock === 2, 'Stock atomically decremented from 4 to 2 on payment confirmation');

    // ─── 6. Idempotency & Replay Protection (Verify, Webhook, Reconcile) ──────
    console.log('\n--- 6. Idempotency & Replay Protection across Verify, Reconcile, Webhook ---');

    // 6.1 Replay verification: Stock MUST NOT decrement again
    const verifyReplayRes = createMockRes();
    await razorpayVerifyHandler(
      {
        method: 'POST',
        _testUser: userCustomerA,
        _testPayment: mockCapturedPayment,
        body: {
          orderId: rzpOrderId,
          razorpayPaymentId: testRzpPaymentId,
          razorpayOrderId: mockRzpGatewayOrder.id,
          razorpaySignature: testSig,
        },
      },
      verifyReplayRes
    );

    assert(verifyReplayRes.statusCode === 200, 'Replayed verification returns 200 OK');
    assert(verifyReplayRes.data?.alreadyPaid === true, 'Replay flagged as alreadyPaid');

    const checkStockAfterVerifyReplay = await prisma.product.findUnique({ where: { id: prodRzp.id } });
    assert(checkStockAfterVerifyReplay?.availableStock === 2, 'Stock remains exactly 2 on verification replay');

    // 6.2 Webhook payment.captured replay: Stock MUST NOT decrement again
    const capturedWebhookBody = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: testRzpPaymentId,
            order_id: mockRzpGatewayOrder.id,
            amount: rupeesToPaise(orderRzpRes.data?.order?.grandTotal),
            currency: 'INR',
            status: 'captured',
          },
        },
      },
    });
    const capturedWebhookSig = generateWebhookSignature(capturedWebhookBody, testWebhookSecret);

    const webhookReplayRes = createMockRes();
    await razorpayWebhookHandler(
      {
        method: 'POST',
        headers: { 'x-razorpay-signature': capturedWebhookSig },
        rawBody: capturedWebhookBody,
        body: JSON.parse(capturedWebhookBody),
      },
      webhookReplayRes
    );

    assert(webhookReplayRes.statusCode === 200, 'Webhook replay responded 200 OK');
    assert(webhookReplayRes.data?.idempotentReplay === true, 'Webhook replay flagged as idempotentReplay');

    const checkStockAfterWebhookReplay = await prisma.product.findUnique({ where: { id: prodRzp.id } });
    assert(checkStockAfterWebhookReplay?.availableStock === 2, 'Stock remains exactly 2 on webhook replay');

    // 6.3 Reconcile replay: Stock MUST NOT decrement again
    const reconcileReplayRes = createMockRes();
    await razorpayReconcileHandler(
      {
        method: 'POST',
        _testUser: userCustomerA,
        _testRazorpayOrder: mockRzpGatewayOrder,
        _testPayment: mockCapturedPayment,
        body: { orderId: rzpOrderId },
      },
      reconcileReplayRes
    );

    assert(reconcileReplayRes.statusCode === 200, 'Reconcile replay responded 200 OK');
    assert(reconcileReplayRes.data?.alreadyPaid === true, 'Reconcile replay flagged as alreadyPaid');

    const checkStockAfterReconcileReplay = await prisma.product.findUnique({ where: { id: prodRzp.id } });
    assert(checkStockAfterReconcileReplay?.availableStock === 2, 'Stock remains exactly 2 on reconcile replay');

    // ─── 7. Real Concurrent Competing Confirmations ──────────────────────────
    console.log('\n--- 7. Testing Real Concurrent Competing Confirmations (Race Conditions) ---');

    // Case 1: Initial stock = 10. Order A requests 6, Order B requests 5 (total 11).
    // Exactly ONE must succeed (e.g. A with 6 -> stock 4, or B with 5 -> stock 5).
    // Stock must NEVER become negative or -1!
    const prodCompete1 = await createProduct('Concurrent Compete 10 Units', 10, 1000);

    const raceOrder1Promise = prisma.$transaction(
      async (tx) => {
        return await deductOrderInventoryTx(tx, [{ productId: prodCompete1.id, quantity: 6 }]);
      },
      { maxWait: 10000, timeout: 20000 }
    );

    const raceOrder2Promise = prisma.$transaction(
      async (tx) => {
        return await deductOrderInventoryTx(tx, [{ productId: prodCompete1.id, quantity: 5 }]);
      },
      { maxWait: 10000, timeout: 20000 }
    );

    const [raceRes1, raceRes2] = await Promise.all([raceOrder1Promise, raceOrder2Promise]);

    const successCount = (raceRes1.success ? 1 : 0) + (raceRes2.success ? 1 : 0);
    const failCount = (!raceRes1.success ? 1 : 0) + (!raceRes2.success ? 1 : 0);

    assert(successCount === 1, `Exactly 1 concurrent order succeeded (successCount: ${successCount})`);
    assert(failCount === 1, `Exactly 1 concurrent order failed (failCount: ${failCount})`);

    const finalCompete1Stock = await prisma.product.findUnique({ where: { id: prodCompete1.id } });
    const expectedStock = raceRes1.success ? 4 : 5;
    assert(
      finalCompete1Stock?.availableStock === expectedStock,
      `Final availableStock is accurately ${finalCompete1Stock?.availableStock} (expected: ${expectedStock})`
    );
    assert(finalCompete1Stock?.availableStock! >= 0, 'availableStock is strictly non-negative');

    // Case 2: Two simultaneous orders each competing for the FINAL available unit (stock = 1)
    const prodLastUnit = await createProduct('Last Available Unit', 1, 2500);

    const raceLast1 = prisma.$transaction(
      async (tx) => {
        return await deductOrderInventoryTx(tx, [{ productId: prodLastUnit.id, quantity: 1 }]);
      },
      { maxWait: 10000, timeout: 20000 }
    );

    const raceLast2 = prisma.$transaction(
      async (tx) => {
        return await deductOrderInventoryTx(tx, [{ productId: prodLastUnit.id, quantity: 1 }]);
      },
      { maxWait: 10000, timeout: 20000 }
    );

    const [lastRes1, lastRes2] = await Promise.all([raceLast1, raceLast2]);

    const lastUnitSuccess = (lastRes1.success ? 1 : 0) + (lastRes2.success ? 1 : 0);
    const lastUnitFail = (!lastRes1.success ? 1 : 0) + (!lastRes2.success ? 1 : 0);

    assert(lastUnitSuccess === 1, 'Exactly one customer claimed the final available unit');
    assert(lastUnitFail === 1, 'The competing customer was safely rejected');

    const finalLastUnitStock = await prisma.product.findUnique({ where: { id: prodLastUnit.id } });
    assert(finalLastUnitStock?.availableStock === 0, 'Final stock for single-unit item is exactly 0');
    assert(finalLastUnitStock?.inStock === false, 'Product marked out of stock (inStock: false)');

    // ─── 8. Cart Non-Reservation & Independence Verification ──────────────────
    console.log('\n--- 8. Cart Non-Reservation & Independence Verification ---');

    const prodCartTest = await createProduct('Cart Independence Pearl Ring', 10, 2000);

    // Create user cart with item
    let cart = await prisma.cart.create({
      data: {
        userId: userCustomerC.id,
      },
    });

    // Add item (qty 3) to cart
    await prisma.cartItem.create({
      data: {
        cartId: cart.id,
        productId: prodCartTest.id,
        quantity: 3,
      },
    });

    const stockAfterCartAdd = await prisma.product.findUnique({ where: { id: prodCartTest.id } });
    assert(stockAfterCartAdd?.availableStock === 10, 'Adding 3 units to cart did NOT change availableStock (remains 10)');

    // Update cart item quantity from 3 to 5
    await prisma.cartItem.updateMany({
      where: { cartId: cart.id, productId: prodCartTest.id },
      data: { quantity: 5 },
    });

    const stockAfterCartUpdate = await prisma.product.findUnique({ where: { id: prodCartTest.id } });
    assert(stockAfterCartUpdate?.availableStock === 10, 'Changing cart quantity from 3 to 5 did NOT change availableStock (remains 10)');

    // Another customer confirms an order for quantity 4
    await prisma.$transaction(async (tx) => {
      const deduction = await deductOrderInventoryTx(tx, [{ productId: prodCartTest.id, quantity: 4 }]);
      assert(deduction.success === true, 'Independent customer order for quantity 4 succeeds');
    });

    const stockAfterOtherOrder = await prisma.product.findUnique({ where: { id: prodCartTest.id } });
    assert(stockAfterOtherOrder?.availableStock === 6, 'availableStock became 6 (10 - 4)');

    // Remove item from cart
    await prisma.cartItem.deleteMany({
      where: { cartId: cart.id, productId: prodCartTest.id },
    });

    const stockAfterCartRemove = await prisma.product.findUnique({ where: { id: prodCartTest.id } });
    assert(stockAfterCartRemove?.availableStock === 6, 'Removing item from cart did NOT change availableStock (remains 6)');

    // ─── 9. Cache Invalidation Verification ───────────────────────────────────
    console.log('\n--- 9. Cache Invalidation Verification ---');

    const prodCacheTest = await createProduct('Cache Invalidation Bangles', 10, 1800);

    // Warm cache
    const cacheKeyId = CacheKey.productId(prodCacheTest.id);
    await cacheSet(cacheKeyId, { id: prodCacheTest.id, availableStock: 10 }, 300);
    const cachedBefore = await cacheGet(cacheKeyId);
    assert(cachedBefore.hit === true, 'Product cache is warm before mutation');

    // Trigger cache invalidation helper
    await invalidateDeductedProductsCache([{ productId: prodCacheTest.id, quantity: 2 }]);

    const cachedAfter = await cacheGet(cacheKeyId);
    assert(cachedAfter.hit === false, 'Product cache entry successfully invalidated after stock mutation');

    // ─── 10. Summary & Cleanup ───────────────────────────────────────────────
    console.log('\n====================================================================');
    console.log(`PHASE 2 INVENTORY TESTS SUMMARY: ${passedTests} / ${totalTests} PASSED (${failedTests} FAILED)`);
    console.log('====================================================================');
  } catch (err) {
    console.error('Test suite encountered an unhandled error:', err);
    failedTests++;
  } finally {
    // Cleanup seeded records
    try {
      if (createdOrderIds.length > 0) {
        await prisma.orderItem.deleteMany({ where: { orderId: { in: createdOrderIds } } });
        await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
      }
      if (createdUserIds.length > 0) {
        await prisma.cartItem.deleteMany({ where: { cart: { userId: { in: createdUserIds } } } });
        await prisma.cart.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.order.deleteMany({ where: { userId: { in: createdUserIds } } });
        await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
      }
      if (createdProductIds.length > 0) {
        await prisma.orderItem.deleteMany({ where: { productId: { in: createdProductIds } } });
        await prisma.cartItem.deleteMany({ where: { productId: { in: createdProductIds } } });
        await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
      }
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  if (failedTests > 0) {
    process.exit(1);
  }
}

runPhase2Tests().catch((err) => {
  console.error('Fatal execution error in test runner:', err);
  process.exit(1);
});
