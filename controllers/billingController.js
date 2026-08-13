const Bill = require('../models/Bill');
const Order = require('../models/Order');
const DiningSession = require('../models/DiningSession');
const MenuItem = require('../models/MenuItem');
const MenuCategory = require('../models/MenuCategory');
const RestaurantSettings = require('../models/RestaurantSettings');
const Table = require('../models/Table');

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
    
    // Check complimentary/NC flags on item
    const isComp = item.isComplimentary || isComplimentaryBill || isNonChargeableBill;
    const isNC = item.isNonChargeable || isNonChargeableBill;

    let totalPrice = isComp || isNC ? 0 : unitPrice * quantity;
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

    if (taxesEnabled && !isComp && !isNC && totalPrice > 0) {
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
      totalPrice,
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

// @desc    Generate Bill from Order(s) or Session
// @route   POST /api/v1/billing/generate
// @access  Private
exports.generateBill = async (req, res) => {
  try {
    const { orderId, orderIds, sessionId, tableId, customer } = req.body;

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
          rawItems.push({
            menuItem: item.menuItem?._id || item.menuItem,
            foodName: item.foodName || item.menuItem?.foodName || 'Food Item',
            variantName: item.variant?.name,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
            isOnRequest: item.isOnRequest || false,
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

    const bill = await Bill.create({
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

    const populatedBill = await Bill.findById(bill._id)
      .populate('table')
      .populate('session')
      .populate('orders')
      .populate('createdBy', 'name role');

    return res.status(201).json({
      success: true,
      message: 'Bill generated successfully',
      data: populatedBill
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
    const { status, paymentStatus, search, page = 1, limit = 50 } = req.query;

    const query = {};
    if (status && status !== 'ALL') query.status = status;
    if (paymentStatus && paymentStatus !== 'ALL') query.paymentStatus = paymentStatus;
    if (search) {
      query.$or = [
        { billNumber: { $regex: search, $options: 'i' } },
        { 'customer.name': { $regex: search, $options: 'i' } },
        { 'customer.phone': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (page - 1) * limit;
    const bills = await Bill.find(query)
      .populate('table', 'tableNumber name capacity')
      .populate('session', 'sessionId startTime')
      .populate('createdBy', 'name role')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Bill.countDocuments(query);

    return res.json({
      success: true,
      data: bills,
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
    const bill = await Bill.findById(req.params.id)
      .populate('table')
      .populate('session')
      .populate('orders')
      .populate('createdBy', 'name role')
      .populate('voidDetails.voidedBy', 'name role')
      .populate('cancellationDetails.cancelledBy', 'name role');

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

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
    const parentBill = await Bill.findById(req.params.id);

    if (!parentBill) {
      return res.status(404).json({ success: false, message: 'Parent bill not found' });
    }

    if (parentBill.paymentStatus === 'Paid') {
      return res.status(400).json({ success: false, message: 'Cannot split an already settled bill' });
    }

    const createdSplitBills = [];

    if (splitType === 'Equal' || !itemAllocations || !Array.isArray(itemAllocations) || itemAllocations.length === 0) {
      const equalCount = Math.max(2, parseInt(splitCount) || 2);
      const equalSubtotal = parentBill.subtotal / equalCount;
      const equalCgst = parentBill.cgstAmount / equalCount;
      const equalSgst = parentBill.sgstAmount / equalCount;
      const equalVat = parentBill.vatAmount / equalCount;
      const equalServiceCharge = parentBill.serviceChargeAmount / equalCount;
      const equalFinal = parentBill.finalAmount / equalCount;

      for (let i = 1; i <= equalCount; i++) {
        const splitNum = await generateBillNumber();
        const splitBill = await Bill.create({
          billNumber: `${splitNum}-S${i}`,
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
          items: parentBill.items.map(it => ({
            ...it.toObject(),
            quantity: it.quantity / equalCount,
            totalPrice: it.totalPrice / equalCount
          })),
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
            originalItem = parentBill.items.id(alloc.itemId) || parentBill.items.find(it => String(it._id) === String(alloc.itemId));
          }
          if (!originalItem && alloc.foodName) {
            originalItem = parentBill.items.find(it => it.foodName === alloc.foodName);
          }
          if (!originalItem && alloc.itemIndex !== undefined && parentBill.items[alloc.itemIndex]) {
            originalItem = parentBill.items[alloc.itemIndex];
          }

          if (originalItem) {
            splitRawItems.push({
              menuItem: originalItem.menuItem,
              foodName: originalItem.foodName,
              variantName: originalItem.variantName,
              unitPrice: originalItem.unitPrice,
              quantity: alloc.quantity || originalItem.quantity,
              totalPrice: originalItem.unitPrice * (alloc.quantity || originalItem.quantity),
              isComplimentary: originalItem.isComplimentary,
              isNonChargeable: originalItem.isNonChargeable
            });
          }
        });

        if (splitRawItems.length > 0) {
          const calculated = await calculateBillTotals(splitRawItems, {
            taxesEnabled: parentBill.taxesEnabled,
            serviceChargeEnabled: parentBill.serviceChargeEnabled,
            customServiceChargeRate: parentBill.serviceChargeRate
          });

          const splitNum = await generateBillNumber();
          const splitBill = await Bill.create({
            billNumber: `${splitNum}-S${i}`,
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

    // Populate created split bills with table details
    const populatedSplits = await Bill.find({ 'splitInfo.parentBill': parentBill._id }).populate('table');

    // Mark original parent bill status
    parentBill.status = 'Voided';
    parentBill.notes = `Split into ${populatedSplits.length} child bills`;
    await parentBill.save();

    return res.json({
      success: true,
      message: `Bill split successfully into ${populatedSplits.length} bills`,
      data: populatedSplits.length > 0 ? populatedSplits : createdSplitBills
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
    if (!billIds || !Array.isArray(billIds) || billIds.length < 2) {
      return res.status(400).json({ success: false, message: 'Please select at least 2 bills to merge' });
    }

    const resolvedBillIds = [];

    for (const id of billIds) {
      if (!id) continue;
      const idStr = String(id);

      // 1. Try finding an existing non-voided Bill by _id
      let b = await Bill.findOne({ _id: idStr, status: { $ne: 'Voided' } });

      // 2. Try finding a Bill associated with this Order _id
      if (!b) {
        b = await Bill.findOne({ orders: idStr, status: { $ne: 'Voided' } });
      }

      // 3. If no bill exists for this Order ID, auto-generate one
      if (!b) {
        try {
          const ord = await Order.findById(idStr).populate('items.menuItem');
          if (ord) {
            const rawItems = (ord.items || [])
              .filter(item => item.status !== 'Cancelled')
              .map(item => ({
                menuItem: item.menuItem?._id || item.menuItem,
                foodName: item.foodName || item.menuItem?.foodName || 'Food Item',
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
            const billNumber = await generateBillNumber();

            b = await Bill.create({
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
        } catch (genErr) {
          console.error('Auto-generate bill for merge error:', genErr);
        }
      }

      if (b && !resolvedBillIds.some(existingId => String(existingId) === String(b._id))) {
        resolvedBillIds.push(b._id);
      }
    }

    const billsToMerge = await Bill.find({ _id: { $in: resolvedBillIds }, status: { $ne: 'Voided' } })
      .populate({
        path: 'table',
        populate: { path: 'floor' }
      });

    if (billsToMerge.length < 1) {
      return res.status(400).json({ success: false, message: 'No active bills or orders found to merge' });
    }

    const rawMergedItems = [];
    const mergedOrders = [];
    const tableDescriptions = [];

    // Check if all bills to merge belong to the same parent bill (e.g. merging split child bills)
    const parentIds = billsToMerge.map(b => b.splitInfo?.parentBill).filter(Boolean).map(String);
    const uniqueParentIds = [...new Set(parentIds)];

    if (uniqueParentIds.length === 1 && billsToMerge.every(b => b.splitInfo?.isSplit)) {
      const parentBillDoc = await Bill.findById(uniqueParentIds[0]);
      if (parentBillDoc && parentBillDoc.items && parentBillDoc.items.length > 0) {
        parentBillDoc.items.forEach(it => {
          rawMergedItems.push({
            menuItem: it.menuItem,
            foodName: it.foodName,
            variantName: it.variantName,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            totalPrice: it.totalPrice,
            isComplimentary: it.isComplimentary,
            isNonChargeable: it.isNonChargeable,
            taxType: it.taxType,
            taxRate: it.taxRate,
            sectionName: it.sectionName
          });
        });
        if (parentBillDoc.orders) mergedOrders.push(...parentBillDoc.orders);
      }
    }

    if (rawMergedItems.length === 0) {
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

        b.items.forEach(it => {
          rawMergedItems.push({
            menuItem: it.menuItem,
            foodName: it.foodName,
            variantName: it.variantName,
            unitPrice: it.unitPrice,
            quantity: it.quantity,
            totalPrice: it.totalPrice,
            isComplimentary: it.isComplimentary,
            isNonChargeable: it.isNonChargeable,
            taxType: it.taxType,
            taxRate: it.taxRate,
            sectionName: it.sectionName
          });
        });
      });
    }

    // Consolidate identical items by combining quantities
    const itemMap = new Map();
    rawMergedItems.forEach(it => {
      const key = `${it.foodName}||${it.variantName || ''}||${it.unitPrice}||${it.isComplimentary || false}||${it.isNonChargeable || false}`;
      if (itemMap.has(key)) {
        const existing = itemMap.get(key);
        existing.quantity += (it.quantity || 1);
        existing.totalPrice = (existing.isComplimentary || existing.isNonChargeable) ? 0 : existing.unitPrice * existing.quantity;
      } else {
        itemMap.set(key, { ...it, quantity: it.quantity || 1 });
      }
    });

    const mergedItems = Array.from(itemMap.values());

    const calculated = await calculateBillTotals(mergedItems);
    const billNumber = await generateBillNumber();

    const mergeNotesText = tableDescriptions.length > 0
      ? `Merged from ${tableDescriptions.join(' & ')}`
      : `Merged from bills: ${billsToMerge.map(b => b.billNumber).join(', ')}`;

    const mergedBill = await Bill.create({
      billNumber: `${billNumber}-M`,
      orders: [...new Set(mergedOrders.map(o => o.toString()))],
      session: billsToMerge[0].session,
      table: billsToMerge[0].table?._id || billsToMerge[0].table,
      customer: billsToMerge[0].customer,
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

    // Mark merged bills as Merged
    await Bill.updateMany(
      { _id: { $in: billIds } },
      { status: 'Merged', notes: `Merged into ${mergedBill.billNumber}` }
    );

    const populatedMergedBill = await Bill.findById(mergedBill._id).populate('table');

    return res.json({
      success: true,
      message: 'Bills merged successfully',
      data: populatedMergedBill
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
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    // Handle split bills: apply discount across all sibling split bills for the table/parent bill
    let siblingBills = [bill];
    const parentId = bill.splitInfo?.parentBill || (bill.splitInfo?.isSplit ? bill._id : null);
    if (parentId) {
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

      await sBill.save();
    }

    const updatedBill = await Bill.findById(req.params.id);
    let responseData = updatedBill;
    if (siblingBills.length > 1) {
      const allUpdatedSplits = await Bill.find({ $or: [{ 'splitInfo.parentBill': parentId }, { _id: parentId }], status: { $ne: 'Cancelled' } });
      if (allUpdatedSplits && allUpdatedSplits.length > 0) responseData = allUpdatedSplits;
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
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
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
      const item = bill.items.id(itemId) || bill.items.find(i => i._id.toString() === itemId);
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

    await bill.save();
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
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
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
      const item = bill.items.id(itemId) || bill.items.find(i => i._id.toString() === itemId);
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

    await bill.save();
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
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
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
    bill.serviceChargeAmount = calculated.serviceChargeAmount;
    bill.finalAmount = calculated.finalAmount;
    bill.balanceDue = Math.max(0, calculated.finalAmount - bill.amountPaid);

    await bill.save();
    return res.json({ success: true, message: 'Charges updated', data: bill });
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
    const { payments } = req.body; // Array of { mode, amount, txnId, cardType }
    const bill = await Bill.findById(req.params.id);

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
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
        timestamp: new Date()
      });
    });

    bill.amountPaid += addedTotal;
    bill.balanceDue = Math.max(0, bill.finalAmount - bill.amountPaid);

    if (bill.balanceDue === 0 || bill.amountPaid >= bill.finalAmount) {
      bill.paymentStatus = 'Paid';
      bill.status = 'Settled';
    } else if (bill.amountPaid > 0) {
      bill.paymentStatus = 'Partially Paid';
    }

    await bill.save();

    if (bill.paymentStatus === 'Paid') {
      const io = req.app.get('io') || req.app.get('socketio');

      // Update all associated Order documents
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

      // Check if all active bills for this table are paid
      const targetTableId = bill.table?._id || bill.table;
      if (targetTableId) {
        const remainingUnpaid = await Bill.countDocuments({
          table: targetTableId,
          _id: { $ne: bill._id },
          status: 'Active',
          paymentStatus: { $ne: 'Paid' }
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
