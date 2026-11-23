// Only display known server codes; never expose raw server responses.
export function publicationErrorMessage(status: number, data: unknown): string {
  const value = data && typeof data === 'object' ? data as {error?: unknown; errors?: Array<{message?: unknown}>} : null
  const code = typeof value?.error === 'string' ? value.error : Array.isArray(value?.errors) && typeof value.errors[0]?.message === 'string' ? value.errors[0].message : ''
  if (code === 'EDITOR_REQUIRED' || status === 401) return 'Your session may have expired or your account may not have editor access. Sign in again and check your role.'
  if (code === 'CSRF_ORIGIN_REJECTED') return 'The editor rejected this request because its connection or address is invalid. Reopen the editor and sign in again.'
  if (code === 'INVALID_PUBLICATION_DETAILS') return 'Check the summary and domain, then try again.'
  if (code === 'CURRENT_REVIEW_REQUIRED') return 'This draft or its evidence has not been approved in its current form. Complete a new review before publishing.'
  if (code === 'DRAFT_NOT_AVAILABLE') return 'The draft is unavailable. Reload the editor and check the draft.'
  if (status === 403) return 'The request was denied. Check your session and editor permissions.'
  return 'Publication could not be confirmed. Check the article status before trying again.'
}
