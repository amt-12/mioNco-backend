require('dotenv').config();
const mongoose = require('mongoose');
const Bill = require('../models/Bill');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);

  const mtdStart = new Date('2026-09-30T18:30:00.000Z'); // Oct 1 00:00 IST
  const mtdEnd = new Date('2026-10-11T18:29:59.999Z');   // Oct 11 23:59:59.999 IST

  const bills = await Bill.find({
    createdAt: { $gte: mtdStart, $lte: mtdEnd },
    status: { $nin: ['Cancelled', 'Voided', 'Merged'] },
    paymentStatus: { $nin: ['Cancelled', 'Voided', 'Merged'] }
  }).sort({ createdAt: 1 });

  console.log(`Total MTD bills found: ${bills.length}`);

  const byDay = {};

  bills.forEach(b => {
    // Convert createdAt to IST (UTC + 5.5 hours)
    const istDate = new Date(b.createdAt.getTime() + 5.5 * 3600 * 1000);
    const dayKey = istDate.toISOString().slice(0, 10);

    if (!byDay[dayKey]) {
      byDay[dayKey] = {
        billsCount: 0,
        ncCount: 0,
        subtotal: 0,
        discounts: 0,
        taxes: 0,
        sc: 0,
        gross: 0,
        net: 0,
        billNumbers: []
      };
    }

    const isNC = b.isNonChargeableBill || b.isComplimentaryBill || b.paymentStatus === 'Non-Chargeable';
    if (isNC) {
      byDay[dayKey].ncCount++;
    } else {
      byDay[dayKey].billsCount++;
      const disc = Number((b.billDiscountAmount || 0) + (b.itemLevelDiscounts || 0));
      const net = Math.max(0, (b.subtotal || 0) - disc);
      const tax = b.totalTaxAmount || 0;
      const sc = (b.serviceChargeEnabled !== false && b.serviceChargeRate !== 0) ? (b.serviceChargeAmount || 0) : 0;
      const gross = b.finalAmount || (net + tax + sc);

      byDay[dayKey].subtotal += (b.subtotal || 0);
      byDay[dayKey].discounts += disc;
      byDay[dayKey].taxes += tax;
      byDay[dayKey].sc += sc;
      byDay[dayKey].net += net;
      byDay[dayKey].gross += gross;
      byDay[dayKey].billNumbers.push(b.billNumber);
    }
  });

  console.log('--- Daily Breakdown (IST) ---');
  let cumGross = 0;
  let cumNet = 0;
  for (const [day, d] of Object.entries(byDay)) {
    cumGross += d.gross;
    cumNet += d.net;
    console.log(`${day}: Bills=${d.billsCount}, NC=${d.ncCount}, Gross=₹${d.gross.toFixed(2)}, Net=₹${d.net.toFixed(2)}, Tax=₹${d.taxes.toFixed(2)}, Disc=₹${d.discounts.toFixed(2)} | CumGross=₹${cumGross.toFixed(2)}, CumNet=₹${cumNet.toFixed(2)}`);
  }

  // Also check if any bill has finalAmount == 797
  const bill797 = bills.filter(b => Math.abs(b.finalAmount - 797) < 1 || Math.abs(b.subtotal - 797) < 1);
  if (bill797.length > 0) {
    console.log('\nBills matching 797:');
    bill797.forEach(b => console.log(b.billNumber, b.finalAmount, b.subtotal, b.createdAt));
  }

  await mongoose.disconnect();
}

run().catch(console.error);
