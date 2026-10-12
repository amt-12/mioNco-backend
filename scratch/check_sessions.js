require('dotenv').config();
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Order = require('../models/Order');
const DiningSession = require('../models/DiningSession');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const startDay = new Date('2026-10-10T18:30:00.000Z');
  const endDay = new Date('2026-10-11T18:29:59.999Z');

  const bills = await Bill.find({ createdAt: { $gte: startDay, $lte: endDay } })
    .populate('orders')
    .populate('session');

  console.log('--- Details of all 7 bills on Oct 11 ---');
  for (const b of bills) {
    console.log(`Bill: ${b.billNumber}, Status: ${b.paymentStatus}, Final: ${b.finalAmount}`);
    console.log(`  covers: ${b.covers}, pax: ${b.pax}`);
    console.log(`  session:`, b.session ? { id: b.session._id, guests: b.session.guests, pax: b.session.pax } : 'no session');
    console.log(`  orders:`, (b.orders || []).map(o => ({ id: o.orderId, pax: o.pax, guests: o.guests })));
  }

  // Let's also check all DiningSessions on Oct 11
  const sessions = await DiningSession.find({ createdAt: { $gte: startDay, $lte: endDay } });
  console.log('\n--- All DiningSessions on Oct 11 (Count: ' + sessions.length + ') ---');
  sessions.forEach(s => {
    console.log({ id: s._id, sessionId: s.sessionId, table: s.table, guests: s.guests, pax: s.pax, status: s.status, bills: s.bills });
  });

  await mongoose.disconnect();
}

run().catch(console.error);
