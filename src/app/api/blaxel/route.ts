import { NextRequest, NextResponse } from 'next/server';
import { SandboxInstance } from '@blaxel/core';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';

interface BlaxelRequest {
  action: 'connect' | 'execute' | 'readFile' | 'writeFile' | 'deleteFile' | 'listFiles' | 'downloadGraph' | 'saveGraph';
  sandboxName?: string;
  command?: string;
  path?: string;
  content?: string;
  directory?: string;
  filename?: string;
}

// Simple route to interact with Blaxel sandbox
export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`[${requestId}] Blaxel API request started`);
  
  try {
    const body: BlaxelRequest = await request.json();
    const { action, sandboxName, command, path, content, directory } = body;
    
    console.log(`[${requestId}] Action: ${action}`, {
      sandboxName: sandboxName || 'from_env',
      command: command ? command.substring(0, 100) + (command.length > 100 ? '...' : '') : undefined,
      path,
      contentLength: content ? content.length : undefined,
      directory
    });

    // Get sandbox name from BL_SANDBOX_URL or use provided name
    const blSandboxUrl = process.env.BL_SANDBOX_URL;
    const finalSandboxName = sandboxName || (blSandboxUrl ? blSandboxUrl.split('/').pop() : null);
    
    console.log(`[${requestId}] Environment config:`, {
      BL_SANDBOX_URL: blSandboxUrl ? `${blSandboxUrl.substring(0, 50)}...` : 'not_set',
      finalSandboxName,
      hasBlaxelToken: !!process.env.BLAXEL_TOKEN
    });

    if (!finalSandboxName) {
      console.log(`[${requestId}] ERROR: No sandbox name available`);
      return NextResponse.json(
        { error: 'No sandbox name provided and BL_SANDBOX_URL not set' },
        { status: 400 }
      );
    }

    let result: any;

    switch (action) {
      case 'connect':
        console.log(`[${requestId}] Attempting to connect to sandbox: ${finalSandboxName}`);
        try {
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Successfully connected to sandbox`);
          result = { 
            success: true, 
            sandboxName: finalSandboxName,
            message: 'Connected to sandbox successfully' 
          };
        } catch (error) {
          console.log(`[${requestId}] Failed to connect to sandbox:`, JSON.stringify(error));
          result = { 
            success: false, 
            error: 'Failed to connect to sandbox',
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
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, executing command...`);
          
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
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, reading file...`);
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
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, writing file...`);
          
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
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, deleting file...`);
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
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, listing files...`);
          const { subdirectories, files } = await sandbox.fs.ls(targetDir);
          
          // Convert Blaxel format to our expected format
          const allFiles = [
            ...subdirectories.map(dir => ({ name: dir, isDirectory: true })),
            ...files.map(file => ({ name: file, isDirectory: false }))
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
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, reading graph files...`);
          
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
        console.log(`[${requestId}] Saving graph from blaxel/app/_graph to server`);
        try {
          const sandbox = await SandboxInstance.get(finalSandboxName);
          console.log(`[${requestId}] Sandbox retrieved, reading and saving graph files...`);
          
          const graphDir = 'blaxel/app/_graph';
          const savedDir = join(process.cwd(), 'saved');
          let savedFiles: string[] = [];
          
          // Ensure saved directory exists
          try {
            await mkdir(savedDir, { recursive: true });
          } catch (error) {
            // Directory might already exist, that's fine
          }
          
          // Try to read and save graph.json
          try {
            const graphContent = await sandbox.fs.read(`${graphDir}/graph.json`);
            const graphPath = join(savedDir, 'graph.json');
            await writeFile(graphPath, graphContent, 'utf8');
            savedFiles.push('graph.json');
            console.log(`[${requestId}] graph.json saved to ${graphPath}`);
          } catch (error) {
            console.log(`[${requestId}] Failed to read/save graph.json:`, JSON.stringify(error));
          }
          
          // Try to read and save vars.json
          try {
            const varsContent = await sandbox.fs.read(`${graphDir}/vars.json`);
            const varsPath = join(savedDir, 'vars.json');
            await writeFile(varsPath, varsContent, 'utf8');
            savedFiles.push('vars.json');
            console.log(`[${requestId}] vars.json saved to ${varsPath}`);
          } catch (error) {
            console.log(`[${requestId}] Failed to read/save vars.json:`, JSON.stringify(error));
          }
          
          if (savedFiles.length === 0) {
            result = {
              success: false,
              error: 'No graph files found in blaxel/app/_graph directory'
            };
          } else {
            result = {
              success: true,
              savedFiles,
              savedDirectory: 'saved/',
              message: `Graph files saved to server: ${savedFiles.join(', ')}`
            };
          }
        } catch (error) {
          console.log(`[${requestId}] Graph save failed:`, JSON.stringify(error));
          result = {
            success: false,
            error: 'Failed to save graph from sandbox',
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

// Helper function to parse ls output
function parseLsOutput(output: string) {
  if (!output) {
    console.log('parseLsOutput: No output to parse');
    return [];
  }
  
  const lines = output.split('\n').filter(line => line.trim());
  const files = [];
  
  console.log('parseLsOutput: Processing', lines.length, 'lines');
  
  for (const line of lines.slice(1)) { // Skip first line (total)
    const parts = line.split(/\s+/);
    if (parts.length >= 9) {
      const permissions = parts[0];
      const size = parseInt(parts[4]) || 0;
      const name = parts.slice(8).join(' ');
      
      if (name && name !== '.' && name !== '..') {
        files.push({
          name,
          isDirectory: permissions.startsWith('d'),
          size: permissions.startsWith('d') ? undefined : size,
        });
      }
    }
  }
  
  console.log('parseLsOutput: Parsed', files.length, 'files');
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
