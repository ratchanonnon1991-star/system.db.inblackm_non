module.exports = {
  apps: [
    {
      name: "gamedb",
      script: "node_modules/next/dist/bin/next",
      args: "start --port 4183",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
