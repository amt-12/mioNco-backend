const NotificationTemplate = require('../models/NotificationTemplate');
const NotificationLog = require('../models/NotificationLog');
const NotificationEngine = require('../services/NotificationEngine');

// @desc    Get Notification Dashboard Analytics
// @route   GET /api/v1/notifications/dashboard
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
    try {
        const total = await NotificationLog.countDocuments();
        const sent = await NotificationLog.countDocuments({ status: 'Sent' });
        const delivered = await NotificationLog.countDocuments({ status: 'Delivered' });
        const failed = await NotificationLog.countDocuments({ status: 'Failed' });

        res.status(200).json({
            success: true,
            data: {
                total,
                sent,
                delivered,
                failed,
                successRate: total > 0 ? (((sent + delivered) / total) * 100).toFixed(1) : 0
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Templates
// @route   GET /api/v1/notifications/templates
// @access  Private
exports.getTemplates = async (req, res) => {
    try {
        const templates = await NotificationTemplate.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: templates });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create Template
// @route   POST /api/v1/notifications/templates
// @access  Private
exports.createTemplate = async (req, res) => {
    try {
        req.body.createdBy = req.user.id;
        const template = await NotificationTemplate.create(req.body);
        res.status(201).json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Template
// @route   PUT /api/v1/notifications/templates/:id
// @access  Private
exports.updateTemplate = async (req, res) => {
    try {
        const template = await NotificationTemplate.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.status(200).json({ success: true, data: template });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Staff Alerts
// @route   GET /api/v1/notifications/my-alerts
// @access  Private
exports.getMyAlerts = async (req, res) => {
    try {
        // Find general in-app alerts sent recently
        const alerts = await NotificationLog.find({
            channel: 'In-App',
            // Typically you'd filter by recipientUser, but for global alerts we just show recent ones
            createdAt: { $gte: new Date(Date.now() - 24*60*60*1000) } // last 24h
        }).sort({ createdAt: -1 }).limit(20);
        
        res.status(200).json({ success: true, data: alerts });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get History
// @route   GET /api/v1/notifications/history
// @access  Private
exports.getHistory = async (req, res) => {
    try {
        const history = await NotificationLog.find()
            .populate('template', 'name')
            .populate('recipientCustomer', 'name')
            .sort({ createdAt: -1 })
            .limit(100);
        res.status(200).json({ success: true, data: history });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Send Manual Notification
// @route   POST /api/v1/notifications/send
// @access  Private
exports.sendManualNotification = async (req, res) => {
    try {
        const { templateId, data } = req.body;
        // In a real app we'd map over selected customers. For demo, we just trigger it.
        const io = req.app.get('io');
        await NotificationEngine.sendManual(templateId, null, data, io);
        
        res.status(200).json({ success: true, message: 'Notification blast initiated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
