import { Prisma } from '@prisma/client';
import { isValidIdentifier, isValidInteger, getSafeErrorMessage, logEvent, logServerError } from './security.js';
import { invalidateProducts, invalidateProductKeys } from './cache.js';

export interface OrderItemInput {
  productId: string;
  quantity: number;
}

export interface AggregatedOrderItem {
  productId: string;
  quantity: number;
}

export interface InventoryDeductionSuccess {
  success: true;
  deductedItems: AggregatedOrderItem[];
}

export interface InventoryDeductionFailure {
  success: false;
  conflictProductId?: string;
  requestedQuantity?: number;
  error: string;
}

export type InventoryDeductionResult = InventoryDeductionSuccess | InventoryDeductionFailure;

export interface StockConflict {
  productId: string;
  productName?: string;
  requested: number;
  available: number;
  reason: 'NOT_FOUND' | 'OUT_OF_STOCK' | 'INSUFFICIENT_QUANTITY';
}

export interface StockAvailabilityCheckResult {
  available: boolean;
  conflicts: StockConflict[];
  aggregatedItems: AggregatedOrderItem[];
}

/**
 * Aggregates duplicate product IDs in an order item list and validates
 * that each quantity is a strict positive integer.
 */
export function aggregateOrderItems(items: OrderItemInput[]): {
  success: boolean;
  aggregated?: AggregatedOrderItem[];
  error?: string;
} {
  if (!Array.isArray(items) || items.length === 0) {
    return { success: false, error: 'Order items must be a non-empty array.' };
  }

  const map = new Map<string, number>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item || typeof item !== 'object') {
      return { success: false, error: `Invalid item at index ${i}.` };
    }

    const pid = typeof item.productId === 'string' ? item.productId.trim() : '';
    if (!isValidIdentifier(pid)) {
      return { success: false, error: `Invalid product ID at index ${i}.` };
    }

    const qty = item.quantity;
    if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      return { success: false, error: `Invalid quantity for product ${pid}. Must be an integer between 1 and 99.` };
    }

    const current = map.get(pid) || 0;
    map.set(pid, current + qty);
  }

  const aggregated: AggregatedOrderItem[] = [];
  for (const [productId, quantity] of map.entries()) {
    aggregated.push({ productId, quantity });
  }

  return { success: true, aggregated };
}

/**
 * Checks live server-authoritative stock availability for an order item list
 * against PostgreSQL. Does NOT mutate or reserve stock.
 */
export async function checkLiveStockAvailability(
  prismaClient: any,
  items: OrderItemInput[]
): Promise<StockAvailabilityCheckResult> {
  const aggResult = aggregateOrderItems(items);
  if (!aggResult.success || !aggResult.aggregated) {
    return {
      available: false,
      conflicts: [
        {
          productId: 'UNKNOWN',
          requested: 0,
          available: 0,
          reason: 'NOT_FOUND',
        },
      ],
      aggregatedItems: [],
    };
  }

  const aggregatedItems = aggResult.aggregated;
  const productIds = aggregatedItems.map((item) => item.productId);

  const dbProducts = await prismaClient.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      inStock: true,
      availableStock: true,
    },
  });

  const productMap = new Map<string, any>();
  for (const p of dbProducts) {
    productMap.set(p.id, p);
  }

  const conflicts: StockConflict[] = [];

  for (const item of aggregatedItems) {
    const prod = productMap.get(item.productId);
    if (!prod) {
      conflicts.push({
        productId: item.productId,
        requested: item.quantity,
        available: 0,
        reason: 'NOT_FOUND',
      });
      continue;
    }

    const availableStock = typeof prod.availableStock === 'number' ? prod.availableStock : 0;

    if (prod.inStock === false || availableStock <= 0) {
      conflicts.push({
        productId: prod.id,
        productName: prod.name,
        requested: item.quantity,
        available: availableStock,
        reason: 'OUT_OF_STOCK',
      });
      continue;
    }

    if (availableStock < item.quantity) {
      conflicts.push({
        productId: prod.id,
        productName: prod.name,
        requested: item.quantity,
        available: availableStock,
        reason: 'INSUFFICIENT_QUANTITY',
      });
    }
  }

  return {
    available: conflicts.length === 0,
    conflicts,
    aggregatedItems,
  };
}

/**
 * Atomically and conditionally deducts available stock inside a Prisma database transaction
 * and writes a durable InventoryMovement deduction record if orderId is provided.
 *
 * Guard:
 *   UPDATE "Product" SET "availableStock" = "availableStock" - quantity
 *   WHERE "id" = productId AND "availableStock" >= quantity
 *
 * If any single product in a multi-product order cannot be deducted, the transaction
 * must be rolled back by the caller (or by throwing an error).
 */
export async function deductOrderInventoryTx(
  tx: any,
  items: OrderItemInput[],
  options?: {
    orderId?: string;
    clerkUserId?: string;
    reason?: string;
  }
): Promise<InventoryDeductionResult> {
  const aggResult = aggregateOrderItems(items);
  if (!aggResult.success || !aggResult.aggregated) {
    return {
      success: false,
      error: aggResult.error || 'Failed to aggregate order items for inventory deduction.',
    };
  }

  const aggregated = aggResult.aggregated;

  for (const item of aggregated) {
    // Execute atomic conditional decrement
    const updateResult = await tx.product.updateMany({
      where: {
        id: item.productId,
        availableStock: { gte: item.quantity },
      },
      data: {
        availableStock: { decrement: item.quantity },
      },
    });

    if (updateResult.count === 0) {
      logEvent('WARN', {
        endpoint: '/api/inventory',
        operation: 'inventory_deduction_insufficient_stock',
        category: 'inventory',
        extra: {
          productId: item.productId,
          requestedQuantity: item.quantity,
        },
        message: `Inventory deduction failed: Product ${item.productId} has insufficient stock for quantity ${item.quantity}.`,
      });

      return {
        success: false,
        conflictProductId: item.productId,
        requestedQuantity: item.quantity,
        error: `Insufficient stock for product ID ${item.productId}.`,
      };
    }

    // Synchronize boolean inStock = false if availableStock reached 0
    await tx.product.updateMany({
      where: {
        id: item.productId,
        availableStock: { lte: 0 },
      },
      data: {
        inStock: false,
      },
    });

    // If orderId is provided, atomically record durable deduction movement
    if (options?.orderId) {
      const movementId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const idempotencyKey = `deduct_${options.orderId}_${item.productId}`;
      await tx.$executeRawUnsafe(
        `INSERT INTO "InventoryMovement" ("id", "orderId", "productId", "quantity", "type", "idempotencyKey", "reason", "clerkUserId", "createdAt")
         VALUES ($1, $2, $3, $4, $5::"InventoryMovementType", $6, $7, $8, $9)
         ON CONFLICT ("idempotencyKey") DO NOTHING`,
        movementId,
        options.orderId,
        item.productId,
        item.quantity,
        'DEDUCTION',
        idempotencyKey,
        options.reason || 'order_confirmed',
        options.clerkUserId || null,
        new Date()
      );
    }
  }

  return {
    success: true,
    deductedItems: aggregated,
  };
}

export const DEFAULT_MAX_STOCK_BOUND = 100000;

export type InventoryMovementType =
  | 'DEDUCTION'
  | 'RESTORATION_CANCELLATION'
  | 'RESTORATION_RETURN';

export interface InventoryMovementRecord {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  type: InventoryMovementType;
  idempotencyKey: string;
  reason?: string | null;
  clerkUserId?: string | null;
  createdAt: Date;
}

export interface OrderLedgerProductSummary {
  productId: string;
  deductedQuantity: number;
  restoredQuantity: number;
  remainingRestorableQuantity: number;
}

export interface OrderInventoryLedgerCalculation {
  hasProvenDeduction: boolean;
  isFullyRestored: boolean;
  totalDeducted: number;
  totalRestored: number;
  productSummaries: Map<string, OrderLedgerProductSummary>;
  itemsToRestore: AggregatedOrderItem[];
}

/**
 * Queries all durable inventory movements for a given order within a transaction.
 */
export async function getOrderInventoryMovementsTx(
  tx: any,
  orderId: string
): Promise<InventoryMovementRecord[]> {
  if (!orderId || !isValidIdentifier(orderId)) return [];
  const rows: any[] = await tx.$queryRawUnsafe(
    `SELECT "id", "orderId", "productId", "quantity", "type", "idempotencyKey", "reason", "clerkUserId", "createdAt"
     FROM "InventoryMovement"
     WHERE "orderId" = $1
     ORDER BY "createdAt" ASC`,
    orderId
  );
  return rows || [];
}

/**
 * Pure ledger calculation: computes total deducted, total restored, and remaining restorable quantity per product.
 */
export function calculateOrderInventoryLedger(
  movements: InventoryMovementRecord[]
): OrderInventoryLedgerCalculation {
  const productSummaries = new Map<string, OrderLedgerProductSummary>();

  if (Array.isArray(movements)) {
    for (const mov of movements) {
      if (!mov.productId || typeof mov.quantity !== 'number') continue;

      const current = productSummaries.get(mov.productId) || {
        productId: mov.productId,
        deductedQuantity: 0,
        restoredQuantity: 0,
        remainingRestorableQuantity: 0,
      };

      if (mov.type === 'DEDUCTION') {
        current.deductedQuantity += mov.quantity;
      } else if (
        mov.type === 'RESTORATION_CANCELLATION' ||
        mov.type === 'RESTORATION_RETURN'
      ) {
        current.restoredQuantity += mov.quantity;
      }

      current.remainingRestorableQuantity = Math.max(
        0,
        current.deductedQuantity - current.restoredQuantity
      );
      productSummaries.set(mov.productId, current);
    }
  }

  let totalDeducted = 0;
  let totalRestored = 0;
  const itemsToRestore: AggregatedOrderItem[] = [];

  for (const summary of productSummaries.values()) {
    totalDeducted += summary.deductedQuantity;
    totalRestored += summary.restoredQuantity;
    if (summary.remainingRestorableQuantity > 0) {
      itemsToRestore.push({
        productId: summary.productId,
        quantity: summary.remainingRestorableQuantity,
      });
    }
  }

  const hasProvenDeduction = totalDeducted > 0;
  const isFullyRestored = hasProvenDeduction && itemsToRestore.length === 0;

  return {
    hasProvenDeduction,
    isFullyRestored,
    totalDeducted,
    totalRestored,
    productSummaries,
    itemsToRestore,
  };
}

export interface InventoryRestorationSuccess {
  success: true;
  orderId: string;
  orderNumber?: string;
  restoredItems: AggregatedOrderItem[];
  restoredAt: Date;
}

export interface InventoryRestorationFailure {
  success: false;
  orderId?: string;
  reason:
    | 'ORDER_NOT_FOUND'
    | 'ALREADY_RESTORED'
    | 'NO_INVENTORY_DEDUCTED'
    | 'INVALID_ITEMS'
    | 'STOCK_BOUND_EXCEEDED'
    | 'CONCURRENT_ALREADY_RESTORED'
    | 'TRANSACTION_ERROR';
  conflictProductId?: string;
  error: string;
}

export type InventoryRestorationResult = InventoryRestorationSuccess | InventoryRestorationFailure;

export interface RestorationEligibilityResult {
  eligible: boolean;
  reason?: string;
  wasDeducted: boolean;
  alreadyRestored: boolean;
  itemsToRestore?: AggregatedOrderItem[];
}

/**
 * Evaluates whether an order is eligible for inventory restoration based on durable database movements.
 *
 * Invariant: Order status (CONFIRMED/PAID/SHIPPED) or mutable adminNotes alone cannot prove deduction or restoration.
 */
export function isOrderEligibleForInventoryRestoration(
  order: any,
  movements?: InventoryMovementRecord[]
): RestorationEligibilityResult {
  if (!order || typeof order !== 'object') {
    return {
      eligible: false,
      reason: 'Order record is missing or invalid.',
      wasDeducted: false,
      alreadyRestored: false,
    };
  }

  const movementList = movements || order.inventoryMovements;
  if (!movementList || !Array.isArray(movementList) || movementList.length === 0) {
    return {
      eligible: false,
      reason: 'Order has no durable inventory deduction records. Requires manual review or reconciliation.',
      wasDeducted: false,
      alreadyRestored: false,
    };
  }

  const ledger = calculateOrderInventoryLedger(movementList);

  if (!ledger.hasProvenDeduction) {
    return {
      eligible: false,
      reason: 'Order never had inventory deducted (no deduction records found).',
      wasDeducted: false,
      alreadyRestored: false,
    };
  }

  if (ledger.isFullyRestored) {
    return {
      eligible: false,
      reason: 'Inventory has already been fully restored for this order.',
      wasDeducted: true,
      alreadyRestored: true,
    };
  }

  return {
    eligible: true,
    wasDeducted: true,
    alreadyRestored: false,
    itemsToRestore: ledger.itemsToRestore,
  };
}

/**
 * Atomically and conditionally restores order inventory inside a Prisma database transaction
 * using the durable InventoryMovement ledger as the single source of truth.
 *
 * Guarantees:
 * - Exactly-once restoration via database unique constraint on InventoryMovement.idempotencyKey.
 * - Multi-item atomicity (all-or-nothing rollback on any failure).
 * - Upper bound protection (prevents stock overflow beyond maxStockBound).
 * - Product inStock synchronization (sets inStock = true when availableStock > 0).
 * - Zero reliance on mutable adminNotes.
 */
export async function restoreOrderInventoryTx(
  tx: any,
  orderIdOrOrder: string | any,
  options?: {
    reason?: string;
    clerkUserId?: string;
    maxStockBound?: number;
    type?: InventoryMovementType;
  }
): Promise<InventoryRestorationResult> {
  const orderId = typeof orderIdOrOrder === 'string' ? orderIdOrOrder : orderIdOrOrder?.id;
  if (!orderId || !isValidIdentifier(orderId)) {
    return {
      success: false,
      reason: 'ORDER_NOT_FOUND',
      error: 'A valid order ID is required for inventory restoration.',
    };
  }

  // 1. Fetch fresh order with items inside transaction
  const freshOrder = await tx.order.findUnique({
    where: { id: orderId },
    include: { items: true },
  });

  if (!freshOrder) {
    return {
      success: false,
      orderId,
      reason: 'ORDER_NOT_FOUND',
      error: `Order with ID "${orderId}" was not found.`,
    };
  }

  // 2. Query durable database movements inside transaction
  const movements = await getOrderInventoryMovementsTx(tx, freshOrder.id);
  const ledger = calculateOrderInventoryLedger(movements);

  if (!ledger.hasProvenDeduction) {
    return {
      success: false,
      orderId: freshOrder.id,
      reason: 'NO_INVENTORY_DEDUCTED',
      error: 'Order has no durable inventory deduction records in database ledger. Requires manual review.',
    };
  }

  if (ledger.isFullyRestored) {
    return {
      success: false,
      orderId: freshOrder.id,
      reason: 'ALREADY_RESTORED',
      error: 'Inventory has already been fully restored for this order.',
    };
  }

  if (ledger.itemsToRestore.length === 0) {
    return {
      success: false,
      orderId: freshOrder.id,
      reason: 'INVALID_ITEMS',
      error: 'No restorable items found in order ledger.',
    };
  }

  const itemsToRestore = ledger.itemsToRestore;
  const maxBound = options?.maxStockBound ?? DEFAULT_MAX_STOCK_BOUND;
  const movementType: InventoryMovementType = options?.type || 'RESTORATION_CANCELLATION';
  const now = new Date();

  // 3. For each restorable item: validate bounds, increment stock, and write durable ledger movement
  for (const item of itemsToRestore) {
    const prod = await tx.product.findUnique({
      where: { id: item.productId },
      select: { id: true, availableStock: true, name: true },
    });

    if (!prod) {
      throw new Error(`PRODUCT_NOT_FOUND:${item.productId}`);
    }

    const currentStock = typeof prod.availableStock === 'number' ? prod.availableStock : 0;
    if (currentStock + item.quantity > maxBound) {
      throw new Error(
        `STOCK_BOUND_EXCEEDED:Restoring quantity ${item.quantity} for product "${prod.name}" (ID ${item.productId}) would exceed configured upper bound (${maxBound}). Current stock: ${currentStock}.`
      );
    }

    // Atomic conditional increment
    await tx.product.updateMany({
      where: { id: item.productId },
      data: {
        availableStock: { increment: item.quantity },
        inStock: true,
      },
    });

    // Unique idempotency key enforces database-level concurrency protection
    const movementId = `mov_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const idempotencyKey =
      movementType === 'RESTORATION_CANCELLATION'
        ? `restore_cancel_${freshOrder.id}_${item.productId}`
        : `restore_return_${freshOrder.id}_${item.productId}_${now.getTime()}_${Math.random().toString(36).slice(2, 7)}`;

    // Note: No ON CONFLICT DO NOTHING here for cancellation restoration.
    // If a duplicate concurrent request attempts to insert the same restoration key,
    // PostgreSQL throws unique constraint violation -> transaction rolls back!
    await tx.$executeRawUnsafe(
      `INSERT INTO "InventoryMovement" ("id", "orderId", "productId", "quantity", "type", "idempotencyKey", "reason", "clerkUserId", "createdAt")
       VALUES ($1, $2, $3, $4, $5::"InventoryMovementType", $6, $7, $8, $9)`,
      movementId,
      freshOrder.id,
      item.productId,
      item.quantity,
      movementType,
      idempotencyKey,
      options?.reason || 'order_cancelled_or_returned',
      options?.clerkUserId || null,
      now
    );
  }

  logEvent('INFO', {
    endpoint: '/api/inventory',
    operation: 'inventory_restoration_success',
    category: 'inventory',
    extra: {
      orderId: freshOrder.id,
      orderNumber: freshOrder.orderNumber,
      itemCount: itemsToRestore.length,
      totalQuantityRestored: itemsToRestore.reduce((sum, it) => sum + it.quantity, 0),
      reason: options?.reason || 'order_cancelled_or_returned',
    },
    message: `Inventory successfully restored for Order #${freshOrder.orderNumber}.`,
  });

  return {
    success: true,
    orderId: freshOrder.id,
    orderNumber: freshOrder.orderNumber,
    restoredItems: itemsToRestore,
    restoredAt: now,
  };
}

/**
 * Top-level canonical helper for standalone inventory restoration with automatic
 * Prisma transaction handling and post-commit cache invalidation.
 */
export async function restoreOrderInventory(
  prismaClient: any,
  orderIdOrOrder: string | any,
  options?: {
    reason?: string;
    clerkUserId?: string;
    maxStockBound?: number;
  }
): Promise<InventoryRestorationResult> {
  let result: InventoryRestorationResult;

  try {
    result = await prismaClient.$transaction(
      async (tx: any) => {
        return await restoreOrderInventoryTx(tx, orderIdOrOrder, options);
      },
      {
        maxWait: 5000,
        timeout: 15000,
      }
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || '');
    const isBoundError = rawMsg.includes('STOCK_BOUND_EXCEEDED');
    const isNotFoundError = rawMsg.includes('PRODUCT_NOT_FOUND');
    const errorMsg = getSafeErrorMessage(err, 'Failed to restore order inventory.');

    logServerError('Error during standalone inventory restoration transaction', err, {
      extra: {
        orderId: typeof orderIdOrOrder === 'string' ? orderIdOrOrder : orderIdOrOrder?.id,
      },
    });

    return {
      success: false,
      reason: isBoundError ? 'STOCK_BOUND_EXCEEDED' : isNotFoundError ? 'INVALID_ITEMS' : 'TRANSACTION_ERROR',
      error: isBoundError || isNotFoundError ? rawMsg : errorMsg,
    };
  }

  // Invalidate Redis product catalog caches after transaction commit
  if (result.success && result.restoredItems.length > 0) {
    invalidateRestoredProductsCache(result.restoredItems).catch(() => {});
  }

  return result;
}

/**
 * Invalidates Redis caches for products whose stock was successfully restored.
 * Non-blocking: logs any error without failing the caller.
 */
export async function invalidateRestoredProductsCache(restoredItems: AggregatedOrderItem[]): Promise<void> {
  try {
    await invalidateProducts();
    for (const item of restoredItems) {
      await invalidateProductKeys(item.productId);
    }
  } catch (err: any) {
    logServerError('Failed to invalidate product cache after stock restoration', err);
  }
}

/**
 * Invalidates Redis caches for products whose stock was successfully mutated.
 * Non-blocking: logs any error without failing the caller.
 */
export async function invalidateDeductedProductsCache(deductedItems: AggregatedOrderItem[]): Promise<void> {
  try {
    await invalidateProducts();
    for (const item of deductedItems) {
      await invalidateProductKeys(item.productId);
    }
  } catch (err: any) {
    logServerError('Failed to invalidate product cache after stock deduction', err);
  }
}
