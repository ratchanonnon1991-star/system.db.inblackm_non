// pm2 starts each app with the Node that runs the deploy (the one nvm picked),
// not the Node its daemon happens to run on; deploy-server.sh restarts an app
// started on another Node (scripts/pm2-stale-node.cjs). Every app is "fork":
// in cluster mode pm2 forks its own daemon's Node and ignores `interpreter`.
module.exports = {
  apps: [
    {
      name: "usdcodashop-sync-worker",
      script: "scripts/usdcodashop-sync-worker.mjs",
      cwd: __dirname,
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      stop_exit_codes: [0],
      restart_delay: 5000,
      kill_timeout: 25000,
      max_memory_restart: "256M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "itune-sheet-sync-worker",
      script: "scripts/itune-sheet-sync-worker.mjs",
      cwd: __dirname,
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      stop_exit_codes: [0],
      restart_delay: 5000,
      kill_timeout: 25000,
      max_memory_restart: "256M",
      env: { NODE_ENV: "production" },
    },
    {
      name: "system.db.inblackm",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 5589",
      cwd: __dirname,
      interpreter: process.execPath,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
