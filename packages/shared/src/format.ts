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

/**
 * Rewrites Persian and Arabic-Indic digits as ASCII ones.
 *
 * The inverse of the above, and the one that has to run on *input*. A Persian
 * keyboard produces «۰۹۱۲…» for a phone number, which is the same number and a
 * completely different string — without this, a user who typed their number the
 * way their keyboard offers it could never log in with it.
 *
 * Both ranges are folded because Arabic-Indic digits (٠١٢…) arrive from some
 * Android keyboards and are visually near-identical to the Persian ones.
 */
export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

/**
 * An Iranian mobile number reduced to the one form that gets stored: `09` and
 * nine digits.
 *
 * People write the same number half a dozen ways — `+98 912 …`, `0098912…`,
 * `912…`, with spaces or dashes — and every one of them has to resolve to the
 * same row, because the column is unique and it is a login identifier. Anything
 * that does not reduce to a plausible mobile number is returned trimmed and
 * unchanged, so the schema is what rejects it and the message says why.
 */
export function normalizePhoneNumber(value: string): string {
  // The `00` is the international-access prefix people dial instead of `+`; it
  // is dropped first so both spellings reach the country-code branch below.
  const digits = toLatinDigits(value).replace(/\D/g, '').replace(/^00/, '');

  // `98…` is only a country code when what follows is a full mobile number, so
  // the branches are ordered longest-prefix-first and each one checks the total
  // length rather than the prefix alone.
  if (digits.length === 12 && digits.startsWith('989')) return `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`;

  return digits.length > 0 ? digits : value.trim();
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

const FILE_UNITS = ['بایت', 'کیلوبایت', 'مگابایت', 'گیگابایت'] as const;

// Not `toPersianDigits`: a size wants one decimal place, and Persian writes the
// decimal separator as «٫» rather than a full stop. `Intl` knows that; a
// digit-for-digit substitution would produce «۱.۵», which reads as a thousands
// group to the audience this app is written for.
const sizeNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

/**
 * A byte count as something a person can read: «۱٫۴ مگابایت».
 *
 * Binary steps of 1024, matching what every operating system shows next to the
 * same file — a size that disagrees with the one in the download folder looks
 * wrong even when it is arguably more correct.
 */
export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= 1024 && unit < FILE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  // Bytes are whole things; a «۹۰۰٫۳ بایت» would be nonsense.
  return `${sizeNumber.format(unit === 0 ? Math.round(value) : value)} ${FILE_UNITS[unit]}`;
}
