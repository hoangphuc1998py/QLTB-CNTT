const express = require('express');
const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '192.168.10.41';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const DEFAULT_USER_USERNAME = process.env.DEFAULT_USER_USERNAME || 'user';
const DEFAULT_USER_PASSWORD = process.env.DEFAULT_USER_PASSWORD || 'user123';
const SESSION_COOKIE_NAME = 'admin_session';
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const dbPath = path.join(__dirname, 'devices.db');
const db = new sqlite3.Database(dbPath);

const sessions = new Map();

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      user TEXT DEFAULT '',
      content TEXT DEFAULT '',
      image TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.all(`PRAGMA table_info(devices)`, (err, columns) => {
    if (err) return;
    const existingColumns = new Set(columns.map((column) => column.name));

    if (!existingColumns.has('quantity')) db.run(`ALTER TABLE devices ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1`);
    if (!existingColumns.has('user')) db.run(`ALTER TABLE devices ADD COLUMN user TEXT DEFAULT ''`);
    if (!existingColumns.has('content')) db.run(`ALTER TABLE devices ADD COLUMN content TEXT DEFAULT ''`);
    if (!existingColumns.has('image')) db.run(`ALTER TABLE devices ADD COLUMN image TEXT DEFAULT ''`);
  });

  db.run(`
    CREATE TABLE IF NOT EXISTS device_change_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id INTEGER NOT NULL,
      old_data TEXT NOT NULL,
      new_data TEXT NOT NULL,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE CASCADE
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS approved_quotes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      quote_code TEXT NOT NULL,
      note TEXT DEFAULT '',
      scan_name TEXT NOT NULL,
      scan_file TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS app_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(
    `INSERT OR IGNORE INTO app_users(username, password, role, created_at)
     VALUES (?, ?, 'admin', datetime('now', 'localtime'))`,
    [ADMIN_USERNAME, ADMIN_PASSWORD],
  );

  db.run(
    `INSERT OR IGNORE INTO app_users(username, password, role, created_at)
     VALUES (?, ?, 'user', datetime('now', 'localtime'))`,
    [DEFAULT_USER_USERNAME, DEFAULT_USER_PASSWORD],
  );
});

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(express.static(__dirname, { index: false }));

app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

function parseCookies(req) {
  const cookieHeader = req.headers.cookie || '';
  return cookieHeader.split(';').reduce((acc, item) => {
    const [rawKey, ...rawValue] = item.trim().split('=');
    if (!rawKey) return acc;
    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return cookies[SESSION_COOKIE_NAME] || '';
}

function getSession(token) {
  if (!token || !sessions.has(token)) return null;

  const session = sessions.get(token);
  if (Date.now() - session.lastActivityAt > SESSION_IDLE_TIMEOUT_MS) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function touchSession(token) {
  const session = sessions.get(token);
  if (!session) return;
  session.lastActivityAt = Date.now();
  sessions.set(token, session);
}

function requireAuth(req, res, next) {
  const token = getSessionToken(req);
  const session = getSession(token);

  if (!session) {
    return res.status(401).json({ error: 'Bạn cần đăng nhập.' });
  }

  touchSession(token);
  req.session = session;
  return next();
}

function requireAdmin(req, res, next) {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Bạn không có quyền thực hiện thao tác xóa.' });
  }
  return next();
}

app.post('/api/admin/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();

  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tài khoản và mật khẩu.' });
  }

  db.get(
    `SELECT id, username, password, role FROM app_users WHERE username = ? LIMIT 1`,
    [username],
    (err, userRow) => {
      if (err) return res.status(500).json({ error: 'Không thể xử lý đăng nhập.' });
      if (!userRow || userRow.password !== password) {
        return res.status(401).json({ error: 'Sai tài khoản hoặc mật khẩu.' });
      }

      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, {
        userId: userRow.id,
        username: userRow.username,
        role: userRow.role,
        lastActivityAt: Date.now(),
      });

      res.setHeader(
        'Set-Cookie',
        `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=300`,
      );

      return res.json({ authenticated: true, userId: userRow.id, username: userRow.username, role: userRow.role });
    },
  );
});

app.get('/api/admin/session', (req, res) => {
  const token = getSessionToken(req);
  const session = getSession(token);

  if (!session) {
    return res.json({ authenticated: false });
  }

  touchSession(token);
  return res.json({
    authenticated: true,
    userId: session.userId,
    username: session.username,
    role: session.role,
  });
});

app.post('/api/admin/logout', (req, res) => {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);

  res.setHeader('Set-Cookie', `${SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
  res.status(204).send();
});

app.get('/api/devices', requireAuth, (req, res) => {
  const search = (req.query.search || '').trim();
  const sql = search
    ? `SELECT * FROM devices WHERE lower(name) LIKE lower(?) OR lower(type) LIKE lower(?) ORDER BY id DESC`
    : `SELECT * FROM devices ORDER BY id DESC`;

  const params = search ? [`%${search}%`, `%${search}%`] : [];

  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Không thể lấy dữ liệu thiết bị.' });
    return res.json(rows);
  });
});

app.get('/api/device-change-history', requireAuth, (req, res) => {
  const sql = `
    SELECT id, device_id, old_data, new_data, changed_at
    FROM device_change_history
    ORDER BY id DESC
    LIMIT 100
  `;

  db.all(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Không thể lấy lịch sử thay đổi thiết bị.' });
    return res.json(rows);
  });
});

app.delete('/api/device-change-history', requireAuth, requireAdmin, (req, res) => {
  db.run(`DELETE FROM device_change_history`, function onClearHistory(err) {
    if (err) return res.status(500).json({ error: 'Không thể xóa lịch sử thay đổi thiết bị.' });
    return res.json({ deletedCount: this.changes || 0 });
  });
});

app.post('/api/device-change-history/:id/restore', requireAuth, requireAdmin, (req, res) => {
  const historyId = Number(req.params.id);

  if (!Number.isInteger(historyId) || historyId <= 0) {
    return res.status(400).json({ error: 'ID lịch sử không hợp lệ.' });
  }

  db.get('SELECT * FROM device_change_history WHERE id = ?', [historyId], (findErr, historyRow) => {
    if (findErr) return res.status(500).json({ error: 'Không thể đọc lịch sử thay đổi.' });
    if (!historyRow) return res.status(404).json({ error: 'Không tìm thấy bản ghi lịch sử.' });

    let oldSnapshot = null;
    let newSnapshot = null;

    try {
      oldSnapshot = JSON.parse(historyRow.old_data);
      newSnapshot = JSON.parse(historyRow.new_data);
    } catch (parseErr) {
      return res.status(400).json({ error: 'Dữ liệu lịch sử không hợp lệ để khôi phục.' });
    }

    if (!newSnapshot || !newSnapshot.deleted || !oldSnapshot) {
      return res.status(400).json({ error: 'Bản ghi này không phải thao tác xóa để khôi phục.' });
    }

    const targetId = Number(oldSnapshot.id || historyRow.device_id);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Thiết bị gốc không hợp lệ.' });
    }

    db.get('SELECT id FROM devices WHERE id = ?', [targetId], (deviceErr, existingDevice) => {
      if (deviceErr) return res.status(500).json({ error: 'Không thể kiểm tra trạng thái thiết bị.' });
      if (existingDevice) return res.status(400).json({ error: 'Thiết bị đã tồn tại, không cần khôi phục.' });

      const restored = {
        id: targetId,
        name: String(oldSnapshot.name || '').trim(),
        type: String(oldSnapshot.type || '').trim(),
        status: String(oldSnapshot.status || '').trim(),
        quantity: Number.parseInt(oldSnapshot.quantity, 10) || 1,
        user: String(oldSnapshot.user || '').trim(),
        content: String(oldSnapshot.content || '').trim(),
        image: String(oldSnapshot.image || ''),
        created_at: oldSnapshot.created_at || null,
      };

      if (!restored.name || !restored.type || !restored.status) {
        return res.status(400).json({ error: 'Dữ liệu thiết bị gốc thiếu thông tin bắt buộc.' });
      }

      const insertSql = restored.created_at
        ? `INSERT INTO devices(id, name, type, status, quantity, user, content, image, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : `INSERT INTO devices(id, name, type, status, quantity, user, content, image, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`;

      const params = restored.created_at
        ? [restored.id, restored.name, restored.type, restored.status, restored.quantity, restored.user, restored.content, restored.image, restored.created_at]
        : [restored.id, restored.name, restored.type, restored.status, restored.quantity, restored.user, restored.content, restored.image];

      db.run(insertSql, params, (insertErr) => {
        if (insertErr) return res.status(500).json({ error: 'Không thể khôi phục thiết bị đã xóa.' });

        db.get('SELECT * FROM devices WHERE id = ?', [targetId], (getErr, restoredRow) => {
          if (getErr) return res.status(500).json({ error: 'Đã khôi phục nhưng không thể đọc lại thiết bị.' });

          db.run(
            `INSERT INTO device_change_history(device_id, old_data, new_data, changed_at) VALUES (?, ?, ?, datetime('now', 'localtime'))`,
            [targetId, JSON.stringify(newSnapshot), JSON.stringify({ ...restoredRow, restored: true })],
            (historyErr) => {
              if (historyErr) {
                return res.status(500).json({ error: 'Đã khôi phục nhưng không thể lưu lịch sử khôi phục.' });
              }

              const updatedDeletedSnapshot = { ...newSnapshot, deleted: false, restored: true };
              db.run(
                `UPDATE device_change_history SET new_data = ? WHERE id = ?`,
                [JSON.stringify(updatedDeletedSnapshot), historyId],
                (updateErr) => {
                  if (updateErr) {
                    return res.status(500).json({ error: 'Đã khôi phục nhưng không thể cập nhật trạng thái lịch sử.' });
                  }
                  return res.json(restoredRow);
                },
              );
            },
          );
        });
      });
    });
  });
});

app.get('/api/approved-quotes', requireAuth, (req, res) => {
  db.all(
    `SELECT id, quote_code, note, scan_name, scan_file, created_at
     FROM approved_quotes
     ORDER BY id DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Không thể tải danh sách báo giá đã duyệt.' });
      return res.json(rows);
    },
  );
});

app.post('/api/approved-quotes', requireAuth, (req, res) => {
  const quoteCode = String(req.body.quoteCode || '').trim();
  const note = String(req.body.note || '').trim();
  const scanName = String(req.body.scanName || '').trim();
  const scanFile = String(req.body.scanFile || '').trim();

  if (!quoteCode || !scanName || !scanFile) {
    return res.status(400).json({ error: 'Vui lòng nhập mã báo giá và chọn file scan.' });
  }

  db.run(
    `INSERT INTO approved_quotes(quote_code, note, scan_name, scan_file, created_at)
     VALUES(?, ?, ?, ?, datetime('now', 'localtime'))`,
    [quoteCode, note, scanName, scanFile],
    function onInsert(err) {
      if (err) return res.status(500).json({ error: 'Không thể lưu báo giá đã duyệt.' });
      db.get(`SELECT * FROM approved_quotes WHERE id = ?`, [this.lastID], (getErr, row) => {
        if (getErr) return res.status(500).json({ error: 'Đã lưu nhưng không thể đọc lại dữ liệu.' });
        return res.status(201).json(row);
      });
    },
  );
});

app.delete('/api/approved-quotes/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID báo giá không hợp lệ.' });
  }

  db.run(`DELETE FROM approved_quotes WHERE id = ?`, [id], function onDelete(err) {
    if (err) return res.status(500).json({ error: 'Không thể xóa báo giá đã duyệt.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy báo giá đã duyệt.' });
    return res.status(204).send();
  });
});

app.post('/api/devices', requireAuth, (req, res) => {
  const { name, type, status, quantity = 1, user = '', content = '', image = '' } = req.body;
  const cleanName = (name || '').trim();
  const cleanType = (type || '').trim();
  const cleanStatus = (status || '').trim();
  const cleanQuantity = Number.parseInt(quantity, 10);
  const cleanUser = (user || '').trim();
  const cleanContent = (content || '').trim();

  if (!cleanName || !cleanType || !cleanStatus) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên, loại và tình trạng.' });
  }

  if (!Number.isInteger(cleanQuantity) || cleanQuantity <= 0) {
    return res.status(400).json({ error: 'Số lượng thiết bị phải là số nguyên lớn hơn 0.' });
  }

  const sql = `INSERT INTO devices(name, type, status, quantity, user, content, image, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))`;
  db.run(sql, [cleanName, cleanType, cleanStatus, cleanQuantity, cleanUser, cleanContent, image], function onInsert(err) {
    if (err) return res.status(500).json({ error: 'Không thể thêm thiết bị.' });

    db.get(`SELECT * FROM devices WHERE id = ?`, [this.lastID], (getErr, row) => {
      if (getErr) return res.status(500).json({ error: 'Đã thêm nhưng không thể đọc lại dữ liệu.' });
      return res.status(201).json(row);
    });
  });
});

app.put('/api/devices/:id', requireAuth, (req, res) => {
  const id = Number(req.params.id);
  const { name, type, status, quantity = 1, user = '', content = '', image } = req.body;
  const cleanName = (name || '').trim();
  const cleanType = (type || '').trim();
  const cleanStatus = (status || '').trim();
  const cleanQuantity = Number.parseInt(quantity, 10);
  const cleanUser = (user || '').trim();
  const cleanContent = (content || '').trim();

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID thiết bị không hợp lệ.' });
  }

  if (!cleanName || !cleanType || !cleanStatus) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên, loại và tình trạng.' });
  }

  if (!Number.isInteger(cleanQuantity) || cleanQuantity <= 0) {
    return res.status(400).json({ error: 'Số lượng thiết bị phải là số nguyên lớn hơn 0.' });
  }

  db.get(`SELECT * FROM devices WHERE id = ?`, [id], (findErr, oldRow) => {
    if (findErr) return res.status(500).json({ error: 'Không thể lấy thông tin thiết bị hiện tại.' });
    if (!oldRow) return res.status(404).json({ error: 'Không tìm thấy thiết bị.' });

    const sql = image !== undefined
      ? `UPDATE devices SET name = ?, type = ?, status = ?, quantity = ?, user = ?, content = ?, image = ? WHERE id = ?`
      : `UPDATE devices SET name = ?, type = ?, status = ?, quantity = ?, user = ?, content = ? WHERE id = ?`;

    const params = image !== undefined
      ? [cleanName, cleanType, cleanStatus, cleanQuantity, cleanUser, cleanContent, image, id]
      : [cleanName, cleanType, cleanStatus, cleanQuantity, cleanUser, cleanContent, id];

    db.run(sql, params, function onUpdate(err) {
      if (err) return res.status(500).json({ error: 'Không thể cập nhật thiết bị.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy thiết bị.' });

      db.get(`SELECT * FROM devices WHERE id = ?`, [id], (getErr, newRow) => {
        if (getErr) return res.status(500).json({ error: 'Đã cập nhật nhưng không thể đọc lại dữ liệu.' });

        db.run(
          `INSERT INTO device_change_history(device_id, old_data, new_data, changed_at) VALUES (?, ?, ?, datetime('now', 'localtime'))`,
          [id, JSON.stringify(oldRow), JSON.stringify(newRow)],
          (historyErr) => {
            if (historyErr) {
              return res.status(500).json({ error: 'Đã cập nhật nhưng không thể lưu lịch sử thay đổi.' });
            }
            return res.json(newRow);
          },
        );
      });
    });
  });
});

app.delete('/api/devices/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID thiết bị không hợp lệ.' });
  }

  db.get(`SELECT * FROM devices WHERE id = ?`, [id], (findErr, oldRow) => {
    if (findErr) return res.status(500).json({ error: 'Không thể lấy thông tin thiết bị hiện tại.' });
    if (!oldRow) return res.status(404).json({ error: 'Không tìm thấy thiết bị.' });

    db.run(`DELETE FROM devices WHERE id = ?`, [id], function onDelete(err) {
      if (err) return res.status(500).json({ error: 'Không thể xóa thiết bị.' });
      if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy thiết bị.' });

      const deletedSnapshot = { ...oldRow, deleted: true };
      db.run(
        `INSERT INTO device_change_history(device_id, old_data, new_data, changed_at) VALUES (?, ?, ?, datetime('now', 'localtime'))`,
        [id, JSON.stringify(oldRow), JSON.stringify(deletedSnapshot)],
        (historyErr) => {
          if (historyErr) {
            return res.status(500).json({ error: 'Đã xóa nhưng không thể lưu lịch sử thay đổi.' });
          }
          return res.status(204).send();
        },
      );
    });
  });
});

app.get('/api/users', requireAuth, requireAdmin, (req, res) => {
  db.all(
    `SELECT id, username, role, created_at
     FROM app_users
     ORDER BY id DESC`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Không thể tải danh sách người dùng.' });
      return res.json(rows);
    },
  );
});

app.post('/api/users', requireAuth, requireAdmin, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '').trim();
  const role = String(req.body.role || 'user').trim() === 'admin' ? 'admin' : 'user';

  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập tài khoản và mật khẩu.' });
  }

  db.run(
    `INSERT INTO app_users(username, password, role, created_at)
     VALUES (?, ?, ?, datetime('now', 'localtime'))`,
    [username, password, role],
    function onInsert(err) {
      if (err) {
        if (String(err.message || '').includes('UNIQUE constraint failed')) {
          return res.status(400).json({ error: 'Tên đăng nhập đã tồn tại.' });
        }
        return res.status(500).json({ error: 'Không thể tạo người dùng.' });
      }

      db.get(`SELECT id, username, role, created_at FROM app_users WHERE id = ?`, [this.lastID], (getErr, row) => {
        if (getErr) return res.status(500).json({ error: 'Đã tạo nhưng không thể đọc lại dữ liệu.' });
        return res.status(201).json(row);
      });
    },
  );
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID người dùng không hợp lệ.' });
  }

  if (id === req.session.userId) {
    return res.status(400).json({ error: 'Không thể tự xóa chính tài khoản đang đăng nhập.' });
  }

  db.run(`DELETE FROM app_users WHERE id = ?`, [id], function onDelete(err) {
    if (err) return res.status(500).json({ error: 'Không thể xóa người dùng.' });
    if (this.changes === 0) return res.status(404).json({ error: 'Không tìm thấy người dùng.' });
    return res.status(204).send();
  });
});


app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '192.168.10.41', () => {
  console.log(`Server running on http://192.168.10.41:${PORT}`);
});