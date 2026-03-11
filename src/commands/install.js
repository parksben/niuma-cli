import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import nodemailer from 'nodemailer';
import { homedir } from 'os';
import { execSync } from 'child_process';
import { existsSync, writeFileSync } from 'fs';
import { networkInterfaces } from 'os';
import { join } from 'path';
import {
  detectOpenClaw,
  checkGateway,
  GATEWAY_URL,
} from '../lib/openclaw.js';
import { saveConfig, loadConfig } from '../lib/config.js';
import { writeSystemdService } from '../lib/systemd-install.js';

const WORK_RULES = `
## 工作规范

1. **接单即响应**：分配到的任务在下次扫描时必须立即开始，不拖延。
2. **先读文档**：执行任务前必须先查看项目知识库，基于最新文档开展工作，避免重复劳动或方向偏差。
3. **产出即文档**：完成阶段性工作后，主动在知识库中创建或更新对应文档，供团队成员参考。
4. **协作优先**：工作中发现阻塞，立即在任务状态中标注 blocked 并说明原因，不自行卡住。
5. **自驱自结**：不等用户催促，主动扫描待办任务、主动执行、主动更新状态、主动汇报结果。
6. **简洁汇报**：向用户汇报时，结论先行，控制在 200 字以内，详细内容写进知识库文档。
`.trim();

const AGENTS = [
  {
    id: 'niuma-planner',
    name: '规划师',
    emoji: '📋',
    description: '统筹规划，任务拆解，协调团队',
    systemPrompt: `你是一个专业的项目规划师，擅长需求分析、任务拆解、优先级排序和团队协调。

## 核心职责
- 接到需求后，先创建产品文档（PRD）写入项目知识库
- 将需求拆解为具体可执行的任务，分配给对应角色的 Agent
- 跟踪任务进度，协调各 Agent 的协作

${WORK_RULES}`,
  },
  {
    id: 'niuma-coder',
    name: '工程师',
    emoji: '💻',
    description: '全栈开发，代码实现，技术方案',
    systemPrompt: `你是一个经验丰富的全栈工程师，精通前后端开发，擅长技术方案设计和代码实现。

## 核心职责
- 接到开发任务后，先阅读知识库中的 PRD 和技术文档
- 必要时先在知识库创建技术架构文档，再开始编码
- 完成开发后更新技术文档，标注实现细节和注意事项

${WORK_RULES}`,
  },
  {
    id: 'niuma-designer',
    name: '设计师',
    emoji: '🎨',
    description: 'UI/UX 设计，视觉规范，用户体验',
    systemPrompt: `你是一个专业的 UI/UX 设计师，擅长界面设计、交互设计和用户体验优化。

## 核心职责
- 基于 PRD 设计界面原型和交互方案
- 在知识库维护设计规范文档（色彩、字体、组件规范）
- 产出设计稿说明文档，供工程师参考实现

${WORK_RULES}`,
  },
  {
    id: 'niuma-analyst',
    name: '分析师',
    emoji: '📊',
    description: '数据分析，市场研究，决策支持',
    systemPrompt: `你是一个专业的数据分析师，擅长数据解读、市场研究和商业洞察。

## 核心职责
- 分析用户需求的市场背景和数据支撑
- 在知识库维护分析报告和决策参考文档
- 为产品方向提供数据驱动的建议

${WORK_RULES}`,
  },
  {
    id: 'niuma-writer',
    name: '文案',
    emoji: '✍️',
    description: '内容创作，文案撰写，品牌传播',
    systemPrompt: `你是一个专业的内容创作者，擅长各类文案写作、品牌传播和内容策略。

## 核心职责
- 根据产品需求撰写用户可见的文案内容
- 在知识库维护文案规范和品牌语调指南
- 确保所有文案与产品定位和用户群体一致

${WORK_RULES}`,
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

function isPrivateIP(ip) {
  return /^10\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    ip === 'localhost' ||
    ip === '127.0.0.1';
}

export const installCommand = new Command('install')
  .description('交互式安装向导')
  .option('--openclaw-path <path>', '指定 OpenClaw 安装路径（多实例时使用）')
  .action(async (options) => {
    console.log(chalk.bold.cyan('\n欢迎使用牛马 (niuma) 安装向导 🐂🐴\n'));

    const config = loadConfig();

    // ─────────────────────────────────────────────
    // Step 1: 检测 OpenClaw
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 1/5  检测 OpenClaw'));

    let openclawPath = options.openclawPath || null;

    if (!openclawPath) {
      // 先自动检测
      const s1 = ora('正在自动检测 OpenClaw...').start();
      const detected = await detectOpenClaw();
      s1.stop();

      if (detected) {
        // 自动找到，确认或让用户覆盖
        const { useDetected } = await inquirer.prompt([{
          type: 'confirm',
          name: 'useDetected',
          message: `检测到 OpenClaw（${detected}），是否使用此实例？`,
          default: true,
        }]);
        if (useDetected) {
          openclawPath = detected;
        }
      }

      if (!openclawPath) {
        // 没检测到，或用户选择不使用，手动输入
        const { manualPath } = await inquirer.prompt([{
          type: 'input',
          name: 'manualPath',
          message: '请输入 OpenClaw 安装路径（如 /root/.openclaw 或 /opt/my-openclaw）：',
          validate: v => (v.trim().length > 0) || '路径不能为空',
        }]);
        openclawPath = manualPath.trim();
      }
    }

    // 验证路径有效性
    const { existsSync } = await import('fs');
    if (!existsSync(openclawPath)) {
      console.error(chalk.red(`\n❌ 路径不存在：${openclawPath}\n请先安装 OpenClaw：https://openclaw.ai\n`));
      process.exit(1);
    }
    console.log(chalk.green(`✔ 使用 OpenClaw（${openclawPath}）`));
    process.env.OPENCLAW_HOME = openclawPath;

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
        default: config.email?.smtpHost || 'smtp.qq.com',
        message: 'SMTP 服务器（如 smtp.qq.com / smtp.gmail.com / smtp.126.com）：',
      },
      {
        type: 'number',
        name: 'smtpPort',
        message: 'SMTP 端口（465=SSL / 587=TLS）：',
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
        const transporter = nodemailer.createTransport({
          host: smtpHost,
          port: smtpPort,
          secure: smtpPort === 465,
          auth: { user: emailAddress, pass: smtpToken },
        });
        await transporter.sendMail({
          from: emailAddress,
          to: emailAddress,
          subject: '牛马 niuma-server 邮件配置验证',
          text: '如果你收到这封邮件，说明 SMTP 配置正确 ✅',
        });
        testSpinner.succeed(chalk.green(`测试邮件已发送至 ${emailAddress}，请查收`));
      } catch (err) {
        testSpinner.fail(`发送失败：${err.message}`);
      }
    }
    console.log();

    // ─────────────────────────────────────────────
    // Step 3: 在 OpenClaw 上创建 Agent 套件
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 3/5  创建 Agent 套件'));

    // 获取已有 agents
    let existingAgentIds = new Set();
    try {
      const listOut = execSync('openclaw agents list --json', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
      const listData = JSON.parse(listOut);
      const agents = Array.isArray(listData) ? listData : (listData.agents || []);
      existingAgentIds = new Set(agents.map(a => a.id || a.name));
    } catch (e) {
      console.log(chalk.yellow('  ⚠ 无法获取已有 Agent 列表，将尝试创建所有 Agent'));
    }

    for (const agent of AGENTS) {
      if (existingAgentIds.has(agent.id)) {
        console.log(chalk.gray(`  ⏭  ${agent.name}（${agent.id}）已存在，跳过`));
        continue;
      }
      const as = ora(`  创建 Agent: ${agent.name}（${agent.id}）`).start();
      try {
        // 创建 agent workspace 目录并写入 SOUL.md / IDENTITY.md
        const agentWorkspace = `${homedir()}/.openclaw/workspaces/${agent.id}`;
        execSync(`mkdir -p "${agentWorkspace}"`, { stdio: 'pipe' });
        writeFileSync(`${agentWorkspace}/SOUL.md`, agent.systemPrompt, 'utf8');
        writeFileSync(`${agentWorkspace}/IDENTITY.md`, `# IDENTITY.md\n- **Name:** ${agent.name}\n- **Role:** ${agent.description}\n`, 'utf8');
        // 用 openclaw agents add 创建
        execSync(
          `openclaw agents add "${agent.id}" --workspace "${agentWorkspace}" --non-interactive`,
          { stdio: ['pipe', 'pipe', 'pipe'] }
        );
        // 设置名称和 emoji
        execSync(
          `openclaw agents set-identity --agent "${agent.id}" --name "${agent.name}" --emoji "${agent.emoji || '🤖'}"`,
          { stdio: ['pipe', 'pipe', 'pipe'] }
        );
        as.succeed(chalk.green(`  ✓ ${agent.name}（${agent.id}）`));
      } catch (err) {
        as.fail(chalk.red(`  ✗ ${agent.name} 创建失败：${err.message}`));
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
    // Step 4.5: HTTPS 配置（可选）
    // ─────────────────────────────────────────────
    const localIP = getLocalIP();
    let serverUrl = `http://${localIP}:${serverPort}`;

    console.log(chalk.bold('Step 4.5/5  HTTPS 配置（可选）'));
    console.log(chalk.gray('  前提：域名已解析到此服务器，防火墙已开放 80/443 端口'));

    const { setupHttps } = await inquirer.prompt([{
      type: 'confirm',
      name: 'setupHttps',
      message: '是否配置 HTTPS？（推荐，保障数据安全）',
      default: false,
    }]);

    if (setupHttps) {
      const { domain } = await inquirer.prompt([{
        type: 'input',
        name: 'domain',
        message: '请输入绑定的域名（如 api.yourdomain.com）：',
        validate: v => (v.includes('.') && !v.includes(' ')) || '请输入有效域名',
      }]);

      // 检测 DNS 是否指向本机
      const dnsSpinner = ora(`检测 DNS 解析（${domain}）...`).start();
      let dnsOk = false;
      try {
        const dnsOut = execSync(`dig +short ${domain} 2>/dev/null || nslookup ${domain} 2>/dev/null | grep Address | tail -1`, { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
        dnsOk = dnsOut.includes(localIP);
        if (dnsOk) {
          dnsSpinner.succeed(chalk.green(`DNS 已指向本机（${localIP}）`));
        } else {
          dnsSpinner.warn(chalk.yellow(`DNS 解析结果（${dnsOut || '未解析'}）与本机 IP（${localIP}）不符，HTTPS 证书申请可能失败`));
        }
      } catch {
        dnsSpinner.warn('无法检测 DNS，请手动确认域名已解析到本机');
      }

      // 检测 Caddy
      let caddyBin = null;
      try {
        caddyBin = execSync('which caddy', { stdio: ['pipe', 'pipe', 'pipe'] }).toString().trim();
      } catch {}

      if (!caddyBin) {
        console.log(chalk.yellow('\n  ⚠ 未检测到 Caddy，请先安装：'));
        console.log(chalk.gray('    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg'));
        console.log(chalk.gray('    # 或参考：https://caddyserver.com/docs/install\n'));
        const { skipCaddy } = await inquirer.prompt([{
          type: 'confirm',
          name: 'skipCaddy',
          message: '跳过 HTTPS 配置，稍后手动安装 Caddy？',
          default: true,
        }]);
        if (skipCaddy) {
          console.log(chalk.yellow('  已跳过 HTTPS，后续可运行 niuma install --https 单独配置'));
        }
      } else {
        // 写入 Caddy 配置片段
        const caddyConfig = `\n# niuma-server\n${domain} {\n  reverse_proxy localhost:${serverPort}\n}\n`;
        const caddyfilePath = '/etc/caddy/Caddyfile';
        let caddySpinner = ora('写入 Caddy 反代配置...').start();
        try {
          const existing = existsSync(caddyfilePath) ? readFileSync(caddyfilePath, 'utf8') : '';
          if (!existing.includes(domain)) {
            writeFileSync(caddyfilePath, existing + caddyConfig);
          }
          execSync('systemctl reload caddy || caddy reload --config /etc/caddy/Caddyfile', { stdio: 'pipe' });
          caddySpinner.succeed('Caddy 配置已更新');

          // 健康检查 HTTPS
          await new Promise(r => setTimeout(r, 3000));
          const httpsSpinner = ora(`验证 https://${domain}/health ...`).start();
          try {
            execSync(`curl -sf https://${domain}/health`, { stdio: 'pipe' });
            httpsSpinner.succeed(chalk.green(`HTTPS 验证通过`));
            serverUrl = `https://${domain}`;
          } catch {
            httpsSpinner.warn('HTTPS 验证未通过，证书可能还在申请中（通常需要 1-2 分钟），稍后可手动验证');
            serverUrl = `https://${domain}`;
          }
        } catch (err) {
          caddySpinner.fail(`Caddy 配置失败：${err.message}`);
          console.log(chalk.yellow('  已跳过 HTTPS，服务仍通过 HTTP 访问'));
        }
      }
    }
    console.log();

    // ─────────────────────────────────────────────
    // Step 5: 完成
    // ─────────────────────────────────────────────
    console.log(chalk.bold('Step 5/5  完成'));

    // 保存配置
    saveConfig({
      ...config,
      openclawPath,
      email: {
        address: emailAnswers.email,
        smtpHost: emailAnswers.smtpHost,
        smtpPort: emailAnswers.smtpPort,
      },
      server: {
        port: serverPort,
        path: serverPath,
        url: serverUrl,
      },
    });

    // 读取 .env 中的 JWT_SECRET 用于展示
    let jwtSecret = '（见 ' + serverPath + '/.env）';
    try {
      const envContent = readFileSync(join(serverPath, '.env'), 'utf8');
      const m = envContent.match(/JWT_SECRET=(.+)/);
      if (m) jwtSecret = m[1].trim();
    } catch {}

    console.log(chalk.bold.green('\n✅ 安装完成！\n'));
    console.log(chalk.bold('─────────────────────────────────────'));
    console.log(chalk.bold('  牛马 (niuma) 服务器配置信息'));
    console.log(chalk.bold('─────────────────────────────────────'));
    console.log(`  ${chalk.gray('服务地址：')} ${chalk.cyan.bold(serverUrl)}`);
    console.log(`  ${chalk.gray('安装路径：')} ${serverPath}`);
    console.log(`  ${chalk.gray('服务端口：')} ${serverPort}`);
    console.log(`  ${chalk.gray('JWT 密钥：')} ${chalk.yellow(jwtSecret)}`);
    console.log(`  ${chalk.gray('SMTP 邮箱：')} ${emailAnswers.email}`);
    console.log(`  ${chalk.gray('OpenClaw：')} ${openclawPath}`);
    console.log(chalk.bold('─────────────────────────────────────'));
    console.log(chalk.bold('\n  已创建的 Agent 套件：'));
    for (const agent of AGENTS) {
      console.log(`  ${agent.emoji}  ${chalk.bold(agent.name)} (${chalk.gray(agent.id)})  —  ${agent.description}`);
    }
    console.log(chalk.bold('─────────────────────────────────────'));
    console.log(chalk.cyan(`\n📱 在 App 中填入服务地址：${chalk.bold(serverUrl)}\n`));
    if (!setupHttps && isPrivateIP(localIP)) {
      console.log(chalk.yellow('  ⚠  检测到内网地址，请确认手机和此电脑连接的是同一个 Wi-Fi / 局域网'));
      console.log(chalk.yellow('     如需从外网访问，请配置端口映射或启用 HTTPS + 公网域名\n'));
    }
    console.log(chalk.gray('  管理命令：niuma server status / start / stop / logs\n'));
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
