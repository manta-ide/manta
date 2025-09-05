// Central provider bootstrap for the generic SandboxService.
// Currently registers the Blaxel provider; swap here to use other providers.

import { SandboxService } from './sandbox-service';
import { registerBlaxelProvider } from './blaxel';
import { registerLocalProvider } from './local-sandbox';

// Switch by env var (SANDBOX_PROVIDER=local to use local provider)
try {
  const provider = "local";//process.env.SANDBOX_PROVIDER?.toLowerCase();
  if (provider === 'local') {
    registerLocalProvider();
    console.log('[sandbox-provider] Registered local sandbox provider');
  } else {
    registerBlaxelProvider();
    console.log('[sandbox-provider] Registered Blaxel sandbox provider');
  }
} catch (e) {
  // Avoid crashing module load; actual calls will surface errors if provider missing
  console.error('[sandbox-provider] Failed to register provider:', e);
}

export { SandboxService };
