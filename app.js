const express = require('express');
const session = require('express-session');
const db = require('./db');
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
    secret: process.env.SESSION_SECRET || 'agri_secret_key_123',
    resave: false,
    saveUninitialized: true
}));

const isAdmin = (req, res, next) => {
    if (!req.session.user_id) return res.redirect('/login');
    next();
};

// --- Authentication ---
app.get('/', isAdmin, (req, res) => res.render('index', { user_name: req.session.user_name }));
app.get('/login', (req, res) => res.render('login'));
app.get('/register', (req, res) => res.render('register'));

app.post('/register', async (req, res) => {
    const { full_name, username, password } = req.body;
    try {
        const [result] = await db.query('INSERT INTO users (full_name, username, password) VALUES (?, ?, ?)', [full_name, username, password]);
        await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', [result.insertId, 'แปลงเริ่มต้น', 'ทั่วไป']);
        res.send('สมัครสำเร็จ! <a href="/login">ไปที่หน้า Login</a>');
    } catch (err) { res.status(500).send("ชื่อผู้ใช้นี้ถูกใช้งานแล้ว"); }
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const [users] = await db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
    if (users.length > 0) {
        req.session.user_id = users[0].user_id;
        req.session.user_name = users[0].full_name;
        res.redirect('/');
    } else { res.send('ข้อมูลไม่ถูกต้อง'); }
});

app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

// --- Plot Management API ---
app.get('/api/plots', isAdmin, async (req, res) => {
    const [rows] = await db.query('SELECT * FROM plots WHERE user_id = ?', [req.session.user_id]);
    res.json(rows);
});

app.post('/api/add-plot', isAdmin, async (req, res) => {
    const { plot_name } = req.body;
    await db.query('INSERT INTO plots (user_id, plot_name, crop_type) VALUES (?, ?, ?)', [req.session.user_id, plot_name, 'ไม่ระบุ']);
    res.json({ success: true });
});

app.post('/api/rename-plot', isAdmin, async (req, res) => {
    const { plot_id, new_name } = req.body;
    await db.query('UPDATE plots SET plot_name = ? WHERE plot_id = ? AND user_id = ?', [new_name, plot_id, req.session.user_id]);
    res.json({ success: true });
});

app.delete('/api/delete-plot/:plot_id', isAdmin, async (req, res) => {
    const { plot_id } = req.params;
    const user_id = req.session.user_id;
    try {
        await db.query('UPDATE usage_history SET plot_id = NULL WHERE plot_id = ? AND user_id = ?', [plot_id, user_id]);
        await db.query('DELETE FROM plots WHERE plot_id = ? AND user_id = ?', [plot_id, user_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false }); }
});

// --- History & Logic API ---
app.get('/api/last-moa/:plot_id', isAdmin, async (req, res) => {
    const [rows] = await db.query('SELECT g_id FROM usage_history WHERE plot_id = ? ORDER BY usage_date DESC LIMIT 1', [req.params.plot_id]);
    res.json(rows[0] || { g_id: null });
});

app.get('/api/pests', isAdmin, async (req, res) => {
    const [rows] = await db.query('SELECT * FROM pest WHERE pest_name LIKE ?', [`%${req.query.name}%`]);
    res.json(rows);
});

app.get('/api/moa/:pest_id', isAdmin, async (req, res) => {
    const query = `SELECT DISTINCT g.g_id, g.g_name FROM irac_moa_group g 
                   JOIN active_ingredient ai ON g.g_id = ai.g_id 
                   JOIN ingredient_pest_control ipc ON ai.c_id = ipc.c_id 
                   WHERE ipc.pest_id = ?`;
    const [rows] = await db.query(query, [req.params.pest_id]);
    res.json(rows);
});

app.get('/api/products/:pest_id/:g_id', isAdmin, async (req, res) => {
    const query = `SELECT ai.c_id, ai.c_name, pt.p_id, pt.p_name FROM active_ingredient ai
                   JOIN ingredient_pest_control ipc ON ai.c_id = ipc.c_id
                   JOIN product_trade pt ON ai.c_id = pt.c_id
                   WHERE ipc.pest_id = ? AND ai.g_id = ?`;
    const [rows] = await db.query(query, [req.params.pest_id, req.params.g_id]);
    res.json(rows);
});

app.post('/api/save-history', isAdmin, async (req, res) => {
    const { plot_id, pest_id, g_id, c_id, p_id, notes } = req.body;
    await db.query('INSERT INTO usage_history (user_id, plot_id, pest_id, g_id, c_id, p_id, usage_date, notes) VALUES (?, ?, ?, ?, ?, ?, NOW(), ?)', 
        [req.session.user_id, plot_id, pest_id, g_id, c_id, p_id, notes]);
    res.json({ success: true });
});

app.get('/api/history', isAdmin, async (req, res) => {
    const query = `SELECT h.usage_date, IFNULL(pl.plot_name, 'ยกเลิกการใช้งาน') as plot_name, 
                   p.pest_name, h.g_id, pt.p_name, h.notes FROM usage_history h
                   LEFT JOIN plots pl ON h.plot_id = pl.plot_id
                   LEFT JOIN pest p ON h.pest_id = p.pest_id
                   LEFT JOIN product_trade pt ON h.p_id = pt.p_id
                   WHERE h.user_id = ? ORDER BY h.usage_date DESC`;
    const [rows] = await db.query(query, [req.session.user_id]);
    res.json(rows);
});

app.listen(3000, () => console.log('Server running at http://localhost:3000'));