const Customer = require('../models/Customer');
const LoyaltyTier = require('../models/LoyaltyTier');
const CustomerActivity = require('../models/CustomerActivity');
const Order = require('../models/Order');

// @desc    Get CRM Dashboard Analytics
// @route   GET /api/v1/crm/dashboard
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
    try {
        const totalCustomers = await Customer.countDocuments();
        
        // Customers created in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const newCustomers = await Customer.countDocuments({ createdAt: { $gte: thirtyDaysAgo } });

        // Customers with multiple visits
        const returningCustomers = await Customer.countDocuments({ totalVisits: { $gt: 1 } });
        
        const vips = await Customer.countDocuments({ status: 'VIP' });

        // Calculate average LTV
        const aggResult = await Customer.aggregate([
            { $group: { _id: null, avgLTV: { $avg: '$totalSpend' } } }
        ]);
        const avgCLV = aggResult[0]?.avgLTV || 0;

        res.status(200).json({
            success: true,
            data: {
                totalCustomers,
                newCustomers,
                returningCustomers,
                vips,
                avgCLV: avgCLV.toFixed(2),
                repeatRate: totalCustomers > 0 ? ((returningCustomers / totalCustomers) * 100).toFixed(1) : 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all customers with advanced filtering
// @route   GET /api/v1/crm/customers
// @access  Private
exports.getCustomers = async (req, res) => {
    try {
        const { segment, search } = req.query;
        let query = {};

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { phone: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        if (segment) {
            if (segment === 'VIP') query.status = 'VIP';
            if (segment === 'Recent') {
                const recent = new Date();
                recent.setDate(recent.getDate() - 7);
                query.lastVisit = { $gte: recent };
            }
            if (segment === 'Birthday') {
                const currentMonth = new Date().getMonth() + 1; // 1-12
                query.$expr = { $eq: [{ $month: "$dob" }, currentMonth] };
            }
        }

        const customers = await Customer.find(query)
            .populate('loyaltyTier')
            .sort({ lastVisit: -1, createdAt: -1 });

        res.status(200).json({ success: true, data: customers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single customer profile
// @route   GET /api/v1/crm/customers/:id
// @access  Private
exports.getCustomer = async (req, res) => {
    try {
        const customer = await Customer.findById(req.params.id).populate('loyaltyTier');
        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, data: customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get customer timeline
// @route   GET /api/v1/crm/customers/:id/timeline
// @access  Private
exports.getCustomerTimeline = async (req, res) => {
    try {
        const activities = await CustomerActivity.find({ customer: req.params.id })
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: activities });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Add manual activity (note)
// @route   POST /api/v1/crm/customers/:id/activity
// @access  Private
exports.addCustomerActivity = async (req, res) => {
    try {
        const { type, description } = req.body;
        const activity = await CustomerActivity.create({
            customer: req.params.id,
            type,
            description,
            createdBy: req.user.id
        });
        
        const populatedActivity = await CustomerActivity.findById(activity._id).populate('createdBy', 'name');
        res.status(201).json({ success: true, data: populatedActivity });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update customer tags and preferences
// @route   PUT /api/v1/crm/customers/:id/metadata
// @access  Private
exports.updateCustomerMetadata = async (req, res) => {
    try {
        const customer = await Customer.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true, runValidators: true }
        ).populate('loyaltyTier');

        if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
        res.status(200).json({ success: true, data: customer });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// ---------------- LOYALTY SETTINGS ----------------

// @desc    Get all loyalty tiers
// @route   GET /api/v1/crm/loyalty-tiers
// @access  Private
exports.getLoyaltyTiers = async (req, res) => {
    try {
        const tiers = await LoyaltyTier.find().sort({ level: 1 });
        res.status(200).json({ success: true, data: tiers });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a new loyalty tier
// @route   POST /api/v1/crm/loyalty-tiers
// @access  Private
exports.createLoyaltyTier = async (req, res) => {
    try {
        const tier = await LoyaltyTier.create(req.body);
        res.status(201).json({ success: true, data: tier });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
