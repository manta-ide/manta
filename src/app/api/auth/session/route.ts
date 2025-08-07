import { auth } from "@/lib/auth";

export async function GET(request: Request) {
  return auth.handler(request);
}
