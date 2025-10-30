import 'dotenv/config';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';
import http from 'http';
import OpenAI from 'openai';
import { getOpenAIConfig } from './proxyConfig.js';

/**
 * Утилита для проверки работы SOCKS5 прокси
 * Проверяет:
 * 1. Доступность прокси-сервера
 * 2. Возможность подключения через прокси к внешним ресурсам
 * 3. Работу OpenAI API через прокси
 */

// Цветной вывод в консоль
const colors = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    red: '\x1b[31m',
    yellow: '\x1b[33m',
    blue: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(message, color = colors.reset) {
    console.log(`${color}${message}${colors.reset}`);
}

function success(message) {
    log(`✅ ${message}`, colors.green);
}

function error(message) {
    log(`❌ ${message}`, colors.red);
}

function info(message) {
    log(`ℹ️  ${message}`, colors.blue);
}

function warning(message) {
    log(`⚠️  ${message}`, colors.yellow);
}

function header(message) {
    log(`\n${'='.repeat(60)}`, colors.magenta);
    log(message, colors.magenta);
    log('='.repeat(60), colors.magenta);
}

/**
 * Проверяет конфигурацию прокси из переменных окружения
 */
function checkProxyConfig() {
    header('ПРОВЕРКА КОНФИГУРАЦИИ ПРОКСИ');
    
    const proxyHost = process.env.PROXY_HOST;
    const proxyPort = process.env.PROXY_PORT;
    const useProxy = process.env.USE_PROXY !== 'false';
    const openaiKey = process.env.OPENAI_API_KEY;
    
    info(`USE_PROXY: ${useProxy}`);
    info(`PROXY_HOST: ${proxyHost || 'не указан'}`);
    info(`PROXY_PORT: ${proxyPort || 'не указан'}`);
    info(`OPENAI_API_KEY: ${openaiKey ? '***' + openaiKey.slice(-4) : 'не указан'}`);
    
    if (!useProxy) {
        warning('Прокси отключен (USE_PROXY=false)');
        return { valid: false, reason: 'disabled' };
    }
    
    if (!proxyHost || !proxyPort) {
        error('Прокси не настроен! Укажите PROXY_HOST и PROXY_PORT в .env файле');
        return { valid: false, reason: 'not_configured' };
    }
    
    if (!openaiKey) {
        warning('OPENAI_API_KEY не указан. Проверка OpenAI API будет пропущена.');
    }
    
    success(`Прокси настроен: ${proxyHost}:${proxyPort}`);
    return { valid: true, proxyHost, proxyPort, openaiKey };
}

/**
 * Проверяет доступность прокси-сервера
 */
async function testProxyConnection(proxyHost, proxyPort) {
    header('ТЕСТ 1: ПОДКЛЮЧЕНИЕ К ПРОКСИ-СЕРВЕРУ');
    
    return new Promise((resolve) => {
        const proxyUrl = `socks5://${proxyHost}:${proxyPort}`;
        
        try {
            const agent = new SocksProxyAgent(proxyUrl);
            
            info(`Попытка подключения к ${proxyHost}:${proxyPort}...`);
            
            // Пытаемся сделать запрос через прокси к google.com
            const req = https.request({
                host: 'www.google.com',
                port: 443,
                path: '/',
                method: 'GET',
                agent: agent,
                timeout: 10000
            }, (res) => {
                success(`Прокси-сервер доступен! HTTP Status: ${res.statusCode}`);
                resolve(true);
                req.destroy();
            });
            
            req.on('error', (err) => {
                error(`Ошибка подключения к прокси: ${err.message}`);
                info('Возможные причины:');
                info('  - Прокси-сервер не запущен');
                info('  - Неверные PROXY_HOST или PROXY_PORT');
                info('  - Проблемы с сетью или файерволом');
                resolve(false);
            });
            
            req.on('timeout', () => {
                error('Таймаут подключения к прокси (10 секунд)');
                resolve(false);
                req.destroy();
            });
            
            req.end();
        } catch (err) {
            error(`Ошибка создания прокси агента: ${err.message}`);
            resolve(false);
        }
    });
}

/**
 * Проверяет возможность получения данных через прокси
 */
async function testProxyDataFetch(proxyHost, proxyPort) {
    header('ТЕСТ 2: ПОЛУЧЕНИЕ ДАННЫХ ЧЕРЕЗ ПРОКСИ');
    
    return new Promise((resolve) => {
        const proxyUrl = `socks5://${proxyHost}:${proxyPort}`;
        const agent = new SocksProxyAgent(proxyUrl);
        
        info('Попытка получить данные с api.ipify.org (определение IP)...');
        
        const req = https.request({
            host: 'api.ipify.org',
            port: 443,
            path: '/?format=json',
            method: 'GET',
            agent: agent,
            timeout: 10000
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const ipData = JSON.parse(data);
                    success(`Данные успешно получены через прокси!`);
                    info(`Ваш IP через прокси: ${ipData.ip}`);
                    resolve(true);
                } catch (err) {
                    error(`Ошибка парсинга ответа: ${err.message}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (err) => {
            error(`Ошибка получения данных: ${err.message}`);
            resolve(false);
        });
        
        req.on('timeout', () => {
            error('Таймаут получения данных (10 секунд)');
            resolve(false);
            req.destroy();
        });
        
        req.end();
    });
}

/**
 * Проверяет работу OpenAI API через прокси
 */
async function testOpenAIConnection(openaiKey) {
    header('ТЕСТ 3: РАБОТА OPENAI API ЧЕРЕЗ ПРОКСИ');
    
    if (!openaiKey) {
        warning('Тест пропущен: OPENAI_API_KEY не указан');
        return null;
    }
    
    try {
        info('Инициализация OpenAI клиента с прокси...');
        const config = getOpenAIConfig(openaiKey);
        const openai = new OpenAI(config);
        
        info('Отправка тестового запроса к OpenAI API...');
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'user', content: 'Привет! Скажи просто: работает' }
            ],
            max_tokens: 10,
            temperature: 0
        });
        
        const response = completion.choices[0].message.content;
        success('OpenAI API работает через прокси!');
        info(`Ответ от GPT: "${response}"`);
        info(`Использовано токенов: ${completion.usage.total_tokens}`);
        
        return true;
    } catch (err) {
        error(`Ошибка при работе с OpenAI API: ${err.message}`);
        
        if (err.status === 401) {
            error('Неверный OPENAI_API_KEY');
        } else if (err.code === 'ENOTFOUND' || err.code === 'ETIMEDOUT') {
            error('Не удалось подключиться к OpenAI API через прокси');
        } else if (err.status === 429) {
            warning('Превышен лимит запросов к OpenAI API');
        }
        
        return false;
    }
}

/**
 * Проверяет прямое подключение (без прокси) для сравнения
 */
async function testDirectConnection() {
    header('ТЕСТ 4: ПРЯМОЕ ПОДКЛЮЧЕНИЕ (БЕЗ ПРОКСИ)');
    
    return new Promise((resolve) => {
        info('Попытка прямого подключения к api.ipify.org...');
        
        const req = https.request({
            host: 'api.ipify.org',
            port: 443,
            path: '/?format=json',
            method: 'GET',
            timeout: 5000
        }, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const ipData = JSON.parse(data);
                    success(`Прямое подключение работает`);
                    info(`Ваш реальный IP (без прокси): ${ipData.ip}`);
                    resolve(true);
                } catch (err) {
                    error(`Ошибка парсинга ответа: ${err.message}`);
                    resolve(false);
                }
            });
        });
        
        req.on('error', (err) => {
            warning(`Прямое подключение недоступно: ${err.message}`);
            info('Возможно, вы работаете в регионе с ограничениями');
            resolve(false);
        });
        
        req.on('timeout', () => {
            warning('Таймаут прямого подключения');
            resolve(false);
            req.destroy();
        });
        
        req.end();
    });
}

/**
 * Выводит итоговый отчет
 */
function printSummary(results) {
    header('ИТОГОВЫЙ ОТЧЕТ');
    
    console.log('');
    log('Результаты тестирования:', colors.magenta);
    console.log('');
    
    if (results.proxyConnection) {
        success('Подключение к прокси-серверу: OK');
    } else {
        error('Подключение к прокси-серверу: FAILED');
    }
    
    if (results.proxyDataFetch) {
        success('Получение данных через прокси: OK');
    } else {
        error('Получение данных через прокси: FAILED');
    }
    
    if (results.openaiConnection === true) {
        success('OpenAI API через прокси: OK');
    } else if (results.openaiConnection === false) {
        error('OpenAI API через прокси: FAILED');
    } else {
        warning('OpenAI API через прокси: SKIPPED');
    }
    
    if (results.directConnection) {
        info('Прямое подключение (без прокси): OK');
    } else {
        info('Прямое подключение (без прокси): FAILED');
    }
    
    console.log('');
    
    const successCount = [
        results.proxyConnection,
        results.proxyDataFetch,
        results.openaiConnection === true
    ].filter(Boolean).length;
    
    const totalTests = results.openaiConnection === null ? 2 : 3;
    
    if (successCount === totalTests) {
        success(`\n🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ! (${successCount}/${totalTests})`);
        success('Ваш прокси работает корректно!');
    } else if (successCount > 0) {
        warning(`\n⚠️  ЧАСТИЧНЫЙ УСПЕХ (${successCount}/${totalTests})`);
        warning('Некоторые тесты не прошли. Проверьте логи выше.');
    } else {
        error('\n❌ ВСЕ ТЕСТЫ НЕ ПРОЙДЕНЫ');
        error('Прокси не работает. Проверьте конфигурацию.');
    }
    
    console.log('');
}

/**
 * Основная функция запуска всех тестов
 */
async function runAllTests() {
    log('\n╔════════════════════════════════════════════════════════════╗', colors.magenta);
    log('║         ТЕСТИРОВАНИЕ SOCKS5 ПРОКСИ КОНФИГУРАЦИИ            ║', colors.magenta);
    log('╚════════════════════════════════════════════════════════════╝', colors.magenta);
    
    // Проверка конфигурации
    const config = checkProxyConfig();
    
    if (!config.valid) {
        if (config.reason === 'disabled') {
            info('\nПрокси отключен. Установите USE_PROXY=true для включения.');
        } else {
            error('\nНастройте прокси в файле .env:');
            info('  PROXY_HOST=ваш_прокси_хост');
            info('  PROXY_PORT=ваш_прокси_порт');
            info('  USE_PROXY=true');
        }
        process.exit(1);
    }
    
    const results = {
        proxyConnection: false,
        proxyDataFetch: false,
        openaiConnection: null,
        directConnection: false
    };
    
    // Запуск тестов
    results.proxyConnection = await testProxyConnection(config.proxyHost, config.proxyPort);
    
    if (results.proxyConnection) {
        results.proxyDataFetch = await testProxyDataFetch(config.proxyHost, config.proxyPort);
        
        if (config.openaiKey) {
            results.openaiConnection = await testOpenAIConnection(config.openaiKey);
        }
    } else {
        warning('\nОстальные тесты пропущены из-за недоступности прокси-сервера');
    }
    
    // Тест прямого подключения для сравнения
    results.directConnection = await testDirectConnection();
    
    // Вывод итогового отчета
    printSummary(results);
}

// Запуск тестов
runAllTests().catch((err) => {
    error(`\nКритическая ошибка: ${err.message}`);
    console.error(err);
    process.exit(1);
});

