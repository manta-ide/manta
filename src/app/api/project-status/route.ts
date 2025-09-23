import { NextResponse } from 'next/server';
import { projectExists } from '@/lib/project-config';

export async function GET() {
  try {
    const exists = projectExists();
    return NextResponse.json({ projectExists: exists });
  } catch (error) {
    console.error('Error checking project status:', error);
    return NextResponse.json(
      { error: 'Failed to check project status' },
      { status: 500 }
    );
  }
}
