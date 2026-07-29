const mongoose = require('mongoose');

const floorSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide a floor name'],
        trim: true,
        unique: true
    },
    floorNumber: {
        type: Number,
        default: 1
    },
    description: {
        type: String,
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Reverse populate with tables
floorSchema.virtual('tables', {
    ref: 'Table',
    localField: '_id',
    foreignField: 'floor',
    justOne: false
});

module.exports = mongoose.model('Floor', floorSchema);
