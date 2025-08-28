import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!serviceRoleKey) {
      return NextResponse.json({ 
        error: 'Service role key not configured' 
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      serviceRoleKey 
    });
  } catch (error) {
    console.error('❌ Error getting service role key:', error);
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 });
  }
}
