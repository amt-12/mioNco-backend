require('dotenv').config();
const mongoose = require('mongoose');

async function test() {
  await mongoose.connect(process.env.MONGO_URI);
  require('../models/Order');
  require('../models/Table');
  require('../models/MenuItem');
  require('../models/BusinessDay');
  const Bill = require('../models/Bill');

  const bills = await Bill.find({
    status: { $nin: ['Merged', 'Cancelled', 'Voided'] },
    billNumber: { $nin: ['BIS-1EY98E', 'BIS-BFD700'] }
  }).populate('table').populate('createdBy', 'name');

  console.log('Total valid bills in DB:', bills.length);

  const isLiquorItem = (item) => {
    if (!item) return false;
    if (item.itemType === 'Liquor') return true;
    if (item.taxType === 'VAT') return true;
    const sectionName = String(item.sectionName || item.section || '').toLowerCase();
    if (/\b(cocktail|cocktails|whisky|whiskey|vodka|gin|tequila|rum|liqueur|cognac|brandy|wine|beer|champaign|champagne|spirits|bar|liit|singlemalt|scotch|bourbon|red wine|white wine|rose wine)\b/i.test(sectionName)) {
      return true;
    }
    const nameLower = String(item.foodName || item.itemName || item.name || '').toLowerCase();
    return /\b(liquor|cocktail|whiskey|whisky|wine|beer|alcohol|spirits|vodka|rum|gin|tequila|brandy|champagne|scotch|bourbon|liqueur|shooter|cognac|ale|cider|old fashioned|mojito|margarita|negroni|cosmopolitan|daiquiri|manhattan|martini|sangria|spritz|highball|sour|collins|fizz|julep|bellini|mimosa|paloma|caipirinha|pina colada|irish coffee|hot toddy|aperol|campari|kahlua|jagermeister|absinthe|amaretto|baileys|liit|long island)\b/i.test(nameLower);
  };

  let liquorBillsCount = 0;
  let totalLiquorNet = 0;
  let totalLiquorVAT = 0;
  let totalLiquorQty = 0;
  const itemMap = {};

  bills.forEach(b => {
    const isPaid = (b.paymentStatus === 'Paid' || b.status === 'Settled') && b.paymentStatus !== 'Hold' && b.paymentStatus !== 'Pending';
    const isPartiallyPaid = b.paymentStatus === 'Partially Paid';
    if (!isPaid && !isPartiallyPaid) return;

    let hasLiquor = false;
    (b.items || []).forEach(it => {
      if (isLiquorItem(it)) {
        hasLiquor = true;
        const qty = Number(it.quantity || 1);
        const net = Number(it.totalPrice > 0 ? it.totalPrice : (it.unitPrice * qty) || 0);
        const vat = Number(it.vatAmount || ((net * (it.taxRate || 18.9)) / 100));
        totalLiquorNet += net;
        totalLiquorVAT += vat;
        totalLiquorQty += qty;

        const name = it.foodName || 'Liquor Item';
        if (!itemMap[name]) {
          itemMap[name] = { name, qty: 0, net: 0, vat: 0, gross: 0, section: it.sectionName };
        }
        itemMap[name].qty += qty;
        itemMap[name].net += net;
        itemMap[name].vat += vat;
        itemMap[name].gross += (net + vat);
      }
    });
    if (hasLiquor) liquorBillsCount++;
  });

  console.log('Results:', {
    liquorBillsCount,
    totalLiquorNet: totalLiquorNet.toFixed(2),
    totalLiquorVAT: totalLiquorVAT.toFixed(2),
    totalLiquorGross: (totalLiquorNet + totalLiquorVAT).toFixed(2),
    totalLiquorQty,
    uniqueLiquorItems: Object.keys(itemMap).length,
    topItems: Object.values(itemMap).sort((a,b) => b.gross - a.gross).slice(0, 5)
  });

  await mongoose.disconnect();
}

test().catch(console.error);
