import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../lib/config.js';

export const configCommand = new Command('config')
  .description('修改配置（交互式）')
  .action(async () => {
    const config = loadConfig();
    console.log(chalk.bold.cyan('\n牛马配置向导 🐂🐴\n'));

    // SMTP 配置已移至 Web UI SetupPage，niuma config 只保留基础连接配置
    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'serverPort',
        message: 'niuma-server 端口：',
        default: config.server?.port || 51700,
      },
      {
        type: 'input',
        name: 'serverUrl',
        message: 'niuma-server 地址（留空保持不变）：',
        default: config.server?.url || '',
      },
    ]);

    const newConfig = {
      ...config,
      server: {
        ...config.server,
        port: answers.serverPort,
        ...(answers.serverUrl ? { url: answers.serverUrl } : {}),
      },
    };

    saveConfig(newConfig);
    console.log(chalk.green('\n✓ 配置已更新\n'));
  });
