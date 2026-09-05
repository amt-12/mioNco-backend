const mongoose = require('mongoose');

const businessDaySchema = new mongoose.Schema({
  dayNumber: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Open', 'Closed'],
    default: 'Open'
  },
  startTime: {
    type: Date,
    default: Date.now
  },
  endTime: {
    type: Date
  },
  startedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  startedByName: {
    type: String,
    default: 'Admin'
  },
  endedBy: {
    type: mongoose.Schema.ObjectId,
    ref: 'User'
  },
  endedByName: {
    type: String
  },
  openingFloat: {
    type: Number,
    default: 0
  },
  openingNotes: {
    type: String,
    default: ''
  },
  closingCashActual: {
    type: Number,
    default: 0
  },
  closingNotes: {
    type: String,
    default: ''
  },
  summary: {
    totalOrdersCount: { type: Number, default: 0 },
    totalBillsCount: { type: Number, default: 0 },
    grossSales: { type: Number, default: 0 },
    netSales: { type: Number, default: 0 },
    totalTax: { type: Number, default: 0 },
    totalDiscounts: { type: Number, default: 0 },
    cashSales: { type: Number, default: 0 },
    cardSales: { type: Number, default: 0 },
    upiSales: { type: Number, default: 0 },
    onlineSales: { type: Number, default: 0 },
    complimentarySales: { type: Number, default: 0 },
    expectedCash: { type: Number, default: 0 },
    cashVariance: { type: Number, default: 0 },
    spoilageCount: { type: Number, default: 0 },
    spoilageAmount: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BusinessDay', businessDaySchema);
