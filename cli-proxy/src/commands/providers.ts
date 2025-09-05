import {Command} from '@oclif/core';
import {listProviders} from '../providers/index.js';

export default class Providers extends Command {
  static description = 'List available providers';

  async run(): Promise<void> {
    const providers = listProviders();
    for (const p of providers) this.log(p);
  }
}

