const ServiceRequest = require('../models/ServiceRequest');
const Table = require('../models/Table');
const User = require('../models/User');
const Order = require('../models/Order');

// @desc    Assign Waiter to Table(s)
// @route   PUT /api/v1/waiters/assign
// @access  Private (Manager/Admin)
exports.assignWaiter = async (req, res) => {
    try {
        const { waiterId, tableIds } = req.body; // tableIds is an array

        // Verify waiter exists and has role
        const waiter = await User.findById(waiterId);
        if (!waiter || (waiter.role !== 'Waiter' && waiter.role !== 'Restaurant Manager')) {
            return res.status(400).json({ success: false, message: 'Invalid waiter selected' });
        }

        // Update tables
        await Table.updateMany(
            { _id: { $in: tableIds } },
            { $set: { assignedWaiter: waiterId } }
        );

        const io = req.app.get('io');
        if (io) io.emit('table_assignments_updated');

        res.status(200).json({ success: true, message: 'Tables assigned successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Active Waiters and their assignments
// @route   GET /api/v1/waiters/active
// @access  Private (Manager/Admin)
exports.getActiveWaiters = async (req, res) => {
    try {
        const waiters = await User.find({ role: 'Waiter', status: 'Active' }).select('name email role');
        
        // Get all tables to map them
        const tables = await Table.find().populate('floor', 'name');

        const waiterData = waiters.map(w => {
            const assignedTables = tables.filter(t => t.assignedWaiter?.toString() === w._id.toString());
            return {
                ...w.toObject(),
                assignedTables
            };
        });

        res.status(200).json({ success: true, data: waiterData });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a Service Request (Customer/System generated)
// @route   POST /api/v1/waiters/requests
// @access  Public (for Customer AIR Menu) / Private
exports.createServiceRequest = async (req, res) => {
    try {
        const { tableId, type, priority, notes } = req.body;

        const table = await Table.findById(tableId);
        if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

        const request = await ServiceRequest.create({
            table: tableId,
            waiter: table.assignedWaiter, // Route to currently assigned waiter
            type,
            priority: priority || 'Normal',
            notes
        });

        const populatedRequest = await ServiceRequest.findById(request._id)
            .populate('table', 'tableNumber')
            .populate('waiter', 'name');

        const io = req.app.get('io');
        if (io) {
            // Notify specific waiter or broadcast to all if unassigned
            io.emit('new_service_request', populatedRequest);
        }

        res.status(201).json({ success: true, data: populatedRequest });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Service Request Status
// @route   PUT /api/v1/waiters/requests/:id/status
// @access  Private

// @desc    Get Active Service Requests for a Table
// @route   GET /api/v1/waiters/requests/public
// @access  Public (for Customer AIR Menu)
exports.getTableRequests = async (req, res) => {
    try {
        const { table } = req.query;
        if (!table) return res.status(400).json({ success: false, message: 'Table ID required' });

        const requests = await ServiceRequest.find({
            table,
            status: { $in: ['Pending', 'Acknowledged'] }
        }).sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.updateRequestStatus = async (req, res) => {
    try {
        const { status } = req.body;
        
        const updateData = { status };
        if (status === 'Completed' || status === 'Cancelled') {
            updateData.resolvedAt = new Date();
            updateData.resolvedBy = req.user.id;
        }

        const request = await ServiceRequest.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).populate('table', 'tableNumber').populate('waiter', 'name').populate('order', 'orderId');

        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        const io = req.app.get('io');
        if (io) io.emit('service_request_updated', request);

        res.status(200).json({ success: true, data: request });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Waiter's Task Queue
// @route   GET /api/v1/waiters/my-tasks
// @access  Private (Waiter)
exports.getMyTasks = async (req, res) => {
    try {
        // Find tasks assigned to this waiter, or unassigned tasks (for pooling)
        const tasks = await ServiceRequest.find({
            $or: [
                { waiter: req.user.id },
                { waiter: { $exists: false } },
                { waiter: null }
            ],
            status: { $in: ['Pending', 'Acknowledged'] }
        })
        .populate('table', 'tableNumber floor')
        .populate('order', 'orderId')
        .sort({ createdAt: -1 });

        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
