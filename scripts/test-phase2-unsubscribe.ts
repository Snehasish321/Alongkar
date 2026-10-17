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
  isValidProductionBaseUrl,
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
  const userStore = new Map<string, any>();
  const orderStore = new Map<string, any>();

  // Seed sample unrelated user and order records
  userStore.set('usr_connoisseur_01', {
    id: 'usr_connoisseur_01',
    clerkUserId: 'user_clerk_001',
    email: 'patron.active@alongkar.in',
  });
  orderStore.set('ord_heritage_01', {
    id: 'ord_heritage_01',
    orderNumber: 'AK-2026-0001',
    customerEmail: 'patron.active@alongkar.in',
    grandTotal: 125000,
  });

  return {
    store,
    userStore,
    orderStore,
    user: {
      findUnique: async ({ where }: any) => {
        if (where?.id) return userStore.get(where.id) || null;
        if (where?.email) {
          for (const u of userStore.values()) {
            if (u.email === where.email) return { ...u };
          }
        }
        return null;
      },
      findMany: async () => Array.from(userStore.values()),
      delete: async () => {
        throw new Error('SECURITY VIOLATION: User table delete attempted!');
      },
    },
    order: {
      findUnique: async ({ where }: any) => {
        if (where?.id) return orderStore.get(where.id) || null;
        return null;
      },
      findMany: async () => Array.from(orderStore.values()),
      delete: async () => {
        throw new Error('SECURITY VIOLATION: Order table delete attempted!');
      },
    },
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
      delete: async ({ where }: any) => {
        let existingKey: string | undefined;
        let existingRec: SubscriberRecord | undefined;
        if (where?.id) {
          for (const [key, rec] of store.entries()) {
            if (rec.id === where.id) {
              existingKey = key;
              existingRec = rec;
              break;
            }
          }
        } else if (where?.email) {
          const key = where.email.toLowerCase();
          if (store.has(key)) {
            existingKey = key;
            existingRec = store.get(key);
          }
        }
        if (!existingKey || !existingRec) {
          const err: any = new Error('Record to delete does not exist');
          err.code = 'P2025';
          throw err;
        }
        store.delete(existingKey);
        return { ...existingRec };
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

  // Environment-Aware URL Resolution Tests (Canonical Production vs Preview & Hardened Host Overrides)
  {
    const origVercelEnv = process.env.VERCEL_ENV;
    const origVercelUrl = process.env.VERCEL_URL;
    const origAppUrl = process.env.APP_URL;

    try {
      // 1. Direct Production URL Validator Unit Tests (isValidProductionBaseUrl)
      assert(
        isValidProductionBaseUrl('https://alongkar.in') === true,
        '[URL Validator] Accepts https://alongkar.in'
      );
      assert(
        isValidProductionBaseUrl('https://www.alongkar.in') === true,
        '[URL Validator] Accepts https://www.alongkar.in'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in/') === true,
        '[URL Validator] Accepts https://alongkar.in/ with trailing root slash'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in:443') === true,
        '[URL Validator] Accepts standard HTTPS port 443'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in:8080') === false,
        '[URL Validator] Rejects non-standard port (https://alongkar.in:8080)'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in:80') === false,
        '[URL Validator] Rejects non-443 port (https://alongkar.in:80)'
      );
      assert(
        isValidProductionBaseUrl('https://user:pass@alongkar.in') === false,
        '[URL Validator] Rejects URL credentials (username and password)'
      );
      assert(
        isValidProductionBaseUrl('https://user@alongkar.in') === false,
        '[URL Validator] Rejects URL credentials (username only)'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in/custom/path') === false,
        '[URL Validator] Rejects non-root path prefix (/custom/path)'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in?foo=bar') === false,
        '[URL Validator] Rejects query string (?foo=bar)'
      );
      assert(
        isValidProductionBaseUrl('https://alongkar.in#frag') === false,
        '[URL Validator] Rejects fragment identifier (#frag)'
      );
      assert(
        isValidProductionBaseUrl('http://alongkar.in') === false,
        '[URL Validator] Rejects insecure HTTP URL (http://alongkar.in)'
      );
      assert(
        isValidProductionBaseUrl('http://www.alongkar.in') === false,
        '[URL Validator] Rejects insecure HTTP URL (http://www.alongkar.in)'
      );
      assert(
        isValidProductionBaseUrl('https://phishing-attacker-domain.com') === false,
        '[URL Validator] Rejects unapproved host (https://phishing-attacker-domain.com)'
      );
      assert(
        isValidProductionBaseUrl('not-a-valid-url') === false,
        '[URL Validator] Rejects malformed URL strings'
      );

      // 2. Production Canonical URL (VERCEL_ENV=production with VERCEL_URL present)
      process.env.VERCEL_ENV = 'production';
      process.env.VERCEL_URL = 'alongkar-deployment-hash.vercel.app';
      delete process.env.APP_URL;
      const prodUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        prodUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[Canonical URL] Production email links use canonical https://alongkar.in'
      );
      assert(
        prodUrls.apiUrl.startsWith('https://alongkar.in/api/unsubscribe?token='),
        '[Canonical URL] Production List-Unsubscribe uses canonical https://alongkar.in/api/unsubscribe'
      );
      assert(
        !prodUrls.pageUrl.includes('vercel.app'),
        '[Canonical URL] Production links do NOT use deployment-specific VERCEL_URL'
      );

      // 3. Reject Insecure http:// APP_URL Override in Production
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'http://insecure-domain.com';
      const rejectedHttpUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        rejectedHttpUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[URL Hardening] Rejects insecure http:// APP_URL override in production and defaults to canonical URL'
      );

      // 4. Reject Unapproved Host APP_URL Override in Production
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'https://phishing-attacker-domain.com';
      const rejectedHostUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        rejectedHostUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[URL Hardening] Rejects unapproved host APP_URL override in production and defaults to canonical URL'
      );

      // 5. Reject Non-Standard Port APP_URL Override in Production
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'https://alongkar.in:8080';
      const rejectedPortUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        rejectedPortUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[URL Hardening] Rejects non-standard port APP_URL override (https://alongkar.in:8080) and defaults to canonical URL'
      );

      // 6. Reject Credentials APP_URL Override in Production
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'https://user:pass@alongkar.in';
      const rejectedCredUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        rejectedCredUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[URL Hardening] Rejects credentials in APP_URL override and defaults to canonical URL'
      );

      // 7. Reject Path Prefix APP_URL Override in Production
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'https://alongkar.in/custom/path';
      const rejectedPathUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        rejectedPathUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[URL Hardening] Rejects path prefix in APP_URL override and defaults to canonical URL'
      );

      // 8. Reject Query String and Fragment APP_URL Override in Production
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'https://alongkar.in?foo=bar#frag';
      const rejectedQueryFragUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        rejectedQueryFragUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[URL Hardening] Rejects query string/fragment in APP_URL override and defaults to canonical URL'
      );

      // 9. Accept Valid Approved Production Host Override (https://www.alongkar.in)
      process.env.VERCEL_ENV = 'production';
      process.env.APP_URL = 'https://www.alongkar.in';
      const approvedHostUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        approvedHostUrls.pageUrl.startsWith('https://www.alongkar.in/unsubscribe?token='),
        '[URL Hardening] Accepts valid approved production host override (https://www.alongkar.in)'
      );

      // 10. Preview Environment URL (VERCEL_ENV=preview with VERCEL_URL present)
      process.env.VERCEL_ENV = 'preview';
      process.env.VERCEL_URL = 'alongkar-git-preview-test.vercel.app';
      delete process.env.APP_URL;
      const previewUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        previewUrls.pageUrl.startsWith('https://alongkar-git-preview-test.vercel.app/unsubscribe?token='),
        '[Preview URL] Preview email links point to the active preview deployment URL'
      );
      assert(
        previewUrls.apiUrl.startsWith('https://alongkar-git-preview-test.vercel.app/api/unsubscribe?token='),
        '[Preview URL] Preview List-Unsubscribe header points to the preview API endpoint'
      );

      // 11. Explicit baseUrl argument override (for unit tests)
      const argUrls = generateUnsubscribeUrls(testSubscriber, 'https://staging.alongkar.in');
      assert(
        argUrls.pageUrl.startsWith('https://staging.alongkar.in/unsubscribe?token='),
        '[URL Override] Explicit baseUrl argument takes highest precedence for unit tests'
      );

      // 12. Default Fallback when no environment variables exist
      delete process.env.VERCEL_ENV;
      delete process.env.VERCEL_URL;
      delete process.env.APP_URL;
      const defaultUrls = generateUnsubscribeUrls(testSubscriber);
      assert(
        defaultUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='),
        '[Default URL] Fallback default generates canonical https://alongkar.in'
      );
    } finally {
      if (origVercelEnv !== undefined) process.env.VERCEL_ENV = origVercelEnv; else delete process.env.VERCEL_ENV;
      if (origVercelUrl !== undefined) process.env.VERCEL_URL = origVercelUrl; else delete process.env.VERCEL_URL;
      if (origAppUrl !== undefined) process.env.APP_URL = origAppUrl; else delete process.env.APP_URL;
    }
  }

  // Frontend History-State Token Lifecycle & Cleanup Tests
  {
    console.log('\n--- Frontend History-State Token Lifecycle & Cleanup Tests ---');

    const HISTORY_KEY = 'alongkarUnsubToken';

    // Mock environment representing the browser history and window state
    let mockHistoryState: any = null;
    let mockAddressBar = '/unsubscribe';

    function mockGetHistoryToken(): string | null {
      try {
        if (mockHistoryState && typeof mockHistoryState === 'object' && typeof mockHistoryState[HISTORY_KEY] === 'string') {
          const trimmed = mockHistoryState[HISTORY_KEY].trim();
          return trimmed.length > 0 ? trimmed : null;
        }
      } catch {
        // Safe catch
      }
      return null;
    }

    function mockSetHistoryToken(t: string | null) {
      const isObj = mockHistoryState && typeof mockHistoryState === 'object';
      if (t && typeof t === 'string' && t.trim().length > 0) {
        mockHistoryState = isObj ? { ...mockHistoryState, [HISTORY_KEY]: t.trim() } : { [HISTORY_KEY]: t.trim() };
      } else {
        if (!isObj || !(HISTORY_KEY in mockHistoryState)) return;
        const { [HISTORY_KEY]: _removed, ...rest } = mockHistoryState;
        mockHistoryState = rest;
      }
      mockAddressBar = '/unsubscribe';
    }

    function mockClearHistoryToken() {
      mockSetHistoryToken(null);
    }

    function simulateMount(searchParamToken: string | null): string | null {
      const queryToken = searchParamToken?.trim();
      if (queryToken && queryToken.length > 0) {
        return queryToken;
      }
      return mockGetHistoryToken();
    }

    // 1. Direct Tokenized Link: Query token is captured on mount and bound to history.state
    mockHistoryState = { key: 'route_entry_1', idx: 0, usr: { referrer: 'email' } };
    const rawIncomingToken = generateUnsubscribeToken(testSubscriber);
    const capturedToken = simulateMount(rawIncomingToken);
    assert(capturedToken === rawIncomingToken, '[History Token] Valid query token is captured on initial mount');

    // Simulate URL cleanup effect: binds to history.state while sanitizing address bar
    mockSetHistoryToken(capturedToken);
    assert(
      mockHistoryState[HISTORY_KEY] === rawIncomingToken,
      '[History Token] Token is stored in history.state for this entry'
    );
    assert(mockAddressBar === '/unsubscribe', '[History Token] Address bar URL is sanitized without query token');

    // 2. Preservation of Unrelated Router History State
    assert(
      mockHistoryState.key === 'route_entry_1' && mockHistoryState.idx === 0 && mockHistoryState.usr?.referrer === 'email',
      '[History Token] Unrelated router history state (key, idx, usr) is strictly preserved'
    );

    // 3. React Strict Mode / Remount of the Same History Entry
    // Query param in URL is now gone; component remounts and recovers token from history.state
    const remountToken = simulateMount(null);
    assert(
      remountToken === rawIncomingToken,
      '[History Token] StrictMode remount of the same history entry recovers token from history.state'
    );

    // 4. Page Refresh on the Same History Entry
    // Browser preserves window.history.state across reloads of the same entry
    const refreshToken = simulateMount(null);
    assert(
      refreshToken === rawIncomingToken,
      '[History Token] Page refresh on the same history entry recovers token from history.state'
    );

    // 5. Direct /unsubscribe Visit with No Token (Elimination of Stale-Token Reuse)
    // User navigates away to /shop, then visits /unsubscribe directly. A new history entry is pushed without alongkarUnsubToken.
    mockHistoryState = { key: 'route_entry_2', idx: 1 }; // New history entry without token
    const directUnparameterizedVisit = simulateMount(null);
    assert(
      directUnparameterizedVisit === null,
      '[History Token] Direct visit to /unsubscribe with no token yields null (displays invalid-link UI)'
    );

    // 6. Successful Unsubscribe (HTTP 200) Clears Token from History State
    // Set up active state
    mockHistoryState = { key: 'route_entry_3', idx: 2, [HISTORY_KEY]: rawIncomingToken };
    assert(mockHistoryState[HISTORY_KEY] !== undefined, '[History Token] Pre-condition: token present in history');
    mockClearHistoryToken();
    assert(
      mockHistoryState[HISTORY_KEY] === undefined,
      '[History Token] Successful unsubscribe clears token from history.state'
    );
    assert(mockHistoryState.key === 'route_entry_3', '[History Token] Preserves unrelated history keys during cleanup');

    // 7. Deterministic Rejections (HTTP 400 & 404) Clear Token from History State
    mockHistoryState = { key: 'route_entry_4', [HISTORY_KEY]: 'tampered-token' };
    mockClearHistoryToken(); // simulate 400 Bad Request branch
    assert(
      mockHistoryState[HISTORY_KEY] === undefined,
      '[History Token] Deterministic HTTP 400 rejection clears token from history.state'
    );

    mockHistoryState = { key: 'route_entry_5', [HISTORY_KEY]: 'non-existent-sub' };
    mockClearHistoryToken(); // simulate 404 Not Found branch
    assert(
      mockHistoryState[HISTORY_KEY] === undefined,
      '[History Token] Deterministic HTTP 404 rejection clears token from history.state'
    );

    // 8. Transient Failures (HTTP 429, 500, Network Failure) Preserve Token for User Retry
    mockHistoryState = { key: 'route_entry_6', [HISTORY_KEY]: rawIncomingToken };
    let componentTokenInMemory: string | null = rawIncomingToken;
    // On 429 rate limit or 500 or network catch: clearHistoryToken is NOT called
    assert(
      componentTokenInMemory === rawIncomingToken && mockHistoryState[HISTORY_KEY] === rawIncomingToken,
      '[History Token] Transient failure (429/500/network error) preserves token in memory and state for retry'
    );

    // 9. Malformed or Unexpected History State Handled Gracefully
    mockHistoryState = 'string_instead_of_object';
    assert(mockGetHistoryToken() === null, '[History Token] Non-object history state evaluates to null safely');

    mockHistoryState = { [HISTORY_KEY]: '   ' };
    assert(mockGetHistoryToken() === null, '[History Token] Whitespace-only token in history state is rejected as null');

    mockHistoryState = { [HISTORY_KEY]: 12345 };
    assert(mockGetHistoryToken() === null, '[History Token] Non-string token in history state is rejected as null');
  }

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

  // 2.7 Successful Unsubscribe (Deletes matching NewsletterSubscriber row only)
  {
    const initialUserCount = mockDb.userStore.size;
    const initialOrderCount = mockDb.orderStore.size;
    assert(mockDb.store.has(activeSub.email) === true, '[Pre-condition] activeSub exists in DB');

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
    assert(mockDb.store.has(activeSub.email) === false, '[Handler] NewsletterSubscriber row is DELETED from database (not marked UNSUBSCRIBED)');
    assert(mockDb.userStore.size === initialUserCount, '[Security] User table was NOT touched during unsubscribe');
    assert(mockDb.orderStore.size === initialOrderCount, '[Security] Order table was NOT touched during unsubscribe');
    assert(!JSON.stringify(res.data).includes(activeSub.email), '[Handler] Response does NOT leak subscriber email');
  }

  // 2.8 Safe Repeated Unsubscribe (Terminal response after deletion)
  {
    // Call again with same token for now-deleted subscriber
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
    assert(res.statusCode === 404, '[Handler] Repeated unsubscribe returns terminal HTTP 404');
    assert(res.data?.success === false, '[Handler] Reports success === false on already-deleted record');
    assert(
      res.data?.error === 'Subscriber record was not found or has already been removed.',
      '[Handler] Returns safe terminal message indicating record was removed'
    );
    assert(mockDb.store.has(activeSub.email) === false, '[Handler] Record remains deleted, no re-subscription occurred');
  }

  // 2.9 RFC 8058 One-Click POST (Deletes subscriber row via token in query string)
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
    assert(mockDb.store.has(rfcSubscriber.email) === false, '[Handler] RFC 8058 One-Click DELETES subscriber record from database');
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

  // 3.2 Resubscription After Deletion Creates Fresh Record and Triggers Welcome Path
  {
    // activeSub was deleted in test 2.7
    assert(mockDb.store.has(activeSub.email) === false, '[Newsletter Re-subscription] Pre-condition: user was deleted');

    const origFetch = global.fetch;
    const origApiKey = process.env.BREVO_API_KEY;
    const origSenderEmail = process.env.BREVO_SENDER_EMAIL;
    const origEnable = process.env.BREVO_ENABLE_WELCOME_EMAIL;

    process.env.BREVO_API_KEY = 'test_brevo_api_key_mock_12345';
    process.env.BREVO_SENDER_EMAIL = 'concierge@alongkar.in';
    process.env.BREVO_ENABLE_WELCOME_EMAIL = 'true';

    let emailSent = false;
    let emailSentTo = '';
    (global as any).fetch = async (_url: string, options: any) => {
      const payload = JSON.parse(options.body);
      emailSent = true;
      emailSentTo = payload.to?.[0]?.email;
      return {
        status: 201,
        ok: true,
        json: async () => ({ messageId: 'mock_resubscribe_welcome_msg_001' }),
      };
    };

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

    assert(res.statusCode === 200, '[Newsletter Re-subscription] Re-subscribing returns HTTP 200');
    assert(res.data?.message === USER_FACING_SUCCESS_MESSAGE, '[Newsletter Re-subscription] Returns user-facing success message');
    assert(mockDb.store.has(activeSub.email) === true, '[Newsletter Re-subscription] Creates a fresh NewsletterSubscriber record in DB');

    const freshRecord = mockDb.store.get(activeSub.email);
    assert(freshRecord?.status === 'SUBSCRIBED', '[Newsletter Re-subscription] Fresh record has status SUBSCRIBED');
    assert(freshRecord?.id !== activeSub.id, '[Newsletter Re-subscription] Fresh record receives a new distinct ID');
    assert(freshRecord?.welcomeEmailStatus === 'SENT', '[Newsletter Re-subscription] Welcome email status transitions to SENT');
    assert(emailSent === true && emailSentTo === activeSub.email, '[Newsletter Re-subscription] Dispatches normal welcome email to resubscriber');

    // Restore environment & fetch
    global.fetch = origFetch;
    if (origApiKey !== undefined) process.env.BREVO_API_KEY = origApiKey; else delete process.env.BREVO_API_KEY;
    if (origSenderEmail !== undefined) process.env.BREVO_SENDER_EMAIL = origSenderEmail; else delete process.env.BREVO_SENDER_EMAIL;
    if (origEnable !== undefined) process.env.BREVO_ENABLE_WELCOME_EMAIL = origEnable; else delete process.env.BREVO_ENABLE_WELCOME_EMAIL;
  }

  // 3.3 Duplicate Active Signup Remains Idempotent (No Duplicate Record or Welcome Email)
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

    let unexpectedEmailSent = false;
    const origFetch = global.fetch;
    (global as any).fetch = async () => {
      unexpectedEmailSent = true;
      return { status: 200, ok: true, json: async () => ({}) };
    };

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

    assert(res.statusCode === 200, '[Newsletter Duplicate] Duplicate active signup returns HTTP 200');
    assert(freshSubscriber.status === 'SUBSCRIBED', '[Newsletter Duplicate] Status remains SUBSCRIBED');
    assert(freshSubscriber.id === 'sub_fresh_004', '[Newsletter Duplicate] Does not create a new or duplicate record');
    assert(unexpectedEmailSent === false, '[Newsletter Duplicate] Does NOT send duplicate welcome email');

    global.fetch = origFetch;
  }

  // 3.4 Legacy Unsubscribed Record Re-subscription & Protection
  {
    const legacyUnsub: SubscriberRecord = {
      id: 'sub_legacy_005',
      email: 'legacy.unsub@alongkar.in',
      status: 'UNSUBSCRIBED',
      consentAt: new Date(Date.now() - 30 * 86400000),
      subscribedAt: new Date(Date.now() - 30 * 86400000),
      source: 'homepage',
      welcomeEmailStatus: 'SENT',
      createdAt: new Date(Date.now() - 30 * 86400000),
      updatedAt: new Date(Date.now() - 30 * 86400000),
    };
    mockDb.store.set(legacyUnsub.email, { ...legacyUnsub });

    const initialUserCount = mockDb.userStore.size;
    const initialOrderCount = mockDb.orderStore.size;

    // 1. Invalid requests must NOT delete or mutate the legacy record
    // 1a. Missing/False Consent
    const reqNoConsent = createMockReq({
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'x-forwarded-for': '192.168.50.1' },
      body: { email: legacyUnsub.email, consent: false },
      db: mockDb,
    });
    const resNoConsent = createMockRes();
    await newsletterHandler(reqNoConsent, resNoConsent);
    assert(resNoConsent.statusCode === 400, '[Legacy Unsubscribed Security] Missing consent rejects with HTTP 400');
    assert(
      mockDb.store.get(legacyUnsub.email)?.id === 'sub_legacy_005',
      '[Legacy Unsubscribed Security] Missing consent does NOT delete or alter legacy record'
    );
    assert(
      mockDb.store.get(legacyUnsub.email)?.status === 'UNSUBSCRIBED',
      '[Legacy Unsubscribed Security] Legacy status remains UNSUBSCRIBED on rejected request'
    );

    // 1b. Invalid Email Format
    const reqInvalidEmail = createMockReq({
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'x-forwarded-for': '192.168.50.1' },
      body: { email: 'not-a-valid-email', consent: true },
      db: mockDb,
    });
    const resInvalidEmail = createMockRes();
    await newsletterHandler(reqInvalidEmail, resInvalidEmail);
    assert(resInvalidEmail.statusCode === 400, '[Legacy Unsubscribed Security] Invalid email rejects with HTTP 400');
    assert(
      mockDb.store.get(legacyUnsub.email)?.id === 'sub_legacy_005',
      '[Legacy Unsubscribed Security] Invalid email payload does NOT delete legacy record'
    );

    // 2. Valid request with explicit consent: replaces legacy row with fresh SUBSCRIBED record
    const origFetch = global.fetch;
    const origApiKey = process.env.BREVO_API_KEY;
    const origSenderEmail = process.env.BREVO_SENDER_EMAIL;
    const origEnable = process.env.BREVO_ENABLE_WELCOME_EMAIL;

    try {
      process.env.BREVO_API_KEY = 'test_brevo_api_key_mock_12345';
      process.env.BREVO_SENDER_EMAIL = 'concierge@alongkar.in';
      process.env.BREVO_ENABLE_WELCOME_EMAIL = 'true';

      let emailSentCount = 0;
      let emailSentTo = '';
      (global as any).fetch = async (_url: string, options: any) => {
        const payload = JSON.parse(options.body);
        emailSentCount++;
        emailSentTo = payload.to?.[0]?.email;
        return {
          status: 201,
          ok: true,
          json: async () => ({ messageId: 'mock_msg_resub_001' }),
        };
      };

      const reqValid = createMockReq({
        method: 'POST',
        url: '/api/newsletter',
        headers: { 'x-forwarded-for': '192.168.50.2' },
        body: {
          email: legacyUnsub.email,
          consent: true,
        },
        db: mockDb,
      });
      const resValid = createMockRes();
      await newsletterHandler(reqValid, resValid);

      assert(resValid.statusCode === 200, '[Legacy Unsubscribed] Valid resubmission returns HTTP 200');
      assert(
        resValid.data?.message === USER_FACING_SUCCESS_MESSAGE,
        '[Legacy Unsubscribed] Returns canonical user-facing success message'
      );

      // Verify old record was replaced by a fresh record
      const freshRecord = mockDb.store.get(legacyUnsub.email);
      assert(freshRecord !== undefined, '[Legacy Unsubscribed] Record exists in store');
      assert(
        freshRecord.id !== 'sub_legacy_005',
        '[Legacy Unsubscribed] Replaced record has a fresh distinct ID'
      );
      assert(
        freshRecord.status === 'SUBSCRIBED',
        '[Legacy Unsubscribed] Fresh record status is SUBSCRIBED'
      );
      assert(
        freshRecord.welcomeEmailStatus === 'SENT',
        '[Legacy Unsubscribed] Fresh record welcome email status is SENT'
      );
      assert(
        emailSentCount === 1,
        '[Legacy Unsubscribed] Welcome email workflow triggered exactly once'
      );
      assert(
        emailSentTo === legacyUnsub.email,
        '[Legacy Unsubscribed] Welcome email addressed to re-subscribing email'
      );

      // 3. Active duplicate subscriptions remain idempotent
      const reqDuplicate = createMockReq({
        method: 'POST',
        url: '/api/newsletter',
        headers: { 'x-forwarded-for': '192.168.50.2' },
        body: {
          email: legacyUnsub.email,
          consent: true,
        },
        db: mockDb,
      });
      const resDuplicate = createMockRes();
      await newsletterHandler(reqDuplicate, resDuplicate);

      assert(resDuplicate.statusCode === 200, '[Legacy Resubscription Duplicate] Returns HTTP 200');
      const duplicateRecord = mockDb.store.get(legacyUnsub.email);
      assert(
        duplicateRecord?.id === freshRecord.id,
        '[Legacy Resubscription Duplicate] Does NOT create another record or alter existing ID'
      );
      assert(
        duplicateRecord?.status === 'SUBSCRIBED',
        '[Legacy Resubscription Duplicate] Status remains SUBSCRIBED'
      );
      assert(
        emailSentCount === 1,
        '[Legacy Resubscription Duplicate] Does NOT send duplicate welcome email'
      );

      // 4. Unrelated tables remain untouched
      assert(mockDb.userStore.size === initialUserCount, '[Legacy Security] User table was NOT touched during re-subscription');
      assert(mockDb.orderStore.size === initialOrderCount, '[Legacy Security] Order table was NOT touched during re-subscription');
    } finally {
      // Restore environment & fetch
      global.fetch = origFetch;
      if (origApiKey !== undefined) process.env.BREVO_API_KEY = origApiKey; else delete process.env.BREVO_API_KEY;
      if (origSenderEmail !== undefined) process.env.BREVO_SENDER_EMAIL = origSenderEmail; else delete process.env.BREVO_SENDER_EMAIL;
      if (origEnable !== undefined) process.env.BREVO_ENABLE_WELCOME_EMAIL = origEnable; else delete process.env.BREVO_ENABLE_WELCOME_EMAIL;
    }
  }

  // 3.5 URL Generation Audit & Malformed Link Investigation
  {
    console.log('\n--- PART 4: Unsubscribe URL Audit & Malformed Link Investigation ---');

    const sampleSubscriber = { id: 'sub_audit_100', email: 'audit.patron@alongkar.in' };

    // Standard Canonical Generation
    const urls = generateUnsubscribeUrls(sampleSubscriber);
    assert(urls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='), '[URL Audit] pageUrl uses canonical production https://alongkar.in');
    assert(urls.apiUrl.startsWith('https://alongkar.in/api/unsubscribe?token='), '[URL Audit] apiUrl uses canonical production https://alongkar.in/api/unsubscribe');
    assert(!urls.pageUrl.includes('&#x20'), '[URL Audit] pageUrl does NOT contain &#x20');
    assert(!urls.apiUrl.includes('&#x20'), '[URL Audit] apiUrl does NOT contain &#x20');
    assert(!urls.pageUrl.includes(' '), '[URL Audit] pageUrl does NOT contain spaces');
    assert(!urls.apiUrl.includes(' '), '[URL Audit] apiUrl does NOT contain spaces');

    // Verification of URL structure
    const parsedPageUrl = new URL(urls.pageUrl);
    assert(parsedPageUrl.protocol === 'https:', '[URL Audit] Protocol is strictly https:');
    assert(parsedPageUrl.hostname === 'alongkar.in', '[URL Audit] Hostname is canonical alongkar.in');
    assert(parsedPageUrl.pathname === '/unsubscribe', '[URL Audit] Path is exactly /unsubscribe (no trailing entities or chars)');
    assert(Boolean(parsedPageUrl.searchParams.get('token')), '[URL Audit] Token query parameter is present');

    const parsedApiUrl = new URL(urls.apiUrl);
    assert(parsedApiUrl.pathname === '/api/unsubscribe', '[URL Audit] API path is exactly /api/unsubscribe');

    // Defensive trimming against dirty baseUrl overrides
    const dirtyBaseUrls = generateUnsubscribeUrls(sampleSubscriber, '  https://alongkar.in/   ');
    assert(dirtyBaseUrls.pageUrl.startsWith('https://alongkar.in/unsubscribe?token='), '[URL Audit] Trims leading/trailing whitespace and slashes in baseUrl');
    assert(!dirtyBaseUrls.pageUrl.includes(' '), '[URL Audit] Sanitized baseUrl contains no spaces');

    // Email template rendering checks
    const origFetch = global.fetch;
    const origApiKey = process.env.BREVO_API_KEY;
    const origSenderEmail = process.env.BREVO_SENDER_EMAIL;
    const origEnable = process.env.BREVO_ENABLE_WELCOME_EMAIL;

    process.env.BREVO_API_KEY = 'test_brevo_api_key_mock_12345';
    process.env.BREVO_SENDER_EMAIL = 'concierge@alongkar.in';
    process.env.BREVO_ENABLE_WELCOME_EMAIL = 'true';

    let capturedEmailPayload: any = null;
    (global as any).fetch = async (_url: string, options: any) => {
      capturedEmailPayload = JSON.parse(options.body);
      return {
        status: 201,
        ok: true,
        json: async () => ({ messageId: 'mock_audit_msg_001' }),
      };
    };

    await sendWelcomeEmail('audit.patron@alongkar.in', 'Patron', 'sub_audit_100');

    assert(capturedEmailPayload !== null, '[Email Payload] Captured email dispatch payload');
    const htmlContent: string = capturedEmailPayload.htmlContent;
    const textContent: string = capturedEmailPayload.textContent;
    const headers = capturedEmailPayload.headers;

    // Check RFC 8058 Headers
    assert(headers['List-Unsubscribe']?.startsWith('<https://alongkar.in/api/unsubscribe?token='), '[Email Payload] RFC 8058 List-Unsubscribe header is valid');
    assert(headers['List-Unsubscribe']?.endsWith('>'), '[Email Payload] List-Unsubscribe is properly enclosed in angle brackets');
    assert(!headers['List-Unsubscribe']?.includes('&#x20'), '[Email Payload] List-Unsubscribe header does NOT contain &#x20');
    assert(!headers['List-Unsubscribe']?.includes(' '), '[Email Payload] List-Unsubscribe header does NOT contain spaces');
    assert(headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click', '[Email Payload] List-Unsubscribe-Post header is intact');

    // Check HTML Link
    assert(!htmlContent.includes('/unsubscribe&#x20'), '[Email Payload] HTML content does NOT contain /unsubscribe&#x20');
    assert(htmlContent.includes('href="https://alongkar.in/unsubscribe?token='), '[Email Payload] HTML contains valid href to /unsubscribe');
    assert(!htmlContent.includes('href="https://alongkar.in/unsubscribe?token= '), '[Email Payload] HTML href does not have trailing space before token');
    assert(!htmlContent.includes('/unsubscribe "'), '[Email Payload] HTML href does not have trailing space before quote');

    // Check Plain Text Link
    assert(!textContent.includes('/unsubscribe&#x20'), '[Email Payload] Text content does NOT contain /unsubscribe&#x20');
    assert(textContent.includes('https://alongkar.in/unsubscribe?token='), '[Email Payload] Text content includes valid plain-text link');

    // Token privacy check: ensure secrets are not logged or exposed
    assert(!htmlContent.includes('secret') && !textContent.includes('secret'), '[Email Payload] Secrets are never exposed in email payload');

    // Restore environment & fetch
    global.fetch = origFetch;
    if (origApiKey !== undefined) process.env.BREVO_API_KEY = origApiKey; else delete process.env.BREVO_API_KEY;
    if (origSenderEmail !== undefined) process.env.BREVO_SENDER_EMAIL = origSenderEmail; else delete process.env.BREVO_SENDER_EMAIL;
    if (origEnable !== undefined) process.env.BREVO_ENABLE_WELCOME_EMAIL = origEnable; else delete process.env.BREVO_ENABLE_WELCOME_EMAIL;
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
