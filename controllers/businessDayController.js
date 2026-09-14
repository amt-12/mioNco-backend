const BusinessDay = require('../models/BusinessDay');
const Order = require('../models/Order');
const Bill = require('../models/Bill');
const FoodSpoilage = require('../models/FoodSpoilage');

// @desc Get active open business day shift
// @route GET /api/v1/business-day/active
exports.getActiveBusinessDay = async (req, res) => {
  try {
    const activeDay = await BusinessDay.findOne({ status: 'Open' })
      .populate('startedBy', 'name email role')
      .sort({ createdAt: -1 });
    
    return res.status(200).json({ success: true, data: activeDay });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Start a new business day shift
// @route POST /api/v1/business-day/start
exports.startBusinessDay = async (req, res) => {
  try {
    const { openingFloat, openingNotes } = req.body;
    
    // Check if a business day is already open
    const existingOpen = await BusinessDay.findOne({ status: 'Open' });
    if (existingOpen) {
      return res.status(400).json({
        success: false,
        message: `Business Day #${existingOpen.dayNumber} is currently open! Please end current day shift before starting a new one.`
      });
    }

    const lastDay = await BusinessDay.findOne().sort({ dayNumber: -1 });
    const nextDayNumber = lastDay ? (lastDay.dayNumber || 0) + 1 : 1;

    const newDay = await BusinessDay.create({
      dayNumber: nextDayNumber,
      status: 'Open',
      startTime: new Date(),
      startedBy: req.user?._id || req.user?.id,
      startedByName: req.user?.name || 'Admin',
      openingFloat: Number(openingFloat) || 0,
      openingNotes: openingNotes || ''
    });

    const io = req.app.get('io');
    if (io) {
      io.emit('business_day_updated', newDay);
      io.emit('business_day_started', newDay);
    }

    return res.status(201).json({
      success: true,
      message: `Business Day #${nextDayNumber} started successfully!`,
      data: newDay
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Helper function to calculate comprehensive shift metrics from bills, paid orders, and spoilages
const calculateShiftMetrics = (orders, bills, spoilages, openingFloat = 0) => {
  let grossSales = 0;
  let totalTax = 0;
  let totalDiscounts = 0;
  let cashSales = 0;
  let cardSales = 0;
  let upiSales = 0;
  let onlineSales = 0;
  let complimentarySales = 0;

  const countedOrderIds = new Set();

  // 1. Process valid Bills
  bills.forEach(b => {
    const isCancelled = b.status === 'Cancelled' || b.paymentStatus === 'Cancelled';
    const isVoided = b.status === 'Voided' || b.paymentStatus === 'Voided';
    if (isCancelled || isVoided) return;

    const bAmount = b.finalAmount || b.amountPaid || b.subtotal || 0;
    grossSales += (b.subtotal || bAmount);
    totalTax += (b.totalTaxAmount || ((b.cgstAmount || 0) + (b.sgstAmount || 0) + (b.vatAmount || 0)) || 0);
    totalDiscounts += ((b.billDiscountAmount || 0) + (b.itemLevelDiscounts || 0));

    // Track which orders are covered by this bill
    (b.orders || []).forEach(oId => {
      if (oId) countedOrderIds.add(oId.toString());
    });

    // Check payments array
    if (Array.isArray(b.payments) && b.payments.length > 0) {
      b.payments.forEach(p => {
        const amt = Number(p.amount) || 0;
        const mode = (p.mode || '').toLowerCase();
        if (mode.includes('upi')) upiSales += amt;
        else if (mode.includes('card')) cardSales += amt;
        else if (mode.includes('cash')) cashSales += amt;
        else if (mode.includes('online') || mode.includes('air') || mode.includes('qr')) onlineSales += amt;
        else if (mode.includes('nc') || mode.includes('comp') || mode.includes('non-chargeable')) complimentarySales += amt;
        else cashSales += amt;
      });
    } else {
      // If no payments array but marked paid or settled
      const method = (b.paymentMethod || '').toLowerCase();
      const paidAmt = b.amountPaid || bAmount;
      if (b.isNonChargeableBill || b.isComplimentaryBill || b.paymentStatus === 'Non-Chargeable') {
        complimentarySales += paidAmt;
      } else if (method.includes('upi')) {
        upiSales += paidAmt;
      } else if (method.includes('card')) {
        cardSales += paidAmt;
      } else if (method.includes('online') || method.includes('air') || method.includes('qr')) {
        onlineSales += paidAmt;
      } else if (b.paymentStatus === 'Paid' || b.status === 'Settled') {
        cashSales += paidAmt;
      }
    }
  });

  // 2. Process paid orders not covered by any counted bill
  orders.forEach(ord => {
    if (countedOrderIds.has(ord._id.toString())) return;

    const isPaid = ord.paymentStatus === 'Paid' || ord.status === 'Completed';
    if (!isPaid) return;

    const ordActiveItems = (ord.items || []).filter(i => i.status !== 'Cancelled');
    const itemsTotal = ordActiveItems.reduce((sum, i) => sum + (i.totalPrice || (i.unitPrice * i.quantity) || 0), 0);
    const ordAmount = ord.total || itemsTotal || ord.subtotal || 0;
    const ordTax = ord.tax || 0;

    grossSales += (ord.subtotal || ordAmount);
    totalTax += ordTax;

    const method = (ord.paymentMethod || '').toLowerCase();
    if (method.includes('upi')) {
      upiSales += ordAmount;
    } else if (method.includes('card')) {
      cardSales += ordAmount;
    } else if (method.includes('online') || method.includes('air') || method.includes('qr')) {
      onlineSales += ordAmount;
    } else if (method.includes('nc') || method.includes('comp') || ord.paymentStatus === 'Non-Chargeable') {
      complimentarySales += ordAmount;
    } else {
      cashSales += ordAmount;
    }
  });

  // 3. Spoilages calculation
  let spoilAmt = 0;
  let spoilCount = spoilages.length;
  spoilages.forEach(s => {
    spoilAmt += Number(s.totalLossAmount || (s.unitPrice * s.quantity) || s.totalCost || s.cost || 0);
  });

  // Also include order items marked isSpoiled that might not have a FoodSpoilage doc
  orders.forEach(ord => {
    (ord.items || []).forEach(item => {
      if (item.isSpoiled) {
        const itemLoss = Number(item.totalPrice || (item.unitPrice * item.quantity) || 0);
        const alreadyCounted = spoilages.some(s => s.orderId === ord.orderId && (s.foodName === item.foodName || s.itemName === item.foodName));
        if (!alreadyCounted) {
          spoilAmt += itemLoss;
          spoilCount += 1;
        }
      }
    });
  });

  const expectedCash = openingFloat + cashSales;

  return {
    grossSales: Number(grossSales.toFixed(2)),
    netSales: Number((grossSales - totalTax).toFixed(2)),
    totalTax: Number(totalTax.toFixed(2)),
    totalDiscounts: Number(totalDiscounts.toFixed(2)),
    cashSales: Number(cashSales.toFixed(2)),
    cardSales: Number(cardSales.toFixed(2)),
    upiSales: Number(upiSales.toFixed(2)),
    onlineSales: Number(onlineSales.toFixed(2)),
    complimentarySales: Number(complimentarySales.toFixed(2)),
    expectedCash: Number(expectedCash.toFixed(2)),
    spoilageCount: spoilCount,
    spoilageAmount: Number(spoilAmt.toFixed(2))
  };
};

// @desc Calculate current live Z-Report summary of active business day
// @route GET /api/v1/business-day/current-summary
exports.getCurrentDaySummary = async (req, res) => {
  try {
    const activeDay = await BusinessDay.findOne({ status: 'Open' });
    if (!activeDay) {
      return res.status(400).json({ success: false, message: 'No active business day shift found.' });
    }

    const shiftStart = activeDay.startTime;

    const orders = await Order.find({
      $or: [
        { createdAt: { $gte: shiftStart } },
        { 'paymentDetails.paidAt': { $gte: shiftStart } },
        { updatedAt: { $gte: shiftStart }, paymentStatus: 'Paid' }
      ],
      status: { $ne: 'Cancelled' }
    });

    const bills = await Bill.find({
      $or: [
        { createdAt: { $gte: shiftStart } },
        { updatedAt: { $gte: shiftStart } },
        { 'payments.timestamp': { $gte: shiftStart } }
      ]
    });

    let spoilages = [];
    try {
      spoilages = await FoodSpoilage.find({
        $or: [
          { createdAt: { $gte: shiftStart } },
          { updatedAt: { $gte: shiftStart } }
        ]
      });
    } catch (e) {
      spoilages = [];
    }

    const metrics = calculateShiftMetrics(orders, bills, spoilages, activeDay.openingFloat || 0);

    const liveSummary = {
      activeDay,
      totalOrdersCount: orders.length,
      totalBillsCount: bills.length,
      ...metrics,
      openingFloat: activeDay.openingFloat || 0
    };

    return res.status(200).json({ success: true, data: liveSummary });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc End current business day (Z-Report generation & shift close)
// @route POST /api/v1/business-day/end
exports.endBusinessDay = async (req, res) => {
  try {
    const { closingCashActual, closingNotes } = req.body;

    const activeDay = await BusinessDay.findOne({ status: 'Open' });
    if (!activeDay) {
      return res.status(400).json({ success: false, message: 'No active business day shift to end.' });
    }

    const shiftStart = activeDay.startTime;
    const endTime = new Date();

    const orders = await Order.find({
      $or: [
        { createdAt: { $gte: shiftStart } },
        { 'paymentDetails.paidAt': { $gte: shiftStart } },
        { updatedAt: { $gte: shiftStart }, paymentStatus: 'Paid' }
      ],
      status: { $ne: 'Cancelled' }
    });

    const bills = await Bill.find({
      $or: [
        { createdAt: { $gte: shiftStart } },
        { updatedAt: { $gte: shiftStart } },
        { 'payments.timestamp': { $gte: shiftStart } }
      ]
    });
    
    let spoilages = [];
    try {
      spoilages = await FoodSpoilage.find({
        $or: [
          { createdAt: { $gte: shiftStart } },
          { updatedAt: { $gte: shiftStart } }
        ]
      });
    } catch (e) {
      spoilages = [];
    }

    const metrics = calculateShiftMetrics(orders, bills, spoilages, activeDay.openingFloat || 0);
    const actualCash = Number(closingCashActual) || 0;
    const cashVariance = Number((actualCash - metrics.expectedCash).toFixed(2));

    activeDay.status = 'Closed';
    activeDay.endTime = endTime;
    activeDay.endedBy = req.user?._id || req.user?.id;
    activeDay.endedByName = req.user?.name || 'Admin';
    activeDay.closingCashActual = actualCash;
    activeDay.closingNotes = closingNotes || '';
    activeDay.summary = {
      totalOrdersCount: orders.length,
      totalBillsCount: bills.length,
      ...metrics,
      cashVariance
    };

    await activeDay.save();

    const io = req.app.get('io');
    if (io) {
      io.emit('business_day_updated', activeDay);
      io.emit('business_day_closed', activeDay);
    }

    return res.status(200).json({
      success: true,
      message: `Business Day #${activeDay.dayNumber} closed successfully! Z-Report generated.`,
      data: activeDay
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get history of all past business day shifts
// @route GET /api/v1/business-day/history
exports.getBusinessDayHistory = async (req, res) => {
  try {
    const history = await BusinessDay.find()
      .populate('startedBy', 'name email role')
      .populate('endedBy', 'name email role')
      .sort({ createdAt: -1 })
      .limit(100);

    return res.status(200).json({ success: true, data: history });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
};
