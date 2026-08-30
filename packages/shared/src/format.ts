const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

export function toPersianDigits(value: string | number): string {
  return String(value).replace(/\d/g, (digit) => PERSIAN_DIGITS.charAt(Number(digit)));
}

export function toLatinDigits(value: string): string {
  return value.replace(/[۰-۹٠-٩]/g, (digit) => {
    const code = digit.codePointAt(0) ?? 0;
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660);
  });
}

export function normalizePhoneNumber(value: string): string {
  const digits = toLatinDigits(value).replace(/\D/g, '').replace(/^00/, '');

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

export function formatChatTimestamp(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const elapsed = now.getTime() - date.getTime();

  if (elapsed < MINUTE) return relativeTime.format(0, 'second');
  if (elapsed < HOUR) return relativeTime.format(-Math.floor(elapsed / MINUTE), 'minute');

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (date >= startOfToday) return timeOfDay.format(date);

  if (elapsed < 2 * DAY) return relativeTime.format(-1, 'day');
  if (elapsed < 7 * DAY) return weekday.format(date);

  return shortDate.format(date);
}

export function formatMessageTime(value: string | Date): string {
  return timeOfDay.format(typeof value === 'string' ? new Date(value) : value);
}

export function formatDayDivider(value: string | Date, now: Date = new Date()): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (date >= startOfToday) return 'امروز';

  const startOfYesterday = new Date(startOfToday.getTime() - DAY);
  if (date >= startOfYesterday) return 'دیروز';

  if (now.getTime() - date.getTime() < 7 * DAY) return weekday.format(date);

  return fullDate.format(date);
}

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

const sizeNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });

export function formatFileSize(bytes: number): string {
  let value = Math.max(0, bytes);
  let unit = 0;

  while (value >= 1024 && unit < FILE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }

  return `${sizeNumber.format(unit === 0 ? Math.round(value) : value)} ${FILE_UNITS[unit]}`;
}
