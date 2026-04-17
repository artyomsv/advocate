import type { FieldValues, UseFormSetError } from 'react-hook-form';

export interface ServerIssue {
  path: string[] | string;
  message: string;
}

/**
 * Map server-side zod validation errors into react-hook-form field errors.
 * Server response shape: { error: 'ValidationError', issues: [{ path: [...], message }] }.
 */
export function applyServerErrors<T extends FieldValues>(
  setError: UseFormSetError<T>,
  issues: readonly ServerIssue[],
): void {
  for (const issue of issues) {
    const path = Array.isArray(issue.path) ? issue.path.join('.') : issue.path;
    if (!path) continue;
    setError(path as never, { type: 'server', message: issue.message });
  }
}

/**
 * Extract ServerIssue[] from a thrown fetch error body. Our api() wrapper
 * throws an Error with `${status} ${statusText}` — we re-fetch the response
 * body in routes that need structured errors. For now this is best-effort
 * and returns [] when the error doesn't match the known shape.
 */
export function parseValidationIssues(body: unknown): ServerIssue[] {
  if (typeof body !== 'object' || body === null) return [];
  const b = body as { error?: string; issues?: unknown };
  if (b.error !== 'ValidationError' || !Array.isArray(b.issues)) return [];
  return (b.issues as ServerIssue[]).filter(
    (i) => i && typeof i.message === 'string' && (typeof i.path === 'string' || Array.isArray(i.path)),
  );
}
