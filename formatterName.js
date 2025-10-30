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
                    content: `Ты - помощник для очистки имен от лишних символов и сокращений.
                    
                    Твоя задача - извлечь только чистое имя человека, убрав все лишнее:
                    - Сокращения (соб, др., и т.п.)
                    - Специальные символы
                    - Лишние пробелы
                    - Цифры (если они не часть имени)
                    
                    Примеры:
                    "Анна соб" → "Анна"
                    "Иван др." → "Иван"
                    "Мария 123" → "Мария"
                    "Петр (соб)" → "Петр"
                    
                    Верни ТОЛЬКО очищенное имя, без дополнительных пояснений.`
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

