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

// --- 1. Authentication (Login/Register) ---

app.get('/', isAdmin, (req, res) => {
    res.render('index', { user_name: req.session.user_name });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    const { full_name, username, password } = req.body;
    try {
        const [result] = await db.query('INSERT INTO users (full_name, username, password) VALUES (?, ?, ?)', [full_name, username, password]);
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', [result.insertId, 'แปลงเริ่มต้น', 'ทั่วไป']);
        res.send('สมัครสำเร็จ! <a href="/login">ไปที่หน้า Login</a>');
    } catch (err) { 
        console.error(err);
        res.status(500).send("เกิดข้อผิดพลาด: อาจมีชื่อผู้ใช้นี้แล้ว"); 
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
        res.status(500).send("ฐานข้อมูลมีปัญหา");
    }
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/login'); 
});

// --- 2. API จัดการแปลงเกษตร (Plots) ---

app.get('/api/plots', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM plots WHERE user_id = ?', [req.session.user_id]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

app.post('/api/plots', isAdmin, async (req, res) => {
    const { plot_name, crop_type } = req.body;
    try {
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', 
        [req.session.user_id, plot_name, crop_type || 'ทั่วไป']);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.delete('/api/plots/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM plots WHERE plot_id = ? AND user_id = ?', [req.params.id, req.session.user_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- 3. API ค้นหาแมลงและกลุ่มยา (Pests & MoA) ---

// ค้นหาชื่อแมลง (ที่พิมพ์แล้วขึ้นรายการให้เลือก)
app.get('/api/pests', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM pest WHERE pest_name LIKE ?', [`%${req.query.name || ''}%`]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// ดึงกลุ่มยา (MoA) ตามแมลงที่เลือก (ใช้แก้ปัญหา "กดปุ่มแมลงไม่ได้")
app.get('/api/moa-groups', isAdmin, async (req, res) => {
    const { pest_id } = req.query;
    try {
        const query = `
            SELECT DISTINCT g.g_id, g.g_name 
            FROM irac_moa_group g
            JOIN active_ingredient ai ON g.g_id = ai.g_id
            JOIN ingredient_pest_control ipc ON ai.c_id = ipc.c_id
            WHERE ipc.pest_id = ?`;
        const [rows] = await db.query(query, [pest_id]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// ดึงชื่อสินค้า (Brand) ตามกลุ่มยาที่เลือก
app.get('/api/products', isAdmin, async (req, res) => {
    const { g_id } = req.query;
    try {
        const query = `
            SELECT p.p_id, p.p_name 
            FROM product_trade p
            JOIN active_ingredient ai ON p.c_id = ai.c_id
            WHERE ai.g_id = ?`;
        const [rows] = await db.query(query, [g_id]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// --- 4. บันทึกและดึงประวัติการใช้งาน (History) ---

app.post('/api/usage-history', isAdmin, async (req, res) => {
    const { plot_id, pest_id, g_id, p_id, notes } = req.body;
    try {
        await db.query(
            'INSERT INTO usage_history (user_id, plot_id, pest_id, g_id, p_id, usage_date, notes) VALUES (?, ?, ?, ?, ?, NOW(), ?)',
            [req.session.user_id, plot_id, pest_id, g_id, p_id, notes]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/usage-history', isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT h.*, p.plot_name, pst.pest_name, g.g_name, pt.p_name
            FROM usage_history h
            LEFT JOIN plots p ON h.plot_id = p.plot_id
            LEFT JOIN pest pst ON h.pest_id = pst.pest_id
            LEFT JOIN irac_moa_group g ON h.g_id = g.g_id
            LEFT JOIN product_trade pt ON h.p_id = pt.p_id
            WHERE h.user_id = ?
            ORDER BY h.usage_date DESC`;
        const [rows] = await db.query(query, [req.session.user_id]);
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

// --- ตั้งค่าพอร์ตสำหรับ Render ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});