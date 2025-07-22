import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
  content?: string;
}

const PROJECT_ROOT = path.join(process.cwd(), 'demo-project');

// Directories and files to exclude from the editor
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.vscode',
  '.idea',
  'coverage',
  '.nyc_output',
  '.cache',
  'tmp',
  'temp',
  '.DS_Store',
  'Thumbs.db'
]);

const EXCLUDED_FILES = new Set([
  '.gitignore',
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db'
]);

// Function to recursively read directory structure
async function readDirectoryStructure(dirPath: string, relativePath: string = ''): Promise<{ files: Map<string, string>, fileTree: FileNode[] }> {
  const files = new Map<string, string>();
  const fileTree: FileNode[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip excluded directories and files
      if (EXCLUDED_DIRS.has(entry.name) || EXCLUDED_FILES.has(entry.name)) {
        continue;
      }
      
      const fullPath = path.join(dirPath, entry.name);
      const relativeFilePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
      // Normalize path to use forward slashes for consistency
      const normalizedPath = relativeFilePath.replace(/\\/g, '/');
      
      if (entry.isDirectory()) {
        const subResult = await readDirectoryStructure(fullPath, relativeFilePath);
        
        // Add all files from subdirectory
        for (const [key, value] of subResult.files) {
          files.set(key, value);
        }
        
        // Add directory node
        fileTree.push({
          name: entry.name,
          path: normalizedPath,
          type: 'directory',
          children: subResult.fileTree,
        });
      } else if (entry.isFile()) {
        // Read file content
        const content = await fs.readFile(fullPath, 'utf-8');
        files.set(normalizedPath, content);
        
        // Add file node
        fileTree.push({
          name: entry.name,
          path: normalizedPath,
          type: 'file',
          content,
        });
      }
    }
  } catch (error) {
    console.error('Error reading directory:', error);
  }
  
  // Sort fileTree: directories first, then files
  fileTree.sort((a, b) => {
    if (a.type === 'directory' && b.type === 'file') return -1;
    if (a.type === 'file' && b.type === 'directory') return 1;
    return a.name.localeCompare(b.name);
  });
  
  return { files, fileTree };
}

// GET: Load all files
export async function GET() {
  try {
    const { files, fileTree } = await readDirectoryStructure(PROJECT_ROOT);
    const filesObj = Object.fromEntries(files);
    return NextResponse.json({ files: filesObj, fileTree });
  } catch (error) {
    console.error('Error loading project:', error);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

// POST: Create new file
export async function POST(request: NextRequest) {
  try {
    const { filePath, content } = await request.json();
    const fullPath = path.join(PROJECT_ROOT, filePath);
    const dir = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(fullPath, content, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error creating file:', error);
    return NextResponse.json({ error: 'Failed to create file' }, { status: 500 });
  }
}

// PUT: Update existing file
export async function PUT(request: NextRequest) {
  try {
    const { filePath, content } = await request.json();
    const fullPath = path.join(PROJECT_ROOT, filePath);
    await fs.writeFile(fullPath, content, 'utf-8');
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating file:', error);
    return NextResponse.json({ error: 'Failed to update file' }, { status: 500 });
  }
}

// DELETE: Delete file
export async function DELETE(request: NextRequest) {
  try {
    const { filePath } = await request.json();
    const fullPath = path.join(PROJECT_ROOT, filePath);
    await fs.unlink(fullPath);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting file:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
} 