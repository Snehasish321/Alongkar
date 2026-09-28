import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond } from './_utils/auth.js';
import { Prisma } from '@prisma/client';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates whether a given string is a valid HTTP/HTTPS URL.
 */
export function isValidUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validates phone number format (standard Indian 10-digit mobile number, with optional +91 or 0 prefix).
 */
export function isValidPhone(phoneStr: string): boolean {
  if (typeof phoneStr !== 'string') return false;
  const cleaned = phoneStr.replace(/[\s\-()]/g, '');
  // Matches: 10 digits starting with 6-9, optionally prefixed with +91, 91, or 0
  return /^(?:\+?91|0)?[6-9]\d{9}$/.test(cleaned);
}

/**
 * Generates a unique, human-readable request number.
 * Format: REQ-YYYYMMDD-XXXXX (e.g., REQ-20260928-K9P2X)
 */
export function generateRequestNumber(): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `REQ-${datePart}-${randomPart}`;
}

/**
 * Formats a database JewelleryRequest record for customer responses,
 * strictly excluding admin-only fields (adminNote, quotedPrice, advanceAmount, remainingAmount).
 */
export function formatCustomerJewelleryRequest(record: any) {
  if (!record) return null;

  return {
    id: record.id,
    requestNumber: record.requestNumber,
    jewelleryType: record.jewelleryType,
    description: record.description,
    budget: record.budget !== null && record.budget !== undefined
      ? (typeof record.budget.toNumber === 'function' ? record.budget.toNumber() : Number(record.budget))
      : null,
    quantity: record.quantity,
    phone: record.phone,
    additionalRequirements: record.additionalRequirements || null,
    inspirationImageUrl: record.inspirationImageUrl,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Validates the creation payload for customer jewellery request submission.
 */
export function validateJewelleryRequestCreatePayload(body: any): {
  errors: ValidationError[];
  data?: {
    jewelleryType: string;
    description: string;
    inspirationImageUrl: string;
    quantity: number;
    phone: string;
    budget: number | null;
    additionalRequirements: string | null;
  };
} {
  const errors: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  // 1. Jewellery Type (required, non-empty string)
  if (!body.jewelleryType || typeof body.jewelleryType !== 'string' || body.jewelleryType.trim().length === 0) {
    errors.push({ field: 'jewelleryType', message: 'Jewellery type is required' });
  }

  // 2. Description (required, non-empty string)
  if (!body.description || typeof body.description !== 'string' || body.description.trim().length === 0) {
    errors.push({ field: 'description', message: 'Description is required and cannot be empty' });
  }

  // 3. Inspiration Image URL (required, valid HTTP/HTTPS URL)
  if (!body.inspirationImageUrl || typeof body.inspirationImageUrl !== 'string' || body.inspirationImageUrl.trim().length === 0) {
    errors.push({ field: 'inspirationImageUrl', message: 'Inspiration image URL is required' });
  } else if (!isValidUrl(body.inspirationImageUrl.trim())) {
    errors.push({
      field: 'inspirationImageUrl',
      message: 'Inspiration image URL must be a valid HTTP or HTTPS URL',
    });
  }

  // 4. Quantity (optional input with default of 1, but if provided must be a positive integer)
  let quantity = 1;
  if (body.quantity !== undefined && body.quantity !== null) {
    if (typeof body.quantity !== 'number' || !Number.isInteger(body.quantity) || body.quantity <= 0) {
      errors.push({ field: 'quantity', message: 'Quantity must be a positive integer (minimum 1)' });
    } else {
      quantity = body.quantity;
    }
  }

  // 5. Phone number (required, valid phone format)
  if (!body.phone || typeof body.phone !== 'string' || body.phone.trim().length === 0) {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else if (!isValidPhone(body.phone.trim())) {
    errors.push({
      field: 'phone',
      message: 'Please provide a valid 10-digit mobile phone number',
    });
  }

  // 6. Budget (optional, numeric or numeric range)
  let parsedBudget: number | null = null;
  if (body.budget !== undefined && body.budget !== null && body.budget !== '') {
    if (typeof body.budget === 'number') {
      if (isNaN(body.budget) || body.budget < 0) {
        errors.push({ field: 'budget', message: 'Budget must be a non-negative number' });
      } else {
        parsedBudget = body.budget;
      }
    } else if (typeof body.budget === 'string') {
      const trimmedBudget = body.budget.trim();
      if (trimmedBudget.length > 0) {
        const rangeMatch = trimmedBudget.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
          parsedBudget = parseFloat(rangeMatch[2]);
        } else {
          const num = parseFloat(trimmedBudget.replace(/[^0-9.]/g, ''));
          if (!isNaN(num) && num >= 0) {
            parsedBudget = num;
          } else {
            errors.push({ field: 'budget', message: 'Budget must be a valid numeric amount' });
          }
        }
      }
    } else {
      errors.push({ field: 'budget', message: 'Budget must be a numeric value' });
    }
  }

  // 7. Additional Requirements (optional string)
  let additionalRequirements: string | null = null;
  if (body.additionalRequirements !== undefined && body.additionalRequirements !== null) {
    if (typeof body.additionalRequirements === 'string') {
      const trimmed = body.additionalRequirements.trim();
      additionalRequirements = trimmed.length > 0 ? trimmed : null;
    } else {
      errors.push({ field: 'additionalRequirements', message: 'Additional requirements must be a string' });
    }
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    errors: [],
    data: {
      jewelleryType: body.jewelleryType.trim(),
      description: body.description.trim(),
      inspirationImageUrl: body.inspirationImageUrl.trim(),
      quantity,
      phone: body.phone.trim(),
      budget: parsedBudget,
      additionalRequirements,
    },
  };
}

/**
 * Server-side Jewellery Request API Handler
 *
 * Supported methods:
 * - GET  /api/jewellery-requests : Retrieve current customer's requests (newest first)
 * - POST /api/jewellery-requests : Submit a new jewellery sourcing request
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);
    const user = await getAuthenticatedUser(req, body);

    if (!user) {
      return respond(res, 401, {
        success: false,
        error: 'Unauthorized: Valid Clerk session required',
      });
    }

    // ==========================================
    // GET: Retrieve authenticated customer's requests
    // ==========================================
    if (method === 'GET') {
      const requests = await (prisma as any).jewelleryRequest.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
      });

      return respond(res, 200, {
        success: true,
        requests: requests.map(formatCustomerJewelleryRequest),
      });
    }

    // ==========================================
    // POST: Create a new jewellery sourcing request
    // ==========================================
    if (method === 'POST') {
      const { errors, data } = validateJewelleryRequestCreatePayload(body);

      if (errors.length > 0 || !data) {
        return respond(res, 400, {
          success: false,
          error: errors[0]?.message || 'Validation failed: Invalid or missing request fields',
          details: errors,
        });
      }

      // Try creating with a unique requestNumber, retrying on rare collision
      const maxRetries = 3;
      let lastError: any = null;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const requestNumber = generateRequestNumber();

          const createdRequest = await (prisma as any).jewelleryRequest.create({
            data: {
              requestNumber,
              userId: user.id, // Strictly server-controlled from authenticated session
              inspirationImageUrl: data.inspirationImageUrl,
              jewelleryType: data.jewelleryType,
              description: data.description,
              budget: data.budget !== null ? new Prisma.Decimal(data.budget) : null,
              quantity: data.quantity,
              phone: data.phone,
              additionalRequirements: data.additionalRequirements,
              status: 'PENDING', // Initial lifecycle status is always PENDING
            },
          });

          return respond(res, 201, {
            success: true,
            message: 'Jewellery request submitted successfully',
            request: formatCustomerJewelleryRequest(createdRequest),
          });
        } catch (err) {
          lastError = err;
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002' &&
            Array.isArray(err.meta?.target) &&
            err.meta.target.includes('requestNumber')
          ) {
            // Collision on generated requestNumber, retry loop
            continue;
          }
          break;
        }
      }

      console.error('Database error creating JewelleryRequest:', lastError);
      return respond(res, 500, {
        success: false,
        error: 'Failed to create jewellery request in database',
      });
    }

    return respond(res, 405, {
      success: false,
      error: `Method ${method} Not Allowed`,
    });
  } catch (error) {
    console.error('JewelleryRequest API unhandled error:', error);
    return respond(res, 500, {
      success: false,
      error: 'Internal Server Error',
    });
  }
}
