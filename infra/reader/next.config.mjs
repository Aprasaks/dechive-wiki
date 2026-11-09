// Public-facing reader only. No Payload wrapper, staff API or editor routes.
// The release remains a PRIVATE noindex preview until a separate launch review.
export default {
  output: 'standalone',
  reactStrictMode: true,
  poweredByHeader: false,
  devIndicators: false,
  async headers() {
    return [{
      source: '/:path*',
      headers: [
        {key: 'Cache-Control', value: 'private, no-store, max-age=0'},
        {key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive'},
        {key: 'X-Content-Type-Options', value: 'nosniff'},
        {key: 'X-Frame-Options', value: 'DENY'},
        {key: 'Referrer-Policy', value: 'no-referrer'},
      ],
    }]
  },
}
