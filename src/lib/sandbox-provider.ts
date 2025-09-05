// Central provider bootstrap for the generic SandboxService.
// Currently registers the Blaxel provider; swap here to use other providers.

import { SandboxService } from './sandbox-service';
import { registerBlaxelProvider } from './blaxel';

// In future, switch by env var (e.g., SANDBOX_PROVIDER)
// For now, always register Blaxel as provider.
try {
  registerBlaxelProvider();
} catch (e) {
  // Avoid crashing module load; actual calls will surface errors if provider missing
  console.error('[sandbox-provider] Failed to register provider:', e);
}

export { SandboxService };

