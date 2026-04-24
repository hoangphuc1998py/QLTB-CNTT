const formEl = document.getElementById('fileStorageForm');
const listEl = document.getElementById('storedFileList');
const logoutBtn = document.getElementById('logoutBtn');
const toastEl = document.getElementById('toast');
const currentUsernameEl = document.getElementById('currentUsername');
const currentRoleEl = document.getElementById('currentRole');
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_UPLOAD_SIZE_MB = 300;

let storedFiles = [];
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
  return Number.isNaN(date.getTime()) ? '-' : date.toLocaleString('vi-VN');
}

function formatBytes(bytes) {
  const size = Number(bytes);
  if (!Number.isFinite(size) || size <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let idx = 0;
  let value = size;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 10 || idx === 0 ? 0 : 1)} ${units[idx]}`;
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
  currentUsernameEl.textContent = currentUser.username || '-';
  currentRoleEl.textContent = currentUser.role;
}

async function fetchStoredFiles() {
  const res = await fetch('/api/stored-files');
  if (res.status === 401) {
    window.location.href = '/admin.html';
    return;
  }
  if (!res.ok) throw new Error('Không thể tải danh sách file.');
  storedFiles = await res.json();
  render();
}

function render() {
  if (!storedFiles.length) {
    listEl.innerHTML = '<tr class="history-empty-row"><td colspan="7">Chưa có file nào trong kho.</td></tr>';
    return;
  }

  listEl.innerHTML = storedFiles
    .map((item) => {
      const deleteAction = currentUser.role === 'admin'
        ? `<button class="action-btn delete-btn" data-action="delete" data-id="${item.id}">Xóa</button>`
        : '<span>-</span>';

      return `
        <tr>
          <td data-label="Tên file">${sanitize(item.file_name)}</td>
          <td data-label="Loại file">${sanitize(item.mime_type || '-')}</td>
          <td data-label="Dung lượng">${sanitize(formatBytes(item.file_size))}</td>
          <td data-label="Ghi chú">${sanitize(item.note || '-')}</td>
          <td data-label="Người tải lên">${sanitize(item.uploaded_by || '-')}</td>
          <td data-label="Thời gian">${formatDate(item.created_at)}</td>
          <td data-label="Hành động">
            <div class="actions">
              <a class="btn btn-secondary" href="/api/stored-files/${item.id}/download">📥 Tải xuống</a>
              ${deleteAction}
            </div>
          </td>
        </tr>
      `;
    })
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
    const fileEl = document.getElementById('storageFile');
    const noteEl = document.getElementById('storageNote');
    const file = fileEl.files[0];
    if (!file) {
      showToast('Vui lòng chọn file cần lưu.');
      return;
    }

    const maxSizeBytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      showToast(`File vượt quá ${MAX_UPLOAD_SIZE_MB}MB, vui lòng chọn file nhỏ hơn.`);
      return;
    }

    const res = await fetch('/api/stored-files/upload', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/octet-stream',
        'X-File-Name': encodeURIComponent(file?.name || ''),
        'X-File-Type': encodeURIComponent(file?.type || 'application/octet-stream'),
        'X-File-Note': encodeURIComponent(noteEl.value.trim()),
      },
      body: file,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 413) {
        showToast('File quá lớn, server từ chối xử lý.');
        return;
      }
      showToast(data.error || 'Không thể lưu file.');
      return;
    }

    formEl.reset();
    showToast('Đã lưu file vào kho.');
    await fetchStoredFiles();
  } catch (error) {
    showToast(error.message || 'Có lỗi xảy ra khi lưu file.');
  }
});

listEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action="delete"]');
  if (!btn) return;

  if (currentUser.role !== 'admin') {
    showToast('Chỉ admin mới có quyền xóa file.');
    return;
  }

  const id = Number(btn.dataset.id);
  if (!Number.isInteger(id) || id <= 0) return;
  if (!window.confirm('Bạn có chắc muốn xóa file này khỏi kho lưu trữ?')) return;

  const res = await fetch(`/api/stored-files/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    showToast(data.error || 'Không thể xóa file.');
    return;
  }

  showToast('Đã xóa file.');
  await fetchStoredFiles();
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
    await fetchStoredFiles();
  } catch (error) {
    showToast(error.message || 'Không thể tải dữ liệu kho file.');
  }
})();

setupIdleLogout();