import type { GlobalRole } from '@repo/shared';

/**
 * Persian names for the role codes. The codes themselves stay English so logs
 * and `switch` statements are readable; only this table faces the user.
 */
export const ROLE_LABELS: Record<GlobalRole, string> = {
  STUDENT: 'دانشجو',
  PROFESSOR: 'استاد',
  ADMIN: 'مدیر سامانه',
};

/**
 * Initials for an avatar fallback, e.g. «علی محلاتی» → «ع‌م».
 *
 * Uses `Array.from` rather than `split('')` so a name written with characters
 * outside the basic plane is not cut in half mid-codepoint.
 */
export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
