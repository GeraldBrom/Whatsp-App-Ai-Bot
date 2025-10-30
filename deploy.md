# 🚀 Инструкция по развертыванию WhatsApp Bot на хостинге

## Параметры развертывания
- **Домен**: capitalwabot.com
- **Путь на сервере**: /www/WhatsAppBot/
- **Порт Node.js**: 3000 (локально)
- **Веб-сервер**: Nginx

---

## 📋 Предварительные требования

1. **Сервер с Ubuntu/Debian** (20.04 LTS или новее)
2. **Root или sudo доступ**
3. **Домен capitalwabot.com** должен указывать на IP сервера (A-запись)

---

## 🔧 Шаг 1: Установка Node.js

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Node.js LTS (v20.x)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Проверка установки
node --version
npm --version
```

---

## 📦 Шаг 2: Подготовка проекта

```bash
# Создание директории
sudo mkdir -p /www/WhatsAppBot
cd /www/WhatsAppBot

# Загрузка проекта (выберите один из вариантов):

# Вариант А: Клонирование из Git (если есть репозиторий)
# sudo git clone https://github.com/yourusername/WhatsAppBot.git .

# Вариант Б: Загрузка через FTP/SCP
# Загрузите все файлы проекта в /www/WhatsAppBot/

# Установка зависимостей
sudo npm install

# Настройка прав доступа
sudo chown -R www-data:www-data /www/WhatsAppBot
sudo chmod -R 755 /www/WhatsAppBot
```

---

## 🔐 Шаг 3: Настройка переменных окружения

```bash
# Создание .env файла
sudo nano /www/WhatsAppBot/.env
```

Добавьте необходимые переменные:
```env
PORT=3000
NODE_ENV=production

# Настройки базы данных
DB_HOST=localhost
DB_USER=your_db_user
DB_PASSWORD=your_db_password
DB_NAME=whatsappbot

# Другие настройки
# Добавьте свои переменные из примера
```

Сохраните (Ctrl+O, Enter, Ctrl+X).

---

## 🔄 Шаг 4: Установка и настройка PM2

```bash
# Установка PM2 глобально
sudo npm install -g pm2

# Запуск приложения через PM2
cd /www/WhatsAppBot
pm2 start server.js --name whatsappbot

# Просмотр статуса
pm2 status

# Просмотр логов
pm2 logs whatsappbot

# Настройка автозапуска при перезагрузке сервера
pm2 startup systemd
pm2 save

# Полезные команды PM2:
# pm2 restart whatsappbot  - перезапуск
# pm2 stop whatsappbot     - остановка
# pm2 delete whatsappbot   - удаление из PM2
```

---

## 🌐 Шаг 5: Установка и настройка Nginx

```bash
# Установка Nginx
sudo apt install -y nginx

# Копирование конфигурации
sudo nano /etc/nginx/sites-available/capitalwabot
```

Вставьте содержимое из файла `nginx.conf` (который создан в проекте).

```bash
# Активация конфигурации
sudo ln -s /etc/nginx/sites-available/capitalwabot /etc/nginx/sites-enabled/

# Удаление дефолтного сайта (опционально)
sudo rm /etc/nginx/sites-enabled/default

# Проверка конфигурации
sudo nginx -t

# Перезагрузка Nginx
sudo systemctl reload nginx

# Включение автозапуска Nginx
sudo systemctl enable nginx
```

---

## 🔒 Шаг 6: Настройка SSL (HTTPS)

```bash
# Установка Certbot
sudo apt install -y certbot python3-certbot-nginx

# Получение SSL сертификата
sudo certbot --nginx -d capitalwabot.com -d www.capitalwabot.com

# Следуйте инструкциям certbot:
# - Введите email для уведомлений
# - Согласитесь с условиями
# - Выберите редирект с HTTP на HTTPS (рекомендуется)

# Автообновление сертификата
sudo certbot renew --dry-run
```

После успешной установки SSL, раскомментируйте HTTPS-блок в `/etc/nginx/sites-available/capitalwabot` и перезагрузите Nginx:

```bash
sudo nano /etc/nginx/sites-available/capitalwabot
# Раскомментируйте строки с SSL и редиректом

sudo nginx -t
sudo systemctl reload nginx
```

---

## 🔥 Шаг 7: Настройка firewall (опционально, но рекомендуется)

```bash
# Установка ufw
sudo apt install -y ufw

# Разрешение SSH (ВАЖНО! Сделайте это первым)
sudo ufw allow ssh
sudo ufw allow 22/tcp

# Разрешение HTTP и HTTPS
sudo ufw allow 'Nginx Full'

# Или отдельно:
# sudo ufw allow 80/tcp
# sudo ufw allow 443/tcp

# Включение firewall
sudo ufw enable

# Проверка статуса
sudo ufw status
```

---

## ✅ Шаг 8: Проверка развертывания

1. **Проверка Node.js процесса:**
```bash
pm2 status
pm2 logs whatsappbot --lines 50
```

2. **Проверка Nginx:**
```bash
sudo systemctl status nginx
sudo nginx -t
```

3. **Проверка портов:**
```bash
sudo netstat -tlnp | grep :80
sudo netstat -tlnp | grep :3000
```

4. **Проверка в браузере:**
   - Откройте http://capitalwabot.com (или https:// если SSL настроен)
   - Должна открыться веб-форма бота

5. **Проверка API:**
```bash
curl -X GET http://localhost:3000/api/status
```

---

## 🔧 Обслуживание

### Обновление кода
```bash
cd /www/WhatsAppBot
sudo git pull  # Если используете Git
sudo npm install  # Обновление зависимостей
pm2 restart whatsappbot
```

### Просмотр логов
```bash
# Логи PM2
pm2 logs whatsappbot

# Логи Nginx
sudo tail -f /var/log/nginx/capitalwabot_access.log
sudo tail -f /var/log/nginx/capitalwabot_error.log

# Системные логи
journalctl -u nginx -f
```

### Мониторинг ресурсов
```bash
pm2 monit
htop
df -h  # Проверка дискового пространства
```

---

## 🐛 Устранение неполадок

### Бот не запускается
```bash
# Проверка логов
pm2 logs whatsappbot --err

# Проверка .env файла
cat /www/WhatsAppBot/.env

# Перезапуск
pm2 restart whatsappbot
```

### Nginx выдает 502 Bad Gateway
```bash
# Проверка, что Node.js запущен
pm2 status

# Проверка порта
sudo netstat -tlnp | grep :3000

# Проверка логов Nginx
sudo tail -f /var/log/nginx/capitalwabot_error.log
```

### SSL не работает
```bash
# Повторная попытка получения сертификата
sudo certbot --nginx -d capitalwabot.com -d www.capitalwabot.com

# Проверка срока действия
sudo certbot certificates
```

---

## 📊 Рекомендации по безопасности

1. **Регулярные обновления:**
```bash
sudo apt update && sudo apt upgrade -y
npm audit fix
```

2. **Ограничение доступа к .env:**
```bash
sudo chmod 600 /www/WhatsAppBot/.env
```

3. **Настройка fail2ban** (защита от брутфорса):
```bash
sudo apt install -y fail2ban
sudo systemctl enable fail2ban
```

4. **Бэкапы базы данных** (если используется):
```bash
# Настройте автоматические бэкапы через cron
```

---

## 📞 Контакты и поддержка

После развертывания ваш бот будет доступен по адресу:
- **HTTP**: http://capitalwabot.com
- **HTTPS**: https://capitalwabot.com (после настройки SSL)

Веб-интерфейс позволяет управлять ботом, вводя номер телефона и ID объекта.

---

## ✨ Готово!

Ваш WhatsApp Bot успешно развернут и готов к работе! 🎉

