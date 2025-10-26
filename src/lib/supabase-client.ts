'use client';

import { createClient } from '@supabase/supabase-js';
import { useSession } from '@clerk/nextjs';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || '';

// Custom hook for Clerk-authenticated Supabase client
export function useClerkSupabaseClient() {
  const { session } = useSession();

  return createClient(
    supabaseUrl,
    supabaseKey,
    {
      async accessToken() {
        return session?.getToken() ?? null;
      },
    },
  );
}
