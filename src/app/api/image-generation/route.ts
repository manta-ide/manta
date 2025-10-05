import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import * as fs from 'fs';
import * as path from 'path';

// Force Node.js runtime for image generation
export const runtime = 'nodejs';

interface ImageGenerationRequest {
  prompt: string;
  aspectRatio?: '1:1' | '2:3' | '3:2' | '3:4' | '4:3' | '4:5' | '5:4' | '9:16' | '16:9' | '21:9';
  previousImage?: {
    data: string;
    mimeType: string;
  };
  previousImages?: {
    data: string;
    mimeType: string;
  }[];
}

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = `img-${startTime}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`🎨 [${requestId}] Starting image generation request`);

  try {
    const body = await req.json();
    console.log(`📥 [${requestId}] Received request body:`, {
      promptLength: body.prompt?.length,
      aspectRatio: body.aspectRatio,
      hasPrompt: !!body.prompt
    });

    const { prompt, aspectRatio = '16:9', previousImage, previousImages }: ImageGenerationRequest = body;

    if (!prompt) {
      console.error(`❌ [${requestId}] Validation failed: Prompt is required`);
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error(`❌ [${requestId}] Configuration error: Gemini API key not configured`);
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    console.log(`🔑 [${requestId}] API key configured (length: ${apiKey.length})`);
    console.log(`📝 [${requestId}] Prompt: ${prompt.substring(0, 100)}${prompt.length > 100 ? '...' : ''}`);
    console.log(`📐 [${requestId}] Aspect ratio: ${aspectRatio}`);
    console.log(`🖼️ [${requestId}] Previous image included:`, !!previousImage);
    console.log(`🖼️ [${requestId}] Previous images count:`, previousImages?.length || 0);

    // Initialize the Gemini client
    console.log(`🔧 [${requestId}] Initializing Gemini SDK client`);
    const ai = new GoogleGenAI({ apiKey });

    // Prepare content array for Gemini API
    const contents: any[] = [];

    // Add previous images if available (for iterative generation)
    const allPreviousImages = [];

    // Handle legacy single previousImage
    if (previousImage) {
      allPreviousImages.push(previousImage);
    }

    // Handle new previousImages array
    if (previousImages && previousImages.length > 0) {
      allPreviousImages.push(...previousImages);
    }

    // Add all previous images to content
    for (const image of allPreviousImages) {
      contents.push({
        inlineData: {
          data: image.data,
          mimeType: image.mimeType
        }
      });
    }

    if (allPreviousImages.length > 0) {
      console.log(`📎 [${requestId}] Added ${allPreviousImages.length} reference images to content for iterative generation`);
    }

    // Add the prompt
    contents.push(prompt);

    // Generate the image using the SDK
    console.log(`🚀 [${requestId}] Calling Gemini models.generateContent`);
    const generationStartTime = Date.now();

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash-image',
      contents: contents,
      config: {
        responseModalities: ['Image'],
        imageConfig: {
          aspectRatio: aspectRatio
        }
      }
    });

    const generationDuration = Date.now() - generationStartTime;
    console.log(`✅ [${requestId}] Gemini SDK response received in ${generationDuration}ms`);

    // Debug: Log the full response structure
    console.log(`🔍 [${requestId}] Full response:`, JSON.stringify(response, null, 2));

    // Extract image data from response
    const candidates = response.candidates || [];
    console.log(`📊 [${requestId}] Response analysis:`, {
      candidatesCount: candidates.length,
      hasCandidates: candidates.length > 0
    });

    if (candidates.length > 0) {
      console.log(`🔍 [${requestId}] First candidate:`, JSON.stringify(candidates[0], null, 2));
    }

    if (candidates.length === 0) {
      console.error(`❌ [${requestId}] No candidates in response`);
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    const parts = candidates[0]?.content?.parts || [];
    console.log(`📦 [${requestId}] Content parts: ${parts.length}`);

    const imagePart = parts.find((part: any) => part.inlineData);
    console.log(`🖼️ [${requestId}] Image part found:`, {
      hasImagePart: !!imagePart,
      hasInlineData: !!(imagePart?.inlineData)
    });

    if (!imagePart || !imagePart.inlineData) {
      console.error(`❌ [${requestId}] No image data in response`);
      console.error(`📋 [${requestId}] Available parts:`, parts.map(p => ({
        type: p.text ? 'text' : p.inlineData ? 'image' : 'unknown',
        hasText: !!p.text,
        hasInlineData: !!p.inlineData,
        textPreview: p.text ? p.text.substring(0, 100) + (p.text.length > 100 ? '...' : '') : null
      })));

      // If we got text instead of image, include it in the error for debugging
      const textPart = parts.find((part: any) => part.text);
      if (textPart && textPart.text) {
        console.error(`📝 [${requestId}] Received text response instead of image:`, textPart.text);
        return NextResponse.json({
          error: 'Received text response instead of image',
          textResponse: textPart.text.substring(0, 500)
        }, { status: 500 });
      }

      return NextResponse.json({ error: 'No image data in response' }, { status: 500 });
    }

    const imageData = imagePart.inlineData.data;
    const mimeType = imagePart.inlineData.mimeType || 'image/png';

    if (!imageData) {
      console.error(`❌ [${requestId}] Image data is empty`);
      return NextResponse.json({ error: 'Empty image data in response' }, { status: 500 });
    }

    console.log(`📋 [${requestId}] Image details:`, {
      dataSize: imageData.length,
      mimeType: mimeType,
      dataType: typeof imageData
    });

    // Save the image to file
    console.log(`💾 [${requestId}] Saving image to file`);
    const imagesDir = path.join(process.cwd(), 'public', 'generated-images');

    // Ensure directory exists
    try {
      if (!fs.existsSync(imagesDir)) {
        fs.mkdirSync(imagesDir, { recursive: true });
        console.log(`📁 [${requestId}] Created images directory: ${imagesDir}`);
      }
    } catch (dirError) {
      console.error(`❌ [${requestId}] Failed to create images directory:`, dirError);
      return NextResponse.json({
        error: 'Failed to create images directory',
        metadata: { requestId, totalTimeMs: Date.now() - startTime }
      }, { status: 500 });
    }

    // Generate filename with timestamp and request ID
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `graph-${timestamp}-${requestId.substring(0, 8)}.png`;
    const filePath = path.join(imagesDir, filename);
    const publicUrl = `/generated-images/${filename}`;

    try {
      // Convert base64 to buffer and save
      const imageBuffer = Buffer.from(imageData, 'base64');
      fs.writeFileSync(filePath, imageBuffer);
      console.log(`✅ [${requestId}] Image saved to: ${filePath}`);

      const fileStats = fs.statSync(filePath);
      console.log(`📊 [${requestId}] File saved successfully: ${fileStats.size} bytes`);

    } catch (fileError) {
      console.error(`❌ [${requestId}] Failed to save image file:`, fileError);
      return NextResponse.json({
        error: 'Failed to save image file',
        metadata: { requestId, totalTimeMs: Date.now() - startTime }
      }, { status: 500 });
    }

    const totalDuration = Date.now() - startTime;
    console.log(`🎉 [${requestId}] Image generated and saved successfully in ${totalDuration}ms`);

    return NextResponse.json({
      success: true,
      image: {
        data: imageData,
        mimeType: mimeType,
        prompt: prompt,
        aspectRatio: aspectRatio,
        filePath: publicUrl,
        filename: filename
      },
      metadata: {
        requestId,
        generationTimeMs: generationDuration,
        totalTimeMs: totalDuration,
        fileSize: imageData.length
      }
    });

  } catch (error: any) {
    const totalDuration = Date.now() - startTime;
    console.error(`❌ [${requestId}] Image generation failed after ${totalDuration}ms:`, {
      error: error.message,
      stack: error.stack,
      name: error.name
    });
    return NextResponse.json(
      {
        error: error.message || 'Failed to generate image',
        metadata: {
          requestId,
          totalTimeMs: totalDuration
        }
      },
      { status: 500 }
    );
  }
}
