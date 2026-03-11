import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { loadConfig, saveConfig } from '../lib/config.js';

const ALL_AGENTS = [
  { name: 'planning',  label: 'Planning Agent（规划师）' },
  { name: 'coder',     label: 'Coder Agent（工程师）' },
  { name: 'writer',    label: 'Writer Agent（写作助手）' },
  { name: 'analyst',   label: 'Analyst Agent（分析师）' },
  { name: 'designer',  label: 'Designer Agent（设计师）' },
  { name: 'devops',    label: 'DevOps Agent（运维工程师）' },
  { name: 'qa',        label: 'QA Agent（测试工程师）' },
  { name: 'sales',     label: 'Sales Agent（销售助手）' },
  { name: 'support',   label: 'Support Agent（客服助手）' },
];

export const agentsCommand = new Command('agents')
  .description('管理已安装的 Agent');

agentsCommand
  .command('list')
  .description('查看已安装的 Agent')
  .action(() => {
    const config = loadConfig();
    const installed = config.agents || [];
    if (installed.length === 0) {
      console.log(chalk.yellow('尚未安装任何 Agent，请运行 niuma agents install'));
      return;
    }
    console.log(chalk.bold('\n已安装的 Agent：\n'));
    for (const agentName of installed) {
      const meta = ALL_AGENTS.find(a => a.name === agentName);
      console.log(chalk.green('  ✓ ') + (meta ? meta.label : agentName));
    }
    console.log();
  });

agentsCommand
  .command('install')
  .description('安装/更新 Agent 套餐')
  .action(async () => {
    const config = loadConfig();
    const installed = config.agents || [];

    console.log(chalk.bold.cyan('\n选择要安装的 Agent 套餐\n'));

    const { packageChoice } = await inquirer.prompt([{
      type: 'list',
      name: 'packageChoice',
      message: '选择套餐：',
      choices: [
        '基础套餐（Planning + Coder + Writer + Analyst）',
        '研发团队（基础 + Designer + DevOps + QA）',
        '全家桶（所有角色）',
        '自定义',
      ],
    }]);

    let selectedAgents;
    const PACKAGES = {
      '基础套餐（Planning + Coder + Writer + Analyst）': ['planning', 'coder', 'writer', 'analyst'],
      '研发团队（基础 + Designer + DevOps + QA）': ['planning', 'coder', 'writer', 'analyst', 'designer', 'devops', 'qa'],
      '全家桶（所有角色）': ALL_AGENTS.map(a => a.name),
    };

    if (packageChoice === '自定义') {
      const { agents } = await inquirer.prompt([{
        type: 'checkbox',
        name: 'agents',
        message: '选择要安装的 Agent：',
        choices: ALL_AGENTS.map(a => ({
          name: a.label,
          value: a.name,
          checked: installed.includes(a.name),
        })),
      }]);
      selectedAgents = agents;
    } else {
      selectedAgents = PACKAGES[packageChoice];
    }

    const spinner = ora('正在安装 Agent...').start();
    // TODO: 调用 niuma-server API 写入 agent 数据
    // await initAgents(config.server?.port || 3002, selectedAgents);
    await new Promise(r => setTimeout(r, 600)); // 占位延时
    spinner.succeed(`已安装 ${selectedAgents.length} 个 Agent`);

    saveConfig({ ...config, agents: selectedAgents });
    console.log(chalk.green('\n✓ Agent 套餐安装完成\n'));
  });
