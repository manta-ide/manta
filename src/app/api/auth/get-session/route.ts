import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

const LOCAL_MODE = process.env.MANTA_LOCAL_MODE === '1' || process.env.NEXT_PUBLIC_LOCAL_MODE === '1';

export async function GET() {
  try {
    if (LOCAL_MODE) {
      return NextResponse.json({ data: { session: null, user: null } });
    }
    // Fallback to real auth if configured
    const res = await auth.api.getSession({} as any);
    return NextResponse.json({ data: res ?? { session: null, user: null } });
  } catch (e) {
    // Gracefully return empty session on error
    return NextResponse.json({ data: { session: null, user: null } });
  }
}

