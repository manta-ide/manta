import { createClient } from '@supabase/supabase-js';

// Initialize basic Supabase client (following Clerk documentation)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://jrwakwgkztccxfvfixyi.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impyd2Frd2drenRjY3hmdmZpeHlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjEzNTEwOTIsImV4cCI6MjA3NjkyNzA5Mn0.oTpXn6Wu_0olN-wct3B7wP7_Qc9HSLIP9GBCYGmoLFk';

export const supabase = createClient(supabaseUrl, supabaseKey);

// Create a Clerk-authenticated Supabase client for server-side operations
export function createServerSupabaseClient() {
  const { auth } = require('@clerk/nextjs/server');

  return createClient(
    supabaseUrl,
    supabaseKey,
    {
      async accessToken() {
        return (await auth()).getToken();
      },
    },
  );
}

// Note: For client-side Clerk integration, use createClerkSupabaseClient from './supabase-client'

// Database types for type safety
export type Database = {
  users: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    avatar_url: string | null;
    created_at: string | null;
    updated_at: string | null;
  };
  projects: {
    id: string;
    name: string;
    description: string | null;
    created_at: string;
    updated_at: string;
  };
  user_projects: {
    user_id: string;
    project_id: string;
    role: string;
    created_at: string;
  };
  nodes: {
    id: string;
    project_id: string;
    data: any; // JSONB
    created_at: string;
    updated_at: string;
  };
  edges: {
    id: string;
    project_id: string;
    source_id: string;
    target_id: string;
    data: any; // JSONB
    created_at: string;
    updated_at: string;
  };
  api_keys: {
    id: string;
    user_id: string;
    name: string;
    key_hash: string;
    created_at: string | null;
    last_used_at: string | null;
    expires_at: string | null;
  };
};

// Note: Users are now created automatically by the Clerk webhook
// No need for manual user creation functions

// Helper function to get or create default project
export async function getOrCreateDefaultProject(userId: string) {
  const defaultProjectId = 'default-project';

  // Try to get the project
  const { data: existingProject } = await supabase
    .from('projects')
    .select('*')
    .eq('id', defaultProjectId)
    .single();

  if (existingProject) {
    return existingProject;
  }

  // Create the default project
  const { data: newProject, error: projectError } = await supabase
    .from('projects')
    .insert([{ id: defaultProjectId, name: 'Default Project', description: 'Default Manta project' }])
    .select()
    .single();

  if (projectError) {
    console.error('Error creating default project:', projectError);
    throw projectError;
  }

  // Link user to project
  const { error: linkError } = await supabase
    .from('user_projects')
    .insert([{ user_id: userId, project_id: defaultProjectId, role: 'owner' }]);

  if (linkError) {
    console.error('Error linking user to project:', linkError);
  }

  return newProject;
}

