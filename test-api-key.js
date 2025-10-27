// Quick test script to create an API key for MCP testing
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

// Supabase configuration (same as in the app)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable not set');
  process.exit(1);
}

// Create service client for admin operations
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Generate a test API key
const apiKey = `manta_${crypto.randomBytes(32).toString('hex')}`;
const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

console.log('Test API Key:', apiKey);
console.log('Key Hash:', keyHash);

// Test user ID (you may need to change this to a valid user ID from your database)
const testUserId = 'user_34cZZrRgtSuEtMNwRwpBg80E1EL'; // Valid user ID from database

async function createTestApiKey() {
  try {
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        user_id: testUserId,
        name: 'MCP Test Key',
        key_hash: keyHash,
      })
      .select('id, name, created_at')
      .single();

    if (error) {
      console.error('Error creating API key:', error);
      return;
    }

    console.log('✅ API key created successfully:', data);
    console.log('🔑 Use this API key in your MCP config:', apiKey);
  } catch (error) {
    console.error('Failed to create API key:', error);
  }
}

createTestApiKey();
