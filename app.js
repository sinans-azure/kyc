const path = require('path');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const axios = require('axios');
const { BlobServiceClient } = require('@azure/storage-blob');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const storageContainerName = process.env.STORAGE_CONTAINER_NAME || 'insurance-docs';
const ocrFunctionUrl = process.env.OCR_FUNCTION_URL;

const dbConfig = { connectionString: process.env.POSTGRES_CONNECTION_STRING };

if (
  (process.env.POSTGRES_CONNECTION_STRING && process.env.POSTGRES_CONNECTION_STRING.includes('azure.com')) ||
  (process.env.POSTGRES_CONNECTION_STRING && process.env.POSTGRES_CONNECTION_STRING.includes('sslmode=require'))
) {
  dbConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(dbConfig);

const upload = multer({ storage: multer.memoryStorage() });

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id SERIAL PRIMARY KEY,
      user_email TEXT NOT NULL,
      type TEXT NOT NULL,
      balance NUMERIC(12,2) NOT NULL,
      currency TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      user_email TEXT NOT NULL,
      description TEXT NOT NULL,
      amount NUMERIC(12,2) NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS insurance_requests (
      id SERIAL PRIMARY KEY,
      user_email TEXT NOT NULL,
      full_name TEXT NOT NULL,
      status TEXT NOT NULL,
      blob_name TEXT NOT NULL,
      age INTEGER,
      premium NUMERIC(12,2),
      email_sent BOOLEAN DEFAULT false,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
    );
  `);

  await pool.query(`
    INSERT INTO users (email, name)
    SELECT 'demo@bank.com', 'Demo User'
    WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = 'demo@bank.com');

    INSERT INTO accounts (user_email, type, balance, currency)
    SELECT 'demo@bank.com', 'Checking', 3250.75, 'USD'
    WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_email = 'demo@bank.com' AND type = 'Checking');

    INSERT INTO accounts (user_email, type, balance, currency)
    SELECT 'demo@bank.com', 'Savings', 12890.00, 'USD'
    WHERE NOT EXISTS (SELECT 1 FROM accounts WHERE user_email = 'demo@bank.com' AND type = 'Savings');

    INSERT INTO transactions (user_email, description, amount, type)
    SELECT 'demo@bank.com', 'Salary deposit', 4200.00, 'credit'
    WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE user_email = 'demo@bank.com' AND description = 'Salary deposit');

    INSERT INTO transactions (user_email, description, amount, type)
    SELECT 'demo@bank.com', 'Electric bill', -120.45, 'debit'
    WHERE NOT EXISTS (SELECT 1 FROM transactions WHERE user_email = 'demo@bank.com' AND description = 'Electric bill');
  `);
}

function getBlobServiceClient() {

  if (!connectionString) {
    throw new Error('Missing AZURE_STORAGE_CONNECTION_STRING');
  }

  return BlobServiceClient.fromConnectionString(connectionString);
}

async function uploadToBlob(blobName, buffer, contentType) {
  const blobServiceClient = getBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(storageContainerName);
  await containerClient.createIfNotExists();
  const blockBlob = containerClient.getBlockBlobClient(blobName);
  await blockBlob.uploadData(buffer, { blobHTTPHeaders: { blobContentType: contentType } });
  return blobName;
}

async function callOcrFunction(requestId, blobName, userEmail) {
  if (!ocrFunctionUrl) {
    throw new Error('OCR_FUNCTION_URL is not configured');
  }

  await axios.post(ocrFunctionUrl, {
    requestId,
    blobName,
    userEmail
  }, {
    timeout: 30000,
    headers: { 'Content-Type': 'application/json' }
  });
}

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }
  if (email === 'demo@bank.com' && password === 'Password123') {
    return res.json({
      user: {
        name: 'Demo User',
        email: 'demo@bank.com'
      }
    });
  }
  return res.status(401).json({ error: 'Invalid credentials' });
});

app.get('/api/accounts', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, type, balance, currency FROM accounts WHERE user_email = $1', ['demo@bank.com']);
    return res.json(result.rows);
  } catch (error) {
    console.error('Accounts fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch accounts' });
  }
});

app.get('/api/transactions', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, description, amount, type, created_at FROM transactions WHERE user_email = $1 ORDER BY created_at DESC LIMIT 10', ['demo@bank.com']);
    return res.json(result.rows);
  } catch (error) {
    console.error('Transactions fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

app.get('/api/insurance', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, full_name, user_email, status, age, premium, email_sent, created_at FROM insurance_requests WHERE user_email = $1 ORDER BY created_at DESC', ['demo@bank.com']);
    return res.json(result.rows);
  } catch (error) {
    console.error('Insurance fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch insurance requests' });
  }
});

app.post('/api/insurance/request', upload.single('document'), async (req, res) => {
  try {
    const { fullName, email } = req.body;
    const file = req.file;

    if (!fullName || !email || !file) {
      return res.status(400).json({ error: 'Full name, email, and a document file are required.' });
    }

    // Sanitize file name to avoid issues with special characters
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const blobName = `${uuidv4()}-${safeFileName}`;
    await uploadToBlob(blobName, file.buffer, file.mimetype);

    const result = await pool.query(
      'INSERT INTO insurance_requests (user_email, full_name, status, blob_name, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now()) RETURNING id',
      [email, fullName, 'Pending', blobName]
    );

    const requestId = result.rows[0].id;
    
    // Non-blocking OCR call
    callOcrFunction(requestId, blobName, email).catch(ocrError => {
      console.error(`OCR processing failed for request ${requestId}:`, ocrError.message || ocrError);
    });

    return res.status(202).json({ requestId, status: 'Pending', message: 'Insurance request submitted.' });
  } catch (error) {
    console.error('Insurance request failed:', error.message || error);
    return res.status(500).json({ error: 'Failed to submit insurance request.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const port = process.env.PORT || 8080;
app.listen(port, async () => {
  if (!process.env.POSTGRES_CONNECTION_STRING) {
    console.error('⚠️ WARNING: POSTGRES_CONNECTION_STRING is not set in the environment variables. Database connections will fail.');
  }

  try {
    await ensureSchema();
    console.log('Database schema verified.');
  } catch (error) {
    console.warn('Schema setup failed:', error.message || error);
  }

  console.log(`App Service demo running on port ${port}`);
});
