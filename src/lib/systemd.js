import { execSync, spawn } from 'child_process';

/**
 * 检测当前环境是否支持 systemd
 */
function hasSystemd() {
  try {
    execSync('systemctl --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

const SERVICE_NAME = 'niuma-server';

// ---- systemd 实现 ----

function systemdStart() {
  execSync(`systemctl start ${SERVICE_NAME}`, { stdio: 'inherit' });
}

function systemdStop() {
  execSync(`systemctl stop ${SERVICE_NAME}`, { stdio: 'inherit' });
}

function systemdRestart() {
  execSync(`systemctl restart ${SERVICE_NAME}`, { stdio: 'inherit' });
}

function systemdStatus() {
  try {
    const out = execSync(`systemctl is-active ${SERVICE_NAME}`, { stdio: 'pipe' }).toString().trim();
    const active = out === 'active';
    let pid, uptime;
    if (active) {
      try {
        pid = execSync(`systemctl show -p MainPID --value ${SERVICE_NAME}`, { stdio: 'pipe' }).toString().trim();
        uptime = execSync(`systemctl show -p ActiveEnterTimestamp --value ${SERVICE_NAME}`, { stdio: 'pipe' }).toString().trim();
      } catch { /* ignore */ }
    }
    return { running: active, pid, uptime };
  } catch {
    return { running: false };
  }
}

function systemdLogs({ lines, follow }) {
  const args = ['-u', SERVICE_NAME, '-n', String(lines)];
  if (follow) args.push('-f');
  const proc = spawn('journalctl', args, { stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`journalctl 退出码 ${code}`)));
  });
}

// ---- 直接 node 进程实现（非 systemd 环境）----
// 使用 ~/.niuma/server.pid 记录 PID

import { readFileSync, writeFileSync, unlinkSync, existsSync, openSync, mkdirSync } from 'fs';
import { join } from 'path';
import os from 'os';

const PID_FILE = join(os.homedir(), '.niuma', 'server.pid');
const LOG_FILE = join(os.homedir(), '.niuma', 'server.log');

function resolveServerPath(config) {
  let raw = config.server?.path || '';

  // 过滤掉已知的旧版错误路径，回退到正确默认值
  const isStale = !raw
    || raw.startsWith('/opt/')
    || raw.startsWith('/root/')
    || raw.includes('/~/');  // 处理 /Users/xxx/~/niuma-server 这种双重错误

  if (isStale) {
    raw = join(os.homedir(), 'niuma-server');
  }

  // 展开 ~ 前缀
  if (raw.startsWith('~/') || raw === '~') {
    return raw.replace(/^~/, os.homedir());
  }

  return raw;
}

function nodeStart(config) {
  const port = config.server?.port || 3002;
  const binDir = join(os.homedir(), '.niuma', 'bin');
  const serverBin = join(binDir, 'niuma-server');
  const niumaHome = join(os.homedir(), '.niuma');
  const configFile = join(niumaHome, 'config.json');

  // 读取 config.json 注入环境变量
  let envVars = {};
  if (existsSync(configFile)) {
    try {
      const cfg = JSON.parse(readFileSync(configFile, 'utf8'));
      if (cfg.OPENCLAW_GATEWAY_URL) envVars.OPENCLAW_GATEWAY_URL = cfg.OPENCLAW_GATEWAY_URL;
      if (cfg.OPENCLAW_GATEWAY_TOKEN) envVars.OPENCLAW_GATEWAY_TOKEN = cfg.OPENCLAW_GATEWAY_TOKEN;
      if (cfg.PORT) envVars.PORT = String(cfg.PORT);
    } catch {}
  }

  // 确保日志目录存在
  if (!existsSync(niumaHome)) mkdirSync(niumaHome, { recursive: true });

  const out = openSync(LOG_FILE, 'a');
  const proc = spawn(serverBin, [], {
    detached: true,
    stdio: ['ignore', out, out],
    env: { ...process.env, ...envVars, PORT: String(port) },
    cwd: niumaHome,
  });
  proc.unref();
  writeFileSync(PID_FILE, String(proc.pid), 'utf8');
}

function nodeStop() {
  if (!existsSync(PID_FILE)) throw new Error('未找到 PID 文件，niuma-server 可能未在运行');
  const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 'SIGTERM');
  } catch (e) {
    if (e.code !== 'ESRCH') throw e;
  }
  unlinkSync(PID_FILE);
}

function nodeStatus() {
  if (!existsSync(PID_FILE)) return { running: false };
  const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
  try {
    process.kill(pid, 0); // 探测进程是否存在
    return { running: true, pid };
  } catch {
    return { running: false };
  }
}

function nodeLogs({ lines, follow }) {
  if (!existsSync(LOG_FILE)) {
    console.log('（暂无日志）');
    return Promise.resolve();
  }
  const args = follow ? ['-f', '-n', String(lines), LOG_FILE] : ['-n', String(lines), LOG_FILE];
  const proc = spawn('tail', args, { stdio: 'inherit' });
  return new Promise((resolve, reject) => {
    proc.on('close', code => code === 0 ? resolve() : reject(new Error(`tail 退出码 ${code}`)));
  });
}

// ---- 公开 API（自动选择实现）----

export async function startServer(config) {
  if (hasSystemd()) {
    systemdStart();
  } else {
    nodeStart(config);
  }
}

export async function stopServer() {
  if (hasSystemd()) {
    systemdStop();
  } else {
    nodeStop();
  }
}

export async function restartServer(config) {
  if (hasSystemd()) {
    systemdRestart();
  } else {
    nodeStop();
    nodeStart(config);
  }
}

export async function statusServer() {
  if (hasSystemd()) {
    return systemdStatus();
  } else {
    return nodeStatus();
  }
}

export async function logsServer(options) {
  if (hasSystemd()) {
    return systemdLogs(options);
  } else {
    return nodeLogs(options);
  }
}
