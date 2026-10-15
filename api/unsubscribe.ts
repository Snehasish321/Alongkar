import prisma from '../src/lib/prisma.js';
import { getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import {
  checkRateLimit,
  getOrCreateRequestId,
  logSecurityEvent,
  logServerError,
  withTimeout,
} from './_utils/security.js';
import { verifyUnsubscribeToken, hashEmail } from './_utils/unsubscribeToken.js';

export const USER_FACING_UNSUBSCRIBE_SUCCESS =
  'You have been successfully unsubscribed from the Alongkar Circle newsletter.';

export const MAX_UNSUBSCRIBE_BODY_BYTES = 16 * 1024; // 16 KB

export default async function handler(req: any, res: any) {
  const requestId = getOrCreateRequestId(req);
  const method = req.method?.toUpperCase();
  const db = (req as any)?.prismaClient || (req as any)?.dbClient || prisma;

  // Allow only POST and OPTIONS (strictly reject GET to prevent security scanners from auto-unsubscribing)
  if (!['POST', 'OPTIONS'].includes(method)) {
    return respond(
      res,
      405,
      {
        success: false,
        error: 'Method Not Allowed. Unsubscribing requires a confirmed POST request.',
      },
      { Allow: 'POST, OPTIONS' }
    );
  }

  if (method === 'OPTIONS') {
    return respond(res, 204, null, {
      Allow: 'POST, OPTIONS',
    });
  }

  try {
    // 1. Enforce payload size limit
    const clHeader =
      req.headers?.['content-length'] ||
      req.headers?.['Content-Length'] ||
      (typeof req.headers?.get === 'function' ? req.headers.get('content-length') : undefined);

    if (clHeader && parseInt(String(clHeader), 10) > MAX_UNSUBSCRIBE_BODY_BYTES) {
      logSecurityEvent({
        event: 'payload_too_large',
        endpoint: '/api/unsubscribe',
        method,
        requestId,
        statusCode: 413,
      });
      return respond(
        res,
        413,
        {
          success: false,
          error: 'Payload too large: maximum allowed body size is 16KB',
        },
        { Connection: 'close' }
      );
    }

    // 2. Client identification & Rate Limiting (10 attempts per 10 minutes per IP)
    const clientIp =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'anonymous';

    const rateLimit = await checkRateLimit(`unsubscribe:${clientIp}`, {
      keyPrefix: 'newsletter_unsubscribe',
      limit: 10,
      windowSeconds: 600,
    });

    if (!rateLimit.allowed) {
      logSecurityEvent({
        event: 'rate_limit_exceeded',
        endpoint: '/api/unsubscribe',
        method,
        requestId,
        clientIp,
        statusCode: 429,
      });
      return respond(
        res,
        429,
        {
          success: false,
          error: 'Too many unsubscribe attempts. Please try again later.',
        },
        {
          'Retry-After': String(rateLimit.resetSeconds),
        }
      );
    }

    // 3. Extract token from request (supports JSON body or RFC 8058 One-Click POST query parameter)
    let token: string | undefined;

    const url = new URL(req.url || '/api/unsubscribe', 'http://localhost');
    const queryToken = url.searchParams.get('token');

    const body = await getRequestBody(req, MAX_UNSUBSCRIBE_BODY_BYTES);

    if (isPayloadTooLarge(body)) {
      logSecurityEvent({
        event: 'payload_too_large',
        endpoint: '/api/unsubscribe',
        method,
        requestId,
        statusCode: 413,
      });
      return respond(res, 413, {
        success: false,
        error: 'Payload too large: maximum allowed body size is 16KB',
      });
    }

    if (isMalformedJson(body)) {
      // If body was malformed JSON but query parameter token exists (e.g. RFC 8058 One-Click text/plain body)
      if (queryToken && typeof queryToken === 'string') {
        token = queryToken.trim();
      } else {
        logSecurityEvent({
          event: 'malformed_json',
          endpoint: '/api/unsubscribe',
          method,
          requestId,
          statusCode: 400,
        });
        return respond(res, 400, {
          success: false,
          error: 'Malformed JSON payload',
        });
      }
    } else if (body && typeof body === 'object') {
      token = typeof body.token === 'string' ? body.token.trim() : queryToken || undefined;
    } else if (queryToken) {
      token = queryToken.trim();
    }

    if (!token || typeof token !== 'string') {
      return respond(res, 400, {
        success: false,
        error: 'A valid unsubscribe token is required.',
      });
    }

    // 4. Cryptographic Token Verification
    const verification = verifyUnsubscribeToken(token);

    if (!verification.valid || !verification.subscriberId || !verification.emailHash) {
      logSecurityEvent({
        event: 'invalid_unsubscribe_token',
        endpoint: '/api/unsubscribe',
        method,
        requestId,
        clientIp,
        statusCode: 400,
      });
      return respond(res, 400, {
        success: false,
        error: 'Invalid, expired, or malformed unsubscribe token.',
      });
    }

    // 5. Query subscriber record by decrypted ID
    const subscriber: any = await withTimeout(
      db.newsletterSubscriber.findUnique({
        where: { id: verification.subscriberId },
      }),
      8000,
      'findUnique newsletter subscriber by id'
    );

    if (!subscriber) {
      logSecurityEvent({
        event: 'unsubscribe_subscriber_not_found',
        endpoint: '/api/unsubscribe',
        method,
        requestId,
        statusCode: 404,
      });
      return respond(res, 404, {
        success: false,
        error: 'Subscriber record was not found or has already been removed.',
      });
    }

    // 6. Identity Binding Check: Verify that the subscriber's current email matches the token hash
    const expectedHash = hashEmail(subscriber.email);
    if (expectedHash !== verification.emailHash) {
      logSecurityEvent({
        event: 'unsubscribe_identity_mismatch',
        endpoint: '/api/unsubscribe',
        method,
        requestId,
        statusCode: 400,
      });
      return respond(res, 400, {
        success: false,
        error: 'Unsubscribe token is not authorized for this subscriber.',
      });
    }

    // 7. Idempotent Handling: If already UNSUBSCRIBED, return success without unnecessary DB mutation
    if (subscriber.status === 'UNSUBSCRIBED') {
      return respond(res, 200, {
        success: true,
        message: USER_FACING_UNSUBSCRIBE_SUCCESS,
      });
    }

    // 8. Atomic State Transition to UNSUBSCRIBED
    const updateData: any = {
      status: 'UNSUBSCRIBED',
    };

    await withTimeout(
      db.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: updateData,
      }),
      5000,
      'update subscriber status to UNSUBSCRIBED'
    );

    return respond(res, 200, {
      success: true,
      message: USER_FACING_UNSUBSCRIBE_SUCCESS,
    });
  } catch (error: any) {
    logServerError(error, {
      endpoint: '/api/unsubscribe',
      method,
      requestId,
    });

    return respond(res, 500, {
      success: false,
      error: 'Unable to process unsubscribe request. Please try again later.',
    });
  }
}
