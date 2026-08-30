import type { GlobalRole } from '@repo/shared';

export const ROLE_LABELS: Record<GlobalRole, string> = {
  STUDENT: 'دانشجو',
  PROFESSOR: 'استاد',
  ADMIN: 'مدیر سامانه',
};

export function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => Array.from(word)[0] ?? '')
    .join('');
}
