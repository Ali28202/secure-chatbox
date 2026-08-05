import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { getApiFieldIssues } from '@/lib/api';

/**
 * Moves the API's per-field validation messages onto the matching form inputs.
 *
 * The API validates with the same Zod schemas the form does, so a failure that
 * gets past the client is normally a rule only the server can check — a
 * university ID that is already taken, for instance. Showing that under the
 * field it belongs to is far more useful than a toast in the corner.
 *
 * Only paths the caller lists as real fields are applied. `setError` on an
 * unknown name silently creates an error nothing renders, so a server that
 * names a field the form does not have would produce a form that refuses to
 * submit with no visible reason.
 *
 * @returns whether any issue landed on a field — `false` means the caller
 * should show the message some other way.
 */
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
