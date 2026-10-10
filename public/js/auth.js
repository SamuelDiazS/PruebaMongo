const csrfMeta = document.querySelector('meta[name="csrf-token"]');

async function fetchCsrfToken() {
  const response = await fetch('/api/auth/csrf', { credentials: 'same-origin' });
  const data = await response.json();
  if (csrfMeta) {
    csrfMeta.content = data.csrfToken || '';
  }
  return data.csrfToken || '';
}

function getHeaders(body = null) {
  const token = csrfMeta ? csrfMeta.content : '';
  const headers = {
    'X-CSRF-Token': token,
    'Content-Type': 'application/json',
  };

  if (!body) {
    delete headers['Content-Type'];
  }

  return {
    credentials: 'same-origin',
    headers,
    body: body ? JSON.stringify(body) : undefined,
  };
}

async function setupAuthPage() {
  await fetchCsrfToken();

  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');

  if (loginForm) {
    loginForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('login-message');
      const formData = new FormData(loginForm);
      const payload = {
        username: String(formData.get('username') || '').trim(),
        password: String(formData.get('password') || ''),
      };

      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          ...getHeaders(payload),
        });
        const data = await response.json();

        if (!response.ok) {
          message.textContent = data.error || 'Error al iniciar sesión.';
          message.style.color = '#c0392b';
          return;
        }

        message.textContent = '¡Bienvenido! Redirigiendo...';
        message.style.color = '#2e7d32';
        window.location.href = 'pet.html';
      } catch (error) {
        message.textContent = 'No se pudo conectar con el servidor.';
        message.style.color = '#c0392b';
      }
    });
  }

  if (registerForm) {
    registerForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const message = document.getElementById('register-message');
      const formData = new FormData(registerForm);
      const payload = {
        username: String(formData.get('username') || '').trim(),
        password: String(formData.get('password') || ''),
        petName: String(formData.get('petName') || '').trim(),
      };

      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          ...getHeaders(payload),
        });
        const data = await response.json();

        if (!response.ok) {
          message.textContent = data.error || 'Error en el registro.';
          message.style.color = '#c0392b';
          return;
        }

        message.textContent = 'Registro correcto. Redirigiendo...';
        message.style.color = '#2e7d32';
        window.location.href = 'pet.html';
      } catch (error) {
        message.textContent = 'No se pudo conectar con el servidor.';
        message.style.color = '#c0392b';
      }
    });
  }
}

document.addEventListener('DOMContentLoaded', setupAuthPage);
