import 'dotenv/config';
import crypto from 'crypto';
import prisma from '../src/lib/prisma.js';
import razorpayRouter, {
  handleVerifyPayment as razorpayVerifyHandler,
  handleWebhook as razorpayWebhookHandler,
  handleCreatePaymentOrder as razorpayOrderHandler,
  handleReconcilePayment as razorpayReconcileHandler,
} from '../api/payments/razorpay.js';
import {
  validateRazorpayCheckoutSignature,
  validateRazorpayWebhookSignature,
  rupeesToPaise,
  paiseToRupees,
  transitionOrderToPaid,
  fetchAndReconcileGatewayOrder,
} from '../api/_utils/razorpay.js';
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

async function runTests() {
  process.env.NODE_ENV = 'test';
  const testKeyId = 'rzp_test_alongkar12345';
  const testKeySecret = 'secret_alongkar_test_key_123456';
  const testWebhookSecret = 'webhook_secret_alongkar_test_789012';

  process.env.RAZORPAY_KEY_ID = testKeyId;
  process.env.RAZORPAY_KEY_SECRET = testKeySecret;
  process.env.RAZORPAY_WEBHOOK_SECRET = testWebhookSecret;

  console.log('====================================================================');
  console.log('PHASE 1J-D: RAZORPAY PAYMENT RECONCILIATION & RECOVERY SUITE');
  console.log('====================================================================\n');

  const ts = Date.now();
  const testClerkUser1 = `user_rec_test_1_${ts}`;
  const testClerkUser2 = `user_rec_test_2_${ts}`;

  let user1: any;
  let user2: any;
  let testProduct: any;

  try {
    // 1. Setup test users and product
    user1 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser1,
        email: `rec_test_user1_${ts}@alongkar.com`,
      },
    });

    user2 = await prisma.user.create({
      data: {
        clerkUserId: testClerkUser2,
        email: `rec_test_user2_${ts}@alongkar.com`,
      },
    });

    testProduct = await prisma.product.create({
      data: {
        name: `Reconciliation Gold Ring ${ts}`,
        slug: `rec-gold-ring-${ts}`,
        category: 'Rings',
        price: 4999.0,
        originalPrice: 5999.0,
        image: '/products/ring.jpg',
        hoverImage: '/products/ring-hover.jpg',
        description: 'Exclusive 22KT Gold Ring crafted by Alongkar.',
        finish: 'Antique 22KT Yellow Gold',
        baseMaterial: '22KT Yellow Gold',
        warranty: 'Lifetime Gold Authenticity Certification',
        inStock: true,
      },
    });

    console.log('--- SECTION 1: UNIT TESTS FOR RECONCILIATION HELPER ---');
    {
      const mockOrder = {
        id: `ord_mock_1_${ts}`,
        orderNumber: `ORD-REC-1`,
        paymentOrderId: 'order_mock_rzp_123',
        grandTotal: new Prisma.Decimal('4999.00'),
        currency: 'INR',
      };

      // Test 1.1: Unpaid Razorpay Order
      const unpaidResult = await fetchAndReconcileGatewayOrder(
        mockOrder,
        null,
        {
          testRazorpayOrder: {
            id: 'order_mock_rzp_123',
            amount: 499900,
            amount_paid: 0,
            currency: 'INR',
            status: 'created',
            attempts: 0,
          },
        }
      );
      assert(unpaidResult.status === 'unpaid', 'Helper identifies unpaid Razorpay order');

      // Test 1.2: Paid Razorpay Order with valid captured payment
      const paidResult = await fetchAndReconcileGatewayOrder(
        mockOrder,
        null,
        {
          testRazorpayOrder: {
            id: 'order_mock_rzp_123',
            amount: 499900,
            amount_paid: 499900,
            currency: 'INR',
            status: 'paid',
            attempts: 1,
          },
          testRazorpayPayments: {
            items: [
              {
                id: 'pay_rec_valid_123',
                order_id: 'order_mock_rzp_123',
                amount: 499900,
                currency: 'INR',
                status: 'captured',
              },
            ],
          },
        }
      );
      assert(paidResult.status === 'paid' && paidResult.paymentId === 'pay_rec_valid_123', 'Helper identifies valid paid & captured payment');

      // Test 1.3: Amount mismatch rejected
      const amountMismatchResult = await fetchAndReconcileGatewayOrder(
        mockOrder,
        null,
        {
          testRazorpayOrder: {
            id: 'order_mock_rzp_123',
            amount: 499900,
            amount_paid: 499900,
            currency: 'INR',
            status: 'paid',
            attempts: 1,
          },
          testRazorpayPayments: {
            items: [
              {
                id: 'pay_rec_bad_amt',
                order_id: 'order_mock_rzp_123',
                amount: 100000, // 1000 INR instead of 4999 INR
                currency: 'INR',
                status: 'captured',
              },
            ],
          },
        }
      );
      assert(amountMismatchResult.status === 'validation_error', 'Helper rejects captured payment with mismatched amount');

      // Test 1.4: Currency mismatch rejected
      const currencyMismatchResult = await fetchAndReconcileGatewayOrder(
        mockOrder,
        null,
        {
          testRazorpayOrder: {
            id: 'order_mock_rzp_123',
            amount: 499900,
            amount_paid: 499900,
            currency: 'USD',
            status: 'paid',
            attempts: 1,
          },
        }
      );
      assert(currencyMismatchResult.status === 'validation_error', 'Helper rejects Razorpay order with mismatched currency');

      // Test 1.5: Gateway failure returns retryable gateway_error
      const failingClient = {
        orders: {
          fetch: async () => {
            throw new Error('ETIMEDOUT: Razorpay API timeout');
          },
        },
      };
      const gatewayErrResult = await fetchAndReconcileGatewayOrder(mockOrder, failingClient);
      assert(gatewayErrResult.status === 'gateway_error' && gatewayErrResult.isRetryable === true, 'Helper handles gateway downtime as retryable gateway_error');
    }

    console.log('\n--- SECTION 2: PAYMENT ORDER REUSE & AUTO-RECONCILIATION ---');
    {
      // Create Alongkar Order in PENDING_PAYMENT
      const alongkarOrder1 = await prisma.order.create({
        data: {
          orderNumber: `ORD-REC-TEST-1-${ts}`,
          userId: user1.id,
          customerName: 'Customer 1',
          customerEmail: 'c1@alongkar.com',
          customerPhone: '9876543210',
          subtotal: new Prisma.Decimal('4999.00'),
          discountTotal: new Prisma.Decimal('0.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          currency: 'INR',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          paymentProvider: 'RAZORPAY',
          paymentOrderId: 'order_rzp_unpaid_1',
          shippingAddressLine1: '123 Atelier Street',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700001',
          shippingCountry: 'India',
        },
      });

      // 2.1 Reusing unpaid order should return existing Razorpay order ID
      const reqUnpaid: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder1.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
        _testRazorpayOrder: {
          id: 'order_rzp_unpaid_1',
          amount: 499900,
          amount_paid: 0,
          currency: 'INR',
          status: 'created',
          attempts: 0,
        },
      };
      const resUnpaid = createMockRes();
      await razorpayOrderHandler(reqUnpaid, resUnpaid);
      assert(resUnpaid.statusCode === 200, 'Reusing unpaid order returns HTTP 200');
      assert(resUnpaid.data?.razorpayOrderId === 'order_rzp_unpaid_1', 'Reuses existing unpaid Razorpay order ID');
      assert(!resUnpaid.data?.alreadyPaid, 'Does not claim alreadyPaid for unpaid order');

      // 2.2 Calling /order on an order already paid on gateway should auto-reconcile to CONFIRMED + PAID + READY
      const reqPaid: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder1.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
        _testRazorpayOrder: {
          id: 'order_rzp_unpaid_1',
          amount: 499900,
          amount_paid: 499900,
          currency: 'INR',
          status: 'paid',
          attempts: 1,
        },
        _testRazorpayPayments: {
          items: [
            {
              id: 'pay_captured_auto_rec_1',
              order_id: 'order_rzp_unpaid_1',
              amount: 499900,
              currency: 'INR',
              status: 'captured',
            },
          ],
        },
      };
      const resPaid = createMockRes();
      await razorpayOrderHandler(reqPaid, resPaid);
      assert(resPaid.statusCode === 200, 'Reconciling already-paid order returns HTTP 200');
      assert(resPaid.data?.alreadyPaid === true, 'Returns alreadyPaid: true flag');
      assert(resPaid.data?.order?.status === 'CONFIRMED', 'Order status transitioned to CONFIRMED');
      assert(resPaid.data?.order?.paymentStatus === 'PAID', 'Order paymentStatus transitioned to PAID');
      assert(resPaid.data?.order?.shippingStatus === 'READY', 'Order shippingStatus transitioned to READY');

      // Check DB record
      const dbOrder1 = await prisma.order.findUnique({ where: { id: alongkarOrder1.id } });
      assert(dbOrder1?.status === 'CONFIRMED' && dbOrder1?.paymentStatus === 'PAID', 'Database order is atomically CONFIRMED + PAID');
      assert(dbOrder1?.paymentTransactionId === 'pay_captured_auto_rec_1', 'Database order stores captured transaction ID');
      assert(dbOrder1?.paidAt !== null, 'Database order records paidAt timestamp');
    }

    console.log('\n--- SECTION 3: GATEWAY UNAVAILABILITY DURING ORDER REUSE ---');
    {
      const alongkarOrder2 = await prisma.order.create({
        data: {
          orderNumber: `ORD-REC-TEST-2-${ts}`,
          userId: user1.id,
          customerName: 'Customer 1',
          customerEmail: 'c1@alongkar.com',
          customerPhone: '9876543210',
          subtotal: new Prisma.Decimal('4999.00'),
          discountTotal: new Prisma.Decimal('0.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          currency: 'INR',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          paymentProvider: 'RAZORPAY',
          paymentOrderId: 'order_rzp_temp_down',
          shippingAddressLine1: '123 Atelier Street',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700001',
          shippingCountry: 'India',
        },
      });

      const res502 = createMockRes();
      const reqMock502: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder2.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
      };
      // Using invalid gateway key that triggers gateway error
      process.env.RAZORPAY_KEY_ID = 'rzp_test_invalid_fail';
      process.env.RAZORPAY_KEY_SECRET = 'invalid_secret';

      await razorpayOrderHandler(reqMock502, res502);
      assert(res502.statusCode === 502, 'Gateway failure on reuse returns HTTP 502 Bad Gateway');
      assert(res502.data?.error?.includes('gateway is temporarily unavailable') || res502.data?.error?.includes('Failed'), 'Returns user-friendly retryable error message');

      // Reset test keys
      process.env.RAZORPAY_KEY_ID = testKeyId;
      process.env.RAZORPAY_KEY_SECRET = testKeySecret;
    }

    console.log('\n--- SECTION 4: EXPLICIT RECONCILIATION ENDPOINT (POST /api/payments/razorpay/reconcile) ---');
    {
      const alongkarOrder3 = await prisma.order.create({
        data: {
          orderNumber: `ORD-REC-TEST-3-${ts}`,
          userId: user1.id,
          customerName: 'Customer 1',
          customerEmail: 'c1@alongkar.com',
          customerPhone: '9876543210',
          subtotal: new Prisma.Decimal('4999.00'),
          discountTotal: new Prisma.Decimal('0.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          currency: 'INR',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          paymentProvider: 'RAZORPAY',
          paymentOrderId: 'order_rzp_reconcile_3',
          shippingAddressLine1: '123 Atelier Street',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700001',
          shippingCountry: 'India',
        },
      });

      // 4.1 Unauthenticated call rejected
      const reqUnauth: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder3.id },
      };
      const resUnauth = createMockRes();
      await razorpayReconcileHandler(reqUnauth, resUnauth);
      assert(resUnauth.statusCode === 401, 'Unauthenticated reconciliation request returns HTTP 401');

      // 4.2 Cross-user access blocked
      const reqCrossUser: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder3.id },
        _testUser: { id: user2.id, clerkId: user2.clerkId },
      };
      const resCrossUser = createMockRes();
      await razorpayReconcileHandler(reqCrossUser, resCrossUser);
      assert(resCrossUser.statusCode === 404, 'Cross-user reconciliation request returns HTTP 404');

      // 4.3 Successful reconciliation of paid order
      const reqReconcileSuccess: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder3.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
        _testRazorpayOrder: {
          id: 'order_rzp_reconcile_3',
          amount: 499900,
          amount_paid: 499900,
          currency: 'INR',
          status: 'paid',
          attempts: 1,
        },
        _testRazorpayPayments: {
          items: [
            {
              id: 'pay_captured_reconcile_3',
              order_id: 'order_rzp_reconcile_3',
              amount: 499900,
              currency: 'INR',
              status: 'captured',
            },
          ],
        },
      };
      const resReconcileSuccess = createMockRes();
      await razorpayReconcileHandler(reqReconcileSuccess, resReconcileSuccess);
      assert(resReconcileSuccess.statusCode === 200, 'Successful reconciliation returns HTTP 200');
      assert(resReconcileSuccess.data?.reconciled === true, 'Response contains reconciled: true');
      assert(resReconcileSuccess.data?.order?.status === 'CONFIRMED', 'Order is CONFIRMED');
      assert(resReconcileSuccess.data?.order?.paymentStatus === 'PAID', 'Order is PAID');

      // 4.4 Idempotent re-reconciliation of already-paid order
      const resReconcileIdempotent = createMockRes();
      await razorpayReconcileHandler(reqReconcileSuccess, resReconcileIdempotent);
      assert(resReconcileIdempotent.statusCode === 200, 'Idempotent reconciliation returns HTTP 200');
      assert(resReconcileIdempotent.data?.alreadyPaid === true, 'Response contains alreadyPaid: true');

      // 4.5 Cancelled order cannot be reconciled
      const cancelledOrder = await prisma.order.create({
        data: {
          orderNumber: `ORD-REC-CANCELLED-${ts}`,
          userId: user1.id,
          customerName: 'Customer 1',
          customerEmail: 'c1@alongkar.com',
          customerPhone: '9876543210',
          subtotal: new Prisma.Decimal('4999.00'),
          discountTotal: new Prisma.Decimal('0.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          currency: 'INR',
          status: 'CANCELLED',
          paymentStatus: 'CANCELLED',
          paymentProvider: 'RAZORPAY',
          paymentOrderId: 'order_rzp_cancelled_1',
          shippingAddressLine1: '123 Atelier Street',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700001',
          shippingCountry: 'India',
        },
      });

      const reqCancelled: any = {
        method: 'POST',
        headers: { host: 'localhost' },
        body: { orderId: cancelledOrder.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
      };
      const resCancelled = createMockRes();
      await razorpayReconcileHandler(reqCancelled, resCancelled);
      assert(resCancelled.statusCode === 400, 'Cancelled order reconciliation is rejected with HTTP 400');
    }

    console.log('\n--- SECTION 5: ROUTER DISPATCHING & MULTI-ACTION HANDLING ---');
    {
      const alongkarOrder4 = await prisma.order.create({
        data: {
          orderNumber: `ORD-REC-ROUTER-${ts}`,
          userId: user1.id,
          customerName: 'Customer 1',
          customerEmail: 'c1@alongkar.com',
          customerPhone: '9876543210',
          subtotal: new Prisma.Decimal('4999.00'),
          discountTotal: new Prisma.Decimal('0.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          currency: 'INR',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          paymentProvider: 'RAZORPAY',
          paymentOrderId: 'order_rzp_router_4',
          shippingAddressLine1: '123 Atelier Street',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700001',
          shippingCountry: 'India',
        },
      });

      // 5.1 Router dispatch via query param ?action=reconcile
      const reqRouterQuery: any = {
        method: 'POST',
        url: '/api/payments/razorpay?action=reconcile',
        query: { action: 'reconcile' },
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder4.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
        _testRazorpayOrder: {
          id: 'order_rzp_router_4',
          amount: 499900,
          amount_paid: 499900,
          currency: 'INR',
          status: 'paid',
          attempts: 1,
        },
        _testRazorpayPayments: {
          items: [
            {
              id: 'pay_captured_router_4',
              order_id: 'order_rzp_router_4',
              amount: 499900,
              currency: 'INR',
              status: 'captured',
            },
          ],
        },
      };
      const resRouterQuery = createMockRes();
      await razorpayRouter(reqRouterQuery, resRouterQuery);
      assert(resRouterQuery.statusCode === 200, 'Router dispatches action=reconcile via query param');
      assert(resRouterQuery.data?.reconciled === true, 'Router successfully executes reconciliation');

      // 5.2 Router dispatch via URL path /reconcile
      const reqRouterPath: any = {
        method: 'POST',
        url: '/api/payments/razorpay/reconcile',
        headers: { host: 'localhost' },
        body: { orderId: alongkarOrder4.id },
        _testUser: { id: user1.id, clerkId: user1.clerkId },
      };
      const resRouterPath = createMockRes();
      await razorpayRouter(reqRouterPath, resRouterPath);
      assert(resRouterPath.statusCode === 200, 'Router dispatches action=reconcile via path');
    }

    console.log('\n--- SECTION 6: WEBHOOK & VERIFY REGRESSION WITH SHARED TRANSITION ---');
    {
      const alongkarOrder5 = await prisma.order.create({
        data: {
          orderNumber: `ORD-REC-WH-${ts}`,
          userId: user1.id,
          customerName: 'Customer 1',
          customerEmail: 'c1@alongkar.com',
          customerPhone: '9876543210',
          subtotal: new Prisma.Decimal('4999.00'),
          discountTotal: new Prisma.Decimal('0.00'),
          shippingFee: new Prisma.Decimal('0.00'),
          taxTotal: new Prisma.Decimal('0.00'),
          grandTotal: new Prisma.Decimal('4999.00'),
          currency: 'INR',
          status: 'PENDING_PAYMENT',
          paymentStatus: 'PENDING',
          paymentProvider: 'RAZORPAY',
          paymentOrderId: `order_rzp_wh_${ts}`,
          shippingAddressLine1: '123 Atelier Street',
          shippingCity: 'Kolkata',
          shippingState: 'West Bengal',
          shippingPincode: '700001',
          shippingCountry: 'India',
        },
      });

      // Test webhook payment.captured
      const webhookPayload = JSON.stringify({
        event: 'payment.captured',
        payload: {
          payment: {
            entity: {
              id: `pay_wh_${ts}`,
              order_id: `order_rzp_wh_${ts}`,
              amount: 499900,
              currency: 'INR',
              status: 'captured',
            },
          },
        },
      });
      const signature = generateWebhookSignature(webhookPayload, testWebhookSecret);

      const reqWebhook: any = {
        method: 'POST',
        headers: {
          'x-razorpay-signature': signature,
          'content-type': 'application/json',
        },
        body: JSON.parse(webhookPayload),
        rawBody: webhookPayload,
      };
      const resWebhook = createMockRes();
      await razorpayWebhookHandler(reqWebhook, resWebhook);
      assert(resWebhook.statusCode === 200, 'Webhook payment.captured processed with HTTP 200');

      const dbOrder5 = await prisma.order.findUnique({ where: { id: alongkarOrder5.id } });
      assert(dbOrder5?.status === 'CONFIRMED' && dbOrder5?.paymentStatus === 'PAID', 'Webhook atomically transitions order to CONFIRMED + PAID');
      assert(dbOrder5?.shippingStatus === 'READY', 'Webhook sets shippingStatus: READY');
    }

  } finally {
    // Cleanup created test records
    console.log('\n--- CLEANING UP TEST DATA ---');
    try {
      if (user1) {
        await prisma.orderItem.deleteMany({ where: { order: { userId: user1.id } } });
        await prisma.order.deleteMany({ where: { userId: user1.id } });
        await prisma.user.delete({ where: { id: user1.id } });
      }
      if (user2) {
        await prisma.orderItem.deleteMany({ where: { order: { userId: user2.id } } });
        await prisma.order.deleteMany({ where: { userId: user2.id } });
        await prisma.user.delete({ where: { id: user2.id } });
      }
      if (testProduct) {
        await prisma.product.delete({ where: { id: testProduct.id } });
      }
      console.log('Cleanup completed successfully.');
    } catch (cleanupErr) {
      console.warn('Cleanup warning:', cleanupErr);
    }
  }

  console.log('\n====================================================================');
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} PASSED (${failedTests} FAILED)`);
  console.log('====================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Unhandled test suite error:', err);
  process.exit(1);
});
