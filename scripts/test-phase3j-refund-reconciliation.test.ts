/**
 * Phase 3-J Task 4: Refund Reconciliation and Operational Recovery Unit Tests
 *
 * Strict Safety Controls:
 * - Pure in-memory unit tests using mock database and mock Razorpay client.
 * - Zero real network calls to Razorpay APIs.
 * - Zero connection or mutations to production Neon database.
 */

import {
  reconcileOrderRefundWithGateway,
  isMatchingCancellationRefund,
  REFUND_CLAIM_PREFIX,
  type ReconcileRefundResult,
} from '../api/_utils/orderCancellation.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ [FAIL] ${message}`);
    failedTests++;
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`✅ [PASS] ${message}`);
  passedTests++;
}

// In-memory mock database store
class MockDb {
  public orders: Map<string, any> = new Map();

  reset() {
    this.orders.clear();
  }

  seedOrder(order: any) {
    this.orders.set(order.id, { ...order });
    if (order.orderNumber) {
      this.orders.set(order.orderNumber, this.orders.get(order.id));
    }
  }

  get order() {
    return {
      findFirst: async ({ where }: any) => {
        if (where.id) {
          const ord = this.orders.get(where.id);
          return ord ? { ...ord } : null;
        }
        if (where.orderNumber) {
          const ord = this.orders.get(where.orderNumber);
          return ord ? { ...ord } : null;
        }
        return null;
      },
      update: async ({ where, data }: any) => {
        const ord = this.orders.get(where.id);
        if (!ord) throw new Error(`Order ${where.id} not found`);
        const updated = { ...ord, ...data };
        this.orders.set(ord.id, updated);
        if (ord.orderNumber) this.orders.set(ord.orderNumber, updated);
        return { ...updated, items: [], user: null };
      },
      updateMany: async ({ where, data }: any) => {
        const ord = this.orders.get(where.id);
        if (!ord) return { count: 0 };
        if (where.paymentStatus && ord.paymentStatus !== where.paymentStatus) return { count: 0 };
        if (where.paymentSessionId !== undefined && ord.paymentSessionId !== where.paymentSessionId) return { count: 0 };
        const updated = { ...ord, ...data };
        this.orders.set(ord.id, updated);
        if (ord.orderNumber) this.orders.set(ord.orderNumber, updated);
        return { count: 1 };
      },
    };
  }
}

// In-memory mock Razorpay client
class MockRazorpayClient {
  public fetchRefundsResult: any = { items: [] };
  public fetchShouldThrow: Error | null = null;
  public refundCalls: any[] = [];
  public fetchCalls: any[] = [];

  reset() {
    this.fetchRefundsResult = { items: [] };
    this.fetchShouldThrow = null;
    this.refundCalls = [];
    this.fetchCalls = [];
  }

  get payments() {
    return {
      fetchMultipleRefund: async (paymentId: string) => {
        this.fetchCalls.push(paymentId);
        if (this.fetchShouldThrow) {
          throw this.fetchShouldThrow;
        }
        return this.fetchRefundsResult;
      },
      refund: async (paymentId: string, params: any) => {
        this.refundCalls.push({ paymentId, params });
        throw new Error('UNEXPECTED: payments.refund() must NEVER be called by reconciliation!');
      },
    };
  }
}

const mockDb = new MockDb();
const mockRzp = new MockRazorpayClient();

async function runTests() {
  console.log('\n====================================================================');
  console.log('PHASE 3-J TASK 4: REFUND RECONCILIATION & RECOVERY TESTS');
  console.log('====================================================================\n');

  // --- 1. Preconditions & Applicability Checks ---
  console.log('--- 1. Preconditions & Applicability Checks ---');
  mockDb.reset();
  mockRzp.reset();

  // 1A. Unknown order
  const notFound = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_nonexistent',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(!notFound.success, 'Rejects nonexistent order with success: false');
  assert(notFound.status === 404, 'Returns HTTP 404 for nonexistent order');

  // 1B. Order not cancelled
  mockDb.seedOrder({
    id: 'cuid_not_cancelled',
    orderNumber: 'ORD-NOT-CANCELLED',
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_test_123',
    grandTotal: 3500,
  });
  const notCancelled = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_not_cancelled',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(!notCancelled.success, 'Rejects uncancelled order with success: false');
  assert(notCancelled.error === 'ORDER_NOT_CANCELLED', 'Identifies ORDER_NOT_CANCELLED error');

  // 1C. COD Order
  mockDb.seedOrder({
    id: 'cuid_cod_order',
    orderNumber: 'ORD-COD-123',
    status: 'CANCELLED',
    paymentStatus: 'PENDING',
    paymentProvider: 'COD',
    grandTotal: 3500,
  });
  const codOrder = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_cod_order',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(!codOrder.success, 'Rejects COD order with success: false');
  assert(codOrder.error === 'COD_NOT_APPLICABLE', 'Identifies COD_NOT_APPLICABLE error');

  // 1D. Missing Payment Transaction ID
  mockDb.seedOrder({
    id: 'cuid_missing_tx',
    orderNumber: 'ORD-NO-TX',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: null,
    grandTotal: 3500,
  });
  const noTx = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_missing_tx',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(!noTx.success, 'Rejects order with missing transaction ID');
  assert(noTx.error === 'MISSING_TRANSACTION_ID', 'Identifies MISSING_TRANSACTION_ID error');

  // --- 2. Active Claim Lock Protection ---
  console.log('\n--- 2. Active Claim Lock Protection (<60s) ---');
  mockDb.reset();
  mockRzp.reset();

  const recentTimestamp = Date.now() - 10000; // 10s ago (active claim)
  mockDb.seedOrder({
    id: 'cuid_active_claim',
    orderNumber: 'ORD-ACTIVE-CLAIM',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_active_claim',
    paymentSessionId: `${REFUND_CLAIM_PREFIX}claim_recent_abc:${recentTimestamp}`,
    grandTotal: 3500,
  });

  const activeClaimResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_active_claim',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(!activeClaimResult.success, 'Reconciliation backs off when active claim is present');
  assert(activeClaimResult.status === 409, 'Returns HTTP 409 Conflict');
  assert(activeClaimResult.outcome === 'ACTIVE_CLAIM_IN_PROGRESS', 'Outcome is ACTIVE_CLAIM_IN_PROGRESS');
  assert(mockRzp.fetchCalls.length === 0, 'Did not contact gateway when active claim held');
  const activeOrderInDb = mockDb.orders.get('cuid_active_claim');
  assert(activeOrderInDb.paymentSessionId.includes('claim_recent_abc'), 'Preserves active claim lock in database');

  // --- 3. Gateway Unreachable / Network Timeout ---
  console.log('\n--- 3. Gateway Unreachable / Network Timeout ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_timeout_order',
    orderNumber: 'ORD-TIMEOUT-001',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_timeout_123',
    grandTotal: 3500,
  });
  mockRzp.fetchShouldThrow = new Error('ETIMEDOUT: Connection to api.razorpay.com timed out');

  const timeoutResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_timeout_order',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(!timeoutResult.success, 'Returns success: false when gateway is unreachable');
  assert(timeoutResult.status === 502, 'Returns HTTP 502 Bad Gateway');
  assert(timeoutResult.outcome === 'GATEWAY_UNREACHABLE', 'Outcome is GATEWAY_UNREACHABLE');
  const timeoutOrderInDb = mockDb.orders.get('cuid_timeout_order');
  assert(timeoutOrderInDb.paymentStatus === 'PAID', 'Preserves paymentStatus as PAID without assumptions');

  // --- 4. Reconcile Processed Refund (Local PAID -> REFUNDED) ---
  console.log('\n--- 4. Reconcile Processed Refund (Local PAID -> REFUNDED) ---');
  mockDb.reset();
  mockRzp.reset();

  const staleTimestamp = Date.now() - 120000; // 2 minutes ago (stale claim)
  mockDb.seedOrder({
    id: 'cuid_reconcile_proc',
    orderNumber: 'ORD-REC-PROC-01',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_rec_proc_123',
    paymentSessionId: `${REFUND_CLAIM_PREFIX}stale_claim:${staleTimestamp}`,
    paymentFailureReason: 'Timeout occurred during previous cancellation',
    grandTotal: 3500,
  });

  mockRzp.fetchRefundsResult = {
    items: [
      {
        id: 'rfnd_gw_proc_999',
        amount: 350000,
        receipt: 'ref_ORD-REC-PROC-01',
        status: 'processed',
        payment_id: 'pay_rec_proc_123',
        notes: {
          orderId: 'cuid_reconcile_proc',
          orderNumber: 'ORD-REC-PROC-01',
        },
      },
    ],
  };

  const procResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_reconcile_proc',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(procResult.success, 'Reconciliation succeeds');
  assert(procResult.outcome === 'RECONCILED_PROCESSED', 'Outcome is RECONCILED_PROCESSED');
  assert(procResult.discrepancyDetected === true, 'Flags discrepancyDetected: true (local was behind gateway)');
  assert(procResult.refundId === 'rfnd_gw_proc_999', 'Returns verified refundId');
  const procOrderInDb = mockDb.orders.get('cuid_reconcile_proc');
  assert(procOrderInDb.paymentStatus === 'REFUNDED', 'Transitions paymentStatus to REFUNDED');
  assert(procOrderInDb.paymentSessionId === null, 'Clears stale refund claim token');
  assert(procOrderInDb.paymentFailureReason === null, 'Clears previous failure reason');
  assert(procOrderInDb.adminNotes.includes('rfnd_gw_proc_999'), 'Appends verified refund ID to adminNotes');
  assert(mockRzp.refundCalls.length === 0, 'SAFETY: Did NOT call payments.refund()');

  // --- 5. Idempotent Re-Reconciliation (CONFIRMED_PROCESSED) ---
  console.log('\n--- 5. Idempotent Re-Reconciliation (CONFIRMED_PROCESSED) ---');
  const repeatResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_reconcile_proc',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });
  assert(repeatResult.success, 'Repeated reconciliation succeeds');
  assert(repeatResult.outcome === 'CONFIRMED_PROCESSED', 'Outcome is CONFIRMED_PROCESSED');
  assert(repeatResult.discrepancyDetected === false, 'No discrepancy when local is already REFUNDED');
  assert(mockRzp.refundCalls.length === 0, 'SAFETY: Did NOT call payments.refund()');

  // --- 6. Pending Settlement at Gateway (status === 'created') ---
  console.log('\n--- 6. Pending Settlement at Gateway (status: created) ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_rec_pending',
    orderNumber: 'ORD-REC-PEND-01',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_rec_pend_123',
    grandTotal: 4200,
  });

  mockRzp.fetchRefundsResult = {
    items: [
      {
        id: 'rfnd_gw_created_123',
        amount: 420000,
        receipt: 'ref_ORD-REC-PEND-01',
        status: 'created',
        payment_id: 'pay_rec_pend_123',
      },
    ],
  };

  const pendingResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_rec_pending',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(pendingResult.success, 'Returns success: true for pending status');
  assert(pendingResult.outcome === 'PENDING_AT_GATEWAY', 'Outcome is PENDING_AT_GATEWAY');
  const pendOrderInDb = mockDb.orders.get('cuid_rec_pending');
  assert(pendOrderInDb.paymentStatus === 'PAID', 'CRITICAL: paymentStatus remains PAID (not prematurely REFUNDED)');
  assert(pendOrderInDb.paymentFailureReason.includes('awaiting processing/settlement'), 'Records pending note');

  // --- 7. Failed Refund at Gateway (status === 'failed') ---
  console.log('\n--- 7. Failed Refund at Gateway (status: failed) ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_rec_failed',
    orderNumber: 'ORD-REC-FAIL-01',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_rec_fail_123',
    paymentSessionId: `${REFUND_CLAIM_PREFIX}claim_old:${staleTimestamp}`,
    grandTotal: 1500,
  });

  mockRzp.fetchRefundsResult = {
    items: [
      {
        id: 'rfnd_gw_failed_456',
        amount: 150000,
        receipt: 'ref_ORD-REC-FAIL-01',
        status: 'failed',
        error_description: 'Beneficiary card account blocked',
        error_code: 'BAD_REQUEST_ERROR',
      },
    ],
  };

  const failedResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_rec_failed',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(failedResult.success, 'Returns success: true (failure definitively recorded)');
  assert(failedResult.outcome === 'GATEWAY_FAILED', 'Outcome is GATEWAY_FAILED');
  const failOrderInDb = mockDb.orders.get('cuid_rec_failed');
  assert(failOrderInDb.paymentStatus === 'PAID', 'Preserves status as PAID so admin can retry');
  assert(failOrderInDb.paymentSessionId === null, 'Releases claim lock');
  assert(failOrderInDb.paymentFailureReason.includes('Beneficiary card account blocked'), 'Captures gateway error reason');

  // --- 8. Bank Reversal: Gateway Failure after Local REFUNDED (DISCREPANCY_REVERTED) ---
  console.log('\n--- 8. Bank Reversal: Gateway Failure after Local REFUNDED ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_rec_reversal',
    orderNumber: 'ORD-REC-REV-01',
    status: 'CANCELLED',
    paymentStatus: 'REFUNDED', // Was marked REFUNDED
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_rec_rev_123',
    grandTotal: 2000,
  });

  mockRzp.fetchRefundsResult = {
    items: [
      {
        id: 'rfnd_gw_rev_789',
        amount: 200000,
        receipt: 'ref_ORD-REC-REV-01',
        status: 'failed',
        error_description: 'Bank reversal: Card expired',
      },
    ],
  };

  const reversalResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_rec_reversal',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(reversalResult.success, 'Returns success: true');
  assert(reversalResult.outcome === 'DISCREPANCY_REVERTED', 'Outcome is DISCREPANCY_REVERTED');
  assert(reversalResult.discrepancyDetected === true, 'Flags discrepancyDetected: true');
  const revOrderInDb = mockDb.orders.get('cuid_rec_reversal');
  assert(revOrderInDb.paymentStatus === 'PAID', 'CRITICAL: Reverts paymentStatus from REFUNDED to PAID');
  assert(revOrderInDb.paymentFailureReason.includes('Card expired'), 'Records reversal failure description');

  // --- 9. Zero Gateway Refunds for Stale Claim (NO_GATEWAY_REFUND) ---
  console.log('\n--- 9. Zero Gateway Refunds for Stale Claim (NO_GATEWAY_REFUND) ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_rec_zero_refund',
    orderNumber: 'ORD-REC-ZERO-01',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_rec_zero_123',
    paymentSessionId: `${REFUND_CLAIM_PREFIX}interrupted_claim:${staleTimestamp}`,
    paymentFailureReason: 'Timeout on previous refund attempt',
    grandTotal: 5000,
  });

  mockRzp.fetchRefundsResult = { items: [] };

  const zeroRefundResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_rec_zero_refund',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(zeroRefundResult.success, 'Returns success: true');
  assert(zeroRefundResult.outcome === 'NO_GATEWAY_REFUND', 'Outcome is NO_GATEWAY_REFUND');
  const zeroOrderInDb = mockDb.orders.get('cuid_rec_zero_refund');
  assert(zeroOrderInDb.paymentSessionId === null, 'Releases stale claim token');
  assert(zeroOrderInDb.paymentStatus === 'PAID', 'Preserves PAID status');
  assert(zeroOrderInDb.paymentFailureReason.includes('Ready for refund retry'), 'Notes ready for retry');
  assert(mockRzp.refundCalls.length === 0, 'SAFETY: Did NOT call payments.refund()');

  // --- 10. Discrepancy: Marked REFUNDED locally but 0 refunds on Gateway ---
  console.log('\n--- 10. Discrepancy: Marked REFUNDED locally but 0 refunds on Gateway ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_phantom_refund',
    orderNumber: 'ORD-PHANTOM-01',
    status: 'CANCELLED',
    paymentStatus: 'REFUNDED',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_phantom_123',
    grandTotal: 5000,
  });

  mockRzp.fetchRefundsResult = { items: [] };

  const phantomResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_phantom_refund',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(!phantomResult.success, 'Flags discrepancy with success: false');
  assert(phantomResult.status === 409, 'Returns HTTP 409 Conflict');
  assert(phantomResult.outcome === 'CONFLICT_NEEDS_REVIEW', 'Outcome is CONFLICT_NEEDS_REVIEW');
  assert(phantomResult.discrepancyDetected === true, 'Flags discrepancyDetected: true');
  const phantomInDb = mockDb.orders.get('cuid_phantom_refund');
  assert(phantomInDb.paymentFailureReason.includes('no refund records exist on Razorpay'), 'Records discrepancy explanation');

  // --- 11. Ambiguity: Multiple Matching Refunds on Payment ---
  console.log('\n--- 11. Ambiguity: Multiple Matching Refunds on Payment ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_multi_refund',
    orderNumber: 'ORD-MULTI-01',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_multi_123',
    grandTotal: 3000,
  });

  mockRzp.fetchRefundsResult = {
    items: [
      { id: 'rfnd_dup_1', amount: 300000, receipt: 'ref_ORD-MULTI-01', status: 'processed' },
      { id: 'rfnd_dup_2', amount: 300000, receipt: 'ref_ORD-MULTI-01', status: 'processed' },
    ],
  };

  const multiResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_multi_refund',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(!multiResult.success, 'Flags conflict with success: false');
  assert(multiResult.status === 409, 'Returns HTTP 409 Conflict');
  assert(multiResult.outcome === 'CONFLICT_NEEDS_REVIEW', 'Outcome is CONFLICT_NEEDS_REVIEW');
  const multiInDb = mockDb.orders.get('cuid_multi_refund');
  assert(multiInDb.paymentStatus === 'PAID', 'Does NOT mutate paymentStatus');
  assert(multiInDb.paymentFailureReason.includes('multiple matching refunds detected'), 'Records conflict note');

  // --- 12. Ambiguity: Partial or Unmatched Refund on Payment ---
  console.log('\n--- 12. Ambiguity: Partial or Unmatched Refund on Payment ---');
  mockDb.reset();
  mockRzp.reset();

  mockDb.seedOrder({
    id: 'cuid_partial_refund',
    orderNumber: 'ORD-PARTIAL-01',
    status: 'CANCELLED',
    paymentStatus: 'PAID',
    paymentProvider: 'RAZORPAY',
    paymentTransactionId: 'pay_partial_123',
    grandTotal: 5000, // Expected 500000 paise
  });

  mockRzp.fetchRefundsResult = {
    items: [
      // Only 100000 paise refunded with different receipt
      { id: 'rfnd_partial_1', amount: 100000, receipt: 'custom_partial_receipt', status: 'processed' },
    ],
  };

  const partialResult = await reconcileOrderRefundWithGateway({
    orderIdOrNumber: 'cuid_partial_refund',
    customPrismaClient: mockDb,
    customRazorpayClient: mockRzp,
  });

  assert(!partialResult.success, 'Flags partial refund ambiguity with success: false');
  assert(partialResult.status === 409, 'Returns HTTP 409 Conflict');
  assert(partialResult.outcome === 'CONFLICT_NEEDS_REVIEW', 'Outcome is CONFLICT_NEEDS_REVIEW');
  const partialInDb = mockDb.orders.get('cuid_partial_refund');
  assert(partialInDb.paymentStatus === 'PAID', 'Does NOT mark partial refund as full cancellation REFUNDED');
  assert(partialInDb.paymentFailureReason.includes('unrecognized or partial refund'), 'Records partial conflict note');

  // --- 13. Admin API Handler & Authorization Verification ---
  console.log('\n--- 13. Admin API Handler & Authorization Verification ---');
  // Dynamic import of admin handler to verify request parsing and authorization
  const adminOrdersModule = await import('../api/admin/orders.js');
  const adminHandler = adminOrdersModule.default;

  // Unauthenticated request (no auth headers or session)
  let unauthStatus = 0;
  let unauthBody: any = null;
  const mockUnauthReq = {
    method: 'POST',
    headers: {},
    url: '/api/admin/orders',
  };
  const mockUnauthRes: any = {
    status: (code: number) => {
      unauthStatus = code;
      return mockUnauthRes;
    },
    json: (data: any) => {
      unauthBody = data;
      return data;
    },
    setHeader: () => {},
    end: () => {},
  };

  await adminHandler(mockUnauthReq, mockUnauthRes);
  assert(unauthStatus === 401 || unauthStatus === 403, `Rejects unauthenticated admin request with HTTP 401/403 (got ${unauthStatus})`);
  assert(Boolean(unauthBody?.error), 'Provides error message on unauthorized access');

  console.log('\n====================================================================');
  console.log(`TASK 4 RECONCILIATION TEST RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================================\n');
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});

