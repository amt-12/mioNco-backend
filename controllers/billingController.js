const mongoose = require('mongoose');
const Bill = require('../models/Bill');
const Order = require('../models/Order');
const DiningSession = require('../models/DiningSession');
const MenuItem = require('../models/MenuItem');
const MenuCategory = require('../models/MenuCategory');
const RestaurantSettings = require('../models/RestaurantSettings');
const Table = require('../models/Table');
const FoodSpoilage = require('../models/FoodSpoilage');
const AuditLog = require('../models/AuditLog');

// Helper to generate Unique Bill Number
const generateBillNumber = async () => {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let number = '';
  let isUnique = false;
  while (!isUnique) {
    number = 'BILL-';
    for (let i = 0; i < 6; i++) {
      number += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const existing = await Bill.findOne({ billNumber: number });
    if (!existing) isUnique = true;
  }
  return number;
};

// Helper function to compute itemized taxes & bill totals
const calculateBillTotals = async (rawItems, options = {}) => {
  const {
    taxesEnabled = true,
    serviceChargeEnabled = true,
    customServiceChargeRate = null,
    discountType = 'None',
    discountValue = 0,
    isComplimentaryBill = false,
    isNonChargeableBill = false
  } = options;

  // Load Settings for defaults
  const settings = await RestaurantSettings.findOne({ isSingleton: 'CONFIG' });
  const defaultServiceRate = settings?.taxSettings?.serviceChargeRate ?? 5;
  const globalGstRate = settings?.taxSettings?.defaultGSTPercent ?? 5;
  const globalVatRate = settings?.taxSettings?.defaultVATPercent ?? 20;

  const serviceChargeRate = customServiceChargeRate ?? defaultServiceRate;

  let subtotal = 0;
  let taxableAmountGST = 0;
  let taxableAmountVAT = 0;
  let cgstAmount = 0;
  let sgstAmount = 0;
  let vatAmount = 0;

  const processedItems = [];

  for (const item of rawItems) {
    let menuItemDoc = null;
    if (item.menuItem) {
      menuItemDoc = await MenuItem.findById(item.menuItem).populate('section');
    }

    const foodName = item.foodName || menuItemDoc?.foodName || 'Item';
    const variantName = item.variantName || item.variant?.name || '';
    const unitPrice = item.unitPrice ?? (item.totalPrice / (item.quantity || 1)) ?? 0;
    const quantity = item.quantity || 1;
    
    // Check complimentary/NC/spoiled flags on item
    const isSpoiled = Boolean(item.isSpoiled);
    const isComp = item.isComplimentary || isComplimentaryBill || isNonChargeableBill;
    const isNC = item.isNonChargeable || isNonChargeableBill;

    let totalPrice = isSpoiled || isComp || isNC ? 0 : unitPrice * quantity;
    subtotal += totalPrice;

    // Tax Determination Logic (On-Request -> Item -> Category -> System Default)
    let taxType = 'GST';
    let taxRate = globalGstRate;

    if (item.isOnRequest) {
      taxType = item.taxType || (item.itemType === 'Liquor' ? 'VAT' : 'GST');
      taxRate = item.taxRate ?? (taxType === 'VAT' ? globalVatRate : globalGstRate);
    } else if (menuItemDoc) {
      if (menuItemDoc.taxType && menuItemDoc.taxType !== 'Inherit') {
        taxType = menuItemDoc.taxType;
        taxRate = menuItemDoc.taxRate ?? (taxType === 'VAT' ? globalVatRate : globalGstRate);
      } else {
        // Fallback to Category
        let categoryDoc = null;
        if (menuItemDoc.section) {
          categoryDoc = await MenuCategory.findOne({ name: menuItemDoc.dishType }) || 
                        await MenuCategory.findOne({ activeStatus: true });
        }
        if (categoryDoc && categoryDoc.taxType) {
          taxType = categoryDoc.taxType;
          taxRate = categoryDoc.taxRate ?? (taxType === 'VAT' ? globalVatRate : globalGstRate);
        } else {
          // Rule based default: if dishType or cuisine indicates Liquor / Alcohol / Beverage -> VAT
          const nameLower = (foodName + ' ' + (menuItemDoc.dishType || '')).toLowerCase();
          if (nameLower.includes('liquor') || nameLower.includes('cocktail') || nameLower.includes('whiskey') || nameLower.includes('wine') || nameLower.includes('beer') || nameLower.includes('alcohol') || nameLower.includes('spirits')) {
            taxType = 'VAT';
            taxRate = globalVatRate;
          }
        }
      }
    }

    let itemCGST = 0;
    let itemSGST = 0;
    let itemVAT = 0;

    if (taxesEnabled && !isSpoiled && !isComp && !isNC && totalPrice > 0) {
      if (taxType === 'GST') {
        const halfRate = taxRate / 2;
        itemCGST = (totalPrice * halfRate) / 100;
        itemSGST = (totalPrice * halfRate) / 100;
        taxableAmountGST += totalPrice;
        cgstAmount += itemCGST;
        sgstAmount += itemSGST;
      } else if (taxType === 'VAT') {
        itemVAT = (totalPrice * taxRate) / 100;
        taxableAmountVAT += totalPrice;
        vatAmount += itemVAT;
      }
    }

    processedItems.push({
      menuItem: item.menuItem || null,
      foodName,
      variantName,
      unitPrice,
      quantity,
      totalPrice: isSpoiled ? 0 : totalPrice,
      taxType,
      taxRate,
      cgstAmount: Number(itemCGST.toFixed(2)),
      sgstAmount: Number(itemSGST.toFixed(2)),
      vatAmount: Number(itemVAT.toFixed(2)),
      isComplimentary: isComp,
      complimentaryReason: item.complimentaryReason || '',
      isNonChargeable: isNC,
      ncRemark: item.ncRemark || '',
      staffEmployeeId: item.staffEmployeeId || '',
      isOnRequest: item.isOnRequest || false,
      isSpoiled,
      spoilageRemarks: item.spoilageRemarks || '',
      spoilageMarkedBy: item.spoilageMarkedBy || '',
      itemType: item.itemType || (taxType === 'VAT' ? 'Liquor' : 'Food'),
      sectionName: menuItemDoc?.section?.name || item.sectionName || '',
      addedBy: item.addedBy || null,
      reason: item.reason || ''
    });
  }

  // Calculate Bill Level Discount
  let billDiscountAmount = 0;
  if (!isComplimentaryBill && !isNonChargeableBill && discountType !== 'None') {
    if (discountType === 'Percentage') {
      billDiscountAmount = (subtotal * discountValue) / 100;
    } else if (discountType === 'Fixed') {
      billDiscountAmount = Math.min(subtotal, discountValue);
    }
  }

  const postDiscountSubtotal = Math.max(0, subtotal - billDiscountAmount);

  // Recalculate tax if post discount subtotal changed proportionally
  let finalCgst = cgstAmount;
  let finalSgst = sgstAmount;
  let finalVat = vatAmount;

  if (subtotal > 0 && billDiscountAmount > 0) {
    const ratio = postDiscountSubtotal / subtotal;
    finalCgst = cgstAmount * ratio;
    finalSgst = sgstAmount * ratio;
    finalVat = vatAmount * ratio;
  }

  const totalTaxAmount = taxesEnabled ? (finalCgst + finalSgst + finalVat) : 0;

  // Service Charge Calculation
  let serviceChargeAmount = 0;
  if (serviceChargeEnabled && !isComplimentaryBill && !isNonChargeableBill && postDiscountSubtotal > 0) {
    serviceChargeAmount = (postDiscountSubtotal * serviceChargeRate) / 100;
  }

  let finalAmount = isComplimentaryBill || isNonChargeableBill ? 0 : (postDiscountSubtotal + totalTaxAmount + serviceChargeAmount);

  return {
    items: processedItems,
    subtotal: Number(subtotal.toFixed(2)),
    billDiscountAmount: Number(billDiscountAmount.toFixed(2)),
    taxableAmountGST: Number(taxableAmountGST.toFixed(2)),
    taxableAmountVAT: Number(taxableAmountVAT.toFixed(2)),
    cgstAmount: Number(finalCgst.toFixed(2)),
    sgstAmount: Number(finalSgst.toFixed(2)),
    vatAmount: Number(finalVat.toFixed(2)),
    totalTaxAmount: Number(totalTaxAmount.toFixed(2)),
    serviceChargeRate,
    serviceChargeAmount: Number(serviceChargeAmount.toFixed(2)),
    finalAmount: Number(Math.round(finalAmount))
  };
};

// Helper to resolve an existing Bill or construct an in-memory Bill from an Order
const resolveBillObject = async (idParam) => {
  if (!idParam) return null;
  const idStr = String(idParam).trim();
  const cleanOrderNo = idStr.replace(/^#/, '');
  const isHexId = mongoose.Types.ObjectId.isValid(idStr);

  let b = null;
  if (isHexId) {
    b = await Bill.findById(idStr)
      .populate('table')
      .populate('session')
      .populate('orders')
      .populate('createdBy', 'name role');
  }
  if (!b) {
    b = await Bill.findOne({
      $or: [
        { billNumber: idStr },
        { billNumber: cleanOrderNo },
        ...(isHexId ? [{ orders: idStr }] : [])
      ]
    })
      .populate('table')
      .populate('session')
      .populate('orders')
      .populate('createdBy', 'name role');
  }

  if (!b) {
    const orderQuery = {
      $or: [
        { orderId: idStr },
        { orderId: cleanOrderNo },
        ...(isHexId ? [{ _id: idStr }] : [])
      ]
    };

    const ord = await Order.findOne(orderQuery)
      .populate('items.menuItem')
      .populate({ path: 'table', populate: { path: 'floor' } });

    if (ord) {
      const rawItems = (ord.items || [])
        .filter(item => item.status !== 'Cancelled')
        .map(item => ({
          menuItem: item.menuItem?._id || item.menuItem,
          foodName: item.foodName || item.menuItem?.foodName || 'Item',
          variantName: item.variant?.name,
          unitPrice: item.unitPrice,
          quantity: item.quantity,
          totalPrice: item.totalPrice,
          isOnRequest: item.isOnRequest || false,
          itemType: item.itemType || 'Food',
          taxType: item.taxType,
          taxRate: item.taxRate
        }));

      const calculated = await calculateBillTotals(rawItems);
      const billNumber = ord.orderId || await generateBillNumber();

      b = new Bill({
        _id: ord._id,
        billNumber,
        orders: [ord._id],
        session: ord.session,
        table: ord.table,
        items: calculated.items,
        subtotal: calculated.subtotal,
        cgstAmount: calculated.cgstAmount,
        sgstAmount: calculated.sgstAmount,
        vatAmount: calculated.vatAmount,
        totalTaxAmount: calculated.totalTaxAmount,
        serviceChargeRate: calculated.serviceChargeRate,
        serviceChargeAmount: calculated.serviceChargeAmount,
        serviceChargeEnabled: true,
        taxesEnabled: true,
        finalAmount: calculated.finalAmount,
        balanceDue: calculated.finalAmount,
        paymentStatus: 'Pending',
        status: 'Active'
      });
    }
  }

  if (!b && isHexId) {
    // Check if idParam is a Table ID or Session ID
    const activeOrders = await Order.find({
      $or: [
        { table: idStr, status: { $ne: 'Cancelled' } },
        { session: idStr, status: { $ne: 'Cancelled' } }
      ]
    })
      .populate('items.menuItem')
      .populate({ path: 'table', populate: { path: 'floor' } });

    if (activeOrders.length > 0) {
      const rawItems = [];
      activeOrders.forEach(ord => {
        (ord.items || []).filter(item => item.status !== 'Cancelled').forEach(item => {
          rawItems.push({
            menuItem: item.menuItem?._id || item.menuItem,
            foodName: item.foodName || item.menuItem?.foodName || 'Item',
            variantName: item.variant?.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            isOnRequest: item.isOnRequest || false,
            itemType: item.itemType || 'Food',
            taxType: item.taxType,
            taxRate: item.taxRate
          });
        });
      });

      const calculated = await calculateBillTotals(rawItems);
      const billNumber = await generateBillNumber();

      b = new Bill({
        _id: idParam,
        billNumber,
        orders: activeOrders.map(o => o._id),
        session: activeOrders[0].session,
        table: activeOrders[0].table,
        items: calculated.items,
        subtotal: calculated.subtotal,
        cgstAmount: calculated.cgstAmount,
        sgstAmount: calculated.sgstAmount,
        vatAmount: calculated.vatAmount,
        totalTaxAmount: calculated.totalTaxAmount,
        serviceChargeRate: calculated.serviceChargeRate,
        serviceChargeAmount: calculated.serviceChargeAmount,
        serviceChargeEnabled: true,
        taxesEnabled: true,
        finalAmount: calculated.finalAmount,
        balanceDue: calculated.finalAmount,
        paymentStatus: 'Pending',
        status: 'Active'
      });
    }
  }

  return b;
};

// @desc    Generate Bill from Order(s) or Session
// @route   POST /api/v1/billing/generate
// @access  Private
exports.generateBill = async (req, res) => {
  try {
    const { orderId, orderIds, sessionId, tableId, customer } = req.body;

    // Check if active bill(s) already exist for the given order or table
    let existingQuery = null;
    if (orderId) {
      existingQuery = { orders: orderId, status: 'Active' };
    } else if (orderIds && Array.isArray(orderIds) && orderIds.length > 0) {
      existingQuery = { orders: { $in: orderIds }, status: 'Active' };
    } else if (tableId) {
      existingQuery = { table: tableId, status: 'Active' };
    }

    if (existingQuery) {
      const existingBills = await Bill.find(existingQuery)
        .populate('table')
        .populate('session')
        .populate('orders')
        .populate('createdBy', 'name role')
        .sort({ createdAt: -1 });

      if (existingBills.length > 0) {
        return res.status(200).json({
          success: true,
          message: 'Active bill(s) already exist',
          data: existingBills[0],
          allBills: existingBills
        });
      }
    }

    let targetOrders = [];
    if (orderId) {
      const ord = await Order.findById(orderId).populate('items.menuItem');
      if (ord) targetOrders.push(ord);
    } else if (orderIds && Array.isArray(orderIds)) {
      targetOrders = await Order.find({ _id: { $in: orderIds } }).populate('items.menuItem');
    } else if (sessionId) {
      targetOrders = await Order.find({ session: sessionId, status: { $ne: 'Cancelled' } }).populate('items.menuItem');
    } else if (tableId) {
      const activeSession = await DiningSession.findOne({ table: tableId, status: 'Active' });
      if (activeSession) {
        targetOrders = await Order.find({ session: activeSession._id, status: { $ne: 'Cancelled' } }).populate('items.menuItem');
      }
    }

    if (targetOrders.length === 0) {
      return res.status(404).json({ success: false, message: 'No orders found to generate bill' });
    }

    // Consolidate raw items from orders
    const rawItems = [];
    targetOrders.forEach(ord => {
      ord.items.forEach(item => {
        if (item.status !== 'Cancelled') {
          const isSpoiled = Boolean(item.isSpoiled);
          rawItems.push({
            menuItem: item.menuItem?._id || item.menuItem,
            foodName: item.foodName || item.menuItem?.foodName || 'Food Item',
            variantName: item.variant?.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: isSpoiled ? 0 : item.totalPrice,
            isOnRequest: item.isOnRequest || false,
            isSpoiled,
            spoilageRemarks: item.spoilageRemarks || '',
            spoilageMarkedBy: item.spoilageMarkedBy || '',
            itemType: item.itemType || 'Food',
            taxType: item.taxType,
            taxRate: item.taxRate,
            addedBy: item.addedBy,
            reason: item.reason,
            isComplimentary: false,
            isNonChargeable: false
          });
        }
      });
    });

    const calculated = await calculateBillTotals(rawItems);
    const billNumber = await generateBillNumber();

    const bill = new Bill({
      _id: new mongoose.Types.ObjectId(),
      billNumber,
      orders: targetOrders.map(o => o._id),
      session: targetOrders[0]?.session,
      table: targetOrders[0]?.table,
      customer: customer || {},
      items: calculated.items,
      subtotal: calculated.subtotal,
      billDiscountType: 'None',
      billDiscountValue: 0,
      billDiscountAmount: 0,
      cgstAmount: calculated.cgstAmount,
      sgstAmount: calculated.sgstAmount,
      vatAmount: calculated.vatAmount,
      taxableAmountGST: calculated.taxableAmountGST,
      taxableAmountVAT: calculated.taxableAmountVAT,
      totalTaxAmount: calculated.totalTaxAmount,
      serviceChargeRate: calculated.serviceChargeRate,
      serviceChargeAmount: calculated.serviceChargeAmount,
      serviceChargeEnabled: true,
      taxesEnabled: true,
      finalAmount: calculated.finalAmount,
      paymentStatus: 'Pending',
      amountPaid: 0,
      balanceDue: calculated.finalAmount,
      status: 'Active',
      createdBy: req.user?._id
    });

    return res.status(200).json({
      success: true,
      message: 'Bill calculated successfully',
      data: bill
    });
  } catch (error) {
    console.error('Error generating bill:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get List of Bills
// @route   GET /api/v1/billing
// @access  Private
exports.getBills = async (req, res) => {
  try {
    const { status, paymentStatus, search, page = 1, limit = 100, table, order, session, isSplit, period, givenBy } = req.query;

    const query = {};
    if (status && status !== 'ALL') query.status = status;
    if (paymentStatus && paymentStatus !== 'ALL') query.paymentStatus = paymentStatus;
    if (table) query.table = table;
    if (order) query.orders = order;
    if (session) query.session = session;
    if (isSplit !== undefined) query['splitInfo.isSplit'] = isSplit === 'true';

    if (period) {
      const now = new Date();
      if (period === 'today') {
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        query.createdAt = { $gte: startOfDay };
      } else if (period === 'week') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        startOfWeek.setHours(0, 0, 0, 0);
        query.createdAt = { $gte: startOfWeek };
      } else if (period === 'month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        query.createdAt = { $gte: startOfMonth };
      }
    }

    if (givenBy) {
      query.$or = [
        { discountGivenBy: { $regex: givenBy, $options: 'i' } },
        { ncStaffRemark: { $regex: givenBy, $options: 'i' } }
      ];
    }

    if (search) {
      const searchRegex = { $regex: search, $options: 'i' };
      query.$or = [
        { billNumber: searchRegex },
        { 'customer.name': searchRegex },
        { 'customer.phone': searchRegex },
        { discountGivenBy: searchRegex },
        { billDiscountReason: searchRegex },
        { ncStaffRemark: searchRegex }
      ];
    }

    const skip = (page - 1) * limit;
    const bills = await Bill.find(query)
      .populate('table', 'tableNumber name capacity')
      .populate('session', 'sessionId startTime')
      .populate('orders', 'orderId items status subtotal total')
      .populate('createdBy', 'name role')
      .populate('ncEmployee', 'name role username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Bill.countDocuments(query);

    // Compute Summary Stats for NC & Discounts
    const allMatchingBills = await Bill.find(query).select('paymentStatus isNonChargeableBill items subtotal billDiscountAmount discountGivenBy ncStaffRemark createdAt');
    
    let totalNcCount = 0;
    let totalNcWaivedAmount = 0;
    let totalDiscountAmount = 0;
    let discountedBillsCount = 0;
    const givenByMap = {};

    allMatchingBills.forEach(b => {
      if (b.paymentStatus === 'Non-Chargeable' || b.isNonChargeableBill) {
        totalNcCount++;
        // Calculate original order value waived
        const origSub = (b.items || []).reduce((sum, i) => sum + (i.unitPrice * (i.quantity || 1)), 0);
        totalNcWaivedAmount += (origSub || b.subtotal || 0);
      }

      if (b.billDiscountAmount > 0) {
        discountedBillsCount++;
        totalDiscountAmount += b.billDiscountAmount;
        const giver = b.discountGivenBy || 'Staff';
        givenByMap[giver] = (givenByMap[giver] || 0) + b.billDiscountAmount;
      }
    });

    return res.json({
      success: true,
      data: bills,
      summaryStats: {
        totalNcCount,
        totalNcWaivedAmount,
        totalDiscountAmount,
        discountedBillsCount,
        givenBySummary: givenByMap
      },
      pagination: {
        total,
        page: Number(page),
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching bills:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Bill by ID
// @route   GET /api/v1/billing/:id
// @access  Private
exports.getBillById = async (req, res) => {
  try {
    const bill = await resolveBillObject(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill or order not found' });
    }

    return res.json({ success: true, data: bill });

    return res.json({ success: true, data: bill });
  } catch (error) {
    console.error('Error fetching bill details:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Split Bill into N bills (Equal or Itemized)
// @route   POST /api/v1/billing/:id/split
// @access  Private
exports.splitBill = async (req, res) => {
  try {
    const { splitCount = 2, splitType = 'Equal', itemAllocations } = req.body;
    let targetBill = null;
    const reqIdStr = String(req.params.id).trim().replace(/^#/, '');

    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      targetBill = await Bill.findById(req.params.id);
    }
    if (!targetBill) {
      targetBill = await Bill.findOne({ $or: [{ billNumber: req.params.id }, { billNumber: reqIdStr }, { orders: req.params.id }] });
    }

    if (!targetBill) {
      // Construct in-memory parentBill directly from Order
      const orderQuery = {
        $or: [
          { orderId: req.params.id },
          { orderId: reqIdStr }
        ]
      };
      if (mongoose.Types.ObjectId.isValid(req.params.id)) {
        orderQuery.$or.push({ _id: req.params.id });
      }

      const ord = await Order.findOne(orderQuery).populate('items.menuItem');
      if (ord) {
        const rawItems = (ord.items || [])
          .filter(item => item.status !== 'Cancelled')
          .map(item => ({
            menuItem: item.menuItem?._id || item.menuItem,
            foodName: item.foodName || item.menuItem?.foodName || 'Item',
            variantName: item.variant?.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            isOnRequest: item.isOnRequest || false,
            itemType: item.itemType || 'Food',
            taxType: item.taxType,
            taxRate: item.taxRate
          }));

        const calculated = await calculateBillTotals(rawItems);
        const billNumber = ord.orderId || await generateBillNumber();

        targetBill = new Bill({
          _id: ord._id,
          billNumber,
          orders: [ord._id],
          session: ord.session,
          table: ord.table,
          items: calculated.items,
          subtotal: calculated.subtotal,
          cgstAmount: calculated.cgstAmount,
          sgstAmount: calculated.sgstAmount,
          vatAmount: calculated.vatAmount,
          totalTaxAmount: calculated.totalTaxAmount,
          serviceChargeRate: calculated.serviceChargeRate,
          serviceChargeAmount: calculated.serviceChargeAmount,
          serviceChargeEnabled: true,
          taxesEnabled: true,
          finalAmount: calculated.finalAmount,
          balanceDue: calculated.finalAmount,
          paymentStatus: 'Pending',
          status: 'Active'
        });
      }
    }

    if (!targetBill && mongoose.Types.ObjectId.isValid(req.params.id)) {
      // Try searching active Orders by table ID or session ID
      const activeOrders = await Order.find({
        $or: [
          { table: req.params.id, status: { $ne: 'Cancelled' } },
          { session: req.params.id, status: { $ne: 'Cancelled' } }
        ]
      }).populate('items.menuItem');

      if (activeOrders.length > 0) {
        const rawItems = [];
        activeOrders.forEach(ord => {
          (ord.items || []).filter(item => item.status !== 'Cancelled').forEach(item => {
            rawItems.push({
              menuItem: item.menuItem?._id || item.menuItem,
              foodName: item.foodName || item.menuItem?.foodName || 'Item',
              variantName: item.variant?.name,
              unitPrice: item.unitPrice,
              quantity: item.quantity,
              totalPrice: item.totalPrice,
              isOnRequest: item.isOnRequest || false,
              itemType: item.itemType || 'Food',
              taxType: item.taxType,
              taxRate: item.taxRate
            });
          });
        });

        const calculated = await calculateBillTotals(rawItems);
        const billNumber = await generateBillNumber();

        targetBill = new Bill({
          _id: activeOrders[0]._id,
          billNumber,
          orders: activeOrders.map(o => o._id),
          session: activeOrders[0].session,
          table: activeOrders[0].table,
          items: calculated.items,
          subtotal: calculated.subtotal,
          cgstAmount: calculated.cgstAmount,
          sgstAmount: calculated.sgstAmount,
          vatAmount: calculated.vatAmount,
          totalTaxAmount: calculated.totalTaxAmount,
          serviceChargeRate: calculated.serviceChargeRate,
          serviceChargeAmount: calculated.serviceChargeAmount,
          serviceChargeEnabled: true,
          taxesEnabled: true,
          finalAmount: calculated.finalAmount,
          balanceDue: calculated.finalAmount,
          paymentStatus: 'Pending',
          status: 'Active'
        });
      }
    }

    if (!targetBill) {
      return res.status(404).json({ success: false, message: 'Order or bill not found to split' });
    }

    if (targetBill.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Cannot split an already settled bill' });
    }

    // If targetBill is already a child split bill, find original root parent bill
    let parentBill = targetBill;
    if (targetBill.splitInfo?.isSplit && targetBill.splitInfo?.parentBill) {
      const rootBill = await Bill.findById(targetBill.splitInfo.parentBill);
      if (rootBill) {
        parentBill = rootBill;
      }
    }

    // Clean up any unpaid prior child splits belonging to this parent/order to avoid stale duplicates
    if (parentBill._id && mongoose.Types.ObjectId.isValid(parentBill._id)) {
      await Bill.deleteMany({
        $or: [
          { 'splitInfo.parentBill': parentBill._id, paymentStatus: { $ne: 'Paid' } },
          { _id: targetBill._id, paymentStatus: { $ne: 'Paid' }, 'splitInfo.isSplit': true }
        ]
      });
    }

    const createdSplitBills = [];
    const freshBasePrefix = await generateBillNumber();

    if (splitType === 'Equal' || !itemAllocations || !Array.isArray(itemAllocations) || itemAllocations.length === 0) {
      const equalCount = Math.max(2, parseInt(splitCount) || 2);
      const equalSubtotal = parentBill.subtotal / equalCount;
      const equalCgst = parentBill.cgstAmount / equalCount;
      const equalSgst = parentBill.sgstAmount / equalCount;
      const equalVat = parentBill.vatAmount / equalCount;
      const equalServiceCharge = parentBill.serviceChargeAmount / equalCount;
      const equalFinal = parentBill.finalAmount / equalCount;

      for (let i = 1; i <= equalCount; i++) {
        const splitBill = new Bill({
          _id: new mongoose.Types.ObjectId(),
          billNumber: `${freshBasePrefix}-S${i}`,
          orders: parentBill.orders,
          session: parentBill.session,
          table: parentBill.table,
          customer: parentBill.customer,
          splitInfo: {
            isSplit: true,
            parentBill: parentBill._id,
            splitIndex: i,
            totalSplits: equalCount,
            splitType: 'Equal'
          },
          items: parentBill.items.map(it => {
            const isSp = Boolean(it.isSpoiled);
            const origQty = it.quantity || 1;
            const splitQty = Number((origQty / equalCount).toFixed(2));
            return {
              ...(it.toObject ? it.toObject() : it),
              quantity: splitQty,
              unitPrice: isSp ? 0 : it.unitPrice,
              totalPrice: isSp ? 0 : Number(((it.unitPrice || 0) * splitQty).toFixed(2)),
              isSpoiled: isSp,
              spoilageRemarks: it.spoilageRemarks || '',
              spoilageMarkedBy: it.spoilageMarkedBy || ''
            };
          }),
          subtotal: Number(equalSubtotal.toFixed(2)),
          cgstAmount: Number(equalCgst.toFixed(2)),
          sgstAmount: Number(equalSgst.toFixed(2)),
          vatAmount: Number(equalVat.toFixed(2)),
          totalTaxAmount: Number((equalCgst + equalSgst + equalVat).toFixed(2)),
          serviceChargeRate: parentBill.serviceChargeRate,
          serviceChargeAmount: Number(equalServiceCharge.toFixed(2)),
          serviceChargeEnabled: parentBill.serviceChargeEnabled,
          taxesEnabled: parentBill.taxesEnabled,
          finalAmount: Number(Math.round(equalFinal)),
          balanceDue: Number(Math.round(equalFinal)),
          paymentStatus: 'Pending',
          status: 'Active',
          createdBy: req.user?._id
        });
        createdSplitBills.push(splitBill);
      }
    } else if (splitType === 'Itemized') {
      const requestedSplitsCount = Math.max(2, parseInt(splitCount) || 2, ...itemAllocations.map(a => a.splitIndex || 1));

      for (let i = 1; i <= requestedSplitsCount; i++) {
        const allocsForIndex = itemAllocations.filter(a => a.splitIndex === i);
        const splitRawItems = [];

        allocsForIndex.forEach(alloc => {
          let originalItem = null;
          if (alloc.itemId) {
            originalItem = parentBill.items.id ? parentBill.items.id(alloc.itemId) : parentBill.items.find(it => String(it._id) === String(alloc.itemId));
          }
          if (!originalItem && alloc.foodName) {
            originalItem = parentBill.items.find(it => it.foodName === alloc.foodName);
          }
          if (!originalItem && alloc.itemIndex !== undefined && parentBill.items[alloc.itemIndex]) {
            originalItem = parentBill.items[alloc.itemIndex];
          }

          if (originalItem) {
            const isSp = Boolean(originalItem.isSpoiled);
            splitRawItems.push({
              menuItem: originalItem.menuItem,
              foodName: originalItem.foodName,
              variantName: originalItem.variantName,
              unitPrice: originalItem.unitPrice,
              quantity: alloc.quantity || originalItem.quantity,
              totalPrice: isSp ? 0 : (originalItem.unitPrice * (alloc.quantity || originalItem.quantity)),
              isComplimentary: originalItem.isComplimentary,
              isNonChargeable: originalItem.isNonChargeable,
              isSpoiled: isSp,
              spoilageRemarks: originalItem.spoilageRemarks || '',
              spoilageMarkedBy: originalItem.spoilageMarkedBy || ''
            });
          }
        });

        if (splitRawItems.length > 0) {
          const calculated = await calculateBillTotals(splitRawItems, {
            taxesEnabled: parentBill.taxesEnabled,
            serviceChargeEnabled: parentBill.serviceChargeEnabled,
            customServiceChargeRate: parentBill.serviceChargeRate
          });

          const splitBill = new Bill({
            _id: new mongoose.Types.ObjectId(),
            billNumber: `${freshBasePrefix}-S${i}`,
            orders: parentBill.orders,
            session: parentBill.session,
            table: parentBill.table,
            customer: parentBill.customer,
            splitInfo: {
              isSplit: true,
              parentBill: parentBill._id,
              splitIndex: i,
              totalSplits: requestedSplitsCount,
              splitType: 'Itemized'
            },
            items: calculated.items,
            subtotal: calculated.subtotal,
            cgstAmount: calculated.cgstAmount,
            sgstAmount: calculated.sgstAmount,
            vatAmount: calculated.vatAmount,
            totalTaxAmount: calculated.totalTaxAmount,
            serviceChargeRate: calculated.serviceChargeRate,
            serviceChargeAmount: calculated.serviceChargeAmount,
            serviceChargeEnabled: parentBill.serviceChargeEnabled,
            taxesEnabled: parentBill.taxesEnabled,
            finalAmount: calculated.finalAmount,
            balanceDue: calculated.finalAmount,
            paymentStatus: 'Pending',
            status: 'Active',
            createdBy: req.user?._id
          });
          createdSplitBills.push(splitBill);
        }
      }
    }

    return res.json({
      success: true,
      message: `Bill split calculated successfully into ${createdSplitBills.length} bills`,
      data: createdSplitBills
    });
  } catch (error) {
    console.error('Error splitting bill:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Merge Multiple Bills into One
// @route   POST /api/v1/billing/merge
// @access  Private
exports.mergeBills = async (req, res) => {
  try {
    const { billIds } = req.body;
    if (!billIds || !Array.isArray(billIds) || billIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least 1 bill or order to merge' });
    }

    const resolvedObjects = [];

    for (const id of billIds) {
      if (!id) continue;
      const idStr = String(id).trim();
      const cleanOrderNo = idStr.replace(/^#/, '');
      const isHexId = mongoose.Types.ObjectId.isValid(idStr);

      const billQuery = {
        $or: [
          { billNumber: idStr },
          { billNumber: cleanOrderNo }
        ],
        status: { $ne: 'Voided' }
      };
      if (isHexId) {
        billQuery.$or.push({ _id: idStr }, { orders: idStr });
      }

      let b = await Bill.findOne(billQuery).populate({ path: 'table', populate: { path: 'floor' } });

      if (!b) {
        const orderQuery = {
          $or: [
            { orderId: idStr },
            { orderId: cleanOrderNo }
          ]
        };
        if (isHexId) {
          orderQuery.$or.push({ _id: idStr });
        }

        const ord = await Order.findOne(orderQuery).populate('items.menuItem').populate({ path: 'table', populate: { path: 'floor' } });
        if (ord) {
          b = await Bill.findOne({ orders: ord._id, status: { $ne: 'Voided' } }).populate({ path: 'table', populate: { path: 'floor' } });

          if (!b) {
            try {
              const rawItems = (ord.items || [])
                .filter(item => item.status !== 'Cancelled')
                .map(item => ({
                  menuItem: item.menuItem?._id || item.menuItem,
                  foodName: item.foodName || item.menuItem?.foodName || 'Item',
                  variantName: item.variant?.name,
                  unitPrice: item.unitPrice,
                  quantity: item.quantity,
                  totalPrice: item.totalPrice,
                  isOnRequest: item.isOnRequest || false,
                  itemType: item.itemType || 'Food',
                  taxType: item.taxType,
                  taxRate: item.taxRate,
                  isComplimentary: false,
                  isNonChargeable: false
                }));

              const calculated = await calculateBillTotals(rawItems);
              const billNumber = ord.orderId || await generateBillNumber();

              b = new Bill({
                _id: ord._id,
                billNumber,
                orders: [ord._id],
                session: ord.session,
                table: ord.table,
                items: calculated.items,
                subtotal: calculated.subtotal,
                cgstAmount: calculated.cgstAmount,
                sgstAmount: calculated.sgstAmount,
                vatAmount: calculated.vatAmount,
                totalTaxAmount: calculated.totalTaxAmount,
                serviceChargeRate: calculated.serviceChargeRate,
                serviceChargeAmount: calculated.serviceChargeAmount,
                serviceChargeEnabled: true,
                taxesEnabled: true,
                finalAmount: calculated.finalAmount,
                balanceDue: calculated.finalAmount,
                paymentStatus: 'Pending',
                status: 'Active'
              });
            } catch (genErr) {
              console.error('Auto-generate in-memory bill for merge error:', genErr);
            }
          }
        }
      }

      if (b) {
        resolvedObjects.push(b);
      }
    }

    const billsToMerge = resolvedObjects;

    const rawMergedItems = [];
    const mergedOrders = [];
    const tableDescriptions = [];

    billsToMerge.forEach(b => {
      if (b.orders) mergedOrders.push(...b.orders);

      if (b.table) {
        const floorName = b.table.floor?.name || b.table.floor?.floorName || '';
        const tableName = b.table.tableNumber ? `Table ${b.table.tableNumber}` : (b.table.name || 'Table');
        const desc = floorName ? `${tableName} (${floorName})` : tableName;
        if (!tableDescriptions.includes(desc)) {
          tableDescriptions.push(desc);
        }
      }

      (b.items || []).forEach(it => {
        const isSp = Boolean(it.isSpoiled);
        rawMergedItems.push({
          menuItem: it.menuItem,
          foodName: it.foodName,
          variantName: it.variantName,
          unitPrice: it.unitPrice,
          quantity: it.quantity,
          totalPrice: isSp ? 0 : it.totalPrice,
          isComplimentary: it.isComplimentary,
          isNonChargeable: it.isNonChargeable,
          isSpoiled: isSp,
          spoilageRemarks: it.spoilageRemarks || '',
          spoilageMarkedBy: it.spoilageMarkedBy || '',
          taxType: it.taxType,
          taxRate: it.taxRate,
          sectionName: it.sectionName
        });
      });
    });

    // Consolidate identical items by combining quantities
    const itemMap = new Map();
    rawMergedItems.forEach(it => {
      const key = `${it.foodName}||${it.variantName || ''}||${it.unitPrice}||${it.isComplimentary || false}||${it.isNonChargeable || false}||${it.isSpoiled || false}`;
      if (itemMap.has(key)) {
        const existing = itemMap.get(key);
        existing.quantity += (it.quantity || 1);
        existing.totalPrice = (existing.isSpoiled || existing.isComplimentary || existing.isNonChargeable) ? 0 : existing.unitPrice * existing.quantity;
      } else {
        itemMap.set(key, { ...it, quantity: it.quantity || 1 });
      }
    });

    const mergedItems = Array.from(itemMap.values());
    const calculated = await calculateBillTotals(mergedItems);
    const billNumber = await generateBillNumber();

    const firstBill = billsToMerge[0];
    const mergeNotesText = tableDescriptions.length > 0
      ? `Merged from ${tableDescriptions.join(' & ')}`
      : `Merged from bills: ${billsToMerge.map(b => b.billNumber).join(', ')}`;

    const mergedBillsList = billsToMerge.map(b => ({
      billNumber: b.billNumber,
      tableNumber: b.table?.tableNumber ? `Table ${b.table.tableNumber}` : (b.table?.name || 'Table'),
      floorName: b.table?.floor?.name || '',
      items: b.items || [],
      subtotal: b.subtotal || 0,
      finalAmount: b.finalAmount || 0
    }));

    const mergedBill = new Bill({
      _id: new mongoose.Types.ObjectId(),
      billNumber: `${billNumber}-M`,
      orders: [...new Set(mergedOrders.map(o => o.toString()))],
      session: firstBill?.session || null,
      table: firstBill?.table?._id || firstBill?.table || (mergedOrders[0] ? (await Order.findById(mergedOrders[0]))?.table : null),
      customer: firstBill?.customer || null,
      mergedBillsList,
      items: calculated.items,
      subtotal: calculated.subtotal,
      cgstAmount: calculated.cgstAmount,
      sgstAmount: calculated.sgstAmount,
      vatAmount: calculated.vatAmount,
      totalTaxAmount: calculated.totalTaxAmount,
      serviceChargeRate: calculated.serviceChargeRate,
      serviceChargeAmount: calculated.serviceChargeAmount,
      serviceChargeEnabled: true,
      taxesEnabled: true,
      finalAmount: calculated.finalAmount,
      balanceDue: calculated.finalAmount,
      paymentStatus: 'Pending',
      status: 'Active',
      notes: mergeNotesText,
      createdBy: req.user?._id
    });

    return res.json({
      success: true,
      message: 'Bills merged successfully',
      data: mergedBill
    });
  } catch (error) {
    console.error('Error merging bills:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Apply Bill Level Discount
// @route   PUT /api/v1/billing/:id/discount
// @access  Private
exports.applyDiscount = async (req, res) => {
  try {
    const { discountType, discountValue, discountReason } = req.body;
    let bill = await Bill.findById(req.params.id);

    if (!bill) {
      bill = await resolveBillObject(req.params.id);
    }

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill or order not found' });
    }

    // Handle split bills: apply discount across all sibling split bills for the table/parent bill
    let siblingBills = [bill];
    const parentId = bill.splitInfo?.parentBill || (bill.splitInfo?.isSplit ? bill._id : null);
    if (parentId && !bill.isNew) {
      const splits = await Bill.find({ $or: [{ 'splitInfo.parentBill': parentId }, { _id: parentId }], status: { $ne: 'Cancelled' } });
      if (splits && splits.length > 0) siblingBills = splits;
    }

    const combinedSubtotal = siblingBills.reduce((sum, b) => sum + (b.subtotal || 0), 0);

    for (const sBill of siblingBills) {
      let bDiscountVal = Number(discountValue || 0);

      // If fixed amount discount on split order, proportion fixed discount by subtotal
      if (discountType === 'Fixed' && siblingBills.length > 1 && combinedSubtotal > 0) {
        bDiscountVal = Number(((discountValue * (sBill.subtotal || 0)) / combinedSubtotal).toFixed(2));
      }

      const calculated = await calculateBillTotals(sBill.items, {
        taxesEnabled: sBill.taxesEnabled,
        serviceChargeEnabled: sBill.serviceChargeEnabled,
        customServiceChargeRate: sBill.serviceChargeRate,
        discountType: discountType || 'None',
        discountValue: bDiscountVal,
        isComplimentaryBill: sBill.isComplimentaryBill,
        isNonChargeableBill: sBill.isNonChargeableBill
      });

      sBill.billDiscountType = discountType || 'None';
      sBill.billDiscountValue = bDiscountVal;
      sBill.billDiscountAmount = calculated.billDiscountAmount;
      sBill.billDiscountReason = discountReason || '';

      sBill.cgstAmount = calculated.cgstAmount;
      sBill.sgstAmount = calculated.sgstAmount;
      sBill.vatAmount = calculated.vatAmount;
      sBill.totalTaxAmount = calculated.totalTaxAmount;
      sBill.serviceChargeAmount = calculated.serviceChargeAmount;
      sBill.finalAmount = calculated.finalAmount;
      sBill.balanceDue = Math.max(0, calculated.finalAmount - sBill.amountPaid);

      if (sBill._id && !sBill.isNew && typeof sBill.save === 'function') {
        try { await sBill.save(); } catch (e) {}
      }
    }

    let responseData = bill;
    if (siblingBills.length > 1) {
      responseData = siblingBills;
    }
    return res.json({ success: true, message: 'Discount applied', data: responseData });
  } catch (error) {
    console.error('Error applying discount:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Apply Complimentary Items or Complimentary Bill
// @route   PUT /api/v1/billing/:id/complimentary
// @access  Private
exports.applyComplimentary = async (req, res) => {
  try {
    const { isFullBill, itemId, remark } = req.body;
    let bill = await Bill.findById(req.params.id);

    if (!bill) {
      bill = await resolveBillObject(req.params.id);
    }

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill or order not found' });
    }

    if (!remark) {
      return res.status(400).json({ success: false, message: 'Staff remark is required for complimentary items/bills' });
    }

    if (isFullBill) {
      bill.isComplimentaryBill = true;
      bill.complimentaryBillRemark = remark;
      bill.finalAmount = 0;
      bill.balanceDue = 0;
      bill.subtotal = 0;
      bill.totalTaxAmount = 0;
      bill.serviceChargeAmount = 0;
    } else if (itemId) {
      const item = bill.items.id ? bill.items.id(itemId) : bill.items.find(i => String(i._id) === String(itemId));
      if (item) {
        item.isComplimentary = true;
        item.complimentaryReason = remark;
        item.totalPrice = 0;
      }
      const calculated = await calculateBillTotals(bill.items, {
        taxesEnabled: bill.taxesEnabled,
        serviceChargeEnabled: bill.serviceChargeEnabled,
        customServiceChargeRate: bill.serviceChargeRate,
        discountType: bill.billDiscountType,
        discountValue: bill.billDiscountValue,
        isComplimentaryBill: bill.isComplimentaryBill,
        isNonChargeableBill: bill.isNonChargeableBill
      });

      bill.subtotal = calculated.subtotal;
      bill.cgstAmount = calculated.cgstAmount;
      bill.sgstAmount = calculated.sgstAmount;
      bill.vatAmount = calculated.vatAmount;
      bill.totalTaxAmount = calculated.totalTaxAmount;
      bill.serviceChargeAmount = calculated.serviceChargeAmount;
      bill.finalAmount = calculated.finalAmount;
      bill.balanceDue = Math.max(0, calculated.finalAmount - bill.amountPaid);
    }

    if (bill._id && !bill.isNew && typeof bill.save === 'function') {
      try { await bill.save(); } catch (e) {}
    }
    return res.json({ success: true, message: 'Complimentary settings updated', data: bill });
  } catch (error) {
    console.error('Error applying complimentary:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Apply Non-Chargeable (NC) Items or Bill with Staff Remarks
// @route   PUT /api/v1/billing/:id/non-chargeable
// @access  Private
exports.applyNonChargeable = async (req, res) => {
  try {
    const { isFullBill, itemId, remark, employeeId } = req.body;
    let bill = await Bill.findById(req.params.id);

    if (!bill) {
      bill = await resolveBillObject(req.params.id);
    }

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill or order not found' });
    }

    if (!remark) {
      return res.status(400).json({ success: false, message: 'Staff remark is required for Non-Chargeable status' });
    }

    if (isFullBill) {
      bill.isNonChargeableBill = true;
      bill.ncStaffRemark = remark;
      if (employeeId) bill.ncEmployee = employeeId;
      bill.paymentStatus = 'Non-Chargeable';
      bill.status = 'Settled';
      bill.finalAmount = 0;
      bill.balanceDue = 0;
      bill.subtotal = 0;
      bill.totalTaxAmount = 0;
      bill.serviceChargeAmount = 0;

      if (bill.orders && bill.orders.length > 0) {
        await Order.updateMany(
          { _id: { $in: bill.orders } },
          { paymentStatus: 'Paid', status: 'Completed' }
        );
      }
    } else if (itemId) {
      const item = bill.items.id ? bill.items.id(itemId) : bill.items.find(i => String(i._id) === String(itemId));
      if (item) {
        item.isNonChargeable = true;
        item.ncRemark = remark;
        if (employeeId) item.staffEmployeeId = employeeId;
        item.totalPrice = 0;
      }
      const calculated = await calculateBillTotals(bill.items, {
        taxesEnabled: bill.taxesEnabled,
        serviceChargeEnabled: bill.serviceChargeEnabled,
        customServiceChargeRate: bill.serviceChargeRate,
        discountType: bill.billDiscountType,
        discountValue: bill.billDiscountValue,
        isComplimentaryBill: bill.isComplimentaryBill,
        isNonChargeableBill: bill.isNonChargeableBill
      });

      bill.subtotal = calculated.subtotal;
      bill.cgstAmount = calculated.cgstAmount;
      bill.sgstAmount = calculated.sgstAmount;
      bill.vatAmount = calculated.vatAmount;
      bill.totalTaxAmount = calculated.totalTaxAmount;
      bill.serviceChargeAmount = calculated.serviceChargeAmount;
      bill.finalAmount = calculated.finalAmount;
      bill.balanceDue = Math.max(0, calculated.finalAmount - bill.amountPaid);
    }

    if (bill._id && !bill.isNew && typeof bill.save === 'function') {
      try { await bill.save(); } catch (e) {}
    }
    return res.json({ success: true, message: 'Non-Chargeable status updated', data: bill });
  } catch (error) {
    console.error('Error applying NC:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Toggle Taxes or Service Charge on Bill
// @route   PUT /api/v1/billing/:id/toggle-charges
// @access  Private
exports.toggleTaxAndServiceCharge = async (req, res) => {
  try {
    const { taxesEnabled, serviceChargeEnabled, serviceChargeRate } = req.body;
    let bill = await Bill.findById(req.params.id);

    if (!bill) {
      bill = await resolveBillObject(req.params.id);
    }

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill or order not found' });
    }

    if (typeof taxesEnabled === 'boolean') bill.taxesEnabled = taxesEnabled;
    if (typeof serviceChargeEnabled === 'boolean') bill.serviceChargeEnabled = serviceChargeEnabled;
    if (typeof serviceChargeRate === 'number') bill.serviceChargeRate = serviceChargeRate;

    const calculated = await calculateBillTotals(bill.items, {
      taxesEnabled: bill.taxesEnabled,
      serviceChargeEnabled: bill.serviceChargeEnabled,
      customServiceChargeRate: bill.serviceChargeRate,
      discountType: bill.billDiscountType,
      discountValue: bill.billDiscountValue,
      isComplimentaryBill: bill.isComplimentaryBill,
      isNonChargeableBill: bill.isNonChargeableBill
    });

    bill.cgstAmount = calculated.cgstAmount;
    bill.sgstAmount = calculated.sgstAmount;
    bill.vatAmount = calculated.vatAmount;
    bill.totalTaxAmount = calculated.totalTaxAmount;
    bill.serviceChargeRate = calculated.serviceChargeRate;
    bill.serviceChargeAmount = calculated.serviceChargeAmount;
    bill.finalAmount = calculated.finalAmount;
    bill.balanceDue = Math.max(0, calculated.finalAmount - bill.amountPaid);

    if (bill._id && !bill.isNew && typeof bill.save === 'function') {
      try { await bill.save(); } catch (e) {}
    }

    let allSplits = [];
    // If part of split bills, also update sibling active split bills for consistent table tax settings
    if (bill.splitInfo?.isSplit && bill.splitInfo?.parentBill) {
      const siblings = await Bill.find({
        'splitInfo.parentBill': bill.splitInfo.parentBill,
        _id: { $ne: bill._id },
        status: 'Active'
      });

      for (const sib of siblings) {
        if (typeof taxesEnabled === 'boolean') sib.taxesEnabled = taxesEnabled;
        if (typeof serviceChargeEnabled === 'boolean') sib.serviceChargeEnabled = serviceChargeEnabled;
        if (typeof serviceChargeRate === 'number') sib.serviceChargeRate = serviceChargeRate;

        const sibCalc = await calculateBillTotals(sib.items, {
          taxesEnabled: sib.taxesEnabled,
          serviceChargeEnabled: sib.serviceChargeEnabled,
          customServiceChargeRate: sib.serviceChargeRate,
          discountType: sib.billDiscountType,
          discountValue: sib.billDiscountValue,
          isComplimentaryBill: sib.isComplimentaryBill,
          isNonChargeableBill: sib.isNonChargeableBill
        });

        sib.cgstAmount = sibCalc.cgstAmount;
        sib.sgstAmount = sibCalc.sgstAmount;
        sib.vatAmount = sibCalc.vatAmount;
        sib.totalTaxAmount = sibCalc.totalTaxAmount;
        sib.serviceChargeRate = sibCalc.serviceChargeRate;
        sib.serviceChargeAmount = sibCalc.serviceChargeAmount;
        sib.finalAmount = sibCalc.finalAmount;
        sib.balanceDue = Math.max(0, sibCalc.finalAmount - sib.amountPaid);
        await sib.save();
      }

      allSplits = await Bill.find({
        'splitInfo.parentBill': bill.splitInfo.parentBill,
        status: 'Active'
      }).populate('table').populate('session').populate('orders').populate('createdBy', 'name role');
    }

    const populatedBill = await Bill.findById(bill._id)
      .populate('table')
      .populate('session')
      .populate('orders')
      .populate('createdBy', 'name role');

    return res.json({
      success: true,
      message: 'Charges updated',
      data: populatedBill,
      allSplits: allSplits.length > 0 ? allSplits : [populatedBill]
    });
  } catch (error) {
    console.error('Error toggling charges:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Modify Bill Items & Quantities
// @route   PUT /api/v1/billing/:id/modify
// @access  Private
exports.modifyBill = async (req, res) => {
  try {
    const { items } = req.body;
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Cannot modify a paid bill' });
    }

    const calculated = await calculateBillTotals(items, {
      taxesEnabled: bill.taxesEnabled,
      serviceChargeEnabled: bill.serviceChargeEnabled,
      customServiceChargeRate: bill.serviceChargeRate,
      discountType: bill.billDiscountType,
      discountValue: bill.billDiscountValue,
      isComplimentaryBill: bill.isComplimentaryBill,
      isNonChargeableBill: bill.isNonChargeableBill
    });

    bill.items = calculated.items;
    bill.subtotal = calculated.subtotal;
    bill.billDiscountAmount = calculated.billDiscountAmount;
    bill.cgstAmount = calculated.cgstAmount;
    bill.sgstAmount = calculated.sgstAmount;
    bill.vatAmount = calculated.vatAmount;
    bill.totalTaxAmount = calculated.totalTaxAmount;
    bill.serviceChargeAmount = calculated.serviceChargeAmount;
    bill.finalAmount = calculated.finalAmount;
    bill.balanceDue = Math.max(0, calculated.finalAmount - bill.amountPaid);

    await bill.save();
    return res.json({ success: true, message: 'Bill modified successfully', data: bill });
  } catch (error) {
    console.error('Error modifying bill:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Cancel Unpaid Bill
// @route   POST /api/v1/billing/:id/cancel
// @access  Private
exports.cancelBill = async (req, res) => {
  try {
    const { reason } = req.body;
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Paid bill cannot be cancelled. Use Void instead.' });
    }

    bill.status = 'Cancelled';
    bill.paymentStatus = 'Cancelled';
    bill.cancellationDetails = {
      cancelledBy: req.user?._id,
      reason: reason || 'Cancelled by staff',
      cancelledAt: new Date()
    };

    await bill.save();

    return res.json({ success: true, message: 'Bill cancelled', data: bill });
  } catch (error) {
    console.error('Error cancelling bill:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Void Paid Bill
// @route   POST /api/v1/billing/:id/void
// @access  Private
exports.voidBill = async (req, res) => {
  try {
    const { reason } = req.body;
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    bill.status = 'Voided';
    bill.paymentStatus = 'Voided';
    bill.voidDetails = {
      voidedBy: req.user?._id,
      reason: reason || 'Voided by manager',
      voidedAt: new Date()
    };

    await bill.save();

    return res.json({ success: true, message: 'Bill voided successfully', data: bill });
  } catch (error) {
    console.error('Error voiding bill:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Log Reprint & Increment Reprint Count
// @route   POST /api/v1/billing/:id/reprint
// @access  Private
exports.reprintBill = async (req, res) => {
  try {
    const { reason } = req.body;
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    bill.reprintCount += 1;
    bill.reprintLogs.push({
      printedBy: req.user?._id,
      timestamp: new Date(),
      reason: reason || 'Duplicate receipt print'
    });

    await bill.save();
    return res.json({ success: true, message: 'Reprint logged', data: bill });
  } catch (error) {
    console.error('Error logging reprint:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Record Payment (Single or Split Payments)
// @route   POST /api/v1/billing/:id/payment
// @access  Private
exports.recordPayment = async (req, res) => {
  try {
    const { payments, billData, orderId, tableId } = req.body;
    let bill = null;

    if (mongoose.Types.ObjectId.isValid(req.params.id)) {
      bill = await Bill.findById(req.params.id);
    }

    if (!bill && (orderId || req.params.id)) {
      const searchId = orderId || req.params.id;
      if (mongoose.Types.ObjectId.isValid(searchId)) {
        bill = await Bill.findOne({ orders: searchId, paymentStatus: 'Paid' });
      }
    }

    // If bill does not exist in DB yet, create the Bill document now upon payment!
    if (!bill) {
      const targetId = orderId || req.params.id;
      let targetOrders = [];
      let targetTable = tableId;
      let rawItems = [];

      if (billData && billData.items) {
        rawItems = billData.items;
        if (billData.orders) targetOrders = billData.orders;
        if (billData.table) targetTable = billData.table?._id || billData.table;
      } else if (mongoose.Types.ObjectId.isValid(targetId)) {
        const ord = await Order.findById(targetId).populate('items.menuItem');
        if (ord) {
          targetOrders = [ord._id];
          targetTable = targetTable || ord.table;
          rawItems = (ord.items || []).filter(i => i.status !== 'Cancelled').map(i => ({
            menuItem: i.menuItem?._id || i.menuItem,
            foodName: i.foodName || i.menuItem?.foodName || 'Item',
            variantName: i.variant?.name,
            unitPrice: i.unitPrice,
            quantity: i.quantity,
            totalPrice: i.totalPrice,
            isOnRequest: i.isOnRequest || false,
            itemType: i.itemType || 'Food',
            taxType: i.taxType,
            taxRate: i.taxRate
          }));
        }
      }

      const calculated = await calculateBillTotals(rawItems, {
        discountType: billData?.discountType || 'None',
        discountValue: Number(billData?.discountValue) || 0
      });
      const billNumber = billData?.billNumber || await generateBillNumber();

      bill = new Bill({
        _id: mongoose.Types.ObjectId.isValid(req.params.id) ? req.params.id : new mongoose.Types.ObjectId(),
        billNumber,
        orders: targetOrders,
        table: targetTable,
        items: calculated.items,
        subtotal: billData?.subtotal !== undefined ? billData.subtotal : calculated.subtotal,
        billDiscountType: billData?.discountType || 'None',
        billDiscountValue: Number(billData?.discountValue) || 0,
        billDiscountAmount: billData?.discountAmount !== undefined ? billData.discountAmount : calculated.billDiscountAmount,
        billDiscountReason: billData?.discountReason || '',
        discountGivenBy: billData?.discountGivenBy || '',
        cgstAmount: billData?.cgstAmount !== undefined ? billData.cgstAmount : calculated.cgstAmount,
        sgstAmount: billData?.sgstAmount !== undefined ? billData.sgstAmount : calculated.sgstAmount,
        vatAmount: calculated.vatAmount,
        totalTaxAmount: billData?.totalTaxAmount !== undefined ? billData.totalTaxAmount : calculated.totalTaxAmount,
        serviceChargeRate: billData?.serviceChargeRate !== undefined ? billData.serviceChargeRate : calculated.serviceChargeRate,
        serviceChargeAmount: billData?.serviceChargeAmount !== undefined ? billData.serviceChargeAmount : calculated.serviceChargeAmount,
        serviceChargeEnabled: true,
        taxesEnabled: true,
        finalAmount: billData?.finalAmount !== undefined ? billData.finalAmount : calculated.finalAmount,
        amountPaid: 0,
        balanceDue: billData?.finalAmount !== undefined ? billData.finalAmount : calculated.finalAmount,
        paymentStatus: 'Pending',
        status: 'Active',
        payments: [],
        createdBy: req.user?._id
      });
    } else if (billData && billData.discountType && billData.discountType !== 'None') {
      bill.billDiscountType = billData.discountType;
      bill.billDiscountValue = Number(billData.discountValue) || 0;
      bill.billDiscountAmount = Number(billData.discountAmount) || 0;
      bill.billDiscountReason = billData.discountReason || '';
      if (billData.discountGivenBy) bill.discountGivenBy = billData.discountGivenBy;
      if (billData.subtotal !== undefined) {
        bill.subtotal = billData.subtotal;
        bill.cgstAmount = billData.cgstAmount;
        bill.sgstAmount = billData.sgstAmount;
        bill.totalTaxAmount = billData.totalTaxAmount;
        bill.serviceChargeAmount = billData.serviceChargeAmount;
        bill.finalAmount = billData.finalAmount;
      }
    }

    if (!payments || !Array.isArray(payments) || payments.length === 0) {
      return res.status(400).json({ success: false, message: 'At least one payment method details required' });
    }

    let addedTotal = 0;
    payments.forEach(p => {
      const amt = Number(p.amount) || 0;
      addedTotal += amt;
      bill.payments.push({
        mode: p.mode || 'Cash',
        amount: amt,
        txnId: p.txnId || '',
        cardType: p.cardType || '',
        receiptImage: p.receiptImage || '',
        timestamp: new Date()
      });
    });

    bill.amountPaid += addedTotal;
    bill.balanceDue = Math.max(0, bill.finalAmount - bill.amountPaid);

    const isNcPayment = (payments && payments.some(p => p.mode === 'NC')) || billData?.isNonChargeableBill;

    if (isNcPayment) {
      bill.isNonChargeableBill = true;
      bill.ncStaffRemark = billData?.ncStaffRemark || billData?.remark || 'Non-Chargeable';
      if (billData?.ncEmployee || billData?.employeeId) {
        bill.ncEmployee = billData.ncEmployee || billData.employeeId;
      }
      bill.paymentStatus = 'Non-Chargeable';
      bill.status = 'Settled';
      bill.finalAmount = 0;
      bill.balanceDue = 0;
      bill.subtotal = 0;
      bill.cgstAmount = 0;
      bill.sgstAmount = 0;
      bill.totalTaxAmount = 0;
      bill.serviceChargeAmount = 0;

      // Preserve original unit prices on items while setting totalPrice to 0
      if (bill.items && bill.items.length > 0) {
        bill.items.forEach(it => {
          it.isNonChargeable = true;
          it.totalPrice = 0;
        });
      }
    } else if (bill.paymentStatus !== 'Non-Chargeable') {
      if (bill.balanceDue === 0 || bill.amountPaid >= bill.finalAmount) {
        bill.paymentStatus = 'Paid';
        bill.status = 'Settled';
      } else if (bill.amountPaid > 0) {
        bill.paymentStatus = 'Partially Paid';
      }
    }

    await bill.save();

    if (bill.paymentStatus === 'Paid' || bill.paymentStatus === 'Non-Chargeable') {
      const io = req.app.get('io') || req.app.get('socketio');

      // Update all associated Order documents to Paid & Completed
      if (bill.orders && bill.orders.length > 0) {
        await Order.updateMany(
          { _id: { $in: bill.orders } },
          { paymentStatus: 'Paid', status: 'Completed' }
        );
        if (io) {
          bill.orders.forEach(oId => {
            io.emit('order_status_updated', { _id: oId, paymentStatus: 'Paid', status: 'Completed', table: bill.table });
          });
        }
      }

      // Check if all active bills for this table are paid or settled
      const targetTableId = bill.table?._id || bill.table;
      if (targetTableId) {
        const remainingUnpaid = await Bill.countDocuments({
          table: targetTableId,
          _id: { $ne: bill._id },
          status: 'Active',
          paymentStatus: { $nin: ['Paid', 'Non-Chargeable'] }
        });

        if (remainingUnpaid === 0) {
          const updatedTable = await Table.findByIdAndUpdate(
            targetTableId,
            { status: 'Available', currentSession: null },
            { new: true }
          );
          if (io && updatedTable) {
            io.emit('table_status_changed', updatedTable);
            io.emit('table_status_updated', updatedTable);
            io.emit('table_payment_completed', { tableId: targetTableId, billId: bill._id, tableNumber: updatedTable.tableNumber || updatedTable.name });
            io.emit('table_payment_received', { tableId: targetTableId, billId: bill._id, tableNumber: updatedTable.tableNumber || updatedTable.name });
          } else if (io) {
            io.emit('table_payment_completed', { tableId: targetTableId, billId: bill._id });
            io.emit('table_payment_received', { tableId: targetTableId, billId: bill._id });
          }
        }
      }

      // If dining session associated
      if (bill.session) {
        const sessionDoc = await DiningSession.findById(bill.session);
        if (sessionDoc) {
          sessionDoc.paymentStatus = 'Paid';
          sessionDoc.status = 'Completed';
          sessionDoc.endTime = new Date();
          await sessionDoc.save();
        }
      }
    }

    return res.json({
      success: true,
      message: bill.paymentStatus === 'Paid' ? 'Bill settled successfully' : 'Partial payment recorded',
      data: bill
    });
  } catch (error) {
    console.error('Error recording payment:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Billing Analytics Summary
// @route   GET /api/v1/billing/analytics/summary
// @access  Private
exports.getBillingAnalytics = async (req, res) => {
  try {
    const totalSales = await Bill.aggregate([
      { $match: { status: 'Settled', paymentStatus: 'Paid' } },
      { $group: { _id: null, totalRevenue: { $sum: '$finalAmount' }, totalGST: { $sum: '$totalTaxAmount' }, totalVAT: { $sum: '$vatAmount' }, totalDiscounts: { $sum: '$billDiscountAmount' }, count: { $sum: 1 } } }
    ]);

    const paymentModes = await Bill.aggregate([
      { $match: { status: 'Settled' } },
      { $unwind: '$payments' },
      { $group: { _id: '$payments.mode', totalAmount: { $sum: '$payments.amount' }, count: { $sum: 1 } } }
    ]);

    const activeBillsCount = await Bill.countDocuments({ status: 'Active', paymentStatus: 'Pending' });
    const voidedCount = await Bill.countDocuments({ status: 'Voided' });
    const cancelledCount = await Bill.countDocuments({ status: 'Cancelled' });

    return res.json({
      success: true,
      data: {
        summary: totalSales[0] || { totalRevenue: 0, totalGST: 0, totalVAT: 0, totalDiscounts: 0, count: 0 },
        paymentModes,
        counts: {
          active: activeBillsCount,
          voided: voidedCount,
          cancelled: cancelledCount
        }
      }
    });
  } catch (error) {
    console.error('Error fetching billing analytics:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get Comprehensive Daily Sales Report
// @route   GET /api/v1/billing/daily-sales-report
// @access  Private
exports.getDailySalesReport = async (req, res) => {
  try {
    const { date, startDate, endDate } = req.query;

    let start = new Date();
    let end = new Date();

    if (date) {
      start = new Date(date);
      start.setHours(0, 0, 0, 0);
      end = new Date(date);
      end.setHours(23, 59, 59, 999);
    } else if (startDate && endDate) {
      start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    const dateFilter = { createdAt: { $gte: start, $lte: end } };

    // Fetch All Bills for the day
    const bills = await Bill.find(dateFilter)
      .populate('table')
      .populate('generatedBy', 'name role email')
      .populate('ncEmployee', 'name role')
      .sort({ createdAt: -1 });

    // Fetch Spoilage Records
    const spoilages = await FoodSpoilage.find(dateFilter).sort({ createdAt: -1 });

    // Fetch Audit Logs for edits, voids, cancellations, discounts, SC removal
    const auditLogs = await AuditLog.find(dateFilter)
      .populate('employeeId', 'name role')
      .sort({ createdAt: -1 });

    // Summary Aggregations
    let grossSales = 0;
    let totalDiscounts = 0;
    let totalNonChargeable = 0;
    let totalSpoilageValue = 0;
    let totalServiceCharge = 0;
    let totalTaxes = 0;
    let netCollection = 0;
    let totalBillsCount = bills.length;
    let voidedBillsCount = 0;
    let cancelledBillsCount = 0;
    let serviceChargeRemovalsCount = 0;
    let serviceChargeRemovedAmount = 0;

    const discountReport = [];
    const ncReport = [];
    const modificationLogs = [];
    const cancellationLogs = [];
    const scRemovalLogs = [];
    const spoilageLogs = [];

    // Calculate Spoilage Total
    spoilages.forEach(s => {
      totalSpoilageValue += (s.totalLossAmount || 0);
      spoilageLogs.push({
        _id: s._id,
        itemName: s.itemName,
        quantity: s.quantity,
        unit: s.unit || 'pcs',
        totalLossAmount: s.totalLossAmount,
        spoilageRemarks: s.reason || s.spoilageRemarks || 'Marked spoiled',
        spoilageMarkedBy: s.recordedByName || 'Staff',
        timestamp: s.createdAt
      });
    });

    bills.forEach(bill => {
      const isCancelled = bill.status === 'Cancelled' || bill.paymentStatus === 'Cancelled';
      const isVoided = bill.status === 'Voided' || bill.paymentStatus === 'Voided';

      if (isCancelled) {
        cancelledBillsCount++;
        cancellationLogs.push({
          billNumber: bill.billNumber,
          tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Takeaway/Walk-in',
          finalAmount: bill.finalAmount,
          status: 'Cancelled',
          reason: bill.notes || bill.cancelReason || 'Bill Cancelled',
          staff: bill.generatedBy?.name || 'Staff',
          timestamp: bill.updatedAt || bill.createdAt
        });
        return;
      }

      if (isVoided) {
        voidedBillsCount++;
        cancellationLogs.push({
          billNumber: bill.billNumber,
          tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Takeaway/Walk-in',
          finalAmount: bill.finalAmount,
          status: 'Voided',
          reason: bill.notes || bill.voidReason || 'Bill Voided',
          staff: bill.generatedBy?.name || 'Staff',
          timestamp: bill.updatedAt || bill.createdAt
        });
        return;
      }

      // Valid Active / Paid / Settled Bill
      grossSales += (bill.subtotal || 0);
      totalTaxes += (bill.totalTaxAmount || 0);
      netCollection += (bill.amountPaid || bill.finalAmount || 0);

      // Discounts
      const discAmt = (bill.billDiscountAmount || 0) + (bill.itemLevelDiscounts || 0);
      if (discAmt > 0 || bill.billDiscountType !== 'None') {
        totalDiscounts += discAmt;
        discountReport.push({
          billNumber: bill.billNumber,
          tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Dine-In',
          subtotal: bill.subtotal,
          discountType: bill.billDiscountType,
          discountValue: bill.billDiscountValue,
          discountAmount: discAmt,
          reason: bill.billDiscountReason || 'Customer Discount',
          staff: bill.generatedBy?.name || 'Staff',
          timestamp: bill.createdAt
        });
      }

      // Non-Chargeable / Complimentary
      if (bill.isNonChargeableBill || bill.isComplimentaryBill || bill.paymentStatus === 'Non-Chargeable') {
        const ncVal = bill.subtotal || bill.finalAmount || 0;
        totalNonChargeable += ncVal;
        ncReport.push({
          billNumber: bill.billNumber,
          tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Dine-In',
          type: bill.isComplimentaryBill ? 'Complimentary' : 'Non-Chargeable',
          value: ncVal,
          reason: bill.ncStaffRemark || bill.complimentaryBillRemark || 'NC Staff Order',
          staff: bill.ncEmployee?.name || bill.generatedBy?.name || 'Staff',
          timestamp: bill.createdAt
        });
      }

      // Individual NC / Complimentary Items inside normal bills
      (bill.items || []).forEach(item => {
        if (item.isSpoiled) {
          totalSpoilageValue += (item.unitPrice * item.quantity);
          spoilageLogs.push({
            billNumber: bill.billNumber,
            itemName: item.foodName,
            quantity: item.quantity,
            unit: 'pcs',
            totalLossAmount: (item.unitPrice * item.quantity),
            spoilageRemarks: item.spoilageRemarks || 'Spoiled dish on bill',
            spoilageMarkedBy: item.spoilageMarkedBy || 'Staff',
            timestamp: bill.createdAt
          });
        } else if (item.isNonChargeable || item.isComplimentary) {
          totalNonChargeable += (item.unitPrice * item.quantity);
          ncReport.push({
            billNumber: bill.billNumber,
            tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Dine-In',
            itemName: item.foodName,
            type: item.isComplimentary ? 'Item Complimentary' : 'Item NC',
            value: item.unitPrice * item.quantity,
            reason: item.ncRemark || item.complimentaryReason || 'Item waived',
            staff: item.staffEmployeeId || 'Staff',
            timestamp: bill.createdAt
          });
        }
      });

      // Service Charge Logic
      if (bill.serviceChargeEnabled === false || bill.serviceChargeRate === 0) {
        serviceChargeRemovalsCount++;
        const waivedAmount = (bill.subtotal * 0.05);
        serviceChargeRemovedAmount += waivedAmount;
        scRemovalLogs.push({
          billNumber: bill.billNumber,
          tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Dine-In',
          subtotal: bill.subtotal,
          waivedAmount,
          reason: 'Service Charge Waived/Removed by Staff',
          staff: bill.generatedBy?.name || 'Staff',
          timestamp: bill.createdAt
        });
      } else {
        totalServiceCharge += (bill.serviceChargeAmount || 0);
      }

      // Check Bill Modifications / Splits
      if (bill.splitInfo?.isSplit) {
        modificationLogs.push({
          billNumber: bill.billNumber,
          tableName: bill.table?.tableNumber ? `Table ${bill.table.tableNumber}` : 'Dine-In',
          modificationType: `Bill Split (${bill.splitInfo.splitType})`,
          details: `Split into ${bill.splitInfo.totalSplits} bills`,
          timestamp: bill.createdAt
        });
      }
    });

    // Also include AuditLog entries for bill modifications & void events
    auditLogs.forEach(log => {
      if (log.action && (log.action.includes('Bill') || log.action.includes('Order') || log.action.includes('Discount') || log.action.includes('Void'))) {
        modificationLogs.push({
          billNumber: log.entityId || 'N/A',
          modificationType: log.action,
          details: log.details || log.description || '',
          staff: log.employeeId?.name || 'Staff',
          timestamp: log.createdAt
        });
      }
    });

    return res.status(200).json({
      success: true,
      data: {
        dateRange: {
          startDate: start,
          endDate: end
        },
        summary: {
          grossSales,
          totalDiscounts,
          totalNonChargeable,
          totalSpoilageValue,
          totalServiceCharge,
          serviceChargeRemovalsCount,
          serviceChargeRemovedAmount,
          totalTaxes,
          netCollection,
          totalBillsCount,
          voidedBillsCount,
          cancelledBillsCount
        },
        reports: {
          discountReport,
          ncReport,
          modificationLogs,
          cancellationLogs,
          scRemovalLogs,
          spoilageLogs
        }
      }
    });
  } catch (error) {
    console.error('Error generating daily sales report:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
