require('dotenv').config();
const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Order = require('../models/Order');
const DiningSession = require('../models/DiningSession');
const Table = require('../models/Table');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected successfully');

  // 1. Check Oct 11 bills, covers, pax, orders
  const startDay = new Date('2026-10-10T18:30:00.000Z'); // 00:00 IST Oct 11
  const endDay = new Date('2026-10-11T18:29:59.999Z');   // 23:59:59.999 IST Oct 11

  const oct11Bills = await Bill.find({
    createdAt: { $gte: startDay, $lte: endDay }
  }).populate('orders').populate('table').populate('session');

  console.log('\n=== OCT 11 BILLS ===');
  for (const b of oct11Bills) {
    console.log({
      billNumber: b.billNumber,
      status: b.status,
      paymentStatus: b.paymentStatus,
      isNC: b.isNonChargeableBill,
      subtotal: b.subtotal,
      finalAmount: b.finalAmount,
      covers: b.covers,
      pax: b.pax,
      sessionGuests: b.session?.guests,
      sessionPax: b.session?.pax,
      tableCapacity: b.table?.capacity,
      orders: (b.orders || []).map(o => ({ orderId: o.orderId, pax: o.pax, guests: o.guests, total: o.total }))
    });
  }

  // Check Oct 11 standalone orders (orders on Oct 11)
  const oct11Orders = await Order.find({
    createdAt: { $gte: startDay, $lte: endDay }
  });
  console.log('\n=== OCT 11 ORDERS ===');
  for (const o of oct11Orders) {
    console.log({
      orderId: o.orderId,
      status: o.status,
      paymentStatus: o.paymentStatus,
      pax: o.pax,
      guests: o.guests,
      total: o.total,
      bill: o.bill
    });
  }

  // 2. Check Oct 1 to Oct 11 (MTD)
  const mtdStart = new Date('2026-09-30T18:30:00.000Z'); // 00:00 IST Oct 1
  const mtdEnd = endDay;

  const mtdBills = await Bill.find({
    createdAt: { $gte: mtdStart, $lte: mtdEnd },
    status: { $nin: ['Cancelled', 'Voided', 'Merged'] },
    paymentStatus: { $nin: ['Cancelled', 'Voided', 'Merged'] }
  }).populate('orders');

  console.log(`\n=== MTD BILLS (Count: ${mtdBills.length}) ===`);
  let billGrossTotal = 0;
  let billNetTotal = 0;
  let billDiscTotal = 0;
  let billTaxTotal = 0;
  let billSCTotal = 0;
  let ncBillGrossTotal = 0;
  let ncBillNetTotal = 0;
  const countedOrders = new Set();

  mtdBills.forEach(b => {
    const isNC = b.isNonChargeableBill || b.isComplimentaryBill || b.paymentStatus === 'Non-Chargeable';
    const disc = Number((b.billDiscountAmount || 0) + (b.itemLevelDiscounts || 0));
    const net = Math.max(0, (b.subtotal || 0) - disc);
    const tax = b.totalTaxAmount || 0;
    const sc = (b.serviceChargeEnabled !== false && b.serviceChargeRate !== 0) ? (b.serviceChargeAmount || 0) : 0;
    const gross = b.finalAmount || (net + tax + sc);

    if (isNC) {
      ncBillGrossTotal += gross;
      ncBillNetTotal += (b.subtotal || 0);
    } else {
      billGrossTotal += gross;
      billNetTotal += net;
      billDiscTotal += disc;
      billTaxTotal += tax;
      billSCTotal += sc;
    }

    (b.orders || []).forEach(o => {
      const id = o._id ? o._id.toString() : o.toString();
      countedOrders.add(id);
    });
  });

  console.log({
    billGrossTotal,
    billNetTotal,
    billDiscTotal,
    billTaxTotal,
    billSCTotal,
    ncBillGrossTotal,
    ncBillNetTotal
  });

  // Check MTD standalone orders
  const mtdOrders = await Order.find({
    createdAt: { $gte: mtdStart, $lte: mtdEnd },
    status: { $nin: ['Cancelled'] },
    paymentStatus: { $in: ['Paid', 'Completed'] }
  });

  console.log(`\n=== MTD ORDERS (Total: ${mtdOrders.length}) ===`);
  let unbilledOrdersGross = 0;
  let unbilledOrdersNet = 0;
  const unbilledOrdersList = [];

  mtdOrders.forEach(o => {
    if (!countedOrders.has(o._id.toString())) {
      unbilledOrdersGross += (o.total || 0);
      unbilledOrdersNet += (o.subtotal || 0);
      unbilledOrdersList.push({
        orderId: o.orderId,
        createdAt: o.createdAt,
        total: o.total,
        subtotal: o.subtotal,
        tax: o.tax,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod,
        bill: o.bill
      });
    }
  });

  console.log('Unbilled Paid Orders:', unbilledOrdersList.length);
  console.log('Unbilled Orders Gross:', unbilledOrdersGross, 'Net:', unbilledOrdersNet);
  if (unbilledOrdersList.length > 0) {
    console.log(JSON.stringify(unbilledOrdersList, null, 2));
  }

  // Also check if any bills have payments.paidAt or other date filtering
  const mtdBillsPaidAt = await Bill.find({
    'payments.paidAt': { $gte: mtdStart, $lte: mtdEnd },
    status: { $nin: ['Cancelled', 'Voided', 'Merged'] },
    paymentStatus: { $nin: ['Cancelled', 'Voided', 'Merged'] }
  });
  console.log('\nMTD Bills by payments.paidAt count:', mtdBillsPaidAt.length);

  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  mongoose.disconnect();
});
