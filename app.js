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
    cookie: { secure: false }
}));

// Middleware ตรวจสอบการ Login
const isAdmin = (req, res, next) => {
    if (!req.session.user_id) return res.redirect('/login');
    next();
};

// --- Authentication ---
app.get('/', isAdmin, (req, res) => {
    res.render('index', { user_name: req.session.user_name });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    const { full_name, username, password } = req.body;
    try {
        const [result] = await db.query('INSERT INTO users (full_name, username, password) VALUES (?, ?, ?)', [full_name, username, password]);
        // สร้างแปลงเริ่มต้นให้ผู้ใช้ใหม่ทันที
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', [result.insertId, 'แปลงเริ่มต้น', 'ทั่วไป']);
        res.send('สมัครสำเร็จ! <a href="/login">ไปที่หน้า Login</a>');
    } catch (err) { 
        console.error(err);
        res.status(500).send("เกิดข้อผิดพลาด: อาจมีชื่อผู้ใช้นี้แล้ว หรือยังไม่ได้สร้างตาราง"); 
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

// --- API สำหรับจัดการแปลงเกษตร (ตาราง plots) ---

// 1. ดึงรายชื่อแปลงทั้งหมดของคนที่ Login อยู่
app.get('/api/plots', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM plots WHERE user_id = ?', [req.session.user_id]);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json([]);
    }
});

// 2. เพิ่มแปลงใหม่
app.post('/api/plots', isAdmin, async (req, res) => {
    const { plot_name, crop_type } = req.body;
    try {
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', 
        [req.session.user_id, plot_name, crop_type || 'ทั่วไป']);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
});

// 3. ลบแปลง
app.delete('/api/plots/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM plots WHERE plot_id = ? AND user_id = ?', [req.params.id, req.session.user_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false });
    }
});

// --- API สำหรับข้อมูลแมลงและประวัติการใช้งาน ---

app.get('/api/pests', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM pest WHERE pest_name LIKE ?', [`%${req.query.name || ''}%`]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.get('/api/usage-history', isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT h.*, p.plot_name, pst.pest_name 
            FROM usage_history h
            LEFT JOIN plots p ON h.plot_id = p.plot_id
            LEFT JOIN pest pst ON h.pest_id = pst.pest_id
            WHERE h.user_id = ?
            ORDER BY h.usage_date DESC
        `;
        const [rows] = await db.query(query, [req.session.user_id]);
        res.json(rows);
    } catch (err) {
        res.status(500).json([]);
    }
});

// --- ส่วนสำคัญสำหรับการรันบน Render ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});