// PM2 конфигурация для WhatsApp Bot
// Использование: pm2 start ecosystem.config.cjs

module.exports = {
  apps: [{
    name: 'whatsappbot',
    script: './server.js',
    cwd: '/var/www/u2817882/data/www/bot.capitalmars.com',
    
    // Режим работы
    instances: 1,
    exec_mode: 'fork',
    
    // Переменные окружения
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // Автоперезапуск
    watch: false,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Логи
    error_file: '/var/www/u2817882/data/www/bot.capitalmars.com/logs/pm2-error.log',
    out_file: '/var/www/u2817882/data/www/bot.capitalmars.com/logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Ресурсы
    max_memory_restart: '500M',
    
    // Время выполнения
    kill_timeout: 5000,
    listen_timeout: 3000,
    
    // Интерпретатор
    interpreter: 'node',
    interpreter_args: '--experimental-modules'
  }]
};

