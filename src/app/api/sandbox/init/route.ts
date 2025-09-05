import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { SandboxService } from '@/lib/blaxel-sandbox-service';

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
    console.log('Initializing sandbox for user:', user.id);
    
    // Initialize sandbox for the user
    const sandboxInfo = await SandboxService.initializeUserSandbox(
      user.id,
      user.email
    );

    // Setup base template project in the sandbox (async, don't wait for it)
    console.log('Setting up base template project for user:', user.id);
    SandboxService.setupBaseTemplate(user.id).catch(error => {
      console.error('Failed to setup base template (non-blocking):', error);
    });

    return NextResponse.json({
      success: true,
      sandbox: sandboxInfo,
      message: 'Sandbox initialized. Base template setup is in progress.'
    });
  } catch (error) {
    console.error('Failed to initialize sandbox:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to initialize sandbox',
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

    // Try to get sandbox, and auto-create if missing (backup path)
    let sandboxInfo = await SandboxService.getUserSandboxInfo(user.id);
    if (!sandboxInfo || !sandboxInfo.previewUrl) {
      try {
        sandboxInfo = await SandboxService.initializeUserSandbox(user.id, user.email);
        // Fire-and-forget template setup
        SandboxService.setupBaseTemplate(user.id).catch(err => {
          console.error('Failed to setup base template (non-blocking GET):', err);
        });
      } catch (e) {
        console.warn('Auto-create sandbox (GET) failed:', e);
      }
    }

    if (!sandboxInfo) {
      return NextResponse.json({ sandbox: null, message: 'No sandbox found for user' });
    }

    return NextResponse.json({ sandbox: sandboxInfo });
  } catch (error) {
    console.error('Failed to get sandbox info:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to get sandbox info',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

