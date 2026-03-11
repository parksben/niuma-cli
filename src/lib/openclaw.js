import { execSync } from 'child_process';
import { existsSync } from 'fs';

function getGatewayUrl() {
  if (process.env.OPENCLAW_GATEWAY) return process.env.OPENCLAW_GATEWAY;
  try {
    const out = execSync('openclaw gateway status 2>&1', { stdio: ['pipe', 'pipe', 'pipe'] }).toString();
    const m = out.match(/port=(\d+)/);
    if (m) return `http://127.0.0.1:${m[1]}`;
  } catch {}
  return 'http://127.0.0.1:18789';
}

const GATEWAY_URL = getGatewayUrl();

/**
 * 检测服务器上是否已有 OpenClaw 安装
 * @returns {string|null} 安装路径，未找到则返回 null
 */
export async function detectOpenClaw() {
  // 常见安装路径
  const candidates = [
    process.env.OPENCLAW_HOME,
    `${process.env.HOME}/.openclaw`,
    '/root/.openclaw',
    '/opt/openclaw',
    '/usr/local/openclaw',
  ].filter(Boolean);

  for (const p of candidates) {
    if (existsSync(p)) {
      return p;
    }
  }

  // 尝试通过 which 找到 openclaw binary
  try {
    const binPath = execSync('which openclaw', { stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
    if (binPath) return binPath.replace('/bin/openclaw', '');
  } catch {
    // not found
  }

  return null;
}

/**
 * 验证 OpenClaw Gateway 是否在运行
 * @returns {Promise<boolean>}
 */
export async function checkGateway() {
  try {
    const res = await fetch(`${GATEWAY_URL}/status`, { signal: AbortSignal.timeout(5000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

/**
 * 探测并返回可用的 persona/agent 列表 API 路径
 * @returns {Promise<{listPath: string, createPath: string}|null>}
 */
export async function detectAgentApi() {
  const candidates = [
    { listPath: '/api/v1/personas', createPath: '/api/v1/personas' },
    { listPath: '/api/agents', createPath: '/api/agents' },
    { listPath: '/api/v1/agents', createPath: '/api/v1/agents' },
  ];
  for (const c of candidates) {
    try {
      const res = await fetch(`${GATEWAY_URL}${c.listPath}`, { signal: AbortSignal.timeout(5000) });
      if (res.status < 500) return c;
    } catch {
      // continue
    }
  }
  return null;
}

/**
 * 获取已有 agent/persona 列表
 * @param {string} listPath
 * @returns {Promise<Array>}
 */
export async function listAgents(listPath) {
  const res = await fetch(`${GATEWAY_URL}${listPath}`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) return [];
  const data = await res.json();
  // 兼容不同格式: array / { data: [] } / { personas: [] } / { agents: [] }
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.personas)) return data.personas;
  if (Array.isArray(data.agents)) return data.agents;
  return [];
}

/**
 * 创建 agent/persona
 * @param {string} createPath
 * @param {object} agent
 * @returns {Promise<boolean>}
 */
export async function createAgent(createPath, agent) {
  const body = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    systemPrompt: agent.systemPrompt,
    system_prompt: agent.systemPrompt, // 兼容两种字段名
  };
  const res = await fetch(`${GATEWAY_URL}${createPath}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  return res.ok || res.status === 201;
}

/**
 * 安装 OpenClaw 到指定路径（占位）
 * @param {string} installPath 安装目标路径
 */
export async function installOpenClaw(installPath) {
  console.log(`  [占位] 将安装 OpenClaw 到: ${installPath}`);
  await new Promise(r => setTimeout(r, 500));
}

export { GATEWAY_URL };
