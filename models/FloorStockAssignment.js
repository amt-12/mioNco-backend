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
  consumedQuantity: {
    type: Number,
    default: 0
  },
  remainingQuantity: {
    type: Number,
    default: function() {
      return this.quantity;
    }
  },
  destinationType: {
    type: String,
    enum: ['Kitchen', 'Kitchen Station', 'Floor'],
    default: 'Kitchen'
  },
  floor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Floor'
  },
  floorName: {
    type: String,
    required: [true, 'Please select target floor or station']
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
  receivedBy: {
    type: String,
    default: ''
  },
  shift: {
    type: String,
    enum: ['All Day', 'Morning', 'Afternoon', 'Evening', 'Night'],
    default: 'All Day'
  },
  assignmentDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['Assigned', 'Partially Consumed', 'Consumed', 'Returned'],
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
