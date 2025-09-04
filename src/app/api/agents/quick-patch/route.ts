import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTemplate, parseMessageWithTemplate } from '@/app/api/lib/promptTemplateUtils';
import path from 'path';
import { createWriteStream } from 'fs';
import { promises as fsp } from 'fs';

const QuickPatchConfig = {
  model: 'morph-v3-large',
  temperature: 1,
  promptTemplate: 'quick-patch-template',
} as const;

const RequestSchema = z.object({
  fileContent: z.string(),
  patchDescription: z.string(),
  filePath: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // Initialize logging variables
  const startTime = Date.now();
  let writeLog: (s: string) => void = (s: string) => console.log(s);
  const operationName = 'quick-patch';
  let logStream: any = null;

  try {

    const parsed = RequestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { fileContent, patchDescription, filePath } = parsed.data;

    // Prepare logging
    const logsDir = path.join(process.cwd(), 'logs');
    await fsp.mkdir(logsDir, { recursive: true });
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const second = now.getSeconds();
    const day = now.getDate();
    const month = now.getMonth() + 1; // getMonth() returns 0-11
    const year = now.getFullYear();
    const dateString = `${hour}_${minute.toString().padStart(2, '0')}_${second.toString().padStart(2, '0')}___${day}_${month}_${year}`;

    const logFilePath = path.join(
      logsDir,
      `${operationName}-${dateString}.log`
    );
    logStream = createWriteStream(logFilePath, { flags: 'a' });
    writeLog = (s: string) => logStream.write(s.endsWith('\n') ? s : s + '\n');

    // Log request details
    writeLog(`[${operationName}]`);
    writeLog(`[${operationName}] Request received`);
    writeLog(`[${operationName}] File Path: ${filePath || 'N/A'}`);
    writeLog(`[${operationName}] Patch Description: ${patchDescription}`);
    writeLog(`[${operationName}] Model: ${QuickPatchConfig.model}`);
    writeLog(`[${operationName}] Temperature: ${QuickPatchConfig.temperature}`);

    // Get the prompt template
    const template = await getTemplate(QuickPatchConfig.promptTemplate);
    const content = parseMessageWithTemplate(template, {
      FILE_CONTENT: fileContent,
      PATCH_DESCRIPTION: patchDescription,
      FILE_PATH: filePath || '',
    });

    writeLog(`[${operationName}] Template processed successfully`);
    writeLog(`[${operationName}] Prompt length: ${content.length} characters`);

    // Call Morph LLM (OpenAI-compatible) Chat Completions API
    const apiKey = process.env.MORPH_API_KEY;
    if (!apiKey) {
      writeLog(`[${operationName}] ERROR: Missing MORPH_API_KEY in environment`);
      return new Response(JSON.stringify({
        error: 'Missing MORPH_API_KEY in environment',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const model = QuickPatchConfig.model;
    const url = `https://api.morphllm.com/v1/chat/completions`;
    writeLog(`[${operationName}] Calling Morph LLM: ${model}`);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content,
          },
        ],
        stream: false,
      }),
      signal: req.signal,
    });

    if (!response.ok) {
      const errText = await response.text();
      writeLog(`[${operationName}] ERROR: Morph API failed: ${response.status} ${response.statusText}`);
      writeLog(`[${operationName}] ERROR Details: ${errText}`);
      return new Response(JSON.stringify({ error: `Quick patch failed: ${response.status} ${response.statusText}`, details: errText }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    writeLog(`[${operationName}] Morph API call successful`);

    const morph = await response.json();
    writeLog(`[${operationName}] Processing Morph response`);

    // Extract text from Morph (OpenAI-compatible) response
    const patchedContent = (() => {
      try {
        const msg = morph?.choices?.[0]?.message?.content;
        const text = typeof msg === 'string' ? msg.trim() : '';
        if (text) return text;
        writeLog(`[${operationName}] WARNING: No valid text content found in response, using original content`);
        return '';
      } catch (err) {
        writeLog(`[${operationName}] ERROR: Failed to extract text from Morph response: ${err}`);
        return '';
      }
    })() || fileContent;

        writeLog(`[${operationName}] Patch generated successfully`);
    writeLog(`[${operationName}] Original content length: ${fileContent.length} characters`);
    writeLog(`[${operationName}] Patched content length: ${patchedContent.length} characters`);

    // Write summary before ending
    const endTime = Date.now();
    const totalTimeMs = endTime - startTime;
    const totalMinutes = Math.floor(totalTimeMs / 60000);
    const totalSeconds = Math.floor((totalTimeMs % 60000) / 1000);

    writeLog(`\n[${operationName}] === SUMMARY ===`);
    writeLog(`[${operationName}] Description: Quick patch operation`);
    writeLog(`[${operationName}] Total Time: ${totalMinutes}m ${totalSeconds}s`);
    writeLog(`[${operationName}] Model: ${QuickPatchConfig.model}`);
    writeLog(`[${operationName}] File Path: ${filePath || 'N/A'}`);
    writeLog(`[${operationName}] Original Content Length: ${fileContent.length} characters`);
    writeLog(`[${operationName}] Patched Content Length: ${patchedContent.length} characters`);
    writeLog(`[${operationName}] === END SUMMARY ===\n`);

    logStream.end();
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

    // Log error details if logging was initialized
    try {
      if (typeof writeLog === 'function') {
        writeLog(`[${operationName}] ERROR: ${err?.message || 'Unknown error'}`);
        if (err?.stack) {
          writeLog(`[${operationName}] ERROR Stack: ${err.stack}`);
        }

        // Write error summary
        const endTime = Date.now();
        const totalTimeMs = endTime - startTime;
        const totalMinutes = Math.floor(totalTimeMs / 60000);
        const totalSeconds = Math.floor((totalTimeMs % 60000) / 1000);

        writeLog(`\n[${operationName}] === ERROR SUMMARY ===`);
        writeLog(`[${operationName}] Description: Quick patch operation failed`);
        writeLog(`[${operationName}] Total Time: ${totalMinutes}m ${totalSeconds}s`);
        writeLog(`[${operationName}] Error: ${err?.message || 'Unknown error'}`);
        writeLog(`[${operationName}] === END ERROR SUMMARY ===\n`);

        logStream.end();
      }
    } catch (logErr) {
      // If logging fails, just continue with response
      console.error('Logging error:', logErr);
    }

    return new Response(JSON.stringify({
      error: err?.message || 'Server error',
      success: false
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
