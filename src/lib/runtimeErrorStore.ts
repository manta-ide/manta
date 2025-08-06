let lastError:
  | { message: string; componentStack: string | undefined; ts: number }
  | null = null;

export function setLastError(
  message: string,
  componentStack?: string,
): void {
  lastError = { message, componentStack, ts: Date.now() };
}

export function getLastError() {
  return lastError;
}

export function clearLastError() {
  lastError = null;
}