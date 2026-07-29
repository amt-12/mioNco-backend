const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Please provide customer name'],
        trim: true
    },
    phone: {
        type: String,
        required: [true, 'Please provide customer phone number'],
        unique: true,
        trim: true
    },
    email: {
        type: String,
        trim: true,
        match: [
            /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
            'Please add a valid email'
        ]
    },
    dob: Date,
    anniversary: Date,
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other', 'Prefer not to say']
    },
    address: {
        street: String,
        city: String,
        state: String,
        zip: String,
        country: String
    },
    totalVisits: {
        type: Number,
        default: 0
    },
    noShows: {
        type: Number,
        default: 0
    },
    totalCancellations: {
        type: Number,
        default: 0
    },
    totalSpend: {
        type: Number,
        default: 0
    },
    loyaltyPoints: {
        type: Number,
        default: 0
    },
    loyaltyTier: {
        type: mongoose.Schema.ObjectId,
        ref: 'LoyaltyTier'
    },
    preferences: {
        type: [String],
        default: []
    },
    favoriteCuisine: String,
    allergies: [String],
    dietaryPreferences: [String],
    notes: {
        type: String
    },
    tags: [{
        type: String
    }],
    status: {
        type: String,
        enum: ['Active', 'VIP', 'Blacklisted', 'Inactive'],
        default: 'Active'
    },
    lastVisit: {
        type: Date
    },
    marketingConsent: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('Customer', customerSchema);
