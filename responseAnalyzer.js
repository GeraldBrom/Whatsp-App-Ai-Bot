// Анализ ответа клиента на положительный/отрицательный/нейтральный
export async function analyzeResponse(responseText, openaiClient) {
    try {
        const completion = await openaiClient.chat.completions.create({
            model: "gpt-4o",
            messages: [
                {
                    role: "system",
                    content: `Ты - помощник для анализа ответов клиентов. 

                    Твоя задача - определить, является ли ответ клиента положительным (согласие, подтверждение) или отрицательным (отказ, несогласие).

                    ВАЖНО:
                    - Приветствия (привет, добрый день, здравствуйте и т.д.) НЕ являются ни положительными, ни отрицательными ответами - это НЕЙТРАЛЬНО
                    - Слова благодарности (спасибо, благодарю) - это НЕЙТРАЛЬНО
                    - Короткие фразы без явного смысла (хорошо, ок, понял) без контекста вопроса - это НЕЙТРАЛЬНО

                    ПОЛОЖИТЕЛЬНЫЕ ответы: да, согласен, верно, правильно, подтверждаю, так и есть, именно так, конечно, безусловно, ага, угу, +, приступай, давай, поехали
                    ОТРИЦАТЕЛЬНЫЕ ответы: нет, не согласен, неверно, неправильно, не так, не подтверждаю, отказываюсь, отказ, не нужно, не надо, -, не сдаю

                    Отвечай ТОЛЬКО одним словом:
                    - 'true' если ответ ПОЛОЖИТЕЛЬНЫЙ
                    - 'false' если ответ ОТРИЦАТЕЛЬНЫЙ  
                    - 'neutral' если это приветствие, благодарность или нейтральная фраза

                    Не добавляй никаких пояснений или дополнительного текста.`
                },
                {
                    role: "user",
                    content: `Проанализируй следующий ответ клиента и определи, положительный он, отрицательный или нейтральный:\n\n"${responseText}"`
                }
            ],
            temperature: 0.2,
            max_tokens: 10
        });

        const result = completion.choices[0]?.message.content?.trim().toLowerCase();
        
        if (result === 'neutral' || result?.includes('neutral') || result?.includes('нейтрал')) {
            return null;
        }
        
        if (result === 'true' || result === 'false') {
            return result === 'true';
        }
        
        const hasTrue = result?.includes('true') || result?.includes('да') || result?.includes('положительный');
        const hasFalse = result?.includes('false') || result?.includes('нет') || result?.includes('отрицательный');
        
        if (hasTrue && !hasFalse) return true;
        if (hasFalse && !hasTrue) return false;
        
        // По умолчанию считаем нейтральным, если непонятно
        return null;
    } catch (error) {
        console.error('Ошибка при анализе ответа через GPT:', error);
        return null;
    }
}

