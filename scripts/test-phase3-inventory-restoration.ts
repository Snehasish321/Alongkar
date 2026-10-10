import './testDbGuard.js';
import 'dotenv/config';
import prisma from '../src/lib/prisma.js';
import {
  isOrderEligibleForInventoryRestoration,
  restoreOrderInventoryTx,
  restoreOrderInventory,
  aggregateOrderItems,
  deductOrderInventoryTx,
  getOrderInventoryMovementsTx,
  calculateOrderInventoryLedger,
} from '../api/_utils/inventory.js';
import { transitionOrderToPaid } from '../api/_utils/razorpay.js';

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

async function runPhase3Tests() {
  process.env.NODE_ENV = 'test';

  console.log('====================================================================');
  console.log('PHASE 3-H: HARDENED INVENTORY RESTORATION & DURABLE LEDGER TESTS');
  console.log('====================================================================\n');

  const ts = Date.now();
  let user1: any;
  let user2: any;
  let productA: any;
  let productB: any;
  let productC: any;

  const createdOrderIds: string[] = [];
  const createdProductIds: string[] = [];
  const createdUserIds: string[] = [];

  try {
    // ─── Setup Users & Products ──────────────────────────────────────────────
    user1 = await prisma.user.create({
      data: {
        clerkUserId: `user_p3h_1_${ts}`,
        email: `customer1_${ts}@alongkar.test`,
      },
    });
    createdUserIds.push(user1.id);

    user2 = await prisma.user.create({
      data: {
        clerkUserId: `user_p3h_2_${ts}`,
        email: `customer2_${ts}@alongkar.test`,
      },
    });
    createdUserIds.push(user2.id);

    productA = await prisma.product.create({
      data: {
        name: `Kundan Choker ${ts}`,
        slug: `kundan-choker-${ts}`,
        category: 'necklaces',
        price: 3500.0,
        originalPrice: 4500.0,
        discountPercent: 22,
        rating: 5.0,
        reviewCount: 4,
        image: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        hoverImage: 'https://images.unsplash.com/photo-1599643478518-a784e5dc4c8f',
        description: 'Handcrafted Kundan choker.',
        finish: '22K Gold Plated',
        baseMaterial: 'Brass',
        warranty: '1 Year Atelier Warranty',
        inStock: true,
        availableStock: 50,
      },
    });
    createdProductIds.push(productA.id);

    productB = await prisma.product.create({
      data: {
        name: `Meenakari Bangles ${ts}`,
        slug: `meenakari-bangles-${ts}`,
        category: 'bangles',
        price: 2000.0,
        originalPrice: 2500.0,
        discountPercent: 20,
        rating: 4.8,
        reviewCount: 3,
        image: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908',
        hoverImage: 'https://images.unsplash.com/photo-1535632066927-ab7c9ab60908',
        description: 'Artisan handcrafted bangles.',
        finish: 'Antique Gold',
        baseMaterial: 'Copper',
        warranty: '1 Year Atelier Warranty',
        inStock: true,
        availableStock: 30,
      },
    });
    createdProductIds.push(productB.id);

    productC = await prisma.product.create({
      data: {
        name: `Polki Ring ${ts}`,
        slug: `polki-ring-${ts}`,
        category: 'rings',
        price: 1500.0,
        originalPrice: 1800.0,
        discountPercent: 16,
        rating: 4.7,
        reviewCount: 2,
        image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e',
        hoverImage: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e',
        description: 'Fine handcrafted ring.',
        finish: 'Rose Gold',
        baseMaterial: 'Silver',
        warranty: '1 Year Atelier Warranty',
        inStock: false,
        availableStock: 0,
      },
    });
    createdProductIds.push(productC.id);

    // ─── 1. Quantity Validation & Item Aggregation ─────────────────────────────
    console.log('--- 1. Quantity Validation & Item Aggregation ---');

    const validItems = [
      { productId: productA.id, quantity: 2 },
      { productId: productA.id, quantity: 3 },
      { productId: productB.id, quantity: 1 },
    ];
    const aggResult = aggregateOrderItems(validItems);
    assert(aggResult.success === true, 'Item aggregation succeeds for valid inputs');
    assert(aggResult.aggregated?.length === 2, 'Duplicate product IDs aggregated to 2 unique products');
    assert(
      aggResult.aggregated?.find((i) => i.productId === productA.id)?.quantity === 5,
      'Product A quantities (2 + 3) aggregated to 5'
    );

    const invalidQtyResult = aggregateOrderItems([{ productId: productA.id, quantity: -1 }]);
    assert(invalidQtyResult.success === false, 'Negative quantity is strictly rejected');

    const zeroQtyResult = aggregateOrderItems([{ productId: productA.id, quantity: 0 }]);
    assert(zeroQtyResult.success === false, 'Zero quantity is strictly rejected');

    const floatQtyResult = aggregateOrderItems([{ productId: productA.id, quantity: 2.5 }]);
    assert(floatQtyResult.success === false, 'Non-integer quantity is strictly rejected');

    // ─── 2. Durable Ledger Recording on Deduction ────────────────────────────
    console.log('\n--- 2. Durable Ledger Recording on Deduction ---');

    // Create an order in DB
    const order1 = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-DED-${ts}`,
        userId: user1.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 17500.0,
        grandTotal: 17500.0,
        customerName: 'Test Customer',
        customerEmail: 'test@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Main St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              productSlug: productA.slug,
              productImage: productA.image,
              unitPrice: 3500.0,
              quantity: 5,
              lineTotal: 17500.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order1.id);

    // Atomically deduct stock and write ledger inside transaction
    await prisma.$transaction(async (tx) => {
      const deductionRes = await deductOrderInventoryTx(
        tx,
        [{ productId: productA.id, quantity: 5 }],
        { orderId: order1.id, clerkUserId: user1.clerkUserId, reason: 'order_confirmed' }
      );
      assert(deductionRes.success === true, 'Atomic conditional deduction succeeded');
    });

    // Verify stock mutation in PostgreSQL
    const stockAfterDeduct = await prisma.product.findUnique({
      where: { id: productA.id },
      select: { availableStock: true, inStock: true },
    });
    assert(stockAfterDeduct?.availableStock === 45, 'Product A stock reduced from 50 to 45');

    // Verify durable InventoryMovement record in PostgreSQL
    const movements = await prisma.$transaction(async (tx) => {
      return await getOrderInventoryMovementsTx(tx, order1.id);
    });
    assert(movements.length === 1, 'Exactly 1 durable InventoryMovement record created in database');
    assert(movements[0].type === 'DEDUCTION', 'Movement type is DEDUCTION');
    assert(movements[0].quantity === 5, 'Movement recorded quantity is 5');
    assert(movements[0].productId === productA.id, 'Movement references correct productId');

    // ─── 3. Failed Deduction Creates No Movement Records ─────────────────────
    console.log('\n--- 3. Failed Deduction Creates No Movement Records ---');

    const initialMovementsCount = (
      await prisma.$queryRawUnsafe<any[]>(`SELECT count(*) FROM "InventoryMovement"`)
    )[0].count;

    const failedDeductOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-FAIL-DED-${ts}`,
        userId: user1.id,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        subtotal: 350000.0,
        grandTotal: 350000.0,
        customerName: 'Test Customer',
        customerEmail: 'test@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Main St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              productSlug: productA.slug,
              productImage: productA.image,
              unitPrice: 3500.0,
              quantity: 999, // Exceeds availableStock (45)
              lineTotal: 3496500.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(failedDeductOrder.id);

    try {
      await prisma.$transaction(async (tx) => {
        const failRes = await deductOrderInventoryTx(
          tx,
          [{ productId: productA.id, quantity: 999 }],
          { orderId: failedDeductOrder.id }
        );
        if (!failRes.success) {
          throw new Error('INSUFFICIENT_STOCK');
        }
      });
    } catch {
      // expected failure
    }

    const currentMovementsCount = (
      await prisma.$queryRawUnsafe<any[]>(`SELECT count(*) FROM "InventoryMovement"`)
    )[0].count;
    assert(
      currentMovementsCount === initialMovementsCount,
      'Failed deduction rolled back completely and left 0 orphan movement records'
    );

    // ─── 4. Proven Deduction Restoration & adminNotes Independence ───────────
    console.log('\n--- 4. Proven Deduction Restoration & adminNotes Independence ---');

    const eligibility1 = isOrderEligibleForInventoryRestoration(order1, movements);
    assert(eligibility1.eligible === true, 'Order with durable deduction records is eligible for restoration');
    assert(eligibility1.wasDeducted === true, 'Deduction is proven by database ledger');

    // Execute restoration
    const restoreRes1 = await restoreOrderInventory(prisma, order1.id, {
      reason: 'customer_cancellation',
    });
    assert(restoreRes1.success === true, 'Restoration succeeded for order with proven deduction');
    assert(restoreRes1.restoredItems[0].quantity === 5, 'Restored quantity is 5');

    const stockAfterRestore = await prisma.product.findUnique({
      where: { id: productA.id },
      select: { availableStock: true, inStock: true },
    });
    assert(stockAfterRestore?.availableStock === 50, 'Product A stock restored back to 50');

    // Verify durable RESTORATION_CANCELLATION record in PostgreSQL
    const movementsAfterRestore = await prisma.$transaction(async (tx) => {
      return await getOrderInventoryMovementsTx(tx, order1.id);
    });
    assert(movementsAfterRestore.length === 2, 'Database ledger now contains 2 records (1 deduction, 1 restoration)');
    assert(
      movementsAfterRestore.some((m) => m.type === 'RESTORATION_CANCELLATION' && m.quantity === 5),
      'Durable RESTORATION_CANCELLATION recorded in database'
    );

    // ─── 5. Idempotency Under adminNotes Deletion / Editing ───────────────────
    console.log('\n--- 5. Idempotency Under adminNotes Deletion / Editing ---');

    // Intentionally erase and modify adminNotes on the order record
    await prisma.order.update({
      where: { id: order1.id },
      data: { adminNotes: null },
    });

    // Attempt restoration again: should be REJECTED based on durable ledger truth, NOT adminNotes
    const repeatRestoreRes = await restoreOrderInventory(prisma, order1.id);
    assert(repeatRestoreRes.success === false, 'Repeated restoration is rejected despite adminNotes being deleted');
    assert(repeatRestoreRes.reason === 'ALREADY_RESTORED', 'Rejection reason is ALREADY_RESTORED');

    const stockAfterRepeat = await prisma.product.findUnique({
      where: { id: productA.id },
      select: { availableStock: true },
    });
    assert(stockAfterRepeat?.availableStock === 50, 'Stock remained 50 (not double incremented to 55)');

    // ─── 6. Legacy / Unproven Orders Handled Safely ───────────────────────────
    console.log('\n--- 6. Legacy / Unproven Orders Handled Safely ---');

    // Create an order that claims CONFIRMED and PAID status but has NO ledger records
    const legacyOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-LEGACY-${ts}`,
        userId: user1.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 3500.0,
        grandTotal: 3500.0,
        customerName: 'Legacy Customer',
        customerEmail: 'legacy@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Main St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              productSlug: productA.slug,
              productImage: productA.image,
              unitPrice: 3500.0,
              quantity: 5,
              lineTotal: 17500.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(legacyOrder.id);

    // Order status alone CANNOT authorize restoration without ledger proof
    const legacyRestoreRes = await restoreOrderInventory(prisma, legacyOrder.id);
    assert(legacyRestoreRes.success === false, 'Order without durable deduction records rejected from restoration');
    assert(
      legacyRestoreRes.reason === 'NO_INVENTORY_DEDUCTED',
      'Reason is NO_INVENTORY_DEDUCTED (requires manual reconciliation)'
    );

    // ─── 7. Real PostgreSQL Concurrent Restoration Race Protection ───────────
    console.log('\n--- 7. Real PostgreSQL Concurrent Restoration Race Protection ---');

    // Create an order and deduct stock
    const raceOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-RACE-${ts}`,
        userId: user2.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 7000.0,
        grandTotal: 7000.0,
        customerName: 'Race Customer',
        customerEmail: 'race@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Race St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              productSlug: productA.slug,
              productImage: productA.image,
              unitPrice: 3500.0,
              quantity: 2,
              lineTotal: 7000.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(raceOrder.id);

    // Deduct stock for raceOrder
    await prisma.$transaction(async (tx) => {
      await deductOrderInventoryTx(
        tx,
        [{ productId: productA.id, quantity: 2 }],
        { orderId: raceOrder.id, reason: 'order_confirmed' }
      );
    });

    const stockBeforeRace = (await prisma.product.findUnique({ where: { id: productA.id } }))?.availableStock || 0;
    assert(stockBeforeRace === 48, 'Product A stock is 48 before concurrent restoration race');

    // Launch 2 simultaneous restoration requests concurrently on PostgreSQL
    const [raceRes1, raceRes2] = await Promise.allSettled([
      restoreOrderInventory(prisma, raceOrder.id),
      restoreOrderInventory(prisma, raceOrder.id),
    ]);

    const res1Success = raceRes1.status === 'fulfilled' && raceRes1.value.success;
    const res2Success = raceRes2.status === 'fulfilled' && raceRes2.value.success;

    assert(
      (res1Success && !res2Success) || (!res1Success && res2Success),
      'Exactly ONE of two concurrent restoration requests succeeded'
    );

    const stockAfterRace = (await prisma.product.findUnique({ where: { id: productA.id } }))?.availableStock || 0;
    assert(
      stockAfterRace === 50,
      'Product A stock incremented exactly once (+2 -> 50) under real database concurrency'
    );

    // ─── 8. Multi-Item Atomic Rollback ────────────────────────────────────────
    console.log('\n--- 8. Multi-Item Atomic Rollback ---');

    // Create a temporary product
    const tempProd = await prisma.product.create({
      data: {
        name: `Temp Product ${ts}`,
        slug: `temp-prod-${ts}`,
        category: 'pendants',
        price: 1000.0,
        originalPrice: 1200.0,
        image: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e',
        hoverImage: 'https://images.unsplash.com/photo-1605100804763-247f67b3557e',
        description: 'Temp product for rollback test',
        finish: 'Silver',
        baseMaterial: 'Silver',
        warranty: '1 Year Atelier Warranty',
        inStock: true,
        availableStock: 45,
      },
    });
    createdProductIds.push(tempProd.id);

    const multiOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-MULTI-ROLLBACK-${ts}`,
        userId: user1.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 17000.0,
        grandTotal: 17000.0,
        customerName: 'Test Customer',
        customerEmail: 'test@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Main St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              productSlug: productA.slug,
              productImage: productA.image,
              unitPrice: 3500.0,
              quantity: 2,
              lineTotal: 7000.0,
            },
            {
              productId: tempProd.id,
              productName: tempProd.name,
              productSlug: tempProd.slug,
              productImage: tempProd.image,
              unitPrice: 1000.0,
              quantity: 10,
              lineTotal: 10000.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(multiOrder.id);

    // Deduct stock for multiOrder
    await prisma.$transaction(async (tx) => {
      await deductOrderInventoryTx(
        tx,
        [
          { productId: productA.id, quantity: 2 },
          { productId: tempProd.id, quantity: 10 },
        ],
        { orderId: multiOrder.id }
      );
    });

    const stockABeforeRollback = (await prisma.product.findUnique({ where: { id: productA.id } }))?.availableStock || 0;
    const stockTempBeforeRollback = (await prisma.product.findUnique({ where: { id: tempProd.id } }))?.availableStock || 0;

    // Attempt restoration with maxStockBound: 40 (tempProd stock is 35 + 10 = 45 > 40)
    const rollbackRestoreRes = await restoreOrderInventory(prisma, multiOrder.id, {
      maxStockBound: 40,
    });
    assert(rollbackRestoreRes.success === false, 'Multi-item restoration exceeding stock bound failed safely');
    assert(rollbackRestoreRes.reason === 'STOCK_BOUND_EXCEEDED', 'Reason is STOCK_BOUND_EXCEEDED');

    const stockAAfterRollback = (await prisma.product.findUnique({ where: { id: productA.id } }))?.availableStock || 0;
    const stockTempAfterRollback = (await prisma.product.findUnique({ where: { id: tempProd.id } }))?.availableStock || 0;

    assert(stockAAfterRollback === stockABeforeRollback, 'Product A stock completely rolled back (no partial increment)');
    assert(stockTempAfterRollback === stockTempBeforeRollback, 'Temp Product stock completely rolled back');

    // ─── 9. Out-of-Stock Reactivation & inStock Synchronization ──────────────
    console.log('\n--- 9. Out-of-Stock Reactivation & inStock Synchronization ---');

    assert(productC.inStock === false && productC.availableStock === 0, 'Product C is initially out of stock (stock: 0, inStock: false)');

    const outOfStockOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-OOS-${ts}`,
        userId: user1.id,
        status: 'CONFIRMED',
        paymentStatus: 'PAID',
        shippingStatus: 'READY',
        subtotal: 1500.0,
        grandTotal: 1500.0,
        customerName: 'Test Customer',
        customerEmail: 'test@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Main St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paidAt: new Date(),
        items: {
          create: [
            {
              productId: productC.id,
              productName: productC.name,
              productSlug: productC.slug,
              productImage: productC.image,
              unitPrice: 1500.0,
              quantity: 3,
              lineTotal: 4500.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(outOfStockOrder.id);

    // Record deduction for product C in ledger
    await prisma.$transaction(async (tx) => {
      // Manually record movement for product C to simulate previous deduction
      await tx.$executeRawUnsafe(
        `INSERT INTO "InventoryMovement" ("id", "orderId", "productId", "quantity", "type", "idempotencyKey", "reason", "createdAt")
         VALUES ($1, $2, $3, $4, 'DEDUCTION'::"InventoryMovementType", $5, $6, $7)`,
        `mov_test_c_${ts}`,
        outOfStockOrder.id,
        productC.id,
        3,
        `deduct_${outOfStockOrder.id}_${productC.id}`,
        'order_confirmed',
        new Date()
      );
    });

    const restoreOosResult = await restoreOrderInventory(prisma, outOfStockOrder.id);
    assert(restoreOosResult.success === true, 'Restoration of out-of-stock product succeeds');

    const productCAfterRestore = await prisma.product.findUnique({
      where: { id: productC.id },
      select: { availableStock: true, inStock: true },
    });
    assert(productCAfterRestore?.availableStock === 3, 'Product C stock restored from 0 to 3');
    assert(productCAfterRestore?.inStock === true, 'Product C inStock flag automatically reactivated to true');

    // ─── 10. Lifecycle & Payment Integration (transitionOrderToPaid) ──────────
    console.log('\n--- 10. Lifecycle & Payment Integration (transitionOrderToPaid) ---');

    const paymentOrder = await prisma.order.create({
      data: {
        orderNumber: `ORD-P3H-PAY-${ts}`,
        userId: user1.id,
        status: 'PENDING_PAYMENT',
        paymentStatus: 'PENDING',
        shippingStatus: 'NOT_READY',
        subtotal: 3500.0,
        grandTotal: 3500.0,
        customerName: 'Test Customer',
        customerEmail: 'test@alongkar.test',
        customerPhone: '9876543210',
        shippingAddressLine1: '123 Main St',
        shippingCity: 'Kolkata',
        shippingState: 'WB',
        shippingPincode: '700001',
        paymentProvider: 'RAZORPAY',
        paymentOrderId: `order_p3h_${ts}`,
        items: {
          create: [
            {
              productId: productA.id,
              productName: productA.name,
              productSlug: productA.slug,
              productImage: productA.image,
              unitPrice: 3500.0,
              quantity: 1,
              lineTotal: 3500.0,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(paymentOrder.id);

    // Transition to paid using transitionOrderToPaid
    const paidOrder = await transitionOrderToPaid(prisma, paymentOrder.id, `pay_p3h_${ts}`);
    assert(paidOrder.paymentStatus === 'PAID', 'Order transitioned to PAID');
    assert(paidOrder.status === 'CONFIRMED', 'Order transitioned to CONFIRMED');
    assert(paidOrder.paidAt instanceof Date, 'paidAt timestamp populated');

    // Verify durable movement was automatically created by transitionOrderToPaid
    const paidOrderMovements = await prisma.$transaction(async (tx) => {
      return await getOrderInventoryMovementsTx(tx, paymentOrder.id);
    });
    assert(paidOrderMovements.length === 1, 'transitionOrderToPaid created durable InventoryMovement record');
    assert(paidOrderMovements[0].type === 'DEDUCTION', 'Movement type is DEDUCTION');

    const paidOrderRestoration = await restoreOrderInventory(prisma, paidOrder.id);
    assert(paidOrderRestoration.success === true, 'Paid order successfully restored using durable ledger');

  } catch (err: any) {
    console.error('Unexpected test error:', err);
    assert(false, `Unexpected error during test execution: ${err.message}`);
  } finally {
    // ─── Cleanup ─────────────────────────────────────────────────────────────
    if (createdOrderIds.length > 0) {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "InventoryMovement" WHERE "orderId" IN (${createdOrderIds.map((id) => `'${id}'`).join(',')})`
      ).catch(() => {});
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: createdOrderIds } },
      }).catch(() => {});
      await prisma.order.deleteMany({
        where: { id: { in: createdOrderIds } },
      }).catch(() => {});
    }

    if (createdProductIds.length > 0) {
      await prisma.product.deleteMany({
        where: { id: { in: createdProductIds } },
      }).catch(() => {});
    }

    if (createdUserIds.length > 0) {
      await prisma.cartItem.deleteMany({
        where: { cart: { userId: { in: createdUserIds } } },
      }).catch(() => {});
      await prisma.cart.deleteMany({
        where: { userId: { in: createdUserIds } },
      }).catch(() => {});
      await prisma.user.deleteMany({
        where: { id: { in: createdUserIds } },
      }).catch(() => {});
    }

    console.log('\n===============================================================');
    console.log(`PHASE 3-H TEST SUMMARY: ${passedTests}/${totalTests} PASSED, ${failedTests} FAILED`);
    console.log('===============================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  }
}

runPhase3Tests()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error('Fatal test error:', err);
    prisma.$disconnect();
    process.exit(1);
  });
