import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig } from '../lib/config.js';
import {
  startServer,
  stopServer,
  restartServer,
  statusServer,
  logsServer,
} from '../lib/systemd.js';

export const serverCommand = new Command('server')
  .description('管理 niuma-server 服务');

serverCommand
  .command('start')
  .description('启动 niuma-server')
  .action(async () => {
    const config = loadConfig();
    const spinner = ora('正在启动 niuma-server...').start();
    try {
      await startServer(config);
      spinner.succeed(chalk.green(`niuma-server 已启动，监听端口 ${config.server?.port || 3002}`));
    } catch (err) {
      spinner.fail('启动失败');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

serverCommand
  .command('stop')
  .description('停止 niuma-server')
  .action(async () => {
    const spinner = ora('正在停止 niuma-server...').start();
    try {
      await stopServer();
      spinner.succeed('niuma-server 已停止');
    } catch (err) {
      spinner.fail('停止失败');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

serverCommand
  .command('restart')
  .description('重启 niuma-server')
  .action(async () => {
    const config = loadConfig();
    const spinner = ora('正在重启 niuma-server...').start();
    try {
      await restartServer(config);
      spinner.succeed('niuma-server 已重启');
    } catch (err) {
      spinner.fail('重启失败');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

serverCommand
  .command('status')
  .description('查看 niuma-server 状态')
  .action(async () => {
    try {
      const status = await statusServer();
      if (status.running) {
        console.log(chalk.green(`✓ niuma-server 运行中`));
        console.log(chalk.gray(`  PID: ${status.pid || 'N/A'}`));
        console.log(chalk.gray(`  端口: ${status.port || 'N/A'}`));
        console.log(chalk.gray(`  启动时间: ${status.uptime || 'N/A'}`));
      } else {
        console.log(chalk.yellow('✗ niuma-server 未运行'));
      }
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });

serverCommand
  .command('logs')
  .description('查看 niuma-server 日志')
  .option('-n, --lines <number>', '显示最后 N 行', '100')
  .option('-f, --follow', '实时跟踪日志')
  .action(async (options) => {
    try {
      await logsServer({ lines: parseInt(options.lines), follow: options.follow });
    } catch (err) {
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
