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
  status: { type: String, enum: ['Recorded', 'Reviewed', 'Written Off'], default: 'Recorded' },
  businessDay: { type: mongoose.Schema.Types.ObjectId, ref: 'BusinessDay', index: true },
  businessDate: { type: String, index: true }
}, { timestamps: true });

FoodSpoilageSchema.pre('save', async function (next) {
  if (!this.businessDate) {
    try {
      const BusinessDay = mongoose.model('BusinessDay');
      const activeDay = await BusinessDay.findOne({ status: 'Open' }).sort({ createdAt: -1 });
      if (activeDay) {
        this.businessDay = activeDay._id;
        let bDate = activeDay.businessDate;
        if (!bDate && activeDay.startTime) {
          const tzOffsetMs = -330 * 60 * 1000;
          const localStart = new Date(activeDay.startTime.getTime() - tzOffsetMs);
          const y = localStart.getUTCFullYear();
          const m = String(localStart.getUTCMonth() + 1).padStart(2, '0');
          const d = String(localStart.getUTCDate()).padStart(2, '0');
          bDate = `${y}-${m}-${d}`;
        }
        this.businessDate = bDate;
      } else {
        const tzOffsetMs = -330 * 60 * 1000;
        const refTime = this.createdAt ? new Date(this.createdAt) : new Date();
        const localDate = new Date(refTime.getTime() - tzOffsetMs);
        const y = localDate.getUTCFullYear();
        const m = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(localDate.getUTCDate()).padStart(2, '0');
        this.businessDate = `${y}-${m}-${d}`;
      }
    } catch (err) {
      console.error('Error in FoodSpoilage pre-save businessDate hook:', err);
    }
  }
  next();
});

module.exports = mongoose.model('FoodSpoilage', FoodSpoilageSchema);
