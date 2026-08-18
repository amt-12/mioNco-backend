const InventoryItem = require('../models/InventoryItem');
const InventoryTransaction = require('../models/InventoryTransaction');
const FloorStockAssignment = require('../models/FloorStockAssignment');

// @desc    Get all inventory items
// @route   GET /api/v1/inventory
// @access  Private
exports.getInventoryItems = async (req, res) => {
  try {
    const { category, lowStock, search } = req.query;
    let query = { isActive: true };

    if (category && category !== 'All') {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { sku: { $regex: search, $options: 'i' } },
        { supplierName: { $regex: search, $options: 'i' } }
      ];
    }

    let items = await InventoryItem.find(query).sort({ name: 1 });

    if (lowStock === 'true') {
      items = items.filter(item => item.currentStock <= item.minReorderLevel);
    }

    return res.status(200).json({
      success: true,
      count: items.length,
      data: items
    });
  } catch (error) {
    console.error('Error fetching inventory items:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single inventory item
// @route   GET /api/v1/inventory/:id
// @access  Private
exports.getInventoryItemById = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const transactions = await InventoryTransaction.find({ inventoryItem: req.params.id })
      .sort({ createdAt: -1 })
      .limit(30);

    return res.status(200).json({
      success: true,
      data: {
        item,
        transactions
      }
    });
  } catch (error) {
    console.error('Error fetching inventory item:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create new inventory item (Ingredients / Raw Materials)
// @route   POST /api/v1/inventory
// @access  Private
exports.createInventoryItem = async (req, res) => {
  try {
    const {
      name,
      sku,
      category,
      unit,
      openingStock,
      minReorderLevel,
      unitCost,
      supplierName,
      storageLocation,
      notes
    } = req.body;

    const initialStock = Number(openingStock) || 0;

    const item = await InventoryItem.create({
      name,
      sku,
      category,
      unit,
      openingStock: initialStock,
      currentStock: initialStock,
      minReorderLevel: Number(minReorderLevel) || 10,
      unitCost: Number(unitCost) || 0,
      supplierName: supplierName || 'General Supplier',
      storageLocation: storageLocation || 'Main Store',
      notes: notes || ''
    });

    if (initialStock > 0) {
      await InventoryTransaction.create({
        inventoryItem: item._id,
        itemName: item.name,
        type: 'Opening Stock',
        quantity: initialStock,
        previousStock: 0,
        newStock: initialStock,
        unitCost: item.unitCost,
        totalCost: initialStock * item.unitCost,
        reason: 'Initial Opening Stock Entry',
        recordedBy: req.user?._id,
        recordedByName: req.user?.name || 'Admin Staff'
      });
    }

    return res.status(201).json({
      success: true,
      message: 'Inventory item created successfully',
      data: item
    });
  } catch (error) {
    console.error('Error creating inventory item:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'SKU code already exists' });
    }
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update inventory item
// @route   PUT /api/v1/inventory/:id
// @access  Private
exports.updateInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const updatedItem = await InventoryItem.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    return res.status(200).json({
      success: true,
      message: 'Inventory item updated successfully',
      data: updatedItem
    });
  } catch (error) {
    console.error('Error updating inventory item:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Record inventory transaction (Purchases, Consumption, Wastage, Transfer, Adjustment)
// @route   POST /api/v1/inventory/transaction
// @access  Private
exports.recordTransaction = async (req, res) => {
  try {
    const {
      inventoryItemId,
      type,
      quantity,
      unitCost,
      vendorName,
      invoiceNumber,
      transferFrom,
      transferTo,
      reason
    } = req.body;

    const item = await InventoryItem.findById(inventoryItemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid positive quantity' });
    }

    const prevStock = item.currentStock;
    let newStock = prevStock;
    const effectiveCost = unitCost !== undefined ? Number(unitCost) : item.unitCost;

    switch (type) {
      case 'Purchase':
        newStock = prevStock + qty;
        item.lastRestockedAt = new Date();
        if (unitCost !== undefined) item.unitCost = Number(unitCost);
        break;
      case 'Consumption':
      case 'Wastage':
      case 'Transfer':
        newStock = prevStock - qty;
        break;
      case 'Adjustment':
        newStock = qty; // Direct adjustment to stock level
        break;
      default:
        return res.status(400).json({ success: false, message: 'Invalid transaction type' });
    }

    item.currentStock = newStock;
    await item.save();

    const transaction = await InventoryTransaction.create({
      inventoryItem: item._id,
      itemName: item.name,
      type,
      quantity: qty,
      previousStock: prevStock,
      newStock,
      unitCost: effectiveCost,
      totalCost: qty * effectiveCost,
      vendorName: vendorName || item.supplierName,
      invoiceNumber: invoiceNumber || '',
      transferFrom: transferFrom || '',
      transferTo: transferTo || '',
      reason: reason || '',
      recordedBy: req.user?._id,
      recordedByName: req.user?.name || 'Staff'
    });

    return res.status(200).json({
      success: true,
      message: `Transaction recorded: ${type} of ${qty} ${item.unit}`,
      data: {
        item,
        transaction
      }
    });
  } catch (error) {
    console.error('Error recording inventory transaction:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get inventory transactions history
// @route   GET /api/v1/inventory/transactions
// @access  Private
exports.getInventoryTransactions = async (req, res) => {
  try {
    const { type, itemId, limit = 100 } = req.query;
    let query = {};

    if (type && type !== 'All') {
      query.type = type;
    }
    if (itemId) {
      query.inventoryItem = itemId;
    }

    const transactions = await InventoryTransaction.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    return res.status(200).json({
      success: true,
      count: transactions.length,
      data: transactions
    });
  } catch (error) {
    console.error('Error fetching inventory transactions:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get item-wise inventory summary report
// @route   GET /api/v1/inventory/report
// @access  Private
exports.getInventoryReport = async (req, res) => {
  try {
    const items = await InventoryItem.find({ isActive: true }).sort({ name: 1 });
    const transactions = await InventoryTransaction.find();

    const reportData = items.map(item => {
      const itemTxns = transactions.filter(t => t.inventoryItem?.toString() === item._id.toString());

      const totalPurchases = itemTxns
        .filter(t => t.type === 'Purchase')
        .reduce((sum, t) => sum + t.quantity, 0);

      const totalConsumption = itemTxns
        .filter(t => t.type === 'Consumption')
        .reduce((sum, t) => sum + t.quantity, 0);

      const totalWastage = itemTxns
        .filter(t => t.type === 'Wastage')
        .reduce((sum, t) => sum + t.quantity, 0);

      const totalTransfers = itemTxns
        .filter(t => t.type === 'Transfer')
        .reduce((sum, t) => sum + t.quantity, 0);

      const totalAdjustments = itemTxns
        .filter(t => t.type === 'Adjustment')
        .reduce((sum, t) => sum + (t.newStock - t.previousStock), 0);

      const closingStock = item.currentStock;
      const stockValue = closingStock * item.unitCost;
      const isLowStock = closingStock <= item.minReorderLevel;

      return {
        _id: item._id,
        name: item.name,
        sku: item.sku,
        category: item.category,
        unit: item.unit,
        openingStock: item.openingStock,
        totalPurchases,
        totalConsumption,
        totalWastage,
        totalTransfers,
        totalAdjustments,
        closingStock,
        minReorderLevel: item.minReorderLevel,
        unitCost: item.unitCost,
        stockValue,
        isLowStock,
        supplierName: item.supplierName
      };
    });

    const summaryMetrics = {
      totalItems: reportData.length,
      totalStockValuation: reportData.reduce((sum, i) => sum + i.stockValue, 0),
      lowStockCount: reportData.filter(i => i.isLowStock).length,
      totalWastageCost: transactions
        .filter(t => t.type === 'Wastage')
        .reduce((sum, t) => sum + t.totalCost, 0)
    };

    return res.status(200).json({
      success: true,
      data: {
        summary: summaryMetrics,
        itemsReport: reportData
      }
    });
  } catch (error) {
    console.error('Error generating inventory report:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete (deactivate) inventory item
// @route   DELETE /api/v1/inventory/:id
// @access  Private
exports.deleteInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    item.isActive = false;
    await item.save();

    return res.status(200).json({
      success: true,
      message: 'Inventory item deactivated successfully'
    });
  } catch (error) {
    console.error('Error deleting inventory item:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Assign Dry Stock / Inventory item to Floor / Kitchen
// @route   POST /api/v1/inventory/assign-floor
// @access  Private
exports.assignStockToFloor = async (req, res) => {
  try {
    const { inventoryItemId, floorId, floorName, quantity, notes } = req.body;

    const item = await InventoryItem.findById(inventoryItemId);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) {
      return res.status(400).json({ success: false, message: 'Please enter a valid positive quantity' });
    }

    if (item.currentStock < qty) {
      return res.status(400).json({
        success: false,
        message: `Insufficient stock in Central Inventory! Available: ${item.currentStock} ${item.unit}, Requested: ${qty} ${item.unit}`
      });
    }

    const targetFloorName = floorName || 'Kitchen Station';
    const prevStock = item.currentStock;
    const newStock = prevStock - qty;

    item.currentStock = newStock;
    await item.save();

    // Record Inventory Transfer Transaction
    const transaction = await InventoryTransaction.create({
      inventoryItem: item._id,
      itemName: item.name,
      type: 'Transfer',
      quantity: qty,
      previousStock: prevStock,
      newStock: newStock,
      unitCost: item.unitCost,
      totalCost: qty * item.unitCost,
      transferFrom: 'Central Store',
      transferTo: targetFloorName,
      reason: notes || `Stock assigned to ${targetFloorName}`,
      recordedBy: req.user?._id,
      recordedByName: req.user?.name || 'Staff'
    });

    // Create Floor Assignment Log
    const assignment = await FloorStockAssignment.create({
      inventoryItem: item._id,
      itemName: item.name,
      category: item.category,
      unit: item.unit,
      quantity: qty,
      floor: floorId || undefined,
      floorName: targetFloorName,
      unitCost: item.unitCost,
      totalValue: qty * item.unitCost,
      assignedBy: req.user?._id,
      assignedByName: req.user?.name || 'Staff',
      notes: notes || '',
      assignedAt: new Date()
    });

    return res.status(201).json({
      success: true,
      message: `Assigned ${qty} ${item.unit} of ${item.name} to ${targetFloorName}`,
      data: {
        item,
        transaction,
        assignment
      }
    });
  } catch (error) {
    console.error('Error assigning stock to floor:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all Floor Stock Assignments
// @route   GET /api/v1/inventory/floor-assignments
// @access  Private
exports.getFloorAssignments = async (req, res) => {
  try {
    const { floorName, status = 'Assigned' } = req.query;
    let query = {};

    if (floorName && floorName !== 'All') {
      query.floorName = floorName;
    }
    if (status && status !== 'All') {
      query.status = status;
    }

    const assignments = await FloorStockAssignment.find(query)
      .sort({ assignedAt: -1 })
      .populate('inventoryItem', 'name sku category unit currentStock');

    // Group floor summary metrics
    const floorSummaryMap = {};
    assignments.forEach(a => {
      if (!floorSummaryMap[a.floorName]) {
        floorSummaryMap[a.floorName] = {
          floorName: a.floorName,
          totalAssignedItems: 0,
          totalAssignedQty: 0,
          totalValue: 0,
          items: []
        };
      }
      floorSummaryMap[a.floorName].totalAssignedItems += 1;
      floorSummaryMap[a.floorName].totalAssignedQty += a.quantity;
      floorSummaryMap[a.floorName].totalValue += a.totalValue;
      floorSummaryMap[a.floorName].items.push(a);
    });

    return res.status(200).json({
      success: true,
      count: assignments.length,
      floorSummary: Object.values(floorSummaryMap),
      data: assignments
    });
  } catch (error) {
    console.error('Error fetching floor assignments:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Return stock from Floor back to Central Inventory Store
// @route   DELETE /api/v1/inventory/floor-assignments/:id
// @access  Private
exports.returnFloorStock = async (req, res) => {
  try {
    const assignment = await FloorStockAssignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Floor assignment record not found' });
    }

    if (assignment.status === 'Returned') {
      return res.status(400).json({ success: false, message: 'Stock has already been returned to central inventory store' });
    }

    const item = await InventoryItem.findById(assignment.inventoryItem);
    if (item) {
      const prevStock = item.currentStock;
      const newStock = prevStock + assignment.quantity;
      item.currentStock = newStock;
      await item.save();

      await InventoryTransaction.create({
        inventoryItem: item._id,
        itemName: item.name,
        type: 'Transfer',
        quantity: assignment.quantity,
        previousStock: prevStock,
        newStock: newStock,
        unitCost: assignment.unitCost,
        totalCost: assignment.totalValue,
        transferFrom: assignment.floorName,
        transferTo: 'Central Store',
        reason: 'Stock returned from floor back to central store',
        recordedBy: req.user?._id,
        recordedByName: req.user?.name || 'Staff'
      });
    }

    assignment.status = 'Returned';
    await assignment.save();

    return res.status(200).json({
      success: true,
      message: `Returned ${assignment.quantity} ${assignment.unit} of ${assignment.itemName} from ${assignment.floorName} back to Central Store`
    });
  } catch (error) {
    console.error('Error returning floor stock:', error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
