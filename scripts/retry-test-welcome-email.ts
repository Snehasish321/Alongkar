/**
 * scripts/retry-test-welcome-email.ts
 * 
 * Guarded, one-time test script to retry welcome-email delivery for an existing
 * subscriber on the isolated Neon test branch (`test-newsletter-phase1a`).
 * 
 * STRICT SAFEGUARDS:
 * 1. Validates DATABASE_URL hostname against the exact expected test branch.
 * 2. Requires TEST_SUBSCRIBER_EMAIL environment variable and masks all PII.
 * 3. Requires isBrevoEmailSendingEnabled() === true and uses canonical sendWelcomeEmail().
 * 4. Guards against non-PENDING status and existing provider IDs (no duplicate sends).
 * 5. Uses an atomic update lock (PENDING -> SENDING) before calling Brevo.
 * 6. Updates status to SENT upon provider acceptance, or FAILED upon rejection.
 * 7. Emits clear warnings if database update fails after provider acceptance (prevents duplicate retries).
 */

import { PrismaClient } from '@prisma/client';
import { normalizeEmail, maskEmail } from '../api/newsletter.js';
import { isBrevoEmailSendingEnabled, sendWelcomeEmail } from '../api/_utils/brevo.js';

export const EXPECTED_TEST_HOST = 'ep-withered-mouse-b3yy3xg0.c-4.ap-southeast-1.aws.neon.tech';

function validateDatabaseGuard(): void {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl || !dbUrl.trim()) {
    console.error('❌ [GUARD_FAILED] DATABASE_URL is not set.');
    console.error('   Execution aborted before any database connection.');
    process.exit(1);
  }

  try {
    const parsed = new URL(dbUrl);
    if (parsed.hostname !== EXPECTED_TEST_HOST) {
      console.error('❌ [GUARD_FAILED] DATABASE_URL hostname does not match the isolated test branch.');
      console.error(`   Expected host: ${EXPECTED_TEST_HOST}`);
      console.error(`   Actual host:   ${parsed.hostname || 'unknown'}`);
      console.error('   Execution aborted to protect other environments.');
      process.exit(1);
    }
  } catch {
    console.error('❌ [GUARD_FAILED] DATABASE_URL is malformed. Execution aborted.');
    process.exit(1);
  }
}

async function main() {
  console.log('====================================================================');
  console.log('ONE-TIME WELCOME-EMAIL TEST RETRY (ISOLATED TEST BRANCH)');
  console.log('====================================================================\n');

  // 1. Verify Database Target
  validateDatabaseGuard();
  console.log(`✅ [GUARD_PASSED] Database URL host verified: ${EXPECTED_TEST_HOST}`);

  // 2. Verify Target Email
  const rawTargetEmail = process.env.TEST_SUBSCRIBER_EMAIL?.trim();
  if (!rawTargetEmail) {
    console.error('❌ [CONFIG_ERROR] TEST_SUBSCRIBER_EMAIL environment variable is required.');
    console.error('   Example: $env:TEST_SUBSCRIBER_EMAIL = "developer@alongkar.in"');
    process.exit(1);
  }

  const normalizedTarget = normalizeEmail(rawTargetEmail);
  const maskedTarget = maskEmail(normalizedTarget);
  console.log(`🎯 [TARGET] Verified subscriber email target: ${maskedTarget}`);

  // 3. Verify Brevo Configuration
  if (!isBrevoEmailSendingEnabled()) {
    console.error('❌ [BREVO_UNAVAILABLE] Brevo email sending is not enabled or credentials are missing.');
    console.error('   Ensure BREVO_ENABLE_WELCOME_EMAIL === "true", BREVO_API_KEY, and BREVO_SENDER_EMAIL are set.');
    process.exit(1);
  }
  console.log('✅ [BREVO_VERIFIED] Brevo configuration verified and enabled.');

  // 4. Initialize Database Client
  const prisma = new PrismaClient();

  try {
    // 5. Query Subscriber Record
    const subscriber = await prisma.newsletterSubscriber.findUnique({
      where: { email: normalizedTarget },
    });

    if (!subscriber) {
      console.error(`❌ [NOT_FOUND] No subscriber found matching email ${maskedTarget}.`);
      console.error('   Will not create a new record. Execution aborted.');
      process.exit(1);
    }

    console.log(`📋 [SUBSCRIBER_FOUND] ID: ${subscriber.id}`);
    console.log(`   Status:               ${subscriber.status}`);
    console.log(`   Welcome Email Status: ${subscriber.welcomeEmailStatus}`);

    if (subscriber.status !== 'SUBSCRIBED') {
      console.error(`❌ [INVALID_STATUS] Subscriber status is ${subscriber.status} (expected SUBSCRIBED). Aborting.`);
      process.exit(1);
    }

    if (subscriber.welcomeEmailStatus !== 'PENDING') {
      console.error(`❌ [STATE_GUARD] welcomeEmailStatus is '${subscriber.welcomeEmailStatus}' (expected PENDING).`);
      if (subscriber.welcomeEmailProviderId) {
        console.error(`   Record already contains Provider Message ID. Duplicate send strictly prevented.`);
      }
      process.exit(1);
    }

    if (subscriber.welcomeEmailProviderId) {
      console.error('❌ [STATE_GUARD] Record already has a welcomeEmailProviderId. Aborting.');
      process.exit(1);
    }

    // 6. Concurrency Protection: Atomic Transition PENDING -> SENDING
    console.log('\n🔒 Acquiring atomic SENDING lock in database...');
    const lockResult = await prisma.newsletterSubscriber.updateMany({
      where: {
        id: subscriber.id,
        welcomeEmailStatus: 'PENDING',
      },
      data: {
        welcomeEmailStatus: 'SENDING',
      },
    });

    if (lockResult.count !== 1) {
      console.error('❌ [LOCK_FAILED] Exactly 1 record was not transitioned to SENDING. Aborting without sending.');
      process.exit(1);
    }
    console.log('✅ [LOCK_ACQUIRED] Record transitioned to SENDING state.');

    // 7. Single Dispatch Attempt via Canonical Brevo Helper
    console.log(`\n📨 Dispatching welcome email via Brevo to ${maskedTarget}...`);
    let sendResult;
    try {
      sendResult = await sendWelcomeEmail(normalizedTarget, undefined, subscriber.id);
    } catch (dispatchErr: any) {
      console.error('❌ [DISPATCH_ERROR] Network or unexpected error calling Brevo API.');
      await prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { welcomeEmailStatus: 'FAILED' },
      }).catch(() => {});
      process.exit(1);
    }

    if (!sendResult.providerAccepted) {
      console.error(`❌ [BREVO_REJECTED] Brevo rejected email: ${sendResult.error || sendResult.skippedReason || 'Unknown error'}`);
      await prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: { welcomeEmailStatus: 'FAILED' },
      }).catch(() => {});
      process.exit(1);
    }

    const providerMessageId = sendResult.providerMessageId || 'unknown_message_id';
    console.log(`✅ [BREVO_ACCEPTED] Welcome email accepted by Brevo!`);
    console.log(`   Message ID: ${providerMessageId}`);

    // 8. In-place Lifecycle Update: Transition to SENT
    try {
      const updated = await prisma.newsletterSubscriber.update({
        where: { id: subscriber.id },
        data: {
          welcomeEmailStatus: 'SENT',
          welcomeEmailSentAt: new Date(),
          welcomeEmailProviderId: providerMessageId,
        },
      });

      console.log('\n====================================================================');
      console.log('🎉 [SUCCESS] TRANSACTION COMPLETE');
      console.log(`   Subscriber ID:       ${updated.id}`);
      console.log(`   Target Email:        ${maskedTarget}`);
      console.log(`   Final Status:        ${updated.welcomeEmailStatus}`);
      console.log(`   Sent At:             ${updated.welcomeEmailSentAt?.toISOString()}`);
      console.log(`   Provider Message ID: ${updated.welcomeEmailProviderId}`);
      console.log('====================================================================\n');
    } catch (dbErr: any) {
      console.error('\n⚠️ [CRITICAL_WARNING] Brevo accepted the email, but database update to SENT failed!');
      console.error(`   Provider Message ID: ${providerMessageId}`);
      console.error('   DO NOT RETRY AUTOMATICALLY. The email has already been accepted and dispatched by Brevo.');
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Only execute when run directly from command line
if (process.argv[1]?.includes('retry-test-welcome-email')) {
  main().catch((err) => {
    console.error('❌ [FATAL_ERROR]', err?.message || err);
    process.exit(1);
  });
}
