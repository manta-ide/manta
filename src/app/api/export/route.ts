import { NextRequest, NextResponse } from 'next/server';
import JSZip from 'jszip';
import { auth } from '@/lib/auth';
import { getGraphFilesFromSupabase } from '@/app/api/lib/graphStorage';

export async function GET(req: NextRequest) {
  try {
    // Resolve current user for server-to-server authorization
    let userId: string | undefined;
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      userId = session?.user?.id;
    } catch {}
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get all files from Blaxel sandbox
    const blaxelResponse = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/blaxel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-user-id': userId,
      },
      body: JSON.stringify({
        action: 'exportProject'
      })
    });

    if (!blaxelResponse.ok) {
      console.error('Failed to get files from Blaxel API');
      return NextResponse.json({ error: 'Failed to get files from sandbox' }, { status: 500 });
    }

    const blaxelData = await blaxelResponse.json();
    
    if (!blaxelData.success) {
      console.error('Blaxel API returned error:', blaxelData.error);
      return NextResponse.json({ error: blaxelData.error || 'Failed to export from sandbox' }, { status: 500 });
    }

    const files = blaxelData.files as Record<string, string>;
    
    if (!files || Object.keys(files).length === 0) {
      return NextResponse.json({ error: 'No files found in sandbox' }, { status: 404 });
    }

    // Substitute `_graph` from Supabase (replace sandbox folder entirely)
    try {
      const { graphJson, varsJson } = await getGraphFilesFromSupabase(userId);
      // Remove any existing sandbox _graph files
      for (const key of Object.keys(files)) {
        if (key.includes('/_graph/') || key.endsWith('/_graph') || key.endsWith('\\_graph')) {
          delete files[key];
        }
      }
      // Inject Supabase-driven files if available
      if (graphJson) {
        files['blaxel/app/_graph/graph.json'] = graphJson;
      }
      if (varsJson) {
        files['blaxel/app/_graph/vars.json'] = varsJson;
      }
    } catch {}

    // Create a new zip file
    const zip = new JSZip();
    
    // Add all files to the zip
    for (const [filePath, content] of Object.entries(files)) {
      // Normalize path separators for zip
      let normalizedPath = filePath.replace(/\\/g, '/');
      
      // Remove the /blaxel/app prefix to make paths relative
      if (normalizedPath.startsWith('blaxel/app/')) {
        normalizedPath = normalizedPath.substring('blaxel/app/'.length);
      } else if (normalizedPath.startsWith('/blaxel/app/')) {
        normalizedPath = normalizedPath.substring('/blaxel/app/'.length);
      }
      
      console.log(`Adding file to zip: ${normalizedPath}`);
      zip.file(normalizedPath, content as string);
    }
    
    // Generate the zip file
    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    
    // Create response with zip file
    const response = new NextResponse(zipBuffer);
    response.headers.set('Content-Type', 'application/zip');
    response.headers.set('Content-Disposition', 'attachment; filename="project-export.zip"');
    
    return response;
  } catch (error) {
    console.error('Error creating zip export:', error);
    return NextResponse.json({ error: 'Failed to create zip export' }, { status: 500 });
  }
}
