import path from 'path';

/**
 * Get the development project directory path
 * Uses environment variable DEV_PROJECT_DIR if set, otherwise falls back to 'test-project'
 */
export function getDevProjectDir(): string {
  const devProjectDir = process.env.DEV_PROJECT_DIR || 'test-project';
  return path.join(process.cwd(), devProjectDir);
}

/**
 * Get just the development project directory name (without full path)
 * Uses environment variable DEV_PROJECT_DIR if set, otherwise falls back to 'test-project'
 */
export function getDevProjectName(): string {
  return process.env.DEV_PROJECT_DIR || 'test-project';
}
