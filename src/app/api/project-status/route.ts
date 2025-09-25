import { NextResponse } from 'next/server';
import { projectExists, hasNextJsProject, getDevProjectDir } from '@/lib/project-config';
import { generateCodeBuilderAgent, generateGraphEditorAgent } from '@/app/api/lib/agentPrompts';

export async function GET() {
  try {
    const exists = projectExists();
    const hasNextJs = hasNextJsProject();

    return NextResponse.json({
      projectExists: exists,
      hasNextJsProject: hasNextJs,
      needsPartialTemplate: hasNextJs && !exists
    });
  } catch (error) {
    console.error('Error checking project status:', error);
    return NextResponse.json(
      { error: 'Failed to check project status' },
      { status: 500 }
    );
  }
}

// Generate agents based on project structure
export async function POST() {
  try {
    const fs = await import('fs');
    const path = await import('path');

    // Get project directory (same logic as templates API)
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

    const projectDir = getProjectDir();

    // Analyze project structure
    const projectAnalysis = await analyzeProjectStructure(projectDir);

    // Generate agents based on analysis
    const codeBuilderAgent = generateCodeBuilderAgent(projectAnalysis);
    const graphEditorAgent = generateGraphEditorAgent(projectAnalysis);

    // Write agents to .claude/agents/
    const agentsDir = path.join(projectDir, '.claude', 'agents');
    await fs.promises.mkdir(agentsDir, { recursive: true });

    await fs.promises.writeFile(
      path.join(agentsDir, 'code-builder.md'),
      codeBuilderAgent
    );

    await fs.promises.writeFile(
      path.join(agentsDir, 'graph-editor.md'),
      graphEditorAgent
    );

    return NextResponse.json({
      success: true,
      message: 'Agents generated successfully'
    });
  } catch (error) {
    console.error('Error generating agents:', error);
    return NextResponse.json(
      { error: 'Failed to generate agents' },
      { status: 500 }
    );
  }
}

async function analyzeProjectStructure(projectDir: string) {
  const fs = await import('fs');
  const path = await import('path');

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


