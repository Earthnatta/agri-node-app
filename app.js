const express = require('express');
const session = require('express-session');
const db = require('./db'); // ไฟล์ db.js ของคุณที่ต่อกับ Aiven
require('dotenv').config();

const app = express();

app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'agri_secret_key_123',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
}));

const isAdmin = (req, res, next) => {
    if (!req.session.user_id) return res.redirect('/login');
    next();
};

// ==================== 1. ระบบสมาชิก ====================
app.get('/', isAdmin, (req, res) => {
    res.render('index', { user_name: req.session.user_name });
});

app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    const { full_name, username, password } = req.body;
    try {
        const [result] = await db.query('INSERT INTO users (full_name, username, password) VALUES (?, ?, ?)', [full_name, username, password]);
        // สร้างแปลงเริ่มต้นให้ทันทีที่สมัคร
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', [result.insertId, 'แปลงเริ่มต้น', 'ทั่วไป']);
        res.send('สมัครสำเร็จ! <br><a href="/login">คลิกที่นี่เพื่อไปหน้า Login</a>');
    } catch (err) { 
        res.status(500).send("เกิดข้อผิดพลาด: ชื่อผู้ใช้นี้อาจมีในระบบแล้ว <br><a href='/register'>ลองใหม่</a>"); 
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
            res.send('ข้อมูลไม่ถูกต้อง <br><a href="/login">ลองใหม่</a>'); 
        }
    } catch (err) { res.status(500).send("ระบบฐานข้อมูลมีปัญหา"); }
});

app.get('/logout', (req, res) => { 
    req.session.destroy(); 
    res.redirect('/login'); 
});

// ==================== 2. จัดการแปลง (Plots) ====================
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

// เส้นทางแก้ไขชื่อแปลง (PUT)
app.put('/api/plots/:id', isAdmin, async (req, res) => {
    const { plot_name } = req.body;
    try {
        await db.query('UPDATE plots SET plot_name = ? WHERE plot_id = ? AND user_id = ?', 
        [plot_name, req.params.id, req.session.user_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// เส้นทางลบแปลง (DELETE)
app.delete('/api/plots/:id', isAdmin, async (req, res) => {
    try {
        await db.query('DELETE FROM plots WHERE plot_id = ? AND user_id = ?', [req.params.id, req.session.user_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// ==================== 3. แมลง และ ยา (Pests & MoA) ====================
app.get('/api/pests', isAdmin, async (req, res) => {
    try {
        const [rows] = await db.query('SELECT * FROM pest');
        res.json(rows);
    } catch (err) { res.status(500).json([]); }
});

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

// ==================== 4. ประวัติ (History) ====================
app.post('/api/usage-history', isAdmin, async (req, res) => {
    const { plot_id, pest_id, g_id, p_id, notes } = req.body;
    try {
        await db.query(
            'INSERT INTO usage_history (user_id, plot_id, pest_id, g_id, p_id, notes) VALUES (?, ?, ?, ?, ?, ?)',
            [req.session.user_id, plot_id, pest_id, g_id, p_id, notes]
        );
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

app.get('/api/usage-history', isAdmin, async (req, res) => {
    try {
        const query = `
            SELECT h.*, p.plot_name, pst.pest_name, g.g_name, pt.p_name, h.usage_date
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

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
});