const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema({
  employeeId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  employeeName: { type: String, required: true },
  action: { type: String, required: true }, // Create, Edit, Delete, Publish, etc.
  entityType: { type: String, required: true }, // MenuItem, MenuCategory, MenuSection
  entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
  previousValue: mongoose.Schema.Types.Mixed,
  updatedValue: mongoose.Schema.Types.Mixed,
  ipAddress: String,
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
