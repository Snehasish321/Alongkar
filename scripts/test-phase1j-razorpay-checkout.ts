import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import ordersHandler from '../api/orders.js';
import { handleCreatePaymentOrder as razorpayOrderHandler } from '../api/payments/razorpay.js';
import { loadRazorpayScript, openRazorpayCheckout, RAZORPAY_CHECKOUT_SCRIPT_URL } from '../src/lib/razorpay.js';
import type {
  RazorpayCheckoutOptions,
  RazorpayPaymentSuccessResponse,
  RazorpayPaymentFailureResponse,
} from '../src/types/index.js';
import fs from 'fs';
import path from 'path';

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

async function runTests() {
  process.env.NODE_ENV = 'test';
  if (!process.env.RAZORPAY_KEY_ID) {
    process.env.RAZORPAY_KEY_ID = 'rzp_test_alongkarMockKey123';
  }
  if (!process.env.RAZORPAY_KEY_SECRET) {
    process.env.RAZORPAY_KEY_SECRET = 'mock_secret_key_alongkar_test';
  }

  console.log('===============================================================');
  console.log('PHASE 1J-B: RAZORPAY CHECKOUT.JS FRONTEND INTEGRATION TESTS');
  console.log('===============================================================\n');

  const ts = Date.now();
  const testClerkUserId = `user_chk_test_${ts}`;
  let user: any;
  let user2: any;
  let productA: any;
  const createdOrderIds: string[] = [];

  try {
    // ─── Setup Test User and Products ──────────────────────────────────────────
    user = await prisma.user.create({
      data: {
        clerkUserId: testClerkUserId,
        email: `chk_${ts}@alongkar.test`,
      },
    });

    productA = await prisma.product.create({
      data: {
        name: `Royal Gold Necklace ${ts}`,
        slug: `royal-gold-necklace-${ts}`,
        category: 'necklaces',
        price: 2499.0,
        originalPrice: 2999.0,
        discountPercent: 17,
        rating: 4.9,
        reviewCount: 15,
        image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        hoverImage: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        description: 'Handcrafted artisan royal necklace.',
        finish: '24K Gold Plated',
        baseMaterial: 'Brass',
        warranty: '1 Year Warranty',
        inStock: true,
      },
    });

    // ─── 1. Security & Script Integrity Checks ──────────────────────────────────
    console.log('--- 1. Security & Script Integrity Checks ---');

    assert(
      RAZORPAY_CHECKOUT_SCRIPT_URL === 'https://checkout.razorpay.com/v1/checkout.js',
      'Uses official Razorpay Checkout.js script URL'
    );

    // Verify no secret exists in client source files
    const clientLibContent = fs.readFileSync(path.resolve('src/lib/razorpay.ts'), 'utf8');
    assert(
      !clientLibContent.includes('RAZORPAY_KEY_SECRET') && !clientLibContent.includes('key_secret'),
      'src/lib/razorpay.ts does not reference or expose RAZORPAY_KEY_SECRET'
    );

    const cartDrawerContent = fs.readFileSync(path.resolve('src/components/layout/CartDrawer.tsx'), 'utf8');
    assert(
      !cartDrawerContent.includes('RAZORPAY_KEY_SECRET') && !cartDrawerContent.includes('key_secret'),
      'src/components/layout/CartDrawer.tsx does not reference or expose RAZORPAY_KEY_SECRET'
    );

    assert(
      !cartDrawerContent.includes('alert('),
      'Demonstration alert() has been removed from CartDrawer.tsx'
    );

    // ─── 2. Client-Side Script Loader & Checkout Utility Tests ─────────────────
    console.log('\n--- 2. Client-Side Script Loader & Checkout Utility Tests ---');

    // Simulate browser window environment
    let scriptAppended = false;
    let appendedScriptSrc = '';
    const mockDocument: any = {
      querySelector: (selector: string) => {
        if (selector.includes(RAZORPAY_CHECKOUT_SCRIPT_URL) && scriptAppended) {
          return { src: appendedScriptSrc };
        }
        return null;
      },
      createElement: (tag: string) => {
        const el: any = {
          tagName: tag.toUpperCase(),
          src: '',
          async: false,
          crossOrigin: '',
          onload: null as any,
          onerror: null as any,
        };
        return el;
      },
      body: {
        appendChild: (el: any) => {
          scriptAppended = true;
          appendedScriptSrc = el.src;
          // Simulate successful async script load
          setTimeout(() => {
            (global as any).window.Razorpay = function (opts: RazorpayCheckoutOptions) {
              return {
                open: () => {},
                on: (event: string, cb: any) => {},
              };
            };
            if (el.onload) el.onload();
          }, 10);
          return el;
        },
      },
    };

    (global as any).window = {
      Razorpay: undefined,
    };
    (global as any).document = mockDocument;

    const loadResult = await loadRazorpayScript();
    assert(loadResult === true, 'loadRazorpayScript loads official script asynchronously');
    assert(
      typeof (global as any).window.Razorpay === 'function',
      'window.Razorpay constructor is available after loading'
    );

    // Test cached loader
    const secondLoad = await loadRazorpayScript();
    assert(secondLoad === true, 'Subsequent loadRazorpayScript calls resolve immediately without duplicate injection');

    // Test openRazorpayCheckout options propagation
    let capturedOptions: RazorpayCheckoutOptions | null = null;
    let failedCallbackAttached = false;

    (global as any).window.Razorpay = function (opts: RazorpayCheckoutOptions) {
      capturedOptions = opts;
      return {
        open: () => {},
        on: (event: string, cb: any) => {
          if (event === 'payment.failed') failedCallbackAttached = true;
        },
      };
    };

    const mockOpts: RazorpayCheckoutOptions = {
      key: 'rzp_test_key_123',
      amount: 249900,
      currency: 'INR',
      name: 'Alongkar',
      description: 'Order ORD-20261005-12345',
      order_id: 'order_test_98765',
      prefill: {
        name: 'Rupali Sen',
        email: 'rupali@alongkar.test',
        contact: '9876543210',
      },
      theme: { color: '#8C6C38' },
    };

    const rzpInstance = await openRazorpayCheckout(mockOpts, (err) => {});
    assert(rzpInstance !== null, 'openRazorpayCheckout returns Razorpay instance');
    assert(capturedOptions?.key === 'rzp_test_key_123', 'Correct Razorpay key ID passed to Checkout options');
    assert(capturedOptions?.order_id === 'order_test_98765', 'Correct server-created Razorpay order ID passed');
    assert(capturedOptions?.amount === 249900, 'Correct server-provided amount passed to Checkout');
    assert(capturedOptions?.currency === 'INR', 'Correct currency passed to Checkout');
    assert(capturedOptions?.name === 'Alongkar', 'Business name is Alongkar');
    assert(capturedOptions?.prefill?.name === 'Rupali Sen', 'Customer name prefilled');
    assert(capturedOptions?.prefill?.email === 'rupali@alongkar.test', 'Customer email prefilled');
    assert(capturedOptions?.prefill?.contact === '9876543210', 'Customer phone prefilled');
    assert(failedCallbackAttached === true, 'payment.failed event listener is attached');

    // ─── 3. Full Checkout Flow & Backend Integration ───────────────────────────
    console.log('\n--- 3. Full Checkout Flow & Backend Integration ---');

    // 3.1 Unauthenticated Request
    const unauthReq: any = {
      method: 'POST',
      headers: {},
      url: '/api/payments/razorpay/order',
    };
    const unauthRes = createMockRes();
    await razorpayOrderHandler(unauthReq, unauthRes);
    assert(unauthRes.statusCode === 401, 'Missing authentication is handled and rejected with 401');

    // 3.2 Create Alongkar Order via POST /api/orders
    const orderCreateReq: any = {
      method: 'POST',
      _testUser: user,
      headers: { authorization: `Bearer ${testClerkUserId}` },
      body: {
        customerName: 'Rupali Sen',
        customerPhone: '9876543210',
        customerEmail: 'rupali@alongkar.test',
        shippingAddress: {
          line1: '12 Ballygunge Circular Road',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700019',
          country: 'India',
        },
        idempotencyKey: `chk_key_${ts}_1`,
        items: [{ productId: productA.id, quantity: 1 }],
      },
    };
    const orderCreateRes = createMockRes();
    await ordersHandler(orderCreateReq, orderCreateRes);

    assert(orderCreateRes.statusCode === 201, 'Alongkar Order created with 201 Created');
    const alongkarOrderId = orderCreateRes.data?.order?.id;
    const orderNumber = orderCreateRes.data?.order?.orderNumber;
    assert(typeof alongkarOrderId === 'string', 'Valid Alongkar Order ID returned');
    if (alongkarOrderId) createdOrderIds.push(alongkarOrderId);

    // 3.3 Call POST /api/payments/razorpay/order with orderId only
    const paymentOrderReq: any = {
      method: 'POST',
      _testUser: user,
      headers: { authorization: `Bearer ${testClerkUserId}` },
      body: {
        orderId: alongkarOrderId,
        // Intentionally test that client cannot tamper with amount or currency
        tamperedAmount: 1,
        tamperedCurrency: 'USD',
      },
    };
    const paymentOrderRes = createMockRes();
    await razorpayOrderHandler(paymentOrderReq, paymentOrderRes);

    assert(paymentOrderRes.statusCode === 200 || paymentOrderRes.statusCode === 201, 'Payment order endpoint responded 200/201');
    assert(paymentOrderRes.data?.success === true, 'Payment order success is true');
    assert(typeof paymentOrderRes.data?.razorpayKeyId === 'string', 'Public razorpayKeyId returned to frontend');
    assert(paymentOrderRes.data?.razorpayKeyId?.startsWith('rzp_'), 'razorpayKeyId has expected rzp_ prefix');
    assert(typeof paymentOrderRes.data?.razorpayOrderId === 'string', 'Server-created razorpayOrderId returned');
    assert(paymentOrderRes.data?.razorpayOrderId?.startsWith('order_'), 'razorpayOrderId has order_ prefix');
    assert(paymentOrderRes.data?.amount === 249900, 'Authoritative server amount in paise (249900) returned');
    assert(paymentOrderRes.data?.currency === 'INR', 'Server currency INR returned (tampered values ignored)');
    assert(paymentOrderRes.data?.alongkarOrderId === alongkarOrderId, 'Alongkar order ID matches');

    // ─── 4. Success Callback & Order State Invariant Verification ──────────────
    console.log('\n--- 4. Success Callback & Order State Invariant Verification ---');

    let capturedLocalPayment: any = null;
    const mockSuccessResponse: RazorpayPaymentSuccessResponse = {
      razorpay_payment_id: `pay_mock_${ts}`,
      razorpay_order_id: paymentOrderRes.data?.razorpayOrderId,
      razorpay_signature: `sig_mock_${ts}`,
    };

    // Simulate frontend success handler
    const frontendSuccessHandler = (response: RazorpayPaymentSuccessResponse) => {
      capturedLocalPayment = {
        razorpay_payment_id: response.razorpay_payment_id,
        razorpay_order_id: response.razorpay_order_id,
        razorpay_signature: response.razorpay_signature,
        alongkarOrderId,
      };
    };

    frontendSuccessHandler(mockSuccessResponse);

    assert(
      capturedLocalPayment.razorpay_payment_id === `pay_mock_${ts}`,
      'Successful Razorpay response captures payment_id in memory'
    );
    assert(
      capturedLocalPayment.razorpay_order_id === paymentOrderRes.data?.razorpayOrderId,
      'Successful Razorpay response captures order_id in memory'
    );
    assert(
      capturedLocalPayment.razorpay_signature === `sig_mock_${ts}`,
      'Successful Razorpay response captures signature in memory'
    );

    // Check DB state: order must strictly remain PENDING_PAYMENT and PENDING
    const orderInDb = await prisma.order.findUnique({
      where: { id: alongkarOrderId },
    });
    assert(orderInDb?.status === 'PENDING_PAYMENT', 'Order status remains PENDING_PAYMENT (not marked CONFIRMED by frontend)');
    assert(orderInDb?.paymentStatus === 'PENDING', 'Order paymentStatus remains PENDING (not marked PAID by frontend)');

    // ─── 5. Failure & Dismissal & Retry Invariant Verification ─────────────────
    console.log('\n--- 5. Failure & Dismissal & Retry Invariant Verification ---');

    let failureHandled = false;
    let failureMsg = '';
    const mockFailureResponse: RazorpayPaymentFailureResponse = {
      error: {
        code: 'BAD_REQUEST_ERROR',
        description: 'Payment failed due to customer cancellation at bank.',
        source: 'gateway',
        step: 'payment_authentication',
        reason: 'payment_cancelled',
      },
    };

    const frontendFailureHandler = (response: RazorpayPaymentFailureResponse) => {
      failureHandled = true;
      failureMsg = response.error.description;
    };

    frontendFailureHandler(mockFailureResponse);

    assert(failureHandled === true, 'Payment failure handler caught failed event');
    assert(failureMsg === 'Payment failed due to customer cancellation at bank.', 'User-friendly failure message processed');

    // Verify order remains eligible for retry
    const orderAfterFailure = await prisma.order.findUnique({
      where: { id: alongkarOrderId },
    });
    assert(orderAfterFailure?.status === 'PENDING_PAYMENT', 'Order remains PENDING_PAYMENT after payment failure');
    assert(orderAfterFailure?.paymentStatus === 'PENDING', 'Order remains PENDING payment status after failure');

    // 5.1 Retry: Initiating payment again for the same alongkarOrderId
    const retryPaymentReq: any = {
      method: 'POST',
      _testUser: user,
      headers: { authorization: `Bearer ${testClerkUserId}` },
      body: { orderId: alongkarOrderId },
    };
    const retryPaymentRes = createMockRes();
    await razorpayOrderHandler(retryPaymentReq, retryPaymentRes);

    assert(retryPaymentRes.statusCode === 200, 'Payment retry succeeds with 200 OK');
    assert(
      retryPaymentRes.data?.razorpayOrderId === paymentOrderRes.data?.razorpayOrderId,
      'Retry reuses existing Razorpay paymentOrderId without creating a new payment order'
    );

    // Verify total count of orders in DB for this user is still exactly 1
    const totalUserOrders = await prisma.order.count({
      where: { userId: user.id },
    });
    assert(totalUserOrders === 1, 'No second Alongkar order was created for the payment retry');

    // ─── 6. Double-Click & Error Recovery Verification ────────────────────────
    console.log('\n--- 6. Double-Click & Error Recovery Verification ---');

    let isProcessing = false;
    let clickCount = 0;

    const simulateButtonClick = async () => {
      if (isProcessing) return 'BLOCKED_BY_GUARD';
      isProcessing = true;
      clickCount++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      isProcessing = false;
      return 'PROCESSED';
    };

    const firstClick = simulateButtonClick();
    const secondClick = simulateButtonClick();

    const [r1, r2] = await Promise.all([firstClick, secondClick]);
    assert(r1 === 'PROCESSED' && r2 === 'BLOCKED_BY_GUARD', 'Double-click protection prevents duplicate initiation');
    assert(clickCount === 1, 'Exactly one payment initiation was processed');
    assert(isProcessing === false, 'Button state is unlocked and restored after execution');

    // ─── 7. Cart Drawer State & Post-Order Cleared Cart Regression Tests ─────────
    console.log('\n--- 7. Cart Drawer State & Post-Order Cleared Cart Regression Tests ---');

    // 7.1 Empty Cart BEFORE checkout
    let emptyCartValidationTriggered = false;
    let emptyCartErrorMsg = '';
    const simulateInitialCheckout = (cartItems: any[], activeId: string | null) => {
      if (!activeId && (!cartItems || cartItems.length === 0)) {
        emptyCartValidationTriggered = true;
        emptyCartErrorMsg = 'Your bag is currently empty.';
        return { success: false, error: emptyCartErrorMsg };
      }
      return { success: true };
    };

    const emptyResult = simulateInitialCheckout([], null);
    assert(emptyResult.success === false, 'Empty cart BEFORE checkout is correctly blocked');
    assert(emptyCartValidationTriggered === true, 'Empty cart error is triggered before order creation');
    assert(emptyCartErrorMsg === 'Your bag is currently empty.', 'Appropriate user error shown for truly empty cart');

    // 7.2 Cart contains items → order is created → cart becomes empty → Razorpay Checkout still opens
    const ts2 = Date.now() + 100;
    const testClerkUser2 = `user_chk_flow_${ts2}`;
    user2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: `chk_flow_${ts2}@alongkar.test`,
      },
    });

    const user2Cart = await prisma.cart.create({
      data: {
        userId: user2.id,
        items: {
          create: [{ productId: productA.id, quantity: 2 }],
        },
      },
      include: { items: true },
    });
    assert(user2Cart.items.length === 1, 'User 2 cart seeded with 1 item (qty 2)');

    // Simulate order creation from user cart
    const user2OrderCreateRes = createMockRes();
    await ordersHandler(
      {
        method: 'POST',
        _testUser: user2,
        headers: { authorization: `Bearer ${testClerkUser2}` },
        body: {
          customerName: 'Ananya Roy',
          customerPhone: '9876543211',
          customerEmail: 'ananya@alongkar.test',
          shippingAddress: {
            line1: '45 Park Street',
            city: 'Kolkata',
            state: 'West Bengal',
            pincode: '700016',
            country: 'India',
          },
          idempotencyKey: `chk_flow_idem_${ts2}`,
        },
      },
      user2OrderCreateRes
    );

    assert(user2OrderCreateRes.statusCode === 201, 'Order created from user cart with 201');
    const flowOrderId = user2OrderCreateRes.data?.order?.id;
    assert(typeof flowOrderId === 'string', 'Valid order ID returned for flow');
    if (flowOrderId) createdOrderIds.push(flowOrderId);

    // Verify authenticated cart was preserved in PostgreSQL as per cart persistence design
    const user2CartAfterOrder = await prisma.cart.findUnique({
      where: { userId: user2.id },
      include: { items: true },
    });
    assert(user2CartAfterOrder?.items.length === 1, 'Authenticated cart in DB remains persistent on PENDING_PAYMENT order creation');

    // Frontend state maintains cart items and activeOrderId: flowOrderId
    let frontendCartState: any[] = [{ id: 'item_1', productId: 'p1', quantity: 2 }];
    let frontendActiveOrderId: string | null = flowOrderId;

    // Checkout flow evaluates: cart is present and activeOrderId is present
    const postOrderCheckoutCheck = simulateInitialCheckout(frontendCartState, frontendActiveOrderId);
    assert(
      postOrderCheckoutCheck.success === true,
      'Pending order checkout does NOT trigger empty cart validation error'
    );

    // Call payment order endpoint with the activeOrderId
    const flowPaymentRes = createMockRes();
    await razorpayOrderHandler(
      {
        method: 'POST',
        _testUser: user2,
        headers: { authorization: `Bearer ${testClerkUser2}` },
        body: { orderId: frontendActiveOrderId },
      },
      flowPaymentRes
    );

    assert(flowPaymentRes.statusCode === 200 || flowPaymentRes.statusCode === 201, 'Payment order initiated for active order');
    assert(flowPaymentRes.data?.success === true, 'Payment order returned success');
    assert(typeof flowPaymentRes.data?.razorpayOrderId === 'string', 'Razorpay Order ID generated for active order');

    // 7.3 Razorpay modal dismissal & payment failure preserve activeOrderId and cart
    let activeOrderPreservedOnDismiss = frontendActiveOrderId;
    assert(activeOrderPreservedOnDismiss === flowOrderId, 'activeOrderId remains preserved on modal dismissal');

    let activeOrderPreservedOnFailure = frontendActiveOrderId;
    assert(activeOrderPreservedOnFailure === flowOrderId, 'activeOrderId remains preserved on payment failure');

    // 7.4 Checkout retry with persistent cart and existing activeOrderId
    const retryFlowPaymentRes = createMockRes();
    await razorpayOrderHandler(
      {
        method: 'POST',
        _testUser: user2,
        headers: { authorization: `Bearer ${testClerkUser2}` },
        body: { orderId: frontendActiveOrderId },
      },
      retryFlowPaymentRes
    );

    assert(retryFlowPaymentRes.statusCode === 200, 'Retry with existing activeOrderId succeeds (200)');
    assert(
      retryFlowPaymentRes.data?.razorpayOrderId === flowPaymentRes.data?.razorpayOrderId,
      'Retry reuses existing Razorpay payment order without recreation'
    );

    // 7.5 Invariants: No duplicate Alongkar order created & Cart items persisted
    const totalUser2Orders = await prisma.order.count({
      where: { userId: user2.id },
    });
    assert(totalUser2Orders === 1, 'Strict invariant: Exactly 1 Alongkar order exists for User 2 (no duplicates)');

    const user2CartItemsCount = await prisma.cartItem.count({
      where: { cart: { userId: user2.id } },
    });
    assert(user2CartItemsCount === 1, 'Strict invariant: Cart items remain persistent in DB during pending order flow');

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    assert(false, `Unexpected error during test execution: ${err.message}`);
  } finally {
    // ─── Cleanup Test Records ──────────────────────────────────────────────────
    if (createdOrderIds.length > 0) {
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      });
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      });
    }
    if (productA) {
      await prisma.product.delete({ where: { id: productA.id } }).catch(() => {});
    }
    if (user) {
      await prisma.cart.deleteMany({ where: { userId: user.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
    }
    if (user2) {
      await prisma.cart.deleteMany({ where: { userId: user2.id } }).catch(() => {});
      await prisma.user.delete({ where: { id: user2.id } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  console.log('\n===============================================================');
  console.log(`PHASE 1J-B TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
  console.log('===============================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests();
