// Simple in-memory session registry for Claude Code streaming
// Maps a sessionId to an AbortController so other routes can stop a running agent.

const controllers = new Map<string, AbortController>();

export function setSessionController(sessionId: string, controller: AbortController) {
  controllers.set(sessionId, controller);
}

export function getSessionController(sessionId: string): AbortController | undefined {
  return controllers.get(sessionId);
}

export function clearSessionController(sessionId: string) {
  controllers.delete(sessionId);
}

export function stopSession(sessionId: string): boolean {
  const c = controllers.get(sessionId);
  if (!c) return false;
  try { c.abort('Stopped by user'); } catch {}
  controllers.delete(sessionId);
  return true;
}

