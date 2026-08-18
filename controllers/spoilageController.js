const mongoose = require('mongoose');
const FoodSpoilage = require('../models/FoodSpoilage');
const AuditLog = require('../models/AuditLog');
const Order = require('../models/Order');
const Table = require('../models/Table');

// @desc    Record a new Food Spoilage entry
// @route   POST /api/v1/spoilage
// @access  Private
exports.createSpoilage = async (req, res) => {
  try {
    const {
      orderId,
      orderRef,
      tableNumber,
      tableName,
      floorName,
      floorRef,
      menuItem,
      foodName,
      quantity = 1,
      unitPrice = 0,
      remarks,
      markedBy,
      kitchenStation = 'General',
      source = 'Waiter POS'
    } = req.body;

    if (!foodName || !remarks || !markedBy) {
      return res.status(400).json({
        success: false,
        message: 'Food name, remarks, and markedBy staff name are required'
      });
    }

    let finalFloorName = floorName || '';
    let finalFloorRef = floorRef || null;

    // Auto-detect floor from Table if missing
    if (!finalFloorName && (tableNumber || tableName)) {
      try {
        const queryVal = tableNumber || tableName;
        const matchedTable = await Table.findOne({
          $or: [
            { tableNumber: queryVal },
            { name: queryVal }
          ]
        }).populate('floor', 'name');
        if (matchedTable?.floor) {
          finalFloorName = matchedTable.floor.name;
          finalFloorRef = matchedTable.floor._id;
        }
      } catch (tErr) {}
    }

    const q = Number(quantity || 1);
    const uPrice = Number(unitPrice || 0);
    const totalLossAmount = q * uPrice;

    const spoilage = await FoodSpoilage.create({
      orderId: orderId || '',
      orderRef: orderRef || null,
      tableNumber: tableNumber || '',
      tableName: tableName || '',
      floorName: finalFloorName || 'Main Dining Floor',
      floorRef: finalFloorRef,
      menuItem: menuItem || null,
      foodName,
      quantity: q,
      unitPrice: uPrice,
      totalLossAmount,
      remarks,
      markedBy,
      markedByStaffId: req.user?._id || req.user?.id || null,
      kitchenStation,
      source
    });

    // Update matching item in Order database model
    try {
      let orderObj = null;

      // 1. Try orderRef by ObjectId
      if (orderRef && mongoose.Types.ObjectId.isValid(orderRef)) {
        orderObj = await Order.findById(orderRef);
      }

      // 2. Try orderId as Mongo ObjectId
      if (!orderObj && orderId && mongoose.Types.ObjectId.isValid(orderId)) {
        orderObj = await Order.findById(orderId);
      }

      // 3. Try orderId as human-readable string (e.g. ORD-1E5L2I)
      if (!orderObj && orderId) {
        const rawId = String(orderId);
        const matchOrd = rawId.match(/ORD-[A-Z0-9]+/i);
        const searchId = matchOrd ? matchOrd[0] : rawId;
        orderObj = await Order.findOne({ 
          $or: [
            { orderId: searchId },
            { orderId: rawId }
          ]
        });
      }

      // 4. Try tableNumber / tableName lookup for active order
      if (!orderObj && (tableNumber || tableName)) {
        const rawT = String(tableNumber || tableName).trim();
        const numOnly = rawT.replace(/\D/g, ''); // "T1" -> "1"
        const matchedTable = await Table.findOne({
          $or: [
            { tableNumber: rawT },
            { tableNumber: numOnly },
            { name: rawT },
            { name: `Table ${rawT}` },
            { name: `Table ${numOnly}` }
          ]
        });
        if (matchedTable) {
          orderObj = await Order.findOne({
            table: matchedTable._id,
            status: { $nin: ['Completed', 'Cancelled'] }
          }).sort({ createdAt: -1 });
        }
      }

      if (orderObj && Array.isArray(orderObj.items)) {
        let updatedItem = false;
        orderObj.items.forEach(it => {
          // Extract actual MenuItem ID whether it.menuItem is ObjectId or populated object
          let itMenuItemId = '';
          if (it.menuItem) {
            itMenuItemId = typeof it.menuItem === 'object' ? (it.menuItem._id || it.menuItem.id || '').toString() : it.menuItem.toString();
          }
          const itItemId = it._id ? it._id.toString() : '';

          // Extract food name from all possible nested properties
          const itFoodName = (
            it.foodName || 
            (typeof it.menuItem === 'object' ? (it.menuItem.displayName || it.menuItem.foodName || it.menuItem.name) : '') ||
            it.displayName || 
            it.name || 
            ''
          ).toLowerCase().trim();

          const targetMenuItemId = menuItem ? (typeof menuItem === 'object' ? (menuItem._id || menuItem.id || '').toString() : menuItem.toString()) : '';
          const targetFoodName = (foodName || '').toLowerCase().trim();

          const isIdMatch = Boolean(
            (targetMenuItemId && (itMenuItemId === targetMenuItemId || itItemId === targetMenuItemId))
          );
          const isNameMatch = Boolean(
            (targetFoodName && itFoodName && (itFoodName.includes(targetFoodName) || targetFoodName.includes(itFoodName)))
          );

          if ((isIdMatch || isNameMatch) && !it.isSpoiled) {
            it.isSpoiled = true;
            it.spoilageRemarks = remarks;
            it.spoilageMarkedBy = markedBy;
            updatedItem = true;
          }
        });

        if (updatedItem) {
          orderObj.markModified('items');

          // Recalculate order subtotal and total excluding spoiled items
          const activeItems = orderObj.items.filter(i => !i.isSpoiled);
          const newSubtotal = activeItems.reduce((acc, i) => acc + (i.totalPrice || (i.unitPrice * i.quantity) || 0), 0);
          orderObj.subtotal = newSubtotal;
          orderObj.subTotal = newSubtotal;
          orderObj.tax = Math.round(newSubtotal * 0.05 * 100) / 100;
          orderObj.total = Math.round((newSubtotal + orderObj.tax) * 100) / 100;

          await orderObj.save();

          const io = req.app.get('io');
          if (io) {
            io.emit('order_updated', orderObj);
            io.emit('order_status_updated', orderObj);
          }
        }
      }
    } catch (oErr) {
      console.error('Failed to flag order item as spoiled:', oErr);
    }

    // Create Audit Log entry
    try {
      const empId = (req.user?._id || req.user?.id) && mongoose.Types.ObjectId.isValid(req.user._id || req.user.id)
        ? (req.user._id || req.user.id)
        : new mongoose.Types.ObjectId();

      await AuditLog.create({
        employeeId: empId,
        employeeName: markedBy || req.user?.name || 'Staff',
        action: 'Food Spoilage Recorded',
        entityType: 'FoodSpoilage',
        entityId: spoilage._id,
        updatedValue: spoilage,
        ipAddress: req.ip
      });
    } catch (aErr) {
      console.error('AuditLog error in spoilage:', aErr);
    }

    // Emit Socket.IO event for real-time drawer & page updates across POS and Admin
    const io = req.app.get('io');
    if (io) {
      io.emit('food_spoilage_recorded', spoilage);
    }

    res.status(201).json({ success: true, data: spoilage });
  } catch (error) {
    console.error('Create Spoilage error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all Food Spoilage logs
// @route   GET /api/v1/spoilage
// @access  Private
exports.getSpoilages = async (req, res) => {
  try {
    const spoilages = await FoodSpoilage.find()
      .populate('menuItem', 'displayName foodName price basePrice')
      .populate('orderRef', 'orderId table status')
      .populate('floorRef', 'name slug')
      .sort({ createdAt: -1 });

    const totalLoss = spoilages.reduce((sum, item) => sum + (item.totalLossAmount || 0), 0);
    const totalItems = spoilages.reduce((sum, item) => sum + (item.quantity || 1), 0);

    // Calculate Floor-wise statistics breakdown
    const floorStats = {};
    spoilages.forEach(item => {
      const fName = item.floorName || item.floorRef?.name || 'Main Dining Floor';
      if (!floorStats[fName]) {
        floorStats[fName] = { floorName: fName, count: 0, totalItems: 0, totalLoss: 0 };
      }
      floorStats[fName].count += 1;
      floorStats[fName].totalItems += (item.quantity || 1);
      floorStats[fName].totalLoss += (item.totalLossAmount || 0);
    });

    res.status(200).json({
      success: true,
      count: spoilages.length,
      totalItems,
      totalLoss,
      floorStats: Object.values(floorStats),
      data: spoilages
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a Food Spoilage log entry
// @route   DELETE /api/v1/spoilage/:id
// @access  Private
exports.deleteSpoilage = async (req, res) => {
  try {
    const spoilage = await FoodSpoilage.findById(req.params.id);
    if (!spoilage) {
      return res.status(404).json({ success: false, message: 'Spoilage entry not found' });
    }

    await spoilage.deleteOne();

    const io = req.app.get('io');
    if (io) {
      io.emit('food_spoilage_deleted', req.params.id);
    }

    res.status(200).json({ success: true, message: 'Spoilage entry deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
