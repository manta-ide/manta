#!/usr/bin/env node

/**
 * Test script for AI provider integrations
 *
 * This script tests all configured AI providers to ensure they're working correctly.
 * Run with: node scripts/test-ai-providers.js
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, "..");

// Simple test prompt
const TEST_PROMPT = "Hello! Please respond with 'AI provider test successful' if you can understand this message.";

// Provider configurations
const PROVIDERS = [
  {
    name: 'Claude',
    endpoint: '/api/claude-code/execute',
    envKey: 'ANTHROPIC_API_KEY',
    testRequest: {
      prompt: TEST_PROMPT,
      options: { verbose: false, max_tokens: 100 }
    }
  },
  {
    name: 'Codex',
    endpoint: '/api/codex/execute',
    envKey: 'OPENAI_API_KEY',
    testRequest: {
      prompt: TEST_PROMPT,
      options: { verbose: false, max_tokens: 100 }
    }
  },
  {
    name: 'Qwen',
    endpoint: '/api/qwen/execute',
    envKey: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
    testRequest: {
      prompt: TEST_PROMPT,
      options: { verbose: false, max_tokens: 100 }
    }
  },
  {
    name: 'Gemini',
    endpoint: '/api/gemini/execute',
    envKey: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    testRequest: {
      prompt: TEST_PROMPT,
      options: { verbose: false, max_tokens: 100 }
    }
  }
];

// Check if provider is configured
function isProviderConfigured(provider) {
  const envKeys = Array.isArray(provider.envKey) ? provider.envKey : [provider.envKey];
  return envKeys.some(key => process.env[key]);
}

// Get configured providers
function getConfiguredProviders() {
  return PROVIDERS.filter(isProviderConfigured);
}

// Test a single provider
async function testProvider(provider, baseUrl = 'http://localhost:3001') {
  const url = `${baseUrl}${provider.endpoint}`;

  console.log(`\n🧪 Testing ${provider.name}...`);
  console.log(`   Endpoint: ${provider.endpoint}`);

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(provider.testRequest),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[STREAM_START]' || data === '[STREAM_END]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'result' && parsed.content) {
              result += parsed.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    if (result.trim()) {
      console.log(`   ✅ Success: ${result.trim().substring(0, 100)}...`);
      return { success: true, result: result.trim() };
    } else {
      console.log(`   ❌ Failed: No result received`);
      return { success: false, error: 'No result received' };
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Test AI router
async function testAIRouter(baseUrl = 'http://localhost:3001') {
  console.log(`\n🧪 Testing AI Router...`);
  console.log(`   Endpoint: /api/ai/execute`);

  try {
    const response = await fetch(`${baseUrl}/api/ai/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: TEST_PROMPT,
        provider: 'auto', // Let router choose
        options: { verbose: false, max_tokens: 100 }
      }),
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const selectedProvider = response.headers.get('X-AI-Provider');
    const availableProviders = response.headers.get('X-Available-Providers');

    console.log(`   🎯 Selected provider: ${selectedProvider}`);
    console.log(`   📋 Available providers: ${availableProviders}`);

    // Read streaming response
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[STREAM_START]' || data === '[STREAM_END]') {
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'result' && parsed.content) {
              result += parsed.content;
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      }
    }

    if (result.trim()) {
      console.log(`   ✅ Success: ${result.trim().substring(0, 100)}...`);
      return { success: true, result: result.trim(), provider: selectedProvider };
    } else {
      console.log(`   ❌ Failed: No result received`);
      return { success: false, error: 'No result received' };
    }

  } catch (error) {
    console.log(`   ❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Main test function
async function runTests() {
  console.log('🚀 Manta AI Provider Integration Test');
  console.log('=====================================');

  // Check environment setup
  const configuredProviders = getConfiguredProviders();

  if (configuredProviders.length === 0) {
    console.log('\n⚠️  No AI providers are configured!');
    console.log('Please set up at least one API key:');
    console.log('  - ANTHROPIC_API_KEY for Claude');
    console.log('  - OPENAI_API_KEY for Codex');
    console.log('  - DASHSCOPE_API_KEY or QWEN_API_KEY for Qwen');
    console.log('  - GOOGLE_API_KEY or GEMINI_API_KEY for Gemini');
    process.exit(1);
  }

  console.log(`\n📋 Found ${configuredProviders.length} configured provider(s):`);
  configuredProviders.forEach(provider => {
    console.log(`   • ${provider.name}`);
  });

  // Test individual providers
  console.log('\n🔬 Testing Individual Providers');
  console.log('===============================');

  const results = [];
  for (const provider of configuredProviders) {
    const result = await testProvider(provider);
    results.push({ provider: provider.name, ...result });
  }

  // Test AI router
  console.log('\n🔀 Testing AI Router');
  console.log('===================');
  const routerResult = await testAIRouter();

  // Summary
  console.log('\n📊 Test Summary');
  console.log('===============');

  const successfulProviders = results.filter(r => r.success);
  console.log(`Individual providers: ${successfulProviders.length}/${results.length} successful`);

  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    console.log(`  ${status} ${result.provider}`);
  });

  const routerStatus = routerResult.success ? '✅' : '❌';
  console.log(`AI Router: ${routerStatus} ${routerResult.success ? 'Working' : 'Failed'}`);

  if (routerResult.success && routerResult.provider) {
    console.log(`  🎯 Auto-selected: ${routerResult.provider}`);
  }

  // Final verdict
  console.log('\n🎉 Overall Status');
  console.log('=================');

  if (successfulProviders.length > 0 && routerResult.success) {
    console.log('✅ Manta AI integration is working correctly!');
    console.log(`${successfulProviders.length} provider(s) available for use.`);
    process.exit(0);
  } else {
    console.log('❌ Some issues found with AI integration.');
    console.log('Please check the error messages above and your API key configuration.');
    process.exit(1);
  }
}

// Check if we're being called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(error => {
    console.error('Test failed with error:', error);
    process.exit(1);
  });
}