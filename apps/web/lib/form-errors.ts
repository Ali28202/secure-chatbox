import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { getApiFieldIssues } from '@/lib/api';

export function applyApiFieldIssues<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[]
): boolean {
  let applied = false;

  for (const issue of getApiFieldIssues(error)) {
    const field = fields.find((name) => name === issue.path);
    if (!field) continue;
    setError(field, { type: 'server', message: issue.message });
    applied = true;
  }

  return applied;
}
