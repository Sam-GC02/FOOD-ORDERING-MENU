// node backup.js            -> copy data/db.json into backups/
// node backup.js restore <file in backups/>  -> restore it
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'data', 'db.json'), dir = path.join(__dirname, 'backups');
fs.mkdirSync(dir, { recursive: true });
if (process.argv[2] === 'restore') {
  const f = process.argv[3];
  if (!f || !fs.existsSync(path.join(dir, f))) { console.log('Usage: node backup.js restore <file in backups/>'); process.exit(1); }
  fs.copyFileSync(path.join(dir, f), src); console.log('Restored from', f);
} else {
  const f = `db-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  fs.copyFileSync(src, path.join(dir, f)); console.log('Backup created:', f);
}
