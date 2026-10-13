import prisma from '../src/lib/prisma.js';
import { getAuthenticatedUser, getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import {
  isValidString,
  isValidPhoneNumber,
  isValidIdentifier,
  getSafeErrorMessage,
  logServerError,
  withTimeout,
  checkRateLimit,
  getOrCreateRequestId,
  logSlowRequest,
  logSecurityEvent,
} from './_utils/security.js';

export interface AddressValidationError {
  field: string;
  message: string;
}

export interface SanitizedAddressInput {
  recipientName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
}

/**
 * Normalizes an Indian mobile number to exactly 10 digits.
 */
export function normalizePhoneNumber(raw: string): string {
  const cleaned = raw.replace(/[\s\-()]/g, '');
  return cleaned.replace(/^(?:\+?91|0)/, '').slice(-10);
}

/**
 * Validates and sanitizes address input data for creation or update.
 * Strictly prevents mass assignment by only accepting explicitly allowed fields.
 */
export function validateAddressInput(
  body: any,
  isPartial = false
): { errors: AddressValidationError[]; data?: Partial<SanitizedAddressInput> } {
  const errors: AddressValidationError[] = [];

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a valid JSON object' }] };
  }

  const result: Partial<SanitizedAddressInput> = {};

  // 1. Recipient Name (2 - 100 characters)
  if (body.recipientName !== undefined || !isPartial) {
    if (!isValidString(body.recipientName, 2, 100)) {
      errors.push({
        field: 'recipientName',
        message: 'Recipient name is required (between 2 and 100 characters)',
      });
    } else {
      result.recipientName = body.recipientName.trim().slice(0, 100);
    }
  }

  // 2. Phone (Valid Indian mobile)
  if (body.phone !== undefined || !isPartial) {
    if (typeof body.phone !== 'string' || !isValidPhoneNumber(body.phone)) {
      errors.push({
        field: 'phone',
        message: 'Valid 10-digit Indian mobile number is required',
      });
    } else {
      const normalized = normalizePhoneNumber(body.phone);
      if (!/^[6-9]\d{9}$/.test(normalized)) {
        errors.push({
          field: 'phone',
          message: 'Mobile number must be a valid 10-digit Indian number',
        });
      } else {
        result.phone = normalized;
      }
    }
  }

  // 3. Address Line 1 (3 - 200 characters)
  if (body.line1 !== undefined || !isPartial) {
    if (!isValidString(body.line1, 3, 200)) {
      errors.push({
        field: 'line1',
        message: 'Address line 1 is required (between 3 and 200 characters)',
      });
    } else {
      result.line1 = body.line1.trim().slice(0, 200);
    }
  }

  // 4. Address Line 2 (optional, max 200 characters)
  if (body.line2 !== undefined) {
    if (body.line2 === null || body.line2 === '') {
      result.line2 = null;
    } else if (typeof body.line2 === 'string' && body.line2.length <= 200) {
      result.line2 = body.line2.trim().slice(0, 200);
    } else {
      errors.push({
        field: 'line2',
        message: 'Address line 2 must not exceed 200 characters',
      });
    }
  } else if (!isPartial) {
    result.line2 = null;
  }

  // 5. City (2 - 100 characters)
  if (body.city !== undefined || !isPartial) {
    if (!isValidString(body.city, 2, 100)) {
      errors.push({
        field: 'city',
        message: 'City is required (between 2 and 100 characters)',
      });
    } else {
      result.city = body.city.trim().slice(0, 100);
    }
  }

  // 6. State (2 - 100 characters)
  if (body.state !== undefined || !isPartial) {
    if (!isValidString(body.state, 2, 100)) {
      errors.push({
        field: 'state',
        message: 'State is required (between 2 and 100 characters)',
      });
    } else {
      result.state = body.state.trim().slice(0, 100);
    }
  }

  // 7. Pincode (exactly 6 digits)
  if (body.pincode !== undefined || !isPartial) {
    const pinStr =
      typeof body.pincode === 'string' || typeof body.pincode === 'number'
        ? String(body.pincode).trim()
        : '';
    if (!/^[1-9]\d{5}$/.test(pinStr)) {
      errors.push({
        field: 'pincode',
        message: 'Pincode must be exactly 6 digits',
      });
    } else {
      result.pincode = pinStr;
    }
  }

  // 8. Country (server always sets to 'India'; accepts customer payload compatibly without allowing non-India shipping)
  if (body.country !== undefined && body.country !== null) {
    if (typeof body.country === 'string' && body.country.length > 50) {
      errors.push({
        field: 'country',
        message: 'Country must not exceed 50 characters',
      });
    } else {
      result.country = 'India';
    }
  } else if (!isPartial) {
    result.country = 'India';
  }

  // 9. isDefault (boolean)
  if (body.isDefault !== undefined) {
    if (typeof body.isDefault === 'boolean') {
      result.isDefault = body.isDefault;
    } else {
      errors.push({
        field: 'isDefault',
        message: 'isDefault must be a boolean',
      });
    }
  } else if (!isPartial) {
    result.isDefault = false;
  }

  if (errors.length > 0) {
    return { errors };
  }

  return { errors: [], data: result };
}

/**
 * Formats a SavedAddress record for safe client response.
 */
export function formatAddressResponse(addr: any) {
  if (!addr) return null;
  return {
    id: addr.id,
    recipientName: addr.recipientName,
    phone: addr.phone,
    line1: addr.line1,
    line2: addr.line2 || null,
    city: addr.city,
    state: addr.state,
    pincode: addr.pincode,
    country: addr.country || 'India',
    isDefault: Boolean(addr.isDefault),
    createdAt: addr.createdAt instanceof Date ? addr.createdAt.toISOString() : addr.createdAt,
    updatedAt: addr.updatedAt instanceof Date ? addr.updatedAt.toISOString() : addr.updatedAt,
  };
}

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const requestId = getOrCreateRequestId(req);
  const method = req.method?.toUpperCase();

  // Allow standard HTTP methods
  if (!['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'].includes(method)) {
    return respond(res, 405, { error: 'Method Not Allowed' }, { Allow: 'GET, POST, PUT, DELETE, OPTIONS' });
  }

  if (method === 'OPTIONS') {
    return respond(res, 204, null, {
      Allow: 'GET, POST, PUT, DELETE, OPTIONS',
    });
  }

  try {
    const body = await getRequestBody(req);

    if (isPayloadTooLarge(body)) {
      logSecurityEvent({
        event: 'payload_too_large',
        endpoint: '/api/addresses',
        method,
        requestId,
        statusCode: 413,
      });
      return respond(res, 413, {
        success: false,
        error: 'Payload too large: maximum allowed JSON body size is 1MB',
      });
    }

    if (isMalformedJson(body)) {
      logSecurityEvent({
        event: 'malformed_json',
        endpoint: '/api/addresses',
        method,
        requestId,
        statusCode: 400,
      });
      return respond(res, 400, {
        success: false,
        error: 'Invalid JSON payload format',
      });
    }

    // Authenticate user using Clerk session
    const user = await getAuthenticatedUser(req, body);

    if (!user) {
      logSecurityEvent({
        event: 'unauthorized_access',
        endpoint: '/api/addresses',
        method,
        requestId,
        statusCode: 401,
      });
      return respond(res, 401, {
        success: false,
        error: 'Unauthorized: Valid Clerk session required',
      });
    }

    // Rate limiting: 60 address operations per minute per authenticated user
    const rateCheck = await checkRateLimit(user.id, {
      keyPrefix: 'saved_addresses',
      limit: 60,
      windowSeconds: 60,
    });

    if (!rateCheck.allowed) {
      return respond(
        res,
        429,
        {
          success: false,
          error: 'Too many address requests. Please wait a moment and try again.',
          retryAfter: rateCheck.resetSeconds,
        },
        {
          'Retry-After': String(rateCheck.resetSeconds),
        }
      );
    }

    // Extract address ID from URL query parameters or request body
    const urlObj = new URL(req.url, `http://${req.headers?.host || 'localhost'}`);
    const queryId = urlObj.searchParams.get('id');
    const targetId = queryId || (body && typeof body.id === 'string' ? body.id : null);

    // ==========================================
    // GET: Retrieve authenticated customer's addresses
    // ==========================================
    if (method === 'GET') {
      const addresses = await withTimeout(
        prisma.savedAddress.findMany({
          where: { userId: user.id },
          orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
        }),
        8000,
        'Fetch user saved addresses'
      );

      return respond(res, 200, {
        success: true,
        addresses: addresses.map(formatAddressResponse),
      });
    }

    // ==========================================
    // POST: Create a new saved address
    // ==========================================
    if (method === 'POST') {
      const validation = validateAddressInput(body, false);
      if (validation.errors.length > 0) {
        return respond(res, 400, {
          success: false,
          error: 'Validation failed',
          errors: validation.errors,
        });
      }

      const input = validation.data as SanitizedAddressInput;

      // Check if user currently has any saved addresses
      const existingCount = await prisma.savedAddress.count({
        where: { userId: user.id },
      });

      // If user has no existing addresses, make this the default address automatically
      const shouldBeDefault = input.isDefault || existingCount === 0;

      let createdAddress;
      if (shouldBeDefault) {
        // Enforce single default address invariant atomically
        createdAddress = await prisma.$transaction(async (tx) => {
          await tx.savedAddress.updateMany({
            where: { userId: user.id, isDefault: true },
            data: { isDefault: false },
          });
          return await tx.savedAddress.create({
            data: {
              userId: user.id,
              recipientName: input.recipientName,
              phone: input.phone,
              line1: input.line1,
              line2: input.line2,
              city: input.city,
              state: input.state,
              pincode: input.pincode,
              country: input.country,
              isDefault: true,
            },
          });
        });
      } else {
        createdAddress = await prisma.savedAddress.create({
          data: {
            userId: user.id,
            recipientName: input.recipientName,
            phone: input.phone,
            line1: input.line1,
            line2: input.line2,
            city: input.city,
            state: input.state,
            pincode: input.pincode,
            country: input.country,
            isDefault: false,
          },
        });
      }

      return respond(res, 201, {
        success: true,
        message: 'Address saved successfully',
        address: formatAddressResponse(createdAddress),
      });
    }

    // ==========================================
    // PUT: Update an existing saved address or set default
    // ==========================================
    if (method === 'PUT') {
      if (!targetId || !isValidIdentifier(targetId)) {
        return respond(res, 400, {
          success: false,
          error: 'A valid address ID is required for updating',
        });
      }

      // Strict server-side ownership verification:
      // Return 404 if the address does not exist OR does not belong to the authenticated user.
      const existing = await prisma.savedAddress.findFirst({
        where: { id: targetId, userId: user.id },
      });

      if (!existing) {
        return respond(res, 404, {
          success: false,
          error: 'Address not found',
        });
      }

      // Check if this is a dedicated "set default" action
      if (body.action === 'set_default' || (body.isDefault === true && Object.keys(body).length <= 2)) {
        const updatedAddress = await prisma.$transaction(async (tx) => {
          await tx.savedAddress.updateMany({
            where: { userId: user.id, isDefault: true },
            data: { isDefault: false },
          });
          return await tx.savedAddress.update({
            where: { id: targetId },
            data: { isDefault: true },
          });
        });

        return respond(res, 200, {
          success: true,
          message: 'Default address updated',
          address: formatAddressResponse(updatedAddress),
        });
      }

      const validation = validateAddressInput(body, true);
      if (validation.errors.length > 0) {
        return respond(res, 400, {
          success: false,
          error: 'Validation failed',
          errors: validation.errors,
        });
      }

      const updateData = validation.data || {};

      let updatedAddress;
      if (updateData.isDefault === true) {
        updatedAddress = await prisma.$transaction(async (tx) => {
          await tx.savedAddress.updateMany({
            where: { userId: user.id, isDefault: true },
            data: { isDefault: false },
          });
          return await tx.savedAddress.update({
            where: { id: targetId },
            data: updateData,
          });
        });
      } else {
        updatedAddress = await prisma.savedAddress.update({
          where: { id: targetId },
          data: updateData,
        });
      }

      return respond(res, 200, {
        success: true,
        message: 'Address updated successfully',
        address: formatAddressResponse(updatedAddress),
      });
    }

    // ==========================================
    // DELETE: Remove a saved address
    // ==========================================
    if (method === 'DELETE') {
      if (!targetId || !isValidIdentifier(targetId)) {
        return respond(res, 400, {
          success: false,
          error: 'A valid address ID is required for deletion',
        });
      }

      // Strict server-side ownership verification:
      // Return 404 if the address does not exist OR does not belong to the authenticated user.
      const existing = await prisma.savedAddress.findFirst({
        where: { id: targetId, userId: user.id },
      });

      if (!existing) {
        return respond(res, 404, {
          success: false,
          error: 'Address not found',
        });
      }

      await prisma.savedAddress.delete({
        where: { id: targetId },
      });

      return respond(res, 200, {
        success: true,
        message: 'Address deleted successfully',
      });
    }
  } catch (error) {
    const elapsed = Date.now() - startTime;
    logServerError(error, {
      endpoint: '/api/addresses',
      method,
      requestId,
      elapsedMs: elapsed,
    });
    return respond(res, 500, {
      success: false,
      error: getSafeErrorMessage(error, 'An unexpected error occurred while processing address request'),
    });
  } finally {
    const elapsed = Date.now() - startTime;
    logSlowRequest(elapsed, 2000, {
      endpoint: '/api/addresses',
      method,
      requestId,
    });
  }
}
