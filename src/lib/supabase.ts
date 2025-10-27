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
    is_public: boolean;
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
// This must use service role to bypass RLS when creating projects
export async function getOrCreateDefaultProject(userId: string) {
  // Create service role client to bypass RLS
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase service role credentials not configured');
  }

  const { createClient } = require('@supabase/supabase-js');
  const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey);

  // Generate a deterministic project ID for this user (so multiple calls return the same project)
  const { randomUUID } = require('crypto');
  const defaultProjectId = randomUUID(); // Generate a proper UUID

  // Check if user already has a project
  const { data: existingUserProject } = await serviceSupabase
    .from('user_projects')
    .select('project_id, projects(id, name, description, is_public, created_at, updated_at)')
    .eq('user_id', userId)
    .eq('role', 'owner')
    .limit(1)
    .single();

  if (existingUserProject?.projects) {
    console.log('✅ Found existing project for user:', userId);
    return existingUserProject.projects;
  }

  console.log('📁 Creating default project for user:', userId);

  // Create the default project with UUID (default to public)
  const { data: newProject, error: projectError } = await serviceSupabase
    .from('projects')
    .insert([{ id: defaultProjectId, name: 'Default Project', description: 'Default Manta project', is_public: true }])
    .select()
    .single();

  if (projectError) {
    console.error('Error creating default project:', projectError);
    throw projectError;
  }

  // Link user to project
  const { error: linkError } = await serviceSupabase
    .from('user_projects')
    .insert([{ user_id: userId, project_id: defaultProjectId, role: 'owner' }]);

  if (linkError) {
    console.error('Error linking user to project:', linkError);
    throw linkError;
  }

  console.log('✅ Default project created and linked for user:', userId);

  return newProject;
}

