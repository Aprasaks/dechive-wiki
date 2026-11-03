export const dynamic = 'force-dynamic'

export function GET() {
  return new Response(
    'User-agent: *\nDisallow: /\n# G1 isolated CI preview, not a public website\n', {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'private, no-store, max-age=0',
      },
    },
  )
}
