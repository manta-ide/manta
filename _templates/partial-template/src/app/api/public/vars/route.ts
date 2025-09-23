import { NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { join } from 'path';

// Public vars endpoint
// - GET /api/public/vars -> returns vars.json content
// Notes:
// - This route serves the vars.json file for HMR functionality
// - No authentication required for local development

export async function GET() {
  try {
    // Read vars.json from the .manta directory
    const varsPath = join(process.cwd(), '.manta', 'vars.json');
    const varsContent = readFileSync(varsPath, 'utf8');
    const vars = JSON.parse(varsContent);

    return NextResponse.json(vars);
  } catch (error) {
    console.error('Error serving vars.json:', error);
    return NextResponse.json({ error: 'Failed to load vars' }, { status: 500 });
  }
}
