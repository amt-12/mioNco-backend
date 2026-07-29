const mongoose = require('mongoose');

const loyaltyTierSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide tier name'],
        trim: true,
        unique: true
    },
    level: {
        type: Number,
        required: [true, 'Please provide tier level (e.g. 1 for base, 2 for next)'],
        unique: true
    },
    pointsThreshold: {
        type: Number,
        required: [true, 'Points required to reach this tier'],
        default: 0
    },
    earnMultiplier: {
        type: Number,
        default: 1, // e.g. 1.5x points per dollar
    },
    colorCode: {
        type: String,
        default: '#1890ff' // hex code for UI badge
    },
    benefits: [{
        type: String
    }],
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('LoyaltyTier', loyaltyTierSchema);
