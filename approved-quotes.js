const formEl = document.getElementById('approvedQuoteForm');
const listEl = document.getElementById('approvedQuoteList');
const logoutBtn = document.getElementById('logoutBtn');
const toastEl = document.getElementById('toast');
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const currentUsernameEl = document.getElementById('currentUsername');
const currentRoleEl = document.getElementById('currentRole');
const previewModalEl = document.createElement('div');
const hoverPreviewEl = document.createElement('div');

let approvedQuotes = [];
let currentUser = { role: 'user', username: '' };
let previewItem = null;
let hoverPreviewTimer = null;

previewModalEl.className = 'file-preview-modal';
previewModalEl.hidden = true;
previewModalEl.innerHTML = `
  <div class="file-preview-card" role="dialog" aria-modal="true" aria-label="Xem trước file scan">
    <div class="file-preview-head">
      <h3>🧾 Xem trước file scan</h3>
      <button type="button" class="file-preview-close" id="previewCloseBtn" aria-label="Đóng">✕</button>
    </div>
    <p class="file-preview-meta" id="previewFileName">-</p>
    <div class="file-preview-body" id="previewBody"></div>
    <div class="file-preview-actions">
      <button type="button" class="btn btn-primary" id="previewPrintBtn">🖨️ In file</button>
      <button type="button" class="btn btn-secondary" id="previewDownloadBtn">📥 Tải xuống</button>
    </div>
  </div>
`;
document.body.appendChild(previewModalEl);

hoverPreviewEl.className = 'pdf-hover-preview';
hoverPreviewEl.hidden = true;
hoverPreviewEl.innerHTML = `
  <div class="pdf-hover-preview-head">📄 Xem nhanh PDF</div>
  <iframe id="hoverPreviewFrame" title="PDF hover preview"></iframe>
`;
document.body.appendChild(hoverPreviewEl);

const previewBodyEl = previewModalEl.querySelector('#previewBody');
const previewFileNameEl = previewModalEl.querySelector('#previewFileName');
const previewPrintBtn = previewModalEl.querySelector('#previewPrintBtn');
const previewDownloadBtn = previewModalEl.querySelector('#previewDownloadBtn');
const previewCloseBtn = previewModalEl.querySelector('#previewCloseBtn');
const hoverPreviewFrameEl = hoverPreviewEl.querySelector('#hoverPreviewFrame');


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
          <div class="scan-file-actions">
            <button class="btn btn-primary" type="button" data-action="preview" data-id="${item.id}">👁️ Xem trước</button>
            <a class="btn btn-secondary" href="${sanitize(item.scan_file)}" download="${sanitize(item.scan_name)}">📥 Tải file scan</a>
          </div>
        </td>
        <td data-label="Thời gian">${formatDate(item.created_at)}</td>
        <td data-label="Hành động">
          ${currentUser.role === 'admin' ? `<button class="action-btn delete-btn" data-action="delete" data-id="${item.id}">Xóa</button>` : '<span>-</span>'}
        </td>
      </tr>
    `)
    .join('');
}

function isPdfFile(item) {
  const fileName = String(item.scan_name || '').toLowerCase();
  const scanFile = String(item.scan_file || '').toLowerCase();
  return fileName.endsWith('.pdf') || scanFile.startsWith('data:application/pdf');
}

function closePreviewModal() {
  previewModalEl.hidden = true;
  previewBodyEl.innerHTML = '';
  previewItem = null;
}

function openPreviewModal(item) {
  previewItem = item;
  previewFileNameEl.textContent = `File: ${item.scan_name || 'scan-file'}`;

  if (isPdfFile(item)) {
    previewBodyEl.innerHTML = `<iframe src="${sanitize(item.scan_file)}" title="${sanitize(item.scan_name || 'PDF preview')}"></iframe>`;
    previewPrintBtn.hidden = false;
  } else if (String(item.scan_file || '').startsWith('data:image/')) {
    previewBodyEl.innerHTML = `<img src="${sanitize(item.scan_file)}" alt="${sanitize(item.scan_name || 'Ảnh scan')}">`;
    previewPrintBtn.hidden = false;
  } else {
    previewBodyEl.innerHTML = '<p>Không thể xem trước định dạng file này. Bạn có thể tải xuống để mở bằng ứng dụng phù hợp.</p>';
    previewPrintBtn.hidden = true;
  }

  previewModalEl.hidden = false;
}

function printPreviewFile() {
  if (!previewItem?.scan_file) return;

  const printWindow = window.open('', '_blank', 'width=1000,height=760');
  if (!printWindow) {
    showToast('Không thể mở cửa sổ in. Vui lòng kiểm tra popup blocker.');
    return;
  }

  const title = sanitize(previewItem.scan_name || 'scan-file');
  const body = isPdfFile(previewItem)
    ? `<iframe src="${sanitize(previewItem.scan_file)}" style="border:0;width:100vw;height:100vh"></iframe>`
    : `<img src="${sanitize(previewItem.scan_file)}" style="max-width:100%;max-height:100%;object-fit:contain" alt="${title}">`;

  printWindow.document.write(`
    <!doctype html>
    <html lang="vi">
      <head>
        <meta charset="UTF-8" />
        <title>${title}</title>
        <style>
          html, body { height: 100%; margin: 0; }
          body { display: grid; place-items: center; background: #fff; }
        </style>
      </head>
      <body>${body}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 350);
}

function showHoverPreview(item, anchorEl) {
  if (!isPdfFile(item)) return;

  const rect = anchorEl.getBoundingClientRect();
  const top = window.scrollY + rect.top;
  const left = window.scrollX + rect.right + 12;

  hoverPreviewFrameEl.src = item.scan_file;
  hoverPreviewEl.style.top = `${top}px`;
  hoverPreviewEl.style.left = `${left}px`;
  hoverPreviewEl.hidden = false;
}

function hideHoverPreview() {
  hoverPreviewEl.hidden = true;
  hoverPreviewFrameEl.src = 'about:blank';
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
  const previewBtn = event.target.closest('button[data-action="preview"]');
  if (previewBtn) {
    const id = Number(previewBtn.dataset.id);
    const item = approvedQuotes.find((quote) => quote.id === id);
    if (!item) return;
    openPreviewModal(item);
    return;
  }

  const btn = event.target.closest('button[data-action="delete"]');
  if (!btn) return;

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

listEl.addEventListener('mouseover', (event) => {
  const previewBtn = event.target.closest('button[data-action="preview"]');
  if (!previewBtn) return;

  const id = Number(previewBtn.dataset.id);
  const item = approvedQuotes.find((quote) => quote.id === id);
  if (!item || !isPdfFile(item)) return;

  if (hoverPreviewTimer) clearTimeout(hoverPreviewTimer);
  showHoverPreview(item, previewBtn);
});

listEl.addEventListener('mouseout', (event) => {
  const previewBtn = event.target.closest('button[data-action="preview"]');
  if (!previewBtn) return;

  if (hoverPreviewTimer) clearTimeout(hoverPreviewTimer);
  hoverPreviewTimer = setTimeout(hideHoverPreview, 100);
});

hoverPreviewEl.addEventListener('mouseenter', () => {
  if (hoverPreviewTimer) clearTimeout(hoverPreviewTimer);
});

hoverPreviewEl.addEventListener('mouseleave', () => {
  hideHoverPreview();
});

previewCloseBtn.addEventListener('click', closePreviewModal);
previewModalEl.addEventListener('click', (event) => {
  if (event.target === previewModalEl) closePreviewModal();
});
previewPrintBtn.addEventListener('click', printPreviewFile);
previewDownloadBtn.addEventListener('click', () => {
  if (!previewItem?.scan_file) return;
  const link = document.createElement('a');
  link.href = previewItem.scan_file;
  link.download = previewItem.scan_name || 'scan-file';
  link.click();
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