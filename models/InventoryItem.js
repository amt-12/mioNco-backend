const mongoose = require('mongoose');

const inventoryItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please provide ingredient or raw material name'],
    trim: true
  },
  sku: {
    type: String,
    default: ''
  },
  category: {
    type: String,
    required: [true, 'Please select a category'],
    enum: [
      'Dry Stock',
      'Soft Drinks',
      'Produce & Fresh',
      'Meat & Poultry',
      'Seafood',
      'Dairy & Eggs',
      'Grains & Pasta',
      'Oils & Sauces',
      'Spices & Seasonings',
      'Beverages & Alcohol',
      'Packaging & Disposable',
      'Other'
    ],
    default: 'Dry Stock'
  },
  unit: {
    type: String,
    required: [true, 'Please specify unit of measurement'],
    enum: ['kg', 'g', 'L', 'ml', 'pcs', 'box', 'pack', 'can', 'bottle', 'bag', 'doz'],
    default: 'kg'
  },
  openingStock: {
    type: Number,
    default: 0,
    min: [0, 'Opening stock cannot be negative']
  },
  currentStock: {
    type: Number,
    default: 0
  },
  minReorderLevel: {
    type: Number,
    default: 10,
    min: [0, 'Reorder level cannot be negative']
  },
  unitCost: {
    type: Number,
    default: 0,
    min: [0, 'Unit cost cannot be negative']
  },
  supplierName: {
    type: String,
    default: ''
  },
  storageLocation: {
    type: String,
    default: ''
  },
  notes: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastRestockedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('InventoryItem', inventoryItemSchema);
