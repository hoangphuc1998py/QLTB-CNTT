const form = document.getElementById('deviceForm');
const formTitle = document.getElementById('formTitle');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const listEl = document.getElementById('list');
const searchEl = document.getElementById('search');
const exportBtn = document.getElementById('exportBtn');
const toastEl = document.getElementById('toast');
const logoutBtn = document.getElementById('logoutBtn');
const totalCountEl = document.getElementById('totalCount');
const goodCountEl = document.getElementById('goodCount');
const maintainCountEl = document.getElementById('maintainCount');
const brokenCountEl = document.getElementById('brokenCount');

let devices = [];
let editingId = null;

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

function formatDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleString('vi-VN');
}

function statusBadge(status) {
  if (status === 'Hoạt động tốt') return '<span class="badge badge-good">Hoạt động tốt</span>';
  if (status === 'Đang bảo trì') return '<span class="badge badge-maintain">Đang bảo trì</span>';
  return '<span class="badge badge-broken">Hỏng</span>';
}

function sanitize(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function render() {
  updateStats();

  if (!devices.length) {
    listEl.innerHTML = `<tr><td colspan="6">Chưa có dữ liệu thiết bị.</td></tr>`;
    return;
  }

  listEl.innerHTML = devices
    .map((d, index) => {
      const image = d.image
        ? `<img src="${sanitize(d.image)}" alt="${sanitize(d.name)}">`
        : '<span>-</span>';

      return `
        <tr style="--row-index:${index};">
          <td>${image}</td>
          <td>${sanitize(d.name)}</td>
          <td>${sanitize(d.type)}</td>
          <td>${statusBadge(sanitize(d.status))}</td>
          <td>${formatDate(d.created_at)}</td>
          <td>
            <div class="actions">
              <button class="action-btn edit-btn" data-action="edit" data-id="${d.id}">Sửa</button>
              <button class="action-btn delete-btn" data-action="delete" data-id="${d.id}">Xóa</button>
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

  animateCount(totalCountEl, devices.length);
  animateCount(goodCountEl, goodCount);
  animateCount(maintainCountEl, maintainCount);
  animateCount(brokenCountEl, brokenCount);
}

function animateCount(el, target) {
  const current = Number(el.textContent) || 0;
  const start = performance.now();
  const duration = 320;

  function step(timestamp) {
    const progress = Math.min((timestamp - start) / duration, 1);
    const value = Math.round(current + ((target - current) * progress));
    el.textContent = String(value);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
}

function updateStats() {
  const goodCount = devices.filter((d) => d.status === 'Hoạt động tốt').length;
  const maintainCount = devices.filter((d) => d.status === 'Đang bảo trì').length;
  const brokenCount = devices.filter((d) => d.status === 'Hỏng').length;

  animateCount(totalCountEl, devices.length);
  animateCount(goodCountEl, goodCount);
  animateCount(maintainCountEl, maintainCount);
  animateCount(brokenCountEl, brokenCount);
}

function animateCount(el, target) {
  const current = Number(el.textContent) || 0;
  const start = performance.now();
  const duration = 320;

  function step(timestamp) {
    const progress = Math.min((timestamp - start) / duration, 1);
    const value = Math.round(current + ((target - current) * progress));
    el.textContent = String(value);
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  }

  requestAnimationFrame(step);
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

async function fetchDevices() {
  const keyword = searchEl.value.trim();
  const url = keyword ? `/api/devices?search=${encodeURIComponent(keyword)}` : '/api/devices';
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error('Không thể tải dữ liệu từ server.');
  }

  devices = await res.json();
  render();
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
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const payload = {
    name: document.getElementById('name').value.trim(),
    type: document.getElementById('type').value.trim(),
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
    document.getElementById('status').value = device.status;
    document.getElementById('image').value = '';

    formTitle.textContent = `Chỉnh sửa thiết bị #${device.id}`;
    submitBtn.textContent = '💾 Lưu cập nhật';
    cancelBtn.hidden = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  if (action === 'delete') {
    if (!window.confirm(`Bạn có chắc muốn xóa "${device.name}"?`)) return;

    const res = await fetch(`/api/devices/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      showToast(data.error || 'Không thể xóa thiết bị.');
      return;
    }

    if (editingId === id) resetForm();
    await fetchDevices();
    showToast('Đã xóa thiết bị.');
  }
});

cancelBtn.addEventListener('click', resetForm);

searchEl.addEventListener('input', async () => {
  await fetchDevices();
});

exportBtn.addEventListener('click', () => {
  if (!devices.length) {
    showToast('Không có dữ liệu để xuất CSV.');
    return;
  }

  const header = 'Tên,Loại,Tình trạng,Ngày tạo\n';
  const rows = devices
    .map((d) => [d.name, d.type, d.status, d.created_at]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(','))
    .join('\n');

  const blob = new Blob([header + rows], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'devices.csv';
  a.click();
URL.revokeObjectURL(a.href);
});

logoutBtn.addEventListener('click', async () => {
  const res = await fetch('/api/admin/logout', { method: 'POST' });
  if (!res.ok) {
    showToast('Không thể đăng xuất. Vui lòng thử lại.');
    return;
  }

  window.location.href = '/admin.html';
});

fetchDevices().catch((err) => {
  console.error(err);
  showToast('Không thể tải dữ liệu. Hãy kiểm tra server.');
});