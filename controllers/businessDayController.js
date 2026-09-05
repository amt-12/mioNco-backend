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
      createdAt: { $gte: shiftStart },
      status: { $ne: 'Cancelled' }
    });

    const bills = await Bill.find({
      createdAt: { $gte: shiftStart }
    });

    let spoilages = [];
    try {
      spoilages = await FoodSpoilage.find({ createdAt: { $gte: shiftStart } });
    } catch (e) {
      spoilages = [];
    }

    let totalOrdersCount = orders.length;
    let totalBillsCount = bills.length;
    let grossSales = 0;
    let totalTax = 0;
    let totalDiscounts = 0;
    let cashSales = 0;
    let cardSales = 0;
    let upiSales = 0;
    let onlineSales = 0;
    let complimentarySales = 0;

    bills.forEach(b => {
      grossSales += (b.totalAmount || 0);
      totalTax += (b.taxAmount || 0);
      totalDiscounts += (b.discountAmount || 0);

      const method = (b.paymentMethod || '').toLowerCase();
      if (method.includes('cash')) cashSales += (b.totalAmount || 0);
      else if (method.includes('card')) cardSales += (b.totalAmount || 0);
      else if (method.includes('upi')) upiSales += (b.totalAmount || 0);
      else if (method.includes('online') || method.includes('qr') || method.includes('air')) onlineSales += (b.totalAmount || 0);
      else if (method.includes('comp') || method.includes('house')) complimentarySales += (b.totalAmount || 0);
      else cashSales += (b.totalAmount || 0);
    });

    let spoilCount = spoilages.length;
    let spoilAmt = spoilages.reduce((sum, s) => sum + (s.totalCost || s.cost || 0), 0);

    const expectedCash = (activeDay.openingFloat || 0) + cashSales;

    const liveSummary = {
      activeDay,
      totalOrdersCount,
      totalBillsCount,
      grossSales: Number(grossSales.toFixed(2)),
      netSales: Number((grossSales - totalTax).toFixed(2)),
      totalTax: Number(totalTax.toFixed(2)),
      totalDiscounts: Number(totalDiscounts.toFixed(2)),
      cashSales: Number(cashSales.toFixed(2)),
      cardSales: Number(cardSales.toFixed(2)),
      upiSales: Number(upiSales.toFixed(2)),
      onlineSales: Number(onlineSales.toFixed(2)),
      complimentarySales: Number(complimentarySales.toFixed(2)),
      openingFloat: activeDay.openingFloat || 0,
      expectedCash: Number(expectedCash.toFixed(2)),
      spoilageCount: spoilCount,
      spoilageAmount: Number(spoilAmt.toFixed(2))
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

    const orders = await Order.find({ createdAt: { $gte: shiftStart }, status: { $ne: 'Cancelled' } });
    const bills = await Bill.find({ createdAt: { $gte: shiftStart } });
    
    let spoilages = [];
    try {
      spoilages = await FoodSpoilage.find({ createdAt: { $gte: shiftStart } });
    } catch (e) {
      spoilages = [];
    }

    let grossSales = 0;
    let totalTax = 0;
    let totalDiscounts = 0;
    let cashSales = 0;
    let cardSales = 0;
    let upiSales = 0;
    let onlineSales = 0;
    let complimentarySales = 0;

    bills.forEach(b => {
      grossSales += (b.totalAmount || 0);
      totalTax += (b.taxAmount || 0);
      totalDiscounts += (b.discountAmount || 0);

      const method = (b.paymentMethod || '').toLowerCase();
      if (method.includes('cash')) cashSales += (b.totalAmount || 0);
      else if (method.includes('card')) cardSales += (b.totalAmount || 0);
      else if (method.includes('upi')) upiSales += (b.totalAmount || 0);
      else if (method.includes('online') || method.includes('qr') || method.includes('air')) onlineSales += (b.totalAmount || 0);
      else if (method.includes('comp') || method.includes('house')) complimentarySales += (b.totalAmount || 0);
      else cashSales += (b.totalAmount || 0);
    });

    const expectedCash = (activeDay.openingFloat || 0) + cashSales;
    const actualCash = Number(closingCashActual) || 0;
    const cashVariance = Number((actualCash - expectedCash).toFixed(2));

    const spoilCount = spoilages.length;
    const spoilAmt = spoilages.reduce((sum, s) => sum + (s.totalCost || s.cost || 0), 0);

    activeDay.status = 'Closed';
    activeDay.endTime = endTime;
    activeDay.endedBy = req.user?._id || req.user?.id;
    activeDay.endedByName = req.user?.name || 'Admin';
    activeDay.closingCashActual = actualCash;
    activeDay.closingNotes = closingNotes || '';
    activeDay.summary = {
      totalOrdersCount: orders.length,
      totalBillsCount: bills.length,
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
      cashVariance,
      spoilageCount: spoilCount,
      spoilageAmount: Number(spoilAmt.toFixed(2))
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
