const mongoose = require('mongoose');

const billItemSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.ObjectId,
    ref: 'MenuItem'
  },
  foodName: {
    type: String,
    required: true
  },
  variantName: String,
  unitPrice: {
    type: Number,
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: [0, 'Quantity cannot be negative']
  },
  totalPrice: {
    type: Number,
    required: true
  },
  taxType: {
    type: String,
    enum: ['GST', 'VAT', 'Exempt'],
    default: 'GST'
  },
  taxRate: {
    type: Number,
    default: 5
  },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  isComplimentary: { type: Boolean, default: false },
  complimentaryReason: String,
  isNonChargeable: { type: Boolean, default: false },
  ncRemark: String,
  staffEmployeeId: String,
  isOnRequest: { type: Boolean, default: false },
  isSpoiled: { type: Boolean, default: false },
  spoilageRemarks: String,
  spoilageMarkedBy: String,
  itemType: { type: String, enum: ['Food', 'Liquor'], default: 'Food' },
  sectionName: String,
  addedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
  reason: String
}, { _id: true });

const billSchema = new mongoose.Schema({
  billNumber: {
    type: String,
    required: true,
    unique: true
  },
  orders: [{
    type: mongoose.Schema.ObjectId,
    ref: 'Order'
  }],
  session: {
    type: mongoose.Schema.ObjectId,
    ref: 'DiningSession'
  },
  table: {
    type: mongoose.Schema.ObjectId,
    ref: 'Table'
  },
  customer: {
    name: String,
    phone: String,
    email: String,
    gstn: String
  },
  splitInfo: {
    isSplit: { type: Boolean, default: false },
    parentBill: { type: mongoose.Schema.ObjectId, ref: 'Bill', default: null },
    splitIndex: { type: Number, default: 1 },
    totalSplits: { type: Number, default: 1 },
    splitType: { type: String, enum: ['Equal', 'Itemized', 'None'], default: 'None' }
  },
  mergedBillsList: [{
    billNumber: String,
    tableNumber: String,
    floorName: String,
    items: [billItemSchema],
    subtotal: { type: Number, default: 0 },
    finalAmount: { type: Number, default: 0 }
  }],
  items: [billItemSchema],
  subtotal: { type: Number, default: 0 },
  itemLevelDiscounts: { type: Number, default: 0 },
  
  billDiscountType: { type: String, enum: ['Percentage', 'Fixed', 'Non-Chargeable', 'None'], default: 'None' },
  billDiscountValue: { type: Number, default: 0 },
  billDiscountAmount: { type: Number, default: 0 },
  billDiscountReason: String,
  discountGivenBy: String,
  
  isComplimentaryBill: { type: Boolean, default: false },
  complimentaryBillRemark: String,
  
  isNonChargeableBill: { type: Boolean, default: false },
  ncStaffRemark: String,
  ncEmployee: { type: mongoose.Schema.ObjectId, ref: 'User' },
  
  taxableAmountGST: { type: Number, default: 0 },
  taxableAmountVAT: { type: Number, default: 0 },
  cgstAmount: { type: Number, default: 0 },
  sgstAmount: { type: Number, default: 0 },
  vatAmount: { type: Number, default: 0 },
  totalTaxAmount: { type: Number, default: 0 },
  
  serviceChargeRate: { type: Number, default: 5 },
  serviceChargeAmount: { type: Number, default: 0 },
  serviceChargeEnabled: { type: Boolean, default: true },
  taxesEnabled: { type: Boolean, default: true },
  
  finalAmount: { type: Number, default: 0 },
  
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Partially Paid', 'Paid', 'Refunded', 'Voided', 'Cancelled', 'Non-Chargeable'],
    default: 'Pending'
  },
  payments: [{
    mode: { type: String, enum: ['Cash', 'Card', 'UPI', 'NC', 'Non-Chargeable', 'Other'], default: 'Cash' },
    amount: { type: Number, required: true },
    txnId: String,
    cardType: String,
    receiptImage: String,
    timestamp: { type: Date, default: Date.now }
  }],
  amountPaid: { type: Number, default: 0 },
  balanceDue: { type: Number, default: 0 },
  
  reprintCount: { type: Number, default: 0 },
  reprintLogs: [{
    printedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    timestamp: { type: Date, default: Date.now },
    reason: String
  }],
  
  status: {
    type: String,
    enum: ['Active', 'Settled', 'Voided', 'Cancelled', 'Merged'],
    default: 'Active'
  },
  voidDetails: {
    voidedBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    reason: String,
    voidedAt: Date
  },
  cancellationDetails: {
    cancelledBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
    reason: String,
    cancelledAt: Date
  },
  
  createdBy: { type: mongoose.Schema.ObjectId, ref: 'User' },
  notes: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Bill', billSchema);
