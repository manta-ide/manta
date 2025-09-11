import { NextRequest, NextResponse } from 'next/server';
import '@/lib/sandbox-provider';
import { SandboxService } from '@/lib/sandbox-service';

export async function POST(request: NextRequest) {
  try {
    // Use default user for sandbox initialization
    const userId = 'default-user';
    const userEmail = 'user@manta.local';
    console.log('Initializing sandbox for user:', userId);
    
    // Initialize sandbox for the user
    const sandboxInfo = await SandboxService.initializeUserSandbox(
      userId,
      userEmail
    );

    // Setup base template project in the sandbox (async, don't wait for it)
    console.log('Setting up base template project for user:', userId);
    SandboxService.setupBaseTemplate(userId).catch(error => {
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
    // Use default user for sandbox info
    const userId = 'default-user';
    const userEmail = 'user@manta.local';

    // Try to get sandbox, and auto-create if missing (backup path)
    let sandboxInfo = await SandboxService.getUserSandboxInfo(userId);
    if (!sandboxInfo || !sandboxInfo.previewUrl) {
      try {
        sandboxInfo = await SandboxService.initializeUserSandbox(userId, userEmail);
        // Fire-and-forget template setup
        SandboxService.setupBaseTemplate(userId).catch(err => {
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
