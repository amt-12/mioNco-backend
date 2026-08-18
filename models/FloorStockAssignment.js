const mongoose = require('mongoose');

const floorStockAssignmentSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true
  },
  itemName: {
    type: String,
    required: true
  },
  category: {
    type: String,
    default: 'Dry Stock'
  },
  unit: {
    type: String,
    default: 'pcs'
  },
  quantity: {
    type: Number,
    required: [true, 'Please enter quantity to assign'],
    min: [0.01, 'Quantity must be greater than 0']
  },
  floor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Floor'
  },
  floorName: {
    type: String,
    required: [true, 'Please select target floor']
  },
  unitCost: {
    type: Number,
    default: 0
  },
  totalValue: {
    type: Number,
    default: 0
  },
  assignedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  assignedByName: {
    type: String,
    default: 'Staff / Admin'
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Assigned', 'Returned'],
    default: 'Assigned'
  },
  assignedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FloorStockAssignment', floorStockAssignmentSchema);
