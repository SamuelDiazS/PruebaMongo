require('dotenv').config();

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const DB_NAME = process.env.MONGODB_DB_NAME || 'edupets';
const MONGODB_URI = process.env.MONGODB_URI;
const SESSION_SECRET = process.env.SESSION_SECRET;
const isProduction = process.env.NODE_ENV === 'production';

if (!MONGODB_URI) {
  console.error('Error: faltan variables de entorno. Debes definir MONGODB_URI en tu archivo .env.');
  process.exit(1);
}

if (!SESSION_SECRET) {
  console.error('Error: faltan variables de entorno. Debes definir SESSION_SECRET en tu archivo .env.');
  process.exit(1);
}

const client = new MongoClient(MONGODB_URI, {
  serverSelectionTimeoutMS: 5000,
});
let db;

const PET_TYPES = {
  penguin: { label: 'Pingüino', src: 'assets/penguin.svg', emoji: '🐧' },
  oso: { label: 'Oso', src: 'assets/oso.svg', emoji: '🐻' },
  zorro: { label: 'Zorro', src: 'assets/zorro.svg', emoji: '🦊' },
};

const SHOP_ITEMS = {
  food_pack: {
    id: 'food_pack',
    name: 'Bolsa de comida',
    price: 20,
    description: 'Ración nutritiva para tu mascota.',
  },
  toy_bone: {
    id: 'toy_bone',
    name: 'Juguete de hueso',
    price: 30,
    description: 'Ideal para jugar y gastar energía.',
  },
};

const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function parseProductQuantity(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10) {
    return null;
  }
  return parsed;
}

function getPetInfo(type) {
  return PET_TYPES[type] || PET_TYPES.penguin;
}

function getCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function buildUserSummary(user) {
  return {
    _id: user._id.toString(),
    username: user.username,
    petName: user.petName,
    petType: user.petType,
    coins: user.coins,
    happiness: user.happiness,
    hunger: user.hunger,
    energy: user.energy,
    inventory: user.inventory || [],
    createdAt: user.createdAt,
  };
}

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Debes iniciar sesión para continuar.' });
  }

  next();
}

async function getCurrentUser(req) {
  if (!req.session.userId) {
    return null;
  }

  return db.collection('users').findOne({ _id: new ObjectId(req.session.userId) });
}

async function incrementLoginAttempts(username) {
  const now = Date.now();
  const previous = loginAttempts.get(username) || [];
  const validAttempts = previous.filter((time) => now - time < LOGIN_WINDOW_MS);
  validAttempts.push(now);
  loginAttempts.set(username, validAttempts);
  return validAttempts.length;
}

function isRateLimited(username) {
  const attempts = loginAttempts.get(username) || [];
  const now = Date.now();
  const validAttempts = attempts.filter((time) => now - time < LOGIN_WINDOW_MS);
  return validAttempts.length >= MAX_LOGIN_ATTEMPTS;
}

function clearLoginAttempts(username) {
  loginAttempts.delete(username);
}

async function connectDatabase() {
  try {
    await client.connect();
    db = client.db(DB_NAME);

    await db.command({ ping: 1 });
    await db.collection('users').createIndex({ username: 1 }, { unique: true });
    await db.collection('activities').createIndex({ userId: 1, createdAt: -1 });

    console.log(`Conectado a MongoDB: ${DB_NAME}`);
  } catch (error) {
    console.error('No se pudo conectar a MongoDB:', error.message);
    process.exit(1);
  }
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 12,
    },
  })
);

app.use((req, res, next) => {
  if (req.path.startsWith('/api/') && req.method !== 'GET') {
    const headerToken = req.headers['x-csrf-token'];
    const sessionToken = getCsrfToken(req);

    if (!headerToken || headerToken !== sessionToken) {
      return res.status(403).json({ error: 'Token CSRF inválido.' });
    }
  }

  next();
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/api/auth/csrf', (req, res) => {
  res.json({ csrfToken: getCsrfToken(req) });
});

app.post('/api/auth/register', async (req, res) => {
  const { username, password, petName } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim() : '';
  const cleanPetName = typeof petName === 'string' ? petName.trim() : '';

  if (!cleanUsername || !password || !cleanPetName) {
    return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(cleanUsername)) {
    return res.status(400).json({
      error: 'El nombre de usuario debe tener entre 3 y 20 caracteres y solo letras, números o guiones bajos.',
    });
  }

  if (cleanPetName.length < 2 || cleanPetName.length > 20) {
    return res.status(400).json({ error: 'El nombre de la mascota debe tener entre 2 y 20 caracteres.' });
  }

  if (typeof password !== 'string' || password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });
  }

  try {
    const existingUser = await db.collection('users').findOne({ username: cleanUsername });
    if (existingUser) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está registrado.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const newUser = {
      username: cleanUsername,
      passwordHash,
      petName: cleanPetName,
      petType: 'penguin',
      coins: 100,
      happiness: 80,
      hunger: 20,
      energy: 100,
      inventory: [],
      createdAt: new Date(),
    };

    const result = await db.collection('users').insertOne(newUser);
    req.session.userId = result.insertedId.toString();
    req.session.username = cleanUsername;

    return res.status(201).json({
      message: 'Usuario registrado correctamente.',
      user: buildUserSummary({ ...newUser, _id: result.insertedId }),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya existe.' });
    }

    console.error(error);
    return res.status(500).json({ error: 'No se pudo completar el registro.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  const cleanUsername = typeof username === 'string' ? username.trim() : '';

  if (!cleanUsername || !password) {
    return res.status(400).json({ error: 'Nombre de usuario y contraseña requeridos.' });
  }

  if (isRateLimited(cleanUsername)) {
    return res.status(429).json({ error: 'Has intentado iniciar sesión demasiadas veces. Espera unos minutos.' });
  }

  try {
    const user = await db.collection('users').findOne({ username: cleanUsername });

    if (!user) {
      await incrementLoginAttempts(cleanUsername);
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    const isValidPassword = await bcrypt.compare(String(password), user.passwordHash);
    if (!isValidPassword) {
      await incrementLoginAttempts(cleanUsername);
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    clearLoginAttempts(cleanUsername);
    req.session.userId = user._id.toString();
    req.session.username = user.username;

    return res.json({
      message: 'Inicio de sesión correcto.',
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error al iniciar sesión.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({ error: 'No se pudo cerrar la sesión.' });
    }

    res.clearCookie('connect.sid');
    return res.json({ message: 'Sesión cerrada correctamente.' });
  });
});

app.get('/api/pet', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    const petInfo = getPetInfo(user.petType);
    return res.json({
      user: buildUserSummary(user),
      pet: {
        ...petInfo,
        emoji: petInfo.emoji,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo obtener la información de la mascota.' });
  }
});

app.post('/api/pet/feed', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    const foodEntry = (user.inventory || []).find((item) => item.productId === 'food_pack');
    if (!foodEntry || foodEntry.quantity <= 0) {
      return res.status(400).json({ error: 'No tienes comida disponible para alimentar a tu mascota.' });
    }

    foodEntry.quantity -= 1;
    if (foodEntry.quantity <= 0) {
      user.inventory = (user.inventory || []).filter((item) => item.productId !== 'food_pack');
    }

    user.hunger = clamp(user.hunger - 30, 0, 100);
    user.happiness = clamp(user.happiness + 10, 0, 100);
    user.energy = clamp(user.energy + 5, 0, 100);

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { hunger: user.hunger, happiness: user.happiness, energy: user.energy, inventory: user.inventory } }
    );

    return res.json({
      message: 'Tu mascota ha comido muy bien.',
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo alimentar a la mascota.' });
  }
});

app.post('/api/pet/play', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    user.happiness = clamp(user.happiness + 15, 0, 100);
    user.hunger = clamp(user.hunger + 10, 0, 100);
    user.energy = clamp(user.energy - 15, 0, 100);
    user.coins = user.coins + 10;

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { happiness: user.happiness, hunger: user.hunger, energy: user.energy, coins: user.coins } }
    );

    return res.json({
      message: '¡Has jugado con tu mascota!',
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo jugar con la mascota.' });
  }
});

app.post('/api/pet/rest', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    user.energy = clamp(user.energy + 25, 0, 100);
    user.happiness = clamp(user.happiness + 5, 0, 100);
    user.hunger = clamp(user.hunger + 5, 0, 100);

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { energy: user.energy, happiness: user.happiness, hunger: user.hunger } }
    );

    return res.json({
      message: 'Tu mascota ha descansado y está renovada.',
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo hacer descansar a la mascota.' });
  }
});

app.get('/api/shop', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    return res.json({
      items: Object.values(SHOP_ITEMS),
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo cargar la tienda.' });
  }
});

app.post('/api/shop/buy', requireAuth, async (req, res) => {
  const { productId, quantity = 1 } = req.body || {};
  const normalizedQuantity = parseProductQuantity(quantity);

  if (!productId || !SHOP_ITEMS[productId]) {
    return res.status(400).json({ error: 'Producto no válido.' });
  }

  if (!normalizedQuantity) {
    return res.status(400).json({ error: 'La cantidad debe ser un número entero entre 1 y 10.' });
  }

  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    const item = SHOP_ITEMS[productId];
    const totalCost = item.price * normalizedQuantity;

    if (user.coins < totalCost) {
      return res.status(400).json({ error: 'No tienes suficientes monedas para comprar este producto.' });
    }

    const inventory = Array.isArray(user.inventory) ? [...user.inventory] : [];
    const existing = inventory.find((entry) => entry.productId === productId);

    if (existing) {
      existing.quantity += normalizedQuantity;
    } else {
      inventory.push({ productId, quantity: normalizedQuantity });
    }

    user.coins -= totalCost;
    user.inventory = inventory;

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { coins: user.coins, inventory: user.inventory } }
    );

    return res.json({
      message: 'Compra realizada correctamente.',
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo completar la compra.' });
  }
});

app.get('/api/activities/math', requireAuth, async (req, res) => {
  try {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    req.session.mathQuestion = {
      a,
      b,
      answer: a + b,
    };

    return res.json({
      question: {
        a,
        b,
        operator: '+',
      },
      prompt: 'Calcula la suma.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo generar la actividad matemática.' });
  }
});

app.post('/api/activities/math', requireAuth, async (req, res) => {
  const answer = Number(req.body?.answer);
  const question = req.session.mathQuestion;

  if (!question) {
    return res.status(400).json({ error: 'Primero genera un ejercicio de matemáticas.' });
  }

  if (!Number.isInteger(answer)) {
    return res.status(400).json({ error: 'La respuesta debe ser un número entero.' });
  }

  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    const correct = answer === question.answer;
    const reward = correct ? 15 : 0;

    if (correct) {
      user.coins += reward;
      user.happiness = clamp(user.happiness + 8, 0, 100);
    } else {
      user.happiness = clamp(user.happiness - 5, 0, 100);
    }

    await db.collection('users').updateOne(
      { _id: user._id },
      { $set: { coins: user.coins, happiness: user.happiness } }
    );

    await db.collection('activities').insertOne({
      userId: user._id,
      type: 'math',
      result: correct ? 'correct' : 'incorrect',
      reward,
      createdAt: new Date(),
    });

    delete req.session.mathQuestion;

    return res.json({
      correct,
      reward,
      message: correct ? '¡Muy bien! Has ganado 15 monedas.' : `Casi lo consigues. La respuesta correcta era ${question.answer}.`,
      user: buildUserSummary(user),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo validar la actividad.' });
  }
});

app.get('/api/activities/history', requireAuth, async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ error: 'No estás autenticado.' });
    }

    const activities = await db
      .collection('activities')
      .find({ userId: user._id })
      .sort({ createdAt: -1 })
      .limit(10)
      .toArray();

    return res.json({
      activities: activities.map((item) => ({
        _id: item._id.toString(),
        type: item.type,
        result: item.result,
        reward: item.reward,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'No se pudo obtener el historial.' });
  }
});

app.get('/api/session', requireAuth, async (req, res) => {
  const user = await getCurrentUser(req);
  if (!user) {
    return res.status(401).json({ error: 'No estás autenticado.' });
  }

  res.json({ user: buildUserSummary(user) });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  await connectDatabase();

  app.listen(PORT, () => {
    console.log(`EduPets escuchando en http://localhost:${PORT}`);
  });
}

const shutdown = async () => {
  try {
    await client.close();
    console.log('Conexión MongoDB cerrada.');
    process.exit(0);
  } catch (error) {
    console.error('Error al cerrar la conexión MongoDB.', error);
    process.exit(1);
  }
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

startServer();
