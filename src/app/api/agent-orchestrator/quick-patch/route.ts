import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';

const QuickPatchConfig = {
  model: 'gpt-5-nano',
  temperature: 1,
  promptTemplate: 'quick-patch-template',
} as const;

const RequestSchema = z.object({
  fileContent: z.string(),
  patchDescription: z.string(),
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

    const { fileContent, patchDescription } = parsed.data;

    // Get the prompt template
    const template = await getTemplate(QuickPatchConfig.promptTemplate);
    const content = parseMessageWithTemplate(template, {
      FILE_CONTENT: fileContent,
      PATCH_DESCRIPTION: patchDescription,
    });

    // Make a single LLM call
    const response = await fetch('http://localhost:3000/api/llm-agent/run', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'quick-patch',
        parsedMessages: [{ role: 'user', content }],
        config: {
          model: QuickPatchConfig.model,
          temperature: QuickPatchConfig.temperature,
          providerOptions: null,
          streaming: false,
          structuredOutput: false,
          tools: null,
          maxSteps: 1,
        },
        operationName: 'quick-patch',
        metadata: {
          fileContent,
          patchDescription
        }
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Quick patch failed: ${response.statusText}` }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const result = await response.json();

    // Extract the final content from the LLM response.
    // The /api/llm-agent/run endpoint wraps generateText output as:
    // { type: 'text', result: { text: '...', ... } }
    // Fall back to other common fields if the shape changes.
    let patchedContent =
      (result && result.result && typeof result.result.text === 'string' && result.result.text)
      || (typeof result?.text === 'string' && result.text)
      || (typeof result?.content === 'string' && result.content)
      || (typeof result?.message === 'string' && result.message)
      || fileContent;

    // Normalize: strip surrounding markdown code fences if present
    const stripFences = (s: string): string => {
      if (!s) return s;
      const fenceMatch = s.match(/^```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```\s*$/);
      if (fenceMatch) return fenceMatch[1];
      const fenceMatchNoLang = s.match(/^```\n([\s\S]*?)\n```\s*$/);
      return fenceMatchNoLang ? fenceMatchNoLang[1] : s;
    };
    patchedContent = stripFences(patchedContent);

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
