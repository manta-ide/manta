import path from 'path';

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
