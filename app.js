const express = require('express');
const session = require('express-session');
const db = require('./db');
require('dotenv').config();

const app = express();

// ตั้งค่า View Engine และโฟลเดอร์สำหรับไฟล์ Static
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ตั้งค่า Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'agri_secret_key_123',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // ตั้งเป็น true ถ้าใช้ https และมีการทำ proxy ที่เข้มงวด
}));

// Middleware ตรวจสอบการ Login
const isAdmin = (req, res, next) => {
    if (!req.session.user_id) return res.redirect('/login');
    next();
};

// --- Authentication ---
// หน้าแรก ถ้ายังไม่ Login จะถูก isAdmin ดีดไปหน้า /login
app.get('/', isAdmin, (req, res) => {
    res.render('index', { user_name: req.session.user_name });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    const { full_name, username, password } = req.body;
    try {
        // ตรวจสอบว่าตาราง users มีอยู่จริงก่อน insert
        const [result] = await db.query('INSERT INTO users (full_name, username, password) VALUES (?, ?, ?)', [full_name, username, password]);
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', [result.insertId, 'แปลงเริ่มต้น', 'ทั่วไป']);
        res.send('สมัครสำเร็จ! <a href="/login">ไปที่หน้า Login</a>');
    } catch (err) { 
        console.error(err);
        res.status(500).send("เกิดข้อผิดพลาด: อาจมีชื่อผู้ใช้นี้แล้ว หรือยังไม่ได้สร้างตารางในฐานข้อมูล"); 
    }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
        if (users.length > 0) {
            req.session.user_id = users[0].user_id;
            req.session.user_name = users[0].full_name;
            res.redirect('/');
        } else { 
            res.send('ข้อมูลไม่ถูกต้อง <a href="/login">ลองใหม่</a>'); 
        }
    } catch (err) {
        console.error(err);
        res.status(500).send("ฐานข้อมูลมีปัญหา กรุณาเช็คการตั้งค่า Aiven");
    }
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/login'); 
});

// --- API ต่างๆ ---
app.get('/api/pests', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM pest WHERE pest_name LIKE ?', [`%${req.query.name || ''}%`]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// ... (API อื่นๆ ของคุณใช้โครงสร้างเดิมได้เลยครับ) ...

// --- ส่วนสำคัญสำหรับการรันบน Render ---
// เปลี่ยนจากเลข 3000 เป็นการดึงค่าจาก Environment Variable
const PORT = process.env.PORT || 10000; // เปลี่ยนเป็น 10000 หรือใช้ค่าจากระบบ
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});