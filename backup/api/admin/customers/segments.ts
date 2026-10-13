import prisma from '../../../../src/lib/prisma.js';
import { requireAdmin, respond } from '../../../../api/_utils/auth.js';
import {
  getSafeErrorMessage,
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
  checkRateLimit,
  sanitizeSearchQuery,
} from '../../../../api/_utils/security.js';
import { QUALIFYING_ORDER_WHERE } from '../../../../api/_utils/adminCustomerAnalytics.js';

export const ALLOWED_SEGMENT_IDS = [
  'new_customers',
  'first_time_buyers',
  'repeat_buyers',
  'high_value_customers',
  'jewellery_request_customers',
  'inactive_customers',
] as const;

export type CustomerSegmentId = (typeof ALLOWED_SEGMENT_IDS)[number];

export const ALLOWED_SEGMENT_SORT_OPTIONS = [
  'newest',
  'oldest',
  'most_purchases',
  'highest_spend',
  'last_purchased',
] as const;

export type CustomerSegmentSortOption = (typeof ALLOWED_SEGMENT_SORT_OPTIONS)[number];

const toNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
};

export const HIGH_VALUE_THRESHOLD_INR = 3000;
export const NEW_CUSTOMER_WINDOW_DAYS = 30;
export const INACTIVITY_WINDOW_DAYS = 90;

export function getSegmentMetadataList(counts: Record<CustomerSegmentId, number>) {
  return [
    {
      id: 'new_customers' as CustomerSegmentId,
      label: 'New Customers',
      definition: 'Registered within the previous 30 days, regardless of purchase history.',
      purpose: 'Understand recent customer acquisition and store sign-up momentum.',
      customerCount: counts.new_customers || 0,
      thresholdBadge: 'Registered ≤ 30 days ago',
    },
    {
      id: 'first_time_buyers' as CustomerSegmentId,
      label: 'First-Time Buyers',
      definition: 'Customers with exactly one lifetime qualifying purchase.',
      purpose: 'Identify single-purchase buyers who may return for future collections.',
      customerCount: counts.first_time_buyers || 0,
      thresholdBadge: 'Exactly 1 qualifying purchase',
    },
    {
      id: 'repeat_buyers' as CustomerSegmentId,
      label: 'Repeat Buyers',
      definition: 'Customers with at least two lifetime qualifying purchases.',
      purpose: 'Measure repeat-purchase loyalty and returning customer activity.',
      customerCount: counts.repeat_buyers || 0,
      thresholdBadge: '≥ 2 qualifying purchases',
    },
    {
      id: 'high_value_customers' as CustomerSegmentId,
      label: 'High-Value Customers',
      definition: `Customers whose lifetime qualifying gross purchase value is at least INR ${HIGH_VALUE_THRESHOLD_INR}.`,
      purpose: 'Identify customers with comparatively high cumulative gross order value.',
      customerCount: counts.high_value_customers || 0,
      thresholdBadge: `Lifetime Gross Spend ≥ ₹${HIGH_VALUE_THRESHOLD_INR.toLocaleString('en-IN')}`,
    },
    {
      id: 'jewellery_request_customers' as CustomerSegmentId,
      label: 'Jewellery Request Customers',
      definition: 'Customers who have submitted at least one bespoke or inspiration-based jewellery request.',
      purpose: "Understand customer demand for Alongkar's custom sourcing and design service.",
      customerCount: counts.jewellery_request_customers || 0,
      thresholdBadge: '≥ 1 jewellery request',
    },
    {
      id: 'inactive_customers' as CustomerSegmentId,
      label: 'Inactive Customers',
      definition: 'Customers with at least one lifetime qualifying purchase, but no qualifying purchase in the previous 90 days.',
      purpose: 'Analyze historical buyers who have not purchased recently without implying churn.',
      customerCount: counts.inactive_customers || 0,
      thresholdBadge: '≥ 1 purchase, last purchase > 90 days ago',
    },
  ];
}

function extractSegmentQueryParams(req: any) {
  let segment: string | undefined;
  let pageStr: string | undefined;
  let limitStr: string | undefined;
  let sortBy: string | undefined;
  let search: string | undefined;

  if (req.query && typeof req.query === 'object') {
    segment = req.query.segment;
    pageStr = req.query.page;
    limitStr = req.query.limit || req.query.pageSize;
    sortBy = req.query.sortBy;
    search = req.query.search;
  } else if (req.url) {
    try {
      const parsed = new URL(req.url, 'http://localhost');
      segment = parsed.searchParams.get('segment') || undefined;
      pageStr = parsed.searchParams.get('page') || undefined;
      limitStr = parsed.searchParams.get('limit') || parsed.searchParams.get('pageSize') || undefined;
      sortBy = parsed.searchParams.get('sortBy') || undefined;
      search = parsed.searchParams.get('search') || undefined;
    } catch {}
  }

  return { segment, pageStr, limitStr, sortBy, search };
}

export default async function handler(req: any, res?: any, dbClient: any = prisma) {
  const method = (req.method || 'GET').toUpperCase();
  const requestId = getOrCreateRequestId(req);
  if (res) res._requestId = requestId;
  const startTime = Date.now();

  try {
    // 1. Only GET is allowed for read-only segmentation
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
      logSecurityEvent('ADMIN_SEGMENTS_ACCESS_DENIED', {
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

    // 3. Sliding Window Rate Limiter (120 req / min per admin identity)
    const rateLimit = await checkRateLimit(authResult.clerkUserId || 'admin', {
      keyPrefix: 'admin_cust_segments',
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

    // 4. Validate query parameters
    const params = extractSegmentQueryParams(req);
    const selectedSegmentId: CustomerSegmentId =
      (params.segment as CustomerSegmentId) || 'new_customers';

    if (!ALLOWED_SEGMENT_IDS.includes(selectedSegmentId)) {
      return respond(
        res,
        400,
        {
          success: false,
          error: `Invalid segment ID "${params.segment}". Valid segment IDs: ${ALLOWED_SEGMENT_IDS.join(', ')}`,
        },
        { 'X-Request-ID': requestId }
      );
    }

    const rawPage = parseInt(params.pageStr || '1', 10);
    const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : 1;

    const rawLimit = parseInt(params.limitStr || '20', 10);
    if (rawLimit < 1 || rawLimit > 100) {
      return respond(
        res,
        400,
        {
          success: false,
          error: 'Invalid limit parameter. Must be an integer between 1 and 100.',
        },
        { 'X-Request-ID': requestId }
      );
    }
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 20;

    const rawSortBy = (params.sortBy || 'newest').toLowerCase() as CustomerSegmentSortOption;
    if (!ALLOWED_SEGMENT_SORT_OPTIONS.includes(rawSortBy)) {
      return respond(
        res,
        400,
        {
          success: false,
          error: `Invalid sortBy parameter "${params.sortBy}". Allowed sort options: ${ALLOWED_SEGMENT_SORT_OPTIONS.join(', ')}`,
        },
        { 'X-Request-ID': requestId }
      );
    }
    const sortBy = rawSortBy;
    const sanitizedSearch = sanitizeSearchQuery(params.search);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - NEW_CUSTOMER_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - INACTIVITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);

    // 5. Query aggregate data for segment membership calculations
    const [
      newCustomersCount,
      lifetimeQualifyingGroups,
      jewelleryRequestUserGroups,
    ] = await withTimeout(
      Promise.all([
        dbClient.user.count({
          where: { createdAt: { gte: thirtyDaysAgo } },
        }),
        dbClient.order.groupBy({
          by: ['userId'],
          where: QUALIFYING_ORDER_WHERE,
          _count: { _all: true },
          _sum: { grandTotal: true },
          _max: { createdAt: true },
        }),
        dbClient.jewelleryRequest.groupBy({
          by: ['userId'],
          _count: { _all: true },
        }),
      ]),
      DEFAULT_DB_TIMEOUT_MS,
      'AdminCustomerSegments.overview'
    );

    // Build metric map for all qualifying buyers
    interface UserQualifyingStats {
      count: number;
      grossValue: number;
      lastOrderDate: Date | null;
    }
    const qualifyingMap = new Map<string, UserQualifyingStats>();
    for (const group of lifetimeQualifyingGroups) {
      qualifyingMap.set(group.userId, {
        count: group._count?._all || 0,
        grossValue: toNum(group._sum?.grandTotal),
        lastOrderDate: group._max?.createdAt ? new Date(group._max.createdAt) : null,
      });
    }

    // Build jewellery request count map
    const requestsMap = new Map<string, number>();
    for (const group of jewelleryRequestUserGroups) {
      if (group.userId) {
        requestsMap.set(group.userId, group._count?._all || 0);
      }
    }

    // Classify user IDs into segments
    const firstTimeBuyerIds: string[] = [];
    const repeatBuyerIds: string[] = [];
    const highValueBuyerIds: string[] = [];
    const inactiveBuyerIds: string[] = [];

    for (const [userId, stats] of qualifyingMap.entries()) {
      if (stats.count === 1) {
        firstTimeBuyerIds.push(userId);
      } else if (stats.count >= 2) {
        repeatBuyerIds.push(userId);
      }

      if (stats.grossValue >= HIGH_VALUE_THRESHOLD_INR) {
        highValueBuyerIds.push(userId);
      }

      if (stats.count >= 1 && stats.lastOrderDate && stats.lastOrderDate < ninetyDaysAgo) {
        inactiveBuyerIds.push(userId);
      }
    }

    const jewelleryRequestUserIds = Array.from(requestsMap.keys());

    const segmentCounts: Record<CustomerSegmentId, number> = {
      new_customers: newCustomersCount,
      first_time_buyers: firstTimeBuyerIds.length,
      repeat_buyers: repeatBuyerIds.length,
      high_value_customers: highValueBuyerIds.length,
      jewellery_request_customers: jewelleryRequestUserIds.length,
      inactive_customers: inactiveBuyerIds.length,
    };

    const segmentsMeta = getSegmentMetadataList(segmentCounts);

    // 6. Query matching users for the selected segment
    let userWhere: any = {};
    let targetUserIds: string[] | null = null;

    if (selectedSegmentId === 'new_customers') {
      userWhere.createdAt = { gte: thirtyDaysAgo };
    } else if (selectedSegmentId === 'first_time_buyers') {
      targetUserIds = firstTimeBuyerIds;
      userWhere.id = { in: targetUserIds };
    } else if (selectedSegmentId === 'repeat_buyers') {
      targetUserIds = repeatBuyerIds;
      userWhere.id = { in: targetUserIds };
    } else if (selectedSegmentId === 'high_value_customers') {
      targetUserIds = highValueBuyerIds;
      userWhere.id = { in: targetUserIds };
    } else if (selectedSegmentId === 'jewellery_request_customers') {
      targetUserIds = jewelleryRequestUserIds;
      userWhere.id = { in: targetUserIds };
    } else if (selectedSegmentId === 'inactive_customers') {
      targetUserIds = inactiveBuyerIds;
      userWhere.id = { in: targetUserIds };
    }

    // Fast-path: if non-new segment has 0 matching users, return empty page
    if (targetUserIds !== null && targetUserIds.length === 0) {
      return respond(
        res,
        200,
        {
          success: true,
          generatedAt: now.toISOString(),
          selectedSegment: selectedSegmentId,
          segments: segmentsMeta,
          customers: [],
          pagination: {
            page: 1,
            limit,
            total: 0,
            totalPages: 1,
          },
          rules: getSegmentRules(),
        },
        { 'X-Request-ID': requestId }
      );
    }

    // Apply search filter if specified
    if (sanitizedSearch) {
      const searchConditions = [
        { email: { contains: sanitizedSearch, mode: 'insensitive' } },
        { clerkUserId: { contains: sanitizedSearch, mode: 'insensitive' } },
        { orders: { some: { customerName: { contains: sanitizedSearch, mode: 'insensitive' } } } },
        { orders: { some: { customerPhone: { contains: sanitizedSearch } } } },
        { jewelleryRequests: { some: { phone: { contains: sanitizedSearch } } } },
      ];

      userWhere.AND = [
        ...(userWhere.AND || []),
        { OR: searchConditions },
      ];
    }

    // Total count for current filter
    const totalCount: any = await withTimeout(
      dbClient.user.count({ where: userWhere }),
      DEFAULT_DB_TIMEOUT_MS,
      'AdminCustomerSegments.count'
    );

    const totalPages = Math.max(1, Math.ceil(Number(totalCount || 0) / limit));
    const skip = (page - 1) * limit;

    // Fetch user records with latest order and request snapshots
    const users: any = await withTimeout(
      dbClient.user.findMany({
        where: userWhere,
        orderBy: { createdAt: sortBy === 'oldest' ? 'asc' : 'desc' },
        select: {
          id: true,
          clerkUserId: true,
          email: true,
          createdAt: true,
          orders: {
            where: { status: { not: 'CANCELLED' } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              customerName: true,
              customerPhone: true,
              createdAt: true,
            },
          },
          jewelleryRequests: {
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              phone: true,
              createdAt: true,
            },
          },
          _count: {
            select: {
              jewelleryRequests: true,
            },
          },
        },
      }),
      DEFAULT_DB_TIMEOUT_MS,
      'AdminCustomerSegments.findMany'
    );

    // Map each user to segment member format
    const userList: any[] = Array.isArray(users) ? users : [];
    let memberList = userList.map((u: any) => {
      const stats = qualifyingMap.get(u.id) || {
        count: 0,
        grossValue: 0,
        lastOrderDate: null,
      };
      const reqCount = typeof u._count?.jewelleryRequests === 'number'
        ? u._count.jewelleryRequests
        : (requestsMap.get(u.id) || 0);

      const latestOrder = u.orders?.[0] || null;
      const latestRequest = u.jewelleryRequests?.[0] || null;

      const displayName = latestOrder?.customerName || null;
      const phone = latestOrder?.customerPhone || latestRequest?.phone || null;

      // Compute overlapping membership tags
      const isNew = new Date(u.createdAt) >= thirtyDaysAgo;
      const isFirst = stats.count === 1;
      const isRepeat = stats.count >= 2;
      const isHighValue = stats.grossValue >= HIGH_VALUE_THRESHOLD_INR;
      const hasRequests = reqCount > 0;
      const isInactive = stats.count >= 1 && stats.lastOrderDate && stats.lastOrderDate < ninetyDaysAgo;

      const segmentTags: string[] = [];
      if (isNew) segmentTags.push('New Customer');
      if (isFirst) segmentTags.push('First-Time Buyer');
      if (isRepeat) segmentTags.push('Repeat Buyer');
      if (isHighValue) segmentTags.push('High-Value');
      if (hasRequests) segmentTags.push('Jewellery Request');
      if (isInactive) segmentTags.push('Inactive');

      return {
        id: u.id,
        registeredEmail: u.email || null,
        displayName,
        phone,
        createdAt: new Date(u.createdAt).toISOString(),
        qualifyingPurchasesCount: stats.count,
        lifetimeGrossPurchaseValue: stats.grossValue,
        lastQualifyingPurchaseDate: stats.lastOrderDate ? stats.lastOrderDate.toISOString() : null,
        hasJewelleryRequests: hasRequests,
        jewelleryRequestsCount: reqCount,
        segmentTags,
      };
    });

    // In-memory sorting for metric-specific sort options
    if (sortBy === 'most_purchases') {
      memberList.sort((a: any, b: any) => b.qualifyingPurchasesCount - a.qualifyingPurchasesCount);
    } else if (sortBy === 'highest_spend') {
      memberList.sort((a: any, b: any) => b.lifetimeGrossPurchaseValue - a.lifetimeGrossPurchaseValue);
    } else if (sortBy === 'last_purchased') {
      memberList.sort((a: any, b: any) => {
        const dateA = a.lastQualifyingPurchaseDate ? new Date(a.lastQualifyingPurchaseDate).getTime() : 0;
        const dateB = b.lastQualifyingPurchaseDate ? new Date(b.lastQualifyingPurchaseDate).getTime() : 0;
        return dateB - dateA;
      });
    }

    // Apply pagination slice
    const pagedMembers = memberList.slice(skip, skip + limit);

    const durationMs = Date.now() - startTime;
    if (durationMs > 1000) {
      logSlowRequest(req, durationMs, {
        endpoint: '/api/admin/customers/segments',
        segment: selectedSegmentId,
        page,
        limit,
      });
    }

    return respond(
      res,
      200,
      {
        success: true,
        generatedAt: now.toISOString(),
        selectedSegment: selectedSegmentId,
        segments: segmentsMeta,
        customers: pagedMembers,
        pagination: {
          page,
          limit,
          total: totalCount,
          totalPages,
        },
        rules: getSegmentRules(),
      },
      { 'X-Request-ID': requestId }
    );
  } catch (error: any) {
    console.error('Error handling /api/admin/customers/segments:', error);
    const safeError = getSafeErrorMessage(error, 'Failed to compute customer segments.');
    return respond(
      res,
      500,
      { success: false, error: safeError },
      { 'X-Request-ID': requestId }
    );
  }
}

function getSegmentRules() {
  return {
    qualifyingPurchaseRule:
      'Qualifying purchases include non-cancelled prepaid orders with paymentStatus PAID, and non-cancelled COD orders with status or shippingStatus DELIVERED. Cancelled, failed, abandoned, and unpaid orders are excluded.',
    highValueThresholdRule:
      `High-Value threshold is set at INR ${HIGH_VALUE_THRESHOLD_INR.toLocaleString('en-IN')} cumulative gross qualifying purchase value. Reflects gross order value; does not represent net realized cash after refunds.`,
    inactivityRule:
      `Inactive buyers must possess at least one lifetime qualifying purchase, with no qualifying purchase placed within the past ${INACTIVITY_WINDOW_DAYS} days. Customers with zero lifetime purchases are excluded from this segment.`,
    refundLimitation:
      'Partial refunds cannot be deducted at the item level due to schema absence of refund amount fields. Lifetime gross purchase value reflects gross order grandTotals before full cancellation refunds.',
  };
}
