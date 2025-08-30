import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
// NOTE: Local filesystem is no longer used for project files. All operations go through Blaxel.

// Local PROJECT_ROOT removed; all file operations use Blaxel

// Blaxel integration utility functions
async function callBlaxelApi(action: string, additionalData: any = {}, userId?: string) {
  try {
    console.log('callBlaxelApi', action, additionalData, userId);
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (userId) headers['x-user-id'] = userId;
    const response = await fetch(`${process.env.BACKEND_URL || 'http://localhost:3000'}/api/blaxel`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ action, ...(userId ? { userId } : {}), ...additionalData }),
    });
    
    if (!response.ok) {
      throw new Error(`Blaxel API failed: ${response.statusText}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('Blaxel API call failed:', error);
    throw error;
  }
}

// Path helpers to constrain operations to /blaxel/app
function toAppAbsolutePath(p: string): string {
  const rel = (p || '').replace(/^\/?(?:blaxel\/app\/)?/i, '');
  return `/blaxel/app/${rel}`.replace(/\\/g, '/');
}
function toAppRelativePath(abs: string): string {
  return (abs || '').replace(/^\/?(?:blaxel\/app\/)?/i, '').replace(/\\/g, '/');
}

async function readFileFromBlaxel(filePath: string, userId?: string): Promise<string | null> {
  try {
    const result = await callBlaxelApi('readFile', { path: toAppAbsolutePath(filePath) }, userId);
    if (result.success) {
      return result.content;
    }
    return null;
  } catch (error) {
    console.log(`Failed to read file from Blaxel: ${filePath}`, error);
    return null;
  }
}

async function writeFileToBlaxel(filePath: string, content: string, userId?: string): Promise<boolean> {
  try {
    const result = await callBlaxelApi('writeFile', { path: toAppAbsolutePath(filePath), content }, userId);
    return result.success;
  } catch (error) {
    console.log(`Failed to write file to Blaxel: ${filePath}`, error);
    return false;
  }
}

async function deleteFileFromBlaxel(filePath: string, userId?: string): Promise<boolean> {
  try {
    const result = await callBlaxelApi('deleteFile', { path: toAppAbsolutePath(filePath) }, userId);
    return result.success;
  } catch (error) {
    console.log(`Failed to delete file from Blaxel: ${filePath}`, error);
    return false;
  }
}

// Recursive ls-based listing (no file content read)
const LIST_EXCLUDED_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage', '.vscode', '.idea', 'logs', 'tmp', 'temp',
  '.blaxel', '.cache', '.config', '.npm', 'bin', 'dev', 'etc', 'home', 'lib', 'media', 'mnt', 'opt', 'proc',
  'root', 'run', 'sbin', 'srv', 'sys', 'uk', 'usr', 'var', "_graph"
]);
const LIST_EXCLUDED_FILES = new Set([
  '.env', '.env.local', '.env.development.local', '.env.test.local', '.env.production.local',
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', '.DS_Store', 'Thumbs.db', 'send-to-sandbox.ts', 'package.json', 'tsconfig.json', 'tailwind.config.js', 'vite.config.js', 
  'index.html', 'postcss.config.js', 'README.md', 'pnpm-lock.yaml', 'eslint.config.js', '.gitignore', 'vite-env.d.ts'
]);

async function listFilesRecursively(userId?: string, startDir: string = '/blaxel/app'): Promise<string[]> {
  const results: string[] = [];
  async function walk(dir: string) {
    const res = await callBlaxelApi('listFiles', { directory: dir }, userId);
    if (!res?.success || !Array.isArray(res.files)) return;
    for (const entry of res.files as Array<{ name: string; path?: string; isDirectory: boolean }>) {
      const name = entry?.name;
      const entryPath = entry?.path || (dir === '/' ? `/${name}` : `${dir}/${name}`);
      if (!name || !entryPath) continue;
      if (entry.isDirectory) {
        // Skip excluded dirs by name
        if (LIST_EXCLUDED_DIRS.has(name)) continue;
        // Only recurse inside /blaxel/app
        if (/^\/?blaxel\/app\//i.test(entryPath)) {
          await walk(entryPath);
        }
      } else {
        if (LIST_EXCLUDED_FILES.has(name)) continue;
        // Only include files under /blaxel/app
        if (/^\/?blaxel\/app\//i.test(entryPath)) {
          results.push(toAppRelativePath(entryPath));
        }
      }
    }
  }
  await walk(startDir);
  return results;
}

// Local filesystem exclusions removed – not used when listing from Blaxel

import { FileNode } from '../lib/schemas';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const listOnly = url.searchParams.get('list') === 'true';
    const includeGraphs = url.searchParams.get('graphs') === 'true';
    const filePath = url.searchParams.get('path');
    // Resolve userId from session for server-to-server Blaxel calls
    let userId: string | undefined;
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      userId = session?.user?.id;
    } catch {}
    // Fallback to x-user-id header for server-to-server
    if (!userId) {
      const headerUserId = req.headers.get('x-user-id') || undefined;
      if (headerUserId) userId = headerUserId;
    }
    if (!userId) {
      console.warn('[files] No user session; Blaxel calls may be unauthorized');
    }

    if (filePath) {
      // Return specific file content - Blaxel only
      if (!userId) {
        return NextResponse.json({ success: false, error: 'UNAUTHORIZED' });
      }
      try {
        let content: string | null = null;
        let source = 'Blaxel';
        
        content = await readFileFromBlaxel(filePath, userId);
        if (content === null) return NextResponse.json({ success: false, error: 'FILE_NOT_FOUND' });
        
        return NextResponse.json({ success: true, content, source });
      } catch (error) {
        return NextResponse.json({ success: false, error: 'READ_FAILED' });
      }
    }
    
    if (listOnly) {
      // Always list from Blaxel
      try {
        if (!userId) {
          return NextResponse.json({ files: [] });
        }
        const files = await listFilesRecursively(userId, '/blaxel/app');
        const fileList = files.map(p => ({ route: p }));
        return NextResponse.json({ files: fileList });
      } catch (e) {
        console.warn('listFilesRecursively failed:', e);
      }
      return NextResponse.json({ files: [] });
    }
    
    // Full file structure (paths only) via Blaxel ls
    let fileTree: FileNode[] = [];
    try {
      if (userId) {
        const files = await listFilesRecursively(userId, '/blaxel/app');
        const filesMap: Record<string, string> = Object.fromEntries(files.map(p => [p, '']));
        fileTree = buildTreeFromFlatFiles(filesMap);
      }
    } catch (e) {
      console.warn('Failed to list project for full structure:', e);
    }
    
    const response: any = {
      files: {},
      fileTree
    };
    
    if (includeGraphs) {
      // No local graph files; upstream graph APIs should be used instead
      response.graphs = [];
    }
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('Error in GET /api/files:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { filePath, content } = await req.json();
    
    if (!filePath || content === undefined) {
      return NextResponse.json({ error: 'filePath and content are required' }, { status: 400 });
    }
    // Resolve userId for server-to-server Blaxel write
    let userId: string | undefined;
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      userId = session?.user?.id;
    } catch {}
    
    // Write to Blaxel only
    const blaxelSuccess = await writeFileToBlaxel(toAppRelativePath(filePath), content, userId);
    if (!blaxelSuccess) return NextResponse.json({ error: 'Failed to create file in Blaxel' }, { status: 500 });
    return NextResponse.json({ success: true, message: 'File created in Blaxel', blaxelSuccess: true, localSuccess: false });
  } catch (error) {
    console.error('Error in POST /api/files:', error);
    return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    
    if (body.type === 'graph') {
      // Handle graph storage
      const { graph } = body;
      // No local graph writes; accept for compatibility
      return NextResponse.json({ success: true, message: 'Graph save ignored (Blaxel/Supabase are sources of truth)' });
    } else {
      // Handle file update
      const { filePath, content } = body;
      console.log('filePath', filePath);
      if (!filePath || content === undefined) {
        return NextResponse.json({ error: 'filePath and content are required' }, { status: 400 });
      }
      // Resolve userId for server-to-server Blaxel write
      let userId: string | undefined;
      try {
        const session = await auth.api.getSession({ headers: req.headers });
        userId = session?.user?.id;
      } catch {}
      
      const blaxelSuccess = await writeFileToBlaxel(toAppRelativePath(filePath), content, userId);
      return NextResponse.json({ success: blaxelSuccess, message: blaxelSuccess ? 'File updated in Blaxel' : 'Failed to update file in Blaxel', blaxelSuccess, localSuccess: false });
    }
  } catch (error) {
    console.error('Error in PUT /api/files:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();
    
    if (body.type === 'graph') {
      // Ignore local graph deletion
      return NextResponse.json({ success: true, message: 'Graph deletion ignored (in-memory only)' });
    } else {
      // Handle file deletion
      const { filePath } = body;
      
      if (!filePath) {
        return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
      }
      // Resolve userId for server-to-server Blaxel delete
      let userId: string | undefined;
      try {
        const session = await auth.api.getSession({ headers: req.headers });
        userId = session?.user?.id;
      } catch {}
      
      const blaxelSuccess = await deleteFileFromBlaxel(toAppRelativePath(filePath), userId);
      return NextResponse.json({ success: blaxelSuccess, message: blaxelSuccess ? 'File deleted from Blaxel' : 'Failed to delete file from Blaxel', blaxelSuccess, localSuccess: false });
    }
  } catch (error) {
    console.error('Error in DELETE /api/files:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
} 

// Build a simple file tree from a flat map of path -> content
function buildTreeFromFlatFiles(filesMap: Record<string, string>): FileNode[] {
  const root: any = {};
  for (const fullPath of Object.keys(filesMap)) {
    const normalized = (fullPath.startsWith('/') ? fullPath.slice(1) : fullPath).replace(/\\/g, '/');
    const parts = normalized.split('/');
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      if (!node.children) node.children = {};
      if (!node.children[part]) {
        node.children[part] = isFile
          ? { name: part, path: normalized, type: 'file', content: filesMap[fullPath] }
          : { name: part, path: parts.slice(0, i + 1).join('/'), type: 'directory', children: {} };
      }
      node = node.children[part];
    }
  }
  const toArray = (n: any): FileNode[] => {
    if (!n.children) return [];
    return Object.values(n.children).map((child: any) => ({
      name: child.name,
      path: child.path,
      type: child.type,
      children: child.type === 'directory' ? toArray(child) : undefined,
      content: child.type === 'file' ? child.content : undefined,
    })) as FileNode[];
  };
  return toArray(root);
}