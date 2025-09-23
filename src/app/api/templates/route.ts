import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDevProjectDir } from '@/lib/project-config';
import JSZip from 'jszip';

const templatesDir = path.join(process.cwd(), '_templates');

// Get project directory
const getProjectDir = () => {
  try {
    const devProjectDir = getDevProjectDir();
    if (fs.existsSync(devProjectDir)) {
      return devProjectDir;
    }
  } catch (error) {
    console.warn('Failed to get dev project directory, falling back to current directory:', error);
  }
  return process.cwd();
};

// List available templates
export async function GET() {
  try {
    const configPath = path.join(process.cwd(), 'templates-config.json');

    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ templates: [] });
    }

    const configContent = fs.readFileSync(configPath, 'utf8');
    const config = JSON.parse(configContent);

    const templates = config.templates.map((template: any) => ({
      ...template,
      id: template.branch,
      type: 'full' as const
    }));

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}

// Apply template
export async function POST(req: NextRequest) {
  try {
    const { templateBranch } = await req.json();

    if (!templateBranch) {
      return NextResponse.json({ error: 'Template branch is required' }, { status: 400 });
    }

    const projectDir = getProjectDir();

    console.log(`📦 Applying template from branch: ${templateBranch}`);

    // Download and apply template from GitHub
    const result = await downloadAndApplyTemplate(templateBranch, projectDir);

    console.log(`✅ Template ${templateBranch} applied successfully`);
    return NextResponse.json({
      success: true,
      message: 'Template applied successfully',
      details: result
    });
  } catch (error) {
    console.error('Error applying template:', error);
    return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 });
  }
}

// Download and apply template from GitHub
async function downloadAndApplyTemplate(branch: string, projectDir: string) {
  const configPath = path.join(process.cwd(), 'templates-config.json');
  const configContent = fs.readFileSync(configPath, 'utf8');
  const config = JSON.parse(configContent);

  const result = {
    added: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
    removed: [] as string[]
  };

  // Handle partial template specially - use local files instead of GitHub
  if (branch === 'partial') {
    const partialTemplatePath = path.join(process.cwd(), '_templates', 'partial-template');
    console.log(`📦 Applying local partial template`);

    // For partial templates, don't remove existing files - just merge
    const copyResult = await copyDirectory(partialTemplatePath, projectDir, false, result);
    return { ...result, ...copyResult };
  }

  // For full templates, download from GitHub
  const repoSpec = config.repo;
  const token = process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN || '';

  const zipUrl = `https://codeload.github.com/${repoSpec}/zip/refs/heads/${encodeURIComponent(branch)}`;
  console.log(`📥 Downloading template from ${repoSpec}@${branch}`);

  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const resp = await fetch(zipUrl, { headers });
  if (!resp.ok) {
    throw new Error(`Failed to download ZIP: ${resp.status} ${resp.statusText}`);
  }

  const ab = await resp.arrayBuffer();
  const zip = await JSZip.loadAsync(ab);

  // Detect top-level folder prefix (e.g., repo-ref/)
  let rootPrefix = '';
  zip.forEach((relPath) => {
    const parts = relPath.split('/');
    if (parts.length > 1 && !rootPrefix) rootPrefix = parts[0] + '/';
  });

  // Remove existing files (except protected directories)
  const protectedDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build']);
  const entries = fs.readdirSync(projectDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && !protectedDirs.has(entry.name)) {
      const dirPath = path.join(projectDir, entry.name);
      fs.rmSync(dirPath, { recursive: true, force: true });
      result.removed.push(path.relative(process.cwd(), dirPath) + '/');
    } else if (entry.isFile()) {
      const filePath = path.join(projectDir, entry.name);
      fs.unlinkSync(filePath);
      result.removed.push(path.relative(process.cwd(), filePath));
    }
  }

  // Write template files
  const entries2 = Object.values(zip.files);
  let written = 0;
  for (const entry of entries2) {
    if (entry.dir) continue;

    const rel = rootPrefix && entry.name.startsWith(rootPrefix)
      ? entry.name.slice(rootPrefix.length)
      : entry.name;

    if (!rel) continue;

    const abs = path.join(projectDir, rel);
    const dir = path.dirname(abs);
    fs.mkdirSync(dir, { recursive: true });

    const exists = fs.existsSync(abs);
    const relativePath = path.relative(process.cwd(), abs);

    if (!exists) {
      const content = await entry.async('nodebuffer');
      fs.writeFileSync(abs, content);
      result.added.push(relativePath);
      written++;
    } else {
      result.skipped.push(relativePath);
    }
  }

  console.log(`📝 Wrote ${written} files from template`);

  return result;
}

// Recursive directory copy function
async function copyDirectory(src: string, dest: string, overwrite: boolean = true, result?: { added: string[], updated: string[], skipped: string[] }) {
  // Ensure destination directory exists
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      // Skip certain directories
      if (['node_modules', '.git', '.next', 'dist', 'build'].includes(entry.name)) {
        continue;
      }

      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      await copyDirectory(srcPath, destPath, overwrite, result);
    } else if (entry.isFile()) {
      // Check if file already exists
      const exists = fs.existsSync(destPath);
      const relativePath = path.relative(process.cwd(), destPath);

      if (!exists || overwrite) {
        // Only copy if file doesn't exist (for partial) or if overwrite is true (for full)
        fs.copyFileSync(srcPath, destPath);
        console.log(`${exists ? '📝 Updated' : '➕ Added'}: ${relativePath}`);

        if (result) {
          if (exists) {
            result.updated.push(relativePath);
          } else {
            result.added.push(relativePath);
          }
        }
      } else {
        console.log(`⏭️ Skipped (exists): ${relativePath}`);
        if (result) {
          result.skipped.push(relativePath);
        }
      }
    }
  }

  return result || { added: [], updated: [], skipped: [] };
}
