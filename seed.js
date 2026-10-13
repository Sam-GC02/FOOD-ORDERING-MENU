// Creates data/db.json with SAMPLE data only. Re-run to reset the system.
const bcrypt = require('bcryptjs');
const fs = require('fs');
const h = (p) => bcrypt.hashSync(p, 8);
const db = {
  users: [
    { id: 'U-1', username: 'admin',     name: 'Ana Admin',    role: 'admin',    phone: '0917-000-0001', passwordHash: h('admin123') },
    { id: 'U-2', username: 'kitchen1',  name: 'Kito Cook',    role: 'kitchen',  phone: '0917-000-0002', passwordHash: h('kitchen123') },
    { id: 'U-3', username: 'rider1',    name: 'Rico Rider',   role: 'rider',    phone: '0917-000-0003', passwordHash: h('rider123') },
    { id: 'U-4', username: 'rider2',    name: 'Rina Rider',   role: 'rider',    phone: '0917-000-0004', passwordHash: h('rider123') },
    { id: 'U-5', username: 'customer1', name: 'Carlo Customer', role: 'customer', phone: '0917-000-0005', passwordHash: h('cust123') },
    // customer2 has no phone on purpose: the simulated SMS fails, which shows error handling in the integration log
    { id: 'U-6', username: 'customer2', name: 'Cathy Customer', role: 'customer', phone: '', passwordHash: h('cust123') }
  ],
  menu: [
    { id: 'M-1', name: 'Chicken Adobo Rice', price: 120, available: true },
    { id: 'M-2', name: 'Pork Sinigang', price: 150, available: true },
    { id: 'M-3', name: 'Beef Tapa Silog', price: 135, available: true },
    { id: 'M-4', name: 'Pancit Canton', price: 95, available: true },
    { id: 'M-5', name: 'Halo-Halo', price: 85, available: true },
    { id: 'M-6', name: 'Iced Tea', price: 40, available: true }
  ],
  orders: [], notifications: [], auditLogs: [], integrationLogs: []
};
fs.mkdirSync('data', { recursive: true });
fs.writeFileSync('data/db.json', JSON.stringify(db, null, 2));
console.log('Sample data created in data/db.json');
