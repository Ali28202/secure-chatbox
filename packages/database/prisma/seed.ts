import { prisma, type GlobalRole } from '../src/index.ts';

/**
 * Development seed — a small, realistic roster so the UI has something to show
 * before chats and messages exist.
 *
 * Idempotent: every user is upserted by `universityId`, so running it twice
 * changes nothing. `passwordHash` is only written on insert, so re-seeding
 * never resets a password someone has since changed.
 */

/**
 * Shared by every seeded account. This is the entire reason the script refuses
 * to run with NODE_ENV=production below — a known password on a real professor
 * account is worse than no seed at all.
 */
const DEV_PASSWORD = 'Chatbox@1404';

interface SeedUser {
  universityId: string;
  /**
   * The other way in. Stored in the canonical `09…` form these literals are
   * already written in — `normalizePhoneNumber` in `@repo/shared` is what puts
   * anything a person types into this shape before it is looked up.
   */
  phoneNumber: string;
  name: string;
  role: GlobalRole;
}

const USERS: SeedUser[] = [
  { universityId: 'admin', phoneNumber: '09120000000', name: 'مدیر سامانه', role: 'ADMIN' },

  {
    universityId: '900101',
    phoneNumber: '09121110001',
    name: 'دکتر مجید آقایی',
    role: 'PROFESSOR',
  },
  {
    universityId: '900102',
    phoneNumber: '09121110002',
    name: 'دکتر زهرا رضایی',
    role: 'PROFESSOR',
  },

  { universityId: '40012301', phoneNumber: '09351230001', name: 'علی محلاتی', role: 'STUDENT' },
  { universityId: '40012302', phoneNumber: '09351230002', name: 'سارا کریمی', role: 'STUDENT' },
  { universityId: '40012303', phoneNumber: '09351230003', name: 'محمد حسینی', role: 'STUDENT' },
  { universityId: '40012304', phoneNumber: '09351230004', name: 'نگین صادقی', role: 'STUDENT' },
];

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('✖ اجرای seed در محیط production مجاز نیست.');
    console.error('  Refusing to seed a production database with known passwords.');
    process.exit(1);
  }

  // Hashed once and shared across the rows. They all carry the same password,
  // so identical hashes give away nothing that the constant above doesn't —
  // and it saves ~50ms of argon2id per account. Real accounts never do this.
  const passwordHash = await Bun.password.hash(DEV_PASSWORD, 'argon2id');

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { universityId: user.universityId },
      // `deviceId` is deliberately not touched. Re-seeding is something you do
      // while the app is open in a browser, and resetting it there would sign
      // yourself out of the session you are testing with.
      update: {
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isActive: true,
      },
      create: { ...user, passwordHash },
      select: { id: true },
    });
  }

  console.info(`✔ ${USERS.length} کاربر ثبت شد. گذرواژهٔ همه: ${DEV_PASSWORD}`);
  for (const user of USERS) {
    console.info(
      `  ${user.role.padEnd(9)} ${user.universityId.padEnd(10)} ${user.phoneNumber}  ${user.name}`
    );
  }
}

try {
  await main();
} catch (error) {
  console.error('✖ seed failed:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
