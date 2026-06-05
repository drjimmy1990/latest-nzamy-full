module.exports = {
  apps: [
    {
      // ─── App Identity ─────────────────────────────────
      name: 'nzamy',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/www/wwwroot/nzamy',

      // ─── Process Mode ─────────────────────────────────
      // 'fork' for single instance, 'cluster' for multi-core
      instances: 1,
      exec_mode: 'fork',

      // ─── Environment ─────────────────────────────────
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // ─── Restart Policy ───────────────────────────────
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',

      // ─── Logs ─────────────────────────────────────────
      error_file: '/www/wwwroot/nzamy/logs/error.log',
      out_file: '/www/wwwroot/nzamy/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // ─── Watch (disabled in production) ───────────────
      watch: false,
      ignore_watch: ['node_modules', '.next', 'logs', '.git'],

      // ─── Graceful Shutdown ────────────────────────────
      kill_timeout: 5000,
      listen_timeout: 10000,
      shutdown_with_message: true,
    },
  ],
};
