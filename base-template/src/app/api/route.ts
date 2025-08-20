import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const runtime = "nodejs";

export async function GET() {
  try {
    const fp = path.resolve(".graph/vars.json");
    const json = JSON.parse(fs.readFileSync(fp, "utf8"));
    return NextResponse.json(json, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({}, { headers: { "Cache-Control": "no-store" } });
  }
}
