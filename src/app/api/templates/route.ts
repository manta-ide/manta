import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getDevProjectDir } from '@/lib/project-config';

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
    const templates: { name: string; type: 'partial' | 'full'; description: string }[] = [];

    // Check if templates directory exists
    if (!fs.existsSync(templatesDir)) {
      return NextResponse.json({ templates: [] });
    }

    // Read template directories
    const templateDirs = fs.readdirSync(templatesDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const templateName of templateDirs) {
      const templatePath = path.join(templatesDir, templateName);
      const readmePath = path.join(templatePath, 'README.md');

      let description = `Template: ${templateName}`;
      if (fs.existsSync(readmePath)) {
        try {
          const readmeContent = fs.readFileSync(readmePath, 'utf8');
          const firstLine = readmeContent.split('\n')[0];
          if (firstLine && firstLine.startsWith('#')) {
            description = firstLine.substring(1).trim();
          }
        } catch (error) {
          console.warn(`Failed to read README for template ${templateName}:`, error);
        }
      }

      const type = templateName.includes('partial') ? 'partial' : 'full';
      templates.push({
        name: templateName,
        type: type as 'partial' | 'full',
        description
      });
    }

    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Error listing templates:', error);
    return NextResponse.json({ error: 'Failed to list templates' }, { status: 500 });
  }
}

// Apply template
export async function POST(req: NextRequest) {
  try {
    const { templateName, type } = await req.json();

    if (!templateName) {
      return NextResponse.json({ error: 'Template name is required' }, { status: 400 });
    }

    const templatePath = path.join(templatesDir, templateName);
    const projectDir = getProjectDir();

    // Check if template exists
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    console.log(`📦 Applying ${type} template: ${templateName}`);

    let result;
    if (type === 'full') {
      // For full template, replace everything (except node_modules and .git)
      result = await applyFullTemplate(templatePath, projectDir);
    } else if (type === 'partial') {
      // For partial template, merge without overwriting existing files
      result = await applyPartialTemplate(templatePath, projectDir);
    } else {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
    }

    console.log(`✅ Template ${templateName} applied successfully`);
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

// Apply full template (replace project)
async function applyFullTemplate(templatePath: string, projectDir: string) {
  const result = {
    added: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
    removed: [] as string[]
  };

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

  // Copy template files
  const copyResult = await copyDirectory(templatePath, projectDir, true, result);
  return { ...result, ...copyResult };
}

// Apply partial template (merge without overwriting)
async function applyPartialTemplate(templatePath: string, projectDir: string) {
  const result = {
    added: [] as string[],
    updated: [] as string[],
    skipped: [] as string[],
    removed: [] as string[]
  };

  const copyResult = await copyDirectory(templatePath, projectDir, false, result); // false = don't overwrite
  return { ...result, ...copyResult };
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
