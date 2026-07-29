const mongoose = require('mongoose');

const qrCodeSchema = new mongoose.Schema({
    qrId: {
        type: String,
        required: [true, 'Please provide a unique QR ID'],
        unique: true,
        trim: true
    },
    qrType: {
        type: String,
        enum: ['Table', 'Public'],
        required: [true, 'Please specify QR type (Table or Public)']
    },
    url: {
        type: String,
        required: [true, 'Please provide the destination URL']
    },
    restaurant: {
        type: mongoose.Schema.ObjectId,
        ref: 'RestaurantSettings'
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor'
    },
    table: {
        type: mongoose.Schema.ObjectId,
        ref: 'Table'
    },
    status: {
        type: String,
        enum: ['Active', 'Inactive', 'Damaged', 'Deleted'],
        default: 'Active'
    },
    scanCount: {
        type: Number,
        default: 0
    },
    lastScanTime: {
        type: Date
    },
    scanHistory: [{
        timestamp: { type: Date, default: Date.now },
        device: String,
        browser: String,
        os: String,
        ipAddress: String
    }],
    assignedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    notes: {
        type: String
    },
    versionHistory: [{
        action: String,
        timestamp: { type: Date, default: Date.now },
        userId: { type: mongoose.Schema.ObjectId, ref: 'User' },
        details: String
    }]
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Ensure a table can only have one active QR code
qrCodeSchema.index({ table: 1 }, { unique: true, partialFilterExpression: { table: { $exists: true }, status: 'Active' } });

module.exports = mongoose.model('QRCode', qrCodeSchema);
