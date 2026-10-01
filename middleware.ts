import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, authToken, isAuthEnabled, safeEqual } from './lib/auth';

// Pages and APIs reachable without logging in
const PUBLIC_PATHS = ['/login', '/api/auth/login', '/api/auth/logout'];

export async function middleware(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();

  const cookie = req.cookies.get(AUTH_COOKIE)?.value || '';
  if (cookie && safeEqual(cookie, await authToken())) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Not logged in' }, { status: 401 });
  }

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = '/login';
  loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(loginUrl);
}

export const config = {
  // Skip Next.js internals and static files
  matcher: ['/((?!_next/static|_next/image|favicon.ico|images/|uploads/|.*\\.(?:png|jpg|jpeg|webp|svg|ico|css|js)$).*)'],
};
