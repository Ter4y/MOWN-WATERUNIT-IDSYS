require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const validator = require('validator');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
app.set('trust proxy',  1)\
app.get('/',(req,res)=> { res.json({ status: "server runn})
// Security Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.'
});

app.use(limiter);
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'ChangeMe@123';

if (!MONGO_URI) {
  console.error('ERROR: MONGO_URI environment variable is required!');
  console.error('Set it in your .env file');
  process.exit(1);
}

let mongoClient;
let db;
let settingsCollection;
let membersCollection;
let mongoConnected = false;

// ==================== DATABASE CONNECTION ====================
async function connectMongo() {
  try {
    mongoClient = new MongoClient(MONGO_URI, { 
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    
    await mongoClient.connect();
    mongoConnected = true;
    
    // Extract database name from URI or use default
    let dbName = 'mow_identification';
    const match = MONGO_URI.match(/\/([^\/?]+)(\?|$)/);
    if (match && match[1] && !match[1].includes('%2F')) {
      dbName = match[1];
    }
    
    db = mongoClient.db(dbName);
    settingsCollection = db.collection('settings');
    membersCollection = db.collection('members');
    
    // Create indexes
    await settingsCollection.createIndex({ _id: 1 });
    await membersCollection.createIndex({ _id: 1 });
    await membersCollection.createIndex({ id: 1 }, { unique: true });
    await membersCollection.createIndex({ fullName: 'text', phone: 'text' });
    
    console.log(`✓ Connected to MongoDB database: ${dbName}`);
    
    // Initialize default settings if not exists
    const existingSettings = await settingsCollection.findOne({ _id: 'config' });
    if (!existingSettings) {
      await settingsCollection.insertOne({
        _id: 'config',
        password: DEFAULT_PASSWORD,
        welcomeText: 'MAN O\'WAR NIG UNILAG\n(WATER UNIT)',
        logo: '',
        background: '',
        createdAt: new Date()
      });
      console.log('✓ Default settings initialized');
    }
    
  } catch (err) {
    console.error('✗ MongoDB Connection Error:', err.message);
    console.error('Please check your MONGO_URI in .env file');
    process.exit(1);
  }
}

// Connect to MongoDB
connectMongo();

// Serve static files
app.use(express.static(path.join(__dirname)));

// ==================== HEALTH CHECK ====================
app.get('/health', (req, res) => {
  res.status(mongoConnected ? 200 : 503).json({
    status: mongoConnected ? 'connected' : 'disconnected',
    database: mongoConnected ? 'MongoDB' : 'offline',
    timestamp: new Date().toISOString()
  });
});

// ==================== SETTINGS ENDPOINTS ====================

// GET settings
app.get('/api/settings/:id', async (req, res) => {
  const id = req.params.id;
  
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    if (id !== 'config') {
      return res.status(400).json({ error: 'Invalid settings ID' });
    }
    
    const doc = await settingsCollection.findOne({ _id: id });
    
    if (!doc) {
      return res.status(404).json({});
    }
    
    const { _id, ...rest } = doc;
    return res.json(rest);
    
  } catch (err) {
    console.error('Settings GET error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST settings (upsert)
app.post('/api/settings/:id', async (req, res) => {
  const id = req.params.id;
  const body = req.body || {};
  
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    if (id !== 'config') {
      return res.status(400).json({ error: 'Invalid settings ID' });
    }
    
    // Validate settings
    if (body.password && (typeof body.password !== 'string' || body.password.length < 6)) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    const updateData = {
      ...body,
      updatedAt: new Date()
    };
    
    await settingsCollection.updateOne(
      { _id: id },
      { $set: updateData },
      { upsert: true }
    );
    
    return res.status(200).json({ ok: true, message: 'Settings updated' });
    
  } catch (err) {
    console.error('Settings POST error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== MEMBERS ENDPOINTS ====================

// GET all members
app.get('/api/members', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const members = await membersCollection.find({})
      .sort({ dateAdded: -1 })
      .limit(1000)
      .toArray();
    
    return res.json(members);
    
  } catch (err) {
    console.error('Members GET error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// GET single member
app.get('/api/members/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const id = req.params.id;
    
    // Sanitize input
    if (!validator.isAlphanumeric(id.replace(/-/g, ''))) {
      return res.status(400).json({ error: 'Invalid member ID format' });
    }
    
    const member = await membersCollection.findOne({ id: id });
    
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    return res.json(member);
    
  } catch (err) {
    console.error('Member GET error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// POST new member
app.post('/api/members', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const member = req.body;
    
    // Validation
    if (!member.id || !member.fullName || !member.phone) {
      return res.status(400).json({ error: 'Missing required fields: id, fullName, phone' });
    }
    
    // Sanitize inputs
    if (member.fullName && member.fullName.length > 100) {
      return res.status(400).json({ error: 'Full name too long' });
    }
    
    if (!validator.isMobilePhone(member.phone.replace(/\D/g, '').slice(-10))) {
      return res.status(400).json({ error: 'Invalid phone number' });
    }
    
    if (member.email && !validator.isEmail(member.email)) {
      return res.status(400).json({ error: 'Invalid email' });
    }
    
    // Check if member already exists
    const existing = await membersCollection.findOne({ id: member.id });
    if (existing) {
      return res.status(409).json({ error: 'Member with this ID already exists' });
    }
    
    // Add metadata
    member.dateAdded = new Date();
    member._id = new ObjectId();
    
    const result = await membersCollection.insertOne(member);
    
    return res.status(201).json({
      ok: true,
      id: member.id,
      message: 'Member registered successfully',
      mongoId: result.insertedId
    });
    
  } catch (err) {
    console.error('Member POST error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// UPDATE member
app.put('/api/members/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const id = req.params.id;
    const updateData = req.body;
    
    // Sanitize input
    if (!validator.isAlphanumeric(id.replace(/-/g, ''))) {
      return res.status(400).json({ error: 'Invalid member ID format' });
    }
    
    // Don't allow changing ID
    delete updateData.id;
    delete updateData._id;
    delete updateData.dateAdded;
    
    updateData.updatedAt = new Date();
    
    const result = await membersCollection.updateOne(
      { id: id },
      { $set: updateData }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    return res.json({ ok: true, message: 'Member updated successfully' });
    
  } catch (err) {
    console.error('Member PUT error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// DELETE member
app.delete('/api/members/:id', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const id = req.params.id;
    
    // Sanitize input
    if (!validator.isAlphanumeric(id.replace(/-/g, ''))) {
      return res.status(400).json({ error: 'Invalid member ID format' });
    }
    
    const result = await membersCollection.deleteOne({ id: id });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ error: 'Member not found' });
    }
    
    return res.json({ ok: true, message: 'Member deleted successfully' });
    
  } catch (err) {
    console.error('Member DELETE error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// SEARCH members
app.get('/api/members/search/:query', async (req, res) => {
  try {
    if (!mongoConnected) {
      return res.status(503).json({ error: 'Database not connected' });
    }
    
    const query = req.params.query;
    
    if (query.length < 2) {
      return res.status(400).json({ error: 'Search query too short' });
    }
    
    // Escape special regex characters
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    const members = await membersCollection.find({
      $or: [
        { id: new RegExp(escapedQuery, 'i') },
        { fullName: new RegExp(escapedQuery, 'i') },
        { phone: new RegExp(escapedQuery, 'i') },
        { matricNumber: new RegExp(escapedQuery, 'i') }
      ]
    }).limit(50).toArray();
    
    return res.json(members);
    
  } catch (err) {
    console.error('Search error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ==================== ERROR HANDLING ====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== SERVER START ====================

const server = app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║  MOW Identification System             ║
║  Server running on port ${PORT}          ║
║  Environment: ${process.env.NODE_ENV || 'development'}       ║
╚════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  server.close(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  server.close(async () => {
    if (mongoClient) {
      await mongoClient.close();
    }
    process.exit(0);
  });
});

module.exports = app;
