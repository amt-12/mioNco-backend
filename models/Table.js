const mongoose = require('mongoose');

const tableSchema = new mongoose.Schema({
    tableNumber: {
        type: String,
        required: [true, 'Please provide a table number (e.g., T1, A12)'],
        trim: true
    },
    capacity: {
        type: Number,
        required: [true, 'Please provide table capacity'],
        min: 1
    },
    shape: {
        type: String,
        enum: ['Square', 'Round', 'Rectangle'],
        default: 'Square'
    },
    status: {
        type: String,
        enum: [
            'Available', 'Reserved', 'Occupied', 'Ordering', 
            'Food Preparing', 'Ready to Serve', 'Dining', 
            'Bill Requested', 'Cleaning', 'Maintenance', 'Out of Service',
            'Air Menu Order'
        ],
        default: 'Available'
    },
    hasAirMenuOrder: {
        type: Boolean,
        default: false
    },
    floor: {
        type: mongoose.Schema.ObjectId,
        ref: 'Floor',
        required: true
    },
    section: {
        type: String,
        trim: true
    },
    zone: {
        type: String,
        trim: true
    },
    position: {
        x: { type: Number, default: 0 },
        y: { type: Number, default: 0 },
        width: { type: Number, default: 100 },
        height: { type: Number, default: 100 }
    },
    assignedWaiter: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    },
    qrAssignment: {
        type: String
    },
    notes: {
        type: String
    },
    isMerged: {
        type: Boolean,
        default: false
    },
    mergedWith: [{
        type: mongoose.Schema.ObjectId,
        ref: 'Table'
    }],
    activityHistory: [{
        status: String,
        timestamp: { type: Date, default: Date.now },
        userId: { type: mongoose.Schema.ObjectId, ref: 'User' },
        note: String
    }],
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Ensure a table number is unique within a specific floor
tableSchema.index({ floor: 1, tableNumber: 1 }, { unique: true });

module.exports = mongoose.model('Table', tableSchema);
