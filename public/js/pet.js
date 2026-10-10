const petImageMap = {
  penguin: 'assets/penguin.svg',
  oso: 'assets/oso.svg',
  zorro: 'assets/zorro.svg',
};

const elements = {
  playerName: document.getElementById('player-name'),
  petName: document.getElementById('pet-name'),
  coins: document.getElementById('coins'),
  happiness: document.getElementById('happiness'),
  hunger: document.getElementById('hunger'),
  energy: document.getElementById('energy'),
  petImage: document.getElementById('pet-image'),
  mathQuestion: document.getElementById('math-question'),
  mathMessage: document.getElementById('math-message'),
  mathAnswer: document.getElementById('math-answer'),
  shopItems: document.getElementById('shop-items'),
  activityHistory: document.getElementById('activity-history'),
  logoutButton: document.getElementById('logout-button'),
  feedButton: document.getElementById('feed-button'),
  playButton: document.getElementById('play-button'),
  restButton: document.getElementById('rest-button'),
  mathForm: document.getElementById('math-form'),
};

function getCsrfToken() {
  const node = document.querySelector('meta[name="csrf-token"]');
  return node ? node.content : '';
}

function buildHeaders(body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-CSRF-Token': getCsrfToken(),
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

async function fetchWithJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Error en la petición');
  }

  return data;
}

function renderUser(user) {
  if (!user) return;

  elements.playerName.textContent = user.username;
  elements.petName.textContent = user.petName;
  elements.coins.textContent = user.coins;
  elements.happiness.textContent = user.happiness;
  elements.hunger.textContent = user.hunger;
  elements.energy.textContent = user.energy;

  const petType = user.petType || 'penguin';
  elements.petImage.src = petImageMap[petType] || petImageMap.penguin;
  elements.petImage.alt = petType;
}

async function loadPet() {
  try {
    const data = await fetchWithJson('/api/pet');
    renderUser(data.user);
  } catch (error) {
    if (error.message.includes('iniciar sesión')) {
      window.location.href = 'login.html';
      return;
    }
    elements.mathMessage.textContent = error.message;
  }
}

async function loadMathQuestion() {
  try {
    const data = await fetchWithJson('/api/activities/math');
    elements.mathQuestion.textContent = `${data.question.a} ${data.question.operator} ${data.question.b} = ?`;
    elements.mathAnswer.value = '';
    elements.mathMessage.textContent = '';
  } catch (error) {
    elements.mathMessage.textContent = error.message;
  }
}

function renderShop(items) {
  elements.shopItems.innerHTML = '';

  items.forEach((item) => {
    const entry = document.createElement('div');
    entry.className = 'shop-item';
    entry.innerHTML = `
      <div>
        <strong>${item.name}</strong><br />
        <small>${item.description}</small>
      </div>
      <button class="button button--secondary" type="button" data-product-id="${item.id}">🪙 ${item.price}</button>
    `;
    elements.shopItems.appendChild(entry);
  });

  elements.shopItems.querySelectorAll('button[data-product-id]').forEach((button) => {
    button.addEventListener('click', async () => {
      const productId = button.dataset.productId;
      try {
        const data = await fetchWithJson('/api/shop/buy', {
          method: 'POST',
          ...buildHeaders({ productId, quantity: 1 }),
        });
        renderUser(data.user);
        await loadPet();
        elements.mathMessage.textContent = data.message;
      } catch (error) {
        elements.mathMessage.textContent = error.message;
      }
    });
  });
}

async function loadShop() {
  try {
    const data = await fetchWithJson('/api/shop');
    renderShop(data.items);
    renderUser(data.user);
  } catch (error) {
    elements.mathMessage.textContent = error.message;
  }
}

function renderHistory(activities) {
  elements.activityHistory.innerHTML = '';

  if (!activities.length) {
    elements.activityHistory.innerHTML = '<li class="history-item">Aún no hay actividades registradas.</li>';
    return;
  }

  activities.forEach((item) => {
    const listItem = document.createElement('li');
    listItem.className = 'history-item';
    listItem.textContent = `${item.type.toUpperCase()} · ${item.result} · +${item.reward} monedas`;
    elements.activityHistory.appendChild(listItem);
  });
}

async function loadHistory() {
  try {
    const data = await fetchWithJson('/api/activities/history');
    renderHistory(data.activities);
  } catch (error) {
    elements.mathMessage.textContent = error.message;
  }
}

async function handlePetAction(endpoint, successMessage) {
  try {
    const data = await fetchWithJson(endpoint, {
      method: 'POST',
      ...buildHeaders(),
    });
    renderUser(data.user);
    elements.mathMessage.textContent = successMessage || data.message;
    await loadHistory();
  } catch (error) {
    elements.mathMessage.textContent = error.message;
  }
}

async function handleMathSubmit(event) {
  event.preventDefault();

  try {
    const answer = Number(elements.mathAnswer.value);
    const data = await fetchWithJson('/api/activities/math', {
      method: 'POST',
      ...buildHeaders({ answer }),
    });
    renderUser(data.user);
    elements.mathMessage.textContent = data.message;
    await loadHistory();
    await loadMathQuestion();
  } catch (error) {
    elements.mathMessage.textContent = error.message;
  }
}

async function logout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'X-CSRF-Token': getCsrfToken(),
      },
    });

    if (response.ok) {
      window.location.href = 'login.html';
      return;
    }

    const error = await response.json();
    elements.mathMessage.textContent = error.error || 'No se pudo cerrar la sesión.';
  } catch (error) {
    elements.mathMessage.textContent = 'No se pudo cerrar la sesión.';
  }
}

async function initGame() {
  await fetch('/api/auth/csrf', { credentials: 'same-origin' })
    .then((response) => response.json())
    .then((data) => {
      const meta = document.querySelector('meta[name="csrf-token"]');
      if (meta) {
        meta.content = data.csrfToken || '';
      }
    })
    .catch(() => {});

  await loadPet();
  await loadShop();
  await loadHistory();
  await loadMathQuestion();

  elements.feedButton.addEventListener('click', () => handlePetAction('/api/pet/feed', '¡La mascota ha comido!'));
  elements.playButton.addEventListener('click', () => handlePetAction('/api/pet/play', '¡Tu mascota está muy feliz!'));
  elements.restButton.addEventListener('click', () => handlePetAction('/api/pet/rest', '¡Tu mascota ha descansado!'));
  elements.logoutButton.addEventListener('click', logout);
  elements.mathForm.addEventListener('submit', handleMathSubmit);
}

document.addEventListener('DOMContentLoaded', initGame);
