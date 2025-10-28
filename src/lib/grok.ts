import OpenAI from 'openai';

const baseURL = process.env.XAI_BASE_URL || 'https://api.x.ai/v1';
const apiKey = process.env.XAI_API_KEY || '';
const defaultModel = process.env.XAI_MODEL || 'grok-2-latest';

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({ apiKey, baseURL });
  }
  return client;
}

export async function grokChat(messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>, model = defaultModel): Promise<string> {
  if (!apiKey) throw new Error('XAI_API_KEY is not set');
  const cli = getClient();
  const resp = await cli.chat.completions.create({ model, messages });
  const text = resp.choices?.[0]?.message?.content || '';
  return text;
}

