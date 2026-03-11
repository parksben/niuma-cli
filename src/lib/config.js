import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import os from 'os';

const CONFIG_DIR = join(os.homedir(), '.niuma');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

/**
 * 读取配置，不存在则返回空对象
 * @returns {object}
 */
export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));
  } catch {
    return {};
  }
}

/**
 * 保存配置到 ~/.niuma/config.json
 * @param {object} config
 */
export function saveConfig(config) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}
