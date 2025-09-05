#!/usr/bin/env node
import main from './index.js';

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(typeof err?.exitCode === 'number' ? err.exitCode : 1);
});

