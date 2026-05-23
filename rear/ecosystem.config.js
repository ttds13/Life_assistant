module.exports = {
  apps: [
    {
      name: 'life-assistant-rear',
      script: 'src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: 3000,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      merge_logs: true,
      max_restarts: 10,
      restart_delay: 3000,
    },
  ],
}