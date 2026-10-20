const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https'); 
const cookieParser = require('cookie-parser'); 
const crypto = require('crypto'); 
require('dotenv').config();

const app = express();
const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT || 3000);
const TLS_CERT_PATH = process.env.POS_TLS_CERT;
const TLS_KEY_PATH = process.env.POS_TLS_KEY;
const USE_HTTPS = Boolean(TLS_CERT_PATH && TLS_KEY_PATH);
if (Boolean(TLS_CERT_PATH) !== Boolean(TLS_KEY_PATH)) {
  throw new Error('Set both POS_TLS_CERT and POS_TLS_KEY to enable HTTPS.');
}

const ADMIN_USERNAME = process.env.POS_ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.POS_ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD || ADMIN_PASSWORD.length < 16) {
  console.error('Set POS_ADMIN_USERNAME and a unique POS_ADMIN_PASSWORD of at least 16 characters.');
  process.exit(1);
}

// ── DATABASE FILEPATH MATRICES ──
const DATA_DIR = path.join(__dirname, 'database');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DB_PATH = path.join(DATA_DIR, 'products.json');
const LAPTOPS_PATH = path.join(DATA_DIR, 'laptops.json');
const SALES_PATH = path.join(DATA_DIR, 'sales.json'); 
const STORES_PATH = path.join(DATA_DIR, 'stores.json');
const OUTSOURCED_PATH = path.join(DATA_DIR, 'outsourced.json');
const SOFTWARE_PATH = path.join(DATA_DIR, 'software_installs.json');
const PENDING_PATH = path.join(DATA_DIR, 'pending_workshop.json');

app.use(cors());
app.use(express.json());
app.use(cookieParser()); 

const MOCK_USER = { username: ADMIN_USERNAME, password: ADMIN_PASSWORD };
const AUTH_COOKIE_NAME = "pos_session_token";
const SECRET_SESSION_VAL = crypto.randomBytes(32).toString('hex');

// Combined clean frontend dashboard routes from both versions
const DASHBOARD_ROUTES = [
  'stocktaking', 'purchase-invoices', 'sales', 'laptops', 'products',
  'cash-out', 'subscriptions', 'accounts', 'invoice-search', 'sales-return',
  'purchase-return', 'reports', 'scanner',
  'stores', 'outsourced-repairs', 'software-installations', 'pending-repairs'
];

// ── AUTHENTICATION GUARD MIDDLEWARE ──
function authGuard(req, res, next) {
  const cleanPath = req.path.toLowerCase().replace(/^\/|\/$/g, ''); // strip leading/trailing slashes

  // 1. Exclude public authentication endpoints and core assets from loops
  if (
    cleanPath === 'login' || 
    req.path.startsWith('/api/auth/') || 
    req.path.startsWith('/api/scan/')
  ) {
    return next();
  }

  // 2. Prevent manual access to raw .html files directly via URL bar (Redirects to clean path)
  if (req.path.endsWith('.html')) {
    const rawName = cleanPath.replace('.html', '');
    return res.redirect(rawName === 'index' ? '/' : `/${rawName}`);
  }

  // 3. Read the active authorization state cookie
  if (req.cookies[AUTH_COOKIE_NAME] === SECRET_SESSION_VAL) {
    return next(); 
  }

  // 4. If unauthorized, bounce straight back to clean login route
  console.log(`🔒 Unauthorized access blocked to: "${req.path}". Redirecting to /login.`);
  res.redirect('/login');
}

// Activate Auth Guard before serving any static elements
app.use(authGuard);

// ── CLEAN ROUTE MAPPING MATRIX ──

// Root Entry Point
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Login Page
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// Dynamically generate cleaner paths for every structural dashboard file
DASHBOARD_ROUTES.forEach(route => {
  app.get(`/${route}`, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', `${route}.html`));
  });
});

// Serve assets cleanly from the public folder
app.use(express.static(path.join(__dirname, 'public')));


// ── GENERIC I/O HELPERS ──
const readF = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return []; } };
const writeF = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);


// ── SYSTEM IDENTITY & SECURITY ENDPOINTS ──
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (username === MOCK_USER.username && password === MOCK_USER.password) {
    res.cookie(AUTH_COOKIE_NAME, SECRET_SESSION_VAL, { 
      maxAge: 24 * 60 * 60 * 1000, 
      httpOnly: true, 
      secure: USE_HTTPS,
      sameSite: 'strict'
    });
    return res.json({ success: true });
  }
  res.status(401).json({ error: 'Invalid username or password.' });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie(AUTH_COOKIE_NAME);
  res.json({ success: true });
});


// ── PRODUCT ENDPOINTS ──
app.get('/api/products', (req, res) => res.json(readF(DB_PATH)));

app.get('/api/scan/:barcode', (req, res) => {
  const products = readF(DB_PATH);
  const scannedBarcode = req.params.barcode.trim();
  const product = products.find(p => p.barcode && p.barcode.toString().trim() === scannedBarcode);

  if (!product) {
    return res.status(404).json({ error: 'Product not found', barcode: scannedBarcode });
  }
  res.json(product);
});

app.post('/api/products', (req, res) => {
  const products = readF(DB_PATH);
  const { name, barcode, buyPrice, sellPrice, quantity, details, category } = req.body;
  if (!name || !barcode) return res.status(400).json({ error: 'Name and barcode are required' });
  if (products.find(p => p.barcode === barcode)) return res.status(409).json({ error: 'Barcode already exists' });
  
  const product = {
    id: genId(), name, barcode,
    buyPrice: parseFloat(buyPrice) || 0,
    sellPrice: parseFloat(sellPrice) || 0,
    quantity: parseInt(quantity) || 0,
    details: details || '',
    category: category || 'General',
    addedAt: new Date().toISOString()
  };
  products.push(product);
  writeF(DB_PATH, products);
  res.status(201).json(product);
});

app.put('/api/products/:id', (req, res) => {
  const products = readF(DB_PATH);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, barcode, buyPrice, sellPrice, quantity, details, category } = req.body;
  
  const collision = products.find(p => p.barcode === barcode && p.id !== req.params.id);
  if (collision) return res.status(409).json({ error: 'Barcode already used by another product' });
  
  products[idx] = {
    ...products[idx],
    name: name ?? products[idx].name,
    barcode: barcode ?? products[idx].barcode,
    buyPrice: parseFloat(buyPrice) ?? products[idx].buyPrice,
    sellPrice: parseFloat(sellPrice) ?? products[idx].sellPrice,
    quantity: parseInt(quantity) ?? products[idx].quantity,
    details: details ?? products[idx].details,
    category: category ?? products[idx].category,
  };
  writeF(DB_PATH, products);
  res.json(products[idx]);
});

app.delete('/api/products/:id', (req, res) => {
  let products = readF(DB_PATH);
  const idx = products.findIndex(p => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  products.splice(idx, 1);
  writeF(DB_PATH, products);
  res.json({ ok: true });
});


// ── LAPTOP CUSTOM API ENDPOINTS ──
app.get('/api/laptops', (req, res) => res.json(readF(LAPTOPS_PATH)));

app.post('/api/laptops', (req, res) => {
  const laptops = readF(LAPTOPS_PATH);
  const { name, model, serialNumber, windowsKey, buyPrice, sellPrice, quantity, specs } = req.body;
  
  if (!name || !model || !serialNumber) {
    return res.status(400).json({ error: 'Name, Model, and Serial Number are strictly required' });
  }
  if (laptops.find(l => l.serialNumber === serialNumber)) {
    return res.status(409).json({ error: 'Serial Number already exists in database' });
  }
  
  const laptop = {
    id: genId(), name, model, serialNumber, windowsKey,
    buyPrice: parseFloat(buyPrice) || 0,
    sellPrice: parseFloat(sellPrice) || 0,
    quantity: parseInt(quantity) || 0,
    specs: specs || {},
    addedAt: new Date().toISOString()
  };
  laptops.push(laptop);
  writeF(LAPTOPS_PATH, laptops);
  res.status(201).json(laptop);
});

app.put('/api/laptops/:id', (req, res) => {
  const laptops = readF(LAPTOPS_PATH);
  const idx = laptops.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Laptop not found' });
  
  const { name, model, serialNumber, windowsKey, buyPrice, sellPrice, quantity, specs } = req.body;
  
  const collision = laptops.find(l => l.serialNumber === serialNumber && l.id !== req.params.id);
  if (collision) return res.status(409).json({ error: 'Serial Number already used by another laptop record' });
  
  laptops[idx] = {
    ...laptops[idx],
    name: name ?? laptops[idx].name,
    model: model ?? laptops[idx].model,
    serialNumber: serialNumber ?? laptops[idx].serialNumber,
    windowsKey: windowsKey ?? laptops[idx].windowsKey,
    buyPrice: parseFloat(buyPrice) ?? laptops[idx].buyPrice,
    sellPrice: parseFloat(sellPrice) ?? laptops[idx].sellPrice,
    quantity: parseInt(quantity) ?? laptops[idx].quantity,
    specs: specs ?? laptops[idx].specs
  };
  writeF(LAPTOPS_PATH, laptops);
  res.json(laptops[idx]);
});

app.delete('/api/laptops/:id', (req, res) => {
  let laptops = readF(LAPTOPS_PATH);
  const idx = laptops.findIndex(l => l.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Laptop not found' });
  laptops.splice(idx, 1);
  writeF(LAPTOPS_PATH, laptops);
  res.json({ ok: true });
});


// ── STORES CONSIGNMENT ENDPOINTS ──
app.get('/api/stores', (req, res) => res.json(readF(STORES_PATH)));
app.post('/api/stores', (req, res) => {
  const data = readF(STORES_PATH); 
  const item = { id: genId(), ...req.body, timestamp: new Date().toISOString() };
  data.push(item); writeF(STORES_PATH, data); res.status(201).json(item);
});
app.put('/api/stores/:id', (req, res) => {
  const data = readF(STORES_PATH); const idx = data.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not Found' });
  data[idx] = { ...data[idx], ...req.body }; writeF(STORES_PATH, data); res.json(data[idx]);
});
app.delete('/api/stores/:id', (req, res) => {
  let data = readF(STORES_PATH).filter(x => x.id !== req.params.id); writeF(STORES_PATH, data); res.json({ ok: true });
});


// ── OUTSOURCED HARDWARE REPAIRS ENDPOINTS ──
app.get('/api/outsourced', (req, res) => res.json(readF(OUTSOURCED_PATH)));
app.post('/api/outsourced', (req, res) => {
  const data = readF(OUTSOURCED_PATH); 
  const item = { id: genId(), ...req.body, timestamp: new Date().toISOString() };
  data.push(item); writeF(OUTSOURCED_PATH, data); res.status(201).json(item);
});
app.put('/api/outsourced/:id', (req, res) => {
  const data = readF(OUTSOURCED_PATH); const idx = data.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not Found' });
  data[idx] = { ...data[idx], ...req.body }; writeF(OUTSOURCED_PATH, data); res.json(data[idx]);
});
app.delete('/api/outsourced/:id', (req, res) => {
  let data = readF(OUTSOURCED_PATH).filter(x => x.id !== req.params.id); writeF(OUTSOURCED_PATH, data); res.json({ ok: true });
});


// ── SOFTWARE INSTALLATIONS ENDPOINTS ──
app.get('/api/software', (req, res) => res.json(readF(SOFTWARE_PATH)));
app.post('/api/software', (req, res) => {
  const data = readF(SOFTWARE_PATH); 
  const item = { id: genId(), ...req.body, timestamp: new Date().toISOString() };
  data.push(item); writeF(SOFTWARE_PATH, data); res.status(201).json(item);
});
app.put('/api/software/:id', (req, res) => {
  const data = readF(SOFTWARE_PATH); const idx = data.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not Found' });
  data[idx] = { ...data[idx], ...req.body }; writeF(SOFTWARE_PATH, data); res.json(data[idx]);
});
app.delete('/api/software/:id', (req, res) => {
  let data = readF(SOFTWARE_PATH).filter(x => x.id !== req.params.id); writeF(SOFTWARE_PATH, data); res.json({ ok: true });
});


// ── PENDING IN-HOUSE WORKSHOP TICKETS ENDPOINTS ──
app.get('/api/pending-repairs', (req, res) => res.json(readF(PENDING_PATH)));
app.post('/api/pending-repairs', (req, res) => {
  const data = readF(PENDING_PATH); 
  const item = { id: genId(), ...req.body, timestamp: new Date().toISOString() };
  data.push(item); writeF(PENDING_PATH, data); res.status(201).json(item);
});
app.put('/api/pending-repairs/:id', (req, res) => {
  const data = readF(PENDING_PATH); const idx = data.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not Found' });
  data[idx] = { ...data[idx], ...req.body }; writeF(PENDING_PATH, data); res.json(data[idx]);
});
app.delete('/api/pending-repairs/:id', (req, res) => {
  let data = readF(PENDING_PATH).filter(x => x.id !== req.params.id); writeF(PENDING_PATH, data); res.json({ ok: true });
});


// ── TRANSACTION ENDPOINTS ──
app.post('/api/sales/checkout', (req, res) => {
  const { items } = req.body; 
  if (!items || items.length === 0) return res.status(400).json({ error: "Cart is empty" });

  const products = readF(DB_PATH);
  const sales = readF(SALES_PATH);
  
  let totalOrderCost = 0;
  let totalOrderRevenue = 0;
  const soldItemsSummary = [];

  // 1. Validate total inventory checks safely before modifying files
  for (const line of items) {
    const matchedProduct = products.find(p => p.id === line.id);
    if (!matchedProduct) return res.status(444).json({ error: `Product reference mapping missing` });
    if (matchedProduct.quantity < line.checkoutQty) {
      return res.status(400).json({ error: `Insufficient stock for ${matchedProduct.name}` });
    }
  }

  // 2. Perform financial summaries and commit deductions
  for (const line of items) {
    const matchedProduct = products.find(p => p.id === line.id);
    matchedProduct.quantity -= line.checkoutQty;

    const lineCost = (matchedProduct.buyPrice || 0) * line.checkoutQty;
    const lineRevenue = (matchedProduct.sellPrice || 0) * line.checkoutQty;
    const lineProfit = lineRevenue - lineCost;

    totalOrderCost += lineCost;
    totalOrderRevenue += lineRevenue;

    soldItemsSummary.push({
      id: matchedProduct.id,
      name: matchedProduct.name,
      barcode: matchedProduct.barcode || '',
      qtySold: line.checkoutQty,
      buyPrice: matchedProduct.buyPrice || 0,
      sellPrice: matchedProduct.sellPrice || 0,
      totalRevenue: lineRevenue,
      totalProfit: lineProfit
    });
  }

  const transactionRecord = {
    saleId: "TX-" + genId().toUpperCase(),
    timestamp: new Date().toISOString(),
    items: soldItemsSummary,
    totalCost: totalOrderCost,
    totalRevenue: totalOrderRevenue,
    totalProfit: totalOrderRevenue - totalOrderCost
  };

  sales.unshift(transactionRecord); 
  writeF(SALES_PATH, sales);
  writeF(DB_PATH, products);

  res.status(200).json({ success: true, transactionRecord });
});

app.get('/api/sales/history', (req, res) => {
  const sales = readF(SALES_PATH);
  let totalRevenue = 0, totalProfit = 0, totalItemsSoldCount = 0;

  sales.forEach(tx => {
    totalRevenue += tx.totalRevenue;
    totalProfit += tx.totalProfit;
    tx.items.forEach(item => totalItemsSoldCount += item.qtySold);
  });

  res.json({
    history: sales,
    summary: { totalRevenue, totalProfit, totalItemsSoldCount }
  });
});

// ── EXCEL-STYLE RECEIPT REPORT ENDPOINT ──
app.get('/api/sales/excel-receipt', (req, res) => {
  const sales = readF(SALES_PATH);
  
  // Define column widths for layout alignment
  const pad = (str, len) => str.toString().padEnd(len).slice(0, len);
  
  let output = "";
  output += "=========================================================================================\n";
  output += "                                  SALES TRANSACTION REPORT                               \n";
  output += `Generated: ${new Date().toLocaleString()}\n`;
  output += "=========================================================================================\n\n";

  let grandRevenue = 0;
  let grandProfit = 0;

  sales.forEach(tx => {
    output += `Receipt ID: ${tx.saleId} | Date: ${new Date(tx.timestamp).toLocaleString()}\n`;
    output += "-----------------------------------------------------------------------------------------\n";
    // Excel Header Row
    output += `${pad("Product Name", 25)} | ${pad("Barcode", 15)} | ${pad("Qty", 6)} | ${pad("Cost Price", 12)} | ${pad("Sell Price", 12)} | ${pad("Total Rev.", 12)}\n`;
    output += "-----------------------------------------------------------------------------------------\n";

    tx.items.forEach(item => {
      output += `${pad(item.name, 25)} | ${pad(item.barcode, 15)} | ${pad(item.qtySold, 6)} | ${pad("$" + item.buyPrice.toFixed(2), 12)} | ${pad("$" + item.sellPrice.toFixed(2), 12)} | ${pad("$" + item.totalRevenue.toFixed(2), 12)}\n`;
    });

    output += "-----------------------------------------------------------------------------------------\n";
    output += `${pad("TX TOTALS:", 25)}   ${pad("", 15)}   ${pad("", 6)}   ${pad("Net Cost:", 12)} : $${tx.totalCost.toFixed(2)}\n`;
    output += `${pad("", 25)}   ${pad("", 15)}   ${pad("", 6)}   ${pad("Revenue:", 12)} : $${tx.totalRevenue.toFixed(2)}\n`;
    output += `${pad("", 25)}   ${pad("", 15)}   ${pad("", 6)}   ${pad("Profit:", 12)} : $${tx.totalProfit.toFixed(2)}\n`;
    output += "=========================================================================================\n\n";

    grandRevenue += tx.totalRevenue;
    grandProfit += tx.totalProfit;
  });

  output += "=========================================================================================\n";
  output += "                                   GRAND REPORT TOTALS                                   \n";
  output += "=========================================================================================\n";
  output += `Total Accumulated Revenue: $${grandRevenue.toFixed(2)}\n`;
  output += `Total Accumulated Profit:  $${grandProfit.toFixed(2)}\n`;
  output += "=========================================================================================\n";

  // Set header to plain text so browsers render it nicely like a text file layout
  res.setHeader('Content-Type', 'text/plain');
  res.send(output);
});

app.get('/api/info', (req, res) => {
  const interfaces = os.networkInterfaces();
  const ips = [];
  for (const iface of Object.values(interfaces)) {
    for (const addr of iface) {
      if (addr.family === 'IPv4' && !addr.internal) ips.push(addr.address);
    }
  }
  res.json({ port: PORT, ips });
});


if (USE_HTTPS) {
  const certOptions = {
    key: fs.readFileSync(TLS_KEY_PATH),
    cert: fs.readFileSync(TLS_CERT_PATH)
  };
  https.createServer(certOptions, app).listen(PORT, HOST, () => {
    console.log(`POS server listening over HTTPS at https://${HOST}:${PORT}`);
  });
} else {
  app.listen(PORT, HOST, () => {
    console.warn('POS server is using HTTP; keep it bound to localhost for local development.');
    console.log(`POS dashboard: http://${HOST}:${PORT}`);
  });
}