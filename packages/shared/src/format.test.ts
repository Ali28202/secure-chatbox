import { describe, expect, it } from 'vitest';
import {
  formatChatTimestamp,
  formatDayDivider,
  formatFileSize,
  formatMessageTime,
  isSameDay,
  normalizePhoneNumber,
  toLatinDigits,
  toPersianDigits,
} from './format';

/**
 * What these tests are for, and what they deliberately leave alone.
 *
 * `Intl` produces the actual Persian text, and re-asserting its output would
 * only pin this suite to one ICU version — «۱۴ مرداد» is not ours to guarantee.
 * What *is* ours is the branch selection: which of the five shapes a timestamp
 * gets, and where each boundary sits. So the expectations below compare against
 * formatters built here from the same options, which fails when the wrong branch
 * is taken and stays quiet when ICU changes its mind about a month name.
 *
 * Every date is built with the local-time `Date` constructor rather than an ISO
 * string, because the day boundaries in `format.ts` are local ones — a UTC
 * literal would put this suite in a different day from the code under test for
 * anyone running it outside Tehran.
 */

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

/** Mid-afternoon, so "earlier today" has room on both sides of it. */
const now = new Date(2026, 7, 11, 15, 30, 0);
const ago = (ms: number) => new Date(now.getTime() - ms);

describe('toPersianDigits', () => {
  it('rewrites every ASCII digit', () => {
    expect(toPersianDigits('0123456789')).toBe('۰۱۲۳۴۵۶۷۸۹');
  });

  it('accepts a number as readily as a string', () => {
    expect(toPersianDigits(4000)).toBe('۴۰۰۰');
  });

  it('leaves the Persian around the number untouched', () => {
    expect(toPersianDigits('دست‌کم 8 نویسه')).toBe('دست‌کم ۸ نویسه');
  });

  it('is presentation only — the result no longer parses', () => {
    // Documented in `format.ts`; asserted here so nobody is tempted to run a
    // validated numeric field through it on the way into the API.
    expect(Number(toPersianDigits(8))).toBeNaN();
  });
});

describe('toLatinDigits', () => {
  it('folds Persian digits back to ASCII', () => {
    expect(toLatinDigits('۰۹۱۲۱۱۱۰۰۰۱')).toBe('09121110001');
  });

  it('folds Arabic-Indic digits too', () => {
    // A different Unicode block from the Persian one (U+0660 vs U+06F0), and
    // the set an Arabic keyboard layout produces. Both reach Iranian users.
    expect(toLatinDigits('٠٩١٢')).toBe('0912');
  });

  it('is the exact inverse of toPersianDigits', () => {
    expect(toLatinDigits(toPersianDigits('0123456789'))).toBe('0123456789');
  });

  it('leaves everything that is not a digit alone', () => {
    expect(toLatinDigits('شمارهٔ ۰۹۱۲ است')).toBe('شمارهٔ 0912 است');
  });
});

describe('normalizePhoneNumber', () => {
  it.each([
    '09121110001',
    '0912 111 0001',
    '0912-111-0001',
    '+989121110001',
    '00989121110001',
    '989121110001',
    '9121110001',
    '۰۹۱۲۱۱۱۰۰۰۱',
    '٠٩١٢١١١٠٠٠١',
  ])('reduces %s to one canonical form', (input) => {
    // Every spelling one number has in the wild has to land on the same string,
    // because the column is unique and a second spelling would be a second row.
    expect(normalizePhoneNumber(input)).toBe('09121110001');
  });

  it('does not invent a country code for numbers that only start like one', () => {
    // `98…` is a country code when a whole mobile number follows it and nothing
    // else. A short id beginning 98 is an id, and must survive intact for the
    // login lookup to still match it against `universityId`.
    expect(normalizePhoneNumber('98123')).toBe('98123');
    expect(normalizePhoneNumber('9812345')).toBe('9812345');
  });

  it('passes a university id straight through', () => {
    // The login field takes either identifier, so this runs on student numbers
    // as often as on phone numbers.
    expect(normalizePhoneNumber('40012301')).toBe('40012301');
  });

  it('returns the trimmed input when there are no digits at all', () => {
    // Nothing sensible to normalise. Returning `''` would turn a typo into a
    // lookup for the empty string, which is a value a column could hold.
    expect(normalizePhoneNumber('  hello  ')).toBe('hello');
  });
});

describe('formatChatTimestamp', () => {
  it('says "just now" for anything under a minute', () => {
    expect(formatChatTimestamp(ago(0), now)).toBe(relativeTime.format(0, 'second'));
    expect(formatChatTimestamp(ago(59_000), now)).toBe(relativeTime.format(0, 'second'));
  });

  it('says "just now" for a future timestamp rather than counting forward', () => {
    // The API host and a student's laptop are two clocks on one LAN; a few
    // seconds of skew should not produce «در ۲ ثانیه» in the sidebar.
    expect(formatChatTimestamp(new Date(now.getTime() + 5_000), now)).toBe(
      relativeTime.format(0, 'second')
    );
  });

  it('counts minutes for the rest of the hour', () => {
    expect(formatChatTimestamp(ago(MINUTE), now)).toBe(relativeTime.format(-1, 'minute'));
    expect(formatChatTimestamp(ago(45 * MINUTE), now)).toBe(relativeTime.format(-45, 'minute'));
  });

  it('switches to a clock time once past an hour, for the rest of today', () => {
    const earlier = ago(3 * HOUR);
    expect(formatChatTimestamp(earlier, now)).toBe(timeOfDay.format(earlier));
  });

  it('uses the calendar day, not a 24-hour window, to decide "today"', () => {
    // 00:05 today is over an hour ago but is still today; yesterday at 23:55 is
    // only a few hours further back and must not be.
    const earlyToday = new Date(2026, 7, 11, 0, 5);
    const lateYesterday = new Date(2026, 7, 10, 23, 55);

    expect(formatChatTimestamp(earlyToday, now)).toBe(timeOfDay.format(earlyToday));
    expect(formatChatTimestamp(lateYesterday, now)).toBe(relativeTime.format(-1, 'day'));
  });

  it('names the weekday within the past week', () => {
    const midweek = ago(4 * DAY);
    expect(formatChatTimestamp(midweek, now)).toBe(weekday.format(midweek));
  });

  it('falls back to a Jalali date beyond a week', () => {
    const old = ago(30 * DAY);
    expect(formatChatTimestamp(old, now)).toBe(shortDate.format(old));
  });

  it('accepts the ISO strings the API actually sends', () => {
    const iso = ago(10 * MINUTE).toISOString();
    expect(formatChatTimestamp(iso, now)).toBe(relativeTime.format(-10, 'minute'));
  });
});

describe('formatMessageTime', () => {
  it('is always a clock, however old the message', () => {
    // Inside a conversation the times are read against each other, so a column
    // of drifting relative labels would defeat the purpose.
    const old = new Date(2020, 0, 1, 9, 5);
    expect(formatMessageTime(old)).toBe(timeOfDay.format(old));
  });
});

describe('formatDayDivider', () => {
  it('labels today and yesterday in words', () => {
    expect(formatDayDivider(new Date(2026, 7, 11, 0, 1), now)).toBe('امروز');
    expect(formatDayDivider(new Date(2026, 7, 10, 23, 59), now)).toBe('دیروز');
  });

  it('names the weekday within the week', () => {
    const midweek = ago(3 * DAY);
    expect(formatDayDivider(midweek, now)).toBe(weekday.format(midweek));
  });

  it('gives the full date with a year once the week is out', () => {
    const old = ago(60 * DAY);
    expect(formatDayDivider(old, now)).toBe(fullDate.format(old));
  });
});

describe('isSameDay', () => {
  it('compares calendar days, not elapsed time', () => {
    expect(isSameDay(new Date(2026, 7, 11, 0, 0), new Date(2026, 7, 11, 23, 59))).toBe(true);
    // Five minutes apart, two different days.
    expect(isSameDay(new Date(2026, 7, 11, 23, 58), new Date(2026, 7, 12, 0, 3))).toBe(false);
  });

  it('does not confuse the same day-of-month in different months or years', () => {
    expect(isSameDay(new Date(2026, 7, 11), new Date(2026, 8, 11))).toBe(false);
    expect(isSameDay(new Date(2025, 7, 11), new Date(2026, 7, 11))).toBe(false);
  });
});

describe('formatFileSize', () => {
  it('rounds bytes to whole things', () => {
    expect(formatFileSize(0)).toBe('۰ بایت');
    expect(formatFileSize(1)).toBe('۱ بایت');
    expect(formatFileSize(900)).toBe('۹۰۰ بایت');
  });

  it('steps in binary units, matching what the operating system shows', () => {
    expect(formatFileSize(1024)).toBe('۱ کیلوبایت');
    expect(formatFileSize(1024 * 1024)).toBe('۱ مگابایت');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('۱ گیگابایت');
  });

  it('keeps one decimal, with the Persian decimal separator', () => {
    // «۱٫۵», not «۱.۵» — a full stop reads as a thousands group in Persian.
    expect(formatFileSize(1.5 * 1024 * 1024)).toBe('۱٫۵ مگابایت');
  });

  it('stops at gigabytes rather than inventing a unit', () => {
    // Group separator left to `Intl` for the same reason as the dates above.
    const sizeNumber = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
    expect(formatFileSize(2048 * 1024 * 1024 * 1024)).toBe(`${sizeNumber.format(2048)} گیگابایت`);
  });

  it('treats a negative size as zero instead of formatting a minus', () => {
    expect(formatFileSize(-5)).toBe('۰ بایت');
  });
});
