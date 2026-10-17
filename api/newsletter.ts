import prisma from '../src/lib/prisma.js';
import { getRequestBody, respond, isPayloadTooLarge, isMalformedJson } from './_utils/auth.js';
import {
  checkRateLimit,
  getOrCreateRequestId,
  logSecurityEvent,
  logServerError,
  withTimeout,
} from './_utils/security.js';
import { isBrevoEmailSendingEnabled, sendWelcomeEmail } from './_utils/brevo.js';
import { Prisma } from '@prisma/client';

export const USER_FACING_SUCCESS_MESSAGE =
  "Thanks for joining the Alongkar Circle. If your email is eligible, we'll send your welcome email shortly.";

/**
 * Dedicated request body size limit for newsletter signup (16 KB).
 */
export const MAX_NEWSLETTER_BODY_BYTES = 16 * 1024;

/**
 * Reconciles subscribers stuck in SENDING state without resending emails.
 * Marks records where welcomeEmailStatus === 'SENDING' older than threshold (default 15 minutes) as 'FAILED'.
 * 
 * Safety note: We intentionally DO NOT automatically re-dispatch welcome emails to prevent duplicates,
 * because Brevo may have accepted the email before serverless execution terminated.
 */
export async function reconcileStaleSendingSubscribers(
  customDb?: any,
  olderThanMinutes = 15
): Promise<{ reconciledCount: number; thresholdDate: Date }> {
  const db = customDb || prisma;
  const thresholdDate = new Date(Date.now() - olderThanMinutes * 60 * 1000);

  const result = await db.newsletterSubscriber.updateMany({
    where: {
      welcomeEmailStatus: 'SENDING',
      updatedAt: {
        lt: thresholdDate,
      },
    },
    data: {
      welcomeEmailStatus: 'FAILED',
    },
  });

  return {
    reconciledCount: result.count ?? 0,
    thresholdDate,
  };
}

/**
 * Standard RFC 5322 compliant email regex pattern.
 */
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

/**
 * Normalizes email address for consistent uniqueness checks and database persistence.
 */
export function normalizeEmail(rawEmail: string): string {
  return rawEmail.trim().toLowerCase();
}

/**
 * Validates email format according to length limits and standard syntax rules.
 */
export function isValidEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length < 5 || trimmed.length > 254) return false;
  return EMAIL_REGEX.test(trimmed);
}

/**
 * Masks an email for privacy-safe operational logging.
 * Example: 'contact@alongkar.in' -> 'c***t@alongkar.in'
 */
export function maskEmail(email: string): string {
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const name = parts[0];
  const domain = parts[1];
  if (name.length <= 2) {
    return `${name[0]}***@${domain}`;
  }
  return `${name[0]}***${name[name.length - 1]}@${domain}`;
}

export default async function handler(req: any, res: any) {
  const startTime = Date.now();
  const requestId = getOrCreateRequestId(req);
  const method = req.method?.toUpperCase();
  const db = (req as any)?.prismaClient || (req as any)?.dbClient || prisma;

  // Allow only POST and OPTIONS (CORS preflight)
  if (!['POST', 'OPTIONS'].includes(method)) {
    return respond(
      res,
      405,
      { success: false, error: 'Method Not Allowed' },
      { Allow: 'POST, OPTIONS' }
    );
  }

  if (method === 'OPTIONS') {
    return respond(res, 204, null, {
      Allow: 'POST, OPTIONS',
    });
  }

  try {
    // 1. Enforce payload size limit (Pre-check Content-Length before parsing)
    const clHeader =
      req.headers?.['content-length'] ||
      req.headers?.['Content-Length'] ||
      (typeof req.headers?.get === 'function' ? req.headers.get('content-length') : undefined);

    if (clHeader && parseInt(String(clHeader), 10) > MAX_NEWSLETTER_BODY_BYTES) {
      logSecurityEvent({
        event: 'payload_too_large',
        endpoint: '/api/newsletter',
        method,
        requestId,
        statusCode: 413,
      });
      if (typeof res?.once === 'function') {
        res.once('finish', () => {
          if (typeof req.destroy === 'function' && !req.destroyed) {
            req.destroy();
          }
        });
      }
      return respond(
        res,
        413,
        {
          success: false,
          error: 'Payload too large: maximum allowed JSON body size is 16KB',
        },
        { Connection: 'close' }
      );
    }

    const body = await getRequestBody(req, MAX_NEWSLETTER_BODY_BYTES);

    if (isPayloadTooLarge(body)) {
      logSecurityEvent({
        event: 'payload_too_large',
        endpoint: '/api/newsletter',
        method,
        requestId,
        statusCode: 413,
      });
      if (typeof res?.once === 'function') {
        res.once('finish', () => {
          if (typeof req.destroy === 'function' && !req.destroyed) {
            req.destroy();
          }
        });
      }
      return respond(
        res,
        413,
        {
          success: false,
          error: 'Payload too large: maximum allowed JSON body size is 16KB',
        },
        { Connection: 'close' }
      );
    }

    if (isMalformedJson(body)) {
      logSecurityEvent({
        event: 'malformed_json',
        endpoint: '/api/newsletter',
        method,
        requestId,
        statusCode: 400,
      });
      return respond(res, 400, {
        success: false,
        error: 'Malformed JSON payload',
      });
    }

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return respond(res, 400, {
        success: false,
        error: 'Request body must be a valid JSON object',
      });
    }

    // 2. Client identification & Rate Limiting
    const clientIp =
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'anonymous';

    const rateLimit = await checkRateLimit(`newsletter:${clientIp}`, {
      keyPrefix: 'newsletter_signup',
      limit: 5, // 5 signup submissions per 10 minutes per IP
      windowSeconds: 600,
    });

    if (!rateLimit.allowed) {
      logSecurityEvent({
        event: 'rate_limit_exceeded',
        endpoint: '/api/newsletter',
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
          error: 'Too many subscription attempts. Please try again later.',
        },
        {
          'Retry-After': String(rateLimit.resetSeconds),
        }
      );
    }

    // 3. Validate & sanitize inputs (reject unexpected fields)
    const { email: rawEmail, consent } = body;

    // Validate consent: must be explicit boolean true
    if (consent !== true) {
      return respond(res, 400, {
        success: false,
        error: 'Explicit consent is required to join the Alongkar Circle newsletter.',
      });
    }

    // Validate email format
    if (!rawEmail || typeof rawEmail !== 'string' || !isValidEmailFormat(rawEmail)) {
      return respond(res, 400, {
        success: false,
        error: 'Please enter a valid email address.',
      });
    }

    const normalizedEmail = normalizeEmail(rawEmail);
    const masked = maskEmail(normalizedEmail);

    // 4. Persistence & Duplicate Handling
    // Step A: Check for existing subscriber
    let existingSubscriber: any = await withTimeout(
      db.newsletterSubscriber.findUnique({
        where: { email: normalizedEmail },
      }),
      8000,
      'findUnique newsletter subscriber'
    );

    // Step B: Legacy unsubscribed cleanup
    // If a legacy record exists with status === 'UNSUBSCRIBED', remove only that specific
    // NewsletterSubscriber row so explicit patron consent creates a fresh subscription.
    if (existingSubscriber && existingSubscriber.status === 'UNSUBSCRIBED') {
      if (typeof db.newsletterSubscriber?.delete === 'function') {
        try {
          await withTimeout(
            db.newsletterSubscriber.delete({
              where: { id: existingSubscriber.id },
            }),
            5000,
            'delete legacy newsletter subscriber'
          );
        } catch (delError: any) {
          // Concurrency: if already deleted by a racing request, P2025 is safe to ignore
          if (
            delError?.code === 'P2025' ||
            (delError instanceof Prisma.PrismaClientKnownRequestError && delError.code === 'P2025')
          ) {
            // Already deleted by concurrent race
          } else {
            throw delError;
          }
        }
        existingSubscriber = null;
      }
    }

    let isNewSubscriber = false;
    let subscriberRecord: any = existingSubscriber;

    if (!existingSubscriber) {
      try {
        subscriberRecord = await withTimeout(
          db.newsletterSubscriber.create({
            data: {
              email: normalizedEmail,
              status: 'SUBSCRIBED',
              consentAt: new Date(),
              subscribedAt: new Date(),
              source: 'homepage',
              welcomeEmailStatus: 'PENDING',
            },
          }),
          8000,
          'create newsletter subscriber'
        );
        isNewSubscriber = true;
      } catch (insertError: any) {
        // Handle concurrent race condition (Prisma P2002 unique constraint violation)
        if (
          insertError?.code === 'P2002' ||
          (insertError instanceof Prisma.PrismaClientKnownRequestError &&
            insertError.code === 'P2002')
        ) {
          existingSubscriber = await withTimeout(
            db.newsletterSubscriber.findUnique({
              where: { email: normalizedEmail },
            }),
            8000,
            'findUnique newsletter subscriber after race'
          );
          subscriberRecord = existingSubscriber;
          isNewSubscriber = false;
        } else {
          throw insertError;
        }
      }
    }

    // 5. Duplicate and Resubscription Policy
    if (!isNewSubscriber && subscriberRecord) {
      if (subscriberRecord.status === 'SUBSCRIBED') {
        // Already subscribed: do not send another welcome email.
        // Return sanitized idempotent success without leaking duplicate status.
        return respond(res, 200, {
          success: true,
          message: USER_FACING_SUCCESS_MESSAGE,
        });
      }

      if (subscriberRecord.status === 'UNSUBSCRIBED') {
        // Previously unsubscribed: preserve unsubscribed status.
        // Do not silently resubscribe or send an email.
        // Return identical sanitized message to protect privacy.
        return respond(res, 200, {
          success: true,
          message: USER_FACING_SUCCESS_MESSAGE,
        });
      }
    }

    // 6. Transactional Welcome Email Dispatch (Gated)
    if (isNewSubscriber && subscriberRecord) {
      if (isBrevoEmailSendingEnabled()) {
        try {
          // Transition state to SENDING
          await withTimeout(
            db.newsletterSubscriber.update({
              where: { id: subscriberRecord.id },
              data: { welcomeEmailStatus: 'SENDING' },
            }),
            5000,
            'update welcomeEmailStatus to SENDING'
          );

          const sendResult = await sendWelcomeEmail(
            normalizedEmail,
            undefined,
            subscriberRecord.id
          );

          if (sendResult.providerAccepted) {
            await withTimeout(
              db.newsletterSubscriber.update({
                where: { id: subscriberRecord.id },
                data: {
                  welcomeEmailStatus: 'SENT',
                  welcomeEmailSentAt: new Date(),
                  welcomeEmailProviderId: sendResult.providerMessageId,
                },
              }),
              5000,
              'update welcomeEmailStatus to SENT'
            );
          } else {
            await withTimeout(
              db.newsletterSubscriber.update({
                where: { id: subscriberRecord.id },
                data: { welcomeEmailStatus: 'FAILED' },
              }),
              5000,
              'update welcomeEmailStatus to FAILED'
            );
          }
        } catch (emailErr) {
          logServerError(emailErr, {
            action: 'dispatch_welcome_email',
            subscriberId: subscriberRecord.id,
          });
          // Best effort update to FAILED without failing the client response
          await db.newsletterSubscriber
            .update({
              where: { id: subscriberRecord.id },
              data: { welcomeEmailStatus: 'FAILED' },
            })
            .catch(() => {});
        }
      }
    }

    return respond(res, 200, {
      success: true,
      message: USER_FACING_SUCCESS_MESSAGE,
    });
  } catch (error: any) {
    logServerError(error, {
      endpoint: '/api/newsletter',
      method,
      requestId,
    });

    return respond(res, 500, {
      success: false,
      error: 'Unable to process subscription. Please try again later.',
    });
  }
}
