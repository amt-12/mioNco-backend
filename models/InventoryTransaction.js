const mongoose = require('mongoose');

const inventoryTransactionSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['Opening Stock', 'Purchase', 'Consumption', 'Wastage', 'Transfer', 'Adjustment'],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousStock: {
    type: Number,
    default: 0
  },
  newStock: {
    type: Number,
    default: 0
  },
  unitCost: {
    type: Number,
    default: 0
  },
  totalCost: {
    type: Number,
    default: 0
  },
  vendorName: {
    type: String,
    default: ''
  },
  invoiceNumber: {
    type: String,
    default: ''
  },
  transferFrom: {
    type: String,
    default: ''
  },
  transferTo: {
    type: String,
    default: ''
  },
  reason: {
    type: String,
    default: ''
  },
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  recordedByName: {
    type: String,
    default: 'System / Staff'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('InventoryTransaction', inventoryTransactionSchema);
