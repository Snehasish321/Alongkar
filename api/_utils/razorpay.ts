import crypto from 'crypto';
import Razorpay from 'razorpay';
import { Prisma } from '@prisma/client';

/**
 * Validates and retrieves server-side Razorpay configuration.
 * Never exposes the key_secret to client-facing objects.
 */
export function getRazorpayConfig(): { keyId: string; keySecret: string } {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();

  if (!keyId || !keySecret) {
    throw new Error('Razorpay credentials are not configured on the server (missing RAZORPAY_KEY_ID or RAZORPAY_KEY_SECRET).');
  }

  return { keyId, keySecret };
}

/**
 * Returns the public Razorpay Key ID safe to share with the frontend client for checkout.
 */
export function getRazorpayPublicClientKey(): string {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  if (!keyId) {
    throw new Error('RAZORPAY_KEY_ID is not configured on the server.');
  }
  return keyId;
}

/**
 * Initializes and returns a server-side Razorpay SDK client instance.
 * Safe for serverless environments.
 */
export function getRazorpayClient(): Razorpay {
  const { keyId, keySecret } = getRazorpayConfig();

  return new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });
}

/**
 * Converts INR monetary amounts (Rupees) safely to paise (smallest currency unit),
 * avoiding floating-point rounding errors.
 * Accepts Prisma.Decimal, number, or string.
 *
 * Example: 1499.99 INR -> 149999 paise
 * Example: 500.00 INR -> 50000 paise
 */
export function rupeesToPaise(amountInRupees: number | string | Prisma.Decimal): number {
  if (amountInRupees === null || amountInRupees === undefined) {
    throw new Error('Cannot convert null or undefined amount to paise.');
  }

  let numValue: number;
  if (typeof amountInRupees === 'object' && 'toNumber' in amountInRupees && typeof amountInRupees.toNumber === 'function') {
    numValue = amountInRupees.toNumber();
  } else if (typeof amountInRupees === 'string') {
    numValue = parseFloat(amountInRupees);
  } else if (typeof amountInRupees === 'number') {
    numValue = amountInRupees;
  } else {
    numValue = Number(amountInRupees);
  }

  if (isNaN(numValue) || !Number.isFinite(numValue)) {
    throw new Error(`Invalid monetary amount: "${amountInRupees}". Must be a valid finite number.`);
  }

  if (numValue <= 0) {
    throw new Error(`Payable amount must be greater than 0. Received: ${numValue}`);
  }

  // Math.round to handle minor float artifacts like 1499.99 * 100 = 149998.99999999997
  return Math.round(numValue * 100);
}

/**
 * Converts paise back to Rupees for display/logging.
 */
export function paiseToRupees(paise: number): number {
  if (typeof paise !== 'number' || isNaN(paise) || !Number.isFinite(paise)) {
    throw new Error(`Invalid paise amount: "${paise}".`);
  }
  return paise / 100;
}

/**
 * Validates and retrieves server-side Razorpay webhook configuration secret.
 * Webhook secret is distinct from RAZORPAY_KEY_SECRET.
 */
export function getRazorpayWebhookSecret(): string {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    throw new Error('RAZORPAY_WEBHOOK_SECRET is not configured on the server.');
  }
  return webhookSecret;
}

/**
 * Validates the cryptographic Razorpay Checkout.js payment signature server-side.
 * Official Algorithm: HMAC-SHA256(razorpay_order_id + "|" + razorpay_payment_id, RAZORPAY_KEY_SECRET).
 * Uses constant-time equality check to protect against timing attacks.
 */
export function validateRazorpayCheckoutSignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string
): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return false;
  }

  const { keySecret } = getRazorpayConfig();
  const payload = `${razorpayOrderId.trim()}|${razorpayPaymentId.trim()}`;

  const expectedSignature = crypto
    .createHmac('sha256', keySecret)
    .update(payload)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(razorpaySignature.trim(), 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

/**
 * Validates the cryptographic Razorpay Webhook signature server-side.
 * Official Algorithm: HMAC-SHA256(raw_request_body, RAZORPAY_WEBHOOK_SECRET).
 * Uses constant-time equality check to protect against timing attacks.
 */
export function validateRazorpayWebhookSignature(
  rawBody: string | Buffer,
  signature: string
): boolean {
  if (!rawBody || !signature) {
    return false;
  }

  const webhookSecret = getRazorpayWebhookSecret();
  const bodyBuffer = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody, 'utf8');

  const expectedSignature = crypto
    .createHmac('sha256', webhookSecret)
    .update(bodyBuffer)
    .digest('hex');

  const expectedBuf = Buffer.from(expectedSignature, 'utf8');
  const actualBuf = Buffer.from(signature.trim(), 'utf8');

  if (expectedBuf.length !== actualBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}
