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
            ],
            taxSettings: {
                serviceChargeRate: 5,
                serviceChargeEnabled: true,
                gstEnabled: true,
                vatEnabled: true,
                defaultGSTPercent: 5,
                defaultVATPercent: 18.9
            }
        });
    } else {
        if (!settings.taxSettings) {
            settings.taxSettings = { serviceChargeRate: 5, serviceChargeEnabled: true, gstEnabled: true, vatEnabled: true, defaultGSTPercent: 5, defaultVATPercent: 18.9 };
            await settings.save();
        } else if (settings.taxSettings.defaultVATPercent === 20 || settings.taxSettings.defaultVATPercent === undefined) {
            settings.taxSettings.defaultVATPercent = 18.9;
            await settings.save();
        }
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
                },
                airMenuSettings: settings.airMenuSettings || {
                    backgroundImage: '',
                    backgroundOpacity: 1,
                    backgroundBlur: 0,
                    blackOverlayOpacity: 0.55,
                    isActive: true
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
        const updatedFields = { ...req.body, updatedBy: req.user?.id || req.user?._id };
        
        Object.keys(updatedFields).forEach(key => {
            if (key !== 'isSingleton' && key !== '_id') {
                settings[key] = updatedFields[key];
            }
        });
        
        await settings.save();

        if (updatedFields.airMenuSettings) {
            try {
                req.app.get('io')?.emit('airMenuSettingsUpdated', settings.airMenuSettings);
            } catch (socketErr) {
                console.error('Socket emission error for airMenuSettingsUpdated:', socketErr);
            }
        }
        
        res.status(200).json({ success: true, data: settings });
    } catch (error) {
        next(error);
    }
};
