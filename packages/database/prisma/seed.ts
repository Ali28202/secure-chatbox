import { prisma, type ChatRole, type ChatType, type GlobalRole } from '../src/index.ts';

/**
 * Development seed — a small university's worth of data, so that opening the app
 * on a fresh database shows a working platform instead of an empty sidebar.
 *
 * It covers every table the application writes except `attachments`, and the
 * exception is deliberate: attachment rows are pointers into an S3 bucket, and a
 * row whose object does not exist is worse than no row at all — the file appears
 * in the conversation and fails when anyone clicks it. Send one through the UI
 * to get a real pair.
 *
 * Idempotent, and that is what the fixed ids below are for. Users are keyed by
 * `universityId`, everything else by an id written into this file, so running it
 * a second time updates the same rows rather than producing a second copy of the
 * whole roster. Re-seeding is therefore a way to *reset* the demo data to a known
 * state — a message you deleted while testing comes back.
 *
 * Two things are never overwritten: `passwordHash`, so re-seeding does not reset
 * a password someone changed, and `createdAt` on messages, so the conversation
 * keeps the shape it was first given instead of collapsing to "all sent now".
 */

/**
 * Shared by every seeded account. This is the entire reason the script refuses
 * to run with NODE_ENV=production below — a known password on a real professor
 * account is worse than no seed at all.
 */
const DEV_PASSWORD = 'Chatbox@1404';

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Chats
// ---------------------------------------------------------------------------

/**
 * Fixed ids, not `uuid(7)` defaults.
 *
 * The id column is TEXT, so any stable string would do; these keep the UUIDv7
 * shape so seeded rows sort beside generated ones instead of ahead of or behind
 * every one of them. The readable tail is what makes a row recognisable in
 * Studio or in a psql session.
 */
const CHAT_IDS = {
  netSecurity: '01990000-0000-7000-8000-00000000c001',
  databases: '01990000-0000-7000-8000-00000000c002',
  announcements: '01990000-0000-7000-8000-00000000c003',
  finalProject: '01990000-0000-7000-8000-00000000c004',
  aliToProfessor: '01990000-0000-7000-8000-00000000c005',
  saraToMohammad: '01990000-0000-7000-8000-00000000c006',
} as const;

interface SeedMember {
  /** A `universityId` from USERS above. */
  user: string;
  role?: ChatRole;
  isMuted?: boolean;
}

interface SeedChat {
  id: string;
  /** Null for DIRECT chats, whose title is derived from the other member. */
  title: string | null;
  type: ChatType;
  isReadOnly?: boolean;
  /** A `universityId`. Must also appear in `members` — the API always adds it. */
  creator: string;
  members: SeedMember[];
}

/**
 * Six conversations chosen to cover the shapes the UI has to draw, not just to
 * fill the sidebar: a normal course group, a muted member, a read-only
 * announcement channel, a student-run group, and two direct chats.
 *
 * Every one of them satisfies `canCreateChat` in @repo/shared — COURSE_GROUPs
 * are created by faculty, and the creator is an ADMIN of their own chat. Seeding
 * a row the policy would have refused would mean testing against a state the
 * application cannot produce.
 */
const CHATS: SeedChat[] = [
  {
    id: CHAT_IDS.netSecurity,
    title: 'امنیت شبکه — نیمسال دوم ۱۴۰۴',
    type: 'COURSE_GROUP',
    creator: '900101',
    members: [
      { user: '900101', role: 'ADMIN' },
      { user: '40012301' },
      { user: '40012302' },
      { user: '40012303' },
      // Muted, so the disabled composer and its explanation are visible without
      // anyone having to set it up by hand. Log in as نگین صادقی to see it.
      { user: '40012304', isMuted: true },
    ],
  },
  {
    id: CHAT_IDS.databases,
    title: 'پایگاه داده — نیمسال دوم ۱۴۰۴',
    type: 'COURSE_GROUP',
    creator: '900102',
    members: [
      { user: '900102', role: 'ADMIN' },
      { user: '40012301' },
      { user: '40012302' },
      { user: '40012303' },
    ],
  },
  {
    id: CHAT_IDS.announcements,
    title: 'اطلاعیه‌های دانشکده',
    type: 'COURSE_GROUP',
    // Only chat ADMINs may write here. The two professors are admins so they can
    // post; the students read.
    isReadOnly: true,
    creator: 'admin',
    members: [
      { user: 'admin', role: 'ADMIN' },
      { user: '900101', role: 'ADMIN' },
      { user: '900102', role: 'ADMIN' },
      { user: '40012301' },
      { user: '40012302' },
      { user: '40012303' },
      { user: '40012304' },
    ],
  },
  {
    id: CHAT_IDS.finalProject,
    title: 'پروژهٔ پایانی — گروه ۳',
    // A student organising their own group is the platform working as intended;
    // `canCreateChat` only restricts COURSE_GROUP.
    type: 'CUSTOM_GROUP',
    creator: '40012301',
    members: [{ user: '40012301', role: 'ADMIN' }, { user: '40012302' }, { user: '40012303' }],
  },
  {
    id: CHAT_IDS.aliToProfessor,
    title: null,
    type: 'DIRECT',
    creator: '40012301',
    // Both ADMIN, matching `createDirectChat`: there is no hierarchy in a
    // conversation between two people, and no member to administer.
    members: [
      { user: '40012301', role: 'ADMIN' },
      { user: '900101', role: 'ADMIN' },
    ],
  },
  {
    id: CHAT_IDS.saraToMohammad,
    title: null,
    type: 'DIRECT',
    creator: '40012302',
    members: [
      { user: '40012302', role: 'ADMIN' },
      { user: '40012303', role: 'ADMIN' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

interface SeedMessage {
  id: string;
  /** A value from CHAT_IDS. */
  chat: string;
  /** A `universityId`. Must be a member of `chat`, and able to write in it. */
  sender: string;
  /** Null only on a soft-deleted message, which keeps its row for reply chains. */
  content: string | null;
  /** Written into `createdAt` on insert only, so re-seeding does not reshuffle. */
  minutesAgo: number;
  /** An id from earlier in this list. Order matters: the target must exist. */
  replyTo?: string;
  isPinned?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  /**
   * `universityId`s that have read it. Everyone else in the chat gets a
   * DELIVERED receipt, which is what puts an unread badge on the sidebar — so
   * leaving the most recent messages out of this list is what makes the badges
   * appear at all.
   */
  readBy?: string[];
}

const MESSAGE_ID = (n: number): string => `01990000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const DAY = 60 * 24;

/**
 * Ordered oldest first, and a reply always follows what it replies to — the
 * upserts run in this order and `reply_to_id` is a foreign key.
 */
const MESSAGES: SeedMessage[] = [
  // --- امنیت شبکه ---------------------------------------------------------
  {
    id: MESSAGE_ID(101),
    chat: CHAT_IDS.netSecurity,
    sender: '900101',
    content: 'سلام به همه. جلسهٔ اول درس، دوشنبه ساعت ۱۰ در کلاس ۲۰۵ برگزار می‌شود.',
    minutesAgo: 4 * DAY,
    isPinned: true,
    readBy: ['40012301', '40012302', '40012303', '40012304'],
  },
  {
    id: MESSAGE_ID(102),
    chat: CHAT_IDS.netSecurity,
    sender: '900101',
    content: 'سرفصل درس و منابع را تا آخر هفته در همین گروه می‌گذارم.',
    minutesAgo: 4 * DAY - 20,
    readBy: ['40012301', '40012302', '40012303'],
  },
  {
    id: MESSAGE_ID(103),
    chat: CHAT_IDS.netSecurity,
    sender: '40012301',
    content: 'سلام استاد. منبع اصلی درس همان کتاب استالینگز است؟',
    minutesAgo: 3 * DAY,
    replyTo: MESSAGE_ID(102),
    readBy: ['900101', '40012302', '40012303'],
  },
  {
    id: MESSAGE_ID(104),
    chat: CHAT_IDS.netSecurity,
    sender: '900101',
    content: 'بله، ویرایش هشتم. فصل‌های ۱ تا ۴ برای میان‌ترم کافی است.',
    minutesAgo: 3 * DAY - 45,
    replyTo: MESSAGE_ID(103),
    // Edited, so the «ویرایش‌شده» marker has something to render.
    isEdited: true,
    readBy: ['40012301', '40012302'],
  },
  {
    id: MESSAGE_ID(105),
    chat: CHAT_IDS.netSecurity,
    sender: '40012303',
    // Soft-deleted: the row survives so that anything replying to it still has a
    // target, and the UI shows «این پیام حذف شده است» in its place.
    content: null,
    isDeleted: true,
    minutesAgo: 2 * DAY,
  },
  {
    id: MESSAGE_ID(106),
    chat: CHAT_IDS.netSecurity,
    sender: '900101',
    content: 'تمرین اول بارگذاری شد. مهلت ارسال تا پایان همین هفته است.',
    minutesAgo: 90,
    // Nobody has read this one — every student gets an unread badge.
  },

  // --- پایگاه داده --------------------------------------------------------
  {
    id: MESSAGE_ID(201),
    chat: CHAT_IDS.databases,
    sender: '900102',
    content: 'برای جلسهٔ آینده فصل سوم را مطالعه کنید؛ سر کلاس دربارهٔ نرمال‌سازی بحث می‌کنیم.',
    minutesAgo: 5 * DAY,
    isPinned: true,
    readBy: ['40012301', '40012302', '40012303'],
  },
  {
    id: MESSAGE_ID(202),
    chat: CHAT_IDS.databases,
    sender: '40012302',
    content: 'استاد، تمرین سری دوم تا چه تاریخی فرصت داریم؟',
    minutesAgo: 2 * DAY,
    readBy: ['900102', '40012301'],
  },
  {
    id: MESSAGE_ID(203),
    chat: CHAT_IDS.databases,
    sender: '900102',
    content: 'تا جمعه شب. بعد از آن سامانه ارسال را نمی‌پذیرد.',
    minutesAgo: 2 * DAY - 30,
    replyTo: MESSAGE_ID(202),
    readBy: ['40012302'],
  },

  // --- اطلاعیه‌های دانشکده (فقط‌خواندنی) ----------------------------------
  {
    id: MESSAGE_ID(301),
    chat: CHAT_IDS.announcements,
    sender: 'admin',
    content: 'ثبت‌نام نیمسال دوم ۱۴۰۴–۱۴۰۵ از روز شنبه آغاز می‌شود.',
    minutesAgo: 6 * DAY,
    isPinned: true,
    readBy: ['900101', '900102', '40012301', '40012302', '40012303'],
  },
  {
    id: MESSAGE_ID(302),
    chat: CHAT_IDS.announcements,
    sender: '900101',
    content: 'کلاس امنیت شبکهٔ روز چهارشنبه به هفتهٔ بعد موکول شد.',
    minutesAgo: 26 * 60,
    readBy: ['40012301'],
  },

  // --- پروژهٔ پایانی ------------------------------------------------------
  {
    id: MESSAGE_ID(401),
    chat: CHAT_IDS.finalProject,
    sender: '40012301',
    content: 'بچه‌ها، بخش اول مستندات را نوشتم. فردا برایتان می‌فرستم.',
    minutesAgo: 3 * DAY,
    readBy: ['40012302', '40012303'],
  },
  {
    id: MESSAGE_ID(402),
    chat: CHAT_IDS.finalProject,
    sender: '40012302',
    content: 'عالیه. من نمودار ERD را تا آخر هفته آماده می‌کنم.',
    minutesAgo: 3 * DAY - 15,
    replyTo: MESSAGE_ID(401),
    readBy: ['40012301'],
  },
  {
    id: MESSAGE_ID(403),
    chat: CHAT_IDS.finalProject,
    sender: '40012303',
    content: 'منم بخش تست‌ها را برمی‌دارم.',
    minutesAgo: 40,
  },

  // --- گفت‌وگوی مستقیم: علی ↔ دکتر آقایی ----------------------------------
  {
    id: MESSAGE_ID(501),
    chat: CHAT_IDS.aliToProfessor,
    sender: '40012301',
    content: 'سلام استاد، وقت بخیر. برای موضوع پروژهٔ پایانی می‌توانم فردا خدمتتان برسم؟',
    minutesAgo: 8 * 60,
    readBy: ['900101'],
  },
  {
    id: MESSAGE_ID(502),
    chat: CHAT_IDS.aliToProfessor,
    sender: '900101',
    content: 'سلام. فردا ساعت ۱۴ در دفترم باشید.',
    minutesAgo: 7 * 60,
    replyTo: MESSAGE_ID(501),
  },

  // --- گفت‌وگوی مستقیم: سارا ↔ محمد ---------------------------------------
  {
    id: MESSAGE_ID(601),
    chat: CHAT_IDS.saraToMohammad,
    sender: '40012302',
    content: 'جزوهٔ جلسهٔ قبل را داری؟',
    minutesAgo: 5 * 60,
    readBy: ['40012303'],
  },
  {
    id: MESSAGE_ID(602),
    chat: CHAT_IDS.saraToMohammad,
    sender: '40012303',
    content: 'آره، الان می‌فرستم.',
    minutesAgo: 4 * 60 + 50,
    readBy: ['40012302'],
  },
];

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

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

  const userIds = new Map<string, string>();

  for (const user of USERS) {
    const { id } = await prisma.user.upsert({
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

    userIds.set(user.universityId, id);
  }

  /** A seeded user's real id, or a loud failure — a typo above must not pass. */
  const idOf = (universityId: string): string => {
    const id = userIds.get(universityId);
    if (!id) throw new Error(`seed: no user with universityId "${universityId}"`);
    return id;
  };

  // Members are needed twice — once to write `chat_members`, once to work out
  // who each message needs a receipt for — so the roster is kept as it is built.
  const membersOf = new Map<string, string[]>();

  for (const chat of CHATS) {
    if (!chat.members.some((member) => member.user === chat.creator)) {
      throw new Error(`seed: creator "${chat.creator}" is not a member of chat "${chat.id}"`);
    }

    const data = {
      title: chat.title,
      type: chat.type,
      isReadOnly: chat.isReadOnly ?? false,
      creatorId: idOf(chat.creator),
    };

    await prisma.chat.upsert({
      where: { id: chat.id },
      update: data,
      create: { id: chat.id, ...data },
      select: { id: true },
    });

    for (const member of chat.members) {
      const memberData = { role: member.role ?? 'MEMBER', isMuted: member.isMuted ?? false };

      await prisma.chatMember.upsert({
        where: { userId_chatId: { userId: idOf(member.user), chatId: chat.id } },
        update: memberData,
        create: { chatId: chat.id, userId: idOf(member.user), ...memberData },
        select: { userId: true },
      });
    }

    membersOf.set(
      chat.id,
      chat.members.map((member) => member.user)
    );
  }

  for (const message of MESSAGES) {
    const members = membersOf.get(message.chat);
    if (!members) throw new Error(`seed: message "${message.id}" belongs to no seeded chat`);
    if (!members.includes(message.sender)) {
      throw new Error(`seed: "${message.sender}" is not a member of chat "${message.chat}"`);
    }

    for (const reader of message.readBy ?? []) {
      if (!members.includes(reader) || reader === message.sender) {
        throw new Error(`seed: "${reader}" cannot have read message "${message.id}"`);
      }
    }

    // `createdAt` is set on insert only. Re-seeding an existing conversation
    // must not slide every message forward to the moment of the re-run.
    const data = {
      content: message.content,
      isPinned: message.isPinned ?? false,
      isEdited: message.isEdited ?? false,
      isDeleted: message.isDeleted ?? false,
    };

    await prisma.message.upsert({
      where: { id: message.id },
      update: data,
      create: {
        id: message.id,
        chatId: message.chat,
        senderId: idOf(message.sender),
        replyToId: message.replyTo,
        createdAt: minutesAgo(message.minutesAgo),
        ...data,
      },
      select: { id: true },
    });

    // One receipt per member except the author, exactly as `createDeliveredReceipts`
    // writes them: writing your own message is not reading it, and a row for the
    // author would need clearing on every send.
    for (const member of members) {
      if (member === message.sender) continue;

      const hasRead = message.readBy?.includes(member) ?? false;
      const status = hasRead ? 'READ' : 'DELIVERED';

      await prisma.messageReceipt.upsert({
        where: { messageId_userId: { messageId: message.id, userId: idOf(member) } },
        update: { status },
        create: { messageId: message.id, userId: idOf(member), status },
        select: { userId: true },
      });
    }
  }

  // Read back rather than computed from `minutesAgo`, so the denormalized column
  // agrees with the rows that are actually in the table — including on a re-run,
  // where the messages kept their original timestamps.
  const latest = await prisma.message.groupBy({
    by: ['chatId'],
    where: { chatId: { in: CHATS.map((chat) => chat.id) } },
    _max: { createdAt: true },
  });

  for (const row of latest) {
    await prisma.chat.update({
      where: { id: row.chatId },
      data: { lastMessageAt: row._max.createdAt },
      select: { id: true },
    });
  }

  const receipts = MESSAGES.reduce(
    (total, message) => total + ((membersOf.get(message.chat)?.length ?? 1) - 1),
    0
  );

  console.info(`✔ ${USERS.length} کاربر ثبت شد. گذرواژهٔ همه: ${DEV_PASSWORD}`);
  for (const user of USERS) {
    console.info(
      `  ${user.role.padEnd(9)} ${user.universityId.padEnd(10)} ${user.phoneNumber}  ${user.name}`
    );
  }

  console.info(`✔ ${CHATS.length} گفت‌وگو، ${MESSAGES.length} پیام و ${receipts} رسید ثبت شد.`);
  for (const chat of CHATS) {
    const count = MESSAGES.filter((message) => message.chat === chat.id).length;
    console.info(
      `  ${chat.type.padEnd(12)} ${String(chat.members.length).padStart(2)} عضو  ` +
        `${String(count).padStart(2)} پیام  ${chat.title ?? '— گفت‌وگوی مستقیم'}`
    );
  }
  console.info('  پیوست‌ها seed نمی‌شوند؛ فایل‌ها در باکت S3 هستند و ردیف بدون فایل خراب است.');
}

try {
  await main();
} catch (error) {
  console.error('✖ seed failed:', error);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
