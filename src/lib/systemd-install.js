import { writeFileSync } from 'fs';
import { join } from 'path';
import os from 'os';

const SERVICE_PATH = '/etc/systemd/system/niuma-server.service';

/**
 * 写入 systemd service 文件
 * @param {{ serverPort: number }} options
 */
export function writeSystemdService({ serverPort }) {
  const binDir = join(os.homedir(), '.niuma', 'bin');
  const serverBin = join(binDir, 'niuma-server');
  const niumaHome = join(os.homedir(), '.niuma');
  const configFile = join(niumaHome, 'config.json');

  const content = `[Unit]
Description=niuma-server
After=network.target

[Service]
Type=simple
WorkingDirectory=${niumaHome}
ExecStart=${serverBin}
Restart=on-failure
RestartSec=5
Environment=PORT=${serverPort}

[Install]
WantedBy=multi-user.target
`;
  writeFileSync(SERVICE_PATH, content, 'utf8');
}
