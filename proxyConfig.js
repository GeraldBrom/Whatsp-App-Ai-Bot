import 'dotenv/config';
import { SocksProxyAgent } from 'socks-proxy-agent';
import https from 'https';

/**
 * Конфигурация SOCKS5 прокси для OpenAI API
 * Используется для обхода региональных ограничений
 */

/**
 * Создает и возвращает HTTP Agent с настройками SOCKS5 прокси
 * @returns {https.Agent|undefined} - Configured proxy agent or undefined if no proxy configured
 */
export function createProxyAgent() {
    const proxyHost = process.env.PROXY_HOST;
    const proxyPort = process.env.PROXY_PORT;
    const useProxy = process.env.USE_PROXY !== 'false'; // Позволяет отключить прокси

    // Если прокси отключен через USE_PROXY=false
    if (!useProxy) {
        console.log('⚠️ Прокси отключен (USE_PROXY=false), используется прямое подключение к OpenAI API');
        return undefined;
    }

    // Если прокси не настроен, возвращаем undefined (будет использоваться прямое подключение)
    if (!proxyHost || !proxyPort) {
        console.log('⚠️ Прокси не настроен, используется прямое подключение к OpenAI API');
        return undefined;
    }

    try {
        // Формируем URL прокси в формате socks5://host:port
        const proxyUrl = `socks5://${proxyHost}:${proxyPort}`;
        
        // Создаем агент с настройками SOCKS5 прокси и увеличенным таймаутом
        const agent = new SocksProxyAgent(proxyUrl, {
            timeout: 10000 // 10 секунд
        });
        
        console.log(`✅ SOCKS5 прокси настроен: ${proxyHost}:${proxyPort} (таймаут: 10с)`);
        
        return agent;
    } catch (error) {
        console.error('❌ Ошибка при создании прокси агента:', error.message);
        console.log('⚠️ Используется прямое подключение к OpenAI API');
        return undefined;
    }
}

/**
 * Получает конфигурацию для OpenAI клиента с прокси
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} - Configuration object for OpenAI client
 */
export function getOpenAIConfig(apiKey) {
    const httpAgent = createProxyAgent();
    
    const config = {
        apiKey: apiKey || process.env.OPENAI_API_KEY
    };
    
    // Добавляем httpAgent только если прокси настроен
    if (httpAgent) {
        config.httpAgent = httpAgent;
    }
    
    return config;
}

export default {
    createProxyAgent,
    getOpenAIConfig
};

