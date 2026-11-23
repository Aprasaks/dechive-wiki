// Allowlist public error messages; never display arbitrary server responses.
export function reviewPackageErrorMessage(status: number, data: unknown): string {
  const value = data && typeof data === 'object' ? data as {error?: unknown; errors?: Array<{message?: unknown}>} : null
  const code = typeof value?.error === 'string' ? value.error : Array.isArray(value?.errors) && typeof value.errors[0]?.message === 'string' ? value.errors[0].message : ''
  if (code === 'CSRF_ORIGIN_REJECTED') return 'The review request was rejected because its connection or address is invalid. Reopen the editor and try again.'
  if (code === 'REVIEWER_REQUIRED' || status === 401) return 'The review request could not verify your session or reviewer role. Sign in again in another tab, then retry; your current review stays open.'
  if (code === 'REVIEWER_NOT_ALLOWED') return 'This account is not allowed to review this draft. Check the draft owner and reviewer role.'
  if (code === 'PACKAGE_NOT_READY') return 'This draft does not yet have a complete saved source package. Check Sources and evidence.'
  if (code === 'PACKAGE_INVALID') return 'The source package could not be inspected. Check the saved evidence and server logs.'
  if (status === 403) return 'The review request was denied. Sign in again in another tab, then retry; your current review stays open.'
  return 'Could not load the review package. Check the server status and try again.'
}
