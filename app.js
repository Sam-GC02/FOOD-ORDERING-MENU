let token = null, user = null, riders = [];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const peso = (n) => '₱' + Number(n).toFixed(2);
const when = (t) => new Date(t).toLocaleString();
const cls = (s) => s.split(' ')[0];

async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}
function flash(msg, ok = true) { $('#flash').innerHTML = `<div class="${ok ? 'ok' : 'err'}">${esc(msg)}</div>`; setTimeout(() => ($('#flash').innerHTML = ''), 4000); }
const table = (heads, rows) => `<table><tr>${heads.map((h) => `<th>${h}</th>`).join('')}</tr>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</table>`;

// ----- views -----
const VIEWS = {
  customer: { 'Order Food': menuView, 'My Orders': ordersView, 'Notifications': notifView },
  kitchen: { 'Kitchen Queue': ordersView, 'Reports': dashView },
  rider: { 'My Deliveries': ordersView },
  admin: { 'Dashboard': dashView, 'Orders': ordersView, 'Users': usersView, 'Notifications': notifView, 'Audit Log': auditView, 'Integration Log': intView }
};

function loginView() {
  $('#nav').innerHTML = ''; $('#who').innerHTML = '';
  $('#main').innerHTML = `<div class="card" style="max-width:340px;margin:40px auto"><h2>Login</h2>
    <input id="u" placeholder="Username"><br><input id="p" type="password" placeholder="Password"><br><br>
    <button onclick="login()">Login</button>
    <p><small>Demo: admin / admin123, kitchen1 / kitchen123, rider1 / rider123, customer1 / cust123</small></p></div>`;
}
async function login() {
  try {
    const r = await api('/login', 'POST', { username: $('#u').value, password: $('#p').value });
    token = r.token; user = r.user; start();
  } catch (e) { flash(e.message, false); }
}
function logout() { token = user = null; loginView(); }

function start() {
  const views = VIEWS[user.role];
  $('#who').innerHTML = `${esc(user.name)} (${user.role}) <button onclick="logout()">Logout</button>`;
  $('#nav').innerHTML = Object.keys(views).map((n) => `<button data-n="${n}">${n}</button>`).join('');
  document.querySelectorAll('#nav button').forEach((b) => (b.onclick = () => show(b.dataset.n)));
  show(Object.keys(views)[0]);
}
async function show(name) {
  document.querySelectorAll('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.n === name));
  $('#main').innerHTML = 'Loading…';
  try { await VIEWS[user.role][name](); } catch (e) { $('#main').innerHTML = ''; flash(e.message, false); }
}
const refresh = () => show(document.querySelector('#nav button.on').dataset.n);

async function menuView() {
  const menu = await api('/menu');
  $('#main').innerHTML = `<div class="card"><h2>Menu</h2>${menu.map((m) => `<div class="row"><span>${esc(m.name)} <small>${peso(m.price)}</small></span>
    <input type="number" id="q-${m.id}" min="0" max="20" value="0" style="width:70px"></div>`).join('')}
    <p>Address: <input id="addr" placeholder="Delivery address" style="width:60%"></p>
    <p>Payment: <select id="pay"><option>COD</option><option>GCash (simulated)</option></select></p>
    <button onclick="placeOrder()">Place order</button></div>`;
  window._menu = menu;
}
async function placeOrder() {
  const items = window._menu.map((m) => ({ menuId: m.id, qty: Number($('#q-' + m.id).value) })).filter((i) => i.qty > 0);
  try { const o = await api('/orders', 'POST', { items, address: $('#addr').value, paymentMethod: $('#pay').value }); flash(`Order ${o.id} placed (${peso(o.total)})`); show('My Orders'); }
  catch (e) { flash(e.message, false); }
}

function actions(o) {
  const r = user.role, a = [];
  const btn = (label, st) => `<button onclick="setStatus('${o.id}','${st}')">${label}</button>`;
  if (r === 'customer' && o.status === 'Placed') a.push(btn('Cancel order', 'Cancelled'));
  if (['kitchen', 'admin'].includes(r)) {
    if (o.status === 'Placed') a.push(btn('Start preparing', 'Preparing'));
    if (o.status === 'Preparing') a.push(btn('Mark ready', 'Ready'));
    if (['Preparing', 'Ready'].includes(o.status)) a.push(`<select id="r-${o.id}">${riders.map((x) => `<option value="${x.id}" ${x.id === o.riderId ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button onclick="assign('${o.id}')">Assign rider</button>`);
  }
  if (['rider', 'admin'].includes(r)) {
    if (o.status === 'Ready') a.push(btn('Out for delivery', 'Out for Delivery'));
    if (o.status === 'Out for Delivery') a.push(btn('Mark delivered', 'Delivered'));
  }
  return a.join(' ');
}
async function ordersView() {
  if (['kitchen', 'admin'].includes(user.role)) riders = await api('/riders');
  const orders = await api('/orders');
  $('#main').innerHTML = orders.length ? orders.map((o) => `<div class="card">
    <div class="row"><b>${o.id}</b><span class="badge ${cls(o.status)}">${esc(o.status)}</span></div>
    <div>${o.items.map((i) => `${i.qty}× ${esc(i.name)}`).join(', ')} — <b>${peso(o.total)}</b></div>
    <small>${esc(o.customerName)} · ${esc(o.address)} · ${esc(o.paymentMethod)} (${o.paymentStatus}) · Rider: ${esc(o.riderName || 'not assigned')}</small>
    <div><small>History: ${o.history.map((h) => esc(h.status)).join(' → ')}</small></div>
    <div style="margin-top:8px">${actions(o)}</div></div>`).join('') : '<div class="card">No orders yet.</div>';
}
async function setStatus(id, status) { try { await api(`/orders/${id}/status`, 'PATCH', { status }); flash(`Order is now ${status}`); refresh(); } catch (e) { flash(e.message, false); } }
async function assign(id) { try { await api(`/orders/${id}/assign`, 'PATCH', { riderId: $('#r-' + id).value }); flash('Rider assigned'); refresh(); } catch (e) { flash(e.message, false); } }

async function dashView() {
  const r = await api('/reports');
  $('#main').innerHTML = `<div class="card"><h2>Dashboard</h2><p>Total orders: <b>${r.totalOrders}</b> · Delivered revenue: <b>${peso(r.revenue)}</b></p>
    <h3>Orders by status</h3>${table(['Status', 'Count'], Object.entries(r.byStatus).map(([k, v]) => [esc(k), v]))}
    <h3>Top items</h3>${table(['Item', 'Qty'], r.topItems.map(([k, v]) => [esc(k), v]))}</div>`;
}
async function usersView() {
  const users = await api('/users');
  $('#main').innerHTML = `<div class="card"><h2>Users and Roles</h2>${table(['ID', 'Username', 'Name', 'Role'], users.map((u) => [u.id, esc(u.username), esc(u.name), u.role]))}</div>
    <div class="card"><h3>Add user</h3><input id="nu" placeholder="username"><input id="nn" placeholder="full name"><input id="np" type="password" placeholder="password">
    <input id="nph" placeholder="phone (optional)"><select id="nr"><option>customer</option><option>kitchen</option><option>rider</option><option>admin</option></select> <button onclick="addUser()">Add</button></div>`;
}
async function addUser() {
  try { await api('/users', 'POST', { username: $('#nu').value, name: $('#nn').value, password: $('#np').value, phone: $('#nph').value, role: $('#nr').value }); flash('User created'); refresh(); }
  catch (e) { flash(e.message, false); }
}
async function notifView() {
  const n = await api('/notifications');
  $('#main').innerHTML = `<div class="card"><h2>Notification Log</h2>${table(['Time', 'To', 'Channel', 'Message'], n.map((x) => [when(x.time), x.userId, esc(x.channel), esc(x.message)]))}</div>`;
}
async function auditView() {
  const a = await api('/audit-logs');
  $('#main').innerHTML = `<div class="card"><h2>Audit Log</h2>${table(['Time', 'Actor', 'Action', 'Target', 'Details'], a.map((x) => [when(x.time), esc(x.actor), esc(x.action), esc(x.target), esc(x.details)]))}</div>`;
}
async function intView() {
  const l = await api('/integration-logs');
  $('#main').innerHTML = `<div class="card"><h2>Integration Log</h2>${table(['Time', 'Transaction ID', 'Event', 'Status', 'Message'], l.map((x) => [when(x.time), x.txn, esc(x.event), `<span class="badge ${x.status}">${x.status}</span>`, esc(x.message)]))}</div>`;
}
loginView();
