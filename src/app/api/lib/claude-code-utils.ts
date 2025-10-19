import { getDevProjectDir } from '@/lib/project-config';
import * as fs from 'fs';

// Helper function to get base URL from request
export function getBaseUrl(req: any): string {
  const host = req.headers.get('host') || 'localhost:3000';
  const protocol = req.headers.get('x-forwarded-proto') || (host.includes('localhost') ? 'http' : 'https');
  return `${protocol}://${host}`;
}

// Filesystem helpers
export function projectDir(): string {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (fs.existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  try {
    return process.cwd();
  } catch {
    return process.cwd();
  }
}
