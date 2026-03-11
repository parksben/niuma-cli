import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { loadConfig, saveConfig } from '../lib/config.js';

export const configCommand = new Command('config')
  .description('修改配置（交互式）')
  .action(async () => {
    const config = loadConfig();
    console.log(chalk.bold.cyan('\n牛马配置向导 🐂🐴\n'));

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: '邮箱地址：',
        default: config.email?.address,
      },
      {
        type: 'password',
        name: 'smtpToken',
        message: 'SMTP 授权码（留空保持不变）：',
        mask: '*',
      },
      {
        type: 'input',
        name: 'smtpHost',
        message: 'SMTP 服务器：',
        default: config.email?.smtpHost || 'smtp.126.com',
      },
      {
        type: 'number',
        name: 'smtpPort',
        message: 'SMTP 端口：',
        default: config.email?.smtpPort || 465,
      },
      {
        type: 'number',
        name: 'serverPort',
        message: 'niuma-server 端口：',
        default: config.server?.port || 3002,
      },
    ]);

    const newConfig = {
      ...config,
      email: {
        address: answers.email,
        smtpToken: answers.smtpToken || config.email?.smtpToken,
        smtpHost: answers.smtpHost,
        smtpPort: answers.smtpPort,
      },
      server: {
        ...config.server,
        port: answers.serverPort,
      },
    };

    saveConfig(newConfig);
    console.log(chalk.green('\n✓ 配置已更新\n'));
  });
