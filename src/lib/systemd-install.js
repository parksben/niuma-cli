import { writeFileSync } from 'fs';
import { join } from 'path';

const SERVICE_PATH = '/etc/systemd/system/niuma-server.service';

/**
 * 写入 systemd service 文件
 * @param {{ serverPath: string, serverPort: number }} options
 */
export function writeSystemdService({ serverPath, serverPort }) {
  const nodebin = process.execPath;
  const entry = join(serverPath, 'server.js');

  const content = `[Unit]
Description=niuma-server
After=network.target

[Service]
Type=simple
WorkingDirectory=${serverPath}
ExecStart=${nodebin} ${entry}
Restart=on-failure
RestartSec=5
Environment=PORT=${serverPort}
EnvironmentFile=${serverPath}/.env

[Install]
WantedBy=multi-user.target
`;
  writeFileSync(SERVICE_PATH, content, 'utf8');
}
