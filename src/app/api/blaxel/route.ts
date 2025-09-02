import { NextRequest, NextResponse } from 'next/server';
import { SandboxInstance } from '@blaxel/core';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { auth } from '@/lib/auth';
import { SandboxService } from '@/lib/sandbox-service';
import { BlaxelService } from '@/lib/blaxel';

interface BlaxelRequest {
  action: 'connect' | 'execute' | 'readFile' | 'writeFile' | 'deleteFile' | 'listFiles' | 'downloadGraph' | 'saveGraph' | 'exportProject';
  command?: string;
  path?: string;
  content?: string;
  directory?: string;
  filename?: string;
  userId?: string; // For server-to-server calls
}

// Simple route to interact with Blaxel sandbox
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`[${requestId}] Blaxel API request started`);
  
  try {
    const body: BlaxelRequest = await request.json();
    const { action, command, path, content, directory, userId } = body;

    let user: { id: string; email?: string };
    
    // Handle server-to-server calls with userId parameter or x-user-id header
    const headerUserId = request.headers.get('x-user-id') || undefined;
    if (userId || headerUserId) {
      console.log(`[${requestId}] Server-to-server call with userId: ${userId}`);
      user = { id: (userId || headerUserId)! };
    } else {
      // Handle regular user session authentication
      const session = await auth.api.getSession({ headers: request.headers });
      
      if (!session || !session.user) {
        console.log(`[${requestId}] ERROR: Unauthorized - no user session`);
        return NextResponse.json(
          { error: 'Unauthorized - Please sign in to access your sandbox' },
          { status: 401 }
        );
      }

      user = session.user;
      console.log(`[${requestId}] User authenticated via session: ${user.id}`);
    }

    // Get user's sandbox info
    const sandboxInfo = await SandboxService.getUserSandboxInfo(user.id);
    
    if (!sandboxInfo) {
      console.log(`[${requestId}] ERROR: No sandbox found for user ${user.id}`);
      return NextResponse.json(
        { error: 'No sandbox found. Please initialize your sandbox first.' },
        { status: 404 }
      );
    }

    // Get the actual sandbox name from BlaxelService
    const finalSandboxName = BlaxelService.generateSandboxName(user.id);
    
    console.log(`[${requestId}] Action: ${action}`, {
      userId: user.id,
      sandboxName: finalSandboxName,
      command: command ? command.substring(0, 100) + (command.length > 100 ? '...' : '') : undefined,
      path,
      contentLength: content ? content.length : undefined,
      directory
    });

    let result: any;

    switch (action) {
      case 'connect':
        console.log(`[${requestId}] Attempting to connect to user's sandbox: ${finalSandboxName}`);
        try {
          // Try to get the user's sandbox using BlaxelService
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            // If sandbox doesn't exist, try to create it
            console.log(`[${requestId}] Sandbox not found, attempting to create for user ${user.id}`);
            await BlaxelService.getOrCreateUserSandbox(user.id, user.email || '');
          }
          console.log(`[${requestId}] Successfully connected to user's sandbox`);
          result = { 
            success: true, 
            sandboxName: finalSandboxName,
            userId: user.id,
            previewUrl: sandboxInfo.previewUrl,
            message: 'Connected to user sandbox successfully' 
          };
        } catch (error) {
          console.log(`[${requestId}] Failed to connect to user's sandbox:`, JSON.stringify(error));
          result = { 
            success: false, 
            error: 'Failed to connect to user sandbox',
            fallback: true,
            message: 'Using mock mode for development'
          };
        }
        break;

      case 'execute':
        if (!command) {
          console.log(`[${requestId}] ERROR: No command provided for execute action`);
          return NextResponse.json({ error: 'Command is required for execute action' }, { status: 400 });
        }
        
        console.log(`[${requestId}] Executing command: ${command}`);
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, executing command...`);
          
          // Use the process execution API - try different method names
          const executeResult = await (sandbox.process as any).processExecute ? 
            await (sandbox.process as any).processExecute(command) :
            await (sandbox as any).execute(command);
          console.log(`[${requestId}] Command executed successfully`, {
            outputLength: (executeResult.output || executeResult.stdout || '').length,
            hasStderr: !!(executeResult.stderr)
          });
          result = {
            success: true,
            output: executeResult.output || executeResult.stdout || '',
            stderr: executeResult.stderr || ''
          };
        } catch (error) {
          console.log(`[${requestId}] Command execution failed, using mock:`, JSON.stringify(error));
          // Mock response for development
          result = {
            success: true,
            output: getMockCommandOutput(command),
            mock: true
          };
        }
        break;

      case 'readFile':
        if (!path) {
          console.log(`[${requestId}] ERROR: No path provided for readFile action`);
          return NextResponse.json({ error: 'Path is required for readFile action' }, { status: 400 });
        }
        
        console.log(`[${requestId}] Reading file: ${path}`);
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, reading file...`);
          const content = await sandbox.fs.read(path);
          console.log(`[${requestId}] File read successfully`, {
            contentLength: content.length
          });
          result = {
            success: true,
            content: content
          };
        } catch (error) {
          console.log(`[${requestId}] File read failed, using mock:`, JSON.stringify(error));
          result = {
            success: true,
            content: `// Mock file content for ${path}\nconsole.log("Hello from mock file!");`,
            mock: true
          };
        }
        break;

      case 'writeFile':
        if (!path || content === undefined) {
          console.log(`[${requestId}] ERROR: Missing path or content for writeFile action`);
          return NextResponse.json({ error: 'Path and content are required for writeFile action' }, { status: 400 });
        }
        
        console.log(`[${requestId}] Writing file: ${path}`, { contentLength: content.length });
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, writing file...`);
          
          // Create directory if needed
          const dir = path.substring(0, path.lastIndexOf('/'));
          if (dir) {
            console.log(`[${requestId}] Creating directory: ${dir}`);
            await sandbox.fs.mkdir(dir);
          }
          
          // Write file using Blaxel fs API
          console.log(`[${requestId}] Writing file content...`);
          await sandbox.fs.write(path, content);
          console.log(`[${requestId}] File written successfully`);
          
          result = { success: true, message: 'File written successfully' };
        } catch (error) {
          console.log(`[${requestId}] File write failed, using mock:`, JSON.stringify(error));
          result = { 
            success: true, 
            message: `Mock: File ${path} written successfully`,
            mock: true 
          };
        }
        break;

      case 'deleteFile':
        if (!path) {
          console.log(`[${requestId}] ERROR: No path provided for deleteFile action`);
          return NextResponse.json({ error: 'Path is required for deleteFile action' }, { status: 400 });
        }
        
        console.log(`[${requestId}] Deleting file/directory: ${path}`);
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, deleting file...`);
          await sandbox.fs.rm(path);
          console.log(`[${requestId}] File deleted successfully`);
          result = { success: true, message: 'File deleted successfully' };
        } catch (error) {
          console.log(`[${requestId}] File delete failed, using mock:`, JSON.stringify(error));
          result = { 
            success: true, 
            message: `Mock: File ${path} deleted successfully`,
            mock: true 
          };
        }
        break;

      case 'listFiles':
        const targetDir = directory || '/';
        console.log(`[${requestId}] Listing files in directory: ${targetDir}`);
        
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, listing files...`);
          const lsResult = await sandbox.fs.ls(targetDir);
          const subdirectories = Array.isArray(lsResult?.subdirectories) ? lsResult.subdirectories : [];
          const files = Array.isArray(lsResult?.files) ? lsResult.files : [];

          const normalizeName = (item: any): string => {
            if (typeof item === 'string') return item;
            if (item && typeof item.name === 'string') return item.name;
            if (item && typeof item.path === 'string') {
              const p = item.path as string;
              const parts = p.split('/').filter(Boolean);
              return parts[parts.length - 1] || p;
            }
            return String(item ?? '').toString();
          };

          const normalizePath = (item: any, parent: string): string => {
            if (typeof item === 'string') {
              return parent === '/' ? `/${item}` : `${parent}/${item}`;
            }
            if (item && typeof item.path === 'string') return item.path;
            const name = (item && item.name) ? item.name : normalizeName(item);
            return parent === '/' ? `/${name}` : `${parent}/${name}`;
          };

          // Convert Blaxel format to our expected format, including absolute path
          const allFiles = [
            ...subdirectories.map((dirItem: any) => ({ 
              name: normalizeName(dirItem), 
              path: normalizePath(dirItem, targetDir),
              isDirectory: true 
            })),
            ...files.map((fileItem: any) => ({ 
              name: normalizeName(fileItem), 
              path: normalizePath(fileItem, targetDir),
              isDirectory: false 
            }))
          ];
          
          console.log(`[${requestId}] Files listed successfully`, { fileCount: allFiles.length });
          result = { success: true, files: allFiles };
        } catch (error) {
          console.log(`[${requestId}] File listing failed, using mock:`, JSON.stringify(error));
          result = {
            success: true,
            files: getMockFileList(),
            mock: true
          };
        }
        break;

      case 'downloadGraph':
        console.log(`[${requestId}] Downloading graph from blaxel/app/_graph`);
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, reading graph files...`);
          
          const graphDir = 'blaxel/app/_graph';
          let graphJson = null;
          let varsJson = null;
          
          // Try to read graph.json
          try {
            const graphContent = await sandbox.fs.read(`${graphDir}/graph.json`);
            graphJson = JSON.parse(graphContent);
            console.log(`[${requestId}] graph.json read successfully`);
          } catch (error) {
            console.log(`[${requestId}] Failed to read graph.json:`, JSON.stringify(error));
          }
          
          // Try to read vars.json
          try {
            const varsContent = await sandbox.fs.read(`${graphDir}/vars.json`);
            varsJson = JSON.parse(varsContent);
            console.log(`[${requestId}] vars.json read successfully`);
          } catch (error) {
            console.log(`[${requestId}] Failed to read vars.json:`, JSON.stringify(error));
          }
          
          if (!graphJson && !varsJson) {
            result = {
              success: false,
              error: 'No graph files found in blaxel/app/_graph directory'
            };
          } else {
            result = {
              success: true,
              graph: graphJson,
              vars: varsJson,
              message: `Graph downloaded successfully. Found: ${graphJson ? 'graph.json' : ''} ${varsJson ? 'vars.json' : ''}`.trim()
            };
          }
        } catch (error) {
          console.log(`[${requestId}] Graph download failed:`, JSON.stringify(error));
          result = {
            success: false,
            error: 'Failed to download graph from sandbox',
            details: error instanceof Error ? error.message : 'Unknown error'
          };
        }
        break;

      case 'saveGraph':
        // No-op: avoid local FS writes; keep everything in Blaxel/Supabase
        console.log(`[${requestId}] saveGraph called – ignoring local writes per policy`);
        result = { success: true, message: 'Graph save ignored (use Supabase + Blaxel only)' };
        break;

      case 'exportProject':
        console.log(`[${requestId}] Exporting project files from sandbox`);
        try {
          const sandbox = await BlaxelService.getUserSandbox(user.id);
          if (!sandbox) {
            throw new Error('User sandbox not found');
          }
          console.log(`[${requestId}] User sandbox retrieved, collecting all files...`);
          
          // First verify that we can access the sandbox filesystem
          const appDir = '/blaxel/app';
          try {
            const appLs = await sandbox.fs.ls(appDir);
            console.log(`[${requestId}] App directory listing:`, appLs);
            
            if (!appLs || !appLs.files || !appLs.subdirectories) {
              throw new Error('Invalid response from sandbox filesystem');
            }
          } catch (fsError) {
            console.error(`[${requestId}] Failed to access app directory:`, fsError);
            result = {
              success: false,
              error: 'Failed to access app directory',
              details: fsError instanceof Error ? fsError.message : 'Unknown error'
            };
            break;
          }
          
          // Get all files recursively from the app directory
          const allFiles = await getAllFilesRecursive(sandbox, appDir);
          const fileCount = Object.keys(allFiles).length;
          
          if (fileCount === 0) {
            console.log(`[${requestId}] No files found in sandbox`);
            result = {
              success: false,
              error: 'No files found in sandbox',
              details: 'The recursive file search returned no files'
            };
          } else {
            console.log(`[${requestId}] Found ${fileCount} files to export`);
            result = {
              success: true,
              files: allFiles,
              message: `Exported ${fileCount} files from sandbox`
            };
          }
        } catch (error) {
          console.error(`[${requestId}] Project export failed:`, error);
          result = {
            success: false,
            error: 'Failed to export project from sandbox',
            details: error instanceof Error ? error.message : 'Unknown error'
          };
        }
        break;

      default:
        console.log(`[${requestId}] ERROR: Invalid action: ${action}`);
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }

    console.log(`[${requestId}] Operation completed successfully`, {
      action,
      success: result.success,
      mock: result.mock || false
    });

    return NextResponse.json(result);

  } catch (error) {
    console.error(`[${requestId}] Blaxel API error:`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// Helper function to recursively get all files from sandbox
async function getAllFilesRecursive(sandbox: any, directory: string): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  const collapseDupSegments = (p: string): string => {
    const parts = String(p || '/').split('/').filter(Boolean);
    const out: string[] = [];
    for (const seg of parts) {
      if (out[out.length - 1] === seg) continue;
      out.push(seg);
    }
    return '/' + out.join('/');
  };
  
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
    '.blaxel',
    '.cache',
    '.config',
    '.npm',
    'bin',
    'dev',
    'etc',
    'home',
    'lib',
    'media',
    'mnt',
    'opt',
    'proc',
    'root',
    'run',
    'sbin',
    'srv',
    'sys',
    'uk',
    'usr',
    'var'
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
    'Thumbs.db'
  ]);

  try {
    // Make sure directory is a string
    const dirStr = collapseDupSegments(String(directory));
    console.log(`Listing directory: ${dirStr}`);
    
    // Use the SDK properly according to documentation
    const lsResult = await sandbox.fs.ls(dirStr);
    
    if (!lsResult || typeof lsResult !== 'object') {
      console.log(`Invalid response from ls for ${dirStr}:`, lsResult);
      return files;
    }
    
    // Ensure we have arrays
    const subdirectories = Array.isArray(lsResult.subdirectories) ? lsResult.subdirectories : [];
    const fileList = Array.isArray(lsResult.files) ? lsResult.files : [];
    
    console.log(`Found ${fileList.length} files and ${subdirectories.length} subdirectories in ${dirStr}`);
    
    // Process files in current directory
    for (let i = 0; i < fileList.length; i++) {
      const fileItem = fileList[i];
      // Check if fileItem is an object with path and name properties
      const fileName = typeof fileItem === 'object' && fileItem !== null 
        ? fileItem.name 
        : typeof fileItem === 'string' 
          ? fileItem 
          : null;
      
      if (!fileName) {
        console.log(`Skipping file with invalid name at index ${i}:`, fileItem);
        continue;
      }
      
      if (EXCLUDED_FILES.has(fileName)) {
        console.log(`Skipping excluded file: ${fileName}`);
        continue;
      }
      
      // Get file path - either from the object or construct it
      const rawFilePath = typeof fileItem === 'object' && fileItem !== null && fileItem.path
        ? String(fileItem.path)
        : (dirStr === '/' ? `/${fileName}` : `${dirStr}/${fileName}`);
      const filePath = collapseDupSegments(rawFilePath);
      
      try {
        console.log(`Reading file: ${filePath}`);
        const content = await sandbox.fs.read(filePath);
        
        // Remove leading slash for consistency in the output
        let normalizedPath = filePath.startsWith('/') ? filePath.substring(1) : filePath;
        
        // Keep the full path including blaxel/app prefix for proper file organization
        files[normalizedPath] = content;
        console.log(`Successfully read file: ${normalizedPath}`);
      } catch (error) {
        console.log(`Failed to read file ${filePath}:`, error);
        // Continue with other files
      }
    }
    
    // Process subdirectories recursively
    for (let i = 0; i < subdirectories.length; i++) {
      const dirItem = subdirectories[i];
      // Check if dirItem is an object with path and name properties
      const dirName = typeof dirItem === 'object' && dirItem !== null 
        ? dirItem.name 
        : typeof dirItem === 'string' 
          ? dirItem 
          : null;
      
      if (!dirName) {
        console.log(`Skipping directory with invalid name at index ${i}:`, dirItem);
        continue;
      }
      
      if (EXCLUDED_DIRS.has(dirName)) {
        console.log(`Skipping excluded directory: ${dirName}`);
        continue;
      }
      
      // Get directory path - either from the object or construct it
      const rawDirPath = typeof dirItem === 'object' && dirItem !== null && dirItem.path
        ? String(dirItem.path)
        : (dirStr === '/' ? `/${dirName}` : `${dirStr}/${dirName}`);
      const dirPath = collapseDupSegments(rawDirPath);
      
      console.log(`Recursively processing directory: ${dirPath}`);
      
      try {
        const subFiles = await getAllFilesRecursive(sandbox, dirPath);
        
        // Merge subdirectory files
        Object.assign(files, subFiles);
        console.log(`Merged ${Object.keys(subFiles).length} files from ${dirPath}`);
      } catch (error) {
        console.log(`Failed to process subdirectory ${dirPath}:`, error);
        // Continue with other directories
      }
    }
  } catch (error) {
    console.log(`Failed to list directory ${directory}:`, error);
  }
  
  return files;
}

// Mock command output for development
function getMockCommandOutput(command: string): string {
  console.log('getMockCommandOutput: Generating mock output for command:', command);
  
  if (command.includes('ls -la')) {
    const mockOutput = `total 8
drwxr-xr-x 2 user user 4096 Jan 1 12:00 .
drwxr-xr-x 3 user user 4096 Jan 1 12:00 ..
-rw-r--r-- 1 user user   25 Jan 1 12:00 test.js
-rw-r--r-- 1 user user   50 Jan 1 12:00 README.md`;
    console.log('getMockCommandOutput: Generated ls output');
    return mockOutput;
  } else if (command.includes('cat')) {
    const mockContent = '// Mock file content\nconsole.log("Hello from mock file!");';
    console.log('getMockCommandOutput: Generated cat output');
    return mockContent;
  } else {
    const mockResult = 'Mock command executed successfully';
    console.log('getMockCommandOutput: Generated generic output');
    return mockResult;
  }
}

// Mock file list for development
function getMockFileList() {
  return [
    { name: 'test.js', isDirectory: false, size: 25 },
    { name: 'README.md', isDirectory: false, size: 50 },
    { name: 'src', isDirectory: true },
  ];
}
