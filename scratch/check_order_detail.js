require('dotenv').config();
const mongoose = require('mongoose');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const Table = require('../models/Table');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const order = await Order.findOne({ orderId: 'ORD-ISCYC7' });
  console.log('Order ORD-ISCYC7:', {
    items: order.items.map(i => ({ name: i.foodName, qty: i.quantity, price: i.unitPrice })),
    pax: order.pax,
    guests: order.guests,
    table: order.table
  });

  const table = await Table.findById(order.table);
  console.log('Table for ORD-ISCYC7:', table?.tableNumber, table?.name, table?.capacity);

  const allTables = await Table.find({});
  console.log('All tables:', allTables.map(t => ({ id: t._id, num: t.tableNumber, name: t.name, cap: t.capacity })));

  await mongoose.disconnect();
}

run().catch(console.error);
