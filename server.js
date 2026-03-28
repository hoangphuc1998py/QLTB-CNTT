const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

const dbPath = path.join(__dirname, 'devices.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      image TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(__dirname));

app.get('/api/devices', (req, res) => {
  const search = (req.query.search || '').trim();
  const sql = search
    ? `SELECT * FROM devices WHERE lower(name) LIKE lower(?) OR lower(type) LIKE lower(?) ORDER BY id DESC`
    : `SELECT * FROM devices ORDER BY id DESC`;

  const params = search ? [`%${search}%`, `%${search}%`] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Không thể lấy dữ liệu thiết bị.' });
    res.json(rows);
  });
});

app.post('/api/devices', (req, res) => {
  const { name, type, status, image = '' } = req.body;
  const cleanName = (name || '').trim();
  const cleanType = (type || '').trim();
  const cleanStatus = (status || '').trim();

  if (!cleanName || !cleanType || !cleanStatus) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên, loại và tình trạng.' });
  }

  const sql = `INSERT INTO devices(name, type, status, image) VALUES(?, ?, ?, ?)`;
  db.run(sql, [cleanName, cleanType, cleanStatus, image], function onInsert(err) {
    if (err) return res.status(500).json({ error: 'Không thể thêm thiết bị.' });

    db.get(`SELECT * FROM devices WHERE id = ?`, [this.lastID], (getErr, row) => {
      if (getErr) return res.status(500).json({ error: 'Đã thêm nhưng không thể đọc lại dữ liệu.' });
      res.status(201).json(row);
    });
  });
});

app.put('/api/devices/:id', (req, res) => {
  const id = Number(req.params.id);
  const { name, type, status, image } = req.body;
  const cleanName = (name || '').trim();
  const cleanType = (type || '').trim();
  const cleanStatus = (status || '').trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID thiết bị không hợp lệ.' });
  }

  if (!cleanName || !cleanType || !cleanStatus) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên, loại và tình trạng.' });
  }

  const sql = image !== undefined
    ? `UPDATE devices SET name = ?, type = ?, status = ?, image = ? WHERE id = ?`
    : `UPDATE devices SET name = ?, type = ?, status = ? WHERE id = ?`;

  const params = image !== undefined
    ? [cleanName, cleanType, cleanStatus, image, id]
    : [cleanName, cleanType, cleanStatus, id];

  db.run(sql, params, function onUpdate(err) {
    if (err) return res.status(500).json({ error: 'Không thể cập nhật thiết bị.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy thiết bị.' });

    db.get(`SELECT * FROM devices WHERE id = ?`, [id], (getErr, row) => {
      if (getErr) return res.status(500).json({ error: 'Đã cập nhật nhưng không thể đọc lại dữ liệu.' });
      res.json(row);
    });
  });
});

app.delete('/api/devices/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID thiết bị không hợp lệ.' });
  }

  db.run(`DELETE FROM devices WHERE id = ?`, [id], function onDelete(err) {
    if (err) return res.status(500).json({ error: 'Không thể xóa thiết bị.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy thiết bị.' });
    res.status(204).send();
  });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});