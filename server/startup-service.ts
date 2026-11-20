import type { StartupStatus } from "../shared/types"

const appPort = process.env.PORT || "3007"
const linuxServiceName = "pinglo.service"

export function getStartupStatus(): StartupStatus {
  const platform = process.platform === "win32" ? "windows" : process.platform === "linux" ? "linux" : "macos"
  const projectDir = process.cwd().replaceAll("\\", "/")

  if (platform === "windows") {
    return {
      enabled: false,
      platform,
      servicePath: projectDir,
      commands: [
        "npm run build",
        "npm install -g pm2",
        `pm2 start "npm -- run start" --name pinglo`,
        "pm2 save",
      ],
      disableCommands: ["pm2 delete pinglo", "pm2 save"],
    }
  }

  const service = [
    "[Unit]", "Description=PingLo", "After=network.target", "",
    "[Service]", "Type=simple", "User=pinglo", `WorkingDirectory=${projectDir}`, "ExecStart=/usr/bin/npm run start",
    "Restart=always", "RestartSec=5", "NoNewPrivileges=true", "PrivateTmp=true", "ProtectSystem=strict",
    `ReadWritePaths=${projectDir}/data`,
    "Environment=NODE_ENV=production", `Environment=PORT=${appPort}`, "",
    "[Install]", "WantedBy=multi-user.target",
  ].join("\n")

  return {
    enabled: false,
    platform,
    servicePath: `/etc/systemd/system/${linuxServiceName}`,
    commands: [
      "npm run build",
      `sudo tee /etc/systemd/system/${linuxServiceName} > /dev/null <<'EOF'\n${service}\nEOF`,
      "sudo systemctl daemon-reload",
      `sudo systemctl enable --now ${linuxServiceName}`,
    ],
    disableCommands: [`sudo systemctl disable --now ${linuxServiceName}`],
  }
}
