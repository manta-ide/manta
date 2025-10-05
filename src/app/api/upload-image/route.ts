import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';

// Force Node.js runtime for file operations
export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    console.log('🖼️ Processing image upload request');

    const formData = await req.formData();
    const file = formData.get('image') as File;

    if (!file) {
      console.error('❌ No image file provided');
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 });
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      console.error('❌ Invalid file type:', file.type);
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      console.error('❌ File too large:', file.size);
      return NextResponse.json({ error: 'File size must be less than 10MB' }, { status: 400 });
    }

    // Generate unique filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const randomId = Math.random().toString(36).substr(2, 9);
    const extension = path.extname(file.name) || '.png';
    const filename = `node-${timestamp}-${randomId}${extension}`;

    // Ensure upload directory exists
    const uploadDir = path.join(process.cwd(), 'public', 'uploaded-images');
    try {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
        console.log('📁 Created upload directory:', uploadDir);
      }
    } catch (dirError) {
      console.error('❌ Failed to create upload directory:', dirError);
      return NextResponse.json({
        error: 'Failed to create upload directory',
        details: dirError instanceof Error ? dirError.message : String(dirError)
      }, { status: 500 });
    }

    const filePath = path.join(uploadDir, filename);
    const publicUrl = `/uploaded-images/${filename}`;

    try {
      // Convert file to buffer and save
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      fs.writeFileSync(filePath, buffer);

      const fileStats = fs.statSync(filePath);
      console.log(`✅ Image uploaded successfully: ${filePath} (${fileStats.size} bytes)`);

      return NextResponse.json({
        success: true,
        image: {
          id: filename,
          url: publicUrl,
          filename: filename,
          size: fileStats.size,
          mimeType: file.type
        }
      });

    } catch (fileError) {
      console.error('❌ Failed to save uploaded file:', fileError);
      return NextResponse.json({
        error: 'Failed to save uploaded file',
        details: fileError instanceof Error ? fileError.message : String(fileError)
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('❌ Image upload failed:', error);
    return NextResponse.json(
      {
        error: error.message || 'Failed to upload image',
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}
