import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDevProjectDir } from '@/lib/project-config';

const projectDir = () => {
  // Use the configured development project directory
  try {
    const devProjectDir = getDevProjectDir();
    if (require('fs').existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }

  // Fallback to current directory if dev project directory doesn't exist
  return process.cwd();
};
const IGNORE = new Set(['node_modules', '.git', '.next', 'dist', 'build', 'out', 'manta', 'coverage']);

type FileNode = { name: string; path: string; type: 'file'|'directory'; children?: FileNode[]; content?: string };

function listDir(root: string, rel = ''): FileNode[] {
  const abs = path.join(root, rel);
  let entries: fs.Dirent[] = [];
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return []; }
  const nodes: FileNode[] = [];
  for (const e of entries) {
    const name = e.name;
    if (IGNORE.has(name)) continue;
    const relPath = path.join(rel, name).replaceAll('\\', '/');
    if (e.isDirectory()) {
      nodes.push({ name, path: relPath, type: 'directory', children: listDir(root, relPath) });
    } else if (e.isFile()) {
      nodes.push({ name, path: relPath, type: 'file' });
    }
  }
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1));
  return nodes;
}

function readSomeFiles(root: string, maxBytes = 800_000): Map<string, string> {
  const out = new Map<string, string>();
  const walk = (nodes: FileNode[]) => {
    for (const n of nodes) {
      if (n.type === 'directory' && n.children) walk(n.children);
      if (n.type === 'file') {
        const abs = path.join(root, n.path);
        try {
          const stat = fs.statSync(abs);
          if (stat.size > 200_000) continue; // skip large files
          if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".pdf"].some(ext => n.name.toLowerCase().endsWith(ext))) continue;
          const content = fs.readFileSync(abs, 'utf8');
          if (([...out.values()].join('').length + content.length) > maxBytes) return; // stop if exceeding budget
          out.set(n.path, content);
        } catch {}
      }
    }
  };
  const tree = listDir(root);
  walk(tree);
  return out;
}

export async function GET(_req: NextRequest) {
  const root = projectDir();
  const tree = listDir(root);
  const files = Object.fromEntries(readSomeFiles(root));
  return NextResponse.json({ files, fileTree: tree });
}

export async function PUT(req: NextRequest) {
  try {
    const { filePath, content } = await req.json();
    if (!filePath || typeof content !== 'string') {
      return NextResponse.json({ success: false, error: 'filePath and content required' }, { status: 400 });
    }
    const root = projectDir();
    const abs = path.join(root, filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf8');
    return NextResponse.json({ success: true });
  } catch (e) {
    return NextResponse.json({ success: false, error: 'Failed to write file' }, { status: 500 });
  }
}

