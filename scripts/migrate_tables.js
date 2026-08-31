require('dotenv').config();
const mongoose = require('mongoose');

async function migrate() {
  const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mionco';
  await mongoose.connect(uri);
  const Table = mongoose.model('Table', new mongoose.Schema({}, { strict: false }));
  const res = await Table.updateMany({ status: 'Air Menu Order' }, { status: 'Occupied' });
  console.log('Tables successfully migrated to Occupied:', res.modifiedCount);
  await mongoose.disconnect();
}

migrate().catch(console.error);
