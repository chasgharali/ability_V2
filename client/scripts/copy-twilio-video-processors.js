const fs = require('fs');
const path = require('path');

const sourceDir = path.join(
  __dirname,
  '..',
  'node_modules',
  '@twilio',
  'video-processors',
  'dist',
  'build'
);
const targetDir = path.join(__dirname, '..', 'public', 'twilio-video-processors');

if (!fs.existsSync(sourceDir)) {
  console.warn(
    '[copy-twilio-video-processors] Source not found. Run npm install first:',
    sourceDir
  );
  process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });

for (const entry of fs.readdirSync(sourceDir)) {
  fs.copyFileSync(path.join(sourceDir, entry), path.join(targetDir, entry));
}

console.log('[copy-twilio-video-processors] Copied assets to public/twilio-video-processors');
