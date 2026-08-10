const mongoose = require('mongoose');

const MenuCategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  icon: String,
  coverImage: String,
  bannerImage: String,
  displayOrder: { type: Number, default: 0 },
  parentCategory: { type: mongoose.Schema.Types.ObjectId, ref: 'MenuCategory', default: null },
  visibilityStatus: { type: String, enum: ['Published', 'Hidden', 'Scheduled'], default: 'Published' },
  activeStatus: { type: Boolean, default: true },
  taxType: { type: String, enum: ['GST', 'VAT', 'Exempt'], default: 'GST' },
  taxRate: { type: Number, default: 5 },
  seoMetadata: {
    title: String,
    description: String
  }
}, { timestamps: true });

module.exports = mongoose.model('MenuCategory', MenuCategorySchema);
