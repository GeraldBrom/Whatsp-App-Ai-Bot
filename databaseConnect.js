import 'dotenv/config';
import mysql from 'mysql2/promise';

async function databaseConnect(objectId = 508437) {
    try {
        const objectNumbers = {
            1: "один",
            2: "два",
            3: "три",
            4: "четыре",
            5: "пять",
            6: "шесть",
            7: "семь",
            8: "восемь",
            9: "девять",
            10: "десять",
            11: "одиннадцать",
            12: "двенадцать",
            13: "тринадцать",
            14: "четырнадцать",
            15: "пятнадцать",
            16: "шестнадцать",
            17: "семнадцать",
            18: "восемнадцать",
            19: "девятнадцать",
            20: "двадцать"
        }

        const monthsArray = [
            "Январе", "Феврале", "Марте", "Апреле", "Мае", "Июне",
            "Июле", "Августе", "Сентябре", "Октябре", "Ноябре", "Декабре"
        ];
        
        // Создаем соединение с базой данных
        const connection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            database: process.env.DB_DATABASE,
            user: process.env.DB_USERNAME,
            password: process.env.DB_PASSWORD,
        })

        // Вычленяем данные из таблицы object_owner_info, где object_id = переданный параметр
        const [ownerInfoRows] = await connection.execute('SELECT value FROM object_owner_info where object_id = ?', [objectId]);
        
        // Вычленяем данные из таблицы objects, где id = переданный параметр
        const [objectInfoRows] = await connection.execute('SELECT id,address,price,commission_client FROM objects where id = ?', [objectId]);

        //Количество работы с объектом
        const [objectCount] = await connection.execute('SELECT COUNT(*) as kol FROM deals WHERE object_id = ?', [objectId]);

        // Дата времени последней рекламы
        const [objectAdd] = await connection.execute('SELECT date_site FROM info_on_site WHERE object_id = ? ORDER BY date_site DESC LIMIT 1', [objectId]);

        const count = objectCount[0].kol;
        const countNumber = objectNumbers[count];

        // Форматируем дату в формат "в январе 2024 году"
        const dateObj = new Date(objectAdd[0].date_site);
        const month = dateObj.getMonth(); // 0-11
        const year = dateObj.getFullYear();
        const formattedDate = `в ${monthsArray[month]} ${year} году`;
        console.log(formattedDate);


        const combineData = {
            objectInfo: objectInfoRows,
            ownerInfo: ownerInfoRows,
            objectCount: countNumber,
            objectAdd: objectAdd,
            formattedAddDate: formattedDate,
        }

        console.log('Combined Data:', combineData);

        // Закрываем соединение
        await connection.end();
        
        return combineData;
    } catch (err) {
        console.error('Ошибка выполнения запроса: ' + err.message);
        process.exit(1);
    }
}

// databaseConnect(508437);

export default databaseConnect;