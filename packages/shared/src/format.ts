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
