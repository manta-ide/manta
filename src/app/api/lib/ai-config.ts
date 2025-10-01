/**
 * AI Provider Configuration Management
 *
 * This module handles configuration, API key management, and provider
 * setup for multiple AI providers (Claude, Codex, Qwen, Gemini).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AIProvider } from './schemas';

// Configuration interfaces
export interface ProviderConfig {
  name: string;
  apiKey: string;
  model?: string;
  endpoint?: string;
  enabled: boolean;
  priority: number; // Lower number = higher priority
}

export interface AIConfig {
  providers: Record<AIProvider, ProviderConfig>;
  defaultProvider: AIProvider;
  fallbackOrder: AIProvider[];
  verboseLogging: boolean;
}

// Default configuration
const DEFAULT_CONFIG: AIConfig = {
  providers: {
    claude: {
      name: 'Claude (Anthropic)',
      apiKey: '',
      model: 'sonnet',
      enabled: false,
      priority: 1,
    },
    codex: {
      name: 'Codex (OpenAI)',
      apiKey: '',
      model: 'code-davinci-002',
      enabled: false,
      priority: 3,
    },
    qwen: {
      name: 'Qwen (Alibaba)',
      apiKey: '',
      model: 'qwen-coder-plus',
      endpoint: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      enabled: false,
      priority: 2,
    },
    gemini: {
      name: 'Gemini (Google)',
      apiKey: '',
      model: 'gemini-1.5-pro',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/models',
      enabled: false,
      priority: 2,
    },
  },
  defaultProvider: 'claude',
  fallbackOrder: ['claude', 'gemini', 'qwen', 'codex'],
  verboseLogging: false,
};

// Configuration file paths
function getConfigDir(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.manta');

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  return configDir;
}

function getConfigPath(): string {
  return path.join(getConfigDir(), 'ai-config.json');
}

// Load configuration from file
export function loadConfig(): AIConfig {
  const configPath = getConfigPath();

  try {
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configData) as AIConfig;

      // Merge with defaults to ensure all fields are present
      return {
        ...DEFAULT_CONFIG,
        ...config,
        providers: {
          ...DEFAULT_CONFIG.providers,
          ...config.providers,
        },
      };
    }
  } catch (error) {
    console.warn('Failed to load AI config file:', error);
  }

  // Load from environment variables if config file doesn't exist
  return loadFromEnvironment();
}

// Save configuration to file
export function saveConfig(config: AIConfig): void {
  const configPath = getConfigPath();

  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to save AI config file:', error);
    throw error;
  }
}

// Load configuration from environment variables
export function loadFromEnvironment(): AIConfig {
  const config = { ...DEFAULT_CONFIG };

  // Load API keys from environment
  const claudeKey = process.env.ANTHROPIC_API_KEY || '';
  const codexKey = process.env.OPENAI_API_KEY || '';
  const qwenKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || '';
  const geminiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';

  // Update provider configurations
  config.providers.claude.apiKey = claudeKey;
  config.providers.claude.enabled = !!claudeKey;

  config.providers.codex.apiKey = codexKey;
  config.providers.codex.enabled = !!codexKey;

  config.providers.qwen.apiKey = qwenKey;
  config.providers.qwen.enabled = !!qwenKey;

  config.providers.gemini.apiKey = geminiKey;
  config.providers.gemini.enabled = !!geminiKey;

  // Set default provider to first enabled provider
  const enabledProviders = getEnabledProviders(config);
  if (enabledProviders.length > 0) {
    config.defaultProvider = enabledProviders[0];
  }

  // Check for verbose logging
  config.verboseLogging = isVerboseLoggingEnabled();

  return config;
}

// Get enabled providers sorted by priority
export function getEnabledProviders(config?: AIConfig): AIProvider[] {
  const cfg = config || loadConfig();

  return Object.entries(cfg.providers)
    .filter(([_, providerConfig]) => providerConfig.enabled)
    .sort(([_, a], [__, b]) => a.priority - b.priority)
    .map(([provider, _]) => provider as AIProvider);
}

// Check if verbose logging is enabled
export function isVerboseLoggingEnabled(): boolean {
  const verbose = process.env.VERBOSE_AI_LOGS ||
                  process.env.VERBOSE_CLAUDE_LOGS ||
                  process.env.VERBOSE_CODEX_LOGS ||
                  process.env.VERBOSE_QWEN_LOGS ||
                  process.env.VERBOSE_GEMINI_LOGS ||
                  '';
  return verbose.toLowerCase() === '1' ||
         verbose.toLowerCase() === 'true' ||
         verbose.toLowerCase() === 'yes' ||
         verbose.toLowerCase() === 'on';
}

// Get provider configuration
export function getProviderConfig(provider: AIProvider, config?: AIConfig): ProviderConfig | null {
  const cfg = config || loadConfig();
  return cfg.providers[provider] || null;
}

// Check if provider is available (has API key)
export function isProviderAvailable(provider: AIProvider, config?: AIConfig): boolean {
  const providerConfig = getProviderConfig(provider, config);
  return !!(providerConfig?.enabled && providerConfig?.apiKey);
}

// Get best available provider for a task
export function getBestProvider(taskType?: 'code' | 'general' | 'creative' | 'translation', config?: AIConfig): AIProvider | null {
  const cfg = config || loadConfig();
  const enabledProviders = getEnabledProviders(cfg);

  if (enabledProviders.length === 0) {
    return null;
  }

  // If only one provider is available, use it
  if (enabledProviders.length === 1) {
    return enabledProviders[0];
  }

  // Task-specific preferences
  switch (taskType) {
    case 'code':
      if (enabledProviders.includes('claude')) return 'claude';
      if (enabledProviders.includes('codex')) return 'codex';
      break;
    case 'creative':
      if (enabledProviders.includes('gemini')) return 'gemini';
      if (enabledProviders.includes('claude')) return 'claude';
      break;
    case 'translation':
      if (enabledProviders.includes('qwen')) return 'qwen';
      if (enabledProviders.includes('gemini')) return 'gemini';
      break;
    case 'general':
    default:
      // Use fallback order from config
      for (const provider of cfg.fallbackOrder) {
        if (enabledProviders.includes(provider)) {
          return provider;
        }
      }
      break;
  }

  // Fallback to first enabled provider
  return enabledProviders[0];
}

// Validate configuration
export function validateConfig(config: AIConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check that at least one provider is enabled
  const enabledProviders = getEnabledProviders(config);
  if (enabledProviders.length === 0) {
    errors.push('No AI providers are enabled. Please configure at least one provider.');
  }

  // Check that default provider is enabled
  if (!enabledProviders.includes(config.defaultProvider)) {
    errors.push(`Default provider '${config.defaultProvider}' is not enabled.`);
  }

  // Validate API keys
  Object.entries(config.providers).forEach(([provider, providerConfig]) => {
    if (providerConfig.enabled && !providerConfig.apiKey) {
      errors.push(`Provider '${provider}' is enabled but has no API key.`);
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Initialize configuration
export function initConfig(): AIConfig {
  let config: AIConfig;

  try {
    // Try to load existing config
    config = loadConfig();
  } catch (error) {
    // If loading fails, create new config from environment
    config = loadFromEnvironment();
  }

  // Validate and save config
  const validation = validateConfig(config);
  if (!validation.valid) {
    console.warn('AI configuration has issues:', validation.errors);
  }

  // Save config to file for future use
  try {
    saveConfig(config);
  } catch (error) {
    console.warn('Failed to save AI configuration:', error);
  }

  return config;
}

// Export utilities for CLI usage
export const AIConfigUtils = {
  loadConfig,
  saveConfig,
  loadFromEnvironment,
  getEnabledProviders,
  isProviderAvailable,
  getBestProvider,
  validateConfig,
  initConfig,
  getConfigPath,
  isVerboseLoggingEnabled,
};