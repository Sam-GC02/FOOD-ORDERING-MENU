// Run with the server running: npm start (terminal 1), npm test (terminal 2). Reset data first with: npm run seed
const BASE = process.env.BASE || 'http://localhost:3000/api';
let pass = 0, fail = 0;
async function call(path, method = 'GET', body, token) {
  const r = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
const check = (id, name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${name}`); };
const login = async (u, p) => (await call('/login', 'POST', { username: u, password: p })).data.token;

(async () => {
  check('TC-01', 'Login with wrong password is rejected (401)', (await call('/login', 'POST', { username: 'admin', password: 'x' })).status === 401);
  const admin = await login('admin', 'admin123'), kit = await login('kitchen1', 'kitchen123');
  const r1 = await login('rider1', 'rider123'), r2 = await login('rider2', 'rider123');
  const c1 = await login('customer1', 'cust123'), c2 = await login('customer2', 'cust123');
  check('TC-02', 'All roles can log in', [admin, kit, r1, r2, c1, c2].every(Boolean));
  check('TC-03', 'No token is rejected (401)', (await call('/orders')).status === 401);
  check('TC-04', 'Empty order is rejected (400)', (await call('/orders', 'POST', { items: [], address: 'x', paymentMethod: 'COD' }, c1)).status === 400);
  check('TC-05', 'Invalid quantity is rejected (400)', (await call('/orders', 'POST', { items: [{ menuId: 'M-1', qty: 99 }], address: 'x', paymentMethod: 'COD' }, c1)).status === 400);
  const o = (await call('/orders', 'POST', { items: [{ menuId: 'M-1', qty: 2 }, { menuId: 'M-6', qty: 1 }], address: 'Quezon City', paymentMethod: 'GCash (simulated)' }, c1));
  check('TC-06', 'Customer places a valid order (201, total 280)', o.status === 201 && o.data.total === 280);
  const id = o.data.id;
  check('TC-07', 'Customer cannot view audit log (403)', (await call('/audit-logs', 'GET', null, c1)).status === 403);
  check('TC-08', 'Customer cannot start preparing (403)', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Preparing' }, c1)).status === 403);
  check('TC-09', 'Skipping a step is rejected (400)', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Ready' }, kit)).status === 400);
  check('TC-10', 'Kitchen starts preparing', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Preparing' }, kit)).status === 200);
  check('TC-11', 'Kitchen marks ready', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Ready' }, kit)).status === 200);
  check('TC-12', 'Out for delivery without rider is rejected (400)', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Out for Delivery' }, admin)).status === 400);
  check('TC-13', 'Kitchen assigns rider1', (await call(`/orders/${id}/assign`, 'PATCH', { riderId: 'U-3' }, kit)).status === 200);
  check('TC-14', 'Unassigned rider2 cannot deliver it (403)', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Out for Delivery' }, r2)).status === 403);
  check('TC-15', 'Rider1 picks up', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Out for Delivery' }, r1)).status === 200);
  check('TC-16', 'Rider1 delivers', (await call(`/orders/${id}/status`, 'PATCH', { status: 'Delivered' }, r1)).status === 200);
  const hist = (await call('/orders', 'GET', null, c1)).data.find((x) => x.id === id);
  check('TC-17', 'Order history records every step', hist && hist.history.length >= 6);
  check('TC-18', 'Customer received notifications (integration)', (await call('/notifications', 'GET', null, c1)).data.length >= 4);
  const audit = (await call('/audit-logs', 'GET', null, admin)).data;
  check('TC-19', 'Audit log has events and denied-access attempts', audit.some((a) => a.action === 'order.statusChanged') && audit.some((a) => a.action === 'access.denied'));
  await call('/orders', 'POST', { items: [{ menuId: 'M-4', qty: 1 }], address: 'Manila', paymentMethod: 'COD' }, c2);
  const logs = (await call('/integration-logs', 'GET', null, admin)).data;
  check('TC-20', 'Integration log shows SUCCESS and FAILED (no phone) entries', logs.some((l) => l.status === 'SUCCESS') && logs.some((l) => l.status === 'FAILED'));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
