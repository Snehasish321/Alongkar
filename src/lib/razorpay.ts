import type {
  RazorpayCheckoutOptions,
  RazorpayInstance,
  RazorpayPaymentFailureResponse,
} from '../types';

export const RAZORPAY_CHECKOUT_SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

let scriptLoadPromise: Promise<boolean> | null = null;

/**
 * Dynamically loads the official Razorpay Checkout.js script on demand.
 * Avoids blocking initial storefront rendering and prevents duplicate script tags.
 */
export function loadRazorpayScript(): Promise<boolean> {
  if (typeof window === 'undefined') {
    return Promise.resolve(false);
  }

  // If Razorpay SDK is already loaded on window, resolve immediately
  if (typeof window.Razorpay === 'function') {
    return Promise.resolve(true);
  }

  // Reuse existing in-flight script load promise to prevent duplicate injection
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise<boolean>((resolve) => {
    // Check if script tag already exists in the document
    const existingScript = document.querySelector<HTMLScriptElement>(
      `script[src="${RAZORPAY_CHECKOUT_SCRIPT_URL}"]`
    );

    if (existingScript) {
      if (typeof window.Razorpay === 'function') {
        resolve(true);
        return;
      }
      existingScript.addEventListener('load', () => resolve(true), { once: true });
      existingScript.addEventListener(
        'error',
        () => {
          scriptLoadPromise = null;
          resolve(false);
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = RAZORPAY_CHECKOUT_SCRIPT_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';

    script.onload = () => {
      resolve(true);
    };

    script.onerror = () => {
      scriptLoadPromise = null;
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
      resolve(false);
    };

    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Initializes and displays the Razorpay Standard Checkout modal.
 */
export async function openRazorpayCheckout(
  options: RazorpayCheckoutOptions,
  onFailure?: (response: RazorpayPaymentFailureResponse) => void
): Promise<RazorpayInstance> {
  const isLoaded = await loadRazorpayScript();
  if (!isLoaded || typeof window.Razorpay !== 'function') {
    throw new Error('Failed to load Razorpay Checkout SDK. Please check your network connection.');
  }

  const rzp = new window.Razorpay(options);

  if (onFailure) {
    rzp.on('payment.failed', (response: RazorpayPaymentFailureResponse) => {
      onFailure(response);
    });
  }

  rzp.open();
  return rzp;
}
