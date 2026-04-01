const changeHistoryListEl = document.getElementById('changeHistoryList');
const historySearchEl = document.getElementById('historySearch');
const toastEl = document.getElementById('toast');
const logoutBtn = document.getElementById('logoutBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const exportBtn = document.getElementById('exportBtn');
let histories = [];
let filteredHistories = [];
const SESSION_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

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

  histories = await res.json();
  applyHistoryFilter();
}

function renderHistoryRows(items) {
  filteredHistories = items;

  if (!items.length) {
    changeHistoryListEl.innerHTML = '<tr><td colspan="5">Không tìm thấy lịch sử phù hợp.</td></tr>';
    return;
  }

  changeHistoryListEl.innerHTML = items
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

function parseSnapshot(rawValue) {
  if (!rawValue) return null;

  if (typeof rawValue === 'string') {
    try {
      return JSON.parse(rawValue);
    } catch (error) {
      return null;
    }
  }

return typeof rawValue === 'object' ? rawValue : null;
}

function getHistoryDeviceUser(item) {
  const oldSnapshot = parseSnapshot(item.old_data) || {};
  const newSnapshot = parseSnapshot(item.new_data) || {};
  return String(newSnapshot.user || oldSnapshot.user || '').trim();
}

function applyHistoryFilter() {
  if (!histories.length) {
    changeHistoryListEl.innerHTML = '<tr><td colspan="5">Chưa có lịch sử thay đổi.</td></tr>';
    return;
  }

  const keyword = (historySearchEl?.value || '').trim().toLowerCase();
  const filtered = keyword
    ? histories.filter((item) => getHistoryDeviceUser(item).toLowerCase().includes(keyword))
    : histories;

  renderHistoryRows(filtered);
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

historySearchEl?.addEventListener('input', applyHistoryFilter);

exportBtn?.addEventListener('click', () => {
  if (!histories.length) {
    showToast('Không có dữ liệu để xuất Excel.');
    return;
  }

  const escapeXml = (value) => String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const rowsXml = filteredHistories
    .map((item) => {
      const oldSnapshot = parseSnapshot(item.old_data) || {};
      const newSnapshot = parseSnapshot(item.new_data) || {};
      const actionType = newSnapshot.deleted ? 'Đã xóa' : 'Cập nhật';

      const cells = [
        item.device_id,
        actionType,
        oldSnapshot.name || '-',
        oldSnapshot.type || '-',
        oldSnapshot.user || '-',
        oldSnapshot.content || '-',
        oldSnapshot.status || '-',
        newSnapshot.name || '-',
        newSnapshot.type || '-',
        newSnapshot.user || '-',
        newSnapshot.content || '-',
        newSnapshot.status || '-',
        formatDate(item.changed_at),
      ]
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
  <Worksheet ss:Name="Lich su thay doi">
    <Table>
      <Column ss:AutoFitWidth="1" ss:Width="90"/>
      <Column ss:AutoFitWidth="1" ss:Width="100"/>
      <Column ss:AutoFitWidth="1" ss:Width="140"/>
      <Column ss:AutoFitWidth="1" ss:Width="120"/>
      <Column ss:AutoFitWidth="1" ss:Width="120"/>
      <Column ss:AutoFitWidth="1" ss:Width="200"/>
      <Column ss:AutoFitWidth="1" ss:Width="120"/>
      <Column ss:AutoFitWidth="1" ss:Width="140"/>
      <Column ss:AutoFitWidth="1" ss:Width="120"/>
      <Column ss:AutoFitWidth="1" ss:Width="120"/>
      <Column ss:AutoFitWidth="1" ss:Width="200"/>
      <Column ss:AutoFitWidth="1" ss:Width="120"/>
      <Column ss:AutoFitWidth="1" ss:Width="170"/>
      <Row>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Thiết bị</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Loại thao tác</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Tên cũ</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Loại cũ</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">User cũ</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Nội dung cũ</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Tình trạng cũ</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Tên mới</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Loại mới</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">User mới</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Nội dung mới</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Tình trạng mới</Data></Cell>
        <Cell ss:StyleID="Header"><Data ss:Type="String">Thời gian chỉnh sửa</Data></Cell>
      </Row>
      ${rowsXml}
    </Table>
  </Worksheet>
</Workbook>`;

  const blob = new Blob([excelXml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'device-change-history.xls';
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

(async () => {
  try {
    await checkSession();
    await fetchHistory();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Không thể tải lịch sử thay đổi.');
  }
})();