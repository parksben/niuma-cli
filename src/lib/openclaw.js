import { execSync } from 'child_process';
import { existsSync } from 'fs';

/**
 * 检测服务器上是否已有 OpenClaw 安装
 * @returns {string|null} 安装路径，未找到则返回 null
 */
export async function detectOpenClaw() {
  // 常见安装路径
  const candidates = [
    process.env.OPENCLAW_HOME,
    `${process.env.HOME}/.openclaw`,
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
 * 安装 OpenClaw 到指定路径
 * @param {string} installPath 安装目标路径
 */
export async function installOpenClaw(installPath) {
  // TODO: 调用官方安装脚本，支持自定义 --prefix 路径
  // 示例（占位）：
  //   const installScript = 'https://install.openclaw.io/install.sh';
  //   execSync(`curl -fsSL ${installScript} | bash -s -- --prefix ${installPath}`, {
  //     stdio: 'inherit',
  //   });
  //
  // 当前占位实现（不执行真实安装）：
  console.log(`  [占位] 将安装 OpenClaw 到: ${installPath}`);
  await new Promise(r => setTimeout(r, 500));
}
