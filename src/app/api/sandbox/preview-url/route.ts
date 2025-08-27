import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { BlaxelService } from '@/lib/blaxel';

export async function GET(request: NextRequest) {
  try {
    // Get current user session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { user } = session;

    // Get the user's preview URL
    const previewUrl = await BlaxelService.getUserPreviewUrl(user.id);

    if (!previewUrl) {
      return NextResponse.json({
        previewUrl: null,
        message: 'No preview URL available. Please initialize your sandbox first.'
      });
    }

    return NextResponse.json({
      previewUrl,
      message: 'Preview URL retrieved successfully'
    });
  } catch (error) {
    console.error('Failed to get preview URL:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get preview URL',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
