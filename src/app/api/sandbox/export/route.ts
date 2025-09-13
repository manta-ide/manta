import { NextRequest, NextResponse } from 'next/server';
import '@/lib/sandbox-provider';
import { SandboxService } from '@/lib/sandbox-service';

export async function POST(request: NextRequest) {
  const requestId = Math.random().toString(36).substr(2, 9);
  console.log(`[${requestId}] Sandbox export request started`);
  
  try {
    // Use default user
    const user = { id: 'default-user' };
    console.log(`[${requestId}] Using default user: ${user.id}`);

    // Get user's sandbox info
    const sandboxInfo = await SandboxService.getUserSandboxInfo(user.id);
    
    if (!sandboxInfo) {
      console.log(`[${requestId}] ERROR: No sandbox found for user ${user.id}`);
      return NextResponse.json(
        { error: 'No sandbox found. Please initialize your sandbox first.' },
        { status: 404 }
      );
    }

    console.log(`[${requestId}] Exporting project files from sandbox`, { userId: user.id });

    try {
      const sandbox = await SandboxService.getActiveSandbox(user.id);
      if (!sandbox) {
        throw new Error('User sandbox not found');
      }
      console.log(`[${requestId}] User sandbox retrieved, collecting all files...`);
      
      // First verify that we can access the sandbox filesystem
      const appDir = SandboxService.getAppRoot();
      try {
        const appLs = await sandbox.fs.ls(appDir);
        console.log(`[${requestId}] App directory listing:`, appLs);
        
        if (!appLs || !appLs.files || !appLs.subdirectories) {
          throw new Error('Invalid response from sandbox filesystem');
        }
      } catch (fsError) {
        console.error(`[${requestId}] Failed to access app directory:`, fsError);
        return NextResponse.json({
          success: false,
          error: 'Failed to access app directory',
          details: fsError instanceof Error ? fsError.message : 'Unknown error'
        }, { status: 500 });
      }
      
      // Get all files recursively from the app directory
      const allFiles = await getAllFilesRecursive(sandbox, appDir);
      const fileCount = Object.keys(allFiles).length;
      
      if (fileCount === 0) {
        console.log(`[${requestId}] No files found in sandbox`);
        return NextResponse.json({
          success: false,
          error: 'No files found in sandbox',
          details: 'The recursive file search returned no files'
        }, { status: 404 });
      } else {
        console.log(`[${requestId}] Found ${fileCount} files to export`);
        return NextResponse.json({
          success: true,
          files: allFiles,
          message: `Exported ${fileCount} files from sandbox`
        });
      }
    } catch (error) {
      console.error(`[${requestId}] Project export failed:`, error);
      return NextResponse.json({
        success: false,
        error: 'Failed to export project from sandbox',
        details: error instanceof Error ? error.message : 'Unknown error'
      }, { status: 500 });
    }

  } catch (error) {
    console.error(`[${requestId}] Sandbox export API error:`, {
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
        
        // Remove app root prefix if present for cleaner file structure
        const appRoot = SandboxService.getAppRoot().replace(/^\//, '');
        const cleanPath = normalizedPath.replace(new RegExp('^' + appRoot.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\/'), '');
        
        files[cleanPath] = content;
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
