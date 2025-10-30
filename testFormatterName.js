import 'dotenv/config';
import OpenAI from 'openai';
import { getOpenAIConfig } from './proxyConfig.js';
import { cleanOwnerName } from './formatterName.js';

// Создаем OpenAI клиент
const openaiClient = new OpenAI(getOpenAIConfig(process.env.OPENAI_API_KEY));

console.log('🧪 Тестирование форматирования имен...\n');

// Тестовые примеры
const testNames = [
    'Анна соб',
    'Иван др.',
    'Мария (соб)',
    'Петр 123',
    'Екатерина соб.',
    'Александр'
];

async function runTests() {
    for (const name of testNames) {
        try {
            const cleaned = await cleanOwnerName(name, openaiClient);
            console.log(`✅ "${name}" → "${cleaned}"`);
        } catch (error) {
            console.error(`❌ Ошибка при обработке "${name}":`, error.message);
        }
    }
}

runTests().then(() => {
    console.log('\n✅ Тестирование завершено!');
}).catch(error => {
    console.error('\n❌ Ошибка при тестировании:', error);
});

