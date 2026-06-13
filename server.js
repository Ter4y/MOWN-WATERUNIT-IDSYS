require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { MongoClient } = require('mongodb');

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const PORT = process.env.PORT || 3000;

// Mongo config
const MONGO_HOST = process.env.MONGO_HOST || 'localhost';
const MONGO_PORT = process.env.MONGO_PORT || '27017';
const MONGO_DB = process.env.MONGO_DB || 'terry';
const MONGO_USER = process.env.MONGO_USER || process.env.MONGO_USERNAME || 'skunksbarbara_db_user';
const MONGO_PASS = process.env.MONGO_PASS || process.env.MONGO_PASSWORD || 'bP0mLYyjsVHwbE5E';

let mongoClient;
let settingsCollection;

async function connectMongo() {
  // Require a full MongoDB connection string via MONGO_URI (supports mongodb+srv)
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('MONGO_URI is required. Set it in your .env file to your Atlas connection string.');
    process.exit(1);
  }

  // Try to infer DB name from the URI if MONGO_DB not provided
  let dbName = process.env.MONGO_DB;
  if (!dbName) {
    const m = uri.match(/\/([^\/?]+)(?:\?|$)/);
    if (m && m[1] && !m[1].includes('%2F')) dbName = m[1];
  }

  mongoClient = new MongoClient(uri, { maxPoolSize: 10 });
  await mongoClient.connect();
  const db = mongoClient.db(dbName || undefined);
  settingsCollection = db.collection('settings');
  console.log('Connected to MongoDB', db.databaseName || '(no-db-specified)');
}

connectMongo().catch(err => {
  console.error('Mongo connection error:', err.message);
});

// Serve static files (so index.html can be opened from this server)
app.use(express.static(path.join(__dirname)));

// GET settings (id = config)
app.get('/api/settings/:id', async (req, res) => {
  const id = req.params.id;
  try {
    if (!settingsCollection) return res.status(503).json({ error: 'db not ready' });
    const doc = await settingsCollection.findOne({ _id: id });
    if (!doc) return res.status(404).json({});
    const { _id, ...rest } = doc;
    return res.json(rest);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

// POST settings (upsert)
app.post('/api/settings/:id', async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  try {
    if (!settingsCollection) return res.status(503).json({ error: 'db not ready' });
    await settingsCollection.updateOne({ _id: id }, { $set: body }, { upsert: true });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
