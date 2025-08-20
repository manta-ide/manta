import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';

const QuickPatchConfig = {
  model: 'gemini-2.5-flash',
  temperature: 1,
  promptTemplate: 'quick-patch-template',
  // optional: provider override; if undefined, provider auto-detected by model id
  provider: 'google',
  providerOptions: {
    google: {
      temperature: 1,
      thinking_config: {
        thinking_budget:0
      }
    }
  }
} as const;

const RequestSchema = z.object({
  fileContent: z.string(),
  patchDescription: z.string(),
  filePath: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { fileContent, patchDescription, filePath } = parsed.data;

    // Get the prompt template
    const template = await getTemplate(QuickPatchConfig.promptTemplate);
    const content = parseMessageWithTemplate(template, {
      FILE_CONTENT: fileContent,
      PATCH_DESCRIPTION: patchDescription,
      FILE_PATH: filePath || '',
    });

    // Call Google Gemini API directly to avoid AI SDK model version constraints
    const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!apiKey) {
      return new Response(JSON.stringify({
        error: 'Missing GOOGLE_GENERATIVE_AI_API_KEY in environment',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const model = QuickPatchConfig.model;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: content }],
          },
        ],
        generationConfig: {
          temperature: QuickPatchConfig.temperature,
          maxOutputTokens: 8192,
        },
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      return new Response(JSON.stringify({ error: `Quick patch failed: ${response.status} ${response.statusText}`, details: errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const gemini = await response.json();

    // Extract text from Gemini response
    let patchedContent = (() => {
      try {
        const firstCandidate = Array.isArray(gemini?.candidates) ? gemini.candidates[0] : undefined;
        const parts = firstCandidate?.content?.parts;
        if (Array.isArray(parts)) {
          const text = parts
            .map((p: any) => (typeof p?.text === 'string' ? p.text : ''))
            .join('')
            .trim();
          if (text) return text;
        }
        return '';
      } catch {
        return '';
      }
    })() || fileContent;

    return new Response(JSON.stringify({ 
      success: true, 
      patchedContent,
      originalContent: fileContent,
      patchDescription 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('Quick patch error:', err);
    return new Response(JSON.stringify({ 
      error: err?.message || 'Server error',
      success: false 
    }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
