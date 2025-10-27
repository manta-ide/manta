import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const client = createServerSupabaseClient();

    // Get all projects for the user
    const { data: userProjects, error: userProjectsError } = await client
      .from('user_projects')
      .select('project_id, role')
      .eq('user_id', userId);

    if (userProjectsError) {
      console.error('Error fetching user projects:', userProjectsError);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    if (!userProjects || userProjects.length === 0) {
      return NextResponse.json([]);
    }

    const projectIds = userProjects.map(up => up.project_id);

    const { data: projects, error: projectsError } = await client
      .from('projects')
      .select('*')
      .in('id', projectIds)
      .order('created_at', { ascending: false });

    if (projectsError) {
      console.error('Error fetching projects:', projectsError);
      return NextResponse.json({ error: 'Failed to fetch projects' }, { status: 500 });
    }

    // Add role information to each project
    const projectsWithRoles = projects.map(project => ({
      ...project,
      role: userProjects.find(up => up.project_id === project.id)?.role || 'member'
    }));

    return NextResponse.json(projectsWithRoles);
  } catch (error) {
    console.error('Error in GET /api/projects:', error);
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
    const { name, description, is_public = true } = body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }

    // Validate is_public if provided
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public must be a boolean' }, { status: 400 });
    }

    // Use service role client for creating projects (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // First ensure the user exists in the users table (should be created by webhook)
    const { data: existingUser, error: userCheckError } = await serviceClient
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (userCheckError && userCheckError.code !== 'PGRST116') { // PGRST116 is "not found"
      console.error('Error checking user:', userCheckError);
      return NextResponse.json({ error: 'Failed to verify user' }, { status: 500 });
    }

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found. Please try again.' }, { status: 400 });
    }

    // Generate a UUID for the project
    const projectId = randomUUID();

    // Create the project
    const { data: project, error: projectError } = await serviceClient
      .from('projects')
      .insert({
        id: projectId,
        name: name.trim(),
        description: description?.trim() || null,
        is_public,
      })
      .select()
      .single();

    if (projectError) {
      console.error('Error creating project:', projectError);
      return NextResponse.json({ error: 'Failed to create project' }, { status: 500 });
    }

    // Link user to project as owner
    const { error: linkError } = await serviceClient
      .from('user_projects')
      .insert({
        user_id: userId,
        project_id: projectId,
        role: 'owner'
      });

    if (linkError) {
      console.error('Error linking user to project:', linkError);
      return NextResponse.json({ error: 'Failed to link user to project' }, { status: 500 });
    }

    return NextResponse.json({
      ...project,
      role: 'owner'
    });
  } catch (error) {
    console.error('Error in POST /api/projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { projectId, name, description, is_public } = body;

    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 });
    }

    // Validate is_public if provided
    if (is_public !== undefined && typeof is_public !== 'boolean') {
      return NextResponse.json({ error: 'is_public must be a boolean' }, { status: 400 });
    }

    // Use service role client for updating projects (bypasses RLS)
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is owner of the project
    const { data: userProject, error: checkError } = await serviceClient
      .from('user_projects')
      .select('role')
      .eq('user_id', userId)
      .eq('project_id', projectId)
      .single();

    if (checkError || !userProject) {
      return NextResponse.json({ error: 'Project not found or access denied' }, { status: 404 });
    }

    if (userProject.role !== 'owner') {
      return NextResponse.json({ error: 'Only project owners can update project settings' }, { status: 403 });
    }

    // Build update object
    const updates: any = {
      updated_at: new Date().toISOString()
    };

    if (name !== undefined && typeof name === 'string' && name.trim().length > 0) {
      updates.name = name.trim();
    }

    if (description !== undefined) {
      updates.description = typeof description === 'string' ? description.trim() : null;
    }

    if (is_public !== undefined) {
      updates.is_public = is_public;
    }

    // Update the project
    const { data: project, error: updateError } = await serviceClient
      .from('projects')
      .update(updates)
      .eq('id', projectId)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating project:', updateError);
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 });
    }

    return NextResponse.json({
      ...project,
      role: userProject.role
    });
  } catch (error) {
    console.error('Error in PATCH /api/projects:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
