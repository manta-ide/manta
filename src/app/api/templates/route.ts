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
    const { templateBranch, ensurePartial } = await req.json();

    const projectDir = getProjectDir();

    if (ensurePartial) {
      console.log('🔍 Ensuring partial template files are present...');

      // Check if any required files are missing or contain placeholders
      const requiredFiles = [
        'manta/base-graph.xml',
        'manta/current-graph.xml',
        '.claude/agents/code-builder.md',
        '.claude/agents/graph-editor.md'
      ];

      let needsUpdate = false;
      for (const file of requiredFiles) {
        const filePath = path.join(projectDir, file);
        if (!fs.existsSync(filePath)) {
          console.log(`📭 Missing file: ${file}`);
          needsUpdate = true;
          break;
        }

        // Check for placeholder content in agent files
        if (file.includes('code-builder.md') || file.includes('graph-editor.md')) {
          const content = fs.readFileSync(filePath, 'utf8');
          if (content.includes('This agent configuration will be dynamically generated')) {
            console.log(`📝 Placeholder content found in: ${file}`);
            needsUpdate = true;
            break;
          }
        }
      }

      if (needsUpdate) {
        console.log('ℹ️ Some partial template files are missing or outdated, applying partial template...');
        const result = await downloadAndApplyTemplate('partial', projectDir);
        console.log('✅ Partial template applied to ensure missing/outdated files');
        return NextResponse.json({
          success: true,
          message: 'Partial template applied successfully with project-specific agent configurations',
          details: result
        });
      } else {
        console.log('✅ All partial template files are present');
        return NextResponse.json({
          success: true,
          message: 'All partial template files are present',
          details: { added: [], updated: [], skipped: requiredFiles.map(f => f) }
        });
      }
    }

    if (!templateBranch) {
      return NextResponse.json({ error: 'Template branch is required' }, { status: 400 });
    }

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

  // Handle partial template specially - generate minimal structure in memory
  if (branch === 'partial') {
    console.log(`📦 Generating minimal partial template in memory`);

    // Create minimal manta structure
    const mantaDir = path.join(projectDir, 'manta');
    const claudeDir = path.join(projectDir, '.claude', 'agents');

    // Create directories
    fs.mkdirSync(mantaDir, { recursive: true });
    fs.mkdirSync(claudeDir, { recursive: true });

    // Create empty graph files
    const emptyGraph = `<?xml version="1.0" encoding="UTF-8"?>
<graph xmlns="urn:app:graph" version="1.0" directed="true">
  <nodes>
  </nodes>

  <edges>
  </edges>
</graph>`;

    const baseGraphPath = path.join(mantaDir, 'base-graph.xml');
    const currentGraphPath = path.join(mantaDir, 'current-graph.xml');

    if (!fs.existsSync(baseGraphPath)) {
      fs.writeFileSync(baseGraphPath, emptyGraph);
      result.added.push(path.relative(process.cwd(), baseGraphPath));
    } else {
      result.skipped.push(path.relative(process.cwd(), baseGraphPath));
    }

    if (!fs.existsSync(currentGraphPath)) {
      fs.writeFileSync(currentGraphPath, emptyGraph);
      result.added.push(path.relative(process.cwd(), currentGraphPath));
    } else {
      result.skipped.push(path.relative(process.cwd(), currentGraphPath));
    }

    // Generate proper agent configurations using project-status API
    const codeBuilderPath = path.join(claudeDir, 'code-builder.md');
    const graphEditorPath = path.join(claudeDir, 'graph-editor.md');

    // Generate agents if they don't exist or contain placeholder text
    const codeBuilderExists = fs.existsSync(codeBuilderPath);
    const graphEditorExists = fs.existsSync(graphEditorPath);

    let needsGeneration = !codeBuilderExists || !graphEditorExists;

    // Check if existing files contain placeholder text
    if (codeBuilderExists) {
      const content = fs.readFileSync(codeBuilderPath, 'utf8');
      if (content.includes('This agent configuration will be dynamically generated')) {
        needsGeneration = true;
      }
    }

    if (graphEditorExists) {
      const content = fs.readFileSync(graphEditorPath, 'utf8');
      if (content.includes('This agent configuration will be dynamically generated')) {
        needsGeneration = true;
      }
    }

    if (needsGeneration) {
      try {
        console.log('🤖 Generating agent configurations from project analysis...');

        // Call the project-status API to generate agents
        const { generateCodeBuilderAgent, generateGraphEditorAgent } = await import('@/app/api/lib/agentPrompts');

        // Analyze project structure (same logic as project-status API)
        const projectAnalysis = await analyzeProjectStructure(projectDir);

        // Generate agents based on analysis
        const codeBuilderAgent = generateCodeBuilderAgent(projectAnalysis);
        const graphEditorAgent = generateGraphEditorAgent(projectAnalysis);

        if (!codeBuilderExists) {
          fs.writeFileSync(codeBuilderPath, codeBuilderAgent);
          result.added.push(path.relative(process.cwd(), codeBuilderPath));
          console.log('✅ Generated code-builder.md agent configuration');
        } else {
          fs.writeFileSync(codeBuilderPath, codeBuilderAgent);
          result.updated.push(path.relative(process.cwd(), codeBuilderPath));
          console.log('✅ Updated code-builder.md agent configuration');
        }

        if (!graphEditorExists) {
          fs.writeFileSync(graphEditorPath, graphEditorAgent);
          result.added.push(path.relative(process.cwd(), graphEditorPath));
          console.log('✅ Generated graph-editor.md agent configuration');
        } else {
          fs.writeFileSync(graphEditorPath, graphEditorAgent);
          result.updated.push(path.relative(process.cwd(), graphEditorPath));
          console.log('✅ Updated graph-editor.md agent configuration');
        }
      } catch (error) {
        console.warn('⚠️ Failed to generate agent configurations, using placeholders:', error);

        // Fallback to placeholder agents if generation fails
        const codeBuilderAgent = `---
name: code-builder
description: Code builder agent. This is a placeholder that gets dynamically generated when the app starts based on your project structure.
tools: mcp__graph-tools__read, Read, Write, Edit, Bash, MultiEdit, NotebookEdit, Glob, Grep, WebFetch, TodoWrite, ExitPlanMode, BashOutput, KillShell
---

This agent configuration will be dynamically generated based on your project structure when the app starts.`;

        const graphEditorAgent = `---
name: graph-editor
description: Graph structure editor with code analysis. This is a placeholder that gets dynamically generated when the app starts based on your project structure.
tools: mcp__graph-tools__read, mcp__graph-tools__node_create, mcp__graph-tools__node_edit, mcp__graph-tools__node_delete, mcp__graph-tools__edge_create, mcp__graph-tools__edge_delete, Read, Glob, Grep
---

This agent configuration will be dynamically generated based on your project structure when the app starts.`;

        if (!fs.existsSync(codeBuilderPath)) {
          fs.writeFileSync(codeBuilderPath, codeBuilderAgent);
          result.added.push(path.relative(process.cwd(), codeBuilderPath));
        } else {
          result.skipped.push(path.relative(process.cwd(), codeBuilderPath));
        }

        if (!fs.existsSync(graphEditorPath)) {
          fs.writeFileSync(graphEditorPath, graphEditorAgent);
          result.added.push(path.relative(process.cwd(), graphEditorPath));
        } else {
          result.skipped.push(path.relative(process.cwd(), graphEditorPath));
        }
      }
    } else {
      result.skipped.push(path.relative(process.cwd(), codeBuilderPath));
      result.skipped.push(path.relative(process.cwd(), graphEditorPath));
    }

    return result;
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

async function analyzeProjectStructure(projectDir: string) {
  const analysis = {
    hasNextJs: false,
    hasReact: false,
    hasTypeScript: false,
    hasTailwind: false,
    framework: 'unknown' as string,
    components: [] as string[],
    pages: [] as string[],
    libs: [] as string[],
    styling: 'unknown' as string
  };

  // Check for Next.js
  if (fs.existsSync(path.join(projectDir, 'next.config.js')) ||
    fs.existsSync(path.join(projectDir, 'next.config.mjs'))) {
    analysis.hasNextJs = true;
    analysis.framework = 'Next.js';
  }

  // Check for React
  if (fs.existsSync(path.join(projectDir, 'package.json'))) {
    const packageJson = JSON.parse(
      fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8')
    );

    if (packageJson.dependencies?.['react'] || packageJson.devDependencies?.['react']) {
      analysis.hasReact = true;
    }

    if (packageJson.dependencies?.['typescript'] || packageJson.devDependencies?.['typescript']) {
      analysis.hasTypeScript = true;
    }

    if (packageJson.dependencies?.['tailwindcss'] || packageJson.devDependencies?.['tailwindcss']) {
      analysis.hasTailwind = true;
      analysis.styling = 'Tailwind CSS';
    }
  }

  // Check for components
  const componentsDir = path.join(projectDir, 'src', 'components');
  if (fs.existsSync(componentsDir)) {
    const componentFiles = fs.readdirSync(componentsDir, { recursive: true })
      .filter((file: any) => typeof file === 'string' && (file.endsWith('.tsx') || file.endsWith('.jsx')))
      .map((file: any) => path.basename(file, path.extname(file)));
    analysis.components = componentFiles;
  }

  // Check for pages/routes
  const appDir = path.join(projectDir, 'src', 'app');
  if (fs.existsSync(appDir)) {
    const pageFiles = fs.readdirSync(appDir, { recursive: true })
      .filter((file: any) => typeof file === 'string' && file === 'page.tsx')
      .map((file: any) => {
        const relativePath = path.relative(appDir, path.dirname(file as string));
        return relativePath === '' ? '/' : `/${relativePath}`;
      });
    analysis.pages = pageFiles;
  }

  return analysis;
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
