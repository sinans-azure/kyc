const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({ connectionString: process.env.POSTGRES_CONNECTION_STRING });
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

module.exports = async function (context, myQueueItem) {
  try {
    const payload = typeof myQueueItem === 'string' ? JSON.parse(myQueueItem) : myQueueItem;
    const { requestId, userEmail, age, premium } = payload;

    if (!requestId || !userEmail || premium == null) {
      context.log('Invalid queue message payload');
      return;
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: userEmail,
      subject: 'Your insurance premium is ready',
      text: `Hello,

Your insurance request (${requestId}) has been processed.

Extracted age: ${age}
Premium amount: $${premium}

Thank you for using Sinan Banking.`
    });

    await pool.query('UPDATE insurance_requests SET email_sent = true, updated_at = now() WHERE id = $1', [requestId]);
    context.log(`Email sent for request ${requestId}`);
  } catch (error) {
    context.log('Email function failed:', error.message || error);
    throw error;
  }
};
