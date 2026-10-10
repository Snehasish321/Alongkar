/**
 * Phase 3-J Task 1: Strict Refund Matching Unit Test Suite
 *
 * Verifies strict Razorpay refund matching rules in memory.
 * Does NOT connect to any database, network, or external Razorpay service.
 */

// Set guard unit-test mode before loading guard module to prevent any DB connection
process.env.SKIP_TEST_DB_GUARD_AUTO = 'true';
await import('./testDbGuard.js');

import {
  isMatchingCancellationRefund,
  processIdempotentRazorpayRefund,
} from '../api/_utils/orderCancellation.js';

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

async function runTests() {
  console.log('====================================================================');
  console.log('PHASE 3-J TASK 1: STRICT REFUND MATCHING UNIT TESTS');
  console.log('====================================================================\n');

  const sampleOrder = {
    id: 'cuid_test_order_123',
    orderNumber: 'ORD-2026-9999',
    grandTotal: 4999.0, // 499,900 paise
    paymentTransactionId: 'pay_test_transaction_456',
    adminNotes: 'Initial notes',
  };
  const expectedPaise = 499900;
  const expectedReceipt = 'ref_ORD-2026-9999';

  // ─── 1. Exact receipt and exact amount: matching refund is recognized ───────
  console.log('--- 1. Exact Receipt and Exact Amount ---');
  {
    const candidate = {
      id: 'rfnd_exact_match_1',
      status: 'processed',
      receipt: expectedReceipt,
      amount: expectedPaise,
      notes: { orderId: sampleOrder.id, orderNumber: sampleOrder.orderNumber },
    };
    assert(
      isMatchingCancellationRefund(candidate, sampleOrder, expectedPaise) === true,
      'Matches candidate with exact receipt and exact paise amount'
    );

    // Number as string
    const candidateStringAmount = {
      id: 'rfnd_exact_match_str',
      status: 'processed',
      receipt: expectedReceipt,
      amount: String(expectedPaise),
    };
    assert(
      isMatchingCancellationRefund(candidateStringAmount, sampleOrder, expectedPaise) === true,
      'Matches candidate when amount is numeric string'
    );

    // Status 'created' or 'success'
    const candidateCreated = {
      id: 'rfnd_exact_created',
      status: 'created',
      receipt: expectedReceipt,
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidateCreated, sampleOrder, expectedPaise) === true,
      'Matches candidate with status "created"'
    );
  }

  // ─── 2. Same amount but different receipt: not recognized ──────────────────
  console.log('\n--- 2. Same Amount but Different Receipt ---');
  {
    const candidate = {
      id: 'rfnd_wrong_receipt',
      status: 'processed',
      receipt: 'ref_ORD-DIFFERENT-1111',
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidate, sampleOrder, expectedPaise) === false,
      'Rejects refund with matching amount but different receipt'
    );
  }

  // ─── 3. Exact receipt but wrong amount: not recognized ─────────────────────
  console.log('\n--- 3. Exact Receipt but Wrong Amount ---');
  {
    const candidate = {
      id: 'rfnd_wrong_amount',
      status: 'processed',
      receipt: expectedReceipt,
      amount: expectedPaise - 1000, // partial amount
    };
    assert(
      isMatchingCancellationRefund(candidate, sampleOrder, expectedPaise) === false,
      'Rejects refund with matching receipt but insufficient amount'
    );

    const candidateOver = {
      id: 'rfnd_wrong_amount_over',
      status: 'processed',
      receipt: expectedReceipt,
      amount: expectedPaise + 1000,
    };
    assert(
      isMatchingCancellationRefund(candidateOver, sampleOrder, expectedPaise) === false,
      'Rejects refund with matching receipt but excess amount'
    );
  }

  // ─── 4. Matching amount with missing or empty receipt: not recognized ───────
  console.log('\n--- 4. Matching Amount with Missing Receipt ---');
  {
    const candidateMissing = {
      id: 'rfnd_missing_receipt',
      status: 'processed',
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidateMissing, sampleOrder, expectedPaise) === false,
      'Rejects refund with undefined receipt even if amount matches'
    );

    const candidateNull = {
      id: 'rfnd_null_receipt',
      status: 'processed',
      receipt: null,
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidateNull, sampleOrder, expectedPaise) === false,
      'Rejects refund with null receipt even if amount matches'
    );

    const candidateEmpty = {
      id: 'rfnd_empty_receipt',
      status: 'processed',
      receipt: '   ',
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidateEmpty, sampleOrder, expectedPaise) === false,
      'Rejects refund with whitespace receipt even if amount matches'
    );
  }

  // ─── 5. Missing or malformed refund fields: handled safely ─────────────────
  console.log('\n--- 5. Missing or Malformed Refund Fields ---');
  {
    assert(isMatchingCancellationRefund(null, sampleOrder, expectedPaise) === false, 'Safely rejects null candidate');
    assert(isMatchingCancellationRefund(undefined, sampleOrder, expectedPaise) === false, 'Safely rejects undefined candidate');
    assert(isMatchingCancellationRefund('invalid_string', sampleOrder, expectedPaise) === false, 'Safely rejects string candidate');
    assert(isMatchingCancellationRefund(12345, sampleOrder, expectedPaise) === false, 'Safely rejects numeric candidate');

    // Missing status
    const candidateNoStatus = {
      id: 'rfnd_no_status',
      receipt: expectedReceipt,
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidateNoStatus, sampleOrder, expectedPaise) === false,
      'Rejects candidate missing status'
    );

    // Failed status
    const candidateFailed = {
      id: 'rfnd_failed',
      status: 'failed',
      receipt: expectedReceipt,
      amount: expectedPaise,
    };
    assert(
      isMatchingCancellationRefund(candidateFailed, sampleOrder, expectedPaise) === false,
      'Rejects candidate with "failed" status'
    );

    // Non-numeric amount
    const candidateNan = {
      id: 'rfnd_nan_amount',
      status: 'processed',
      receipt: expectedReceipt,
      amount: 'not-a-number',
    };
    assert(
      isMatchingCancellationRefund(candidateNan, sampleOrder, expectedPaise) === false,
      'Rejects candidate with NaN amount'
    );

    // Negative / zero amount
    const candidateZero = {
      id: 'rfnd_zero_amount',
      status: 'processed',
      receipt: expectedReceipt,
      amount: 0,
    };
    assert(
      isMatchingCancellationRefund(candidateZero, sampleOrder, expectedPaise) === false,
      'Rejects candidate with 0 amount'
    );

    // Contradicting orderId in notes
    const candidateWrongNoteId = {
      id: 'rfnd_wrong_note_id',
      status: 'processed',
      receipt: expectedReceipt,
      amount: expectedPaise,
      notes: { orderId: 'different_cuid_999' },
    };
    assert(
      isMatchingCancellationRefund(candidateWrongNoteId, sampleOrder, expectedPaise) === false,
      'Rejects candidate whose notes contradict expected orderId'
    );

    // Contradicting orderNumber in notes
    const candidateWrongNoteNum = {
      id: 'rfnd_wrong_note_num',
      status: 'processed',
      receipt: expectedReceipt,
      amount: expectedPaise,
      notes: { orderNumber: 'ORD-DIFFERENT' },
    };
    assert(
      isMatchingCancellationRefund(candidateWrongNoteNum, sampleOrder, expectedPaise) === false,
      'Rejects candidate whose notes contradict expected orderNumber'
    );
  }

  // ─── 6. End-to-end with Mock Razorpay Client & Mock Database ────────────────
  console.log('\n--- 6. End-to-End processIdempotentRazorpayRefund Verification ---');

  // Helper to create mock database
  const createMockDb = () => {
    const dbObj = {
      orderRecord: {
        ...sampleOrder,
        paymentStatus: 'PAID',
        paymentSessionId: null as string | null,
        paymentFailureReason: null as string | null,
        items: [],
      },
      order: {
        findUnique: async () => ({ ...dbObj.orderRecord }),
        updateMany: async ({ data }: any) => {
          Object.assign(dbObj.orderRecord, data);
          return { count: 1 };
        },
        update: async ({ data }: any) => {
          Object.assign(dbObj.orderRecord, data);
          return { ...dbObj.orderRecord };
        },
      },
    };
    return dbObj;
  };

  // 6.1 Empty refund list: dispatches new refund
  {
    let refundDispatched = false;
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async (_payId: string, params: any) => {
          refundDispatched = true;
          return { id: 'rfnd_new_123', status: 'processed', ...params };
        },
      },
    };
    const mockDb = createMockDb();
    const result = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: sampleOrder,
      cancelReason: 'Customer requested',
      customRazorpayClient: mockRzp,
    });

    assert(result.success === true, 'Empty refund list: processIdempotentRazorpayRefund succeeds');
    assert(result.isAlreadyRefunded === false, 'Correctly flags as new refund (isAlreadyRefunded: false)');
    assert(result.refundId === 'rfnd_new_123', 'Captured new refund ID');
    assert(Boolean(refundDispatched), 'Dispatched new refund to gateway when list was empty');
    assert(mockDb.orderRecord.paymentStatus === 'REFUNDED', 'Updated DB paymentStatus to REFUNDED');
  }

  // 6.2 Pre-existing matching refund: does NOT dispatch new refund
  {
    let refundDispatched = false;
    const existingRefund = {
      id: 'rfnd_existing_456',
      status: 'processed',
      receipt: expectedReceipt,
      amount: expectedPaise,
      notes: { orderId: sampleOrder.id },
    };
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [existingRefund] }),
        refund: async () => {
          refundDispatched = true;
          return { id: 'rfnd_unexpected' };
        },
      },
    };
    const mockDb = createMockDb();
    const result = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: sampleOrder,
      cancelReason: 'Customer requested',
      customRazorpayClient: mockRzp,
    });

    assert(result.success === true, 'Pre-existing matching refund: succeeds');
    assert(result.isAlreadyRefunded === true, 'Correctly flags as pre-existing (isAlreadyRefunded: true)');
    assert(result.refundId === 'rfnd_existing_456', 'Captured existing refund ID');
    assert(refundDispatched === false, 'Did NOT call gateway payments.refund');
    assert(mockDb.orderRecord.paymentStatus === 'REFUNDED', 'Updated DB paymentStatus to REFUNDED');
  }

  // 6.3 Unrelated partial refund in list: does NOT mistake it, dispatches new full refund
  {
    let dispatchedReceipt: string | undefined;
    let dispatchedAmount: number | undefined;
    const unrelatedPartialRefund = {
      id: 'rfnd_unrelated_partial_999',
      status: 'processed',
      receipt: 'ref_PARTIAL_ITEM_1',
      amount: 50000, // 500 INR paise
    };
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [unrelatedPartialRefund] }),
        refund: async (_payId: string, params: any) => {
          dispatchedReceipt = params.receipt;
          dispatchedAmount = params.amount;
          return { id: 'rfnd_full_cancellation_888', status: 'processed', ...params };
        },
      },
    };
    const mockDb = createMockDb();
    const result = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: sampleOrder,
      cancelReason: 'Full order cancellation',
      customRazorpayClient: mockRzp,
    });

    assert(result.success === true, 'Unrelated partial refund present: succeeds');
    assert(result.isAlreadyRefunded === false, 'Did not confuse partial refund with cancellation refund');
    assert(result.refundId === 'rfnd_full_cancellation_888', 'Issued new full refund ID');
    assert(dispatchedReceipt === expectedReceipt, 'Dispatched with expected deterministic receipt');
    assert(dispatchedAmount === expectedPaise, 'Dispatched with full expected amount');
  }

  // 6.4 Gateway refund dispatch failure: records diagnostics without setting REFUNDED
  {
    const mockRzp = {
      payments: {
        fetchMultipleRefund: async () => ({ items: [] }),
        refund: async () => {
          throw new Error('GATEWAY_DOWN: Bank network connection timed out');
        },
      },
    };
    const mockDb = createMockDb();
    const result = await processIdempotentRazorpayRefund({
      db: mockDb,
      order: sampleOrder,
      cancelReason: 'Customer requested',
      customRazorpayClient: mockRzp,
    });

    assert(result.success === false, 'Gateway error returns success: false');
    assert(Boolean(result.error?.includes('GATEWAY_DOWN')), 'Returns sanitized gateway error');
    assert(mockDb.orderRecord.paymentStatus === 'PAID', 'Preserves paymentStatus as PAID');
    assert(
      Boolean(mockDb.orderRecord.paymentFailureReason?.includes('GATEWAY_DOWN')),
      'Records failure diagnostics in paymentFailureReason'
    );
  }

  console.log('\n====================================================================');
  console.log(`UNIT TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================================');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
