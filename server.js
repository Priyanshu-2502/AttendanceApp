const http = require('http');
const fs = require('fs');
const path = require('path');

// Ensure attendance.json exists
const DB_FILE = './attendance.json';
if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, '{}');

// Helper: read or write the JSON DB
function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch { return {}; }
}
function writeDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

const server = http.createServer((req, res) => {
  // API endpoints
  if (req.url.startsWith('/api/attendance/') && req.method === 'GET') {
    // GET /api/attendance/:className  (single class)
    const className = decodeURIComponent(req.url.split('/')[3]);
    const db = readDB();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(db[className] || {}));
  }
  if (req.url === '/api/attendance' && req.method === 'GET') {
    // GET /api/attendance  (all classes aggregated totals)
    const db = readDB();
    const totals = {};
    for (const cls in db) {
      totals[cls] = Object.values(db[cls]).reduce((s, v) => s + v, 0);
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(totals));
  }
  if (req.url === '/api/attendance' && req.method === 'POST') {
    // POST { class, date, count }  ->  save
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { class: cls, date, count } = JSON.parse(body);
        const db = readDB();
        if (!db[cls]) db[cls] = {};
        db[cls][date] = count;
        writeDB(db);
        res.writeHead(200);
        res.end('{}');
      } catch {
        res.writeHead(400);
        res.end('{}');
      }
    });
    return;
  }

  // Static file serving
  let filePath = '.' + req.url;
  if (filePath === './') {
    filePath = './login.html';
  }

  const extname = String(path.extname(filePath)).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.woff': 'application/font-woff',
    '.ttf': 'application/font-ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'application/font-otf',
    '.wasm': 'application/wasm'
  };

  const contentType = mimeTypes[extname] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>', 'utf-8');
      } else {
        res.writeHead(500);
        res.end('Sorry, check with the site admin for error: ' + error.code + ' ..\n');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
});
