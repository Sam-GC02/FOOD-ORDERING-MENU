# FoodFlow - Integrated Food Ordering, Kitchen Queue, and Delivery Tracking System (Prototype)

Stack: HTML + CSS + vanilla JavaScript (front end), Node.js + Express (REST API), JSON file storage (no SQL).

## Run
    npm install
    npm run seed     # creates sample data in data/db.json (re-run any time to reset)
    npm start        # open http://localhost:3000
    npm test         # run in a second terminal while the server is running (20 test cases)
    npm run backup   # copy data/db.json into backups/   (restore: node backup.js restore <file>)

## Demo accounts (sample data only)
| Role | Username | Password |
|---|---|---|
| Admin | admin | admin123 |
| Kitchen | kitchen1 | kitchen123 |
| Rider | rider1 / rider2 | rider123 |
| Customer | customer1 / customer2 | cust123 |

customer2 has no phone number on purpose, so the simulated SMS fails and a FAILED entry appears in the Integration Log.

## Demo flow
1. customer1: Order Food -> place an order.
2. kitchen1: Start preparing -> Mark ready -> Assign rider (Rico Rider).
3. rider1: Out for delivery -> Mark delivered.
4. customer1: My Orders / Notifications show each step.
5. admin: Dashboard, Notification Log, Audit Log, Integration Log (transaction IDs, SUCCESS/FAILED).

## Integration component
Event-driven: every order change emits an event (order.placed, order.statusChanged, order.riderAssigned) on a Node EventEmitter.
Listeners write the audit log, the notification log (simulated SMS), and the integration log.
