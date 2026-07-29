const mongoose = require('mongoose');

const MenuSectionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  description: String,
  bannerImage: String,
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  visibility: { type: String, enum: ['Public', 'Hidden', 'Internal'], default: 'Public' },
  seoMetadata: {
    title: String,
    description: String,
  },
  floorAvailability: [{ type: String }],
}, { timestamps: true });

module.exports = mongoose.model('MenuSection', MenuSectionSchema);
