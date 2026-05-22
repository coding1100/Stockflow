export { default } from 'next-auth/middleware';

/**
 * Protect the app surface. Auth routes, the login page, SSE, and static assets stay
 * public; everything else requires a session (redirects to /login).
 */
export const config = {
  matcher: ['/((?!login|api/auth|api/stream|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|demo-assets).*)'],
};
