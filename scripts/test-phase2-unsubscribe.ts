/**
 * Comprehensive Test Suite: Newsletter Unsubscribe & Token Security (Phase 2)
 *
 * Tests:
 * - PART 1: Cryptographic Token Unit Tests (AES-256-GCM authenticated tokens)
 * - PART 2: Unsubscribe API Handler Integration Tests (api/unsubscribe.ts)
 * - PART 3: End-to-End Newsletter Integration & Brevo Email Templates
 */

import { EventEmitter } from 'events';
import crypto from 'crypto';
import unsubscribeHandler, {
  USER_FACING_UNSUBSCRIBE_SUCCESS,
  MAX_UNSUBSCRIBE_BODY_BYTES,
} from '../api/unsubscribe.js';
import newsletterHandler, {
  USER_FACING_SUCCESS_MESSAGE,
} from '../api/newsletter.js';
import {
  generateUnsubscribeToken,
  verifyUnsubscribeToken,
  generateUnsubscribeUrl,
  generateUnsubscribeUrls,
  getDerivedKey,
  hashEmail,
} from '../api/_utils/unsubscribeToken.js';
import {
  sendWelcomeEmail,
} from '../api/_utils/brevo.js';

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    totalPassed++;
  } else {
    console.error(`❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
    totalFailed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Helpers
// ─────────────────────────────────────────────────────────────────────────────

interface SubscriberRecord {
  id: string;
  email: string;
  status: 'SUBSCRIBED' | 'UNSUBSCRIBED';
  consentAt: Date;
  subscribedAt: Date;
  source: string;
  welcomeEmailStatus: 'PENDING' | 'SENDING' | 'SENT' | 'FAILED';
  welcomeEmailSentAt?: Date | null;
  welcomeEmailProviderId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

function createMockDb() {
  const store = new Map<string, SubscriberRecord>();

  return {
    store,
    newsletterSubscriber: {
      findUnique: async ({ where }: any) => {
        if (where?.id) {
          for (const rec of store.values()) {
            if (rec.id === where.id) return { ...rec };
          }
          return null;
        }
        if (where?.email) {
          const rec = store.get(where.email.toLowerCase());
          return rec ? { ...rec } : null;
        }
        return null;
      },
      create: async ({ data }: any) => {
        const email = data.email.toLowerCase();
        if (store.has(email)) {
          const p2002Err: any = new Error('Unique constraint failed on the fields: (`email`)');
          p2002Err.code = 'P2002';
          throw p2002Err;
        }
        const record: SubscriberRecord = {
          id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          email,
          status: data.status || 'SUBSCRIBED',
          consentAt: data.consentAt || new Date(),
          subscribedAt: data.subscribedAt || new Date(),
          source: data.source || 'homepage',
          welcomeEmailStatus: data.welcomeEmailStatus || 'PENDING',
          welcomeEmailSentAt: data.welcomeEmailSentAt || null,
          welcomeEmailProviderId: data.welcomeEmailProviderId || null,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        store.set(email, record);
        return { ...record };
      },
      update: async ({ where, data }: any) => {
        let existing: SubscriberRecord | undefined;
        if (where?.id) {
          for (const rec of store.values()) {
            if (rec.id === where.id) {
              existing = rec;
              break;
            }
          }
        } else if (where?.email) {
          existing = store.get(where.email.toLowerCase());
        }
        if (!existing) {
          const err: any = new Error('Record not found');
          err.code = 'P2025';
          throw err;
        }
        Object.assign(existing, data, { updatedAt: new Date() });
        return { ...existing };
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        for (const rec of store.values()) {
          let match = true;
          if (where?.welcomeEmailStatus && rec.welcomeEmailStatus !== where.welcomeEmailStatus) {
            match = false;
          }
          if (where?.updatedAt?.lt && rec.updatedAt >= where.updatedAt.lt) {
            match = false;
          }
          if (match) {
            Object.assign(rec, data, { updatedAt: new Date() });
            count++;
          }
        }
        return { count };
      },
    },
  };
}

function createMockRes() {
  const emitter = new EventEmitter();
  const res: any = Object.assign(emitter, {
    statusCode: 200,
    headers: {} as Record<string, string>,
    data: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(key: string, value: string) {
      this.headers[key.toLowerCase()] = value;
      return this;
    },
    set(headers: Record<string, string>) {
      for (const [k, v] of Object.entries(headers)) {
        this.headers[k.toLowerCase()] = v;
      }
      return this;
    },
    json(payload: any) {
      this.data = payload;
      this.emit('finish');
      return this;
    },
    end(str?: string) {
      if (str) {
        try {
          this.data = JSON.parse(str);
        } catch {
          this.data = str;
        }
      }
      this.emit('finish');
      return this;
    },
  });
  return res;
}

function createMockReq(options: {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  body?: any;
  rawBodyString?: string;
  db?: any;
}) {
  const req: any = new EventEmitter();
  req.method = options.method || 'POST';
  req.url = options.url || '/api/unsubscribe';
  req.headers = options.headers || {};
  req.socket = { remoteAddress: '127.0.0.1' };
  req.prismaClient = options.db;

  const bodyData =
    options.rawBodyString !== undefined
      ? options.rawBodyString
      : options.body !== undefined
      ? JSON.stringify(options.body)
      : '';

  if (!req.headers['content-length'] && bodyData) {
    req.headers['content-length'] = String(Buffer.byteLength(bodyData));
  }
  if (!req.headers['content-type'] && bodyData) {
    req.headers['content-type'] = 'application/json';
  }

  process.nextTick(() => {
    if (bodyData) {
      req.emit('data', Buffer.from(bodyData));
    }
    req.emit('end');
  });

  return req;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────

async function runTestSuite() {
  console.log('====================================================================');
  console.log('TEST SUITE: Phase 2 Newsletter Unsubscribe & Token Security');
  console.log('====================================================================\n');

  // ─── PART 1: Token Security Unit Tests ─────────────────────────────────────
  console.log('--- PART 1: Cryptographic Token Unit Tests ---');

  const testSubscriber = {
    id: 'sub_clerk_test_12345',
    email: 'connoisseur.patron@alongkar.in',
  };

  const token = generateUnsubscribeToken(testSubscriber);
  assert(typeof token === 'string' && token.length > 30, '[Token] Generates non-empty string token');
  assert(!token.includes(testSubscriber.email), '[Token] Does NOT expose subscriber email in plaintext');
  assert(!token.includes(testSubscriber.id), '[Token] Does NOT expose subscriber ID in plaintext');

  // Verification
  const verified = verifyUnsubscribeToken(token);
  assert(verified.valid === true, '[Token] Successfully verifies valid token');
  assert(verified.subscriberId === testSubscriber.id, '[Token] Decrypts correct subscriber ID');
  assert(verified.emailHash === hashEmail(testSubscriber.email), '[Token] Binds correct email hash');

  // Tamper resistance: flip characters in token
  const tamperedToken = token.slice(0, 10) + 'X' + token.slice(11);
  const tamperedResult = verifyUnsubscribeToken(tamperedToken);
  assert(tamperedResult.valid === false, '[Token] Tampered ciphertext or auth tag fails verification');

  // Truncated token
  const truncatedResult = verifyUnsubscribeToken(token.slice(0, 15));
  assert(truncatedResult.valid === false, '[Token] Truncated token fails verification');

  // Expired token (simulate past expiry)
  const expiredToken = generateUnsubscribeToken(testSubscriber, -10); // Expired 10 seconds ago
  const expiredResult = verifyUnsubscribeToken(expiredToken);
  assert(expiredResult.valid === false && expiredResult.error === 'Token has expired', '[Token] Expired token is rejected');

  // Token signed with different key
  const differentKey = crypto.randomBytes(32);
  const foreignToken = generateUnsubscribeToken(testSubscriber, 3600, differentKey);
  const foreignResult = verifyUnsubscribeToken(foreignToken);
  assert(foreignResult.valid === false, '[Token] Token generated with foreign key fails verification');

  // Cryptographic Key Management & Production Secret Enforcement
  {
    const origEnv = process.env.NODE_ENV;
    const origSecret = process.env.UNSUBSCRIBE_SECRET;

    // Test safe non-production fallback
    process.env.NODE_ENV = 'test';
    delete process.env.UNSUBSCRIBE_SECRET;
    const testKey = getDerivedKey();
    assert(Buffer.isBuffer(testKey) && testKey.length === 32, '[Key Management] Non-production derives 32-byte key safely');

    // Test production enforcement: missing secret throws sanitized error
    process.env.NODE_ENV = 'production';
    delete process.env.UNSUBSCRIBE_SECRET;
    let thrownError: any = null;
    try {
      getDerivedKey();
    } catch (e: any) {
      thrownError = e;
    }
    assert(
      thrownError !== null && thrownError.message.includes('UNSUBSCRIBE_SECRET environment variable is missing'),
      '[Key Management] Production strictly throws when UNSUBSCRIBE_SECRET is missing'
    );
    assert(
      !String(thrownError?.message).includes('seed') && !String(thrownError?.message).includes('alongkar_fallback'),
      '[Key Management] Production error never leaks fallback seed or credentials'
    );

    // Test production enforcement: short secret (<32 chars) rejected
    let shortSecretError: any = null;
    try {
      getDerivedKey('short_insecure_secret_123');
    } catch (e: any) {
      shortSecretError = e;
    }
    assert(
      shortSecretError !== null && shortSecretError.message.includes('must be at least 32 characters'),
      '[Key Management] Production rejects secrets with insufficient entropy (<32 chars)'
    );

    // Test production enforcement: valid configured secret succeeds
    const validProdSecret = 'alongkar_super_secure_production_secret_key_entropy_2026_test!';
    const prodKey = getDerivedKey(validProdSecret);
    assert(
      Buffer.isBuffer(prodKey) && prodKey.length === 32,
      '[Key Management] Production succeeds with valid 32+ char secret'
    );

    // Test token verification with matching vs non-matching production secret
    const tokenWithProdKey = generateUnsubscribeToken(testSubscriber, 3600, prodKey);
    const verifySuccess = verifyUnsubscribeToken(tokenWithProdKey, prodKey);
    assert(verifySuccess.valid === true, '[Key Management] Token verifies successfully with valid production key');

    const differentProdKey = getDerivedKey('alongkar_alternate_secure_secret_key_entropy_2026_test!');
    const verifyFail = verifyUnsubscribeToken(tokenWithProdKey, differentProdKey);
    assert(verifyFail.valid === false, '[Key Management] Token fails verification when evaluated against different key');

    // Restore environment
    process.env.NODE_ENV = origEnv;
    if (origSecret !== undefined) {
      process.env.UNSUBSCRIBE_SECRET = origSecret;
    } else {
      delete process.env.UNSUBSCRIBE_SECRET;
    }
  }

  // Dual Unsubscribe URL Generation (RFC 8058 Endpoint vs Human Page)
  const urlPair = generateUnsubscribeUrls(testSubscriber, 'https://alongkar.in');
  assert(urlPair.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='), '[Token URLs] pageUrl targets frontend /unsubscribe page');
  assert(urlPair.apiUrl.startsWith('https://alongkar.in/api/unsubscribe?token='), '[Token URLs] apiUrl targets backend /api/unsubscribe endpoint');

  const pageUrlObj = new URL(urlPair.pageUrl);
  const apiUrlObj = new URL(urlPair.apiUrl);
  const tokenFromPage = pageUrlObj.searchParams.get('token');
  const tokenFromApi = apiUrlObj.searchParams.get('token');

  assert(tokenFromPage === tokenFromApi, '[Token URLs] Both URLs contain the exact same cryptographic token');
  assert(tokenFromPage === urlPair.token, '[Token URLs] Shared token matches payload token property');

  const extractedVerified = verifyUnsubscribeToken(tokenFromPage || '');
  assert(
    extractedVerified.valid === true && extractedVerified.subscriberId === testSubscriber.id,
    '[Token URLs] Extracted token is cryptographically valid and authentic'
  );
  assert(!urlPair.pageUrl.includes(testSubscriber.email), '[Token URLs] pageUrl does NOT leak subscriber email');
  assert(!urlPair.apiUrl.includes(testSubscriber.email), '[Token URLs] apiUrl does NOT leak subscriber email');

  // Single URL helper compatibility check
  const singleUrl = generateUnsubscribeUrl(testSubscriber, 'https://alongkar.in');
  assert(singleUrl.startsWith('https://alongkar.in/unsubscribe?token='), '[Token URL] generateUnsubscribeUrl returns customer-facing pageUrl');
  const singleToken = new URL(singleUrl).searchParams.get('token');
  const singleVerified = verifyUnsubscribeToken(singleToken || '');
  assert(
    singleVerified.valid === true && singleVerified.subscriberId === testSubscriber.id,
    '[Token URL] generateUnsubscribeUrl token is cryptographically valid'
  );

  // ─── PART 2: Unsubscribe API Handler Tests ─────────────────────────────────
  console.log('\n--- PART 2: Unsubscribe API Handler Tests (api/unsubscribe.ts) ---');

  const mockDb = createMockDb();

  // Populate mock subscribers
  const activeSub: SubscriberRecord = {
    id: 'sub_active_001',
    email: 'patron.active@alongkar.in',
    status: 'SUBSCRIBED',
    consentAt: new Date(),
    subscribedAt: new Date(),
    source: 'homepage',
    welcomeEmailStatus: 'SENT',
    welcomeEmailSentAt: new Date(),
    welcomeEmailProviderId: 'msg_test_001',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockDb.store.set(activeSub.email, activeSub);

  const unsubbedUser: SubscriberRecord = {
    id: 'sub_unsubbed_002',
    email: 'patron.unsubbed@alongkar.in',
    status: 'UNSUBSCRIBED',
    consentAt: new Date(),
    subscribedAt: new Date(),
    source: 'homepage',
    welcomeEmailStatus: 'SENT',
    welcomeEmailSentAt: new Date(),
    welcomeEmailProviderId: 'msg_test_002',
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  mockDb.store.set(unsubbedUser.email, unsubbedUser);

  // 2.1 Rejects GET requests (Anti-Scanner Guard)
  {
    const req = createMockReq({ method: 'GET', db: mockDb });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 405, '[Handler] Rejects GET method with HTTP 405 (Anti-Scanner protection)');
    assert(res.data?.success === false, '[Handler] GET reports success === false');
    assert(activeSub.status === 'SUBSCRIBED', '[Handler] GET request NEVER modifies subscriber status');
  }

  // 2.2 Handles OPTIONS Preflight
  {
    const req = createMockReq({ method: 'OPTIONS', db: mockDb });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 204, '[Handler] Handles OPTIONS preflight with HTTP 204');
    assert(res.headers['allow'] === 'POST, OPTIONS', '[Handler] OPTIONS sets Allow: POST, OPTIONS');
  }

  // 2.3 Rejects oversized payloads (>16KB)
  {
    const req = createMockReq({
      method: 'POST',
      headers: { 'content-length': String(MAX_UNSUBSCRIBE_BODY_BYTES + 100) },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 413, '[Handler] Rejects oversized body (>16KB) with HTTP 413');
  }

  // 2.4 Rejects missing or malformed token
  {
    const req = createMockReq({
      method: 'POST',
      body: { token: '' },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects empty token with HTTP 400');
  }
  {
    const req = createMockReq({
      method: 'POST',
      body: { token: 'invalid.forged.token' },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects forged token with HTTP 400');
  }

  // 2.5 Rejects token for non-existent subscriber
  {
    const ghostToken = generateUnsubscribeToken({
      id: 'sub_non_existent_999',
      email: 'ghost@alongkar.in',
    });
    const req = createMockReq({
      method: 'POST',
      body: { token: ghostToken },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 404, '[Handler] Rejects token for non-existent subscriber with HTTP 404');
  }

  // 2.6 Prevents token reuse against another subscriber (Identity Mismatch)
  {
    // Generate token with sub_active_001 ID, but email of someone else
    const forgedToken = generateUnsubscribeToken({
      id: activeSub.id,
      email: 'attacker@evil.com', // Mismatched email hash
    });
    const req = createMockReq({
      method: 'POST',
      body: { token: forgedToken },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects token with mismatched email hash with HTTP 400');
    assert(activeSub.status === 'SUBSCRIBED', '[Handler] Subscriber remains SUBSCRIBED');
  }

  // 2.7 Successful Unsubscribe
  {
    const validToken = generateUnsubscribeToken({
      id: activeSub.id,
      email: activeSub.email,
    });
    const req = createMockReq({
      method: 'POST',
      body: { token: validToken },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Successfully unsubscribes valid token with HTTP 200');
    assert(res.data?.success === true, '[Handler] Reports success === true');
    assert(res.data?.message === USER_FACING_UNSUBSCRIBE_SUCCESS, '[Handler] Returns canonical success message');
    assert(activeSub.status === 'UNSUBSCRIBED', '[Handler] Subscriber status in DB transitions to UNSUBSCRIBED');
    assert(!JSON.stringify(res.data).includes(activeSub.email), '[Handler] Response does NOT leak subscriber email');
  }

  // 2.8 Idempotent Repeated Unsubscribe
  {
    // Call again with same token for now-unsubscribed user
    const validToken = generateUnsubscribeToken({
      id: activeSub.id,
      email: activeSub.email,
    });
    const req = createMockReq({
      method: 'POST',
      body: { token: validToken },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Repeated unsubscribe returns HTTP 200 (idempotent)');
    assert(activeSub.status === 'UNSUBSCRIBED', '[Handler] Status remains UNSUBSCRIBED without error');
  }

  // 2.9 RFC 8058 One-Click POST (token in query string, One-Click body)
  {
    const rfcSubscriber: SubscriberRecord = {
      id: 'sub_rfc_003',
      email: 'rfc.oneclick@alongkar.in',
      status: 'SUBSCRIBED',
      consentAt: new Date(),
      subscribedAt: new Date(),
      source: 'homepage',
      welcomeEmailStatus: 'SENT',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.store.set(rfcSubscriber.email, rfcSubscriber);

    const rfcToken = generateUnsubscribeToken({
      id: rfcSubscriber.id,
      email: rfcSubscriber.email,
    });

    const req = createMockReq({
      method: 'POST',
      url: `/api/unsubscribe?token=${encodeURIComponent(rfcToken)}`,
      rawBodyString: 'List-Unsubscribe=One-Click',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      db: mockDb,
    });
    const res = createMockRes();
    await unsubscribeHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Supports RFC 8058 One-Click POST via query parameter');
    assert(rfcSubscriber.status === 'UNSUBSCRIBED', '[Handler] RFC 8058 transitions status to UNSUBSCRIBED');
  }

  // ─── PART 3: End-to-End Newsletter Integration & Brevo Templates ───────────
  console.log('\n--- PART 3: End-to-End Newsletter Integration & Brevo Templates ---');

  // 3.1 Welcome Email includes tokenized URL & List-Unsubscribe Header
  {
    // Test Brevo payload construction logic
    const testEmail = 'vip.client@alongkar.in';
    const testId = 'sub_vip_007';
    const generatedUrl = generateUnsubscribeUrl({ id: testId, email: testEmail });

    // Calling sendWelcomeEmail when disabled returns safe bypass with correct structure
    const result = await sendWelcomeEmail(testEmail, 'Royal Patron', testId, generatedUrl);
    assert(result.success === true, '[Brevo] sendWelcomeEmail returns success without throwing');
    assert(result.providerAccepted === false, '[Brevo] providerAccepted is false when Brevo disabled');
  }

  // 3.1b Validate Brevo Payload Headers & Template URLs under simulated enabled dispatch
  {
    const origFetch = global.fetch;
    const origApiKey = process.env.BREVO_API_KEY;
    const origSenderEmail = process.env.BREVO_SENDER_EMAIL;
    const origEnable = process.env.BREVO_ENABLE_WELCOME_EMAIL;

    process.env.BREVO_API_KEY = 'test_brevo_api_key_mock_12345';
    process.env.BREVO_SENDER_EMAIL = 'concierge@alongkar.in';
    process.env.BREVO_ENABLE_WELCOME_EMAIL = 'true';

    let capturedPayload: any = null;
    (global as any).fetch = async (_url: string, options: any) => {
      capturedPayload = JSON.parse(options.body);
      return {
        status: 201,
        ok: true,
        json: async () => ({ messageId: 'mock_brevo_msg_001' }),
      };
    };

    const sendRes = await sendWelcomeEmail('test.patron@alongkar.in', 'Patron', 'sub_test_001');
    assert(sendRes.success === true && sendRes.providerAccepted === true, '[Brevo Payload] Dispatch accepts mock call');
    assert(
      capturedPayload?.headers?.['List-Unsubscribe']?.startsWith('<https://alongkar.in/api/unsubscribe?token='),
      '[Brevo Payload] List-Unsubscribe header points to /api/unsubscribe API endpoint'
    );
    assert(
      capturedPayload?.headers?.['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click',
      '[Brevo Payload] List-Unsubscribe-Post is List-Unsubscribe=One-Click'
    );
    assert(
      capturedPayload?.htmlContent?.includes('https://alongkar.in/unsubscribe?token='),
      '[Brevo Payload] HTML template link points to /unsubscribe frontend page'
    );
    assert(
      capturedPayload?.textContent?.includes('https://alongkar.in/unsubscribe?token='),
      '[Brevo Payload] Text template link points to /unsubscribe frontend page'
    );

    // Both URLs in the email payload embed the identical token
    const listUnsubMatch = capturedPayload?.headers?.['List-Unsubscribe']?.match(/token=([^>&]+)/);
    const htmlMatch = capturedPayload?.htmlContent?.match(/\/unsubscribe\?token=([^"'>&]+)/);
    assert(
      Boolean(listUnsubMatch && htmlMatch && listUnsubMatch[1] === htmlMatch[1]),
      '[Brevo Payload] List-Unsubscribe and HTML link share the exact same generated token'
    );

    // Restore environment & fetch
    global.fetch = origFetch;
    if (origApiKey !== undefined) process.env.BREVO_API_KEY = origApiKey; else delete process.env.BREVO_API_KEY;
    if (origSenderEmail !== undefined) process.env.BREVO_SENDER_EMAIL = origSenderEmail; else delete process.env.BREVO_SENDER_EMAIL;
    if (origEnable !== undefined) process.env.BREVO_ENABLE_WELCOME_EMAIL = origEnable; else delete process.env.BREVO_ENABLE_WELCOME_EMAIL;
  }

  // 3.2 Resubmission by Unsubscribed User is Protected from Silent Reactivation
  {
    // Active subscriber was unsubscribed above (activeSub)
    assert(activeSub.status === 'UNSUBSCRIBED', '[Newsletter] Pre-condition: user is UNSUBSCRIBED');

    const req = createMockReq({
      method: 'POST',
      url: '/api/newsletter',
      body: {
        email: activeSub.email,
        consent: true,
      },
      db: mockDb,
    });
    const res = createMockRes();
    await newsletterHandler(req, res);

    assert(res.statusCode === 200, '[Newsletter] Form resubmission returns HTTP 200');
    assert(res.data?.message === USER_FACING_SUCCESS_MESSAGE, '[Newsletter] Returns generic anti-enumeration success message');
    assert(activeSub.status === 'UNSUBSCRIBED', '[Newsletter] Status is NEVER silently reactivated to SUBSCRIBED');
  }

  // 3.3 Normal Duplicate Signup remains idempotent
  {
    const freshSubscriber: SubscriberRecord = {
      id: 'sub_fresh_004',
      email: 'fresh.subscriber@alongkar.in',
      status: 'SUBSCRIBED',
      consentAt: new Date(),
      subscribedAt: new Date(),
      source: 'homepage',
      welcomeEmailStatus: 'SENT',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockDb.store.set(freshSubscriber.email, freshSubscriber);

    const req = createMockReq({
      method: 'POST',
      url: '/api/newsletter',
      body: {
        email: freshSubscriber.email,
        consent: true,
      },
      db: mockDb,
    });
    const res = createMockRes();
    await newsletterHandler(req, res);

    assert(res.statusCode === 200, '[Newsletter] Duplicate active signup returns HTTP 200');
    assert(freshSubscriber.status === 'SUBSCRIBED', '[Newsletter] Status remains SUBSCRIBED');
  }

  console.log('\n====================================================================');
  console.log(`SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('====================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
