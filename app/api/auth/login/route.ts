import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE, AUTH_MAX_AGE_SECONDS, authToken, isAuthEnabled, safeEqual } from '@/lib/auth';

// POST /api/auth/login  Body: { password }
export async function POST(req: NextRequest) {
  if (!isAuthEnabled()) return NextResponse.json({ success: true });

  const body = await req.json().catch(() => ({}));
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !safeEqual(password, process.env.APP_PASSWORD || '')) {
    // Small delay to slow down password guessing
    await new Promise(r => setTimeout(r, 800));
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, await authToken(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: AUTH_MAX_AGE_SECONDS,
  });
  return res;
}
