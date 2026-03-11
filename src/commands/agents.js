import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { execSync } from 'child_process';
import { homedir } from 'os';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig, saveConfig } from '../lib/config.js';
import { detectAgentApi, listAgents } from '../lib/openclaw.js';

const WORK_RULES = `## 工作规范
1. 接单即响应：分配到的任务在下次扫描时必须立即开始，不拖延。
2. 先读文档：执行任务前必须先查看项目知识库，基于最新文档开展工作。
3. 产出即文档：完成阶段性工作后，主动在知识库中创建或更新对应文档。
4. 协作优先：工作中发现阻塞，立即在任务状态中标注 blocked 并说明原因。
5. 自驱自结：不等用户催促，主动扫描待办任务、主动执行、主动更新状态、主动汇报结果。
6. 简洁汇报：向用户汇报时，结论先行，控制在 200 字以内，详细内容写进知识库文档。`;

const ALL_AGENTS = [
  {
    id: 'niuma-planner',
    name: '规划师',
    emoji: '📋',
    roleType: 'planner',
    description: '统筹规划，任务拆解，协调团队',
    duties: '接到需求后，先创建产品文档（PRD）写入项目知识库，将需求拆解为具体可执行的任务，分配给对应角色的 Agent，跟踪任务进度，协调各 Agent 的协作。',
  },
  {
    id: 'niuma-coder',
    name: '工程师',
    emoji: '💻',
    roleType: 'coder',
    description: '全栈开发，代码实现，技术方案',
    duties: '接到开发任务后，先阅读知识库中的 PRD 和技术文档，必要时先在知识库创建技术架构文档，再开始编码，完成开发后更新技术文档，标注实现细节和注意事项。',
  },
  {
    id: 'niuma-designer',
    name: '设计师',
    emoji: '🎨',
    roleType: 'designer',
    description: 'UI/UX 设计，视觉规范，用户体验',
    duties: '基于 PRD 设计界面原型和交互方案，在知识库维护设计规范文档（色彩、字体、组件规范），产出设计稿说明文档，供工程师参考实现。',
  },
  {
    id: 'niuma-analyst',
    name: '分析师',
    emoji: '📊',
    roleType: 'analyst',
    description: '数据分析，市场研究，决策支持',
    duties: '分析用户需求的市场背景和数据支撑，在知识库维护分析报告和决策参考文档，为产品方向提供数据驱动的建议。',
  },
  {
    id: 'niuma-writer',
    name: '文案',
    emoji: '✍️',
    roleType: 'writer',
    description: '内容创作，文案撰写，品牌传播',
    duties: '根据产品需求撰写用户可见的文案内容，在知识库维护文案规范和品牌语调指南，确保所有文案与产品定位和用户群体一致。',
  },
];

function createOpenClawAgent({ agentId, name, systemPrompt, openclawHome }) {
  const wsDir = join(openclawHome, 'workspaces', agentId);
  mkdirSync(wsDir, { recursive: true });
  writeFileSync(join(wsDir, 'SOUL.md'), systemPrompt, 'utf8');
  writeFileSync(join(wsDir, 'IDENTITY.md'), `# IDENTITY.md\n- **Name:** ${name}\n`, 'utf8');
  try {
    execSync(`openclaw agents add "${agentId}" --workspace "${wsDir}" --non-interactive`, { stdio: 'pipe', timeout: 15000 });
    return { existed: false };
  } catch (err) {
    const msg = err.message + (err.stderr?.toString() || '');
    if (msg.includes('already exists') || msg.includes('already')) return { existed: true };
    throw err;
  }
}

export const agentsCommand = new Command('agents')
  .description('管理已安装的 Agent');

agentsCommand
  .command('list')
  .description('查看 OpenClaw 上的 niuma-* Agent')
  .action(async () => {
    const spinner = ora('正在从 OpenClaw 获取 Agent 列表...').start();
    const apiPaths = await detectAgentApi();
    if (!apiPaths) {
      spinner.fail('无法连接 OpenClaw Gateway，回退到本地配置');
      const config = loadConfig();
      const installed = config.agents || [];
      if (installed.length === 0) {
        console.log(chalk.yellow('\n尚未安装任何 Agent，请运行 niuma install\n'));
        return;
      }
      console.log(chalk.bold('\n已安装的 Agent（本地记录）：\n'));
      for (const agentId of installed) {
        const meta = ALL_AGENTS.find(a => a.id === agentId);
        console.log(chalk.green('  ✓ ') + (meta ? `${meta.emoji} ${meta.name} (${agentId})` : agentId));
      }
      console.log();
      return;
    }

    const agents = await listAgents(apiPaths.listPath);
    spinner.stop();

    const niumaAgents = agents.filter(a => (a.id || a.name || '').startsWith('niuma-'));

    if (niumaAgents.length === 0) {
      console.log(chalk.yellow('\n未找到 niuma-* Agent，请运行 niuma install 创建\n'));
      return;
    }

    console.log(chalk.bold(`\n找到 ${niumaAgents.length} 个 niuma-* Agent：\n`));
    for (const agent of niumaAgents) {
      const id = agent.id || agent.name || '?';
      const meta = ALL_AGENTS.find(a => a.id === id);
      const displayName = meta ? `${meta.emoji} ${meta.name}` : (agent.name || id);
      const desc = meta?.description || agent.description || '';
      console.log(chalk.green('  ✓ ') + chalk.bold(displayName) + chalk.gray(` (${id})`) + (desc ? `  —  ${desc}` : ''));
    }
    console.log();
  });

agentsCommand
  .command('install')
  .description('安装/更新 Agent 套餐')
  .action(async () => {
    const config = loadConfig();
    const openclawHome = config.openclawPath || process.env.OPENCLAW_HOME || `${homedir()}/.openclaw`;

    console.log(chalk.bold.cyan('\n选择要安装的 Agent 套餐\n'));

    const { packageChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'packageChoice',
      message: '选择套餐：',
      choices: [
        '基础套餐（规划师 + 工程师 + 分析师）',
        '全套团队（全部 5 个角色）',
        '自定义',
      ],
    }]);

    let selectedIds;
    if (packageChoice === '基础套餐（规划师 + 工程师 + 分析师）') {
      selectedIds = ['niuma-planner', 'niuma-coder', 'niuma-analyst'];
    } else if (packageChoice === '全套团队（全部 5 个角色）') {
      selectedIds = ALL_AGENTS.map(a => a.id);
    } else {
      const { chosen } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'chosen',
        message: '选择要安装的 Agent：',
        choices: ALL_AGENTS.map(a => ({ name: `${a.emoji} ${a.name} — ${a.description}`, value: a.id })),
      }]);
      selectedIds = chosen;
    }

    for (const agentId of selectedIds) {
      const meta = ALL_AGENTS.find(a => a.id === agentId);
      const spinner = ora(`安装 ${meta.emoji} ${meta.name}...`).start();
      const systemPrompt = `你是 ${meta.emoji} ${meta.name}，${meta.description}。\n\n## 核心职责\n${meta.duties}\n\n${WORK_RULES}`;
      try {
        const result = createOpenClawAgent({ agentId, name: meta.name, systemPrompt, openclawHome });
        spinner.succeed(result.existed
          ? chalk.yellow(`${meta.emoji} ${meta.name} 已存在，已更新 SOUL.md`)
          : chalk.green(`${meta.emoji} ${meta.name} 安装完成`));
      } catch (err) {
        spinner.fail(chalk.red(`${meta.emoji} ${meta.name} 安装失败：${err.message}`));
      }
    }

    saveConfig({ ...config, agents: selectedIds });
    console.log(chalk.bold.green('\n✅ Agent 套餐安装完成\n'));
  });

