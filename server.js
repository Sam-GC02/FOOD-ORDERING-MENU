// FoodFlow: Express REST API + event-driven integration (Node EventEmitter) + JSON file storage (no SQL)
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const EventEmitter = require('events');

const DB_FILE = path.join(__dirname, 'data', 'db.json');
const bus = new EventEmitter();          // the event bus (integration layer)
const sessions = {};                     // token -> userId

// ---------- data layer ----------
const load = () => JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
const save = (db) => fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
const now = () => new Date().toISOString();
const uid = (p) => `${p}-${crypto.randomBytes(3).toString('hex')}`;
const pub = (u) => ({ id: u.id, username: u.username, name: u.name, role: u.role });

function audit(actor, action, target, details = '') {
  const db = load();
  db.auditLogs.push({ id: uid('A'), time: now(), actor, action, target, details });
  save(db);
}
function integrationLog(txn, event, status, message) {
  const db = load();
  db.integrationLogs.push({ id: uid('I'), txn, time: now(), event, status, message });
  save(db);
}

// ---------- integration: event listeners ----------
// One event -> (1) audit log, (2) notification log per recipient, (3) integration log (success/failed)
const TEXT = {
  'order.placed': (o) => `Order ${o.id} placed`,
  'order.statusChanged': (o) => `Order ${o.id} is now ${o.status}`,
  'order.riderAssigned': (o) => `Order ${o.id}: rider ${o.riderName} assigned`
};
function recipients(db, type, o) {
  if (type === 'order.placed') return [o.customerId, ...db.users.filter((u) => u.role === 'kitchen').map((u) => u.id)];
  if (type === 'order.riderAssigned') return [o.customerId, o.riderId];
  return [o.customerId];
}
function sendSms(db, userId, message) {   // simulated SMS gateway
  const u = db.users.find((x) => x.id === userId);
  if (!u) throw new Error('Recipient not found');
  if (!u.phone) throw new Error(`No phone number on file for ${u.username}`);
  db.notifications.push({ id: uid('N'), time: now(), userId, channel: 'SMS (simulated)', message });
}
Object.keys(TEXT).forEach((type) => {
  bus.on(type, ({ order, actor, txn }) => {
    audit(actor, type, order.id, `status=${order.status}`);
    for (const r of recipients(load(), type, order)) {
      const db = load();
      try { sendSms(db, r, TEXT[type](order)); save(db); integrationLog(txn, type, 'SUCCESS', `Notification sent to ${r}`); }
      catch (e) { integrationLog(txn, type, 'FAILED', e.message); }   // a failed notification never blocks the order
    }
  });
});
const emit = (type, order, req) => bus.emit(type, { order, actor: req.user.username, txn: uid('TXN') });

// ---------- app + security middleware ----------
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const u = sessions[t] && load().users.find((x) => x.id === sessions[t]);
  if (!u) return res.status(401).json({ error: 'Please log in' });
  req.user = u; next();
}
const deny = (req, res) => {
  audit(req.user.username, 'access.denied', req.originalUrl, `role=${req.user.role}`);
  return res.status(403).json({ error: 'You do not have permission to do this' });
};
const allow = (...roles) => (req, res, next) => (roles.includes(req.user.role) ? next() : deny(req, res));

// ---------- routes ----------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  const u = load().users.find((x) => x.username === username);
  if (!u || !bcrypt.compareSync(password, u.passwordHash)) {
    audit(String(username), 'login.failed', 'auth');
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  const token = crypto.randomBytes(16).toString('hex');
  sessions[token] = u.id;
  audit(u.username, 'login.success', 'auth');
  res.json({ token, user: pub(u) });
});

app.get('/api/menu', auth, (req, res) => res.json(load().menu.filter((m) => m.available)));

app.post('/api/orders', auth, allow('customer'), (req, res) => {
  const { items, address, paymentMethod } = req.body || {};
  const db = load();
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Add at least one item' });
  if (!address || !String(address).trim()) return res.status(400).json({ error: 'Delivery address is required' });
  if (!['COD', 'GCash (simulated)'].includes(paymentMethod)) return res.status(400).json({ error: 'Invalid payment method' });
  const lines = [];
  for (const it of items) {
    const m = db.menu.find((x) => x.id === it.menuId && x.available);
    const qty = Number(it.qty);
    if (!m || !Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: 'Invalid item or quantity' });
    lines.push({ menuId: m.id, name: m.name, price: m.price, qty });
  }
  const order = {
    id: uid('ORD'), customerId: req.user.id, customerName: req.user.name, items: lines,
    total: lines.reduce((s, l) => s + l.price * l.qty, 0), address: String(address).trim(), paymentMethod,
    paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid', status: 'Placed', riderId: null, riderName: null,
    history: [{ status: 'Placed', time: now(), by: req.user.username }], createdAt: now()
  };
  db.orders.push(order); save(db);
  emit('order.placed', order, req);
  res.status(201).json(order);
});

app.get('/api/orders', auth, (req, res) => {
  const { orders } = load(); const r = req.user.role;
  const list = r === 'customer' ? orders.filter((o) => o.customerId === req.user.id)
    : r === 'rider' ? orders.filter((o) => o.riderId === req.user.id) : orders;
  res.json(list.slice().reverse());
});

const FLOW = {   // current status -> [next status, roles allowed]
  Placed: ['Preparing', ['kitchen', 'admin']],
  Preparing: ['Ready', ['kitchen', 'admin']],
  Ready: ['Out for Delivery', ['rider', 'admin']],
  'Out for Delivery': ['Delivered', ['rider', 'admin']]
};
app.patch('/api/orders/:id/status', auth, (req, res) => {
  const db = load(); const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const { status } = req.body || {}; const role = req.user.role;
  if (status === 'Cancelled') {
    const ownCustomer = role === 'customer' && o.customerId === req.user.id;
    if (!ownCustomer && role !== 'admin') return deny(req, res);
    if (o.status !== 'Placed') return res.status(400).json({ error: 'Only orders that are still Placed can be cancelled' });
  } else {
    const step = FLOW[o.status];
    if (!step || step[0] !== status) return res.status(400).json({ error: `Cannot change from ${o.status} to ${status}` });
    if (!step[1].includes(role)) return deny(req, res);
    if (role === 'rider' && o.riderId !== req.user.id) return deny(req, res);
    if (status === 'Out for Delivery' && !o.riderId) return res.status(400).json({ error: 'Assign a rider first' });
  }
  o.status = status;
  if (status === 'Delivered' && o.paymentMethod === 'COD') o.paymentStatus = 'Paid';
  o.history.push({ status, time: now(), by: req.user.username });
  save(db);
  emit('order.statusChanged', o, req);
  res.json(o);
});

app.patch('/api/orders/:id/assign', auth, allow('kitchen', 'admin'), (req, res) => {
  const db = load(); const o = db.orders.find((x) => x.id === req.params.id);
  if (!o) return res.status(404).json({ error: 'Order not found' });
  const rider = db.users.find((u) => u.id === (req.body || {}).riderId && u.role === 'rider');
  if (!rider) return res.status(400).json({ error: 'A valid rider is required' });
  if (!['Preparing', 'Ready'].includes(o.status)) return res.status(400).json({ error: 'Rider can only be assigned while Preparing or Ready' });
  o.riderId = rider.id; o.riderName = rider.name;
  o.history.push({ status: `Rider assigned: ${rider.name}`, time: now(), by: req.user.username });
  save(db);
  emit('order.riderAssigned', o, req);
  res.json(o);
});

app.get('/api/riders', auth, allow('kitchen', 'admin'), (req, res) => res.json(load().users.filter((u) => u.role === 'rider').map(pub)));

app.get('/api/users', auth, allow('admin'), (req, res) => res.json(load().users.map(pub)));
app.post('/api/users', auth, allow('admin'), (req, res) => {
  const { username, name, role, password, phone } = req.body || {};
  const db = load();
  if (!username || !name || !password) return res.status(400).json({ error: 'Username, name and password are required' });
  if (!['customer', 'kitchen', 'rider', 'admin'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (db.users.some((u) => u.username === username)) return res.status(409).json({ error: 'Username already exists' });
  const u = { id: uid('U'), username, name, role, phone: phone || '', passwordHash: bcrypt.hashSync(password, 8) };
  db.users.push(u); save(db);
  audit(req.user.username, 'user.created', u.id, `role=${role}`);
  res.status(201).json(pub(u));
});

app.get('/api/notifications', auth, (req, res) => {
  const { notifications } = load();
  res.json((req.user.role === 'admin' ? notifications : notifications.filter((n) => n.userId === req.user.id)).slice().reverse());
});
app.get('/api/audit-logs', auth, allow('admin'), (req, res) => res.json(load().auditLogs.slice().reverse()));
app.get('/api/integration-logs', auth, allow('admin'), (req, res) => res.json(load().integrationLogs.slice().reverse()));

app.get('/api/reports', auth, allow('admin', 'kitchen'), (req, res) => {
  const { orders } = load(); const byStatus = {}; const items = {};
  orders.forEach((o) => { byStatus[o.status] = (byStatus[o.status] || 0) + 1; if (o.status !== 'Cancelled') o.items.forEach((i) => { items[i.name] = (items[i.name] || 0) + i.qty; }); });
  res.json({
    totalOrders: orders.length, byStatus,
    revenue: orders.filter((o) => o.status === 'Delivered').reduce((s, o) => s + o.total, 0),
    topItems: Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 5)
  });
});

// ---------- error handling ----------
app.use((err, req, res, next) => res.status(err.type === 'entity.parse.failed' ? 400 : 500).json({ error: err.type === 'entity.parse.failed' ? 'Invalid JSON' : 'Server error' }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FoodFlow running at http://localhost:${PORT}`));
