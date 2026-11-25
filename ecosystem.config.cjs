module.exports = {
  apps: [
    {
      name: 'job-bot-worker',
      cwd: './apps/worker',
      script: 'dist/index.js',
      env_file: '../../.env',
      max_memory_restart: '450M',
      restart_delay: 5000,
    },
    {
      name: 'job-bot-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env_file: '../../.env',
      max_memory_restart: '450M',
    },
  ],
};
