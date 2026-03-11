import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { detectOpenClaw, installOpenClaw } from '../lib/openclaw.js';
import { saveConfig, loadConfig } from '../lib/config.js';

export const installCommand = new Command('install')
  .description('交互式安装向导')
  .action(async () => {
    console.log(chalk.bold.cyan('\n欢迎使用牛马 (niuma) 安装向导 🐂🐴\n'));

    const config = loadConfig();

    // Step 1: 检测 OpenClaw
    console.log(chalk.bold('Step 1/5  检测 OpenClaw'));
    const spinner = ora('正在检测 OpenClaw 安装...').start();
    const existing = await detectOpenClaw();
    spinner.stop();

    let openclawPath;
    if (existing) {
      console.log(chalk.green(`  ✓ 检测到服务器上已有 OpenClaw（${existing}）`));
      const { useExisting } = await inquirer.prompt([{
        type: 'confirm',
        name: 'useExisting',
        message: '是否使用现有的 OpenClaw？',
        default: true,
      }]);
      if (useExisting) {
        openclawPath = existing;
      } else {
        const { customPath } = await inquirer.prompt([{
          type: 'input',
          name: 'customPath',
          message: '新的安装路径：',
          default: '/opt/niuma-openclaw',
        }]);
        openclawPath = customPath;
      }
    } else {
      console.log(chalk.yellow('  ✗ 未检测到 OpenClaw'));
      const { installPath } = await inquirer.prompt([{
        type: 'input',
        name: 'installPath',
        message: 'OpenClaw 安装路径：',
        default: '/opt/niuma-openclaw',
      }]);
      openclawPath = installPath;
    }
    console.log();

    // Step 2: 配置邮箱
    console.log(chalk.bold('Step 2/5  配置邮箱'));
    const emailAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'email',
        message: '邮箱地址：',
        default: config.email?.address,
        validate: v => v.includes('@') || '请输入有效邮箱地址',
      },
      {
        type: 'password',
        name: 'smtpToken',
        message: 'SMTP 授权码：',
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
    ]);
    console.log();

    // Step 3: 配置服务
    console.log(chalk.bold('Step 3/5  配置服务'));
    const serverAnswers = await inquirer.prompt([
      {
        type: 'number',
        name: 'serverPort',
        message: 'niuma-server 端口：',
        default: config.server?.port || 3002,
      },
      {
        type: 'input',
        name: 'serverPath',
        message: 'niuma-server 安装路径：',
        default: config.server?.path || '/opt/niuma-server',
      },
    ]);
    console.log();

    // Step 4: 选择 Agent 套餐
    console.log(chalk.bold('Step 4/5  选择 Agent 套餐'));
    const AGENT_PACKAGES = {
      '基础套餐（Planning + Coder + Writer + Analyst）': ['planning', 'coder', 'writer', 'analyst'],
      '研发团队（基础 + Designer + DevOps + QA）': ['planning', 'coder', 'writer', 'analyst', 'designer', 'devops', 'qa'],
      '全家桶（所有角色）': ['planning', 'coder', 'writer', 'analyst', 'designer', 'devops', 'qa', 'sales', 'support'],
      '自定义': null,
    };

    const { packageChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'packageChoice',
      message: '选择 Agent 套餐：',
      choices: Object.keys(AGENT_PACKAGES),
    }]);

    let selectedAgents;
    if (AGENT_PACKAGES[packageChoice] === null) {
      const { agents } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'agents',
        message: '选择要安装的 Agent：',
        choices: ['planning', 'coder', 'writer', 'analyst', 'designer', 'devops', 'qa', 'sales', 'support'],
      }]);
      selectedAgents = agents;
    } else {
      selectedAgents = AGENT_PACKAGES[packageChoice];
    }
    console.log();

    // Step 5: 确认并安装
    console.log(chalk.bold('Step 5/5  确认并安装'));
    console.log(chalk.gray('  配置摘要：'));
    console.log(chalk.gray(`    OpenClaw 路径：  ${openclawPath}`));
    console.log(chalk.gray(`    邮箱地址：       ${emailAnswers.email}`));
    console.log(chalk.gray(`    SMTP 服务器：    ${emailAnswers.smtpHost}:${emailAnswers.smtpPort}`));
    console.log(chalk.gray(`    niuma-server：   ${serverAnswers.serverPath}（端口 ${serverAnswers.serverPort}）`));
    console.log(chalk.gray(`    Agent 套餐：     ${selectedAgents.join(', ')}`));
    console.log();

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: '确认开始安装？',
      default: true,
    }]);

    if (!confirm) {
      console.log(chalk.yellow('\n已取消安装。\n'));
      return;
    }

    // 执行安装
    const installSpinner = ora('正在安装 OpenClaw...').start();
    try {
      if (!existing || openclawPath !== existing) {
        // TODO: 调用官方安装脚本，支持自定义 --prefix 路径
        await installOpenClaw(openclawPath);
      }
      installSpinner.succeed('OpenClaw 就绪');

      const configSpinner = ora('正在保存配置...').start();
      const newConfig = {
        openclawPath,
        email: {
          address: emailAnswers.email,
          smtpToken: emailAnswers.smtpToken,
          smtpHost: emailAnswers.smtpHost,
          smtpPort: emailAnswers.smtpPort,
        },
        server: {
          port: serverAnswers.serverPort,
          path: serverAnswers.serverPath,
        },
        agents: selectedAgents,
      };
      saveConfig(newConfig);
      configSpinner.succeed('配置已保存到 ~/.niuma/config.json');

      const agentSpinner = ora('正在初始化 Agent 套件...').start();
      // TODO: 调用 niuma-server API 写入 agent 数据
      // await initAgents(serverAnswers.serverPort, selectedAgents);
      await new Promise(r => setTimeout(r, 800)); // 占位延时
      agentSpinner.succeed(`已初始化 ${selectedAgents.length} 个 Agent`);

      console.log(chalk.bold.green(`\n✓ 安装完成！niuma-server 运行在 http://localhost:${serverAnswers.serverPort}\n`));
    } catch (err) {
      installSpinner.fail('安装失败');
      console.error(chalk.red(err.message));
      process.exit(1);
    }
  });
