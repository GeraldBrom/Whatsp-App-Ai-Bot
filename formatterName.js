// Функция очистки имени владельца от лишних символов и сокращений
export async function cleanOwnerName(rawName, openaiClient) {
    if (!rawName || typeof rawName !== 'string') {
        return rawName;
    }
    
    try {
        const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `
                    Ты - помощник для очистки имен от лишних символов и сокращений.
                    
                    Твоя задача - извлечь только чистое имя человека, убрав все лишнее:
                    - Сокращения (соб, др., собст., собственник, владелец и т.п.)
                    - Фразы приветствия (добрый день, здравствуйте, привет и т.п.)
                    - Знаки препинания и специальные символы (кроме дефиса в составных именах)
                    - Лишние пробелы
                    - Цифры (если они не часть имени)
                    - Скобки и их содержимое
                    
                    Примеры:
                    "Анна соб" → "Анна"
                    "Анна соб, добрый день!" → "Анна"
                    "Иван др." → "Иван"
                    "Мария 123" → "Мария"
                    "Петр (соб)" → "Петр"
                    "Елена собственник" → "Елена"
                    "Ольга, добрый день!" → "Ольга"
                    
                    Верни ТОЛЬКО очищенное имя, без дополнительных пояснений.
                    Если имя состоит из нескольких слов (имя и фамилия), сохраняй оба.`
                },
                {
                    role: "user",
                    content: `Очисти следующее имя от лишних символов и сокращений:\n\n"${rawName}"`
                }
            ],
            temperature: 0.1,
            max_tokens: 50
        });

        const cleanedName = completion.choices[0]?.message.content?.trim();
        console.log(`[${new Date().toLocaleTimeString()}] Имя очищено: "${rawName}" → "${cleanedName}"`);
        return cleanedName || rawName;
    } catch (error) {
        console.error('Ошибка при очистке имени владельца:', error);
        return rawName; // Возвращаем исходное имя в случае ошибки
    }
}

