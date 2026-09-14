import { prisma, type ChatRole, type ChatType, type GlobalRole } from '../src/index.ts';

const DEV_PASSWORD = 'Chatbox@1404';

interface SeedUser {
  universityId: string;
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

const CHAT_IDS = {
  netSecurity: '01990000-0000-7000-8000-00000000c001',
  databases: '01990000-0000-7000-8000-00000000c002',
  announcements: '01990000-0000-7000-8000-00000000c003',
  finalProject: '01990000-0000-7000-8000-00000000c004',
  aliToProfessor: '01990000-0000-7000-8000-00000000c005',
  saraToMohammad: '01990000-0000-7000-8000-00000000c006',
} as const;

interface SeedMember {
  user: string;
  role?: ChatRole;
  isMuted?: boolean;
}

interface SeedChat {
  id: string;
  title: string | null;
  type: ChatType;
  isReadOnly?: boolean;
  creator: string;
  members: SeedMember[];
}

const CHATS: SeedChat[] = [
  {
    id: CHAT_IDS.netSecurity,
    title: 'امنیت شبکه — نیمسال دوم ۱۴۰۴',
    type: 'GROUP',
    creator: '900101',
    members: [
      { user: '900101', role: 'ADMIN' },
      { user: '40012301' },
      { user: '40012302' },
      { user: '40012303' },
      { user: '40012304', isMuted: true },
    ],
  },
  {
    id: CHAT_IDS.databases,
    title: 'پایگاه داده — نیمسال دوم ۱۴۰۴',
    type: 'GROUP',
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
    type: 'GROUP',
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
    type: 'GROUP',
    creator: '40012301',
    members: [{ user: '40012301', role: 'ADMIN' }, { user: '40012302' }, { user: '40012303' }],
  },
  {
    id: CHAT_IDS.aliToProfessor,
    title: null,
    type: 'DIRECT',
    creator: '40012301',
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
interface SeedMessage {
  id: string;
  chat: string;
  sender: string;
  content: string | null;
  minutesAgo: number;
  replyTo?: string;
  isPinned?: boolean;
  isEdited?: boolean;
  isDeleted?: boolean;
  readBy?: string[];
}

const MESSAGE_ID = (n: number): string => `01990000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const DAY = 60 * 24;

const MESSAGES: SeedMessage[] = [
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
    isEdited: true,
    readBy: ['40012301', '40012302'],
  },
  {
    id: MESSAGE_ID(105),
    chat: CHAT_IDS.netSecurity,
    sender: '40012303',
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
  },
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

function minutesAgo(minutes: number): Date {
  return new Date(Date.now() - minutes * 60_000);
}

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.error('✖ اجرای seed در محیط production مجاز نیست.');
    console.error('  Refusing to seed a production database with known passwords.');
    process.exit(1);
  }

  const passwordHash = await Bun.password.hash(DEV_PASSWORD, 'argon2id');

  const userIds = new Map<string, string>();

  for (const user of USERS) {
    const { id } = await prisma.user.upsert({
      where: { universityId: user.universityId },
      update: {
        name: user.name,
        role: user.role,
        phoneNumber: user.phoneNumber,
        isActive: true,
        status: 'APPROVED',
      },
      create: { ...user, passwordHash, status: 'APPROVED' },
      select: { id: true },
    });

    userIds.set(user.universityId, id);
  }

  const idOf = (universityId: string): string => {
    const id = userIds.get(universityId);
    if (!id) throw new Error(`seed: no user with universityId "${universityId}"`);
    return id;
  };

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
