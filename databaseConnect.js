import 'dotenv/config';
import mysql from 'mysql2/promise';

async function databaseConnect(objectId = 508437) {
    try {
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

        const combineData = {
            objectInfo: objectInfoRows,
            ownerInfo: ownerInfoRows,
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

export default databaseConnect;