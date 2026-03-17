#!/usr/bin/env node

import { program } from 'commander';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Version: read from package.json at runtime (dev), or use embedded version (compiled binary)
let version = '0.1.4';
try {
  const pkg = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
  version = pkg.version;
} catch {
  // Compiled binary — use hardcoded version
}

program
  .name('niuma')
  .description('牛马产品统一命令行工具 🐂🐴')
  .version(version, '-v, --version');

// niuma install
const { installCommand } = await import('./commands/install.js');
program.addCommand(installCommand);

// niuma config
const { configCommand } = await import('./commands/config.js');
program.addCommand(configCommand);

// niuma server
const { serverCommand } = await import('./commands/server.js');
program.addCommand(serverCommand);

// niuma agents
const { agentsCommand } = await import('./commands/agents.js');
program.addCommand(agentsCommand);

// niuma version (alias)
program
  .command('version')
  .description('查看版本信息')
  .action(() => {
    console.log(`niuma-cli v${pkg.version}`);
  });

program.parse(process.argv);
