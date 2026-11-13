module.exports = {
  apps: [
    {
      // ─── App Identity ─────────────────────────────────
      name: 'nzamy',
      script: 'node_modules/.bin/next',
      args: 'start -p 3055',
      cwd: '/www/wwwroot/nzamy/latest-nzamy-full',

      // ─── Process Mode ─────────────────────────────────
      // 'fork' for single instance, 'cluster' for multi-core
      instances: 1,
      exec_mode: 'fork',

      // ─── Environment ─────────────────────────────────
      env: {
        NODE_ENV: 'production',
        PORT: 3055,
      },

      // ─── Restart Policy ───────────────────────────────
      max_memory_restart: '512M',
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',

      // ─── Logs ─────────────────────────────────────────
      error_file: '/www/wwwroot/nzamy/latest-nzamy-full/logs/error.log',
      out_file: '/www/wwwroot/nzamy/latest-nzamy-full/logs/out.log',
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
    {
      // ─── Legal GraphRAG Auto-Sync Watchdog Daemon ─────
      name: 'nzamy-graph-watchdog',
      script: 'scripts/graph-watchdog.mjs',
      args: '--watch --interval-sec=30',
      node_args: '--import tsx',
      cwd: '/www/wwwroot/nzamy/latest-nzamy-full',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
      },
      // Holds the law index + per-article reference records for one pass (no article
      // texts since 2026-11-14); 400M leaves room above the ~90 MB tsx/supabase-js base.
      max_memory_restart: '400M',
      exp_backoff_restart_delay: 500,
      max_restarts: 15,
      min_uptime: '10s',
      error_file: '/www/wwwroot/nzamy/latest-nzamy-full/logs/graph-watchdog-error.log',
      out_file: '/www/wwwroot/nzamy/latest-nzamy-full/logs/graph-watchdog-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      watch: false,
      kill_timeout: 10000,
    },
  ],
};
