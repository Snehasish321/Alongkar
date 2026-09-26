import 'dotenv/config';
import { createClerkClient } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY || '';
const publishableKey =
  process.env.CLERK_PUBLISHABLE_KEY ||
  process.env.VITE_CLERK_PUBLISHABLE_KEY ||
  '';

if (!secretKey) {
  console.error('❌ Error: CLERK_SECRET_KEY is missing in environment variables (.env)');
  process.exit(1);
}

const clerk = createClerkClient({
  secretKey,
  publishableKey,
});

async function setAdmin() {
  const target = process.argv[2];

  if (!target) {
    console.log('Usage:');
    console.log('  node scripts/set-admin.js <clerk_user_id_or_email>');
    console.log('\nExample:');
    console.log('  node scripts/set-admin.js user_2XYZ123abc');
    console.log('  node scripts/set-admin.js admin@alongkar.com');
    process.exit(1);
  }

  console.log(`🔍 Searching for Clerk user: ${target}...`);

  let targetUserId = null;
  let targetUserEmail = null;

  if (target.startsWith('user_')) {
    try {
      const user = await clerk.users.getUser(target);
      targetUserId = user.id;
      targetUserEmail = user.emailAddresses?.[0]?.emailAddress || 'N/A';
    } catch (err) {
      console.error(`❌ User with ID "${target}" not found in Clerk.`);
      process.exit(1);
    }
  } else {
    try {
      const users = await clerk.users.getUserList({
        emailAddress: [target],
      });
      if (!users.data || users.data.length === 0) {
        console.error(`❌ No Clerk user found with email "${target}".`);
        process.exit(1);
      }
      targetUserId = users.data[0].id;
      targetUserEmail = users.data[0].emailAddresses?.[0]?.emailAddress || target;
    } catch (err) {
      console.error('❌ Error querying Clerk by email:', err);
      process.exit(1);
    }
  }

  console.log(`👤 Found user: ${targetUserId} (${targetUserEmail})`);
  console.log('⚡ Updating publicMetadata to assign { role: "admin" }...');

  await clerk.users.updateUserMetadata(targetUserId, {
    publicMetadata: {
      role: 'admin',
    },
  });

  console.log(`✅ Success: User ${targetUserId} (${targetUserEmail}) has been granted the "admin" role.`);
}

setAdmin().catch((err) => {
  console.error('❌ Failed to assign admin role:', err);
  process.exit(1);
});
