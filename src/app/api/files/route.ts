import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Graph } from '../lib/graphStorage';

// Define the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(process.cwd(), 'project');

// Define excluded directories and files
const EXCLUDED_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  '.vscode',
  '.idea',
  'logs',
  'tmp',
  'temp',
  'src/api',
  '.graph',
  '.gitignore',
]);

const EXCLUDED_FILES = new Set([
  '.env',
  '.env.local',
  '.env.development.local',
  '.env.test.local',
  '.env.production.local',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  '.DS_Store',
  'Thumbs.db',
  'vars.ts',
  'vars-client.ts',
  'use-mobile.ts',
  'use-outside-edges.ts',
  'use-theme.ts',
]);

// Function to save graph data to JSON file
async function saveGraphToFile(graph: Graph): Promise<void> {
  try {
    const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
    await fs.writeFile(graphFilePath, JSON.stringify(graph, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving graph to file:', error);
    throw error;
  }
}

// Function to load graph data from JSON file
async function loadGraphFromFile(): Promise<Graph | null> {
  try {
    const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
    const content = await fs.readFile(graphFilePath, 'utf-8');
    return JSON.parse(content) as Graph;
  } catch (error: any) {
    // Don't log ENOENT errors (file not found) as they're expected when no graph exists
    if (error.code === 'ENOENT') {
      console.log('ℹ️ No graph file found');
    } else {
      console.error('Error loading graph from file:', error);
    }
    return null;
  }
}

// Function to get all graph files
async function getAllGraphFiles(): Promise<{ sessionId: string; graph: Graph }[]> {
  try {
    const graph = await loadGraphFromFile();
    if (graph) {
      return [{ sessionId: 'default', graph }];
    }
    return [];
  } catch (error) {
    console.error('Error getting graph file:', error);
    return [];
  }
}

// Function to recursively read directory structure
async function readDirectoryStructure(dirPath: string, relativePath: string = ''): Promise<{ files: Map<string, string>, fileTree: FileNode[] }> {
  const files = new Map<string, string>();
  const fileTree: FileNode[] = [];
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    console.log('entries', entries);
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
    console.error('Error reading directory structure:', error);
  }
  
  return { files, fileTree };
}

import { FileNode } from '../lib/schemas';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const listOnly = url.searchParams.get('list') === 'true';
    const includeGraphs = url.searchParams.get('graphs') === 'true';
    const filePath = url.searchParams.get('path');

    // Ensure project directory exists
    await fs.mkdir(PROJECT_ROOT, { recursive: true });
    if (filePath) {
      // Return specific file content
      const fullPath = path.join(PROJECT_ROOT, filePath);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        return NextResponse.json({ content });
      } catch (error) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
    }
    
    if (listOnly) {
      // Return just the file list with line counts
      const { files } = await readDirectoryStructure(PROJECT_ROOT);
      const fileList = Array.from(files.entries()).map(([path, content]) => ({
        route: path,
        lines: content.split('\n').length
      }));
      return NextResponse.json({ files: fileList });
    }
    
    // Return full file structure
    const { files, fileTree } = await readDirectoryStructure(PROJECT_ROOT);
    
    const response: any = {
      files: Object.fromEntries(files),
      fileTree
    };
    
    if (includeGraphs) {
      const graphs = await getAllGraphFiles();
      response.graphs = graphs;
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
    
    const fullPath = path.join(PROJECT_ROOT, filePath);
    const dirPath = path.dirname(fullPath);
    
    // Ensure directory exists
    await fs.mkdir(dirPath, { recursive: true });
    
    // Write file
    await fs.writeFile(fullPath, content, 'utf-8');
    
    return NextResponse.json({ success: true, message: 'File created successfully' });
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
      await saveGraphToFile(graph);
      return NextResponse.json({ success: true, message: 'Graph saved successfully' });
    } else {
      // Handle file update
      const { filePath, content } = body;
      console.log('filePath', filePath);
      if (!filePath || content === undefined) {
        return NextResponse.json({ error: 'filePath and content are required' }, { status: 400 });
      }
      
      const fullPath = path.join(PROJECT_ROOT, filePath);
      console.log('fullPath', fullPath);
      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');
      
      return NextResponse.json({ success: true, message: 'File updated successfully' });
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
      // Handle graph deletion
      const graphFilePath = path.join(PROJECT_ROOT, 'graph.json');
      try {
        await fs.unlink(graphFilePath);
        return NextResponse.json({ success: true, message: 'Graph deleted successfully' });
      } catch (error) {
        // File might not exist, which is fine
        return NextResponse.json({ success: true, message: 'Graph deleted successfully' });
      }
    } else {
      // Handle file deletion
      const { filePath } = body;
      
      if (!filePath) {
        return NextResponse.json({ error: 'filePath is required' }, { status: 400 });
      }
      
      const fullPath = path.join(PROJECT_ROOT, filePath);
      
      // Delete file
      await fs.unlink(fullPath);
      
      return NextResponse.json({ success: true, message: 'File deleted successfully' });
    }
  } catch (error) {
    console.error('Error in DELETE /api/files:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
} 