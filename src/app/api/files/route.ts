import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { Graph } from '../lib/graphStorage';

// Define the project root directory
const PROJECT_ROOT = process.env.PROJECT_ROOT || path.join(process.cwd(), 'project');

// Blaxel integration utility functions
async function callBlaxelApi(action: string, additionalData: any = {}) {
  try {
    const response = await fetch('http://localhost:3000/api/blaxel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, ...additionalData }),
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

async function readFileFromBlaxel(filePath: string): Promise<string | null> {
  try {
    const result = await callBlaxelApi('readFile', { path: filePath });
    if (result.success) {
      return result.content;
    }
    return null;
  } catch (error) {
    console.log(`Failed to read file from Blaxel: ${filePath}`, error);
    return null;
  }
}

async function writeFileToBlaxel(filePath: string, content: string): Promise<boolean> {
  try {
    const result = await callBlaxelApi('writeFile', { path: filePath, content });
    return result.success;
  } catch (error) {
    console.log(`Failed to write file to Blaxel: ${filePath}`, error);
    return false;
  }
}

async function deleteFileFromBlaxel(filePath: string): Promise<boolean> {
  try {
    const result = await callBlaxelApi('deleteFile', { path: filePath });
    return result.success;
  } catch (error) {
    console.log(`Failed to delete file from Blaxel: ${filePath}`, error);
    return false;
  }
}

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
      // Return specific file content - try Blaxel first, then local
      try {
        let content: string | null = null;
        let source = 'unknown';
        
        // First try to read from Blaxel sandbox
        content = await readFileFromBlaxel(filePath);
        if (content !== null) {
          source = 'Blaxel';
        } else {
          // Fall back to local file system
          const fullPath = path.join(PROJECT_ROOT, filePath);
          try {
            content = await fs.readFile(fullPath, 'utf-8');
            source = 'local';
          } catch (error) {
            return NextResponse.json({ error: 'File not found' }, { status: 404 });
          }
        }
        
        return NextResponse.json({ content, source });
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
    
    let blaxelSuccess = false;
    let localSuccess = false;
    
    // Try to write to Blaxel first
    try {
      blaxelSuccess = await writeFileToBlaxel(filePath, content);
    } catch (error) {
      console.warn('Failed to create file in Blaxel:', error);
    }
    
    // Write to local file system
    try {
      const fullPath = path.join(PROJECT_ROOT, filePath);
      const dirPath = path.dirname(fullPath);
      
      // Ensure directory exists
      await fs.mkdir(dirPath, { recursive: true });
      
      // Write file
      await fs.writeFile(fullPath, content, 'utf-8');
      localSuccess = true;
    } catch (error) {
      console.warn('Failed to create file locally:', error);
    }
    
    if (!blaxelSuccess && !localSuccess) {
      return NextResponse.json({ error: 'Failed to create file in both Blaxel and local file system' }, { status: 500 });
    }
    
    const successMessage = blaxelSuccess && localSuccess ? 
      'File created in both Blaxel and local' :
      blaxelSuccess ? 'File created in Blaxel' :
      'File created locally';
    
    return NextResponse.json({ 
      success: true, 
      message: successMessage,
      blaxelSuccess,
      localSuccess
    });
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
      
      let blaxelSuccess = false;
      let localSuccess = false;
      
      // Check if file exists (either in Blaxel or locally)
      const blaxelContent = await readFileFromBlaxel(filePath);
      const fullPath = path.join(PROJECT_ROOT, filePath);
      let localExists = false;
      try {
        await fs.access(fullPath);
        localExists = true;
      } catch (error) {
        // File doesn't exist locally
      }
      
      if (!blaxelContent && !localExists) {
        return NextResponse.json({ error: 'File does not exist in Blaxel or local file system' }, { status: 404 });
      }
      
      // Try to update in Blaxel
      if (blaxelContent !== null) {
        try {
          blaxelSuccess = await writeFileToBlaxel(filePath, content);
        } catch (error) {
          console.warn('Failed to update file in Blaxel:', error);
        }
      }
      
      // Update local file system
      if (localExists) {
        try {
          console.log('fullPath', fullPath);
          await fs.writeFile(fullPath, content, 'utf-8');
          localSuccess = true;
        } catch (error) {
          console.warn('Failed to update file locally:', error);
        }
      }
      
      const successMessage = blaxelSuccess && localSuccess ? 
        'File updated in both Blaxel and local' :
        blaxelSuccess ? 'File updated in Blaxel' :
        localSuccess ? 'File updated locally' :
        'Failed to update file in both systems';
      
      return NextResponse.json({ 
        success: blaxelSuccess || localSuccess, 
        message: successMessage,
        blaxelSuccess,
        localSuccess
      });
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
      
      let blaxelSuccess = false;
      let localSuccess = false;
      
      // Check if file exists in either location
      const blaxelContent = await readFileFromBlaxel(filePath);
      const fullPath = path.join(PROJECT_ROOT, filePath);
      let localExists = false;
      try {
        await fs.access(fullPath);
        localExists = true;
      } catch (error) {
        // File doesn't exist locally
      }
      
      if (!blaxelContent && !localExists) {
        return NextResponse.json({ error: 'File does not exist in Blaxel or local file system' }, { status: 404 });
      }
      
      // Try to delete from Blaxel
      if (blaxelContent !== null) {
        try {
          blaxelSuccess = await deleteFileFromBlaxel(filePath);
        } catch (error) {
          console.warn('Failed to delete file from Blaxel:', error);
        }
      }
      
      // Delete from local file system
      if (localExists) {
        try {
          await fs.unlink(fullPath);
          localSuccess = true;
        } catch (error) {
          console.warn('Failed to delete file locally:', error);
        }
      }
      
      const successMessage = blaxelSuccess && localSuccess ? 
        'File deleted from both Blaxel and local' :
        blaxelSuccess ? 'File deleted from Blaxel' :
        localSuccess ? 'File deleted locally' :
        'Failed to delete file from both systems';
      
      return NextResponse.json({ 
        success: blaxelSuccess || localSuccess, 
        message: successMessage,
        blaxelSuccess,
        localSuccess
      });
    }
  } catch (error) {
    console.error('Error in DELETE /api/files:', error);
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
  }
} 