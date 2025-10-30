import 'dotenv/config';
import { GreenApiClient } from '@green-api/whatsapp-api-client-js-v2';
import { WhatsappGptBot } from '@green-api/whatsapp-chatgpt';
import databaseConnect from './databaseConnect.js';
import { cleanOwnerName } from './formatterName.js';
import { analyzeResponse } from './responseAnalyzer.js';
import { processMessage } from './objectionHandler.js';

// Инициализация бота
const bot = new WhatsappGptBot({
    idInstance: process.env.ID_INSTANCE,
    apiTokenInstance: process.env.API_TOKEN_INSTANCE,
    openaiApiKey: process.env.OPENAI_API_KEY,
    model: "gpt-4o"
});

// Инициализация клиента GreenApi
const client = new GreenApiClient({
    idInstance: process.env.ID_INSTANCE,
    apiTokenInstance: process.env.API_TOKEN_INSTANCE
});

// Получение данных из базы данных
const data = await databaseConnect();

// Инициализация состояния диалога
const dialogState = new Map();
// Инициализация списка инициализированных чатов
const initializedChats = new Set();

// Инициализация типов сообщений
const MESSAGE_TYPES = {
    INITIAL_QUESTION: 'initial_question',
    PRICE_CONFIRMATION: 'price_confirmation'
};

// Функция задержки для имитации естественного общения
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Функция отправки сообщения с задержкой
async function sendMessageWithDelay(chatId, message, delayMs = 1500) {
    await delay(delayMs);
    await client.sendMessage({ chatId, message });
    console.log(`[${new Date().toLocaleTimeString()}] Отправлено сообщение в ${chatId}: ${message.substring(0, 50)}...`);
}

// Функция инициализации диалога с клиентом
async function initializeDialog(chatId) {
    if (initializedChats.has(chatId)) {
        console.log(`[${new Date().toLocaleTimeString()}] Диалог с ${chatId} уже был инициализирован`);
        return;
    }
    
    console.log(`[${new Date().toLocaleTimeString()}] Инициализация диалога с ${chatId}`);
    
    await sendMessageWithDelay(chatId, `${await cleanOwnerName(data.ownerInfo[0].value)}, добрый день!`, 0);
    await sendMessageWithDelay(chatId, `Я — ИИ (искусственный интеллект) компании Capital Mars. Мы уже дважды сдавали вашу квартиру на ${data.objectInfo[0].address}. Видим, что она снова сдается — верно? Если да, можем подключиться к сдаче вашей квартиры?`, 2000);
    
    dialogState.set(chatId, MESSAGE_TYPES.INITIAL_QUESTION);
    initializedChats.add(chatId);
}

// Обработчик ответа на начальный вопрос
async function handleInitialQuestionResponse(chatId, isPositive) {
    if (isPositive) {
        await sendMessageWithDelay(
            chatId,
            `Хорошо, спасибо за доверие. Пару моментов для актуализации информации. Стоимость квартиры ${data.objectInfo[0].price} руб (с коммуналкой, но счетчики отдельно), верно?`
        );
        dialogState.set(chatId, MESSAGE_TYPES.PRICE_CONFIRMATION);
        return;
    }
    
    await sendMessageWithDelay(chatId, 'Я вас понял, извините за беспокойство.');
    dialogState.delete(chatId);
    console.log(`[${new Date().toLocaleTimeString()}] Диалог с ${chatId} завершен (отказ на начальном этапе)`);
}

// Обработчик ответа на подтверждение цены
async function handlePriceConfirmationResponse(chatId, isPositive) {
    if (isPositive) {
        await sendMessageWithDelay(
            chatId,
            `На всякий случай проговариваю, что наша комиссия по факту заселения жильцов оплачиваемая вами ${data.objectInfo[0].commission_client}% (как и при прошлом сотрудничестве). Тогда мы запускаем в рекламу, как будут первые звонки сразу свяжемся с вами.`
        );
        dialogState.delete(chatId);
        console.log(`[${new Date().toLocaleTimeString()}] Диалог с ${chatId} успешно завершен`);
        return;
    }
    
    await sendMessageWithDelay(chatId, 'Понял вас. Подскажите, пожалуйста, какая цена актуальна на данный момент?');
}

// Обработчик неизвестного состояния диалога
async function handleUnknownStateResponse(chatId, isPositive) {
    console.log(`[${new Date().toLocaleTimeString()}] Неизвестное состояние для ${chatId}, инициализируем диалог`);
    
    if (isPositive) {
        await sendMessageWithDelay(
            chatId,
            `Хорошо, спасибо за доверие. Пару моментов для актуализации информации. Стоимость квартиры ${data.objectInfo[0].price} руб (с коммуналкой, но счетчики отдельно), верно?`
        );
        dialogState.set(chatId, MESSAGE_TYPES.PRICE_CONFIRMATION);
        return;
    }
    
    await sendMessageWithDelay(chatId, 'Я вас понял, извините за беспокойство.');
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
function isBotMessage(chatId) {
    const botChatId = `${process.env.ID_INSTANCE}@c.us`;
    return chatId === botChatId || chatId.includes(process.env.ID_INSTANCE);
}

// Валидация входящего сообщения
function validateMessage(notification) {
    if (!isIncomingMessage(notification)) {
        return { valid: false };
    }

    const messageData = notification.body.messageData;
    
    if (isOutgoingMessage(messageData)) {
        console.log(`[${new Date().toLocaleTimeString()}] Пропуск исходящего сообщения от бота`);
        return { valid: false };
    }

    const responseText = extractMessageText(messageData);
    if (!responseText) {
        console.log(`[${new Date().toLocaleTimeString()}] Получено сообщение без текста (возможно, медиа)`);
        return { valid: false };
    }

    const chatId = extractChatId(notification);
    if (!chatId) {
        console.error(`[${new Date().toLocaleTimeString()}] Не удалось определить chatId`);
        return { valid: false };
    }

    if (isBotMessage(chatId)) {
        console.log(`[${new Date().toLocaleTimeString()}] Пропуск сообщения от самого бота`);
        return { valid: false };
    }

    return { valid: true, chatId, responseText };
}

// Маршрутизатор обработки диалога
const dialogHandlers = {
    [MESSAGE_TYPES.INITIAL_QUESTION]: handleInitialQuestionResponse,
    [MESSAGE_TYPES.PRICE_CONFIRMATION]: handlePriceConfirmationResponse
};

// Маршрутизатор обработки диалога
async function routeDialogResponse(chatId, isPositive) {
    const messageType = dialogState.get(chatId);
    const handler = dialogHandlers[messageType] || handleUnknownStateResponse;
    await handler(chatId, isPositive);
}

// Функция обработки входящего сообщения
async function handleIncomingMessage(notification) {
    try {
        const validation = validateMessage(notification);
        if (!validation.valid) return;

        const { chatId, responseText } = validation;
        console.log(`[${new Date().toLocaleTimeString()}] Получено сообщение от ${chatId}: ${responseText}`);

        if (!dialogState.has(chatId) && !initializedChats.has(chatId)) {
            await initializeDialog(chatId);
            return;
        }

        // Проверяем, есть ли Vector Store для обработки возражений
        if (process.env.VECTOR_STORE_ID) {
            // Пытаемся обработать сообщение как возражение через RAG
            const objectionResponse = await processMessage(responseText, process.env.VECTOR_STORE_ID);
            
            if (objectionResponse) {
                // Если это возражение и мы получили ответ из базы знаний
                console.log(`[${new Date().toLocaleTimeString()}] 🎯 Обработано возражение через RAG`);
                await sendMessageWithDelay(chatId, objectionResponse);
                
                // Продолжаем основной диалог после ответа на возражение
                // Не меняем состояние, просто отправляем информацию
                return;
            }
        }

        const openai = bot.getOpenAI();
        const isPositive = await analyzeResponse(responseText, openai);
        
        if (isPositive === null) {
            console.log(`[${new Date().toLocaleTimeString()}] Нейтральное сообщение проигнорировано, ожидаем содержательный ответ`);
            return;
        }
        
        console.log(`[${new Date().toLocaleTimeString()}] Анализ ответа: ${isPositive ? 'положительный' : 'отрицательный'}`);
        await routeDialogResponse(chatId, isPositive);
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

// Основной цикл обработки сообщений
while (true) {
    try {
        const notification = await client.receiveNotification(30);
        
        if (notification) {
            await handleIncomingMessage(notification);
            await client.deleteNotification(notification.receiptId);
        }
    } catch (error) {
        await delay(5000);
    }
}
