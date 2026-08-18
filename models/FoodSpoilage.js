const mongoose = require('mongoose');

const FoodSpoilageSchema = new mongoose.Schema({
  orderId: { type: String }, // e.g., ORD-BJF25J
  orderRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  tableNumber: { type: String },
  tableName: { type: String },
  floorName: { type: String, default: 'Main Floor' },
  floorRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Floor' },
  menuItem: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuItem' },
  foodName: { type: String, required: true },
  quantity: { type: Number, default: 1 },
  unitPrice: { type: Number, default: 0 },
  totalLossAmount: { type: Number, default: 0 },
  remarks: { type: String, required: true },
  markedBy: { type: String, required: true },
  markedByStaffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  kitchenStation: { type: String, default: 'General' },
  source: { type: String, default: 'Waiter POS' },
  status: { type: String, enum: ['Recorded', 'Reviewed', 'Written Off'], default: 'Recorded' }
}, { timestamps: true });

module.exports = mongoose.model('FoodSpoilage', FoodSpoilageSchema);
