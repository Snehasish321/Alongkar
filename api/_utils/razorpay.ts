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
