import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { join } from 'path';
import {
  detectOpenClaw,
  checkGateway,
  detectAgentApi,
  listAgents,
  createAgent,
  GATEWAY_URL,
} from '../lib/openclaw.js';
import { saveConfig, loadConfig } from '../lib/config.js';
import { writeSystemdService } from '../lib/systemd-install.js';

const AGENTS = [
  {
    id: 'niuma-planner',
    name: '规划师',
    description: '统筹规划，任务拆解，协调团队',
    systemPrompt: '你是一个专业的项目规划师，擅长任务分解、优先级排序和团队协调。请用中文回复。',
  },
  {
    id: 'niuma-coder',
    name: '工程师',
    description: '全栈开发，代码实现，技术方案',
    systemPrompt: '你是一个经验丰富的全栈工程师，精通前后端开发。请用中文回复，代码注释用中文。',
  },
  {
    id: 'niuma-designer',
    name: '设计师',
    description: 'UI/UX 设计，视觉规范，用户体验',
    systemPrompt: '你是一个专业的 UI/UX 设计师，擅长界面设计和用户体验优化。请用中文回复。',
  },
  {
    id: 'niuma-analyst',
    name: '分析师',
    description: '数据分析，市场研究，决策支持',
    systemPrompt: '你是一个专业的数据分析师，擅长数据解读和商业洞察。请用中文回复。',
  },
  {
    id: 'niuma-writer',
    name: '文案',
    description: '内容创作，文案撰写，品牌传播',
    systemPrompt: '你是一个专业的内容创作者，擅长各类文案写作。请用中文回复。',
  },
];

function getLocalIP() {
  const nets = networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const info of iface || []) {
      if (info.family === 'IPv4' && !info.internal) {
        return info.address;
      }
    }
  }
  return 'localhost';
}

export const installCommand = new Command('install')
  .description('交互式安装向导')
  .action(async () => {
    console.log(chalk.bold.cyan('\n欢迎使用牛马 (niuma) 安装向导 🐂🐴\n'));

    const config = loadConfig();

    // ─────────────────────────────────────────────
    // Step 1: 检测 OpenClaw
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 1/5  检测 OpenClaw'));
    const s1 = ora('正在检测 OpenClaw...').start();
    const existing = await detectOpenClaw();
    if (!existing) {
      s1.fail('未检测到 OpenClaw');
      console.error(chalk.red('\n❌ 未检测到 OpenClaw，请先安装：https://openclaw.ai\n'));
      process.exit(1);
    }
    s1.succeed(chalk.green(`检测到 OpenClaw（${existing}）`));

    const s1b = ora('正在连接 OpenClaw Gateway...').start();
    const gatewayOk = await checkGateway();
    if (!gatewayOk) {
      s1b.warn(chalk.yellow(`Gateway 未响应（${GATEWAY_URL}），将继续但 Agent 创建步骤可能失败`));
    } else {
      s1b.succeed(chalk.green(`Gateway 在线（${GATEWAY_URL}）`));
    }
    console.log();

    // ─────────────────────────────────────────────
    // Step 2: 配置邮箱 SMTP
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 2/5  配置邮箱 SMTP'));
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

    const { sendTestEmail } = await inquirer.prompt([{
      type: 'confirm',
      name: 'sendTestEmail',
      message: '是否发送测试邮件验证配置？',
      default: false,
    }]);

    if (sendTestEmail) {
      const testSpinner = ora('正在发送测试邮件...').start();
      try {
        // 简单 SMTP 连通性测试（占位，实际可集成 nodemailer）
        testSpinner.warn('测试邮件功能需 niuma-server 运行后再验证，已跳过');
      } catch (err) {
        testSpinner.fail(`测试失败：${err.message}`);
      }
    }
    console.log();

    // ─────────────────────────────────────────────
    // Step 3: 在 OpenClaw 上创建 Agent 套件
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 3/5  创建 Agent 套件'));
    const s3 = ora('探测 OpenClaw Agent API...').start();
    const apiPaths = await detectAgentApi();
    if (!apiPaths) {
      s3.warn('无法探测到 Agent API，跳过 Agent 创建步骤');
    } else {
      s3.succeed(`Agent API: ${apiPaths.listPath}`);

      const existingAgents = await listAgents(apiPaths.listPath);
      const existingIds = new Set(existingAgents.map(a => a.id || a.name));
      const existingNames = new Set(existingAgents.map(a => a.name));

      for (const agent of AGENTS) {
        if (existingIds.has(agent.id) || existingNames.has(agent.name)) {
          console.log(chalk.gray(`  ⏭  ${agent.name}（${agent.id}）已存在，跳过`));
          continue;
        }
        const as = ora(`  创建 Agent: ${agent.name}（${agent.id}）`).start();
        try {
          const ok = await createAgent(apiPaths.createPath, agent);
          if (ok) {
            as.succeed(chalk.green(`  ✓ ${agent.name}（${agent.id}）`));
          } else {
            as.warn(chalk.yellow(`  ⚠ ${agent.name} 创建响应异常，请手动确认`));
          }
        } catch (err) {
          as.fail(chalk.red(`  ✗ ${agent.name} 创建失败：${err.message}`));
        }
      }
    }
    console.log();

    // ─────────────────────────────────────────────
    // Step 4: 部署 niuma-server
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 4/5  部署 niuma-server'));
    const serverAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'serverPath',
        message: 'niuma-server 安装路径：',
        default: config.server?.path || '/opt/niuma-server',
      },
      {
        type: 'number',
        name: 'serverPort',
        message: 'niuma-server 端口：',
        default: config.server?.port || 3002,
      },
    ]);

    const { serverPath, serverPort } = serverAnswers;
    const alreadyInstalled = existsSync(join(serverPath, 'package.json'));

    if (alreadyInstalled) {
      const { overwrite } = await inquirer.prompt([{
        type: 'confirm',
        name: 'overwrite',
        message: `目录 ${serverPath} 已存在安装，是否更新（git pull）？`,
        default: true,
      }]);
      if (!overwrite) {
        console.log(chalk.yellow('跳过 niuma-server 部署'));
      } else {
        await deployServer({ serverPath, serverPort, emailAnswers, update: true });
      }
    } else {
      await deployServer({ serverPath, serverPort, emailAnswers, update: false });
    }
    console.log();

    // ─────────────────────────────────────────────
    // Step 5: 完成
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 5/5  完成'));

    // 保存配置
    saveConfig({
      ...config,
      openclawPath: existing,
      email: {
        address: emailAnswers.email,
        smtpToken: emailAnswers.smtpToken,
        smtpHost: emailAnswers.smtpHost,
        smtpPort: emailAnswers.smtpPort,
      },
      server: {
        port: serverPort,
        path: serverPath,
      },
    });

    const localIP = getLocalIP();
    console.log(chalk.bold.green(`\n✅ niuma-server 运行在 http://${localIP}:${serverPort}`));
    console.log(chalk.cyan(`📱 在 App 中填入此地址即可开始使用\n`));
  });

async function deployServer({ serverPath, serverPort, emailAnswers, update }) {
  const repoUrl = 'https://github.com/parksben/niuma-server.git';

  // Clone / pull
  const cloneSpinner = ora(update ? '正在更新 niuma-server...' : '正在克隆 niuma-server...').start();
  try {
    if (update) {
      execSync(`git -C "${serverPath}" pull`, { stdio: 'pipe' });
    } else {
      execSync(`git clone "${repoUrl}" "${serverPath}"`, { stdio: 'pipe' });
    }
    cloneSpinner.succeed(update ? 'niuma-server 已更新' : 'niuma-server 克隆完成');
  } catch (err) {
    cloneSpinner.fail(`仓库操作失败：${err.message}`);
    console.error(chalk.yellow('  提示：请检查网络连接或手动克隆 ' + repoUrl));
    return;
  }

  // npm install
  const npmSpinner = ora('正在安装依赖（npm install --production）...').start();
  try {
    execSync(`cd "${serverPath}" && npm install --production`, { stdio: 'pipe' });
    npmSpinner.succeed('依赖安装完成');
  } catch (err) {
    npmSpinner.fail(`依赖安装失败：${err.message}`);
    return;
  }

  // 写入 .env
  const envContent = [
    `PORT=${serverPort}`,
    `SMTP_HOST=${emailAnswers.smtpHost}`,
    `SMTP_PORT=${emailAnswers.smtpPort}`,
    `SMTP_USER=${emailAnswers.email}`,
    `SMTP_PASS=${emailAnswers.smtpToken}`,
    `FROM_EMAIL=${emailAnswers.email}`,
  ].join('\n') + '\n';
  writeFileSync(join(serverPath, '.env'), envContent, 'utf8');
  console.log(chalk.gray('  ✓ .env 写入完成'));

  // 写入 systemd service
  try {
    writeSystemdService({ serverPath, serverPort });
    execSync('systemctl daemon-reload', { stdio: 'pipe' });
    execSync('systemctl enable niuma-server', { stdio: 'pipe' });
    execSync('systemctl start niuma-server', { stdio: 'pipe' });
    console.log(chalk.gray('  ✓ systemd 服务已启动'));

    // 等待 3 秒后健康检查
    await new Promise(r => setTimeout(r, 3000));
    const healthSpinner = ora('健康检查...').start();
    try {
      const res = await fetch(`http://localhost:${serverPort}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        healthSpinner.succeed(chalk.green(`niuma-server 健康检查通过（端口 ${serverPort}）`));
      } else {
        healthSpinner.warn(`niuma-server 响应状态 ${res.status}，请检查日志：journalctl -u niuma-server -n 50`);
      }
    } catch {
      healthSpinner.warn(`健康检查超时，请稍后运行：niuma server status`);
    }
  } catch (err) {
    console.log(chalk.yellow(`  ⚠ systemd 配置失败：${err.message}`));
    console.log(chalk.gray('  提示：可手动运行 systemctl start niuma-server，或使用 niuma server start'));
  }
}
