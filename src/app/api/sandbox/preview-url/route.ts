import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import '@/lib/sandbox-provider';
import { SandboxService } from '@/lib/sandbox-service';

export async function GET(request: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = session.user.id as string;

    // Attempt to read from cached/DB-backed info first
    const info = await SandboxService.getUserSandboxInfo(userId);
    if (info?.previewUrl) {
      return NextResponse.json({ previewUrl: info.previewUrl });
    }

    // Ask provider directly as a fallback (does not create sandboxes)
    const url = await SandboxService.getUserPreviewUrl(userId);
    if (!url) {
      return NextResponse.json({ error: 'No preview URL available' }, { status: 404 });
    }
    return NextResponse.json({ previewUrl: url });
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to get preview URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}

