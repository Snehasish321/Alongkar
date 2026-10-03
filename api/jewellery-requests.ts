import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import {
  isValidString,
  isValidHttpUrl,
  isValidPhoneNumber,
  isValidNumber,
  isValidInteger,
  getSafeErrorMessage,
  checkRateLimit,
} from './_utils/security.js';
import { Prisma } from '@prisma/client';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validates whether a given string is a valid HTTP/HTTPS URL.
 */
export function isValidUrl(urlStr: string): boolean {
  return isValidHttpUrl(urlStr, 1000);
}

/**
 * Validates phone number format (standard Indian 10-digit mobile number, with optional +91 or 0 prefix).
 */
export function isValidPhone(phoneStr: string): boolean {
  return isValidPhoneNumber(phoneStr);
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

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  // 1. Jewellery Type (required, 1 - 100 characters)
  if (!isValidString(body.jewelleryType, 1, 100)) {
    errors.push({ field: 'jewelleryType', message: 'Jewellery type is required (maximum 100 characters)' });
  }

  // 2. Description (required, 1 - 2000 characters)
  if (!isValidString(body.description, 1, 2000)) {
    errors.push({ field: 'description', message: 'Description is required (maximum 2000 characters)' });
  }

  // 3. Inspiration Reference: Image URL OR Inspiration Link (mutually exclusive, exactly one required)
  const rawImageUrl = typeof body.inspirationImageUrl === 'string' ? body.inspirationImageUrl.trim() : '';
  const rawLink = typeof body.inspirationLink === 'string' ? body.inspirationLink.trim() : '';

  let finalInspirationUrl = '';

  if (rawImageUrl && rawLink && rawImageUrl !== rawLink) {
    errors.push({
      field: 'inspiration',
      message: 'Please provide only one inspiration reference: an image or a link.',
    });
  } else if (!rawImageUrl && !rawLink) {
    errors.push({
      field: 'inspirationImageUrl',
      message: 'Please provide an inspiration image or an inspiration link.',
    });
  } else if (rawImageUrl && (!rawLink || rawImageUrl === rawLink)) {
    if (!isValidUrl(rawImageUrl)) {
      errors.push({
        field: 'inspirationImageUrl',
        message: 'Inspiration image URL must be a valid HTTP or HTTPS URL (maximum 1000 characters)',
      });
    } else {
      finalInspirationUrl = rawImageUrl;
    }
  } else if (rawLink) {
    if (!isValidUrl(rawLink)) {
      errors.push({
        field: 'inspirationLink',
        message: 'Inspiration link must be a valid HTTP or HTTPS URL (maximum 1000 characters)',
      });
    } else {
      finalInspirationUrl = rawLink;
    }
  }

  // 4. Quantity (optional input with default of 1, but if provided must be a positive integer <= 1000)
  let quantity = 1;
  if (body.quantity !== undefined && body.quantity !== null) {
    if (!isValidInteger(body.quantity, 1, 1000)) {
      errors.push({ field: 'quantity', message: 'Quantity must be a positive integer between 1 and 1000' });
    } else {
      quantity = body.quantity;
    }
  }

  // 5. Phone number (required, valid 10-digit format)
  if (!body.phone || typeof body.phone !== 'string' || body.phone.trim().length === 0) {
    errors.push({ field: 'phone', message: 'Phone number is required' });
  } else if (!isValidPhone(body.phone.trim())) {
    errors.push({
      field: 'phone',
      message: 'Please provide a valid 10-digit mobile phone number',
    });
  }

  // 6. Budget (optional, numeric or numeric range, max 100,000,000)
  let parsedBudget: number | null = null;
  if (body.budget !== undefined && body.budget !== null && body.budget !== '') {
    if (typeof body.budget === 'number') {
      if (!isValidNumber(body.budget, 0, 100_000_000)) {
        errors.push({ field: 'budget', message: 'Budget must be a non-negative finite number (max 100,000,000)' });
      } else {
        parsedBudget = body.budget;
      }
    } else if (typeof body.budget === 'string') {
      const trimmedBudget = body.budget.trim();
      if (trimmedBudget.length > 0) {
        const rangeMatch = trimmedBudget.match(/^(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)$/);
        if (rangeMatch) {
          const num = parseFloat(rangeMatch[2]);
          if (isValidNumber(num, 0, 100_000_000)) {
            parsedBudget = num;
          } else {
            errors.push({ field: 'budget', message: 'Budget range maximum is invalid' });
          }
        } else {
          const num = parseFloat(trimmedBudget.replace(/[^0-9.]/g, ''));
          if (isValidNumber(num, 0, 100_000_000)) {
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

  // 7. Additional Requirements (optional string up to 2000 chars)
  let additionalRequirements: string | null = null;
  if (body.additionalRequirements !== undefined && body.additionalRequirements !== null) {
    if (typeof body.additionalRequirements === 'string') {
      const trimmed = body.additionalRequirements.trim();
      if (trimmed.length > 2000) {
        errors.push({ field: 'additionalRequirements', message: 'Additional requirements cannot exceed 2000 characters' });
      } else {
        additionalRequirements = trimmed.length > 0 ? trimmed : null;
      }
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
      inspirationImageUrl: finalInspirationUrl,
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
 * - GET  /api/jewellery-requests : Retrieve current authenticated customer's requests (newest first)
 * - POST /api/jewellery-requests : Submit a new jewellery sourcing request
 */
export default async function handler(req: any, res?: any) {
  const method = (req.method || 'GET').toUpperCase();

  try {
    const body = await getRequestBody(req);

    if (isPayloadTooLarge(body)) {
      return respond(res, 413, {
        success: false,
        error: 'Payload too large: maximum allowed JSON body size is 1MB',
      });
    }
    if (isMalformedJson(body)) {
      return respond(res, 400, {
        success: false,
        error: 'Invalid JSON payload format',
      });
    }

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
      // Rate limiting: 10 submissions per 10 minutes per authenticated user
      const rateCheck = await checkRateLimit(user.id, {
        keyPrefix: 'jewellery_req',
        limit: 10,
        windowSeconds: 600,
      });

      if (!rateCheck.allowed) {
        return respond(
          res,
          429,
          {
            success: false,
            error: 'You have submitted too many requests recently. Please wait a few minutes before trying again.',
          },
          { 'Retry-After': String(rateCheck.resetSeconds) }
        );
      }

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
        error: getSafeErrorMessage(lastError, 'Failed to create jewellery request in database'),
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
      error: getSafeErrorMessage(error, 'Internal Server Error'),
    });
  }
}
