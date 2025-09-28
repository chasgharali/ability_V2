const AWS = require('aws-sdk');
const logger = require('./logger');

// Configure AWS SDK from env; credentials/region are picked from process.env
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

const ses = new AWS.SES({ apiVersion: '2010-12-01' });

async function sendVerificationEmail(toEmail, verifyLink, appVerifyLink) {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@localhost';
  const subject = 'welcome to abilityconnect.com, please verify your email address';

  const fallbackLink = appVerifyLink || verifyLink;
  const buttonStyle = 'display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600';
  const containerStyle = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;background:#f5f5f5;padding:16px';
  const cardStyle = 'background:#ececec;border-radius:6px;padding:16px;margin:auto;max-width:640px';

  const html = `
    <div style="${containerStyle}">
      <div style="${cardStyle}">
        <p style="margin:0 0 8px 0; color:#111">welcome to abilityconnect.com, please verify your email address</p>
        <p style="margin:12px 0">Please click the button below to verify your email address:</p>
        <p style="margin:16px 0"><a href="${verifyLink}" target="_blank" rel="noopener" style="${buttonStyle}">Verify Email</a></p>
        <p style="margin:16px 0">If the button above doesn't work, please use the following link:</p>
        <p style="margin:8px 0"><a href="${fallbackLink}" target="_blank" rel="noopener" style="color:#1d4ed8">${fallbackLink}</a></p>
        <p style="margin-top:16px; color:#111"><strong>Attention:</strong> Chrome browser is required. Please copy the link into the Chrome browser if Chrome is not your default browser.</p>
      </div>
    </div>
  `;
  const text = `Welcome to abilityconnect.com, please verify your email address\n\nVerify Email: ${verifyLink}\n\nIf the button above doesn't work, use this link: ${fallbackLink}\n\nAttention: Chrome browser is required. Please copy the link into Chrome if it is not your default browser.`;

  const params = {
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Body: {
        Html: { Charset: 'UTF-8', Data: html },
        Text: { Charset: 'UTF-8', Data: text }
      },
      Subject: { Charset: 'UTF-8', Data: subject }
    },
    Source: fromEmail
  };

  try {
    const resp = await ses.sendEmail(params).promise();
    logger.info(`SES verification email sent to ${toEmail}: ${resp.MessageId}`);
    return true;
  } catch (err) {
    logger.error('SES sendVerificationEmail error:', err);
    return false;
  }
}

module.exports = {
  sendVerificationEmail
};
