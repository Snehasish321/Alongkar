/**
 * Comprehensive Test Suite: Newsletter Subscriber Foundation (Phase 1A-R)
 * 
 * Distinctly organized into:
 * - PART 1: Isolated Unit Tests (exported helper functions & Brevo gating)
 * - PART 2: Actual API Handler Integration Tests (invoking handler from api/newsletter.ts with mock req/res)
 * - PART 3: Stale SENDING State Recovery Tests (reconcileStaleSendingSubscribers)
 */

import http from 'http';
import { EventEmitter } from 'events';
import newsletterHandler, {
  normalizeEmail,
  isValidEmailFormat,
  maskEmail,
  USER_FACING_SUCCESS_MESSAGE,
  MAX_NEWSLETTER_BODY_BYTES,
  reconcileStaleSendingSubscribers,
} from '../api/newsletter.js';
import { isBrevoEmailSendingEnabled, sendWelcomeEmail } from '../api/_utils/brevo.js';
import { getRawAndParsedBody, isPayloadTooLarge } from '../api/_utils/auth.js';

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: unknown, testName: string, detail?: string) {
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

function createMockRes() {
  const emitter = new EventEmitter();
  const res: any = Object.assign(emitter, {
    statusCode: 200,
    headers: {} as Record<string, string>,
    data: null as any,
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
      emitter.emit('finish');
      return this;
    },
    end(str: string) {
      if (str) {
        try {
          this.data = JSON.parse(str);
        } catch {
          this.data = str;
        }
      }
      emitter.emit('finish');
      return this;
    },
  });
  return res;
}


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
        if (where?.email) {
          const rec = store.get(where.email.toLowerCase());
          return rec ? { ...rec } : null;
        }
        if (where?.id) {
          for (const rec of store.values()) {
            if (rec.id === where.id) return { ...rec };
          }
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

function createMockStreamReq(chunks: (string | Buffer)[], headers: Record<string, string> = {}) {
  const req: any = new EventEmitter();
  req.method = 'POST';
  req.url = '/api/newsletter';
  req.headers = { ...headers };
  req.socket = { remoteAddress: '127.0.0.1' };
  req.pause = () => { req._paused = true; };
  req.resume = () => { req._resumed = true; };
  req.destroy = () => { req._destroyed = true; };

  setImmediate(() => {
    for (const chunk of chunks) {
      if (req._destroyed) break;
      req.emit('data', chunk);
    }
    if (!req._destroyed) {
      req.emit('end');
    }
  });

  return req;
}

// ─────────────────────────────────────────────────────────────────────────────
// Test Suite Execution
// ─────────────────────────────────────────────────────────────────────────────

async function runTestSuite() {
  console.log('====================================================================');
  console.log('TEST SUITE: Phase 1A-R Newsletter Security & Verification');
  console.log('====================================================================\n');

  // =========================================================================
  // PART 1: Isolated Unit Tests
  // =========================================================================
  console.log('--- PART 1: Isolated Unit Tests (Helpers & Brevo Gating) ---');

  // 1.1 Email Normalization & Validation
  assert(
    normalizeEmail('  Customer.VIP@Alongkar.IN ') === 'customer.vip@alongkar.in',
    '[Unit] Normalizes email by trimming and converting to lowercase'
  );
  assert(isValidEmailFormat('client@alongkar.in') === true, '[Unit] Accepts valid standard email');
  assert(isValidEmailFormat('user+circle@example.co.in') === true, '[Unit] Accepts email with plus tag');
  assert(isValidEmailFormat('invalid-email') === false, '[Unit] Rejects email without @ symbol');
  assert(isValidEmailFormat('user@') === false, '[Unit] Rejects email without domain');
  assert(isValidEmailFormat('@domain.com') === false, '[Unit] Rejects email without username');
  assert(isValidEmailFormat('   ') === false, '[Unit] Rejects whitespace string');
  assert(isValidEmailFormat('a'.repeat(250) + '@example.com') === false, '[Unit] Rejects email exceeding 254 characters');

  // 1.2 Privacy Masking Helper
  assert(maskEmail('vip.patron@alongkar.in') === 'v***n@alongkar.in', '[Unit] Masks standard username safely');
  assert(maskEmail('me@alongkar.in') === 'm***@alongkar.in', '[Unit] Masks short 2-character username safely');
  assert(!maskEmail('snehasish@alongkar.in').includes('nehasis'), '[Unit] Never leaks internal characters of name');

  // 1.3 Brevo Gating & Safe Bypass
  const wasEnabled = process.env.BREVO_ENABLE_WELCOME_EMAIL;
  delete process.env.BREVO_ENABLE_WELCOME_EMAIL;

  assert(
    isBrevoEmailSendingEnabled() === false,
    '[Unit] Brevo sending is strictly disabled when BREVO_ENABLE_WELCOME_EMAIL is missing'
  );

  process.env.BREVO_ENABLE_WELCOME_EMAIL = 'false';
  assert(
    isBrevoEmailSendingEnabled() === false,
    '[Unit] Brevo sending is strictly disabled when BREVO_ENABLE_WELCOME_EMAIL is false'
  );

  const bypassResult = await sendWelcomeEmail('test@example.com');
  assert(bypassResult.success === true, '[Unit] sendWelcomeEmail returns success without throwing when disabled');
  assert(bypassResult.providerAccepted === false, '[Unit] providerAccepted is false when sending is bypassed');
  assert(
    Boolean(bypassResult.skippedReason?.includes('disabled or unconfigured')),
    '[Unit] Reports explicit skippedReason when bypassed'
  );

  if (wasEnabled) {
    process.env.BREVO_ENABLE_WELCOME_EMAIL = wasEnabled;
  } else {
    delete process.env.BREVO_ENABLE_WELCOME_EMAIL;
  }

  // =========================================================================
  // PART 2: Actual API Handler Tests (api/newsletter.ts)
  // =========================================================================
  console.log('\n--- PART 2: Actual API Handler Tests (Invoking handler directly) ---');

  const mockDb = createMockDb();

  // 2.1 HTTP Methods
  {
    const req = { method: 'GET', url: '/api/newsletter', headers: {}, prismaClient: mockDb };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 405, '[Handler] Rejects GET method with HTTP 405');
  }

  {
    const req = { method: 'OPTIONS', url: '/api/newsletter', headers: {}, prismaClient: mockDb };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 204, '[Handler] Handles OPTIONS preflight with HTTP 204');
  }

  // 2.2 Dedicated 16 KB Request Body Limit
  {
    const oversizedLength = (MAX_NEWSLETTER_BODY_BYTES + 500).toString();
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-length': oversizedLength, 'content-type': 'application/json' },
      body: { email: 'patron@alongkar.in', consent: true },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 413, '[Handler] Rejects oversized Content-Length header (>16KB) with HTTP 413');
    assert(res.data?.error?.includes('16KB'), '[Handler] Error message explicitly states 16KB limit');
  }

  {
    const oversizedBodyString = JSON.stringify({
      email: 'patron@alongkar.in',
      consent: true,
      padding: 'x'.repeat(MAX_NEWSLETTER_BODY_BYTES + 100),
    });
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: oversizedBodyString,
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 413, '[Handler] Rejects oversized raw body (>16KB) with HTTP 413');
  }

  {
    // Streamed request exceeding 16 KB
    const streamReq = createMockStreamReq(
      ['{"email":"patron@alongkar.in",', '"padding":"', 'x'.repeat(MAX_NEWSLETTER_BODY_BYTES + 100), '"}'],
      { 'content-type': 'application/json' }
    );
    streamReq.prismaClient = mockDb;
    const res = createMockRes();
    await newsletterHandler(streamReq, res);
    assert(res.statusCode === 413, '[Handler] Rejects oversized streamed chunks (>16KB) with HTTP 413');
  }

  // 2.2.1 Memory Accumulation Safety Test for Streamed Overflow
  {
    const chunks = [
      Buffer.alloc(8 * 1024, 'a'),
      Buffer.alloc(10 * 1024, 'b'), // Total 18KB > 16KB
      Buffer.alloc(12 * 1024, 'c'), // Subsequent chunks (should not be accumulated)
    ];
    const streamReq = createMockStreamReq(chunks, { 'content-type': 'application/json' });
    const parsed = await getRawAndParsedBody(streamReq, MAX_NEWSLETTER_BODY_BYTES);

    assert(
      parsed.error === 'PAYLOAD_TOO_LARGE',
      '[Accumulation] Streamed overflow yields PAYLOAD_TOO_LARGE error'
    );
    assert(
      parsed.rawBody === '',
      '[Accumulation] Stops accumulating and frees rawBody data on overflow'
    );
    assert(
      isPayloadTooLarge(parsed.data) === true,
      '[Accumulation] isPayloadTooLarge correctly detects overflow payload'
    );
  }

  // 2.2.2 Real Node HTTP Server Regression Test for Chunked Oversized Request
  {
    const realServer = http.createServer(async (req, res) => {
      (req as any).prismaClient = mockDb;
      try {
        await newsletterHandler(req, res);
      } catch (err: any) {
        if (!res.headersSent) {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: err?.message || 'Server error' }));
        }
      }
    });

    await new Promise<void>((resolve) => realServer.listen(0, '127.0.0.1', () => resolve()));
    const port = (realServer.address() as any).port;

    let receivedStatusCode = 0;
    let receivedData = '';
    let clientError: any = null;

    await new Promise<void>((resolve) => {
      const clientReq = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/api/newsletter',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Transfer-Encoding': 'chunked',
          },
        },
        (clientRes) => {
          receivedStatusCode = clientRes.statusCode || 0;
          clientRes.on('data', (chunk) => {
            receivedData += chunk;
          });
          clientRes.on('end', () => {
            resolve();
          });
        }
      );

      clientReq.on('error', (err) => {
        clientError = err;
        resolve();
      });

      // Send chunk 1 (within limit, 8KB)
      clientReq.write(Buffer.alloc(8 * 1024, 'x'));
      // Send chunk 2 (crosses 16KB limit, 10KB => total 18KB)
      clientReq.write(Buffer.alloc(10 * 1024, 'y'));
      // Send chunk 3 (subsequent oversized chunk => total 28KB)
      clientReq.write(Buffer.alloc(10 * 1024, 'z'));
      clientReq.end();
    });

    await new Promise<void>((resolve) => realServer.close(() => resolve()));

    assert(
      clientError === null,
      '[Real Node HTTP Server] Client receives response without ECONNRESET or socket hang up',
      clientError ? clientError.message : undefined
    );
    assert(
      receivedStatusCode === 413,
      '[Real Node HTTP Server] Client receives HTTP 413 for chunked oversized body'
    );
    assert(
      receivedData.includes('16KB'),
      '[Real Node HTTP Server] Response body contains 16KB payload error message'
    );
  }

  // 2.3 Malformed & Non-Object Payloads
  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      rawBody: '{"email": "broken-json, ',
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects malformed JSON with HTTP 400');
    assert(res.data?.error?.includes('Malformed JSON'), '[Handler] Reports malformed JSON error message');
  }

  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: ['not', 'an', 'object'],
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects JSON array payload with HTTP 400');
  }

  // 2.4 Consent Enforcement
  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'patron@alongkar.in', consent: false },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects consent === false with HTTP 400');
    assert(res.data?.error?.includes('Explicit consent is required'), '[Handler] Returns clear consent error');
  }

  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'patron@alongkar.in' },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects missing consent with HTTP 400');
  }

  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'patron@alongkar.in', consent: 'true' }, // string instead of boolean
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects string "true" consent with HTTP 400 (strict boolean)');
  }

  // 2.5 Email Format Validation
  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'invalid-email-address', consent: true },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 400, '[Handler] Rejects invalid email syntax with HTTP 400');
    assert(res.data?.error?.includes('valid email address'), '[Handler] Returns valid email format guidance');
  }

  // 2.6 New Subscriber Lifecycle
  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: '  PATRON.ROYAL@Alongkar.IN  ', consent: true },
      socket: { remoteAddress: '10.0.0.1' },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Returns HTTP 200 on new subscription');
    assert(res.data?.success === true, '[Handler] Reports success === true');
    assert(res.data?.message === USER_FACING_SUCCESS_MESSAGE, '[Handler] Returns canonical success copy');

    const saved = mockDb.store.get('patron.royal@alongkar.in');
    assert(saved !== undefined, '[Handler] Record is stored in database');
    assert(saved?.status === 'SUBSCRIBED', '[Handler] Subscriber status is SUBSCRIBED');
    assert(saved?.welcomeEmailStatus === 'PENDING', '[Handler] Welcome email status defaults to PENDING when Brevo disabled');
  }

  // 2.7 Duplicate Signup (Idempotency)
  {
    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'patron.royal@alongkar.in', consent: true },
      socket: { remoteAddress: '10.0.0.2' },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Duplicate submission returns HTTP 200 (idempotent)');
    assert(res.data?.message === USER_FACING_SUCCESS_MESSAGE, '[Handler] Duplicate returns identical message (anti-enumeration)');
  }

  // 2.8 Unsubscribed Address Protection
  {
    mockDb.store.set('unsubscribed.client@alongkar.in', {
      id: 'sub_unsub_1',
      email: 'unsubscribed.client@alongkar.in',
      status: 'UNSUBSCRIBED',
      consentAt: new Date(Date.now() - 86400000),
      subscribedAt: new Date(Date.now() - 86400000),
      source: 'homepage',
      welcomeEmailStatus: 'SENT',
      createdAt: new Date(Date.now() - 86400000),
      updatedAt: new Date(Date.now() - 86400000),
    });

    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'unsubscribed.client@alongkar.in', consent: true },
      socket: { remoteAddress: '10.0.0.3' },
      prismaClient: mockDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Resubmission by unsubscribed user returns HTTP 200');
    assert(res.data?.message === USER_FACING_SUCCESS_MESSAGE, '[Handler] Returns identical sanitized message');

    const record = mockDb.store.get('unsubscribed.client@alongkar.in');
    assert(record?.status === 'UNSUBSCRIBED', '[Handler] Status is NEVER silently reactivated to SUBSCRIBED');
  }

  // 2.9 Concurrent Insert Race Condition (Prisma P2002 Simulation)
  {
    const racingDb = createMockDb();
    let hasThrownRace = false;

    // Simulate unique constraint race on create
    const originalCreate = racingDb.newsletterSubscriber.create;
    racingDb.newsletterSubscriber.create = async (args: any) => {
      if (!hasThrownRace) {
        hasThrownRace = true;
        // Concurrent worker inserted record first
        racingDb.store.set(args.data.email, {
          id: 'sub_concurrent_winner',
          email: args.data.email,
          status: 'SUBSCRIBED',
          consentAt: new Date(),
          subscribedAt: new Date(),
          source: 'homepage',
          welcomeEmailStatus: 'PENDING',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        const p2002Err: any = new Error('Unique constraint failed on the fields: (`email`)');
        p2002Err.code = 'P2002';
        throw p2002Err;
      }
      return originalCreate(args);
    };

    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'race.winner@alongkar.in', consent: true },
      socket: { remoteAddress: '10.0.0.4' },
      prismaClient: racingDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 200, '[Handler] Handles P2002 unique constraint race condition gracefully (HTTP 200)');
    assert(res.data?.success === true, '[Handler] Race condition returns success without failing');
  }

  // 2.10 Sanitized Database Error Response
  {
    const errorDb = {
      newsletterSubscriber: {
        findUnique: async () => {
          throw new Error('FATAL: connection to server at "ep-black-hole.neon.tech" failed: Connection timed out');
        },
      },
    };

    const req = {
      method: 'POST',
      url: '/api/newsletter',
      headers: { 'content-type': 'application/json' },
      body: { email: 'patron.fail@alongkar.in', consent: true },
      socket: { remoteAddress: '10.0.0.5' },
      prismaClient: errorDb,
    };
    const res = createMockRes();
    await newsletterHandler(req, res);
    assert(res.statusCode === 500, '[Handler] Database failure returns HTTP 500');
    assert(res.data?.error === 'Unable to process subscription. Please try again later.', '[Handler] Sanitizes error message');
    assert(!JSON.stringify(res.data).includes('neon.tech'), '[Handler] Never leaks internal database connection details');
  }

  // 2.11 Rate Limiting Threshold
  {
    const testIp = '192.168.10.99';
    let lastStatusCode = 200;

    for (let i = 0; i < 7; i++) {
      const req = {
        method: 'POST',
        url: '/api/newsletter',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': testIp },
        body: { email: `rapid.${i}@alongkar.in`, consent: true },
        prismaClient: mockDb,
      };
      const res = createMockRes();
      await newsletterHandler(req, res);
      lastStatusCode = res.statusCode;
    }

    assert(lastStatusCode === 429, '[Handler] Exceeding rate limit threshold triggers HTTP 429 Too Many Requests');
  }

  // =========================================================================
  // PART 3: Stale SENDING State Recovery Tests
  // =========================================================================
  console.log('\n--- PART 3: Stale SENDING State Recovery (reconcileStaleSendingSubscribers) ---');

  {
    const reconDb = createMockDb();
    const twentyMinsAgo = new Date(Date.now() - 20 * 60 * 1000);
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);

    // Stale SENDING record (>15 mins ago)
    reconDb.store.set('stale.sending@alongkar.in', {
      id: 'sub_stale_1',
      email: 'stale.sending@alongkar.in',
      status: 'SUBSCRIBED',
      welcomeEmailStatus: 'SENDING',
      consentAt: twentyMinsAgo,
      subscribedAt: twentyMinsAgo,
      source: 'homepage',
      createdAt: twentyMinsAgo,
      updatedAt: twentyMinsAgo,
    });

    // Fresh SENDING record (5 mins ago - active dispatch)
    reconDb.store.set('fresh.sending@alongkar.in', {
      id: 'sub_fresh_1',
      email: 'fresh.sending@alongkar.in',
      status: 'SUBSCRIBED',
      welcomeEmailStatus: 'SENDING',
      consentAt: fiveMinsAgo,
      subscribedAt: fiveMinsAgo,
      source: 'homepage',
      createdAt: fiveMinsAgo,
      updatedAt: fiveMinsAgo,
    });

    // Already SENT record (should not be touched)
    reconDb.store.set('delivered@alongkar.in', {
      id: 'sub_sent_1',
      email: 'delivered@alongkar.in',
      status: 'SUBSCRIBED',
      welcomeEmailStatus: 'SENT',
      consentAt: twentyMinsAgo,
      subscribedAt: twentyMinsAgo,
      source: 'homepage',
      createdAt: twentyMinsAgo,
      updatedAt: twentyMinsAgo,
    });

    const result = await reconcileStaleSendingSubscribers(reconDb, 15);

    assert(result.reconciledCount === 1, '[Recovery] Reconciles exactly 1 stale SENDING record');
    assert(
      reconDb.store.get('stale.sending@alongkar.in')?.welcomeEmailStatus === 'FAILED',
      '[Recovery] Marks stale SENDING record (>15 mins) as FAILED'
    );
    assert(
      reconDb.store.get('fresh.sending@alongkar.in')?.welcomeEmailStatus === 'SENDING',
      '[Recovery] Does NOT alter fresh SENDING record (<15 mins)'
    );
    assert(
      reconDb.store.get('delivered@alongkar.in')?.welcomeEmailStatus === 'SENT',
      '[Recovery] Does NOT alter already SENT record'
    );
  }

  // =========================================================================
  // Test Summary
  // =========================================================================
  console.log('\n====================================================================');
  console.log(`SUMMARY: ${totalPassed} passed, ${totalFailed} failed`);
  console.log('====================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Unhandled test failure:', err);
  process.exit(1);
});
