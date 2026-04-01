const changeHistoryListEl = document.getElementById('changeHistoryList');
const toastEl = document.getElementById('toast');
const logoutBtn = document.getElementById('logoutBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function sanitize(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatDate(value) {
  if (!value) return '-';

  const normalized = String(value).replace(' ', 'T');
  const d = new Date(normalized);

  if (!Number.isNaN(d.getTime())) {
    return d.toLocaleString('vi-VN');
  }

  return sanitize(String(value));
}

function formatDeviceSnapshot(rawValue) {
  if (!rawValue) return '-';

  let snapshot = rawValue;
  if (typeof rawValue === 'string') {
    try {
      snapshot = JSON.parse(rawValue);
    } catch (error) {
      return sanitize(rawValue);
    }
  }

  if (!snapshot || typeof snapshot !== 'object') return '-';
  return `
    <ul class="history-device-info">
      <li><strong>Tên:</strong> ${sanitize(snapshot.name || '-')}</li>
      <li><strong>Loại:</strong> ${sanitize(snapshot.type || '-')}</li>
      <li><strong>User:</strong> ${sanitize(snapshot.user || '-')}</li>
      <li><strong>Nội dung:</strong> ${sanitize(snapshot.content || '-')}</li>
      <li><strong>Tình trạng:</strong> ${sanitize(snapshot.status || '-')}</li>
      ${snapshot.deleted ? '<li><strong>Trạng thái:</strong> <em>Đã xóa</em></li>' : ''}
    </ul>
  `;
}

function detectActionType(item) {
  let snapshot = null;
  try {
    snapshot = typeof item.new_data === 'string' ? JSON.parse(item.new_data) : item.new_data;
  } catch (error) {
    snapshot = null;
  }

  if (snapshot?.deleted) {
    return '<span class="badge badge-broken">Đã xóa</span>';
  }

  return '<span class="badge badge-maintain">Cập nhật</span>';
}

async function checkSession() {
  const res = await fetch('/api/admin/session');
  if (!res.ok) throw new Error('Không thể kiểm tra phiên đăng nhập.');

  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = '/admin.html';
  }
}

async function fetchHistory() {
  const res = await fetch('/api/device-change-history');
  if (res.status === 401) {
    window.location.href = '/admin.html';
    return;
  }

  if (!res.ok) {
    throw new Error('Không thể tải lịch sử thay đổi thiết bị.');
  }

   const histories = await res.json();
  if (!histories.length) {
    changeHistoryListEl.innerHTML = '<tr><td colspan="5">Chưa có lịch sử thay đổi.</td></tr>';
    return;
  }

  changeHistoryListEl.innerHTML = histories
    .map((item) => `
      <tr>
        <td>#${sanitize(item.device_id)}</td>
        <td>${detectActionType(item)}</td>
        <td>${formatDeviceSnapshot(item.old_data)}</td>
        <td>${formatDeviceSnapshot(item.new_data)}</td>
        <td>${formatDate(item.changed_at)}</td>
      </tr>
    `)
    .join('');
}

clearHistoryBtn?.addEventListener('click', async () => {
  const confirmed = window.confirm('Bạn có chắc muốn xóa toàn bộ lịch sử thay đổi thiết bị?');
  if (!confirmed) return;

  const res = await fetch('/api/device-change-history', { method: 'DELETE' });
  if (res.status === 401) {
    window.location.href = '/admin.html';
    return;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.error || 'Không thể xóa lịch sử thay đổi.');
    return;
  }

  showToast('Đã xóa toàn bộ lịch sử thay đổi.');
  await fetchHistory();
});

logoutBtn.addEventListener('click', async () => {
  const res = await fetch('/api/admin/logout', { method: 'POST' });
  if (!res.ok) {
    showToast('Không thể đăng xuất. Vui lòng thử lại.');
    return;
  }

  window.location.href = '/admin.html';
});

(async () => {
  try {
    await checkSession();
    await fetchHistory();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể tải lịch sử thay đổi.');
  }
})();