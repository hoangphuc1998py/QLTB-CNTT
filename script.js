const form = document.getElementById('deviceForm');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const exportBtn = document.getElementById('exportBtn');
const importExcelInput = document.getElementById('importExcelInput');
const paginationInfoEl = document.getElementById('paginationInfo');
const paginationControlsEl = document.getElementById('paginationControls');
const pageSizeSelectEl = document.getElementById('pageSizeSelect');
const toastEl = document.getElementById('toast');
const logoutBtn = document.getElementById('logoutBtn');
const totalCountEl = document.getElementById('totalCount');
const goodCountEl = document.getElementById('goodCount');
const maintainCountEl = document.getElementById('maintainCount');
const brokenCountEl = document.getElementById('brokenCount');
const currentUsernameEl = document.getElementById('currentUsername');
const currentRoleEl = document.getElementById('currentRole');
const userManagementSectionEl = document.getElementById('userManagementSection');
const userFormEl = document.getElementById('userForm');
const userListEl = document.getElementById('userList');

const detailModalEl = document.createElement('div');
let devices = [];
let editingId = null;
let currentUser = { username: '', role: '' };
let appUsers = [];
let currentPage = 1;
let pageSize = Number.parseInt(pageSizeSelectEl?.value, 10) || 10;

detailModalEl.className = 'device-detail-modal';
detailModalEl.hidden = true;
detailModalEl.innerHTML = `
  <div class="device-detail-card" role="dialog" aria-modal="true" aria-label="Thông tin chi tiết thiết bị">
    <div class="device-detail-head">
      <h3>📋 Thông tin chi tiết thiết bị</h3>
      <button type="button" class="device-detail-close" id="deviceDetailCloseBtn" aria-label="Đóng">✕</button>
    </div>
    <div class="device-detail-body" id="deviceDetailBody"></div>
  </div>
`;
document.body.appendChild(detailModalEl);
const closeDetailBtn = detailModalEl.querySelector('#deviceDetailCloseBtn');
const detailBodyEl = detailModalEl.querySelector('#deviceDetailBody');


function setupSideAdSliders() {
  document.querySelectorAll('[data-side-ad-slider]').forEach((slider) => {
    const slides = Array.from(slider.querySelectorAll('.side-ad-slide'));
    const dotsEl = slider.querySelector('.side-ad-dots');
    const intervalMs = Number.parseInt(slider.dataset.sliderInterval, 10) || 5000;
    let activeIndex = Math.max(0, slides.findIndex((slide) => slide.classList.contains('active')));
    let timer = null;

    if (slides.length <= 1) return;

    const dots = slides.map((_, index) => {
      const dot = document.createElement('span');
      dot.className = 'side-ad-dot';
      dot.dataset.slideIndex = String(index);
      dotsEl?.appendChild(dot);
      return dot;
    });

    const showSlide = (nextIndex) => {
      activeIndex = (nextIndex + slides.length) % slides.length;
      slides.forEach((slide, index) => slide.classList.toggle('active', index === activeIndex));
      dots.forEach((dot, index) => dot.classList.toggle('active', index === activeIndex));
    };

    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(() => showSlide(activeIndex + 1), intervalMs);
    };

    slider.querySelectorAll('[data-slider-action]').forEach((button) => {
      button.addEventListener('click', () => {
        showSlide(activeIndex + (button.dataset.sliderAction === 'prev' ? -1 : 1));
        start();
      });
    });

    dots.forEach((dot) => {
      dot.addEventListener('click', () => {
        showSlide(Number.parseInt(dot.dataset.slideIndex, 10) || 0);
        start();
      });
    });

    slider.addEventListener('mouseenter', () => { if (timer) clearInterval(timer); });
    slider.addEventListener('mouseleave', start);

    showSlide(activeIndex);
    start();
  });
}

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
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN');
}

function statusBadge(status) {
  if (status === 'Hoạt động tốt') return '<span class="badge badge-good">Hoạt động tốt</span>';
  if (status === 'Đang bảo trì') return '<span class="badge badge-maintain">Đang bảo trì</span>';
  return '<span class="badge badge-broken">Hỏng</span>';
}

function canDelete() {
  return currentUser.role === 'admin';
}

function updateCurrentUserDisplay() {
  currentUsernameEl.textContent = currentUser.username || '-';
  currentRoleEl.textContent = currentUser.role === 'admin' ? 'admin' : 'user';
}

function renderUsers() {
  if (!userListEl) return;

  if (!appUsers.length) {
    userListEl.innerHTML = '<tr><td colspan="4">Chưa có người dùng.</td></tr>';
    return;
  }

  userListEl.innerHTML = appUsers.map((user) => {
    const canManageUser = user.id !== currentUser.id;
    const roleCell = canManageUser
      ? `
        <select class="user-role-select" data-user-id="${user.id}" aria-label="Đổi quyền cho ${sanitize(user.username)}">
          <option value="user" ${user.role === 'user' ? 'selected' : ''}>User</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      `
      : `${sanitize(user.role)} <span class="current-user-tag">Bạn</span>`;

    const action = canManageUser
      ? `
        <button class="action-btn edit-btn" data-action="update-user-role" data-id="${user.id}">Lưu quyền</button>
        <button class="action-btn delete-btn" data-action="delete-user" data-id="${user.id}">Xóa</button>
      `
      : '<span>-</span>';

    return `
      <tr>
        <td>${sanitize(user.username)}</td>
        <td>${roleCell}</td>
        <td>${formatDate(user.created_at)}</td>
        <td><div class="actions">${action}</div></td>
      </tr>
    `;
  }).join('');
}

function getTotalPages() {
  return Math.max(1, Math.ceil(devices.length / pageSize));
}

function getVisiblePageNumbers(totalPages) {
  const maxVisiblePages = 5;
  const halfWindow = Math.floor(maxVisiblePages / 2);
  let start = Math.max(1, currentPage - halfWindow);
  const end = Math.min(totalPages, start + maxVisiblePages - 1);

  start = Math.max(1, end - maxVisiblePages + 1);

  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function renderPagination() {
  if (!paginationInfoEl || !paginationControlsEl) return;

  const totalItems = devices.length;
  const totalPages = getTotalPages();
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);

  if (!totalItems) {
    paginationInfoEl.textContent = 'Hiển thị 0 thiết bị';
    paginationControlsEl.innerHTML = '';
    return;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalItems);
  paginationInfoEl.textContent = `Hiển thị ${startItem}-${endItem} / ${totalItems} thiết bị`;

  const pageButtons = getVisiblePageNumbers(totalPages)
    .map((pageNumber) => `
      <button
        type="button"
        class="pagination-btn ${pageNumber === currentPage ? 'active' : ''}"
        data-page="${pageNumber}"
        aria-current="${pageNumber === currentPage ? 'page' : 'false'}"
      >${pageNumber}</button>
    `)
    .join('');

  paginationControlsEl.innerHTML = `
    <button type="button" class="pagination-btn" data-page-action="prev" ${currentPage === 1 ? 'disabled' : ''}>‹ Trước</button>
    ${pageButtons}
    <button type="button" class="pagination-btn" data-page-action="next" ${currentPage === totalPages ? 'disabled' : ''}>Sau ›</button>
  `;
}

function render() {
  updateStats();
  renderPagination();

  if (!devices.length) {
    listEl.innerHTML = `<tr class="device-empty-row"><td colspan="10">Chưa có dữ liệu thiết bị.</td></tr>`;
    return;
  }

  const pageDevices = devices.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  listEl.innerHTML = pageDevices
    .map((d, index) => {
      const image = d.image
        ? `<img src="${sanitize(d.image)}" alt="${sanitize(d.name)}" class="device-image" data-device-id="${d.id}">`
        : '<span>-</span>';

      const deleteBtn = canDelete()
        ? `<button class="action-btn delete-btn" data-action="delete" data-id="${d.id}">Xóa</button>`
        : '';

      return `
        <tr style="--row-index:${index};">
          <td data-label="Ảnh">${image}</td>
          <td data-label="Tên">${sanitize(d.name)}</td>
          <td data-label="Loại">${sanitize(d.type)}</td>
          <td data-label="Khu vực">${sanitize(d.area || '-')}</td>
          <td data-label="Số lượng">${sanitize(d.quantity ?? 1)}</td>
          <td data-label="User">${sanitize(d.user || '-')}</td>
          <td data-label="Nội dung">${sanitize(d.content || '-')}</td>
          <td data-label="Tình trạng">${statusBadge(sanitize(d.status))}</td>
          <td data-label="Ngày tạo">${formatDate(d.created_at)}</td>
          <td data-label="Hành động">
            <div class="actions">
              <button class="action-btn print-btn" data-action="print" data-id="${d.id}">🖨️</button>
              <button class="action-btn edit-btn" data-action="edit" data-id="${d.id}">Sửa</button>
              ${deleteBtn}
            </div>
          </td>
        </tr>
      `;
    })
    .join('');
}

function updateStats() {
  const goodCount = devices.filter((d) => d.status === 'Hoạt động tốt').length;
  const maintainCount = devices.filter((d) => d.status === 'Đang bảo trì').length;
  const brokenCount = devices.filter((d) => d.status === 'Hỏng').length;

  totalCountEl.textContent = String(devices.length);
  goodCountEl.textContent = String(goodCount);
  maintainCountEl.textContent = String(maintainCount);
  brokenCountEl.textContent = String(brokenCount);
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
    id: data.userId,
    username: data.username || '',
    role: data.role || 'user',
  };

  updateCurrentUserDisplay();

  if (currentUser.role === 'admin') {
    userManagementSectionEl.hidden = false;
    await fetchUsers();
  } else {
    userManagementSectionEl.hidden = true;
  }
}

async function fetchDevices() {
  const keyword = searchEl.value.trim();
  const url = keyword ? `/api/devices?search=${encodeURIComponent(keyword)}` : '/api/devices';
  const res = await fetch(url);
  if (res.status === 401) {
    window.location.href = '/admin.html';
    return;
  }
  if (!res.ok) throw new Error('Không thể tải dữ liệu từ server.');

  devices = await res.json();
  render();
}

async function fetchUsers() {
  if (currentUser.role !== 'admin') return;

  const res = await fetch('/api/users');
  if (!res.ok) {
    showToast('Không thể tải danh sách người dùng.');
    return;
  }

  appUsers = await res.json();
  renderUsers();
}


function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve('');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Không thể đọc file Excel.'));
    reader.readAsDataURL(file);
  });
}

async function importDevicesFromExcel(file) {
  if (!file) return;

  const allowedExtensions = /\.(xlsx|xls|csv)$/i;
  if (!allowedExtensions.test(file.name)) {
    showToast('Vui lòng chọn file Excel .xlsx, .xls hoặc .csv.');
    importExcelInput.value = '';
    return;
  }

  try {
    showToast('Đang import dữ liệu Excel...');
    const dataUrl = await fileToDataUrl(file);
    const res = await fetch('/api/devices/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, fileData: dataUrl }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Không thể import file Excel.');
      return;
    }

    currentPage = 1;
    await fetchDevices();
    localStorage.setItem('devices_sync_ts', String(Date.now()));
    const skippedMessage = data.skipped ? ` Bỏ qua ${data.skipped} dòng lỗi.` : '';
    showToast(`Đã import ${data.inserted || 0} thiết bị.${skippedMessage}`);
  } catch (err) {
    console.error(err);
    showToast('Không thể đọc hoặc import file Excel.');
  } finally {
    importExcelInput.value = '';
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(undefined);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Không thể đọc file ảnh.'));
    reader.readAsDataURL(file);
  });
}

function resetForm() {
  form.reset();
  editingId = null;
  formTitle.textContent = 'Thêm thiết bị';
  submitBtn.textContent = '➕ Thêm thiết bị';
  cancelBtn.hidden = true;
  const quantityEl = document.getElementById('quantity');
  if (quantityEl) quantityEl.value = '1';
}

function printDevice(device) {
  const printWindow = window.open('', '_blank', 'width=900,height=700');
  if (!printWindow) {
    showToast('Không thể mở cửa sổ in. Vui lòng kiểm tra popup blocker.');
    return;
  }

  const imageBlock = device.image
    ? `<img src="${sanitize(device.image)}" alt="${sanitize(device.name || 'Thiết bị')}" style="max-width: 240px; border-radius: 10px; border: 1px solid #dbe3f1;" />`
    : '<em>Không có ảnh</em>';

  const printableHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <title>Phiếu thiết bị #${sanitize(device.id)}</title>
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; margin: 24px; }
    h1 { margin-bottom: 4px; }
    .muted { color: #64748b; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: 180px 1fr; gap: 10px 14px; align-items: start; }
    .label { font-weight: 700; }
    .box { border: 1px solid #dbe3f1; border-radius: 10px; padding: 12px; background: #f8fbff; }
  </style>
</head>
<body>
  <h1>Phiếu thông tin thiết bị</h1>
  <p class="muted">In lúc: ${sanitize(new Date().toLocaleString('vi-VN'))}</p>
  <div class="box">
    <div class="grid">
      <div class="label">ID</div><div>${sanitize(device.id)}</div>
      <div class="label">Tên thiết bị</div><div>${sanitize(device.name || '-')}</div>
      <div class="label">Loại</div><div>${sanitize(device.type || '-')}</div>
      <div class="label">Khu vực</div><div>${sanitize(device.area || '-')}</div>
      <div class="label">Số lượng</div><div>${sanitize(device.quantity ?? 1)}</div>
      <div class="label">Tình trạng</div><div>${sanitize(device.status || '-')}</div>
      <div class="label">User</div><div>${sanitize(device.user || '-')}</div>
      <div class="label">Nội dung</div><div>${sanitize(device.content || '-')}</div>
      <div class="label">Ngày tạo</div><div>${sanitize(formatDate(device.created_at))}</div>
      <div class="label">Ảnh thiết bị</div><div>${imageBlock}</div>
    </div>
  </div>
</body>
</html>`;

  printWindow.document.open();
  printWindow.document.write(printableHtml);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => printWindow.print(), 150);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    name: document.getElementById('name').value.trim(),
    type: document.getElementById('type').value.trim(),
    area: document.getElementById('area').value.trim(),
    quantity: Number.parseInt(document.getElementById('quantity').value, 10) || 0,
    user: document.getElementById('user').value.trim(),
    content: document.getElementById('content').value.trim(),
    status: document.getElementById('status').value,
  };

  const file = document.getElementById('image').files[0];
  const image = await fileToBase64(file);

  if (image !== undefined) payload.image = image;

  const isEdit = editingId !== null;
  const url = isEdit ? `/api/devices/${editingId}` : '/api/devices';
  const method = isEdit ? 'PUT' : 'POST';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    showToast(data.error || 'Có lỗi xảy ra.');
    return;
  }

  if (!isEdit) currentPage = 1;
  resetForm();
  await fetchDevices();
  showToast(isEdit ? 'Cập nhật thành công.' : 'Thêm mới thành công.');
});

listEl.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const action = btn.dataset.action;
  const device = devices.find((d) => d.id === id);
  if (!device) return;

  if (action === 'edit') {
    editingId = device.id;
    document.getElementById('name').value = device.name;
    document.getElementById('type').value = device.type;
    document.getElementById('area').value = device.area || '';
    document.getElementById('quantity').value = String(device.quantity ?? 1);
    document.getElementById('user').value = device.user || '';
    document.getElementById('content').value = device.content || '';
    document.getElementById('status').value = device.status;
    document.getElementById('image').value = '';

    formTitle.textContent = `Chỉnh sửa thiết bị #${device.id}`;
    submitBtn.textContent = '💾 Lưu cập nhật';
    cancelBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'print') {
    printDevice(device);
    return;
  }

  if (action === 'delete') {
    if (!canDelete()) {
      showToast('Tài khoản user không có quyền xóa thiết bị.');
      return;
    }
    if (!window.confirm(`Bạn có chắc muốn xóa "${device.name}"?`)) return;

    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      showToast(data.error || 'Không thể xóa thiết bị.');
      return;
    }

    if (editingId === id) resetForm();
    await fetchDevices();
    showToast('Đã xóa thiết bị.');
  }
});

userFormEl?.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    username: document.getElementById('newUsername').value.trim(),
    password: document.getElementById('newPassword').value.trim(),
    role: document.getElementById('newRole').value,
  };

  const res = await fetch('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    showToast(data.error || 'Không thể thêm người dùng.');
    return;
  }

  showToast('Đã thêm người dùng thành công.');
  userFormEl.reset();
  await fetchUsers();
});

userListEl?.addEventListener('click', async (event) => {
  const btn = event.target.closest('button[data-action]');
  if (!btn) return;

  const userId = Number(btn.dataset.id);
  const action = btn.dataset.action;
  if (!Number.isInteger(userId) || userId <= 0) return;

  if (action === 'update-user-role') {
    const roleSelect = userListEl.querySelector(`.user-role-select[data-user-id="${userId}"]`);
    const role = roleSelect?.value === 'admin' ? 'admin' : 'user';

    const res = await fetch(`/api/users/${userId}/role`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Không thể cập nhật quyền người dùng.');
      await fetchUsers();
      return;
    }

    showToast(`Đã cập nhật ${data.username || 'người dùng'} thành ${data.role}.`);
    await fetchUsers();
    return;
  }

  if (action === 'delete-user') {
    if (!window.confirm('Bạn có chắc muốn xóa người dùng này?')) return;

    const res = await fetch(`/api/users/${userId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Không thể xóa người dùng.');
      return;
    }

    showToast('Đã xóa người dùng.');
    await fetchUsers();
  }
});

cancelBtn.addEventListener('click', resetForm);
searchEl.addEventListener('input', async () => {
  currentPage = 1;
  await fetchDevices();
});

pageSizeSelectEl?.addEventListener('change', () => {
  pageSize = Number.parseInt(pageSizeSelectEl.value, 10) || 10;
  currentPage = 1;
  render();
});

paginationControlsEl?.addEventListener('click', (event) => {
  const btn = event.target.closest('button');
  if (!btn || btn.disabled) return;

  const totalPages = getTotalPages();
  if (btn.dataset.pageAction === 'prev') {
    currentPage = Math.max(1, currentPage - 1);
  } else if (btn.dataset.pageAction === 'next') {
    currentPage = Math.min(totalPages, currentPage + 1);
  } else if (btn.dataset.page) {
    currentPage = Number.parseInt(btn.dataset.page, 10) || 1;
  }

  render();
});

importExcelInput?.addEventListener('change', async () => {
  await importDevicesFromExcel(importExcelInput.files[0]);
});

exportBtn.addEventListener('click', () => {
  if (!devices.length) {
    showToast('Không có dữ liệu để xuất Excel.');
    return;
  }

  const escapeXml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

  const rowsXml = devices
    .map((d) => {
      const cells = [d.name, d.type, d.area || '', d.quantity ?? 1, d.status, d.user || '', d.content || '', formatDate(d.created_at)]
        .map((value) => `<Cell><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`)
        .join('');
      return `<Row>${cells}</Row>`;
    })
    .join('');

  const excelXml = `<?xml version="1.0" encoding="UTF-8"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:html="http://www.w3.org/TR/REC-html40">
  <Styles>
    <Style ss:ID="Header">
      <Font ss:Bold="1"/>
      <Interior ss:Color="#E7EFFf" ss:Pattern="Solid"/>
    </Style>
  </Styles>
  <Worksheet ss:Name="Danh sach thiet bi">
    <Table>
      <Column ss:AutoFitWidth="1" ss:Width="160"/>
      <Column ss:AutoFitWidth="1" ss:Width="140"/>
      <Column ss:AutoFitWidth="1" ss:Width="140"/>
      <Column ss:AutoFitWidth="1" ss:Width="150"/>
      <Column ss:AutoFitWidth="1" ss:Width="90"/>
      <Column ss:AutoFitWidth="1" ss:Width="160"/>
      <Column ss:AutoFitWidth="1" ss:Width="260"/>
      <Column ss:AutoFitWidth="1" ss:Width="170"/>
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Tên</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Loại</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Khu vực</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Số lượng</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Tình trạng</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">User</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Nội dung</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Ngày tạo</Data></Cell>
      </Row>
      ${rowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'devices.xls';
  a.click();
  URL.revokeObjectURL(a.href);
});

listEl.addEventListener('mouseover', (event) => {
  const imageEl = event.target.closest('.device-image');
  if (!imageEl) return;

  const deviceId = Number(imageEl.dataset.deviceId);
  const device = devices.find((item) => item.id === deviceId);
  if (!device) return;

  const imageHtml = device.image
    ? `<p><strong>Ảnh thiết bị:</strong><br><img src="${sanitize(device.image)}" alt="${sanitize(device.name || 'Thiết bị')}" style="max-width: 100%; max-height: 260px; margin-top: 8px; border-radius: 10px; border: 1px solid #dbe3f1;" /></p>`
    : '<p><strong>Ảnh thiết bị:</strong> Không có ảnh</p>';

  detailBodyEl.innerHTML = `
    <p><strong>ID:</strong> ${sanitize(device.id)}</p>
    <p><strong>Tên thiết bị:</strong> ${sanitize(device.name || '-')}</p>
    <p><strong>Loại:</strong> ${sanitize(device.type || '-')}</p>
    <p><strong>Khu vực:</strong> ${sanitize(device.area || '-')}</p>
    <p><strong>Số lượng:</strong> ${sanitize(device.quantity ?? 1)}</p>
    <p><strong>Tình trạng:</strong> ${sanitize(device.status || '-')}</p>
    <p><strong>User:</strong> ${sanitize(device.user || '-')}</p>
    <p><strong>Nội dung:</strong> ${sanitize(device.content || '-')}</p>
    <p><strong>Ngày tạo:</strong> ${sanitize(formatDate(device.created_at))}</p>
  ${imageHtml}
  `;
  detailModalEl.style.pointerEvents = 'none';
  detailModalEl.hidden = false;
});

listEl.addEventListener('mouseout', (event) => {
  const imageEl = event.target.closest('.device-image');
  if (!imageEl) return;
  const toElement = event.relatedTarget;
  if (toElement && imageEl.contains(toElement)) return;

  detailModalEl.hidden = true;
  detailModalEl.style.pointerEvents = '';
});

closeDetailBtn?.addEventListener('click', () => {
  detailModalEl.hidden = true;
  detailModalEl.style.pointerEvents = '';
});

detailModalEl.addEventListener('click', (event) => {
  if (event.target === detailModalEl) {
    detailModalEl.hidden = true;
    detailModalEl.style.pointerEvents = '';
  }
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    detailModalEl.hidden = true;
    detailModalEl.style.pointerEvents = '';
  }
});

logoutBtn.addEventListener('click', async () => {
  const res = await fetch('/api/admin/logout', { method: 'POST' });
  if (!res.ok) {
    showToast('Không thể đăng xuất. Vui lòng thử lại.');
    return;
  }

  window.location.href = '/admin.html';
});

setupSideAdSliders();

window.addEventListener('storage', (event) => {
  if (event.key === 'devices_sync_ts') {
    fetchDevices().catch(() => {});
  }
});

(async () => {
  try {
    await checkSession();
    await fetchDevices();
  } catch (err) {
    console.error(err);
    showToast('Không thể tải dữ liệu. Hãy kiểm tra server.');
  }
})();
