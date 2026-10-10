import './testDbGuard.js';
import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../src/lib/prisma.js';
import ordersHandler from '../api/orders.js';
import {
  handleCreatePaymentOrder as razorpayOrderHandler,
  handleVerifyPayment as razorpayVerifyHandler,
  handleReconcilePayment as razorpayReconcileHandler,
  handleWebhook as razorpayWebhookHandler,
} from '../api/payments/razorpay.js';
import {
  transitionOrderToPaid,
} from '../api/_utils/razorpay.js';

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

async function runCartPersistenceTests() {
  process.env.NODE_ENV = 'test';
  const testKeyId = 'rzp_test_alongkar12345';
  const testKeySecret = 'secret_alongkar_test_key_123456';
  const testWebhookSecret = 'webhook_secret_alongkar_test_789012';

  process.env.RAZORPAY_KEY_ID = testKeyId;
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

  console.log('====================================================================');
  console.log('CART PERSISTENCE DURING PENDING RAZORPAY CHECKOUT TEST SUITE');
  console.log('====================================================================\n');

  const ts = Date.now();
  const testClerkUserA = `user_cart_persist_a_${ts}`;
  const testClerkUserB = `user_cart_persist_b_${ts}`;

  let userA: any;
  let userB: any;
  let product1: any;
  let product2: any;
  const createdOrderIds: string[] = [];

  try {
    // 1. Setup Test Users & Products
    console.log('--- 1. Setting up Test Users and Products ---');
    userA = await prisma.user.create({
      data: {
        clerkUserId: testClerkUserA,
        email: `usera_${ts}@test.alongkar.com`,
      },
    });

    userB = await prisma.user.create({
      data: {
        clerkUserId: testClerkUserB,
        email: `userb_${ts}@test.alongkar.com`,
      },
    });

    product1 = await prisma.product.create({
      data: {
        id: `prod_cart_1_${ts}`,
        name: 'Royal Heritage Jhumka',
        slug: `royal-heritage-jhumka-${ts}`,
        category: 'earrings',
        price: 1500,
        originalPrice: 1800,
        discountPercent: 16,
        rating: 4.9,
        reviewCount: 12,
        image: 'https://images.alongkar.com/jhumka.jpg',
        hoverImage: 'https://images.alongkar.com/jhumka-hover.jpg',
        description: 'Traditional 24K micron gold plated jhumkas',
        finish: 'Antique Gold',
        baseMaterial: 'Brass',
        stoneType: 'Ruby',
        warranty: '6 Months Guarantee',
        inStock: true,
        availableStock: 50,
      },
    });

    product2 = await prisma.product.create({
      data: {
        id: `prod_cart_2_${ts}`,
        name: 'Nilufar Pearl Choker',
        slug: `nilufar-pearl-choker-${ts}`,
        category: 'necklaces',
        price: 2500,
        originalPrice: 3000,
        discountPercent: 16,
        rating: 4.8,
        reviewCount: 8,
        image: 'https://images.alongkar.com/choker.jpg',
        hoverImage: 'https://images.alongkar.com/choker-hover.jpg',
        description: 'Handcrafted pearl necklace choker',
        finish: 'Yellow Gold',
        baseMaterial: 'Copper',
        stoneType: 'Freshwater Pearl',
        warranty: '6 Months Guarantee',
        inStock: true,
        availableStock: 50,
      },
    });

    assert(Boolean(userA && userB && product1 && product2), 'Seeded test users and products in PostgreSQL');

    // 2. Populate User A and User B Carts in Database
    console.log('\n--- 2. Populating User Carts in PostgreSQL ---');
    const cartA = await prisma.cart.create({
      data: {
        userId: userA.id,
        items: {
          create: [
            { productId: product1.id, quantity: 2 },
            { productId: product2.id, quantity: 1 },
          ],
        },
      },
      include: { items: true },
    });

    const cartB = await prisma.cart.create({
      data: {
        userId: userB.id,
        items: {
          create: [
            { productId: product2.id, quantity: 3 },
          ],
        },
      },
      include: { items: true },
    });

    assert(cartA.items.length === 2, 'User A cart has 2 unique items in DB');
    assert(cartB.items.length === 1, 'User B cart has 1 unique item in DB');

    // 3. Create PENDING_PAYMENT Order from Non-Empty Cart
    console.log('\n--- 3. Creating PENDING_PAYMENT Order (POST /api/orders) ---');
    const reqCreateOrderA = {
      method: 'POST',
      _testUser: userA,
      headers: { authorization: `Bearer ${testClerkUserA}` },
      body: {
        customerName: 'Sita Devi',
        customerPhone: '9876543210',
        customerEmail: 'sita@test.alongkar.com',
        shippingAddress: {
          line1: '12 Kalighat Road',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700026',
        },
        idempotencyKey: `cart_persist_ord_${ts}`,
      },
    };

    const resCreateOrderA = createMockRes();
    await ordersHandler(reqCreateOrderA, resCreateOrderA);

    assert(resCreateOrderA.statusCode === 201, 'Order created successfully with HTTP 201');
    const createdOrderA = resCreateOrderA.data?.order;
    assert(Boolean(createdOrderA && createdOrderA.id), 'Valid order returned in response payload');
    assert(createdOrderA.status === 'PENDING_PAYMENT', 'Order status is PENDING_PAYMENT');
    assert(createdOrderA.paymentStatus === 'PENDING', 'Order paymentStatus is PENDING');
    assert(createdOrderA.items.length === 2, 'OrderItem snapshots created (2 items)');
    if (createdOrderA?.id) createdOrderIds.push(createdOrderA.id);

    // 4. Verify Cart Persistence in DB
    console.log('\n--- 4. Verifying DB Cart Persistence After Order Creation ---');
    const cartAAfterOrder = await prisma.cart.findUnique({
      where: { userId: userA.id },
      include: { items: true },
    });

    assert(cartAAfterOrder !== null, 'User A cart record exists');
    assert(cartAAfterOrder?.items.length === 2, 'CartItem records STILL EXIST in DB after PENDING_PAYMENT order creation');
    const qtyTotal = cartAAfterOrder?.items.reduce((sum, it) => sum + it.quantity, 0);
    assert(qtyTotal === 3, 'CartItem total quantities are completely preserved (2 + 1 = 3)');

    // 5. Initialize Payment Order with Razorpay
    console.log('\n--- 5. Initiating Payment Order (POST /api/payments/razorpay/order) ---');
    const mockRazorpayAmountA = Math.round(createdOrderA.grandTotal * 100);
    const mockRazorpayOrder = {
      id: `order_cart_test_${ts}`,
      entity: 'order',
      amount: mockRazorpayAmountA,
      currency: 'INR',
      status: 'created',
      attempts: 0,
    };

    const reqPayOrder = {
      method: 'POST',
      _testUser: userA,
      _testRazorpayOrder: mockRazorpayOrder,
      headers: { authorization: `Bearer ${testClerkUserA}` },
      body: { orderId: createdOrderA.id },
    };

    const resPayOrder = createMockRes();
    await razorpayOrderHandler(reqPayOrder, resPayOrder);

    assert(resPayOrder.statusCode === 201 || resPayOrder.statusCode === 200, 'Payment order created with 201/200');
    assert(resPayOrder.data?.razorpayOrderId === mockRazorpayOrder.id, 'Razorpay order ID returned');

    // 6. Simulate Razorpay Dismissal / Cancellation & Retry Payment
    console.log('\n--- 6. Simulating Razorpay Cancellation & Payment Retry ---');
    // On cancellation/dismissal, cart items in DB must still exist
    const cartAfterCancel = await prisma.cart.findUnique({
      where: { userId: userA.id },
      include: { items: true },
    });
    assert(cartAfterCancel?.items.length === 2, 'Cart remains fully populated after checkout dismissal');

    // Retry payment attempt reusing activeOrderId
    const resRetryPayOrder = createMockRes();
    await razorpayOrderHandler(reqPayOrder, resRetryPayOrder);

    assert(resRetryPayOrder.statusCode === 200, 'Payment retry succeeded with HTTP 200 (reused active order)');
    assert(
      resRetryPayOrder.data?.razorpayOrderId === mockRazorpayOrder.id,
      'Payment retry reused existing Razorpay order without "Cart is empty" error'
    );

    // 7. Simulate Payment Failure
    console.log('\n--- 7. Simulating Payment Failure Event ---');
    const reqFailWebhook = {
      method: 'POST',
      headers: {
        'x-razorpay-signature': generateWebhookSignature(
          JSON.stringify({
            event: 'payment.failed',
            payload: {
              payment: {
                entity: {
                  id: `pay_fail_${ts}`,
                  order_id: mockRazorpayOrder.id,
                  status: 'failed',
                  error_description: 'Payment was declined by bank',
                },
              },
            },
          }),
          testWebhookSecret
        ),
      },
      body: {
        event: 'payment.failed',
        payload: {
          payment: {
            entity: {
              id: `pay_fail_${ts}`,
              order_id: mockRazorpayOrder.id,
              status: 'failed',
              error_description: 'Payment was declined by bank',
            },
          },
        },
      },
    };

    const resFailWebhook = createMockRes();
    await razorpayWebhookHandler(reqFailWebhook, resFailWebhook);
    assert(resFailWebhook.statusCode === 200, 'payment.failed webhook handled with 200');

    const cartAfterFailure = await prisma.cart.findUnique({
      where: { userId: userA.id },
      include: { items: true },
    });
    assert(cartAfterFailure?.items.length === 2, 'Cart remains persistent after payment failure');

    // 8. User Isolation Check: User A Payment Cannot Clear User B Cart
    console.log('\n--- 8. Testing User Isolation on Payment Verification ---');
    const mockSuccessPayment = {
      id: `pay_success_${ts}`,
      entity: 'payment',
      order_id: mockRazorpayOrder.id,
      amount: mockRazorpayAmountA,
      currency: 'INR',
      status: 'captured',
      captured: true,
    };

    const validSignature = generateCheckoutSignature(
      mockRazorpayOrder.id,
      mockSuccessPayment.id,
      testKeySecret
    );

    const reqVerify = {
      method: 'POST',
      _testUser: userA,
      _testPayment: mockSuccessPayment,
      headers: { authorization: `Bearer ${testClerkUserA}` },
      body: {
        orderId: createdOrderA.id,
        razorpayOrderId: mockRazorpayOrder.id,
        razorpayPaymentId: mockSuccessPayment.id,
        razorpaySignature: validSignature,
      },
    };

    const resVerify = createMockRes();
    await razorpayVerifyHandler(reqVerify, resVerify);

    assert(resVerify.statusCode === 200, 'Payment verification succeeded with HTTP 200');
    assert(resVerify.data?.success === true, 'Verification returned success: true');
    assert(resVerify.data?.order?.status === 'CONFIRMED', 'Order status transitioned to CONFIRMED');
    assert(resVerify.data?.order?.paymentStatus === 'PAID', 'Order paymentStatus transitioned to PAID');

    // 9. Verify User A Cart is NOW Cleared (only after successful server payment confirmation)
    console.log('\n--- 9. Verifying User A Cart Cleared After Payment Confirmation ---');
    const cartAAfterPaid = await prisma.cart.findUnique({
      where: { userId: userA.id },
      include: { items: true },
    });
    assert(cartAAfterPaid?.items.length === 0, 'User A cart is cleared in DB after server confirms payment as PAID');

    // Verify User B Cart is UNTOUCHED
    const cartBAfterPaid = await prisma.cart.findUnique({
      where: { userId: userB.id },
      include: { items: true },
    });
    assert(cartBAfterPaid?.items.length === 1, 'User B cart remains completely untouched (User isolation preserved)');

    // 10. Idempotency Check on Repeated Verification
    console.log('\n--- 10. Idempotent Repeated Verification / Webhook Replay ---');
    const resVerifyReplay = createMockRes();
    await razorpayVerifyHandler(reqVerify, resVerifyReplay);
    assert(resVerifyReplay.statusCode === 200, 'Repeated verification returns HTTP 200 (idempotent)');
    assert(resVerifyReplay.data?.alreadyPaid === true, 'Repeated verification identifies alreadyPaid: true');

    const cartAAfterReplay = await prisma.cart.findUnique({
      where: { userId: userA.id },
      include: { items: true },
    });
    assert(cartAAfterReplay?.items.length === 0, 'User A cart remains in valid empty state after repeated verification');

    // 11. Test Reconciliation Flow Cart Clearing (Phase 1J-D reconciliation)
    console.log('\n--- 11. Testing Reconciliation Flow Cart Clearing ---');
    // Create new order for User B
    const reqCreateOrderB = {
      method: 'POST',
      _testUser: userB,
      headers: { authorization: `Bearer ${testClerkUserB}` },
      body: {
        customerName: 'Rahul Sen',
        customerPhone: '9876543211',
        shippingAddress: {
          line1: '45 Park Street',
          city: 'Kolkata',
          state: 'West Bengal',
          pincode: '700016',
        },
        idempotencyKey: `cart_persist_ord_b_${ts}`,
      },
    };

    const resCreateOrderB = createMockRes();
    await ordersHandler(reqCreateOrderB, resCreateOrderB);
    const orderB = resCreateOrderB.data?.order;
    if (orderB?.id) createdOrderIds.push(orderB.id);

    // Verify User B cart still exists after creating order
    const cartBAfterOrder = await prisma.cart.findUnique({
      where: { userId: userB.id },
      include: { items: true },
    });
    assert(cartBAfterOrder?.items.length === 1, 'User B cart exists after order creation');

    const mockRazorpayAmountB = Math.round(orderB.grandTotal * 100);
    const mockRazorpayOrderB = {
      id: `order_rec_b_${ts}`,
      entity: 'order',
      amount: mockRazorpayAmountB,
      currency: 'INR',
      status: 'paid',
      amount_paid: mockRazorpayAmountB,
      attempts: 1,
    };

    const mockCapturedPaymentB = {
      id: `pay_rec_b_${ts}`,
      entity: 'payment',
      order_id: mockRazorpayOrderB.id,
      amount: mockRazorpayAmountB,
      currency: 'INR',
      status: 'captured',
      captured: true,
    };

    // Attach paymentOrderId to orderB
    await prisma.order.update({
      where: { id: orderB.id },
      data: {
        paymentProvider: 'RAZORPAY',
        paymentOrderId: mockRazorpayOrderB.id,
      },
    });

    // Reconcile
    const reqReconcile = {
      method: 'POST',
      _testUser: userB,
      _testRazorpayOrder: mockRazorpayOrderB,
      _testPayment: mockCapturedPaymentB,
      headers: { authorization: `Bearer ${testClerkUserB}` },
      body: { orderId: orderB.id },
    };

    const resReconcile = createMockRes();
    await razorpayReconcileHandler(reqReconcile, resReconcile);

    assert(resReconcile.statusCode === 200, 'Reconciliation returns HTTP 200');
    assert(resReconcile.data?.reconciled === true, 'Reconciliation marked order as reconciled');

    const cartBAfterReconciliation = await prisma.cart.findUnique({
      where: { userId: userB.id },
      include: { items: true },
    });
    assert(
      cartBAfterReconciliation?.items.length === 0,
      'User B cart is cleared in DB upon successful Phase 1J-D reconciliation'
    );

  } finally {
    // 12. Cleanup
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      if (createdOrderIds.length > 0) {
        await prisma.orderItem.deleteMany({
          where: { orderId: { in: createdOrderIds } },
        });
        await prisma.order.deleteMany({
          where: { id: { in: createdOrderIds } },
        });
      }

      if (userA || userB) {
        const uIds = [userA?.id, userB?.id].filter(Boolean);
        await prisma.cartItem.deleteMany({
          where: { cart: { userId: { in: uIds } } },
        });
        await prisma.cart.deleteMany({
          where: { userId: { in: uIds } },
        });
        await prisma.user.deleteMany({
          where: { id: { in: uIds } },
        });
      }

      if (product1 || product2) {
        const pIds = [product1?.id, product2?.id].filter(Boolean);
        await prisma.product.deleteMany({
          where: { id: { in: pIds } },
        });
      }
      console.log('Cleanup completed successfully.\n');
    } catch (cleanErr) {
      console.error('Cleanup error:', cleanErr);
    }
  }

  console.log('====================================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('====================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runCartPersistenceTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
