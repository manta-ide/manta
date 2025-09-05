import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { SandboxService } from '@/lib/sandbox-service';
import { registerBlaxelProvider } from '@/lib/blaxel';

// Ensure Blaxel provider is registered
registerBlaxelProvider();

export async function POST(request: NextRequest) {
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
    console.log('Setting up base template for user:', user.id);

    // Setup base template project in the sandbox
    await SandboxService.setupBaseTemplate(user.id);

    return NextResponse.json({
      success: true,
      message: 'Base template setup completed successfully'
    });
  } catch (error) {
    console.error('Failed to setup base template:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to setup base template',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

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

    // Check if sandbox exists
    const sandboxInfo = await SandboxService.getUserSandboxInfo(user.id);

    if (!sandboxInfo) {
      return NextResponse.json({
        canSetup: false,
        message: 'No sandbox found. Please initialize your sandbox first.'
      });
    }

    return NextResponse.json({
      canSetup: true,
      sandbox: sandboxInfo,
      message: 'Ready to setup base template'
    });
  } catch (error) {
    console.error('Failed to check setup status:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to check setup status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
