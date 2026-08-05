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
