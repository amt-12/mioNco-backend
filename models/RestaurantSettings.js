const mongoose = require('mongoose');

const restaurantSettingsSchema = new mongoose.Schema({
    // Is Singleton (we enforce only one doc)
    isSingleton: {
        type: String,
        default: 'CONFIG',
        unique: true
    },
    profile: {
        name: { type: String, default: 'Mio & Co.' },
        tagline: { type: String, default: 'Luxury Dining Experience' },
        description: { type: String, default: '' },
        about: { type: String, default: '' },
        story: { type: String, default: '' },
        establishmentYear: { type: String, default: '' },
        registrationNumber: { type: String, default: '' },
        gstNumber: { type: String, default: '' },
        fssaiNumber: { type: String, default: '' },
        cin: { type: String, default: '' }
    },
    contact: {
        primaryPhone: { type: String, default: '' },
        whatsappNumber: { type: String, default: '' },
        email: { type: String, default: '' },
        website: { type: String, default: '' },
        address: {
            street: { type: String, default: '' },
            city: { type: String, default: '' },
            state: { type: String, default: '' },
            country: { type: String, default: '' },
            zip: { type: String, default: '' },
            lat: { type: Number, default: null },
            lng: { type: Number, default: null }
        }
    },
    businessHours: {
        monday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '23:00' } },
        tuesday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '23:00' } },
        wednesday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '23:00' } },
        thursday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '23:00' } },
        friday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '01:00' } },
        saturday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '01:00' } },
        sunday: { isOpen: { type: Boolean, default: true }, openTime: { type: String, default: '10:00' }, closeTime: { type: String, default: '23:00' } }
    },
    diningConcepts: [
        {
            name: { type: String, required: true },
            subtitle: { type: String, default: '' },
            description: { type: String, default: '' },
            capacity: { type: Number, default: 0 },
            isActive: { type: Boolean, default: true },
            bannerImage: { type: String, default: '' }
        }
    ],
    socialMedia: {
        instagram: { type: String, default: '' },
        facebook: { type: String, default: '' },
        twitter: { type: String, default: '' },
        youtube: { type: String, default: '' },
        linkedin: { type: String, default: '' }
    },
    branding: {
        logo: { type: String, default: '' },
        altLogo: { type: String, default: '' },
        favicon: { type: String, default: '' },
        heroImage: { type: String, default: '' }
    },
    seo: {
        title: { type: String, default: 'Mio & Co. | Luxury Dining' },
        description: { type: String, default: '' },
        keywords: { type: String, default: '' },
        googleAnalyticsId: { type: String, default: '' }
    },
    communication: {
        senderEmail: { type: String, default: '' },
        orderConfirmMessage: { type: String, default: 'Thank you for your order!' },
        reservationConfirmMessage: { type: String, default: 'Your reservation is confirmed!' }
    },
    policies: {
        termsAndConditions: { type: String, default: '' },
        privacyPolicy: { type: String, default: '' },
        cancellationPolicy: { type: String, default: '' },
        diningRules: { type: String, default: '' }
    },
    payment: {
        upiId: { type: String, default: '' },
        upiName: { type: String, default: 'Mio & Co.' },
        upiQrImage: { type: String, default: '' }
    },
    taxSettings: {
        serviceChargeRate: { type: Number, default: 5 },
        serviceChargeEnabled: { type: Boolean, default: true },
        gstEnabled: { type: Boolean, default: true },
        vatEnabled: { type: Boolean, default: true },
        defaultGSTPercent: { type: Number, default: 5 },
        defaultVATPercent: { type: Number, default: 20 },
        enableOTPForSensitiveActions: { type: Boolean, default: false }
    },
    updatedBy: {
        type: mongoose.Schema.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

module.exports = mongoose.model('RestaurantSettings', restaurantSettingsSchema);
