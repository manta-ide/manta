import path from 'path';
import fs from 'fs';

/**
 * Get the development project directory path
 * Uses environment variables to determine context:
 * - If MANTA_PROJECT_DIR is set: Use it (user project mode)
 * - Otherwise: Use DEV_PROJECT_DIR env var or 'test-project' (development mode)
 */
export function getDevProjectDir(): string {
  // If MANTA_PROJECT_DIR is set, use it (user project mode)
  if (process.env.MANTA_PROJECT_DIR) {
    return process.env.MANTA_PROJECT_DIR;
  }

  // Support explicit dev project directory override
  if (process.env.MANTA_DEV_PROJECT_DIR) {
    return process.env.MANTA_DEV_PROJECT_DIR;
  }

  // Otherwise, use the configured dev project directory (development mode)
  const devProjectDir = process.env.DEV_PROJECT_DIR || 'test-project';
  return path.join(process.cwd(), devProjectDir);
}

/**
 * Get just the development project directory name (without full path)
 * Uses environment variables to determine context:
 * - If MANTA_PROJECT_DIR is set: returns empty string (current dir)
 * - Otherwise: uses DEV_PROJECT_DIR env var or 'test-project' (development mode)
 */
export function getDevProjectName(): string {
  // If MANTA_PROJECT_DIR is set, return empty string to indicate current dir
  if (process.env.MANTA_PROJECT_DIR) {
    return '';
  }

  // Otherwise, use the configured dev project directory name (development mode)
  return process.env.DEV_PROJECT_DIR || 'test-project';
}

/**
 * Check if a project already exists in the given directory
 * A project exists if it has graph files (manta/current-graph.xml or manta/base-graph.xml)
 */
export function projectExists(projectDir: string = getDevProjectDir()): boolean {
  try {
    const graphDir = path.join(projectDir, 'manta');
    const currentGraphPath = path.join(graphDir, 'current-graph.xml');

    return fs.existsSync(currentGraphPath);
  } catch (error) {
    console.warn('Error checking if project exists:', error);
    return false;
  }
}

/**
 * Check if the directory has any files (excluding hidden files and directories)
 */
export function hasAnyFiles(projectDir: string = getDevProjectDir()): boolean {
  try {
    if (!fs.existsSync(projectDir)) {
      return false;
    }

    const files = fs.readdirSync(projectDir);
    // Filter out hidden files/directories (starting with .)
    const visibleFiles = files.filter(file => !file.startsWith('.'));
    return visibleFiles.length > 0;
  } catch (error) {
    console.warn('Error checking if directory has files:', error);
    return false;
  }
}

