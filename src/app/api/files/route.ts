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

interface GraphNode {
  id: string;
  title: string;
  prompt: string;
  kind: 'page' | 'section' | 'group' | 'component' | 'primitive' | 'behavior';
  what: string;
  how: string;
  properties: string[];
  children: Array<{
    id: string;
    title: string;
    prompt: string;
    kind: 'page' | 'section' | 'group' | 'component' | 'primitive' | 'behavior';
  }>;
}

interface Graph {
  rootId: string;
  nodes: GraphNode[];
}

const PROJECT_ROOT = path.join(process.cwd(), 'base-template');

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

// Function to save graph data to JSON file
async function saveGraphToFile(sessionId: string, graph: Graph): Promise<void> {
  try {
    const graphFilePath = path.join(PROJECT_ROOT, `graph-${sessionId}.json`);
    await fs.writeFile(graphFilePath, JSON.stringify(graph, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving graph to file:', error);
    throw error;
  }
}

// Function to load graph data from JSON file
async function loadGraphFromFile(sessionId: string): Promise<Graph | null> {
  try {
    const graphFilePath = path.join(PROJECT_ROOT, `graph-${sessionId}.json`);
    const content = await fs.readFile(graphFilePath, 'utf-8');
    return JSON.parse(content) as Graph;
  } catch (error) {
    console.error('Error loading graph from file:', error);
    return null;
  }
}

// Function to get all graph files
async function getAllGraphFiles(): Promise<{ sessionId: string; graph: Graph }[]> {
  try {
    const files = await fs.readdir(PROJECT_ROOT);
    const graphFiles = files.filter(file => file.startsWith('graph-') && file.endsWith('.json'));
    
    const graphs: { sessionId: string; graph: Graph }[] = [];
    
    for (const file of graphFiles) {
      const sessionId = file.replace('graph-', '').replace('.json', '');
      const graph = await loadGraphFromFile(sessionId);
      if (graph) {
        graphs.push({ sessionId, graph });
      }
    }
    
    return graphs;
  } catch (error) {
    console.error('Error getting all graph files:', error);
    return [];
  }
}

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

// GET: Load file list with lengths (for conversation storage)
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const listOnly = url.searchParams.get('list') === 'true';
    const filePath = url.searchParams.get('path');
    const loadGraphs = url.searchParams.get('graphs') === 'true';
    
    if (filePath) {
      // Return specific file content
      const { files } = await readDirectoryStructure(PROJECT_ROOT);
      const content = files.get(filePath) || '';
      return NextResponse.json({ content, path: filePath });
    } else if (listOnly) {
      // Return just file list with lengths
      const { files } = await readDirectoryStructure(PROJECT_ROOT);

      const fileList = Array.from(files.entries()).map(([path, content]) => ({
        route: path,
        lines: content.split('\n').length
      }));
      return NextResponse.json({ files: fileList });
    } else {
      // Return full files and file tree
      const { files, fileTree } = await readDirectoryStructure(PROJECT_ROOT);
      const filesObj = Object.fromEntries(files);
      
      let graphs: { sessionId: string; graph: Graph }[] = [];
      if (loadGraphs) {
        graphs = await getAllGraphFiles();
      }
      
      return NextResponse.json({ 
        files: filesObj, 
        fileTree,
        graphs 
      });
    }
  } catch (error) {
    console.error('Error loading project:', error);
    return NextResponse.json({ error: 'Failed to load project' }, { status: 500 });
  }
}

// POST: Create new file
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Check if this is a graph save request
    if (body.type === 'graph') {
      const { sessionId, graph } = body;
      await saveGraphToFile(sessionId, graph);
      return NextResponse.json({ success: true, message: 'Graph saved successfully' });
    }
    
    // Regular file creation
    const { filePath, content } = body;
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
    const body = await request.json();
    
    // Check if this is a graph save request
    if (body.type === 'graph') {
      const { sessionId, graph } = body;
      await saveGraphToFile(sessionId, graph);
      return NextResponse.json({ success: true, message: 'Graph updated successfully' });
    }
    
    // Regular file update
    const { filePath, content } = body;
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
    const body = await request.json();
    
    // Check if this is a graph delete request
    if (body.type === 'graph') {
      const { sessionId } = body;
      const graphFilePath = path.join(PROJECT_ROOT, `graph-${sessionId}.json`);
      await fs.unlink(graphFilePath);
      return NextResponse.json({ success: true, message: 'Graph deleted successfully' });
    }
    
    // Regular file/directory deletion
    const { filePath, isDirectory } = body;
    const fullPath = path.join(PROJECT_ROOT, filePath);
    
    if (isDirectory) {
      // Delete directory (only if empty)
      await fs.rmdir(fullPath);
    } else {
      // Delete file
      await fs.unlink(fullPath);
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
} 