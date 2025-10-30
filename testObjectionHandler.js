import 'dotenv/config';
import { processMessage } from './objectionHandler.js';

/**
 * Тестовый скрипт для проверки работы RAG-системы обработки возражений
 * Запуск: node testObjectionHandler.js
 */

// Массив тестовых возражений
const testCases = [
    // Возражения о цене
    "Почему так дорого?",
    "Цена слишком высокая",
    "У конкурентов дешевле",
    
    // Возражения о комиссии
    "А почему комиссия такая большая?",
    "Много берёте за услуги",
    
    // Возражения о необходимости услуг
    "Зачем мне агентство, я сам найду",
    "Не хочу платить комиссию",
    
    // Возражения о сроках
    "Слишком долго будете сдавать",
    "Мне нужно быстрее",
    
    // Не возражения (для проверки фильтрации)
    "Добрый день",
    "Какой адрес квартиры?",
    "Хорошо, согласен",
    "Да, верно"
];

async function runTests() {
    console.log('🧪 ТЕСТИРОВАНИЕ СИСТЕМЫ ОБРАБОТКИ ВОЗРАЖЕНИЙ');
    console.log('=' .repeat(70));
    console.log('');
    
    // Проверяем наличие VECTOR_STORE_ID
    if (!process.env.VECTOR_STORE_ID) {
        console.error('❌ ОШИБКА: Не указан VECTOR_STORE_ID в .env');
        console.log('📝 Запустите: npm run setup');
        process.exit(1);
    }
    
    console.log(`✅ Vector Store ID: ${process.env.VECTOR_STORE_ID}`);
    console.log('');
    console.log('Тестируем', testCases.length, 'сценариев...');
    console.log('=' .repeat(70));
    console.log('');
    
    let successCount = 0;
    let objectionCount = 0;
    let nonObjectionCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < testCases.length; i++) {
        const testMessage = testCases[i];
        
        console.log(`\n📝 Тест ${i + 1}/${testCases.length}`);
        console.log(`Входящее сообщение: "${testMessage}"`);
        console.log('-'.repeat(70));
        
        try {
            const startTime = Date.now();
            const response = await processMessage(testMessage, process.env.VECTOR_STORE_ID);
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);
            
            if (response) {
                console.log(`✅ Обнаружено возражение`);
                console.log(`💬 Ответ: "${response}"`);
                console.log(`⏱️  Время обработки: ${duration}с`);
                objectionCount++;
                successCount++;
            } else {
                console.log(`ℹ️  Не является возражением (пропущено)`);
                console.log(`⏱️  Время обработки: ${duration}с`);
                nonObjectionCount++;
                successCount++;
            }
            
        } catch (error) {
            console.error(`❌ Ошибка: ${error.message}`);
            errorCount++;
        }
        
        console.log('-'.repeat(70));
        
        // Пауза между запросами, чтобы не перегружать API
        if (i < testCases.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
    
    console.log('');
    console.log('=' .repeat(70));
    console.log('📊 РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ');
    console.log('=' .repeat(70));
    console.log(`Всего тестов: ${testCases.length}`);
    console.log(`✅ Успешно: ${successCount}`);
    console.log(`🎯 Обработано возражений: ${objectionCount}`);
    console.log(`ℹ️  Не возражения: ${nonObjectionCount}`);
    console.log(`❌ Ошибок: ${errorCount}`);
    console.log('');
    
    if (errorCount === 0) {
        console.log('🎉 ВСЕ ТЕСТЫ ПРОЙДЕНЫ УСПЕШНО!');
    } else {
        console.log('⚠️  Обнаружены ошибки. Проверьте конфигурацию.');
    }
    
    console.log('=' .repeat(70));
}

// Запускаем тесты
runTests().catch(error => {
    console.error('');
    console.error('💥 КРИТИЧЕСКАЯ ОШИБКА:', error);
    process.exit(1);
});

