const mongoose = require('mongoose');
const Customer = require('./models/Customer');
const Bill = require('./models/Bill');
const Order = require('./models/Order');
const DiningSession = require('./models/DiningSession');
const Reservation = require('./models/Reservation');

async function test() {
  await mongoose.connect('mongodb+srv://amrit0207232_db_user:NBhIPTvnw09HiZrD@mionco.qpr5j7h.mongodb.net/');
  
  const cust = await Customer.findOne({ phone: /5555/ });
  console.log('Customer:', cust);

  const sessions = await DiningSession.find({ customer: cust._id }).populate('orders').populate('bills');
  console.log('Sessions for customer:', sessions.length, JSON.stringify(sessions, null, 2));

  const allSessions = await DiningSession.find({}).populate('customer');
  console.log('All Sessions with customers:', allSessions.map(s => ({ id: s._id, cust: s.customer, activeBill: s.activeBill, billCount: s.bills?.length })));

  const orders = await Order.find({ customer: cust._id });
  console.log('Orders with customer direct:', orders.length);

  const resList = await Reservation.find({ customer: cust._id });
  console.log('Reservations for customer:', resList.length);

  process.exit(0);
}

test().catch(err => {
  console.error(err);
  process.exit(1);
});
