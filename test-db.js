const db = require('./db');
db.query('SELECT 1 + 1 AS result').then(([rows]) => {
    console.log('เชื่อมต่อสำเร็จ! ผลลัพธ์:', rows[0].result);
    process.exit();
}).catch(err => {
    console.error('เชื่อมต่อล้มเหลว:', err);
});