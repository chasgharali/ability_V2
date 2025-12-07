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
    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.error('AWS SES credentials not configured', {
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        toEmail
      });
      return false;
    }

    // Log configuration before sending
    logger.info(`Attempting to send email to ${toEmail}`, {
      fromEmail,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const resp = await ses.sendEmail(params).promise();
    logger.info(`SES verification email sent to ${toEmail}: ${resp.MessageId}`);
    return true;
  } catch (err) {
    // Provide more detailed error information
    const errorDetails = {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId,
      toEmail,
      fromEmail
    };

    // Common error messages and solutions
    if (err.code === 'InvalidClientTokenId' || err.message.includes('security token')) {
      errorDetails.solution = 'AWS credentials are invalid or expired. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'SignatureDoesNotMatch') {
      errorDetails.solution = 'AWS secret access key is incorrect. Please verify AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'AccessDenied' || err.message.includes('not authorized')) {
      errorDetails.solution = 'AWS credentials do not have permission to send emails via SES. Please verify IAM permissions.';
    } else if (err.code === 'MessageRejected' || err.message.includes('Email address not verified')) {
      errorDetails.solution = 'The sender email address is not verified in AWS SES. Please verify the email address in AWS SES console.';
    }

    logger.error('SES sendVerificationEmail error:', errorDetails);
    return false;
  }
}

async function sendPasswordResetEmail(toEmail, resetLink) {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@localhost';
  const subject = 'Reset your password - abilityconnect.com';

  const buttonStyle = 'display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600';
  const containerStyle = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;background:#f5f5f5;padding:16px';
  const cardStyle = 'background:#ececec;border-radius:6px;padding:16px;margin:auto;max-width:640px';

  const html = `
    <div style="${containerStyle}">
      <div style="${cardStyle}">
        <p style="margin:0 0 8px 0; color:#111">Reset your password</p>
        <p style="margin:12px 0">You requested to reset your password. Please click the button below to reset it:</p>
        <p style="margin:16px 0"><a href="${resetLink}" target="_blank" rel="noopener" style="${buttonStyle}">Reset Password</a></p>
        <p style="margin:16px 0">If the button above doesn't work, please use the following link:</p>
        <p style="margin:8px 0"><a href="${resetLink}" target="_blank" rel="noopener" style="color:#1d4ed8">${resetLink}</a></p>
        <p style="margin-top:16px; color:#666; font-size:12px;">This link will expire in 1 hour. If you didn't request a password reset, please ignore this email.</p>
      </div>
    </div>
  `;
  const text = `Reset your password\n\nYou requested to reset your password. Please use the following link to reset it:\n\n${resetLink}\n\nThis link will expire in 1 hour. If you didn't request a password reset, please ignore this email.`;

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
    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.error('AWS SES credentials not configured', {
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        toEmail
      });
      return false;
    }

    // Log configuration before sending
    logger.info(`Attempting to send password reset email to ${toEmail}`, {
      fromEmail,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const resp = await ses.sendEmail(params).promise();
    logger.info(`SES password reset email sent to ${toEmail}: ${resp.MessageId}`);
    return true;
  } catch (err) {
    // Provide more detailed error information
    const errorDetails = {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId,
      toEmail,
      fromEmail
    };

    // Common error messages and solutions
    if (err.code === 'InvalidClientTokenId' || err.message.includes('security token')) {
      errorDetails.solution = 'AWS credentials are invalid or expired. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'SignatureDoesNotMatch') {
      errorDetails.solution = 'AWS secret access key is incorrect. Please verify AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'AccessDenied' || err.message.includes('not authorized')) {
      errorDetails.solution = 'AWS credentials do not have permission to send emails via SES. Please verify IAM permissions.';
    } else if (err.code === 'MessageRejected' || err.message.includes('Email address not verified')) {
      errorDetails.solution = 'The sender email address is not verified in AWS SES. Please verify the email address in AWS SES console.';
    }

    logger.error('SES sendPasswordResetEmail error:', errorDetails);
    return false;
  }
}

async function sendEmailChangeVerificationEmail(toEmail, verifyLink) {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@localhost';
  const subject = 'Verify your new email address - abilityconnect.com';

  const buttonStyle = 'display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600';
  const containerStyle = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;background:#f5f5f5;padding:16px';
  const cardStyle = 'background:#ececec;border-radius:6px;padding:16px;margin:auto;max-width:640px';

  const html = `
    <div style="${containerStyle}">
      <div style="${cardStyle}">
        <p style="margin:0 0 8px 0; color:#111">Verify your new email address</p>
        <p style="margin:12px 0">You requested to change your email address. Please click the button below to verify your new email address:</p>
        <p style="margin:16px 0"><a href="${verifyLink}" target="_blank" rel="noopener" style="${buttonStyle}">Verify New Email</a></p>
        <p style="margin:16px 0">If the button above doesn't work, please use the following link:</p>
        <p style="margin:8px 0"><a href="${verifyLink}" target="_blank" rel="noopener" style="color:#1d4ed8">${verifyLink}</a></p>
        <p style="margin-top:16px; color:#666; font-size:12px;">This link will expire in 24 hours. If you didn't request an email change, please ignore this email.</p>
      </div>
    </div>
  `;
  const text = `Verify your new email address\n\nYou requested to change your email address. Please use the following link to verify your new email:\n\n${verifyLink}\n\nThis link will expire in 24 hours. If you didn't request an email change, please ignore this email.`;

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
    // Check if AWS credentials are configured
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.error('AWS SES credentials not configured', {
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        toEmail
      });
      return false;
    }

    // Log configuration before sending
    logger.info(`Attempting to send email change verification email to ${toEmail}`, {
      fromEmail,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const resp = await ses.sendEmail(params).promise();
    logger.info(`SES email change verification email sent to ${toEmail}: ${resp.MessageId}`);
    return true;
  } catch (err) {
    // Provide more detailed error information
    const errorDetails = {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId,
      toEmail,
      fromEmail
    };

    // Common error messages and solutions
    if (err.code === 'InvalidClientTokenId' || err.message.includes('security token')) {
      errorDetails.solution = 'AWS credentials are invalid or expired. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'SignatureDoesNotMatch') {
      errorDetails.solution = 'AWS secret access key is incorrect. Please verify AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'AccessDenied' || err.message.includes('not authorized')) {
      errorDetails.solution = 'AWS credentials do not have permission to send emails via SES. Please verify IAM permissions.';
    } else if (err.code === 'MessageRejected' || err.message.includes('Email address not verified')) {
      errorDetails.solution = 'The sender email address is not verified in AWS SES. Please verify the email address in AWS SES console.';
    }

    logger.error('SES sendEmailChangeVerificationEmail error:', errorDetails);
    return false;
  }
}

async function sendEmailChangedNotificationOldEmail(oldEmail, newEmail, userName) {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@localhost';
  const subject = 'Your email address has been changed - abilityconnect.com';

  const buttonStyle = 'display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600';
  const containerStyle = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;background:#f5f5f5;padding:16px';
  const cardStyle = 'background:#ececec;border-radius:6px;padding:16px;margin:auto;max-width:640px';

  const html = `
    <div style="${containerStyle}">
      <div style="${cardStyle}">
        <p style="margin:0 0 8px 0; color:#111">Your email address has been changed</p>
        <p style="margin:12px 0">Hello ${userName || 'there'},</p>
        <p style="margin:12px 0">Your email address has been changed from <strong>${oldEmail}</strong> to <strong>${newEmail}</strong>.</p>
        <p style="margin:12px 0">If you did not request this change, please contact support immediately.</p>
        <p style="margin-top:16px; color:#666; font-size:12px;">This is an automated notification from abilityconnect.com</p>
      </div>
    </div>
  `;
  const text = `Your email address has been changed\n\nHello ${userName || 'there'},\n\nYour email address has been changed from ${oldEmail} to ${newEmail}.\n\nIf you did not request this change, please contact support immediately.\n\nThis is an automated notification from abilityconnect.com`;

  const params = {
    Destination: { ToAddresses: [oldEmail] },
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
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.error('AWS SES credentials not configured', {
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        toEmail: oldEmail
      });
      return false;
    }

    logger.info(`Attempting to send email change notification to old email ${oldEmail}`, {
      fromEmail,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const resp = await ses.sendEmail(params).promise();
    logger.info(`SES email change notification sent to old email ${oldEmail}: ${resp.MessageId}`);
    return true;
  } catch (err) {
    const errorDetails = {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId,
      toEmail: oldEmail,
      fromEmail
    };

    if (err.code === 'InvalidClientTokenId' || err.message.includes('security token')) {
      errorDetails.solution = 'AWS credentials are invalid or expired. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'SignatureDoesNotMatch') {
      errorDetails.solution = 'AWS secret access key is incorrect. Please verify AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'AccessDenied' || err.message.includes('not authorized')) {
      errorDetails.solution = 'AWS credentials do not have permission to send emails via SES. Please verify IAM permissions.';
    } else if (err.code === 'MessageRejected' || err.message.includes('Email address not verified')) {
      errorDetails.solution = 'The sender email address is not verified in AWS SES. Please verify the email address in AWS SES console.';
    }

    logger.error('SES sendEmailChangedNotificationOldEmail error:', errorDetails);
    return false;
  }
}

async function sendEmailChangedNotificationNewEmail(newEmail, userName) {
  const fromEmail = process.env.AWS_SES_FROM_EMAIL || 'noreply@localhost';
  const subject = 'Congratulations! Your email address has been updated - abilityconnect.com';

  const buttonStyle = 'display:inline-block;padding:10px 16px;background:#2563eb;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:600';
  const containerStyle = 'font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111;line-height:1.6;background:#f5f5f5;padding:16px';
  const cardStyle = 'background:#ececec;border-radius:6px;padding:16px;margin:auto;max-width:640px';

  const html = `
    <div style="${containerStyle}">
      <div style="${cardStyle}">
        <p style="margin:0 0 8px 0; color:#111">Congratulations! Your email address has been updated</p>
        <p style="margin:12px 0">Hello ${userName || 'there'},</p>
        <p style="margin:12px 0">Congratulations! Your email address has been successfully updated to <strong>${newEmail}</strong>.</p>
        <p style="margin:12px 0">You can now use this email address to log in to your account on abilityconnect.com.</p>
        <p style="margin-top:16px; color:#666; font-size:12px;">This is an automated notification from abilityconnect.com</p>
      </div>
    </div>
  `;
  const text = `Congratulations! Your email address has been updated\n\nHello ${userName || 'there'},\n\nCongratulations! Your email address has been successfully updated to ${newEmail}.\n\nYou can now use this email address to log in to your account on abilityconnect.com.\n\nThis is an automated notification from abilityconnect.com`;

  const params = {
    Destination: { ToAddresses: [newEmail] },
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
    if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
      logger.error('AWS SES credentials not configured', {
        hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
        hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
        toEmail: newEmail
      });
      return false;
    }

    logger.info(`Attempting to send email change notification to new email ${newEmail}`, {
      fromEmail,
      hasAccessKey: !!process.env.AWS_ACCESS_KEY_ID,
      hasSecretKey: !!process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const resp = await ses.sendEmail(params).promise();
    logger.info(`SES email change notification sent to new email ${newEmail}: ${resp.MessageId}`);
    return true;
  } catch (err) {
    const errorDetails = {
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      requestId: err.requestId,
      toEmail: newEmail,
      fromEmail
    };

    if (err.code === 'InvalidClientTokenId' || err.message.includes('security token')) {
      errorDetails.solution = 'AWS credentials are invalid or expired. Please check AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'SignatureDoesNotMatch') {
      errorDetails.solution = 'AWS secret access key is incorrect. Please verify AWS_SECRET_ACCESS_KEY in your .env file.';
    } else if (err.code === 'AccessDenied' || err.message.includes('not authorized')) {
      errorDetails.solution = 'AWS credentials do not have permission to send emails via SES. Please verify IAM permissions.';
    } else if (err.code === 'MessageRejected' || err.message.includes('Email address not verified')) {
      errorDetails.solution = 'The sender email address is not verified in AWS SES. Please verify the email address in AWS SES console.';
    }

    logger.error('SES sendEmailChangedNotificationNewEmail error:', errorDetails);
    return false;
  }
}

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendEmailChangeVerificationEmail,
  sendEmailChangedNotificationOldEmail,
  sendEmailChangedNotificationNewEmail
};
