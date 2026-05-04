const AUTH_KEY = 'map_auth';

async function appSha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function appLoadConfig() {
  const res = await fetch('config.json?t=' + Date.now());
  if (!res.ok) throw new Error('config.json не знайдено');
  return res.json();
}

function onAuthSuccess() {
  document.getElementById('pw-overlay').style.display = 'none';
  const adminContent = document.getElementById('admin-content');
  if (adminContent) {
    adminContent.style.display = 'contents';
  } else {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.style.removeProperty('display');
  }
}

async function authTryLogin() {
  const input = document.getElementById('pw-input').value;
  const errEl = document.getElementById('pw-error');
  const btn   = document.getElementById('pw-submit');
  if (!input) return;

  btn.disabled      = true;
  errEl.textContent = '';

  try {
    const hash   = await appSha256(input);
    const config = await appLoadConfig();

    if (hash === config.passwordHash) {
      sessionStorage.setItem(AUTH_KEY, '1');
      onAuthSuccess();
    } else {
      errEl.textContent = 'Невірний пароль';
      const form = document.getElementById('pw-form');
      form.classList.add('shake');
      setTimeout(() => form.classList.remove('shake'), 380);
      document.getElementById('pw-input').value = '';
      document.getElementById('pw-input').focus();
    }
  } catch {
    if (location.protocol === 'file:') {
      sessionStorage.setItem(AUTH_KEY, '1');
      onAuthSuccess();
    } else {
      errEl.textContent = 'Помилка: не вдалося завантажити конфіг';
    }
  }

  btn.disabled = false;
}

document.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem(AUTH_KEY) === '1') {
    onAuthSuccess();
    return;
  }

  document.getElementById('pw-submit').addEventListener('click', authTryLogin);
  document.getElementById('pw-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') authTryLogin();
  });

  // Auto-focus password input
  setTimeout(() => document.getElementById('pw-input')?.focus(), 50);
});
