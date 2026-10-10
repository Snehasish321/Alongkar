/**
 * Phase 3-J Task 3: Razorpay Refund Webhook Unit Test Suite
 *
 * Verifies signed webhook payload ingestion, order resolution, signature checking,
 * idempotency, out-of-order delivery, and refund status updates in memory.
 *
 * Does NOT connect to any database, network, or external Razorpay service.
 */

// Set guard unit-test mode before loading guard module to prevent any DB connection
process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import crypto from 'crypto';
import {
  handleWebhook,
  findOrderForRefundWebhook,
} from '../api/payments/razorpay.js';
import { REFUND_CLAIM_PREFIX } from '../api/_utils/orderCancellation.js';

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

const TEST_WEBHOOK_SECRET = 'webhook_secret_phase3j_task3_123456';
process.env.RAZORPAY_WEBHOOK_SECRET = TEST_WEBHOOK_SECRET;

function generateSignature(payloadString: string, secret: string = TEST_WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(Buffer.from(payloadString, 'utf8')).digest('hex');
}

function createMockReqRes(bodyObj: any, signatureOverride?: string | null) {
  const bodyString = typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj);
  const signature = signatureOverride !== undefined ? signatureOverride : generateSignature(bodyString);

  const req: any = {
    method: 'POST',
    url: '/api/payments/razorpay/webhook',
    headers: {
      'content-type': 'application/json',
      ...(signature ? { 'x-razorpay-signature': signature } : {}),
    },
    body: bodyObj,
    rawBody: bodyString,
  };

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

  return { req, res, bodyString };
}

function createMockOrderDb(initialOrders: any[] = []) {
  const orders: Map<string, any> = new Map();
  for (const ord of initialOrders) {
    orders.set(ord.id, { ...ord });
  }

  return {
    orders,
    order: {
      findUnique: async ({ where }: any) => {
        if (where.id && orders.has(where.id)) {
          return { ...orders.get(where.id) };
        }
        if (where.orderNumber) {
          for (const ord of orders.values()) {
            if (ord.orderNumber === where.orderNumber) {
              return { ...ord };
            }
          }
        }
        return null;
      },
      findFirst: async ({ where }: any) => {
        for (const ord of orders.values()) {
          let match = true;
          if (where.id && ord.id !== where.id) match = false;
          if (where.orderNumber && ord.orderNumber !== where.orderNumber) match = false;
          if (where.paymentTransactionId && ord.paymentTransactionId !== where.paymentTransactionId) match = false;
          if (where.paymentOrderId && ord.paymentOrderId !== where.paymentOrderId) match = false;
          if (match) return { ...ord };
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        let targetId = where.id;
        if (!targetId && where.orderNumber) {
          for (const ord of orders.values()) {
            if (ord.orderNumber === where.orderNumber) targetId = ord.id;
          }
        }
        if (!targetId || !orders.has(targetId)) {
          throw new Error('Record not found');
        }
        const updated = { ...orders.get(targetId), ...data };
        orders.set(targetId, updated);
        return { ...updated };
      },
    },
  };
}

async function runTests() {
  console.log('====================================================================');
  console.log('PHASE 3-J TASK 3: RAZORPAY REFUND WEBHOOK UNIT TESTS');
  console.log('====================================================================\n');

  const baseOrder = {
    id: 'cuid_webhook_test_order_1',
    orderNumber: 'ORD-WH-001',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentTransactionId: 'pay_wh_test_123',
    paymentOrderId: 'order_rzp_123',
    grandTotal: 3500.0, // 350,000 paise
    currency: 'INR',
    paymentSessionId: `${REFUND_CLAIM_PREFIX}active_claim_123:${Date.now()}`,
    adminNotes: 'Order cancelled by admin',
    paymentFailureReason: null,
  };

  // ─── 1. Signature Verification Tests ──────────────────────────────────────
  console.log('--- 1. Cryptographic Signature Validation Tests ---');
  {
    // 1.1 Missing signature header
    const { req: reqMissing, res: resMissing } = createMockReqRes({ event: 'refund.processed' }, null);
    await handleWebhook(reqMissing, resMissing);
    assert(resMissing.statusCode === 400, 'Rejects webhook missing X-Razorpay-Signature with HTTP 400');
    assert(resMissing.data?.error?.includes('Missing X-Razorpay-Signature'), 'Explains missing signature header');

    // 1.2 Invalid signature
    const { req: reqInvalid, res: resInvalid } = createMockReqRes({ event: 'refund.processed' }, 'invalid_hex_signature_abcdef123456');
    await handleWebhook(reqInvalid, resInvalid);
    assert(resInvalid.statusCode === 400, 'Rejects webhook with invalid signature with HTTP 400');
    assert(resInvalid.data?.error?.includes('Invalid webhook signature'), 'Explains invalid signature');

    // 1.3 Empty payload
    const reqEmpty: any = {
      method: 'POST',
      url: '/api/payments/razorpay/webhook',
      headers: { 'x-razorpay-signature': 'some_sig' },
      body: null,
      rawBody: '',
    };
    const resEmpty: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(data: any) { this.data = data; return this; },
    };
    await handleWebhook(reqEmpty, resEmpty);
    assert(resEmpty.statusCode === 400, 'Rejects empty body payload with HTTP 400');
  }

  // ─── 2. Order Resolution Helper (findOrderForRefundWebhook) ────────────────
  console.log('\n--- 2. Trustworthy Order Resolution & Contradiction Guard ---');
  {
    const mockDb = createMockOrderDb([baseOrder]);

    // 2.1 Resolution by notes.orderId
    const resByNotesId = await findOrderForRefundWebhook(
      { notes: { orderId: baseOrder.id } },
      mockDb
    );
    assert(resByNotesId.order?.id === baseOrder.id, 'Resolves order via notes.orderId');

    // 2.2 Resolution by notes.orderNumber
    const resByNotesNum = await findOrderForRefundWebhook(
      { notes: { orderNumber: baseOrder.orderNumber } },
      mockDb
    );
    assert(resByNotesNum.order?.id === baseOrder.id, 'Resolves order via notes.orderNumber');

    // 2.3 Resolution by receipt ref_ORD-WH-001
    const resByReceipt = await findOrderForRefundWebhook(
      { receipt: `ref_${baseOrder.orderNumber}` },
      mockDb
    );
    assert(resByReceipt.order?.id === baseOrder.id, 'Resolves order via receipt ref_<orderNumber>');

    // 2.4 Resolution by payment_id
    const resByPaymentId = await findOrderForRefundWebhook(
      { payment_id: baseOrder.paymentTransactionId },
      mockDb
    );
    assert(resByPaymentId.order?.id === baseOrder.id, 'Resolves order via payment_id matching paymentTransactionId');

    // 2.5 Contradiction Guard: payment_id mismatch
    const resContradictPayment = await findOrderForRefundWebhook(
      {
        notes: { orderId: baseOrder.id },
        payment_id: 'pay_DIFFERENT_UNRELATED',
      },
      mockDb
    );
    assert(resContradictPayment.order === null, 'Rejects candidate when payment_id contradicts order paymentTransactionId');
    assert(resContradictPayment.error?.includes('Payment ID mismatch'), 'Identifies Payment ID mismatch');

    // 2.6 Contradiction Guard: receipt mismatch
    const resContradictReceipt = await findOrderForRefundWebhook(
      {
        notes: { orderId: baseOrder.id },
        receipt: 'ref_ORD-OTHER-999',
      },
      mockDb
    );
    assert(resContradictReceipt.order === null, 'Rejects candidate when receipt contradicts order orderNumber');
    assert(resContradictReceipt.error?.includes('Receipt mismatch'), 'Identifies Receipt mismatch');

    // 2.7 Unknown order identifiers
    const resUnknown = await findOrderForRefundWebhook(
      { notes: { orderId: 'cuid_nonexistent' } },
      mockDb
    );
    assert(resUnknown.order === null, 'Returns order: null for nonexistent identifier');
  }

  // ─── 3. refund.processed Webhook Ingestion ────────────────────────────────
  console.log('\n--- 3. refund.processed Webhook Ingestion ---');
  {
    const mockDb = createMockOrderDb([baseOrder]);
    // Inject mock DB into global prisma for this test scope
    const prismaModule = await import('../src/lib/prisma.js');
    const originalOrder = prismaModule.default.order;
    (prismaModule.default as any).order = mockDb.order;

    try {
      const payload = {
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_processed_test_1',
              amount: 350000, // 3500 * 100 paise
              currency: 'INR',
              payment_id: baseOrder.paymentTransactionId,
              receipt: `ref_${baseOrder.orderNumber}`,
              status: 'processed',
              notes: {
                orderId: baseOrder.id,
                orderNumber: baseOrder.orderNumber,
              },
            },
          },
        },
      };

      const { req, res } = createMockReqRes(payload);
      await handleWebhook(req, res);

      assert(res.statusCode === 200, 'refund.processed responds with HTTP 200');
      assert(res.data?.status === 'refund_processed', 'Status is refund_processed');
      assert(res.data?.refundId === 'rfnd_processed_test_1', 'Reports processed refund ID');

      const updated = mockDb.orders.get(baseOrder.id);
      assert(updated.paymentStatus === 'REFUNDED', 'Transitions order paymentStatus to REFUNDED');
      assert(updated.paymentSessionId === null, 'Clears active paymentSessionId claim token');
      assert(updated.paymentFailureReason === null, 'Clears paymentFailureReason');
      assert(updated.adminNotes?.includes('rfnd_processed_test_1'), 'Appends refund ID to adminNotes');
    } finally {
      (prismaModule.default as any).order = originalOrder;
    }
  }

  // ─── 4. Idempotent Replay of refund.processed ──────────────────────────────
  console.log('\n--- 4. Idempotent Replay of refund.processed ---');
  {
    const alreadyRefundedOrder = {
      ...baseOrder,
      paymentStatus: 'REFUNDED',
      paymentSessionId: null,
      adminNotes: 'Already refunded',
    };
    const mockDb = createMockOrderDb([alreadyRefundedOrder]);
    const prismaModule = await import('../src/lib/prisma.js');
    const originalOrder = prismaModule.default.order;
    (prismaModule.default as any).order = mockDb.order;

    try {
      const payload = {
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_duplicate_test_2',
              amount: 350000,
              payment_id: baseOrder.paymentTransactionId,
              receipt: `ref_${baseOrder.orderNumber}`,
              status: 'processed',
              notes: { orderId: baseOrder.id },
            },
          },
        },
      };

      const { req, res } = createMockReqRes(payload);
      await handleWebhook(req, res);

      assert(res.statusCode === 200, 'Duplicate delivery responds with HTTP 200');
      assert(res.data?.status === 'already_processed', 'Acknowledges already_processed');
      assert(res.data?.idempotentReplay === true, 'Flags idempotentReplay: true');
    } finally {
      (prismaModule.default as any).order = originalOrder;
    }
  }

  // ─── 5. Mismatched Refund Amount Rejection ─────────────────────────────────
  console.log('\n--- 5. Mismatched Refund Amount Rejection ---');
  {
    const mockDb = createMockOrderDb([baseOrder]);
    const prismaModule = await import('../src/lib/prisma.js');
    const originalOrder = prismaModule.default.order;
    (prismaModule.default as any).order = mockDb.order;

    try {
      const payload = {
        event: 'refund.processed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_wrong_amount_test',
              amount: 100000, // 1000 INR instead of 3500 INR
              payment_id: baseOrder.paymentTransactionId,
              receipt: `ref_${baseOrder.orderNumber}`,
              status: 'processed',
              notes: { orderId: baseOrder.id },
            },
          },
        },
      };

      const { req, res } = createMockReqRes(payload);
      await handleWebhook(req, res);

      assert(res.statusCode === 200, 'Responds with HTTP 200 to acknowledge delivery');
      assert(res.data?.status === 'refund_amount_mismatch', 'Identifies refund_amount_mismatch');

      const unchangedOrder = mockDb.orders.get(baseOrder.id);
      assert(unchangedOrder.paymentStatus === 'PAID', 'Preserves paymentStatus as PAID (does NOT mark REFUNDED)');
    } finally {
      (prismaModule.default as any).order = originalOrder;
    }
  }

  // ─── 6. refund.failed Webhook Ingestion ───────────────────────────────────
  console.log('\n--- 6. refund.failed Webhook Ingestion ---');
  {
    const mockDb = createMockOrderDb([baseOrder]);
    const prismaModule = await import('../src/lib/prisma.js');
    const originalOrder = prismaModule.default.order;
    (prismaModule.default as any).order = mockDb.order;

    try {
      const payload = {
        event: 'refund.failed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_failed_test_3',
              amount: 350000,
              payment_id: baseOrder.paymentTransactionId,
              receipt: `ref_${baseOrder.orderNumber}`,
              status: 'failed',
              error_description: 'Beneficiary card account closed or invalid',
              notes: { orderId: baseOrder.id },
            },
          },
        },
      };

      const { req, res } = createMockReqRes(payload);
      await handleWebhook(req, res);

      assert(res.statusCode === 200, 'refund.failed responds with HTTP 200');
      assert(res.data?.status === 'refund_failure_recorded', 'Status is refund_failure_recorded');

      const failedOrder = mockDb.orders.get(baseOrder.id);
      assert(failedOrder.paymentStatus === 'PAID', 'Preserves/reverts paymentStatus to PAID so admin can retry');
      assert(failedOrder.paymentSessionId === null, 'Clears paymentSessionId claim so retry is not blocked');
      assert(
        failedOrder.paymentFailureReason?.includes('Beneficiary card account closed'),
        'Records gateway failure description in paymentFailureReason'
      );
    } finally {
      (prismaModule.default as any).order = originalOrder;
    }
  }

  // ─── 7. Out-of-Order: refund.failed Arriving After Order Marked REFUNDED ────
  console.log('\n--- 7. Out-of-Order: refund.failed After refund.processed ---');
  {
    const previouslyRefundedOrder = {
      ...baseOrder,
      paymentStatus: 'REFUNDED',
      paymentSessionId: null,
      adminNotes: 'Previously marked refunded',
    };
    const mockDb = createMockOrderDb([previouslyRefundedOrder]);
    const prismaModule = await import('../src/lib/prisma.js');
    const originalOrder = prismaModule.default.order;
    (prismaModule.default as any).order = mockDb.order;

    try {
      const payload = {
        event: 'refund.failed',
        payload: {
          refund: {
            entity: {
              id: 'rfnd_downstream_bank_fail',
              amount: 350000,
              payment_id: baseOrder.paymentTransactionId,
              receipt: `ref_${baseOrder.orderNumber}`,
              status: 'failed',
              error_description: 'Bank reversed transaction: card expired',
              notes: { orderId: baseOrder.id },
            },
          },
        },
      };

      const { req, res } = createMockReqRes(payload);
      await handleWebhook(req, res);

      assert(res.statusCode === 200, 'Responds with HTTP 200');
      const updated = mockDb.orders.get(baseOrder.id);
      assert(updated.paymentStatus === 'PAID', 'CRITICAL: Reverts paymentStatus from REFUNDED to PAID for bank-level failure');
      assert(updated.paymentFailureReason?.includes('card expired'), 'Records failure reason for admin recovery');
    } finally {
      (prismaModule.default as any).order = originalOrder;
    }
  }

  // ─── 8. refund.created Webhook Ingestion (Safe Acknowledgment) ─────────────
  console.log('\n--- 8. refund.created Webhook Ingestion ---');
  {
    const payload = {
      event: 'refund.created',
      payload: {
        refund: {
          entity: {
            id: 'rfnd_created_only_123',
            amount: 350000,
            status: 'created',
          },
        },
      },
    };

    const { req, res } = createMockReqRes(payload);
    await handleWebhook(req, res);

    assert(res.statusCode === 200, 'refund.created responds with HTTP 200');
    assert(res.data?.status === 'refund_created_acknowledged', 'Acknowledges event without premature order status mutation');
  }

  console.log('\n====================================================================');
  console.log(`TASK 3 WEBHOOK TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
