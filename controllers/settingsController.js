const RestaurantSettings = require('../models/RestaurantSettings');

// Helper to get or create singleton
const getOrCreateSettings = async () => {
    let settings = await RestaurantSettings.findOne({ isSingleton: 'CONFIG' });
    
    if (!settings) {
        settings = await RestaurantSettings.create({
            isSingleton: 'CONFIG',
            diningConcepts: [
                { name: 'Mio Skybar', subtitle: 'Rooftop Lounge' },
                { name: 'Mio Elite', subtitle: 'VIP Dining' },
                { name: 'Mio Privè', subtitle: 'Private Dining' },
                { name: 'Mio Bistro', subtitle: 'Casual Dining' },
                { name: 'Mio Palazzo', subtitle: 'Fine Dining' }
            ]
        });
    }
    
    return settings;
};

// @desc    Get restaurant settings
// @route   GET /api/v1/settings
// @access  Private (Admin/Manager)
exports.getSettings = async (req, res, next) => {
    try {
        const settings = await getOrCreateSettings();
        res.status(200).json({ success: true, data: settings });
    } catch (error) {
        next(error);
    }
};

// @desc    Get public settings (payment info etc) for Air Menu
// @route   GET /api/v1/settings/public
// @access  Public
exports.getPublicSettings = async (req, res, next) => {
    try {
        const settings = await getOrCreateSettings();
        // Only expose safe/public fields
        res.status(200).json({
            success: true,
            data: {
                name: settings.profile?.name || 'Mio & Co.',
                payment: settings.payment || {},
                reservationSettings: settings.reservationSettings || {
                    onlineReservationsEnabled: true,
                    closedDates: [],
                    closedDaysOfWeek: [],
                    closureMessage: 'Reservations are currently closed for this date. Please contact our reception desk at +91 172 4087077.'
                }
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update restaurant settings (full or partial)
// @route   PUT /api/v1/settings
// @access  Private (Admin/Manager)
exports.updateSettings = async (req, res, next) => {
    try {
        let settings = await getOrCreateSettings();
        
        // We do a deep merge or simply replace sections provided in body
        // Since the frontend sends the whole updated section, we can use findOneAndUpdate
        const updatedFields = { ...req.body, updatedBy: req.user.id };
        
        // To handle nested updates correctly with mongoose, we can use dot notation,
        // but for simplicity, we allow replacing entire top-level sections (e.g. body.profile)
        // Mongoose will handle the merge if we just assign it.
        Object.keys(updatedFields).forEach(key => {
            if (key !== 'isSingleton' && key !== '_id') {
                settings[key] = updatedFields[key];
            }
        });
        
        await settings.save();
        
        res.status(200).json({ success: true, data: settings });
    } catch (error) {
        next(error);
    }
};
