import prisma from '../../src/lib/prisma.js';
import { requireAdmin, getRequestBody, respond } from '../_utils/auth.js';

export const ALL_REQUEST_STATUSES = [
  'PENDING',
  'UNDER_REVIEW',
  'QUOTE_SENT',
  'ADVANCE_PAID',
  'SOURCING_IN_PROGRESS',
  'PRODUCT_RECEIVED',
  'BALANCE_PAID',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED',
  'NOT_SOURCEABLE',
] as const;

export type RequestStatusType = (typeof ALL_REQUEST_STATUSES)[number];

/**
 * Valid initial status transitions enforced for Task 5.
 */
export const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['UNDER_REVIEW', 'NOT_SOURCEABLE'],
  UNDER_REVIEW: ['QUOTE_SENT', 'NOT_SOURCEABLE'],
};

/**
 * Extracts request ID from query parameters or sub-path URL.
 */
export function extractRequestId(req: any, body?: any): string | null {
  if (body && typeof body === 'object' && body.id && typeof body.id === 'string') {
    return body.id.trim();
  }

  if (req.query && req.query.id && typeof req.query.id === 'string') {
    return req.query.id.trim();
  }

  if (req.url) {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.searchParams.get('id')) {
        return url.searchParams.get('id')!.trim();
      }
      const segments = url.pathname.replace(/\/+$/, '').split('/').filter(Boolean);
      const idx = segments.indexOf('jewellery-requests');
      if (idx !== -1 && segments.length > idx + 1) {
        const seg = decodeURIComponent(segments[idx + 1]).trim();
        if (seg && seg !== 'index') {
          return seg;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Formats a JewelleryRequest record with full admin visibility.
 */
export function formatAdminJewelleryRequest(r: any) {
  if (!r) return null;

  return {
    id: r.id,
    requestNumber: r.requestNumber,
    userId: r.userId,
    customerEmail: r.user?.email || null,
    customerClerkId: r.user?.clerkUserId || null,
    jewelleryType: r.jewelleryType,
    description: r.description,
    inspirationImageUrl: r.inspirationImageUrl,
    quantity: r.quantity,
    phone: r.phone,
    budget:
      r.budget !== null && r.budget !== undefined
        ? typeof r.budget.toNumber === 'function'
          ? r.budget.toNumber()
          : Number(r.budget)
        : null,
    additionalRequirements: r.additionalRequirements || null,
    status: r.status,
    quotedPrice:
      r.quotedPrice !== null && r.quotedPrice !== undefined
        ? typeof r.quotedPrice.toNumber === 'function'
          ? r.quotedPrice.toNumber()
          : Number(r.quotedPrice)
        : null,
    advanceAmount:
      r.advanceAmount !== null && r.advanceAmount !== undefined
        ? typeof r.advanceAmount.toNumber === 'function'
          ? r.advanceAmount.toNumber()
          : Number(r.advanceAmount)
        : null,
    remainingAmount:
      r.remainingAmount !== null && r.remainingAmount !== undefined
        ? typeof r.remainingAmount.toNumber === 'function'
          ? r.remainingAmount.toNumber()
          : Number(r.remainingAmount)
        : null,
    adminNote: r.adminNote || null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

/**
 * Admin API Handler for Jewellery Requests
 *
 * Supported methods:
 * - GET  /api/admin/jewellery-requests      : List & filter all requests with stats
 * - GET  /api/admin/jewellery-requests/:id  : Get single request details
 * - PATCH /api/admin/jewellery-requests/:id : Update status and/or admin notes
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);

    // 1. Enforce strict server-side Admin Authorization (Clerk metadata role === 'admin')
    const authCheck = await requireAdmin(req, body);
    if (!authCheck.authorized) {
      return respond(res, authCheck.status, {
        success: false,
        error: authCheck.error || 'Forbidden: Administrator privileges required',
      });
    }

    // ==========================================
    // GET: List all requests or get single request
    // ==========================================
    if (method === 'GET') {
      const requestId = extractRequestId(req, body);

      // Single Request Lookup
      if (requestId) {
        const singleRequest = await (prisma as any).jewelleryRequest.findUnique({
          where: { id: requestId },
          include: {
            user: {
              select: {
                id: true,
                clerkUserId: true,
                email: true,
              },
            },
          },
        });

        if (!singleRequest) {
          return respond(res, 404, {
            success: false,
            error: `Jewellery request with ID "${requestId}" not found.`,
          });
        }

        return respond(res, 200, {
          success: true,
          request: formatAdminJewelleryRequest(singleRequest),
        });
      }

      // Query params for filtering & searching
      let statusFilter: string | undefined = undefined;
      let searchQuery: string | undefined = undefined;
      let page = 1;
      let limit = 50;

      if (req.query) {
        if (req.query.status) statusFilter = String(req.query.status).trim();
        if (req.query.search) searchQuery = String(req.query.search).trim();
        if (req.query.page) page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
        if (req.query.limit) limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit), 10) || 50));
      } else if (req.url) {
        try {
          const url = new URL(req.url, 'http://localhost');
          if (url.searchParams.get('status')) statusFilter = url.searchParams.get('status')!.trim();
          if (url.searchParams.get('search')) searchQuery = url.searchParams.get('search')!.trim();
          if (url.searchParams.get('page')) page = Math.max(1, parseInt(url.searchParams.get('page')!, 10) || 1);
          if (url.searchParams.get('limit')) limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit')!, 10) || 50));
        } catch {}
      }

      // Build Prisma where filter
      const whereClause: Record<string, any> = {};

      if (statusFilter && statusFilter !== 'ALL' && (ALL_REQUEST_STATUSES as readonly string[]).includes(statusFilter)) {
        whereClause.status = statusFilter;
      }

      if (searchQuery) {
        whereClause.OR = [
          { requestNumber: { contains: searchQuery, mode: 'insensitive' } },
          { phone: { contains: searchQuery, mode: 'insensitive' } },
          { jewelleryType: { contains: searchQuery, mode: 'insensitive' } },
          { description: { contains: searchQuery, mode: 'insensitive' } },
          { user: { email: { contains: searchQuery, mode: 'insensitive' } } },
        ];
      }

      const skip = (page - 1) * limit;

      const [requests, totalCount, statsData] = await Promise.all([
        (prisma as any).jewelleryRequest.findMany({
          where: whereClause,
          include: {
            user: {
              select: {
                id: true,
                clerkUserId: true,
                email: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: limit,
        }),
        (prisma as any).jewelleryRequest.count({ where: whereClause }),
        // Global aggregate stats for metrics dashboard
        (prisma as any).jewelleryRequest.groupBy({
          by: ['status'],
          _count: {
            status: true,
          },
        }),
      ]);

      const stats = {
        total: 0,
        pending: 0,
        underReview: 0,
        quoteSent: 0,
        notSourceable: 0,
      };

      statsData.forEach((item: any) => {
        const count = item._count.status;
        stats.total += count;
        if (item.status === 'PENDING') stats.pending = count;
        if (item.status === 'UNDER_REVIEW') stats.underReview = count;
        if (item.status === 'QUOTE_SENT') stats.quoteSent = count;
        if (item.status === 'NOT_SOURCEABLE') stats.notSourceable = count;
      });

      return respond(res, 200, {
        success: true,
        requests: requests.map(formatAdminJewelleryRequest),
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
        stats,
      });
    }

    // ==========================================
    // PATCH: Update Request Status & Admin Note
    // ==========================================
    if (method === 'PATCH' || method === 'PUT') {
      const requestId = extractRequestId(req, body);

      if (!requestId) {
        return respond(res, 400, {
          success: false,
          error: 'Missing required request identifier (:id or ?id=...).',
        });
      }

      const existingRequest = await (prisma as any).jewelleryRequest.findUnique({
        where: { id: requestId },
        include: {
          user: {
            select: {
              id: true,
              clerkUserId: true,
              email: true,
            },
          },
        },
      });

      if (!existingRequest) {
        return respond(res, 404, {
          success: false,
          error: `Jewellery request with ID "${requestId}" was not found.`,
        });
      }

      const updateData: Record<string, any> = {};

      // 1. Status Transition Validation
      if (body.status !== undefined) {
        const targetStatus = String(body.status).trim().toUpperCase();

        if (!(ALL_REQUEST_STATUSES as readonly string[]).includes(targetStatus)) {
          return respond(res, 400, {
            success: false,
            error: `Invalid status "${body.status}". Must be one of: ${ALL_REQUEST_STATUSES.join(', ')}`,
          });
        }

        // If status is changing, enforce allowed transition rules
        if (targetStatus !== existingRequest.status) {
          const allowedTargets = ALLOWED_STATUS_TRANSITIONS[existingRequest.status] || [];
          if (!allowedTargets.includes(targetStatus)) {
            return respond(res, 400, {
              success: false,
              error: `Invalid status transition: Cannot move request from "${existingRequest.status}" to "${targetStatus}". Allowed next statuses: ${
                allowedTargets.length > 0 ? allowedTargets.join(', ') : 'None'
              }`,
            });
          }
          updateData.status = targetStatus;
        }
      }

      // 2. Admin Note Update
      if (body.adminNote !== undefined) {
        if (body.adminNote === null) {
          updateData.adminNote = null;
        } else if (typeof body.adminNote === 'string') {
          updateData.adminNote = body.adminNote.trim();
        } else {
          return respond(res, 400, {
            success: false,
            error: 'adminNote must be a string or null.',
          });
        }
      }

      if (Object.keys(updateData).length === 0) {
        return respond(res, 400, {
          success: false,
          error: 'No valid update fields provided (status or adminNote).',
        });
      }

      const updatedRecord = await (prisma as any).jewelleryRequest.update({
        where: { id: existingRequest.id },
        data: updateData,
        include: {
          user: {
            select: {
              id: true,
              clerkUserId: true,
              email: true,
            },
          },
        },
      });

      return respond(res, 200, {
        success: true,
        message: `Jewellery request #${updatedRecord.requestNumber} updated successfully.`,
        request: formatAdminJewelleryRequest(updatedRecord),
      });
    }

    return respond(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed`,
    });
  } catch (error: any) {
    console.error('Admin Jewellery Request API error:', error);
    return respond(res, 500, {
      success: false,
      error: 'Internal server error while processing admin request.',
    });
  }
}
