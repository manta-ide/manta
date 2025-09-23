import { NextResponse } from 'next/server';
import { projectExists, hasNextJsProject } from '@/lib/project-config';

export async function GET() {
  try {
    const exists = projectExists();
    const hasNextJs = hasNextJsProject();

    return NextResponse.json({
      projectExists: exists,
      hasNextJsProject: hasNextJs,
      needsPartialTemplate: hasNextJs && !exists
    });
  } catch (error) {
    console.error('Error checking project status:', error);
    return NextResponse.json(
      { error: 'Failed to check project status' },
      { status: 500 }
    );
  }
}
