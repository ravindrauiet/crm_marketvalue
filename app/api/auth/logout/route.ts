import { NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth';

// POST /api/auth/logout
export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(AUTH_COOKIE, '', { path: '/', maxAge: 0 });
  return res;
}
