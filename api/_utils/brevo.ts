import { logServerError } from './security.js';

import { generateUnsubscribeUrls } from './unsubscribeToken.js';

export interface BrevoEmailRecipient {
  email: string;
  name?: string;
}

export interface BrevoSendResult {
  success: boolean;
  providerAccepted: boolean;
  providerMessageId?: string;
  error?: string;
  skippedReason?: string;
}

/**
 * Returns whether Brevo transactional email sending is fully configured and enabled.
 * Real email sending remains strictly disabled unless BREVO_ENABLE_WELCOME_EMAIL === 'true',
 * an API key is present, and a verified sender email is configured.
 */
export function isBrevoEmailSendingEnabled(): boolean {
  const isEnabledFlag = process.env.BREVO_ENABLE_WELCOME_EMAIL === 'true';
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim();

  if (!isEnabledFlag) {
    return false;
  }

  if (!apiKey || apiKey.includes('your_brevo_api_key')) {
    return false;
  }

  if (!senderEmail || senderEmail.includes('your_brevo_sender_email')) {
    return false;
  }

  return true;
}

/**
 * Dispatches a transactional welcome email to a new subscriber via Brevo API v3.
 * 
 * Safety features:
 * 1. Strictly server-side execution.
 * 2. Disabled by default via `isBrevoEmailSendingEnabled()`.
 * 3. Records provider acceptance (`messageId`), distinguishing it from delivery.
 * 4. Never throws unhandled errors that could break the subscription response.
 * 5. Injects secure, tokenized unsubscribe link and List-Unsubscribe headers.
 */
export async function sendWelcomeEmail(
  subscriberEmail: string,
  subscriberName?: string,
  subscriberId?: string,
  customUnsubscribeUrl?: string
): Promise<BrevoSendResult> {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  const senderEmail = process.env.BREVO_SENDER_EMAIL?.trim() || 'concierge@alongkar.in';
  const senderName = process.env.BREVO_SENDER_NAME?.trim() || 'Alongkar VIP Circle';

  if (!isBrevoEmailSendingEnabled()) {
    return {
      success: true,
      providerAccepted: false,
      skippedReason: 'Brevo sending disabled or unconfigured in environment',
    };
  }

  let pageUnsubscribeUrl: string;
  let apiUnsubscribeUrl: string;

  if (customUnsubscribeUrl) {
    const trimmedCustom = customUnsubscribeUrl.trim();
    pageUnsubscribeUrl = trimmedCustom;
    apiUnsubscribeUrl = trimmedCustom.includes('/api/unsubscribe')
      ? trimmedCustom
      : trimmedCustom.replace('/unsubscribe?', '/api/unsubscribe?');
  } else if (subscriberId) {
    const urls = generateUnsubscribeUrls({ id: subscriberId.trim(), email: subscriberEmail.trim() });
    pageUnsubscribeUrl = urls.pageUrl;
    apiUnsubscribeUrl = urls.apiUrl;
  } else {
    pageUnsubscribeUrl = 'https://alongkar.in/unsubscribe';
    apiUnsubscribeUrl = 'https://alongkar.in/api/unsubscribe';
  }

  const endpoint = 'https://api.brevo.com/v3/smtp/email';

  const payload = {
    sender: {
      name: senderName,
      email: senderEmail,
    },
    to: [
      {
        email: subscriberEmail,
        ...(subscriberName ? { name: subscriberName } : {}),
      },
    ],
    headers: {
      'List-Unsubscribe': `<${apiUnsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    subject: 'Welcome to the Alongkar VIP Circle — Haute Joaillerie',
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #FAF6F0; color: #1A0B2E; padding: 24px; margin: 0; }
            .container { max-width: 600px; margin: 0 auto; background: #FFFFFF; border-radius: 8px; border: 1px solid rgba(232, 201, 138, 0.3); padding: 32px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); }
            .header { text-align: center; border-bottom: 1px solid rgba(232, 201, 138, 0.2); padding-bottom: 20px; }
            .title { font-size: 20px; font-weight: 700; color: #1A0B2E; letter-spacing: 0.1em; text-transform: uppercase; margin: 12px 0 4px; }
            .content { font-size: 14px; line-height: 1.6; color: #3D2618; margin-top: 24px; }
            .footer { font-size: 11px; color: #7A5E9E; border-top: 1px solid rgba(232, 201, 138, 0.2); margin-top: 32px; padding-top: 16px; text-align: center; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 class="title">Alongkar VIP Circle</h1>
              <p style="font-size: 12px; color: #7A5E9E; margin: 0;">Haute Joaillerie & Royal Goldsmithing</p>
            </div>
            <div class="content">
              <p>Dear Connoisseur,</p>
              <p>Welcome to the VIP Alongkar Circle. You are now part of our private clientele, granting you early access to preview our limited-edition 24K micron city-gold masterworks, bespoke atelier drops, and Bengal heritage archive releases.</p>
              <p>Explore our creations anytime at <a href="https://alongkar.in" style="color: #9C7A28; text-decoration: none; font-weight: bold;">alongkar.in</a>.</p>
              <p>Warmest regards,<br>The Alongkar Atelier Concierge</p>
            </div>
            <div class="footer">
              <p>You received this email because you subscribed at alongkar.in with explicit consent.</p>
              <p style="margin: 8px 0;">
                If you no longer wish to receive Alongkar Circle emails, you may <a href="${pageUnsubscribeUrl}" style="color: #9C7A28; text-decoration: underline;">unsubscribe here</a>.
              </p>
              <p>Alongkar · Saradapally, Rampurhat, Birbhum, West Bengal 731224, India</p>
            </div>
          </div>
        </body>
      </html>
    `,
    textContent: `Welcome to the VIP Alongkar Circle.\n\nYou are now part of our private clientele, granting you early access to preview our limited-edition 24K micron city-gold masterworks and atelier drops.\n\nExplore our creations at https://alongkar.in\n\nTo unsubscribe from Alongkar Circle emails, visit: ${pageUnsubscribeUrl}\n\nWarmest regards,\nThe Alongkar Atelier Concierge`,
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8 second timeout

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'api-key': apiKey!,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 201 || response.ok) {
      const data: any = await response.json();
      return {
        success: true,
        providerAccepted: true,
        providerMessageId: data?.messageId || data?.id || undefined,
      };
    }

    const errData: any = await response.json().catch(() => ({}));
    const errMsg = errData?.message || `Brevo API returned status ${response.status}`;

    logServerError(new Error(errMsg), {
      action: 'send_welcome_email',
      statusCode: response.status,
    });

    return {
      success: false,
      providerAccepted: false,
      error: errMsg,
    };
  } catch (error: any) {
    logServerError(error, {
      action: 'send_welcome_email_network_error',
    });

    return {
      success: false,
      providerAccepted: false,
      error: error?.message || 'Network error dispatching to Brevo',
    };
  }
}
