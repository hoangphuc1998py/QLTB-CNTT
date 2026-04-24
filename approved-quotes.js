const formEl = document.getElementById('approvedQuoteForm');
const listEl = document.getElementById('approvedQuoteList');
const logoutBtn = document.getElementById('logoutBtn');
const toastEl = document.getElementById('toast');
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const currentUsernameEl = document.getElementById('currentUsername');
const currentRoleEl = document.getElementById('currentRole');

let approvedQuotes = [];
let currentUser = { role: 'user', username: '' };

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
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? sanitize(value) : date.toLocaleString('vi-VN');
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) return reject(new Error('Vui lòng chọn file scan.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không thể đọc file scan.'));
    reader.readAsDataURL(file);
  });
}

async function checkSession() {
  const res = await fetch('/api/admin/session');
  if (!res.ok) throw new Error('Không thể kiểm tra phiên đăng nhập.');
  const data = await res.json();
  if (!data.authenticated) {
    window.location.href = '/admin.html';
    return;
  }

  currentUser = {
    username: data.username || '',
    role: data.role || 'user',
  };

  if (currentUsernameEl) currentUsernameEl.textContent = currentUser.username || '-';
  if (currentRoleEl) currentRoleEl.textContent = currentUser.role;
}

async function fetchApprovedQuotes() {
  const res = await fetch('/api/approved-quotes');
  if (res.status === 401) {
    window.location.href = '/admin.html';
    return;
  }

  if (!res.ok) throw new Error('Không thể tải danh sách báo giá đã duyệt.');
  approvedQuotes = await res.json();
  render();
}

function render() {
  if (!approvedQuotes.length) {
    listEl.innerHTML = '<tr class="history-empty-row"><td colspan="5">Chưa có báo giá đã duyệt.</td></tr>';
    return;
  }

  listEl.innerHTML = approvedQuotes
    .map((item) => `
      <tr>
        <td data-label="Mã báo giá">${sanitize(item.quote_code)}</td>
        <td data-label="Ghi chú">${sanitize(item.note || '-')}</td>
        <td data-label="File scan">
          <a class="btn btn-secondary" href="${sanitize(item.scan_file)}" download="${sanitize(item.scan_name)}">📥 Tải file scan</a>
        </td>
        <td data-label="Thời gian">${formatDate(item.created_at)}</td>
        <td data-label="Hành động">
          ${currentUser.role === 'admin' ? `<button class="action-btn delete-btn" data-action="delete" data-id="${item.id}">Xóa</button>` : '<span>-</span>'}
        </td>
      </tr>
    `)
    .join('');
}

function setupIdleLogout() {
  let idleTimer = null;

  const logoutForIdle = async () => {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => {});
    showToast('Phiên đăng nhập đã hết hạn do không thao tác trong 5 phút.');
    setTimeout(() => {
      window.location.href = '/admin.html';
    }, 400);
  };

  const resetIdleTimer = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(logoutForIdle, SESSION_IDLE_TIMEOUT_MS);
  };

  ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
    window.addEventListener(eventName, resetIdleTimer, { passive: true });
  });

  resetIdleTimer();
}

formEl.addEventListener('submit', async (event) => {
  event.preventDefault();

  try {
    const quoteCode = document.getElementById('quoteCode').value.trim();
    const note = document.getElementById('note').value.trim();
    const file = document.getElementById('scanFile').files[0];
    const scanFile = await fileToBase64(file);

    const res = await fetch('/api/approved-quotes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteCode,
        note,
        scanName: file?.name || '',
        scanFile,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Không thể lưu báo giá đã duyệt.');
      return;
    }

    formEl.reset();
    showToast('Đã lưu báo giá đã duyệt.');
    await fetchApprovedQuotes();
  } catch (error) {
    showToast(error.message || 'Có lỗi xảy ra khi import file scan.');
  }
});

listEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action="delete"]');
  if (!btn) return;
  if (currentUser.role !== 'admin') {
    showToast('Tài khoản user không có quyền xóa.');
    return;
  }

  const id = Number(btn.dataset.id);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!window.confirm('Bạn có chắc muốn xóa báo giá đã duyệt này?')) return;

  const res = await fetch(`/api/approved-quotes/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'Không thể xóa báo giá đã duyệt.');
    return;
  }

  showToast('Đã xóa báo giá đã duyệt.');
  await fetchApprovedQuotes();
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
    await fetchApprovedQuotes();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể tải dữ liệu báo giá đã duyệt.');
  }
})();

setupIdleLogout();