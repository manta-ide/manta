import { NextRequest } from 'next/server';
import * as path from 'path';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { query, type SDKMessage, type SDKAssistantMessage, type SDKUserMessage, type SDKResultMessage, type SDKSystemMessage, type SDKPartialAssistantMessage, type Options } from '@anthropic-ai/claude-agent-sdk';
import { ClaudeCodeRequestSchema } from '@/app/api/lib/schemas';
import { getBaseUrl, projectDir } from '@/app/api/lib/claude-code-utils';
import { orchestratorSystemPrompt, AGENTS_CONFIG } from '@/app/api/lib/agentPrompts';

// Type definitions for Claude Code installations
interface ClaudeInstallation {
  path: string;
  version?: string;
  source: string;
  installationType: 'system' | 'custom';
}

// Claude Code binary discovery functions
function envVerbose(): boolean {
  const v = String(process.env.VERBOSE_CLAUDE_LOGS || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function findClaudeBinary(): string {
  if (envVerbose()) console.log('🔍 Searching for Claude Code binary...');

  // First try the current approach (development/standalone detection)
  const quickPath = getQuickCliPath();
  if (quickPath && fs.existsSync(quickPath)) {
    if (envVerbose()) console.log(`✅ Found Claude Code via quick detection: ${quickPath}`);
    return quickPath;
  }

  // If quick detection fails, do comprehensive discovery
  const installations = discoverSystemInstallations();

  if (installations.length === 0) {
    throw new Error(`Claude Code not found. Please ensure it's installed in one of these locations: ${process.platform === 'win32' ? 'PATH, %APPDATA%/npm, %LOCALAPPDATA%/Yarn/bin, %ProgramFiles%/nodejs, %LOCALAPPDATA%/Programs/nodejs, %NVM_HOME%, %NVM_SYMLINK%, %ChocolateyInstall%/bin, %USERPROFILE%/scoop/shims' : 'PATH, /usr/local/bin, /opt/homebrew/bin, ~/.nvm/versions/node/*/bin, ~/.claude/local, ~/.local/bin'}`);
  }

  // Log all found installations
  if (envVerbose()) {
    installations.forEach(install => {
      console.log(`📍 Found Claude installation: ${install.path} (${install.source})`);
    });
  }

  // Select the best installation
  const best = selectBestInstallation(installations);
  if (best) {
    if (envVerbose()) console.log(`🎯 Selected Claude installation: ${best.path} (${best.source})`);
    return best.path;
  }

  throw new Error('No valid Claude installation found');
}

function getQuickCliPath(): string | null {
  // Check if we're in development (not standalone build)
  const isDevelopment = !process.cwd().includes('.next') && fs.existsSync(path.join(process.cwd(), 'node_modules'));

  if (isDevelopment) {
    // In development, use local node_modules
    return path.join(process.cwd(), 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
  } else {
    // In standalone build, we're in .next/standalone/.next/server/...
    // Need to go up to find node_modules alongside standalone
    try {
      const currentFileUrl = new URL(import.meta.url);
      const currentDir = path.dirname(currentFileUrl.pathname);
      const standaloneDir = path.resolve(currentDir, '../../../../../');
      return path.join(standaloneDir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js');
    } catch (e) {
      return null;
    }
  }
}

function discoverSystemInstallations(): ClaudeInstallation[] {
  const installations: ClaudeInstallation[] = [];

  // Allow explicit override via env var
  const envPath = String(process.env.CLAUDE_CLI_PATH || '').trim();
  if (envPath && fs.existsSync(envPath)) {
    installations.push({
      path: envPath,
      version: getClaudeVersion(envPath),
      source: 'env',
      installationType: 'custom'
    });
  }

  // 1. Try 'which/where' command first
  const whichInstall = tryWhichCommand();
  if (whichInstall) installations.push(whichInstall);

  if (process.platform === 'win32') {
    // Windows-specific search
    installations.push(...findWindowsInstallations());
  } else {
    // 2. Check NVM paths
    installations.push(...findNvmInstallations());
    // 3. Check standard paths
    installations.push(...findStandardInstallations());
  }

  // Remove duplicates by path
  const uniquePaths = new Set<string>();
  return installations.filter(install => {
    if (uniquePaths.has(install.path)) return false;
    uniquePaths.add(install.path);
    return true;
  });
}

function tryWhichCommand(): ClaudeInstallation | null {
  try {
    if (process.platform === 'win32') {
      const candidates = ['claude', 'claude-code'];
      for (const cmd of candidates) {
        const res = spawnSync('where', [cmd], { encoding: 'utf8' });
        if (res.status === 0 && res.stdout) {
          let lines = res.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const score = (p: string) => {
            const ext = path.extname(p).toLowerCase();
            if (ext === '.cmd') return 0;
            if (ext === '.exe') return 1;
            if (ext === '.bat') return 2;
            if (ext === '.ps1') return 3;
            return 4;
          };
          lines = lines.sort((a, b) => score(a) - score(b));
          for (const p of lines) {
            if (fs.existsSync(p)) {
              const jsPath = resolveWindowsJsEntrypoint(p);
              const version = getClaudeVersion(jsPath);
              return { path: jsPath, version, source: 'which', installationType: 'system' };
            }
          }
        }
      }
    } else {
      const result = spawnSync('which', ['claude'], { encoding: 'utf8' });
      if (result.status === 0 && result.stdout) {
        const output = result.stdout.trim();

        // Parse aliased output: "claude: aliased to /path/to/claude"
        let pathStr = output;
        if (output.startsWith('claude:') && output.includes('aliased to')) {
          const parts = output.split('aliased to');
          if (parts[1]) pathStr = parts[1].trim();
        }

        if (fs.existsSync(pathStr)) {
          const version = getClaudeVersion(pathStr);
          return {
            path: pathStr,
            version,
            source: 'which',
            installationType: 'system'
          };
        }
      }
    }
  } catch (e) {
    // which/where command failed, continue
  }
  return null;
}

function findNvmInstallations(): ClaudeInstallation[] {
  const installations: ClaudeInstallation[] = [];

  const home = process.env.HOME;
  if (!home) return installations;

  const nvmDir = path.join(home, '.nvm', 'versions', 'node');

  try {
    if (!fs.existsSync(nvmDir)) return installations;

    const entries = fs.readdirSync(nvmDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const claudePath = path.join(nvmDir, entry.name, 'bin', 'claude');
        if (fs.existsSync(claudePath)) {
          const version = getClaudeVersion(claudePath);
          installations.push({
            path: claudePath,
            version,
            source: `nvm (${entry.name})`,
            installationType: 'system'
          });
        }
      }
    }
  } catch (e) {
    // NVM directory not accessible, continue
  }

  return installations;
}

function findStandardInstallations(): ClaudeInstallation[] {
  const installations: ClaudeInstallation[] = [];
  const home = process.env.HOME || '';

  // Common installation paths
  const pathsToCheck = [
    { path: '/usr/local/bin/claude', source: 'system' },
    { path: '/opt/homebrew/bin/claude', source: 'homebrew' },
    { path: '/usr/bin/claude', source: 'system' },
    { path: '/bin/claude', source: 'system' },
    { path: path.join(home, '.claude/local/claude'), source: 'claude-local' },
    { path: path.join(home, '.local/bin/claude'), source: 'local-bin' },
    { path: path.join(home, '.npm-global/bin/claude'), source: 'npm-global' },
    { path: path.join(home, '.yarn/bin/claude'), source: 'yarn' },
    { path: path.join(home, '.bun/bin/claude'), source: 'bun' },
    { path: path.join(home, 'bin/claude'), source: 'home-bin' },
    { path: path.join(home, 'node_modules/.bin/claude'), source: 'node-modules' },
    { path: path.join(home, '.config/yarn/global/node_modules/.bin/claude'), source: 'yarn-global' },
  ];

  for (const { path: checkPath, source } of pathsToCheck) {
    if (fs.existsSync(checkPath)) {
      const version = getClaudeVersion(checkPath);
      installations.push({
        path: checkPath,
        version,
        source,
        installationType: 'system'
      });
    }
  }

  // Check if claude is available in PATH
  try {
    const result = spawnSync('claude', ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0) {
      const version = extractVersionFromOutput(result.stdout);
      installations.push({
        path: 'claude',
        version,
        source: 'PATH',
        installationType: 'system'
      });
    }
  } catch (e) {
    // claude not in PATH, continue
  }

  return installations;
}

// Windows-specific discovery across common locations and PATH
function findWindowsInstallations(): ClaudeInstallation[] {
  const installations: ClaudeInstallation[] = [];

  const appData = process.env.APPDATA || '';
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env['ProgramFiles'] || '';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
  const userProfile = process.env.USERPROFILE || '';
  const nvmHome = process.env.NVM_HOME || '';
  const nvmSymlink = process.env.NVM_SYMLINK || '';
  const chocolatey = process.env.ChocolateyInstall || '';

  const candidateDirs = [
    path.join(appData, 'npm'),
    path.join(localAppData, 'Yarn', 'bin'),
    path.join(programFiles, 'nodejs'),
    path.join(programFilesX86, 'nodejs'),
    path.join(localAppData, 'Programs', 'nodejs'),
    nvmHome,
    nvmSymlink,
    path.join(userProfile, 'scoop', 'shims'),
    path.join(chocolatey, 'bin'),
  ].filter(Boolean);

  const pathEntries = String(process.env.PATH || '')
    .split(';')
    .map(p => p.trim())
    .filter(Boolean);

  const allDirs = Array.from(new Set([...candidateDirs, ...pathEntries]));

  const bases = ['claude', 'claude-code'];
  const pathext = (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD;.VBS;.VBE;.JS;.JSE;.WSF;.WSH;.MSC;.PS1')
    .split(';')
    .map(e => e.trim().toLowerCase());

  // Prefer .cmd over .ps1 to avoid PowerShell wrapper when spawning
  const preferredExts = ['.cmd', '.exe', '.bat', '.ps1', ''];
  const exts = preferredExts.filter(e => e === '' || pathext.includes(e.toLowerCase()) || preferredExts.includes(e));

  for (const dir of allDirs) {
    for (const base of bases) {
      for (const ext of exts) {
        const candidate = path.join(dir, base + ext);
        try {
          if (fs.existsSync(candidate)) {
            const jsPath = resolveWindowsJsEntrypoint(candidate);
            const version = getClaudeVersion(jsPath);
            installations.push({
              path: jsPath,
              version,
              source: dir.toLowerCase().includes('appdata') ? 'npm-global' : 'PATH',
              installationType: 'system'
            });
            break; // move to next base once found in this dir
          }
        } catch {
          // ignore errors checking this candidate
        }
      }
    }
  }

  return installations;
}

function getClaudeVersion(claudePath: string): string | undefined {
  try {
    const isPs1 = process.platform === 'win32' && /\.ps1$/i.test(claudePath);
    const isJs = /\.(mjs|cjs|js|tsx?|jsx)$/i.test(claudePath);
    const result = isPs1
      ? spawnSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', claudePath, '--version'], { encoding: 'utf8', timeout: 5000 })
      : isJs
        ? spawnSync(process.execPath, [claudePath, '--version'], { encoding: 'utf8', timeout: 5000 })
        : spawnSync(claudePath, ['--version'], { encoding: 'utf8', timeout: 5000 });
    if (result.status === 0 && result.stdout) {
      return extractVersionFromOutput(result.stdout);
    }
  } catch (e) {
    // Version check failed, continue
  }
  return undefined;
}

function resolveWindowsJsEntrypoint(p: string): string {
  if (process.platform !== 'win32') return p;
  const dir = path.dirname(p);
  const tryPaths = [
    path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'cli.js'),
    path.join(dir, 'node_modules', '@anthropic-ai', 'claude-code', 'dist', 'cli.js')
  ];
  for (const tp of tryPaths) {
    try { if (fs.existsSync(tp)) return tp; } catch {}
  }
  return p;
}

function extractVersionFromOutput(stdout: string): string | undefined {
  // Look for version pattern like "1.0.41" or "1.0.17-beta"
  const versionRegex = /(\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?)/;
  const match = stdout.match(versionRegex);
  return match ? match[1] : undefined;
}

function selectBestInstallation(installations: ClaudeInstallation[]): ClaudeInstallation | null {
  if (installations.length === 0) return null;

  // Sort by version (highest first), then by source preference
  installations.sort((a, b) => {
    // Compare versions if both have them
    if (a.version && b.version) {
      const versionCompare = compareVersions(b.version, a.version); // Reverse for descending
      if (versionCompare !== 0) return versionCompare;
    } else if (a.version && !b.version) {
      return -1; // a with version comes first
    } else if (!a.version && b.version) {
      return 1; // b with version comes first
    }

    // If versions are equal or both missing, compare by source preference
    return sourcePreference(a.source) - sourcePreference(b.source);
  });

  return installations[0];
}

function sourcePreference(source: string): number {
  const preferences: Record<string, number> = {
    'env': 0,
    'which': 1,
    'homebrew': 2,
    'system': 3,
    'nvm': 4,
    'local-bin': 5,
    'claude-local': 6,
    'npm-global': 7,
    'yarn': 8,
    'yarn-global': 9,
    'bun': 10,
    'node-modules': 11,
    'home-bin': 12,
    'PATH': 13,
  };

  // Handle nvm with version
  if (source.startsWith('nvm')) return 4;

  return preferences[source] || 14;
}

function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(s => parseInt(s.split('-')[0]) || 0);
  const bParts = b.split('.').map(s => parseInt(s.split('-')[0]) || 0);

  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const aVal = aParts[i] || 0;
    const bVal = bParts[i] || 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }
  return 0;
}

// Import spawnSync for synchronous operations
import { spawnSync } from 'child_process';

// Force Node.js runtime - required for Claude Code execution
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Claude Code Execute Route
// This route handles Claude Code execution for different agent types.
// Working Directory Setup:
// - Development mode: Works in test-project directory (when developing Manta itself)
// - Production/User project mode: Works in the current user project directory
// The working directory is determined by MANTA_MODE and MANTA_PROJECT_DIR env vars

// ---- Logging helpers (default: quiet) ----
function pretty(obj: any) {
  try { return JSON.stringify(obj, null, 2); } catch { return String(obj); }
}






export async function POST(req: NextRequest) {
  try {
    const { prompt, userId, options } = ClaudeCodeRequestSchema.parse(await req.json());

    const envVerbose = String(process.env.VERBOSE_CLAUDE_LOGS || '').toLowerCase();
    const defaultVerbose = envVerbose === '1' || envVerbose === 'true' || envVerbose === 'yes' || envVerbose === 'on';
    const verbose = true;
    const logHeader = (title: string) => { if (!verbose) return; console.log(`\n====== ${title} ======`); };
    const logLine = (prefix: string, message?: any) => { if (!verbose) return; console.log(prefix, message ?? ''); };

    logHeader('Claude Code Execute');
    logLine('🎯 Claude Code: User asked (full):', prompt);
    logLine('🎯 Claude Code: Options received (full):', pretty(options));
    // Execute Claude Code with SDK and stream response
    let fullResponse = '';
    let hasStartedStreaming = false;
    let accumulatedThinking = '';
    let thinkingSent = false;
    let streamClosed = false;
    let lastSentIndex = 0;
    let first = true;
    let lastLoggedLength = 0;
    // Note: Hooks are causing type issues, using simplified approach
    // Will rely on message streaming for trace information
    
    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Sync env-controlled verbosity with request options for discovery logs
          process.env.VERBOSE_CLAUDE_LOGS = '1';

          // Find the best Claude Code installation
          const cliPath = findClaudeBinary();

          // Configure based on subagent
          const baseUrl = getBaseUrl(req as any);
          
          // Get API key from environment variable
          const apiKey = process.env.MANTA_API_KEY;
          
          if (!apiKey) {
            throw new Error('MANTA_API_KEY environment variable is not set');
          }

          logLine(`🔑 Using API key from environment for MCP authentication`);

          // Configure MCP server to use HTTP endpoint instead of local server
          const mcpServerConfig = {
            type: 'http',
            url: `${baseUrl}/api/mcp`,
            headers: {
              'MANTA_API_KEY': apiKey
            }
          };

          // Log the working directory
          const workingDirectory = projectDir();
          const mode = process.env.MANTA_MODE === 'user-project' ? 'user project' : 'development';
          logLine(`📁 Claude Code: Working directory (${mode} mode): ${workingDirectory}`);

          // Create user message generator with the prompt
          async function* generateUserMessage(): AsyncGenerator<SDKUserMessage> {
            yield {
              type: "user",
              message: {
                role: "user",
                content: prompt
              },
              parent_tool_use_id: null,
              session_id: ''
            };
            //if(first)
            //Required for claude code sdk to work. 1800000 = 30 minutes for max task length
            await new Promise(res => setTimeout(res, 1800000))
            first = false;
          }


          // Generic query options with orchestrator prompt
          const queryOptions: Options = {
            includePartialMessages: true,
            systemPrompt: orchestratorSystemPrompt,
            mcpServers: { 'manta': mcpServerConfig },
            //allowedTools: ['Task'],
            //disallowedTools: ['Read', 'Glob', 'Grep', 'Write', 'Edit', 'Bash', 'MultiEdit', 'NotebookEdit', 'WebFetch', 'TodoWrite', 'ExitPlanMode', 'BashOutput', 'KillShell', 'mcp__manta__node_metadata_update','mcp__manta__read','mcp__manta__node_create','mcp__manta__node_edit','mcp__manta__node_delete','mcp__manta__edge_create','mcp__manta__edge_delete','WebSearch',"SlashCommand"],
            permissionMode: 'bypassPermissions',
            abortController: new AbortController(),
            cwd: workingDirectory,
            strictMcpConfig: true,
            model: "sonnet",
            pathToClaudeCodeExecutable: cliPath,
            agents: AGENTS_CONFIG
          } as any;

          let messageCount = 0;
          try {

            

            logLine('🚀 Using simplified Claude Code configuration');

            for await (const message of query({
              prompt: generateUserMessage(),
              options: queryOptions
            })) {
              messageCount++;

              // Start streaming on first message
              if (!hasStartedStreaming) {
                hasStartedStreaming = true;
                controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
              }

              // Handle different message types with proper typing
              if (verbose && (message as any).type !== 'stream_event') {
                //logHeader(`SDK Message #${messageCount} (${(message as any).type})`);
                //logLine('📥 Full message payload:', pretty(message));
              }
              await handleMessage(message as SDKMessage, controller, encoder);
            }
          } catch (queryError) {
            logHeader('❌ Claude Code: Query error' + queryError);

            // Only send error and close if stream is still open
            if (!streamClosed) {
              streamClosed = true;
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Query failed: ' + (queryError as Error).message })}\n\n`));
                controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
              } catch (enqueueError) {
                logLine('⚠️ Failed to enqueue error - stream may be closed:', enqueueError);
              }
              controller.close();
            }
            return;
          }

          // If we get here without a result, send completion
          logLine('🏁 Claude Code: Query completed without result');
          logLine('🏁 Claude Code: Total messages processed:', messageCount);

          // Only close stream if not already closed
          if (!streamClosed) {
            streamClosed = true;

            if (!hasStartedStreaming) {
              logLine('🎯 Claude Code: No response generated, sending fallback');
              controller.enqueue(encoder.encode('data: [STREAM_START]\n\n'));
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: "I apologize, but I couldn't generate a response. Please try again." })}\n\n`));
            }

            controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
            controller.close();
          }

        } catch (error) {
          console.error('Streaming error:', error);

          // Only close stream if not already closed
          if (!streamClosed) {
            streamClosed = true;
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: error instanceof Error ? error.message : String(error) })}\n\n`));
              controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
            } catch (enqueueError) {
              console.error('⚠️ Failed to enqueue final error - stream may be closed:', enqueueError);
            }
            controller.close();
          }
        }
      }
    });

    // Helper function to handle different message types
    async function handleMessage(message: SDKMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      switch (message.type) {
        case "assistant":
          await handleAssistantMessage(message as SDKAssistantMessage, controller, encoder);
          break;

        case "user":
          await handleUserMessage(message as SDKUserMessage, controller, encoder);
          break;

        case "system":
          await handleSystemMessage(message as SDKSystemMessage, controller, encoder);
          break;

        case "result":
          await handleResultMessage(message as SDKResultMessage, controller, encoder);
          break;

        case "stream_event":
          await handlePartialAssistantMessage(message as SDKPartialAssistantMessage, controller, encoder);
          break;

        default:
          // Reduce noise from stream_event messages unless they contain useful info
          if ((message as any).type !== 'stream_event') {
            console.log(`📝 Claude Code: Unhandled message type: ${(message as any).type}`);
          }
      }
    }

    // Handle assistant messages with tool calls and content
    async function handleAssistantMessage(message: SDKAssistantMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      // Handle tool calls - send to UI for visibility
      if ((message as any).tool_calls) {
        logLine('🔧 Claude wants to execute tools:', (message as any).tool_calls.length);
        (message as any).tool_calls.forEach((call: any, index: number) => {
          const toolName = call.function?.name?.replace('mcp__manta__', '');
          logLine(`🔧 Claude tool call #${index + 1}: ${toolName} args:`, pretty(call.function?.arguments));

          // Send tool call to UI for visibility only if stream is still open
          if (!streamClosed) {
            const traceData = {
              type: 'trace',
              trace: {
                type: 'tool_call',
                tool: toolName,
                arguments: call.function?.arguments,
                timestamp: new Date().toISOString()
              }
            };
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(traceData)}\n\n`));
            } catch (enqueueError) {
              logLine('⚠️ Failed to enqueue tool call trace - stream may be closed:', enqueueError);
              streamClosed = true;
            }
          } else {
            logLine('⚠️ Skipping tool call trace enqueue - stream already closed');
          }
        });
      }

      // Handle assistant content/thinking - log what Claude is saying
      if ((message as any).content) {
        const content = (message as any).content;
        logHeader('🤖 Assistant Message Content (full)');
        logLine('', content);
      }
    }

    // Handle user messages - including tool results
    async function handleUserMessage(message: SDKUserMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      logHeader('👤 User Message (full)');
      try {
        logLine('', pretty((message as any).message ?? message));
      } catch {
        logLine('', pretty(message));
      }

      // Check if this is a tool result message
      const msg = (message as any).message;
      if (msg && Array.isArray(msg.content)) {
        const toolResult = msg.content.find((c: any) => c.type === 'tool_result');
        if (toolResult) {
          let contentText: string;
          if (Array.isArray(toolResult.content)) {
            contentText = toolResult.content.map((c: any) => c.text || c.type).join(' ') || 'no content';
          } else {
            contentText = toolResult.content || 'no content';
          }
          logLine('🔧 Tool result detected:', `${contentText} (error: ${toolResult.is_error})`);

          // Send tool result to UI only if stream is still open
          if (!streamClosed) {
            const resultData = {
              type: 'tool_result',
              tool_result: {
                content: toolResult.content,
                is_error: toolResult.is_error,
                tool_use_id: toolResult.tool_use_id,
                timestamp: new Date().toISOString()
              }
            };
            try {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
            } catch (enqueueError) {
              logLine('⚠️ Failed to enqueue tool result - stream may be closed:', enqueueError);
              streamClosed = true;
            }
          } else {
            logLine('⚠️ Skipping tool result enqueue - stream already closed');
          }
        }
      }
    }

    // Handle system messages - don't send to UI, just log
    async function handleSystemMessage(message: SDKSystemMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      logHeader('📝 System Message (full)');
      logLine('', pretty(message));
    }

    // Handle partial assistant messages for real-time streaming
    async function handlePartialAssistantMessage(message: SDKPartialAssistantMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      const event = (message as any).event;

      // Handle different streaming events
      if (event?.type === 'content_block_delta' && event?.delta?.type === 'text_delta') {
        // Accumulate what Claude is saying in real-time
        const content = event.delta.text || '';
        if (content) {
          accumulatedThinking += content;

          // Mark that thinking has started (but don't send UI message - let chat handle it)
          if (!thinkingSent && accumulatedThinking.length > 5) {
            thinkingSent = true;
            logLine('🤔 Claude started writing...');
          }

          // Show continuous writing progress without line breaks
          const shouldLog = accumulatedThinking.length - lastLoggedLength >= 20 ||
                           ['\n', '.', '!', '?', ':'].some(char => content.includes(char));

          if (shouldLog && accumulatedThinking.length > lastLoggedLength) {
            const previewLength = 80;
            const preview = accumulatedThinking.length > previewLength
              ? '...' + accumulatedThinking.slice(-previewLength)
              : accumulatedThinking;
            logLine(`✨ Claude writing: ${preview}`);
            lastLoggedLength = accumulatedThinking.length;
          }

          // Don't send thinking content to UI - let chat handle its own thinking animation
          lastSentIndex = accumulatedThinking.length;
        }
      } else if (event?.type === 'content_block_stop') {
        // Show what Claude finished thinking as a combined log entry
        if (accumulatedThinking.length > 0) {
          logHeader('🟢 Claude finished thinking (combined content)');
          logLine('', accumulatedThinking);
        }
        logLine('📝 Claude Code: Content block completed');
        accumulatedThinking = ''; // Reset for next message
        lastSentIndex = 0;
        lastLoggedLength = 0;
      } else if (event?.type === 'message_stop') {
        // Message is complete
        logLine('📝 Claude Code: Message streaming completed');
        accumulatedThinking = ''; // Reset accumulated content
        thinkingSent = false; // Reset thinking flag
        lastSentIndex = 0;
        lastLoggedLength = 0;
      }
    }

    // Handle result messages (final output)
    async function handleResultMessage(message: SDKResultMessage, controller: ReadableStreamDefaultController, encoder: TextEncoder) {
      if ((message as any).result) {
        fullResponse = String((message as any).result);

        // Log Claude's final response (full)
        logHeader('🎯 Claude final response (full)');
        logLine('', fullResponse);
        logLine('✅ Claude Code: Response generated successfully');

        // Only close stream if not already closed
        if (!streamClosed) {
          streamClosed = true;
          console.log('RESULT>>>>>>>>>', message);
          const resultData = {
            type: 'result',
            content: fullResponse
          };
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(resultData)}\n\n`));
          controller.enqueue(encoder.encode('data: [STREAM_END]\n\n'));
          controller.close();
        }
      }
    }

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    });

  } catch (error: any) {
    console.error('Claude Code API error:', error);
    return new Response(`Error: ${error?.message || String(error)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}
