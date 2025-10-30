import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { startBot, stopBot, stopAllBots, getBotStatus, getAllBots } from './botRunner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(__dirname));

// Главная страница
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// API endpoint для запуска бота
app.post('/api/start-bot', async (req, res) => {
    try {
        const { chatId, objectId } = req.body;

        // Валидация входных данных
        if (!chatId || !objectId) {
            return res.status(400).json({
                error: 'Необходимо указать chatId и objectId'
            });
        }

        // Запускаем бота в фоновом режиме
        console.log(`\n${'='.repeat(50)}`);
        console.log(`[${new Date().toLocaleTimeString()}] 🚀 Получен запрос на запуск бота`);
        console.log(`Chat ID: ${chatId}`);
        console.log(`Object ID: ${objectId}`);
        console.log('='.repeat(50) + '\n');

        // Запускаем бота асинхронно (не ждем завершения)
        startBot(chatId, objectId).catch(error => {
            console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка бота:`, error);
        });

        res.json({
            success: true,
            message: `Бот успешно запущен для чата ${chatId} и объекта ${objectId}`
        });
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка при запуске бота:`, error);
        res.status(500).json({
            error: 'Ошибка при запуске бота: ' + error.message
        });
    }
});

// API endpoint для остановки конкретного бота
app.post('/api/stop-bot', (req, res) => {
    try {
        const { chatId } = req.body;
        
        if (!chatId) {
            return res.status(400).json({
                error: 'Необходимо указать chatId'
            });
        }
        
        const stopped = stopBot(chatId);
        
        if (stopped) {
            res.json({
                success: true,
                message: `Бот для ${chatId} успешно остановлен`
            });
        } else {
            res.status(404).json({
                error: `Бот для ${chatId} не был запущен`
            });
        }
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка при остановке бота:`, error);
        res.status(500).json({
            error: 'Ошибка при остановке бота: ' + error.message
        });
    }
});

// API endpoint для остановки всех ботов
app.post('/api/stop-all-bots', (req, res) => {
    try {
        const stopped = stopAllBots();
        
        res.json({
            success: true,
            message: `Остановлено ботов: ${stopped}`
        });
    } catch (error) {
        console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка при остановке ботов:`, error);
        res.status(500).json({
            error: 'Ошибка при остановке ботов: ' + error.message
        });
    }
});

// API endpoint для получения списка всех ботов
app.get('/api/bots', (req, res) => {
    const bots = getAllBots();
    res.json({
        success: true,
        count: bots.length,
        maxBots: 5,
        bots: bots
    });
});

// API endpoint для проверки статуса конкретного бота
app.get('/api/status/:chatId', (req, res) => {
    const { chatId } = req.params;
    const status = getBotStatus(chatId);
    
    if (status) {
        res.json(status);
    } else {
        res.status(404).json({
            error: `Бот для ${chatId} не найден`
        });
    }
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка сервера:`, err);
    res.status(500).json({
        error: 'Внутренняя ошибка сервера'
    });
});

// Запуск сервера
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(50));
    console.log(`🌐 Веб-сервер запущен на http://localhost:${PORT}`);
    console.log(`📱 Откройте браузер и перейдите по адресу:`);
    console.log(`   http://localhost:${PORT}`);
    console.log('='.repeat(50) + '\n');
});

// Обработка завершения процесса
process.on('SIGINT', () => {
    console.log('\n\n🛑 Получен сигнал завершения...');
    stopAllBots();
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n\n🛑 Получен сигнал завершения...');
    stopAllBots();
    process.exit(0);
});

