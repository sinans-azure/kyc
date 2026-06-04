const { FormRecognizerClient, AzureKeyCredential } = require('@azure/ai-form-recognizer');
const { BlobServiceClient, StorageSharedKeyCredential } = require('@azure/storage-blob');
const { ServiceBusClient } = require('@azure/service-bus');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const storageAccountName = process.env.STORAGE_ACCOUNT_NAME;
const storageAccountKey = process.env.STORAGE_ACCOUNT_KEY;
const storageContainerName = process.env.STORAGE_CONTAINER_NAME || 'insurance-docs';
const formRecognizerEndpoint = process.env.FORM_RECOGNIZER_ENDPOINT;
const formRecognizerApiKey = process.env.FORM_RECOGNIZER_API_KEY;
const serviceBusConnectionString = process.env.SERVICE_BUS_CONNECTION_STRING;
const queueName = process.env.EMAIL_QUEUE_NAME || 'insurance-email-queue';
const pool = new Pool({ connectionString: process.env.POSTGRES_CONNECTION_STRING });

function parseAge(text) {
  const agePatterns = [/(?:Age|age|AGE)[:\s]*(\d{1,3})/, /(\d{1,3})\s*(?:years|yrs|yr)/i];
  for (const pattern of agePatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return parseInt(match[1], 10);
    }
  }
  return 35;
}

function computePremium(age) {
  if (age < 25) return 240.0;
  if (age < 40) return 190.0;
  if (age < 60) return 160.0;
  return 220.0;
}

function extractTextFromPages(pages) {
  if (!pages || !pages.length) {
    return '';
  }

  return pages
    .flatMap(page => (page.lines || []).map(line => line.text))
    .join(' ');
}

function getContentType(blobName) {
  if (blobName.endsWith('.pdf')) return 'application/pdf';
  if (blobName.endsWith('.png')) return 'image/png';
  if (blobName.endsWith('.jpg') || blobName.endsWith('.jpeg')) return 'image/jpeg';
  return 'application/octet-stream';
}

function createBlobServiceClient() {
  if (!storageAccountName || !storageAccountKey) {
    throw new Error('Missing storage account configuration');
  }

  return new BlobServiceClient(
    `https://${storageAccountName}.blob.core.windows.net`,
    new StorageSharedKeyCredential(storageAccountName, storageAccountKey)
  );
}

function createFormRecognizerClient() {
  if (!formRecognizerEndpoint || !formRecognizerApiKey) {
    throw new Error('Missing Form Recognizer configuration');
  }
  return new FormRecognizerClient(formRecognizerEndpoint, new AzureKeyCredential(formRecognizerApiKey));
}

async function recognizeDocument(blobName) {
  const blobServiceClient = createBlobServiceClient();
  const containerClient = blobServiceClient.getContainerClient(storageContainerName);
  const blobClient = containerClient.getBlobClient(blobName);
  const downloadResponse = await blobClient.download();
  const buffer = await streamToBuffer(downloadResponse.readableStreamBody);
  const contentType = getContentType(blobName);

  const formRecognizerClient = createFormRecognizerClient();
  const poller = await formRecognizerClient.beginRecognizeContent(buffer, { contentType });
  const pages = await poller.pollUntilDone();
  return extractTextFromPages(pages);
}

async function streamToBuffer(readableStream) {
  const chunks = [];
  for await (const chunk of readableStream) {
    chunks.push(chunk instanceof Buffer ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function sendEmailRequest(requestId, userEmail, age, premium) {
  if (!serviceBusConnectionString) {
    throw new Error('Missing SERVICE_BUS_CONNECTION_STRING');
  }

  const sbClient = new ServiceBusClient(serviceBusConnectionString);
  const sender = sbClient.createSender(queueName);

  try {
    await sender.sendMessages({
      body: {
        requestId,
        userEmail,
        age,
        premium
      }
    });
  } finally {
    await sender.close();
    await sbClient.close();
  }
}

module.exports = async function (context, req) {
  try {
    const { requestId, blobName, userEmail } = req.body || {};

    if (!requestId || !blobName || !userEmail) {
      context.res = {
        status: 400,
        body: { error: 'requestId, blobName, and userEmail are required.' }
      };
      return;
    }

    const rawText = await recognizeDocument(blobName);
    const age = parseAge(rawText);
    const premium = computePremium(age);

    await pool.query(
      'UPDATE insurance_requests SET age = $1, premium = $2, status = $3, updated_at = now() WHERE id = $4',
      [age, premium, 'Processed', requestId]
    );

    await sendEmailRequest(requestId, userEmail, age, premium);

    context.res = {
      status: 200,
      body: {
        requestId,
        age,
        premium,
        message: 'OCR completed and email request queued.'
      }
    };
  } catch (error) {
    context.log('OCR function error:', error.message || error);
    context.res = {
      status: 500,
      body: { error: 'OCR processing failed.' }
    };
  }
};
