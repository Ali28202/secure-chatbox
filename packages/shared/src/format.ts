// A string rather than an array so `charAt` can do the lookup: indexing an
// array under `noUncheckedIndexedAccess` yields `string | undefined`, and the
// regex below already guarantees the index is 0–9.
const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

/**
 * Rewrites ASCII digits as Persian ones.
 *
 * Needed wherever a number is interpolated into Persian prose — a validation
 * message reading «دست‌کم 8 نویسه» mixes two numeral systems in one sentence,
 * which looks like a bug to a Persian reader even though the digit is correct.
 *
 * Presentation only. Never apply it to a value that will be parsed again:
 * `Number('۸')` is `NaN`.
 */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS.charAt(Number(digit)));
}

const relativeTime = new Intl.RelativeTimeFormat('fa', { numeric: 'auto' });
const timeOfDay = new Intl.DateTimeFormat('fa-IR', { hour: '2-digit', minute: '2-digit' });
const weekday = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' });
const shortDate = new Intl.DateTimeFormat('fa-IR', { day: 'numeric', month: 'long' });
const fullDate = new Intl.DateTimeFormat('fa-IR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * The timestamp beside a chat in the list, and above a run of messages.
 *
 * Precision falls off with age, the way every messenger does it: minutes ago
 * while a conversation is live, a clock time for the rest of today, a weekday
 * name for this week, and a date beyond that. Nobody scanning a sidebar needs
 * to know that something happened «۴ روز و ۳ ساعت پیش».
 *
 * `Intl` with the `fa` locale gives Persian numerals and the Jalali calendar
 * for free — «۱۴ مرداد», not «August 5» — so nothing here formats by hand.
 */
export function formatChatTimestamp(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const elapsed = now.getTime() - date.getTime();

  // A clock skew between the API host and this browser can put a timestamp
  // slightly in the future; treating that as "just now" beats «در ۲ ثانیه».
  if (elapsed < MINUTE) return relativeTime.format(0, 'second');
  if (elapsed < HOUR) return relativeTime.format(-Math.floor(elapsed / MINUTE), 'minute');

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) return timeOfDay.format(date);

  if (elapsed < 2 * DAY) return relativeTime.format(-1, 'day');
  if (elapsed < 7 * DAY) return weekday.format(date);

  return shortDate.format(date);
}

/**
 * The clock time under a message bubble.
 *
 * Always the clock, never "۵ دقیقه پیش": inside a conversation the times are
 * read against each other — how long someone waited before answering — and a
 * column of relative labels that all drift as you read makes that impossible.
 */
export function formatMessageTime(value: string | Date): string {
  return timeOfDay.format(typeof value === 'string' ? new Date(value) : value);
}

/**
 * The divider between days in a message list: «امروز», «دیروز», a weekday name
 * within the week, then the full Jalali date.
 */
export function formatDayDivider(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (date >= startOfToday) return 'امروز';

  const startOfYesterday = new Date(startOfToday.getTime() - DAY);
  if (date >= startOfYesterday) return 'دیروز';

  if (now.getTime() - date.getTime() < 7 * DAY) return weekday.format(date);

  return fullDate.format(date);
}

/** Whether two timestamps fall on the same calendar day, for the divider above. */
export function isSameDay(a: string | Date, b: string | Date): boolean {
  const left = typeof a === 'string' ? new Date(a) : a;
  const right = typeof b === 'string' ? new Date(b) : b;

  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}
