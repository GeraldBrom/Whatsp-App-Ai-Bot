import 'dotenv/config';
import { GreenApiClient } from '@green-api/whatsapp-api-client-js-v2';
import OpenAI from 'openai';
import { getOpenAIConfig } from './proxyConfig.js';
import databaseConnect from './databaseConnect.js';
import { cleanOwnerName } from './formatterName.js';
import { analyzeResponse } from './responseAnalyzer.js';
import { processMessage } from './objectionHandler.js';

// Глобальная переменная для отслеживания состояния бота
let botInstance = null;
let isRunning = false;

// Функция задержки для имитации естественного общения
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Основная функция запуска бота
export async function startBot(chatId, objectId) {
    if (isRunning) {
        throw new Error('Бот уже запущен');
    }

    console.log(`[${new Date().toLocaleTimeString()}] 🚀 Запуск бота для chatId: ${chatId}, objectId: ${objectId}`);

    // Инициализация клиента GreenApi для WhatsApp
    const client = new GreenApiClient({
        idInstance: process.env.ID_INSTANCE,
        apiTokenInstance: process.env.API_TOKEN_INSTANCE
    });

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
        COMPLETED: 'completed'
    };

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
        if(data.objectCount = 0 || null)
        {
            await sendMessageWithDelay(targetChatId, `Я — ИИ (искусственный интеллект) компании Capital Mars. Мы работали с вами ${data.formattedAddDate}. Видим, что она снова сдается — верно? Если да, можем подключиться к сдаче вашей квартиры? Мы с вами работали ${data.formattedAddDate}`, 2000);
        }
        await sendMessageWithDelay(targetChatId, `Я — ИИ (искусственный интеллект) компании Capital Mars. Мы уже ${data.objectCount} раза сдавали вашу квартиру на ${data.objectInfo[0].address}. ${cleanedName}, что она снова сдается — верно? Если да, можем подключиться к сдаче вашей квартиры?`, 2000);
        
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
                `Хорошо, спасибо за доверие. Пару моментов для актуализации информации. Стоимость квартиры ${data.objectInfo[0].price} руб (с коммуналкой, но счетчики отдельно), верно?`
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
            dialogState.set(targetChatId, MESSAGE_TYPES.COMPLETED);
            console.log(`[${new Date().toLocaleTimeString()}] 🔄 Состояние установлено: COMPLETED (успешное завершение)`);
            return;
        }
        
        await sendMessageWithDelay(targetChatId, 'Понял вас. Подскажите, пожалуйста, какая цена актуальна на данный момент?');
    }

    // Обработчик неизвестного состояния диалога
    async function handleUnknownStateResponse(targetChatId, isPositive) {
        console.log(`[${new Date().toLocaleTimeString()}] Неизвестное состояние для ${targetChatId}, пропускаем обработку`);
        // Не делаем ничего, чтобы не повторять вопросы после завершения диалога
    }

    // Проверка типа уведомления
    function isIncomingMessage(notification) {
        return notification.body.typeWebhook === 'incomingMessageReceived';
    }

    // Проверка, что сообщение не от бота
    function isOutgoingMessage(messageData) {
        const typeMessage = messageData.typeMessage;
        return typeMessage === 'outgoing' || messageData?.typeMessage === 'outgoingAPIMessage';
    }

    // Извлечение текста сообщения
    function extractMessageText(messageData) {
        return messageData.textMessageData?.textMessage || 
               messageData.extendedTextMessageData?.text || 
               null;
    }

    // Извлечение chatId из уведомления
    function extractChatId(notification) {
        return notification.body.senderData?.sender || 
               notification.body.senderData?.chatId || 
               (notification.body.senderData?.senderName ? `${notification.body.senderData.senderName}@c.us` : null);
    }

    // Проверка, что отправитель - не сам бот
    function isBotMessage(msgChatId) {
        const botChatId = `${process.env.ID_INSTANCE}@c.us`;
        return msgChatId === botChatId || msgChatId.includes(process.env.ID_INSTANCE);
    }

    // Валидация входящего сообщения
    function validateMessage(notification) {
        if (!isIncomingMessage(notification)) {
            console.log(`[${new Date().toLocaleTimeString()}] 🔍 Не входящее сообщение (typeWebhook: ${notification.body.typeWebhook})`);
            return { valid: false };
        }

        const messageData = notification.body.messageData;
        
        if (isOutgoingMessage(messageData)) {
            console.log(`[${new Date().toLocaleTimeString()}] ⬅️ Пропуск исходящего сообщения от бота`);
            return { valid: false };
        }

        const responseText = extractMessageText(messageData);
        if (!responseText) {
            console.log(`[${new Date().toLocaleTimeString()}] 📎 Получено сообщение без текста (возможно, медиа)`);
            return { valid: false };
        }

        const msgChatId = extractChatId(notification);
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
        [MESSAGE_TYPES.PRICE_CONFIRMATION]: handlePriceConfirmationResponse
    };

    // Маршрутизатор обработки диалога
    async function routeDialogResponse(targetChatId, isPositive) {
        const messageType = dialogState.get(targetChatId);
        console.log(`[${new Date().toLocaleTimeString()}] 🔀 routeDialogResponse: текущее состояние=${messageType}, isPositive=${isPositive}`);
        const handler = dialogHandlers[messageType] || handleUnknownStateResponse;
        await handler(targetChatId, isPositive);
    }

    // Функция обработки входящего сообщения
    async function handleIncomingMessage(notification) {
        try {
            const validation = validateMessage(notification);
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

            // Проверяем, есть ли Vector Store для обработки возражений
            if (process.env.VECTOR_STORE_ID) {
                // Пытаемся обработать сообщение как возражение через RAG
                const objectionResponse = await processMessage(responseText, process.env.VECTOR_STORE_ID);
                
                if (objectionResponse) {
                    // Если это возражение и мы получили ответ из базы знаний
                    console.log(`[${new Date().toLocaleTimeString()}] 🎯 Обработано возражение через RAG`);
                    await sendMessageWithDelay(msgChatId, objectionResponse);
                    
                    // Продолжаем основной диалог после ответа на возражение
                    // Не меняем состояние, просто отправляем информацию
                    return;
                }
            }

            const isPositive = await analyzeResponse(responseText);
            
            if (isPositive === null) {
                console.log(`[${new Date().toLocaleTimeString()}] Нейтральное сообщение проигнорировано, ожидаем содержательный ответ`);
                return;
            }
            
            console.log(`[${new Date().toLocaleTimeString()}] Анализ ответа: ${isPositive ? 'положительный' : 'отрицательный'}`);
            await routeDialogResponse(msgChatId, isPositive);
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] Ошибка при обработке сообщения:`, error);
        }
    }

    // Функция очистки старых уведомлений
    async function clearOldNotifications() {
        try {
            // Удаляем все старые уведомления (максимум 100 за раз)
            for (let i = 0; i < 100; i++) {
                const notification = await client.receiveNotification(1);
                if (!notification) {
                    break;
                }
                await client.deleteNotification(notification.receiptId);
            }
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] Ошибка при очистке уведомлений:`, error);
        }
    }

    // Очищаем старые уведомления перед запуском
    await clearOldNotifications();

    // Инициализируем диалог с указанным chatId
    await initializeDialog(chatId);

    isRunning = true;
    botInstance = { client, dialogState, initializedChats };

    // Основной цикл обработки сообщений
    while (isRunning) {
        try {
            const notification = await client.receiveNotification(30);
            
            if (notification) {
                console.log(`[${new Date().toLocaleTimeString()}] 📬 Получено уведомление типа: ${notification.body.typeWebhook}`);
                await handleIncomingMessage(notification);
                await client.deleteNotification(notification.receiptId);
            } else {
                const currentState = dialogState.get(chatId) || 'не инициализирован';
                console.log(`[${new Date().toLocaleTimeString()}] ⏳ Нет новых уведомлений (текущее состояние: ${currentState})`);
            }
        } catch (error) {
            console.error(`[${new Date().toLocaleTimeString()}] ❌ Ошибка в основном цикле:`, error);
            await delay(5000);
        }
    }

    console.log(`[${new Date().toLocaleTimeString()}] ⏹️ Бот остановлен`);
}

// Функция остановки бота
export function stopBot() {
    if (isRunning) {
        isRunning = false;
        botInstance = null;
        console.log(`[${new Date().toLocaleTimeString()}] Запрос на остановку бота отправлен`);
        return true;
    }
    return false;
}

// Функция проверки состояния бота
export function getBotStatus() {
    return {
        isRunning,
        hasInstance: botInstance !== null
    };
}

