import prisma from '../../src/lib/prisma.js';
import { requireAdmin, respond } from './auth.js';
import {
  getSafeErrorMessage,
  withTimeout,
  DEFAULT_DB_TIMEOUT_MS,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
  checkRateLimit,
} from './security.js';

export const ALLOWED_TIME_RANGES = ['30d', '90d', '1y', 'all'] as const;
export type AnalyticsTimeRange = (typeof ALLOWED_TIME_RANGES)[number];

const toNum = (val: any): number => {
  if (val === null || val === undefined) return 0;
  const num = typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
  return Number.isFinite(num) ? Math.round(num * 100) / 100 : 0;
};

/**
 * Definition of a qualifying customer purchase:
 * Non-cancelled prepaid order with paymentStatus === 'PAID', OR
 * Non-cancelled COD order confirmed as delivered by status or shippingStatus.
 *
 * Excludes cancelled, failed, abandoned, or unpaid pending orders.
 */
export const QUALIFYING_ORDER_WHERE: any = {
  status: { not: 'CANCELLED' },
  OR: [
    { paymentProvider: { not: 'COD' }, paymentStatus: 'PAID' },
    { paymentProvider: 'COD', OR: [{ status: 'DELIVERED' }, { shippingStatus: 'DELIVERED' }] },
  ],
};

/**
 * Calculates start date boundary and grouping interval for a given timeRange.
 */
export function getTimeRangeBounds(
  timeRange: AnalyticsTimeRange,
  referenceDate: Date = new Date()
): { startDate: Date | null; bucketType: 'day' | 'week' | 'month' } {
  if (timeRange === '30d') {
    const start = new Date(referenceDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { startDate: start, bucketType: 'day' };
  }
  if (timeRange === '90d') {
    const start = new Date(referenceDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { startDate: start, bucketType: 'week' };
  }
  if (timeRange === '1y') {
    const start = new Date(referenceDate.getTime() - 365 * 24 * 60 * 60 * 1000);
    return { startDate: start, bucketType: 'month' };
  }
  return { startDate: null, bucketType: 'month' };
}

/**
 * Generates continuous time series buckets for customer acquisition counts.
 */
export function generateAcquisitionBuckets(
  registrationDates: Date[],
  bucketType: 'day' | 'week' | 'month',
  startDate: Date | null,
  endDate: Date = new Date()
): Array<{ period: string; label: string; count: number; date: string }> {
  const buckets: Array<{ period: string; label: string; count: number; date: string }> = [];

  if (bucketType === 'day') {
    // Past 30 days: daily buckets
    const effectiveStart = startDate || new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    const cursor = new Date(effectiveStart);
    cursor.setHours(0, 0, 0, 0);

    const endDay = new Date(endDate);
    endDay.setHours(23, 59, 59, 999);

    const dayMap = new Map<string, number>();
    for (const d of registrationDates) {
      const key = d.toISOString().slice(0, 10);
      dayMap.set(key, (dayMap.get(key) || 0) + 1);
    }

    while (cursor <= endDay) {
      const key = cursor.toISOString().slice(0, 10);
      const label = cursor.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
      buckets.push({
        period: key,
        label,
        count: dayMap.get(key) || 0,
        date: key,
      });
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (bucketType === 'week') {
    // Past 90 days: 7-day interval buckets
    const effectiveStart = startDate || new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
    const cursor = new Date(effectiveStart);
    cursor.setHours(0, 0, 0, 0);

    while (cursor <= endDate) {
      const weekStart = new Date(cursor);
      const weekEnd = new Date(cursor.getTime() + 6 * 24 * 60 * 60 * 1000);
      weekEnd.setHours(23, 59, 59, 999);

      const count = registrationDates.filter((d) => d >= weekStart && d <= weekEnd).length;
      const label = `${weekStart.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}`;

      buckets.push({
        period: weekStart.toISOString().slice(0, 10),
        label,
        count,
        date: weekStart.toISOString().slice(0, 10),
      });

      cursor.setDate(cursor.getDate() + 7);
    }
  } else {
    // 1 Year or All time: monthly buckets
    let cursor: Date;
    if (startDate) {
      cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    } else if (registrationDates.length > 0) {
      const earliest = registrationDates[0];
      cursor = new Date(earliest.getFullYear(), earliest.getMonth(), 1);
    } else {
      cursor = new Date(endDate.getFullYear(), endDate.getMonth() - 11, 1);
    }

    const endMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= endMonth) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const nextMonth = new Date(year, month + 1, 1);

      const count = registrationDates.filter((d) => d >= cursor && d < nextMonth).length;
      const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
      const label = cursor.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });

      buckets.push({
        period: monthKey,
        label,
        count,
        date: `${monthKey}-01`,
      });

      cursor = nextMonth;
    }
  }

  return buckets;
}

/**
 * Extracts query parameters from req.query (Vercel) or req.url (Vite dev server / Node).
 */
export function extractAnalyticsQueryParams(req: any): Record<string, string> {
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
 * Admin Customer Analytics API Handler
 *
 * GET /api/admin/customers/analytics?timeRange=30d|90d|1y|all
 *
 * Returns aggregate statistical metrics, retention rates, acquisition time series,
 * and purchase frequency/recency distributions.
 * Strictly returns NO customer PII (no names, emails, phones, or Clerk IDs).
 */
export default async function handler(req: any, res?: any, dbClient: any = prisma) {
  const method = (req.method || 'GET').toUpperCase();
  const requestId = getOrCreateRequestId(req);
  if (res) res._requestId = requestId;
  const startTime = Date.now();

  try {
    // 1. Only GET is allowed for read-only analytics
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
      logSecurityEvent('ADMIN_ANALYTICS_ACCESS_DENIED', {
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
      keyPrefix: 'admin_cust_analytics',
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

    // 4. Validate timeRange parameter
    const queryParams = extractAnalyticsQueryParams(req);
    const rawTimeRange = queryParams.timeRange || '30d';

    if (!ALLOWED_TIME_RANGES.includes(rawTimeRange as any)) {
      return respond(
        res,
        400,
        {
          success: false,
          error: `Invalid timeRange parameter. Allowed values: ${ALLOWED_TIME_RANGES.join(', ')}`,
        },
        { 'X-Request-ID': requestId }
      );
    }

    const timeRange = rawTimeRange as AnalyticsTimeRange;
    const now = new Date();
    const { startDate, bucketType } = getTimeRangeBounds(timeRange, now);

    // 5. Query Lifetime Customer Overview & Segmentation
    // Single grouped query computes customersWithQualifyingPurchases, firstTimeBuyers,
    // repeatBuyers, and order-frequency distribution without loading orders or PII into memory.
    const [
      totalRegisteredCustomers,
      lifetimeQualifyingGroups,
      userRegistrations,
    ]: any = await withTimeout(
      Promise.all([
        dbClient.user.count(),
        dbClient.order.groupBy({
          by: ['userId'],
          where: QUALIFYING_ORDER_WHERE,
          _count: { _all: true },
          _max: { createdAt: true },
        }),
        dbClient.user.findMany({
          where: startDate ? { createdAt: { gte: startDate } } : {},
          select: { createdAt: true },
          orderBy: { createdAt: 'asc' },
        }),
      ]),
      DEFAULT_DB_TIMEOUT_MS,
      'AdminCustomerAnalytics.lifetimeOverview'
    );

    const customersWithQualifyingPurchases = lifetimeQualifyingGroups.length;
    let firstTimeBuyers = 0;
    let repeatBuyers = 0;
    let freqZero = Math.max(0, totalRegisteredCustomers - customersWithQualifyingPurchases);
    let freqOne = 0;
    let freqTwoToFour = 0;
    let freqFivePlus = 0;

    let recencyUnder30 = 0;
    let recency30To90 = 0;
    let recency90To180 = 0;
    let recencyOver180 = 0;

    for (const group of lifetimeQualifyingGroups) {
      const orderCount = group._count?._all || 0;
      if (orderCount === 1) {
        firstTimeBuyers++;
        freqOne++;
      } else if (orderCount >= 2) {
        repeatBuyers++;
        if (orderCount <= 4) {
          freqTwoToFour++;
        } else {
          freqFivePlus++;
        }
      }

      const maxOrderDate = group._max?.createdAt ? new Date(group._max.createdAt) : null;
      if (maxOrderDate) {
        const diffDays = (now.getTime() - maxOrderDate.getTime()) / (1000 * 60 * 60 * 24);
        if (diffDays < 30) {
          recencyUnder30++;
        } else if (diffDays < 90) {
          recency30To90++;
        } else if (diffDays < 180) {
          recency90To180++;
        } else {
          recencyOver180++;
        }
      }
    }

    const repeatPurchaseRate =
      customersWithQualifyingPurchases > 0
        ? Math.round((repeatBuyers / customersWithQualifyingPurchases) * 10000) / 100
        : 0;

    // 6. Query Period-Specific Metrics
    const periodOrderWhere: any = {
      ...QUALIFYING_ORDER_WHERE,
      ...(startDate ? { createdAt: { gte: startDate } } : {}),
    };

    const [
      periodOrderAgg,
      prepaidPaidAgg,
      deliveredCodAgg,
      refundAgg,
      totalRequestsCount,
      periodRequestsCount,
      requestStatusGroups,
    ]: any = await withTimeout(
      Promise.all([
        dbClient.order.aggregate({
          where: periodOrderWhere,
          _count: { _all: true },
          _sum: { grandTotal: true },
        }),
        dbClient.order.aggregate({
          where: {
            status: { not: 'CANCELLED' },
            paymentProvider: { not: 'COD' },
            paymentStatus: 'PAID',
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
          _sum: { grandTotal: true },
        }),
        dbClient.order.aggregate({
          where: {
            status: { not: 'CANCELLED' },
            paymentProvider: 'COD',
            OR: [{ status: 'DELIVERED' }, { shippingStatus: 'DELIVERED' }],
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
          _sum: { grandTotal: true },
        }),
        dbClient.order.aggregate({
          where: {
            status: { not: 'CANCELLED' },
            paymentStatus: { in: ['REFUNDED', 'PARTIALLY_REFUNDED'] },
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
          _sum: { grandTotal: true },
        }),
        dbClient.jewelleryRequest.count(),
        startDate
          ? dbClient.jewelleryRequest.count({ where: { createdAt: { gte: startDate } } })
          : dbClient.jewelleryRequest.count(),
        dbClient.jewelleryRequest.groupBy({
          by: ['status'],
          where: startDate ? { createdAt: { gte: startDate } } : {},
          _count: { _all: true },
        }),
      ]),
      DEFAULT_DB_TIMEOUT_MS,
      'AdminCustomerAnalytics.periodMetrics'
    );

    const periodQualifyingOrdersCount = periodOrderAgg._count?._all || 0;
    const periodGrossOrderValue = toNum(periodOrderAgg._sum?.grandTotal);
    const grossAov =
      periodQualifyingOrdersCount > 0
        ? Math.round((periodGrossOrderValue / periodQualifyingOrdersCount) * 100) / 100
        : null;

    const totalPrepaidPaid = toNum(prepaidPaidAgg._sum?.grandTotal);
    const totalDeliveredCod = toNum(deliveredCodAgg._sum?.grandTotal);
    const totalRefunds = toNum(refundAgg._sum?.grandTotal);
    const periodRealizedSpend = Math.max(
      0,
      Math.round((totalPrepaidPaid + totalDeliveredCod - totalRefunds) * 100) / 100
    );

    // 7. Bucketed Customer Acquisition Trend
    const registrationDateObjects = userRegistrations.map((u: any) => new Date(u.createdAt));
    const acquisitionTrend = generateAcquisitionBuckets(
      registrationDateObjects,
      bucketType,
      startDate,
      now
    );

    // 8. Distributions Format
    const calcPct = (count: number) =>
      totalRegisteredCustomers > 0
        ? Math.round((count / totalRegisteredCustomers) * 1000) / 10
        : 0;

    const orderFrequencyDistribution = [
      { key: 'zero_orders', label: '0 Orders (Unconverted)', count: freqZero, percentage: calcPct(freqZero) },
      { key: 'one_order', label: '1 Order (First-time)', count: freqOne, percentage: calcPct(freqOne) },
      { key: 'two_to_four', label: '2–4 Orders (Repeat)', count: freqTwoToFour, percentage: calcPct(freqTwoToFour) },
      { key: 'five_plus', label: '5+ Orders (Loyal VIP)', count: freqFivePlus, percentage: calcPct(freqFivePlus) },
    ];

    const purchaseRecencyDistribution = [
      { key: 'under_30d', label: 'Active (< 30 days)', count: recencyUnder30, percentage: calcPct(recencyUnder30) },
      { key: '30_to_90d', label: 'Recent (30–90 days)', count: recency30To90, percentage: calcPct(recency30To90) },
      { key: '90_to_180d', label: 'Lapsing (90–180 days)', count: recency90To180, percentage: calcPct(recency90To180) },
      { key: 'over_180d', label: 'Dormant (> 180 days)', count: recencyOver180, percentage: calcPct(recencyOver180) },
      { key: 'never_purchased', label: 'Never Purchased', count: freqZero, percentage: calcPct(freqZero) },
    ];

    const jewelleryRequestBreakdown = requestStatusGroups.map((g: any) => ({
      status: g.status,
      count: g._count?._all || 0,
      label: g.status.replace(/_/g, ' '),
    }));

    const responseData = {
      success: true,
      timeRange,
      generatedAt: now.toISOString(),
      summary: {
        // Lifetime Customer Metrics
        totalRegisteredCustomers,
        customersWithQualifyingPurchases,
        firstTimeBuyers,
        repeatBuyers,
        repeatPurchaseRate,

        // Period Financial Metrics
        periodQualifyingOrdersCount,
        grossOrderValue: periodGrossOrderValue,
        grossAov,
        realizedAov: null, // Limitation: Exact per-order realized cash cannot be calculated due to schema absence of itemized refund ledgers
        realizedSpend: periodRealizedSpend,
        refundedValue: totalRefunds,
        newCustomersInPeriod: userRegistrations.length,

        // Jewellery Requests Activity
        totalJewelleryRequests: totalRequestsCount,
        periodJewelleryRequests: periodRequestsCount,
      },
      acquisitionTrend,
      orderFrequencyDistribution,
      purchaseRecencyDistribution,
      jewelleryRequestBreakdown,
      limitations: {
        refundLimitation:
          'Refund deductions reflect full cancellation refunds; partial refunds cannot be itemized due to schema absence of refund amount fields.',
        realizedAovLimitation:
          'Realized AOV is omitted because exact net cash realization per order cannot be determined when refund adjustments occur.',
        requestAttributionLimitation:
          'Bespoke request-to-order conversion rate is not supported at an entity level because JewelleryRequest and Order models have no foreign key relation in the current schema.',
        qualifyingPurchaseRule:
          'Qualifying purchases include non-cancelled prepaid orders with paymentStatus PAID, and non-cancelled COD orders with status or shippingStatus DELIVERED.',
      },
    };

    const durationMs = Date.now() - startTime;
    if (durationMs > 1000) {
      logSlowRequest(req, durationMs, { endpoint: '/api/admin/customers/analytics', timeRange });
    }

    return respond(res, 200, responseData, { 'X-Request-ID': requestId });
  } catch (error: any) {
    console.error('Error handling /api/admin/customers/analytics:', error);
    const safeError = getSafeErrorMessage(error, 'Failed to compute customer analytics.');
    return respond(
      res,
      500,
      { success: false, error: safeError },
      { 'X-Request-ID': requestId }
    );
  }
}
