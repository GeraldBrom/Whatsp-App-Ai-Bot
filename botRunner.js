import 'dotenv/config';
import { GreenApiClient } from '@green-api/whatsapp-api-client-js-v2';
import OpenAI from 'openai';
import { getOpenAIConfig } from './proxyConfig.js';
import databaseConnect from './databaseConnect.js';
import { cleanOwnerName } from './formatterName.js';
import { analyzeResponse } from './responseAnalyzer.js';
import { processMessage } from './objectionHandler.js';

// Хранилище активных ботов (ключ - chatId)
const activeBots = new Map();

// Максимальное количество одновременно работающих ботов
const MAX_BOTS = 5;

// Функция задержки для имитации естественного общения
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Основная функция запуска бота
export async function startBot(chatId, objectId) {
    // Проверяем, не запущен ли уже бот для этого chatId
    if (activeBots.has(chatId)) {
        throw new Error(`Бот для ${chatId} уже запущен`);
    }

    // Проверяем лимит активных ботов
    if (activeBots.size >= MAX_BOTS) {
        throw new Error(`Достигнут лимит активных ботов (${MAX_BOTS}). Остановите один из ботов перед запуском нового.`);
    }

    console.log(`[${new Date().toLocaleTimeString()}] 🚀 Запуск бота для chatId: ${chatId}, objectId: ${objectId}`);

    // Инициализация клиента GreenApi для WhatsApp
    const client = new GreenApiClient({
        idInstance: process.env.ID_INSTANCE,
        apiTokenInstance: process.env.API_TOKEN_INSTANCE
    });
    
    // URL для получения последних входящих сообщений
    // Используем API_URL из .env или определяем автоматически на основе ID_INSTANCE
    const apiRegion = process.env.API_URL || `https://${process.env.ID_INSTANCE.substring(0, 4)}.api.green-api.com`;
    const apiUrl = `${apiRegion}/waInstance${process.env.ID_INSTANCE}/lastIncomingMessages/${process.env.API_TOKEN_INSTANCE}`;
    
    console.log(`[${new Date().toLocaleTimeString()}] 🌐 API URL: ${apiUrl.replace(process.env.API_TOKEN_INSTANCE, '***TOKEN***')}`);

    // Инициализация OpenAI клиента для форматирования имен
    const openaiClient = new OpenAI(getOpenAIConfig(process.env.OPENAI_API_KEY));

    // Получение данных из базы данных
    const data = await databaseConnect(objectId);
    
    // Логирование сырых данных владельца
    console.log(`[${new Date().toLocaleTimeString()}] 🔍 Сырое имя из БД: "${data.ownerInfo[0]?.value}"`);

    // Инициализация состояния диалога
    const dialogState = new Map();
    // Инициализация списка инициализированных чатов
    const initializedChats = new Set();
    // Инициализация списка обработанных сообщений (для предотвращения дублирования)
    const processedMessages = new Set();
    // Последнее отправленное сообщение для каждого чата
    const lastSentMessage = new Map();

    // Инициализация типов сообщений
    const MESSAGE_TYPES = {
        INITIAL_QUESTION: 'initial_question',
        PRICE_CONFIRMATION: 'price_confirmation',
        PRICE_UPDATE: 'price_update',
        COMMISSION_INFO: 'commission_info',
        COMPLETED: 'completed'
    };

    // Утилиты анализа текста
    function sanitizeBotText(text) {
        if (!text) return text;
        // Удаляем квадратные/китайские ссылочные метки вида [1],  и т.п.
        return text
            .replace(/\[[^\]]*\]/g, '')
            .replace(/【[^】]*】/g, '')
            .replace(/\s{2,}/g, ' ')
            .trim();
    }

    function containsNegativeIntent(text) {
        const t = (text || '').toLowerCase();
        const phrases = [
            'я против', 'не давал', 'не разреш', 'не надо', 'не хочу', 'стоп', 'нет', 'не соглас',
            'прекратите', 'остановите', 'не пишите', 'не беспокойте'
        ];
        return phrases.some(p => t.includes(p));
    }

    function containsPauseIntent(text) {
        const t = (text || '').toLowerCase();
        const phrases = ['погодите', 'подождите', 'минутку', 'секунду', 'сейчас не'];
        return phrases.some(p => t.includes(p));
    }

    function extractPriceFromText(text) {
        if (!text) return null;
        // Извлекаем число (поддержка форматов: 95,000; 95000; 95 000; 95k/95к)
        const normalized = text
            .toLowerCase()
            .replace(/[\s\u00A0]/g, ' ')
            .replace(/руб\.?/g, '')
            .trim();

        const kMatch = normalized.match(/(\d+[\s.,]?\d*)\s*[kк]/);
        if (kMatch) {
            const num = Number(kMatch[1].replace(/[^\d]/g, ''));
            if (!Number.isNaN(num)) return String(num * 1000);
        }

        const numMatch = normalized.match(/\d{1,3}([\s.,]?\d{3})+|\d+/);
        if (numMatch) {
            const digits = numMatch[0].replace(/[^\d]/g, '');
            if (digits.length > 0) return digits;
        }
        return null;
    }

    // Функция отправки сообщения с задержкой
    async function sendMessageWithDelay(targetChatId, message, delayMs = 1500) {
        // Проверяем, не отправляли ли мы уже это сообщение недавно
        const lastMessage = lastSentMessage.get(targetChatId);
        if (lastMessage && lastMessage.text === message && (Date.now() - lastMessage.timestamp) < 10000) {
            console.log(`[${new Date().toLocaleTimeString()}] ⚠️ Попытка отправить дубликат сообщения, пропускаем`);
            return;
        }
        
        await delay(delayMs);
        await client.sendMessage({ chatId: targetChatId, message });
        console.log(`[${new Date().toLocaleTimeString()}] ✅ Отправлено сообщение в ${targetChatId}: ${message.substring(0, 50)}...`);
        
        // Сохраняем последнее отправленное сообщение
        lastSentMessage.set(targetChatId, { text: message, timestamp: Date.now() });
    }

    // Функция инициализации диалога с клиентом
    async function initializeDialog(targetChatId) {
        if (initializedChats.has(targetChatId)) {
            console.log(`[${new Date().toLocaleTimeString()}] Диалог с ${targetChatId} уже был инициализирован`);
            return;
        }
        
        console.log(`[${new Date().toLocaleTimeString()}] Инициализация диалога с ${targetChatId}`);
        
        const rawName = data.ownerInfo[0].value;
        console.log(`[${new Date().toLocaleTimeString()}] 📋 До cleanOwnerName: "${rawName}"`);
        const cleanedName = await cleanOwnerName(rawName, openaiClient);
        console.log(`[${new Date().toLocaleTimeString()}] ✨ После cleanOwnerName: "${cleanedName}"`);
        
        await sendMessageWithDelay(targetChatId, `${cleanedName}, добрый день!`, 0);

        if(data.objectCount === null || data.objectCount === 'ноль')
        {
            await sendMessageWithDelay(targetChatId, `Я — ИИ (искусственный интеллект) компании Capital Mars. Мы работали с вами ${data.formattedAddDate}. Видим, вы ее снова сдаете — верно? Если да, можем подключиться к сдаче вашей квартиры?`, 2000);
        }
        else
        {
            await sendMessageWithDelay(targetChatId, `Я — ИИ (искусственный интеллект) компании Capital Mars. Мы уже ${data.objectCount} сдавали вашу квартиру на ${data.objectInfo[0].address}. ${cleanedName}, вы ее снова сдаете — верно? Если да, можем подключиться к сдаче вашей квартиры?`, 2000);
        }
        
        dialogState.set(targetChatId, MESSAGE_TYPES.INITIAL_QUESTION);
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: INITIAL_QUESTION`);
        initializedChats.add(targetChatId);
    }

    // Обработчик ответа на начальный вопрос
    async function handleInitialQuestionResponse(targetChatId, isPositive) {
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 handleInitialQuestionResponse: isPositive=${isPositive}`);
        
        if (isPositive) {
            await sendMessageWithDelay(
                targetChatId,
                `Хорошо, спасибо за доверие. Пару моментов для актуализации информации. Стоимость квартиры ${data.formattedPrice} руб (с коммуналкой, но счетчики отдельно), верно?`
            );
            dialogState.set(targetChatId, MESSAGE_TYPES.PRICE_CONFIRMATION);
            console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: PRICE_CONFIRMATION`);
            return;
        }
        
        await sendMessageWithDelay(targetChatId, 'Я вас понял, извините за беспокойство.');
        dialogState.set(targetChatId, MESSAGE_TYPES.COMPLETED);
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMPLETED (отказ на начальном этапе)`);
    }

    // Обработчик ответа на подтверждение цены
    async function handlePriceConfirmationResponse(targetChatId, isPositive) {
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 handlePriceConfirmationResponse: isPositive=${isPositive}`);
        
        if (isPositive) {
            await sendMessageWithDelay(
                targetChatId,
                `На всякий случай проговариваю, что наша комиссия по факту заселения жильцов оплачиваемая вами ${data.objectInfo[0].commission_client}% (как и при прошлом сотрудничестве). Тогда мы запускаем в рекламу, как будут первые звонки сразу свяжемся с вами.`
            );
            dialogState.set(targetChatId, MESSAGE_TYPES.COMMISSION_INFO);
            console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMMISSION_INFO`);
            return;
        }
        
        await sendMessageWithDelay(targetChatId, 'Понял вас. Подскажите, пожалуйста, какая цена актуальна на данный момент?');
        dialogState.set(targetChatId, MESSAGE_TYPES.PRICE_UPDATE);
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: PRICE_UPDATE`);
    }

    // Обработчик получения новой цены от клиента
    async function handlePriceUpdateResponse(targetChatId, messageText) {
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 handlePriceUpdateResponse: получена новая цена от клиента`);

        // Если это явно отказ/стоп — корректно завершаем
        if (containsNegativeIntent(messageText)) {
            await sendMessageWithDelay(targetChatId, 'Понял вас. Спасибо за ваше время, если что-то изменится — будем рады сотрудничеству.');
            dialogState.set(targetChatId, MESSAGE_TYPES.COMPLETED);
            console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMPLETED (отказ вместо цены)`);
            return;
        }

        const priceDigits = extractPriceFromText(messageText);
        if (!priceDigits) {
            await sendMessageWithDelay(targetChatId, 'Понял вас. Подскажите, пожалуйста, актуальную цену числом (например, 95000 руб)?');
            // Остаемся в PRICE_UPDATE, ждем корректный ввод
            return;
        }

        const formatted = new Intl.NumberFormat('ru-RU').format(Number(priceDigits));
        await sendMessageWithDelay(
            targetChatId,
            `Понял вас, цена ${formatted} руб. На всякий случай проговариваю, что наша комиссия по факту заселения жильцов оплачиваемая вами ${data.objectInfo[0].commission_client}% (как и при прошлом сотрудничестве). Тогда мы запускаем в рекламу, как будут первые звонки сразу свяжемся с вами.`
        );
        dialogState.set(targetChatId, MESSAGE_TYPES.COMMISSION_INFO);
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMMISSION_INFO`);
    }

    // Обработчик ответа на информацию о комиссии
    async function handleCommissionInfoResponse(targetChatId, isPositive) {
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 handleCommissionInfoResponse: isPositive=${isPositive}`);
        
        if (isPositive) {
            await sendMessageWithDelay(
                targetChatId,
                'Отлично! Благодарим за доверие. Мы свяжемся с вами, как только появятся первые заинтересованные клиенты. Хорошего дня!'
            );
            dialogState.set(targetChatId, MESSAGE_TYPES.COMPLETED);
            console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMPLETED (успешное завершение)`);
            return;
        }
        
        // Если клиент не согласен с комиссией, завершаем диалог
        await sendMessageWithDelay(targetChatId, 'Понял вас. Спасибо за ваше время, если что-то изменится — будем рады сотрудничеству.');
        dialogState.set(targetChatId, MESSAGE_TYPES.COMPLETED);
        console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMPLETED (отказ по комиссии)`);
    }

    // Обработчик неизвестного состояния диалога
    async function handleUnknownStateResponse(targetChatId, isPositive) {
        console.log(`[${new Date().toLocaleTimeString()}] Неизвестное состояние для ${targetChatId}, пропускаем обработку`);
        // Не делаем ничего, чтобы не повторять вопросы после завершения диалога
    }

    // Проверка типа сообщения (формат lastIncomingMessages)
    function isIncomingMessage(message) {
        return message.type === 'incoming';
    }

    // Проверка, что сообщение не от бота
    function isOutgoingMessage(message) {
        return message.type === 'outgoing' || message.typeMessage === 'outgoingAPIMessage';
    }

    // Извлечение текста сообщения (формат lastIncomingMessages)
    function extractMessageText(message) {
        // Простая структура - текст прямо в поле textMessage
        return message.textMessage || null;
    }

    // Извлечение chatId из сообщения (формат lastIncomingMessages)
    function extractChatId(message) {
        return message.chatId || null;
    }

    // Проверка, что отправитель - не сам бот
    function isBotMessage(msgChatId) {
        const botChatId = `${process.env.ID_INSTANCE}@c.us`;
        return msgChatId === botChatId || msgChatId.includes(process.env.ID_INSTANCE);
    }

    // Валидация входящего сообщения (формат lastIncomingMessages)
    function validateMessage(message) {
        if (!isIncomingMessage(message)) {
            console.log(`[${new Date().toLocaleTimeString()}] 🔍 Не входящее сообщение (type: ${message.type})`);
            return { valid: false };
        }
        
        // Детальное логирование для отладки
        console.log(`[${new Date().toLocaleTimeString()}] 📋 Тип сообщения: ${message.typeMessage}`);
        console.log(`[${new Date().toLocaleTimeString()}] 📋 ChatId: ${message.chatId}`);
        console.log(`[${new Date().toLocaleTimeString()}] 📋 Текст: ${message.textMessage}`);
        
        if (isOutgoingMessage(message)) {
            console.log(`[${new Date().toLocaleTimeString()}] ⬅️ Пропуск исходящего сообщения от бота`);
            return { valid: false };
        }

        const responseText = extractMessageText(message);
        if (!responseText) {
            console.log(`[${new Date().toLocaleTimeString()}] 📎 Получено сообщение без текста (возможно, медиа)`);
            return { valid: false };
        }

        const msgChatId = extractChatId(message);
        if (!msgChatId) {
            console.error(`[${new Date().toLocaleTimeString()}] ❌ Не удалось определить chatId`);
            return { valid: false };
        }

        if (isBotMessage(msgChatId)) {
            console.log(`[${new Date().toLocaleTimeString()}] 🤖 Пропуск сообщения от самого бота`);
            return { valid: false };
        }

        // Фильтруем сообщения только от указанного chatId
        if (msgChatId !== chatId) {
            console.log(`[${new Date().toLocaleTimeString()}] 🚫 Пропуск сообщения от ${msgChatId} (ожидаем ${chatId})`);
            return { valid: false };
        }

        console.log(`[${new Date().toLocaleTimeString()}] ✅ Сообщение прошло валидацию`);
        return { valid: true, chatId: msgChatId, responseText };
    }

    // Маршрутизатор обработки диалога
    const dialogHandlers = {
        [MESSAGE_TYPES.INITIAL_QUESTION]: handleInitialQuestionResponse,
        [MESSAGE_TYPES.PRICE_CONFIRMATION]: handlePriceConfirmationResponse,
        [MESSAGE_TYPES.COMMISSION_INFO]: handleCommissionInfoResponse
    };

    // Маршрутизатор обработки диалога
    async function routeDialogResponse(targetChatId, isPositive, messageText = null) {
        const messageType = dialogState.get(targetChatId);
        console.log(`[${new Date().toLocaleTimeString()}] 🔀 routeDialogResponse: текущее состояние=${messageType}, isPositive=${isPositive}`);
        
        // Специальная обработка для PRICE_UPDATE - передаем текст сообщения
        if (messageType === MESSAGE_TYPES.PRICE_UPDATE) {
            await handlePriceUpdateResponse(targetChatId, messageText);
            return;
        }
        
        const handler = dialogHandlers[messageType] || handleUnknownStateResponse;
        await handler(targetChatId, isPositive);
    }

    // Функция обработки входящего сообщения
    async function handleIncomingMessage(message) {
        try {
            const validation = validateMessage(message);
            if (!validation.valid) return;

            const { chatId: msgChatId, responseText } = validation;
            
            // Создаем уникальный ID сообщения для дедупликации
            const messageId = `${msgChatId}_${responseText}_${Date.now()}`;
            const messageHash = `${msgChatId}_${responseText}`;
            
            // Проверяем, не обрабатывали ли мы уже это сообщение недавно (в течение последних 5 секунд)
            if (processedMessages.has(messageHash)) {
                console.log(`[${new Date().toLocaleTimeString()}] ⚠️ Дубликат сообщения обнаружен, пропускаем`);
                return;
            }
            
            // Добавляем в список обработанных
            processedMessages.add(messageHash);
            // Удаляем через 5 секунд (чтобы не блокировать легитимные повторы)
            setTimeout(() => processedMessages.delete(messageHash), 5000);
            
            console.log(`[${new Date().toLocaleTimeString()}] 📩 Получено сообщение от ${msgChatId}: ${responseText}`);

            if (!dialogState.has(msgChatId) && !initializedChats.has(msgChatId)) {
                await initializeDialog(msgChatId);
                return;
            }

            // Проверяем, не завершен ли уже диалог
            if (dialogState.get(msgChatId) === MESSAGE_TYPES.COMPLETED) {
                console.log(`[${new Date().toLocaleTimeString()}] Диалог с ${msgChatId} уже завершен, пропускаем сообщение`);
                return;
            }

            // Жесткие интенты до любых моделей
            if (containsNegativeIntent(responseText)) {
                await sendMessageWithDelay(msgChatId, 'Понял вас. Спасибо за ваше время, если что-то изменится — будем рады сотрудничеству.');
                dialogState.set(msgChatId, MESSAGE_TYPES.COMPLETED);
                console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMPLETED (явный отказ)`);
                return;
            }

            if (containsPauseIntent(responseText)) {
                await sendMessageWithDelay(msgChatId, 'Хорошо, жду вашего подтверждения. Напишите, когда можно продолжить.');
                // Не меняем состояние
                return;
            }

            // Проверяем, есть ли Vector Store для обработки возражений
            if (process.env.VECTOR_STORE_ID) {
                const currentState = dialogState.get(msgChatId);
                // Не используем RAG в PRICE_UPDATE, и не при паузе/отказе
                if (currentState !== MESSAGE_TYPES.PRICE_UPDATE) {
                    const objectionResponse = await processMessage(responseText, process.env.VECTOR_STORE_ID);
                    if (objectionResponse) {
                        const safeText = sanitizeBotText(objectionResponse);
                        console.log(`[${new Date().toLocaleTimeString()}] 🎯 Обработано возражение через RAG`);
                        if (safeText) {
                            await sendMessageWithDelay(msgChatId, safeText);
                            return; // не меняем состояние
                        }
                    }
                }
            }

            const isPositive = await analyzeResponse(responseText);
            
            if (isPositive === null) {
                console.log(`[${new Date().toLocaleTimeString()}] Нейтральное сообщение проигнорировано, ожидаем содержательный ответ`);
                return;
            }
            
            console.log(`[${new Date().toLocaleTimeString()}] Анализ ответа: ${isPositive ? 'положительный' : 'отрицательный'}`);
            await routeDialogResponse(msgChatId, isPositive, responseText);
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] Ошибка при обработке сообщения:`, error);
        }
    }

    // Хранилище обработанных messageId для предотвращения дублирования
    const processedMessageIds = new Set();

    // Инициализируем диалог с указанным chatId
    await initializeDialog(chatId);

    // Создаем объект бота с флагом isRunning
    const botControl = {
        isRunning: true,
        chatId,
        objectId,
        startTime: new Date(),
        client,
        dialogState,
        initializedChats
    };
    
    // Сохраняем бот в активные
    activeBots.set(chatId, botControl);

    // Основной цикл обработки сообщений через lastIncomingMessages
    while (botControl.isRunning) {
        try {
            // Получаем последние входящие сообщения за последние 60 секунд
            const response = await fetch(`${apiUrl}?minutes=1`);
            
            if (!response.ok) {
                console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка API: ${response.status}`);
                await delay(5000);
                continue;
            }
            
            const messages = await response.json();
            
            if (messages && Array.isArray(messages) && messages.length > 0) {
                console.log(`[${new Date().toLocaleTimeString()}] 📬 Получено ${messages.length} сообщений`);
                
                // Обрабатываем каждое сообщение
                for (const message of messages) {
                    // Проверяем, не обрабатывали ли мы уже это сообщение
                    if (processedMessageIds.has(message.idMessage)) {
                        console.log(`[${new Date().toLocaleTimeString()}] ⏭️ Пропуск уже обработанного сообщения ${message.idMessage}`);
                        continue;
                    }
                    
                    console.log(`[${new Date().toLocaleTimeString()}] 📋 СТРУКТУРА СООБЩЕНИЯ:`, JSON.stringify(message, null, 2));
                    
                    // Обрабатываем сообщение
                    await handleIncomingMessage(message);
                    
                    // Помечаем как обработанное
                    processedMessageIds.add(message.idMessage);
                    
                    // Удаляем старые ID (храним последние 100)
                    if (processedMessageIds.size > 100) {
                        const firstId = processedMessageIds.values().next().value;
                        processedMessageIds.delete(firstId);
                    }
                }
            } else {
                const currentState = dialogState.get(chatId) || 'не инициализирован';
                console.log(`[${new Date().toLocaleTimeString()}] ⏳ Нет новых сообщений (текущее состояние: ${currentState})`);
            }
            
            // Пауза между запросами (5 секунд)
            await delay(5000);
            
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка в основном цикле:`, error);
            await delay(5000);
        }
    }

    console.log(`[${new Date().toLocaleTimeString()}] ⏹️ Бот для ${chatId} остановлен`);
    
    // Удаляем бота из активных
    activeBots.delete(chatId);
}

// Функция остановки конкретного бота
export function stopBot(chatId) {
    if (activeBots.has(chatId)) {
        const bot = activeBots.get(chatId);
        bot.isRunning = false;
        console.log(`[${new Date().toLocaleTimeString()}] Запрос на остановку бота для ${chatId} отправлен`);
        return true;
    }
    return false;
}

// Функция остановки всех ботов
export function stopAllBots() {
    let stopped = 0;
    for (const [chatId, bot] of activeBots.entries()) {
        bot.isRunning = false;
        stopped++;
    }
    console.log(`[${new Date().toLocaleTimeString()}] Запрос на остановку ${stopped} бот(ов) отправлен`);
    return stopped;
}

// Функция получения списка всех активных ботов
export function getAllBots() {
    const bots = [];
    for (const [chatId, bot] of activeBots.entries()) {
        bots.push({
            chatId: chatId,
            objectId: bot.objectId,
            startTime: bot.startTime,
            isRunning: bot.isRunning,
            currentState: bot.dialogState.get(chatId) || 'not_initialized'
        });
    }
    return bots;
}

// Функция проверки состояния конкретного бота
export function getBotStatus(chatId) {
    if (activeBots.has(chatId)) {
        const bot = activeBots.get(chatId);
        return {
            isRunning: bot.isRunning,
            chatId: bot.chatId,
            objectId: bot.objectId,
            startTime: bot.startTime,
            currentState: bot.dialogState.get(chatId) || 'not_initialized'
        };
    }
    return null;
}

