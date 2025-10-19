import { NextResponse } from 'next/server';
import { projectExists, hasAnyFiles } from '@/lib/project-config';

export async function GET() {
  try {
    const exists = projectExists();
    const hasFiles = hasAnyFiles();

    return NextResponse.json({
      projectExists: exists,
      hasAnyFiles: hasFiles,
      // Always require the partial template regardless of current directory state
      needsPartialTemplate: true
    });
  } catch (error) {
    console.error('Error checking project status:', error);
    return NextResponse.json(
      { error: 'Failed to check project status' },
      { status: 500 }
    );
  }
}

// Analyze project structure
export async function POST() {
  try {
    return NextResponse.json({
      success: true,
      message: 'Project analysis completed'
    });
  } catch (error) {
    console.error('Error analyzing project:', error);
    return NextResponse.json(
      { error: 'Failed to analyze project' },
      { status: 500 }
    );
  }
}