import {Command} from '@oclif/core';
import {listProviders} from '../providers/index.js';

export default class Providers extends Command {
  static description = 'List available providers';
  async run(): Promise<void> {
    listProviders().forEach((p) => this.log(p));
  }
}

