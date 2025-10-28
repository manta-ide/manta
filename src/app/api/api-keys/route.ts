import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import crypto from 'crypto';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = createServerSupabaseClient();

    const { data: apiKeys, error } = await client
      .from('api_keys')
      .select('id, name, type, created_at, last_used_at, expires_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching API keys:', error);
      return NextResponse.json({ error: 'Failed to fetch API keys' }, { status: 500 });
    }

    return NextResponse.json(apiKeys);
  } catch (error) {
    console.error('Error in GET /api/api-keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { name, type } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate type field
    const keyType = type && ['admin', 'user'].includes(type) ? type : 'user';

    const client = createServerSupabaseClient();

    // Generate a secure API key
    const apiKey = `manta_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

    const { data, error } = await client
      .from('api_keys')
      .insert({
        user_id: userId,
        name: name.trim(),
        key_hash: keyHash,
        type: keyType,
      })
      .select('id, name, type, created_at')
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      return NextResponse.json({ error: 'Failed to create API key' }, { status: 500 });
    }

    return NextResponse.json({
      ...data,
      key: apiKey, // Only return the actual key once during creation
    });
  } catch (error) {
    console.error('Error in POST /api/api-keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'API key ID is required' }, { status: 400 });
    }

    const client = createServerSupabaseClient();

    const { error } = await client
      .from('api_keys')
      .delete()
      .eq('id', id)
      .eq('user_id', userId); // Ensure user can only delete their own keys

    if (error) {
      console.error('Error deleting API key:', error);
      return NextResponse.json({ error: 'Failed to delete API key' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/api-keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
