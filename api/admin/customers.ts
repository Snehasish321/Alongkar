import prisma from '../../src/lib/prisma.js';
import { requireAdmin, respond, isPayloadTooLarge, isMalformedJson } from '../_utils/auth.js';
import {
  isValidIdentifier,
  getSafeErrorMessage,
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
  checkRateLimit,
  sanitizeSearchQuery,
} from '../_utils/security.js';

export const ALLOWED_ORDER_FILTERS = [
  'all',
  'with_orders',
  'repeat_buyers',
  'custom_requests',
] as const;

export type OrderFilterType = (typeof ALLOWED_ORDER_FILTERS)[number];

export const ALLOWED_SORT_OPTIONS = [
  'newest',
  'oldest',
  'most_orders',
  'highest_gross_spend',
  'highest_realized_spend',
] as const;

export type CustomerSortOption = (typeof ALLOWED_SORT_OPTIONS)[number];

const toNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
};

/**
 * Calculates customer-level financial metrics from historical order snapshots.
 *
 * Rules:
 * - grossOrderValue: Sum of grandTotal for all orders where status !== 'CANCELLED'.
 * - realizedSpend: Sum of PAID non-cancelled prepaid orders + DELIVERED COD orders,
 *   minus non-cancelled orders that were refunded. Cancelled orders are excluded
 *   from cash realization and are not double-subtracted.
 * - refundedValue: Sum of grandTotal for orders whose paymentStatus is REFUNDED or PARTIALLY_REFUNDED.
 */
export function calculateCustomerFinancials(orders: any[] = []) {
  let grossOrderValue = 0;
  let realizedPrepaid = 0;
  let realizedCod = 0;
  let nonCancelledRefunds = 0;
  let allRefundedValue = 0;
  let activeOrders = 0;
  let cancelledOrders = 0;

  for (const o of orders) {
    const isCancelled = o.status === 'CANCELLED';
    const grandTotal = toNum(o.grandTotal);
    const isCod = (o.paymentProvider || '').toUpperCase() === 'COD';
    const isRefunded =
      o.paymentStatus === 'REFUNDED' || o.paymentStatus === 'PARTIALLY_REFUNDED';

    if (isCancelled) {
      cancelledOrders++;
    } else {
      activeOrders++;
      grossOrderValue += grandTotal;

      if (!isCod && o.paymentStatus === 'PAID') {
        realizedPrepaid += grandTotal;
      } else if (
        isCod &&
        (o.status === 'DELIVERED' || o.shippingStatus === 'DELIVERED')
      ) {
        realizedCod += grandTotal;
      }

      // If a non-cancelled order was refunded, deduct the refunded amount from realized spend
      if (isRefunded) {
        nonCancelledRefunds += grandTotal;
      }
    }

    if (isRefunded) {
      allRefundedValue += grandTotal;
    }
  }

  const realizedSpend = Math.max(
    0,
    Math.round((realizedPrepaid + realizedCod - nonCancelledRefunds) * 100) / 100
  );

  return {
    totalOrders: orders.length,
    activeOrders,
    cancelledOrders,
    repeatBuyer: orders.length >= 2,
    grossOrderValue: Math.round(grossOrderValue * 100) / 100,
    realizedSpend,
    refundedValue: Math.round(allRefundedValue * 100) / 100,
  };
}

/**
 * Serializes a registered User into the public customer summary contract.
 */
export function formatCustomerSummary(user: any) {
  if (!user) return null;

  const orders = user.orders || [];
  const jewelleryRequests = user.jewelleryRequests || [];
  const financials = calculateCustomerFinancials(orders);

  // Derive latest available display name and phone from most recent order,
  // falling back to jewellery requests for phone if no order phone exists.
  const latestOrder = orders[0] || null;
  const latestRequest = jewelleryRequests[0] || null;

  const displayName = latestOrder?.customerName || null;
  const phone = latestOrder?.customerPhone || latestRequest?.phone || null;
  const lastOrderDate = latestOrder?.createdAt || null;
  const customRequestsCount =
    typeof user._count?.jewelleryRequests === 'number'
      ? user._count.jewelleryRequests
      : jewelleryRequests.length;

  return {
    id: user.id,
    clerkUserId: user.clerkUserId,
    registeredEmail: user.email || null,
    displayName,
    phone,
    createdAt: user.createdAt,
    lastOrderDate,
    totalOrders: financials.totalOrders,
    activeOrders: financials.activeOrders,
    cancelledOrders: financials.cancelledOrders,
    repeatBuyer: financials.repeatBuyer,
    grossOrderValue: financials.grossOrderValue,
    realizedSpend: financials.realizedSpend,
    refundedValue: financials.refundedValue,
    customRequestsCount,
  };
}

/**
 * Extracts query parameters from both req.query (Vercel) and req.url (Vite dev server / Node).
 */
export function extractQueryParams(req: any): Record<string, string> {
  const params: Record<string, string> = {};

  if (req.query && typeof req.query === 'object') {
    for (const [k, v] of Object.entries(req.query)) {
      if (typeof v === 'string') params[k] = v;
      else if (Array.isArray(v) && typeof v[0] === 'string') params[k] = v[0];
    }
  }

  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      for (const [k, v] of url.searchParams.entries()) {
        if (params[k] === undefined) params[k] = v;
      }
    } catch {}
  }

  return params;
}

/**
 * Admin Customers API Handler
 *
 * Supported operations:
 * - GET /api/admin/customers          : List, search, filter, and paginate customers with KPI summaries
 * - GET /api/admin/customers?id=<id>  : Single customer detail with order & jewellery-request history
 */
export default async function handler(req: any, res?: any, dbClient: any = prisma) {
  const method = (req.method || 'GET').toUpperCase();
  const requestId = getOrCreateRequestId(req);
  if (res) res._requestId = requestId;
  const startTime = Date.now();

  try {
    // 1. Only GET is allowed for read-only customer directory
    if (method !== 'GET') {
      return respond(
        res,
        405,
        { success: false, error: 'Method Not Allowed. Only GET is supported.' },
        { 'X-Request-ID': requestId, Allow: 'GET' }
      );
    }

    // 2. Admin Authentication & Authorization Gate
    const authResult = await requireAdmin(req);
    if (!authResult.authorized) {
      logSecurityEvent('ADMIN_CUSTOMER_ACCESS_DENIED', {
        status: authResult.status,
        clerkUserId: authResult.clerkUserId,
        method,
      });
      return respond(
        res,
        authResult.status,
        { success: false, error: authResult.error || 'Unauthorized' },
        { 'X-Request-ID': requestId }
      );
    }

    // 3. Sliding window Rate Limiter (120 req / min per admin identity)
    const rateLimit = await checkRateLimit(authResult.clerkUserId || 'admin', {
      keyPrefix: 'admin_customers',
      limit: 120,
      windowSeconds: 60,
    });

    if (!rateLimit.allowed) {
      return respond(
        res,
        429,
        { success: false, error: 'Too many requests. Please slow down.' },
        {
          'X-Request-ID': requestId,
          'Retry-After': String(rateLimit.resetSeconds),
        }
      );
    }

    const queryParams = extractQueryParams(req);

    // ─── SINGLE CUSTOMER DETAIL LOOKUP (?id=<userId>) ─────────────────────────
    const customerId = queryParams.id ? queryParams.id.trim() : null;
    if (customerId) {
      if (!isValidIdentifier(customerId)) {
        return respond(
          res,
          400,
          { success: false, error: 'Invalid customer ID format.' },
          { 'X-Request-ID': requestId }
        );
      }

      const user: any = await withTimeout(
        dbClient.user.findUnique({
          where: { id: customerId },
          select: {
            id: true,
            clerkUserId: true,
            email: true,
            createdAt: true,
            updatedAt: true,
            orders: {
              select: {
                id: true,
                orderNumber: true,
                status: true,
                paymentStatus: true,
                shippingStatus: true,
                paymentProvider: true,
                subtotal: true,
                discountTotal: true,
                shippingFee: true,
                taxTotal: true,
                grandTotal: true,
                currency: true,
                customerName: true,
                customerEmail: true,
                customerPhone: true,
                shippingAddressLine1: true,
                shippingAddressLine2: true,
                shippingCity: true,
                shippingState: true,
                shippingPincode: true,
                shippingCountry: true,
                createdAt: true,
                items: {
                  select: {
                    id: true,
                    productName: true,
                    productSku: true,
                    quantity: true,
                    unitPrice: true,
                    lineTotal: true,
                  },
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 50,
            },
            jewelleryRequests: {
              select: {
                id: true,
                requestNumber: true,
                status: true,
                jewelleryType: true,
                description: true,
                phone: true,
                budget: true,
                quotedPrice: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 50,
            },
            _count: {
              select: {
                orders: true,
                jewelleryRequests: true,
              },
            },
          },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminCustomerDetail.findUnique'
      );

      if (!user) {
        return respond(
          res,
          404,
          { success: false, error: 'Customer not found.' },
          { 'X-Request-ID': requestId }
        );
      }

      const financials = calculateCustomerFinancials(user.orders || []);
      const latestOrder = user.orders?.[0] || null;
      const latestRequest = user.jewelleryRequests?.[0] || null;
      const displayName = latestOrder?.customerName || null;
      const phone = latestOrder?.customerPhone || latestRequest?.phone || null;

      // Extract unique historical shipping address snapshots
      const seenAddresses = new Set<string>();
      const shippingAddresses: any[] = [];

      for (const ord of user.orders || []) {
        const addrKey = `${ord.shippingAddressLine1}|${ord.shippingCity}|${ord.shippingPincode}`.toLowerCase();
        if (!seenAddresses.has(addrKey)) {
          seenAddresses.add(addrKey);
          shippingAddresses.push({
            orderNumber: ord.orderNumber,
            usedAt: ord.createdAt,
            line1: ord.shippingAddressLine1,
            line2: ord.shippingAddressLine2 || null,
            city: ord.shippingCity,
            state: ord.shippingState,
            pincode: ord.shippingPincode,
            country: ord.shippingCountry || 'India',
          });
        }
      }

      const customerDetail = {
        id: user.id,
        clerkUserId: user.clerkUserId,
        registeredEmail: user.email || null,
        displayName,
        phone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        metrics: {
          totalOrders: financials.totalOrders,
          activeOrders: financials.activeOrders,
          cancelledOrders: financials.cancelledOrders,
          repeatBuyer: financials.repeatBuyer,
          grossOrderValue: financials.grossOrderValue,
          realizedSpend: financials.realizedSpend,
          refundedValue: financials.refundedValue,
          customRequestsCount: user._count?.jewelleryRequests || (user.jewelleryRequests?.length ?? 0),
          lastOrderDate: latestOrder?.createdAt || null,
        },
        orders: (user.orders || []).map((o: any) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          createdAt: o.createdAt,
          status: o.status,
          paymentStatus: o.paymentStatus,
          shippingStatus: o.shippingStatus,
          paymentProvider: o.paymentProvider || null,
          subtotal: toNum(o.subtotal),
          discountTotal: toNum(o.discountTotal),
          shippingFee: toNum(o.shippingFee),
          taxTotal: toNum(o.taxTotal),
          grandTotal: toNum(o.grandTotal),
          currency: o.currency || 'INR',
          customerName: o.customerName,
          customerEmail: o.customerEmail,
          customerPhone: o.customerPhone,
          shippingAddress: {
            line1: o.shippingAddressLine1,
            line2: o.shippingAddressLine2 || null,
            city: o.shippingCity,
            state: o.shippingState,
            pincode: o.shippingPincode,
            country: o.shippingCountry || 'India',
          },
          itemCount: o.items?.length || 0,
          items: (o.items || []).map((it: any) => ({
            id: it.id,
            productName: it.productName,
            productSku: it.productSku || null,
            quantity: it.quantity,
            unitPrice: toNum(it.unitPrice),
            lineTotal: toNum(it.lineTotal),
          })),
        })),
        shippingAddresses,
        jewelleryRequests: (user.jewelleryRequests || []).map((jr: any) => ({
          id: jr.id,
          requestNumber: jr.requestNumber,
          status: jr.status,
          jewelleryType: jr.jewelleryType,
          description: jr.description,
          phone: jr.phone,
          budget: jr.budget !== null && jr.budget !== undefined ? toNum(jr.budget) : null,
          quotedPrice:
            jr.quotedPrice !== null && jr.quotedPrice !== undefined ? toNum(jr.quotedPrice) : null,
          createdAt: jr.createdAt,
        })),
      };

      return respond(
        res,
        200,
        { success: true, customer: customerDetail },
        { 'X-Request-ID': requestId }
      );
    }

    // ─── CUSTOMER DIRECTORY LISTING ───────────────────────────────────────────

    // 4. Validate & parse pagination parameters
    const rawPage = queryParams.page !== undefined ? queryParams.page : '1';
    const rawLimit = queryParams.limit !== undefined ? queryParams.limit : '20';

    const parsedPage = parseInt(String(rawPage), 10);
    const parsedLimit = parseInt(String(rawLimit), 10);

    if (isNaN(parsedPage) || parsedPage < 1) {
      return respond(
        res,
        400,
        { success: false, error: 'Invalid page parameter. Must be an integer >= 1.' },
        { 'X-Request-ID': requestId }
      );
    }
    if (isNaN(parsedLimit) || parsedLimit < 1) {
      return respond(
        res,
        400,
        { success: false, error: 'Invalid limit parameter. Must be an integer >= 1.' },
        { 'X-Request-ID': requestId }
      );
    }

    const page = parsedPage;
    const limit = Math.min(100, parsedLimit);
    const skip = (page - 1) * limit;

    // 5. Validate & parse orderFilter
    const rawFilter = queryParams.orderFilter || 'all';
    if (!ALLOWED_ORDER_FILTERS.includes(rawFilter as any)) {
      return respond(
        res,
        400,
        {
          success: false,
          error: `Invalid orderFilter parameter. Allowed values: ${ALLOWED_ORDER_FILTERS.join(', ')}`,
        },
        { 'X-Request-ID': requestId }
      );
    }
    const orderFilter = rawFilter as OrderFilterType;

    // 6. Validate & parse sortBy
    const rawSort = queryParams.sortBy || 'newest';
    if (!ALLOWED_SORT_OPTIONS.includes(rawSort as any)) {
      return respond(
        res,
        400,
        {
          success: false,
          error: `Invalid sortBy parameter. Allowed values: ${ALLOWED_SORT_OPTIONS.join(', ')}`,
        },
        { 'X-Request-ID': requestId }
      );
    }
    const sortBy = rawSort as CustomerSortOption;

    // 7. Compose query filters
    const where: any = {};
    const andClauses: any[] = [];

    // Search predicate across email, Clerk ID, order snapshots, and request phone
    const rawSearch = queryParams.search;
    if (rawSearch && typeof rawSearch === 'string') {
      const cleanSearch = sanitizeSearchQuery(rawSearch, 100);
      if (cleanSearch) {
        andClauses.push({
          OR: [
            { email: { contains: cleanSearch, mode: 'insensitive' } },
            { clerkUserId: { contains: cleanSearch, mode: 'insensitive' } },
            { orders: { some: { customerName: { contains: cleanSearch, mode: 'insensitive' } } } },
            { orders: { some: { customerPhone: { contains: cleanSearch, mode: 'insensitive' } } } },
            { orders: { some: { customerEmail: { contains: cleanSearch, mode: 'insensitive' } } } },
            { jewelleryRequests: { some: { phone: { contains: cleanSearch, mode: 'insensitive' } } } },
          ],
        });
      }
    }

    // Apply orderFilter
    if (orderFilter === 'with_orders') {
      andClauses.push({ orders: { some: {} } });
    } else if (orderFilter === 'custom_requests') {
      andClauses.push({ jewelleryRequests: { some: {} } });
    } else if (orderFilter === 'repeat_buyers') {
      // Find user IDs with 2 or more orders via groupBy
      const repeatGroups: any = await withTimeout(
        dbClient.order.groupBy({
          by: ['userId'],
          _count: { _all: true },
          having: {
            userId: {
              _count: {
                gte: 2,
              },
            },
          },
        }),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminCustomers.repeatBuyers'
      );
      const repeatUserIds = repeatGroups.map((g: any) => g.userId);
      andClauses.push({ id: { in: repeatUserIds } });
    }

    if (andClauses.length > 0) {
      where.AND = andClauses;
    }

    // 8. Handle deterministic ordering and server-side pagination
    let users: any[] = [];
    let total = 0;

    if (sortBy === 'highest_gross_spend' || sortBy === 'highest_realized_spend') {
      // Server-side ordering by customer spend:
      // Group non-cancelled orders by userId ordered descending by total grandTotal
      const isRealizedSort = sortBy === 'highest_realized_spend';
      const orderWhereForSpend: any = { status: { not: 'CANCELLED' } };

      if (isRealizedSort) {
        orderWhereForSpend.OR = [
          { paymentProvider: { not: 'COD' }, paymentStatus: 'PAID' },
          { paymentProvider: 'COD', OR: [{ status: 'DELIVERED' }, { shippingStatus: 'DELIVERED' }] },
        ];
      }

      const [totalCount, spendGroups]: any = await withTimeout(
        Promise.all([
          dbClient.user.count({ where }),
          dbClient.order.groupBy({
            by: ['userId'],
            _sum: { grandTotal: true },
            where: orderWhereForSpend,
            orderBy: {
              _sum: {
                grandTotal: 'desc',
              },
            },
          }),
        ]),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminCustomers.spendSortGroups'
      );

      total = totalCount;

      // Extract user IDs sorted by spend
      const rankedSpendUserIds: string[] = spendGroups.map((g: any) => g.userId);

      // If search/filters are active, intersect ranked spend IDs with matching user IDs
      let targetUserIdsToFetch: string[] = [];
      if (andClauses.length > 0) {
        const matchingUsers: any = await withTimeout(
          dbClient.user.findMany({
            where,
            select: { id: true, createdAt: true },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'AdminCustomers.matchingSpendUsers'
        );
        const matchingIdsSet = new Set(matchingUsers.map((u: any) => u.id));
        const matchingRanked = rankedSpendUserIds.filter((id) => matchingIdsSet.has(id));
        const zeroSpendUsers = matchingUsers
          .filter((u: any) => !rankedSpendUserIds.includes(u.id))
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .map((u: any) => u.id);

        const allOrderedIds = [...matchingRanked, ...zeroSpendUsers];
        targetUserIdsToFetch = allOrderedIds.slice(skip, skip + limit);
      } else {
        if (skip < rankedSpendUserIds.length) {
          const spendPageSlice = rankedSpendUserIds.slice(skip, skip + limit);
          targetUserIdsToFetch = spendPageSlice;
          if (targetUserIdsToFetch.length < limit) {
            // Fill remaining page slots with 0-spend users
            const remainingNeeded = limit - targetUserIdsToFetch.length;
            const zeroSpendUsers: any = await withTimeout(
              dbClient.user.findMany({
                where: { id: { notIn: rankedSpendUserIds } },
                select: { id: true },
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
                take: remainingNeeded,
              }),
              DEFAULT_DB_TIMEOUT_MS,
              'AdminCustomers.zeroSpendFill'
            );
            targetUserIdsToFetch = targetUserIdsToFetch.concat(zeroSpendUsers.map((u: any) => u.id));
          }
        } else {
          // Beyond spenders: fetch page of 0-spend users
          const zeroSpendSkip = skip - rankedSpendUserIds.length;
          const zeroSpendUsers: any = await withTimeout(
            dbClient.user.findMany({
              where: { id: { notIn: rankedSpendUserIds } },
              select: { id: true },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              skip: zeroSpendSkip,
              take: limit,
            }),
            DEFAULT_DB_TIMEOUT_MS,
            'AdminCustomers.zeroSpendPage'
          );
          targetUserIdsToFetch = zeroSpendUsers.map((u: any) => u.id);
        }
      }

      if (targetUserIdsToFetch.length > 0) {
        const fetchedUsers: any = await withTimeout(
          dbClient.user.findMany({
            where: { id: { in: targetUserIdsToFetch } },
            select: {
              id: true,
              clerkUserId: true,
              email: true,
              createdAt: true,
              orders: {
                select: {
                  id: true,
                  status: true,
                  paymentStatus: true,
                  shippingStatus: true,
                  paymentProvider: true,
                  grandTotal: true,
                  customerName: true,
                  customerPhone: true,
                  customerEmail: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
              jewelleryRequests: {
                select: {
                  id: true,
                  phone: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
              _count: {
                select: {
                  orders: true,
                  jewelleryRequests: true,
                },
              },
            },
          }),
          DEFAULT_DB_TIMEOUT_MS,
          'AdminCustomers.fetchSpendSlice'
        );

        // Preserve deterministic ordering of the target IDs
        const userMap = new Map(fetchedUsers.map((u: any) => [u.id, u]));
        users = targetUserIdsToFetch
          .map((id) => userMap.get(id))
          .filter(Boolean);
      } else {
        users = [];
      }
    } else {
      // Deterministic Prisma-native ordering
      let orderBy: any[] = [{ createdAt: 'desc' }, { id: 'desc' }];
      if (sortBy === 'oldest') {
        orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
      } else if (sortBy === 'most_orders') {
        orderBy = [{ orders: { _count: 'desc' } }, { createdAt: 'desc' }, { id: 'desc' }];
      }

      const [userResults, totalCount]: any = await withTimeout(
        Promise.all([
          dbClient.user.findMany({
            where,
            select: {
              id: true,
              clerkUserId: true,
              email: true,
              createdAt: true,
              orders: {
                select: {
                  id: true,
                  status: true,
                  paymentStatus: true,
                  shippingStatus: true,
                  paymentProvider: true,
                  grandTotal: true,
                  customerName: true,
                  customerPhone: true,
                  customerEmail: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
              jewelleryRequests: {
                select: {
                  id: true,
                  phone: true,
                  createdAt: true,
                },
                orderBy: { createdAt: 'desc' },
              },
              _count: {
                select: {
                  orders: true,
                  jewelleryRequests: true,
                },
              },
            },
            orderBy,
            skip,
            take: limit,
          }),
          dbClient.user.count({ where }),
        ]),
        DEFAULT_DB_TIMEOUT_MS,
        'AdminCustomers.findMany'
      );

      users = userResults;
      total = totalCount;
    }

    // 9. Compute global summary metrics across the matching customer population
    const [
      customersWithOrdersCount,
      customersWithRequestsCount,
      repeatBuyersList,
      grossSpendAggregate,
      prepaidPaidAggregate,
      deliveredCodAggregate,
      refundAggregate,
    ]: any = await withTimeout(
      Promise.all([
        dbClient.user.count({
          where: {
            AND: [where, { orders: { some: {} } }],
          },
        }),
        dbClient.user.count({
          where: {
            AND: [where, { jewelleryRequests: { some: {} } }],
          },
        }),
        dbClient.order.groupBy({
          by: ['userId'],
          where: { user: where },
          having: {
            userId: { _count: { gte: 2 } },
          },
        }),
        dbClient.order.aggregate({
          where: { user: where, status: { not: 'CANCELLED' } },
          _sum: { grandTotal: true },
        }),
        dbClient.order.aggregate({
          where: {
            user: where,
            status: { not: 'CANCELLED' },
            paymentProvider: { not: 'COD' },
            paymentStatus: 'PAID',
          },
          _sum: { grandTotal: true },
        }),
        dbClient.order.aggregate({
          where: {
            user: where,
            status: { not: 'CANCELLED' },
            paymentProvider: 'COD',
            OR: [{ status: 'DELIVERED' }, { shippingStatus: 'DELIVERED' }],
          },
          _sum: { grandTotal: true },
        }),
        dbClient.order.aggregate({
          where: {
            user: where,
            status: { not: 'CANCELLED' },
            paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
          },
          _sum: { grandTotal: true },
        }),
      ]),
      DEFAULT_DB_TIMEOUT_MS,
      'AdminCustomers.summaryMetrics'
    );

    const totalGrossOrderValue = toNum(grossSpendAggregate._sum?.grandTotal);
    const totalPrepaidPaid = toNum(prepaidPaidAggregate._sum?.grandTotal);
    const totalDeliveredCod = toNum(deliveredCodAggregate._sum?.grandTotal);
    const totalNonCancelledRefunds = toNum(refundAggregate._sum?.grandTotal);
    const totalRealizedSpend = Math.max(
      0,
      Math.round((totalPrepaidPaid + totalDeliveredCod - totalNonCancelledRefunds) * 100) / 100
    );

    const summary = {
      totalCustomers: total,
      customersWithOrders: customersWithOrdersCount,
      totalRepeatCustomers: repeatBuyersList.length,
      customersWithCustomRequests: customersWithRequestsCount,
      totalGrossOrderValue,
      totalRealizedSpend,
      scope: 'matching_filter',
    };

    const totalPages = Math.ceil(total / limit) || 1;
    const durationMs = Date.now() - startTime;
    if (durationMs > 1000) {
      logSlowRequest(req, durationMs, { endpoint: '/api/admin/customers', total });
    }

    return respond(
      res,
      200,
      {
        success: true,
        customers: users.map(formatCustomerSummary),
        summary,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      },
      { 'X-Request-ID': requestId }
    );
  } catch (error: any) {
    console.error('Error handling /api/admin/customers:', error);
    const safeError = getSafeErrorMessage(error, 'Failed to retrieve customer records.');
    return respond(
      res,
      500,
      { success: false, error: safeError },
      { 'X-Request-ID': requestId }
    );
  }
}
