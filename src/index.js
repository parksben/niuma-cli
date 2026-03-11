#!/usr/bin/env node

import { program } from 'commander';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const require = createRequire(import.meta.url);
const pkg = require('../package.json');

program
  .name('niuma')
  .description('牛马产品统一命令行工具 🐂🐴')
  .version(pkg.version, '-v, --version');

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
