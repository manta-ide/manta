import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { SandboxService } from '@/lib/sandbox-service';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    // Get current user session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to access your sandbox' },
        { status: 401 }
      );
    }

    const { user } = session;

    // Short-circuit for internal API handled by Next: /iframe/api/vars
    const pathSegments = (await params).path || [];
    if (pathSegments.length >= 2 && pathSegments[0] === 'api' && pathSegments[1] === 'vars') {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (!supabaseUrl || !serviceRoleKey) {
        return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
      }
      const client = createClient(supabaseUrl, serviceRoleKey);
      const { data, error } = await client
        .from('graph_properties')
        .select('id, value')
        .eq('user_id', user.id);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      const vars: Record<string, any> = {};
      for (const row of data || []) {
        if (row && typeof row.id === 'string') {
          (vars as any)[row.id] = (row as any).value;
        }
      }
      return NextResponse.json({ vars });
    }

    // Get user's sandbox info including preview URL
    const sandboxInfo = await SandboxService.getUserSandboxInfo(user.id);
    
    if (!sandboxInfo || !sandboxInfo.previewUrl) {
      return NextResponse.json(
        { error: 'No sandbox preview URL available. Please initialize your sandbox first.' },
        { status: 404 }
      );
    }

    // Construct the target URL
    const pathSegments2 = (await params).path || [];
    // Always include /iframe/ in the path since we're proxying iframe requests
    const targetPath = `/iframe${pathSegments2.length > 0 ? `/${pathSegments2.join('/')}` : '/'}`;
    const searchParams = request.nextUrl.searchParams.toString();
    const queryString = searchParams ? `?${searchParams}` : '';
    
    const targetUrl = `${sandboxInfo.previewUrl}${targetPath}${queryString}`;
    
    console.log(`[IframeProxy] Proxying request to: ${targetUrl}`);

    // Fetch from the user's sandbox preview URL
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': request.headers.get('user-agent') || 'MantaEditor-Iframe-Proxy',
        'Accept': request.headers.get('accept') || '*/*',
        'Accept-Language': request.headers.get('accept-language') || 'en-US,en;q=0.9',
        // Forward some headers but filter out sensitive ones
        ...(request.headers.get('authorization') && { 'Authorization': request.headers.get('authorization')! }),
      }
    });
    if (!response.ok) {
      console.error(`[IframeProxy] Failed to fetch from sandbox: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Sandbox request failed: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the response body
    const body = await response.arrayBuffer();
    
    // Create response with the same content type
    const contentType = response.headers.get('content-type') || 'text/html';
    
    return new NextResponse(body, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
        // Allow iframe embedding
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': "frame-ancestors 'self'",
        // Forward some response headers
        ...(response.headers.get('etag') && { 'ETag': response.headers.get('etag')! }),
        ...(response.headers.get('last-modified') && { 'Last-Modified': response.headers.get('last-modified')! }),
      }
    });

  } catch (error) {
    console.error('[IframeProxy] Error proxying iframe request:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error while proxying iframe request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: { path?: string[] } }) {
  try {
    // Get current user session
    const session = await auth.api.getSession({ headers: request.headers });
    
    if (!session || !session.user) {
      return NextResponse.json(
        { error: 'Unauthorized - Please sign in to access your sandbox' },
        { status: 401 }
      );
    }

    const { user } = session;
    
    // Get user's sandbox info including preview URL
    const sandboxInfo = await SandboxService.getUserSandboxInfo(user.id);
    
    if (!sandboxInfo || !sandboxInfo.previewUrl) {
      return NextResponse.json(
        { error: 'No sandbox preview URL available. Please initialize your sandbox first.' },
        { status: 404 }
      );
    }

    // Construct the target URL
    const pathSegments = params.path || [];
    // Always include /iframe/ in the path since we're proxying iframe requests
    const targetPath = `/iframe${pathSegments.length > 0 ? `/${pathSegments.join('/')}` : '/'}`;
    const searchParams = request.nextUrl.searchParams.toString();
    const queryString = searchParams ? `?${searchParams}` : '';
    
    const targetUrl = `${sandboxInfo.previewUrl}${targetPath}${queryString}`;
    
    console.log(`[IframeProxy] Proxying POST request to: ${targetUrl}`);

    // Get request body
    const body = await request.arrayBuffer();

    // Fetch from the user's sandbox preview URL
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': request.headers.get('content-type') || 'application/json',
        'User-Agent': request.headers.get('user-agent') || 'MantaEditor-Iframe-Proxy',
        'Accept': request.headers.get('accept') || '*/*',
        // Forward some headers but filter out sensitive ones
        ...(request.headers.get('authorization') && { 'Authorization': request.headers.get('authorization')! }),
      },
      body: body.byteLength > 0 ? body : undefined
    });

    if (!response.ok) {
      console.error(`[IframeProxy] Failed to POST to sandbox: ${response.status} ${response.statusText}`);
      return NextResponse.json(
        { error: `Sandbox request failed: ${response.status} ${response.statusText}` },
        { status: response.status }
      );
    }

    // Get the response body
    const responseBody = await response.arrayBuffer();
    
    // Create response with the same content type
    const contentType = response.headers.get('content-type') || 'application/json';
    
    return new NextResponse(responseBody, {
      status: response.status,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      }
    });

  } catch (error) {
    console.error('[IframeProxy] Error proxying iframe POST request:', error);
    
    return NextResponse.json(
      { 
        error: 'Internal server error while proxying iframe request',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}
