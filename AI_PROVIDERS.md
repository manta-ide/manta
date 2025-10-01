# Multi-AI Provider Integration for Manta IDE

Manta IDE now supports multiple AI providers, giving you the flexibility to choose the best AI model for your specific tasks. This document explains how to set up and use different AI providers.

## Supported AI Providers

### 🤖 Claude (Anthropic)
- **Models**: claude-3-5-sonnet, claude-3-haiku, claude-3-opus
- **Best for**: Code generation, analysis, and complex reasoning tasks
- **Setup**: Set `ANTHROPIC_API_KEY` environment variable
- **Endpoint**: `/api/claude-code/execute`

### 💻 Codex (OpenAI)
- **Models**: code-davinci-002, code-cushman-001
- **Best for**: Code completion and generation
- **Setup**: Set `OPENAI_API_KEY` environment variable
- **Endpoint**: `/api/codex/execute`

### 🇨🇳 Qwen (Alibaba)
- **Models**: qwen-coder-plus, qwen-max, qwen-turbo
- **Best for**: Multilingual tasks, Chinese language support
- **Setup**: Set `DASHSCOPE_API_KEY` or `QWEN_API_KEY` environment variable
- **Endpoint**: `/api/qwen/execute`

### 🌟 Gemini (Google)
- **Models**: gemini-1.5-pro, gemini-1.5-flash, gemini-pro
- **Best for**: Creative tasks, multimodal content
- **Setup**: Set `GOOGLE_API_KEY` or `GEMINI_API_KEY` environment variable
- **Endpoint**: `/api/gemini/execute`

## Quick Start

### 1. Install Manta IDE
```bash
npm install -g manta-ide
```

### 2. Set up API Keys
Choose one or more providers and set the corresponding environment variables:

```bash
# Claude (Anthropic)
export ANTHROPIC_API_KEY="your-claude-api-key"

# Codex (OpenAI)
export OPENAI_API_KEY="your-openai-api-key"

# Qwen (Alibaba)
export DASHSCOPE_API_KEY="your-qwen-api-key"

# Gemini (Google)
export GOOGLE_API_KEY="your-gemini-api-key"
```

### 3. Check Provider Status
```bash
manta providers
```

This will show you which providers are configured and available.

### 4. Start Manta IDE
```bash
manta run
```

## API Usage

### Unified AI Endpoint
Use the unified endpoint that automatically selects the best provider:

```typescript
// POST /api/ai/execute
{
  "prompt": "Create a React component for a todo list",
  "provider": "auto", // or specify: "claude", "codex", "qwen", "gemini"
  "options": {
    "temperature": 0.1,
    "max_tokens": 2048,
    "verbose": false
  }
}
```

### Provider-Specific Endpoints
Or use provider-specific endpoints for fine-grained control:

```typescript
// Claude
// POST /api/claude-code/execute
{
  "prompt": "Your prompt here",
  "options": {
    "model": "sonnet",
    "temperature": 0.1,
    "max_tokens": 2048
  }
}

// Codex
// POST /api/codex/execute
{
  "prompt": "Your prompt here",
  "options": {
    "model": "code-davinci-002",
    "temperature": 0.1,
    "max_tokens": 2048
  }
}

// Qwen
// POST /api/qwen/execute
{
  "prompt": "Your prompt here",
  "options": {
    "model": "qwen-coder-plus",
    "temperature": 0.1,
    "max_tokens": 2048
  }
}

// Gemini
// POST /api/gemini/execute
{
  "prompt": "Your prompt here",
  "options": {
    "model": "gemini-1.5-pro",
    "temperature": 0.1,
    "max_tokens": 2048,
    "stream": false
  }
}
```

## Smart Provider Selection

When using the unified endpoint with `"provider": "auto"`, Manta IDE automatically selects the best provider based on:

1. **Task Type Detection**: Keywords in your prompt
   - Code-related: Prefers Claude → Codex
   - Creative tasks: Prefers Gemini → Claude
   - Chinese/Translation: Prefers Qwen → Gemini
   - General tasks: Uses configured priority order

2. **Provider Availability**: Only uses providers with valid API keys

3. **Fallback Order**: Claude → Gemini → Qwen → Codex

## Configuration Management

### Environment Variables
```bash
# Provider API Keys
ANTHROPIC_API_KEY="your-claude-key"
OPENAI_API_KEY="your-openai-key"
DASHSCOPE_API_KEY="your-qwen-key"
GOOGLE_API_KEY="your-gemini-key"

# Logging (optional)
VERBOSE_AI_LOGS=1                # Enable verbose logging for all providers
VERBOSE_CLAUDE_LOGS=1            # Claude-specific verbose logging
VERBOSE_CODEX_LOGS=1             # Codex-specific verbose logging
VERBOSE_QWEN_LOGS=1              # Qwen-specific verbose logging
VERBOSE_GEMINI_LOGS=1            # Gemini-specific verbose logging

# Manta Configuration
MANTA_PROJECT_DIR="/path/to/project"  # Override project directory
```

### Configuration File
Configuration is automatically saved to `~/.manta/ai-config.json`:

```json
{
  "providers": {
    "claude": {
      "name": "Claude (Anthropic)",
      "apiKey": "your-key",
      "model": "sonnet",
      "enabled": true,
      "priority": 1
    },
    "codex": {
      "name": "Codex (OpenAI)",
      "apiKey": "your-key",
      "model": "code-davinci-002",
      "enabled": true,
      "priority": 3
    }
  },
  "defaultProvider": "claude",
  "fallbackOrder": ["claude", "gemini", "qwen", "codex"],
  "verboseLogging": false
}
```

## CLI Commands

### Check Provider Status
```bash
manta providers
```
Shows which providers are configured and their status.

### Get Help
```bash
manta help
```
Shows all available commands and environment variables.

### Start with Specific Configuration
```bash
# Start Manta IDE
manta run

# Start in development mode
manta dev

# Install template
manta install
```

## Testing Your Setup

Run the provider integration test:

```bash
node scripts/test-ai-providers.js
```

This will test all configured providers and the AI router to ensure everything is working correctly.

## Best Practices

### 1. Provider Selection
- **Claude**: Best for complex coding tasks, analysis, and reasoning
- **Codex**: Optimized for code completion and generation
- **Qwen**: Excellent for multilingual projects and Chinese language tasks
- **Gemini**: Great for creative writing and brainstorming

### 2. API Key Security
- Never commit API keys to version control
- Use environment variables or secure configuration files
- Rotate keys regularly
- Monitor usage and costs

### 3. Error Handling
- Configure multiple providers for redundancy
- Monitor provider availability and costs
- Use appropriate timeouts and retry logic

### 4. Performance
- Choose models appropriate for your task complexity
- Use streaming for long responses
- Configure reasonable token limits

## Troubleshooting

### Common Issues

1. **"No AI providers are configured"**
   - Check that you've set at least one API key environment variable
   - Run `manta providers` to verify configuration

2. **Provider not responding**
   - Verify your API key is correct and active
   - Check your internet connection
   - Verify the provider's service status

3. **Rate limiting**
   - Most providers have rate limits
   - Consider upgrading your API plan
   - Implement request throttling if needed

4. **Streaming issues**
   - Some networks block streaming responses
   - Try disabling streaming with `"stream": false`

### Getting Help

- Check the [Manta IDE GitHub repository](https://github.com/manta-ide/manta) for issues
- Review provider documentation for API-specific issues
- Enable verbose logging for detailed error information

## Examples

### Basic Code Generation
```bash
curl -X POST http://localhost:3001/api/ai/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a TypeScript function that validates email addresses",
    "provider": "auto",
    "options": {
      "temperature": 0.1,
      "max_tokens": 1000
    }
  }'
```

### Creative Writing with Gemini
```bash
curl -X POST http://localhost:3001/api/gemini/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Write a creative story about a developer who discovers an AI that can predict bugs",
    "options": {
      "temperature": 0.8,
      "max_tokens": 2000,
      "stream": true
    }
  }'
```

### Multilingual Task with Qwen
```bash
curl -X POST http://localhost:3001/api/qwen/execute \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "请帮我创建一个中英文双语的React组件",
    "options": {
      "temperature": 0.2,
      "max_tokens": 1500
    }
  }'
```

## Contributing

If you'd like to add support for additional AI providers:

1. Create a new route in `src/app/api/[provider]/execute/route.ts`
2. Add the provider to the schemas in `src/app/api/lib/schemas.ts`
3. Update the AI router in `src/app/api/ai/execute/route.ts`
4. Add configuration to `src/app/api/lib/ai-config.ts`
5. Update the CLI help and provider checking
6. Add tests to `scripts/test-ai-providers.js`

See existing provider implementations as examples.