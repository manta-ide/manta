import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const apiKey = request.headers.get('MANTA_API_KEY');

    if (!apiKey) {
      return NextResponse.json({ error: 'No MANTA_API_KEY header' }, { status: 400 });
    }

    console.log('🧪 Test endpoint - API key received:', apiKey);

    if (apiKey.startsWith('manta_')) {
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');
      console.log('🧪 Test endpoint - Generated hash:', keyHash);

      const client = createServerSupabaseClient();
      const { data: apiKeyData, error } = await client
        .from('api_keys')
        .select('user_id, name, key_hash')
        .eq('key_hash', keyHash)
        .single();

      console.log('🧪 Test endpoint - Database result:', { data: apiKeyData, error: error?.message });

      if (!error && apiKeyData) {
        return NextResponse.json({
          success: true,
          message: 'API key is valid',
          userId: apiKeyData.user_id,
          keyName: apiKeyData.name,
          storedHash: apiKeyData.key_hash,
          computedHash: keyHash
        });
      } else {
        return NextResponse.json({
          success: false,
          message: 'API key not found in database',
          computedHash: keyHash
        });
      }
    } else {
      return NextResponse.json({ error: 'API key must start with manta_' }, { status: 400 });
    }
  } catch (error) {
    console.error('Test endpoint error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
