const loginForm = document.getElementById('loginForm');
const usernameEl = document.getElementById('username');
const passwordEl = document.getElementById('password');
const toastEl = document.getElementById('toast');

function showToast(message) {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function checkSession() {
  const res = await fetch('/api/admin/session');
  if (!res.ok) return;
  const data = await res.json();
  if (data.authenticated) {
    window.location.href = '/index.html';
  }
}

// loginForm.addEventListener('submit', async (event) => {
//   event.preventDefault();

//   const password = passwordEl.value;
//   const res = await fetch('/api/admin/login', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify({ password }),
//   });

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();

  const username = usernameEl.value.trim();
  const password = passwordEl.value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  const data = await res.json().catch(() => ({}));
 if (!res.ok) {
    showToast(data.error || 'Đăng nhập thất bại.');
    if (!username) {
      usernameEl.focus();
    } else {
      passwordEl.focus();
    }
    return;
  }

  showToast('Đăng nhập thành công, đang chuyển trang...');
  setTimeout(() => {
    window.location.href = '/index.html';
  }, 500);
});

checkSession().catch(() => {
  // Không cần chặn trang login nếu check session lỗi tạm thời.
});