import path from 'path';
import fs from 'fs';

/**
 * Get the development project directory path
 * Uses environment variables set by dev.js to determine context:
 * - MANTA_MODE=user-project: Use MANTA_PROJECT_DIR (production mode)
 * - Otherwise: Use DEV_PROJECT_DIR env var or 'test-project' (development mode)
 */
export function getDevProjectDir(): string {
  // If we're in user project mode (production), use the project directory set by dev.js
  if (process.env.MANTA_MODE === 'user-project' && process.env.MANTA_PROJECT_DIR) {
    return process.env.MANTA_PROJECT_DIR;
  }

  // Otherwise, use the configured dev project directory (development mode)
  const devProjectDir = process.env.DEV_PROJECT_DIR || 'test-project';
  return path.join(process.cwd(), devProjectDir);
}

/**
 * Get just the development project directory name (without full path)
 * Uses environment variables set by dev.js to determine context:
 * - MANTA_MODE=user-project: returns empty string (current dir)
 * - Otherwise: uses DEV_PROJECT_DIR env var or 'test-project' (development mode)
 */
export function getDevProjectName(): string {
  // If we're in user project mode (production), return empty string to indicate current dir
  if (process.env.MANTA_MODE === 'user-project') {
    return '';
  }

  // Otherwise, use the configured dev project directory name (development mode)
  return process.env.DEV_PROJECT_DIR || 'test-project';
}

/**
 * Check if a project already exists in the given directory
 * A project exists if it has graph files (_graph/current-graph.xml or _graph/base-graph.xml)
 */
export function projectExists(projectDir: string = getDevProjectDir()): boolean {
  try {
    const graphDir = path.join(projectDir, '_graph');
    const currentGraphPath = path.join(graphDir, 'current-graph.xml');
    const baseGraphPath = path.join(graphDir, 'base-graph.xml');

    return fs.existsSync(currentGraphPath) || fs.existsSync(baseGraphPath);
  } catch (error) {
    console.warn('Error checking if project exists:', error);
    return false;
  }
}

/**
 * Check if there's a Next.js project in the directory (has package.json and next.config files)
 */
export function hasNextJsProject(projectDir: string = getDevProjectDir()): boolean {
  try {
    const packageJsonPath = path.join(projectDir, 'package.json');
    const nextConfigPath = path.join(projectDir, 'next.config.mjs');
    const nextConfigJsPath = path.join(projectDir, 'next.config.js');
    const nextConfigTsPath = path.join(projectDir, 'next.config.ts');

    const hasPackageJson = fs.existsSync(packageJsonPath);
    const hasNextConfig = fs.existsSync(nextConfigPath) ||
                         fs.existsSync(nextConfigJsPath) ||
                         fs.existsSync(nextConfigTsPath);

    return hasPackageJson && hasNextConfig;
  } catch (error) {
    console.warn('Error checking if Next.js project exists:', error);
    return false;
  }
}
