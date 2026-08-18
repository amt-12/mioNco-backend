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

// @desc    Get Active Waiters and their assignments / live locations
// @route   GET /api/v1/waiters/active
// @access  Private (Manager/Admin)
exports.getActiveWaiters = async (req, res) => {
    try {
        const waiters = await User.find({ 
            role: { $in: ['Waiter', 'Restaurant Manager', 'Waiter Manager'] },
            status: { $ne: 'Inactive' }
        }).select('name email role status');
        
        const tables = await Table.find().populate('floor', 'name');
        
        const activeRequests = await ServiceRequest.find({
            status: { $in: ['Pending', 'Acknowledged'] }
        }).populate({
            path: 'table',
            populate: { path: 'floor' }
        });

        const waiterData = waiters.map(w => {
            const wIdStr = w._id.toString();
            const assignedTables = tables.filter(t => t.assignedWaiter?.toString() === wIdStr);
            const waiterActiveReqs = activeRequests.filter(r => r.waiter?.toString() === wIdStr);

            let liveStatus = 'Available';
            let currentLocation = 'Available / Main Counter';

            if (waiterActiveReqs.length > 0) {
                liveStatus = 'On Call';
                const currentReq = waiterActiveReqs[0];
                const tNum = currentReq.table?.tableNumber || '?';
                const fName = currentReq.table?.floor?.name || '';
                currentLocation = `Serving Table ${tNum} ${fName ? `(${fName})` : ''} - ${currentReq.type}`;
            } else if (assignedTables.length > 0) {
                liveStatus = 'Stationed';
                const tableStr = assignedTables.map(t => `T${t.tableNumber} (${t.floor?.name || ''})`).join(', ');
                currentLocation = `Stationed at ${tableStr}`;
            }

            return {
                ...w.toObject(),
                assignedTables,
                activeRequestsCount: waiterActiveReqs.length,
                liveStatus,
                currentLocation
            };
        });

        res.status(200).json({ success: true, data: waiterData });
    } catch (error) {
        console.error('Error in getActiveWaiters:', error);
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

        const reqTypeStr = (type || '').toLowerCase();
        const isBill = reqTypeStr.includes('bill') || reqTypeStr.includes('payment');

        const io = req.app.get('io');

        // If requesting bill/payment, resolve any previous pending requests for this table
        if (isBill) {
            const existingPending = await ServiceRequest.find({
                table: tableId,
                status: { $in: ['Pending', 'Acknowledged'] }
            });

            for (const oldReq of existingPending) {
                oldReq.status = 'Completed';
                oldReq.resolvedAt = new Date();
                await oldReq.save();
                if (io) {
                    io.emit('service_request_updated', oldReq);
                }
            }
        }

        let assignedWaiterId = table.assignedWaiter;
        let isAutoAssignedNow = false;

        // Auto-assign waiter if not already assigned to table
        if (!assignedWaiterId) {
            const waiters = await User.find({ 
                role: { $in: ['Waiter', 'Restaurant Manager'] },
                status: { $ne: 'Inactive' }
            });

            if (waiters.length > 0) {
                const requestCounts = await ServiceRequest.aggregate([
                    { $match: { status: { $in: ['Pending', 'Acknowledged'] } } },
                    { $group: { _id: '$waiter', count: { $sum: 1 } } }
                ]);
                const countMap = {};
                requestCounts.forEach(r => { if (r._id) countMap[r._id.toString()] = r.count; });

                let chosenWaiter = waiters[0];
                let minCount = countMap[chosenWaiter._id.toString()] || 0;

                for (const w of waiters) {
                    const cnt = countMap[w._id.toString()] || 0;
                    if (cnt < minCount) {
                        minCount = cnt;
                        chosenWaiter = w;
                    }
                }

                assignedWaiterId = chosenWaiter._id;
                table.assignedWaiter = assignedWaiterId;
                await table.save();
                isAutoAssignedNow = true;
            }
        }

        const request = await ServiceRequest.create({
            table: tableId,
            waiter: assignedWaiterId,
            type: type || 'Call Waiter',
            priority: priority || 'Normal',
            notes
        });

        const populatedRequest = await ServiceRequest.findById(request._id)
            .populate({
                path: 'table',
                populate: { path: 'floor' }
            })
            .populate('waiter', 'name role email phoneNumber');

        // Dispatch WhatsApp notification to assigned available waiter
        try {
            const { sendWaiterWhatsAppAlert } = require('../services/whatsappService');
            if (populatedRequest.waiter) {
                sendWaiterWhatsAppAlert({
                    waiter: populatedRequest.waiter,
                    table: populatedRequest.table,
                    type: populatedRequest.type,
                    notes: populatedRequest.notes,
                    createdAt: populatedRequest.createdAt
                }).catch(wErr => console.error('WhatsApp alert error:', wErr));
            }
        } catch (wErr) {
            console.error('Error triggering WhatsApp alert:', wErr);
        }

        if (io) {
            io.emit('new_service_request', populatedRequest);
            io.emit('waiter_status_updated');
            if (isAutoAssignedNow) {
                io.emit('table_assignments_updated');
            }
        }

        res.status(201).json({ success: true, data: populatedRequest });
    } catch (error) {
        console.error('Error creating service request:', error);
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
        ).populate('table', 'tableNumber name').populate('waiter', 'name').populate('order', 'orderId');

        if (!request) return res.status(404).json({ success: false, message: 'Request not found' });

        const io = req.app.get('io');
        if (io) {
            io.emit('service_request_updated', request);
            io.emit('waiter_status_updated');

            const reqType = (request.type || '').toLowerCase();
            const isBillRequest = reqType.includes('bill') || reqType.includes('payment') || reqType.includes('check');

            if ((status === 'Completed' || status === 'Resolved') && isBillRequest) {
                const Table = require('../models/Table');
                const Order = require('../models/Order');
                const DiningSession = require('../models/DiningSession');

                const tableObj = request.table;
                const tableIdVal = tableObj?._id || tableObj;

                if (tableIdVal) {
                    try {
                        const targetTable = await Table.findById(tableIdVal);
                        if (targetTable) {
                            targetTable.status = 'Available';
                            targetTable.assignedWaiter = null;
                            await targetTable.save();

                            await DiningSession.updateMany(
                                { table: targetTable._id, status: 'Active' },
                                { status: 'Completed', endTime: new Date() }
                            );

                            await Order.updateMany(
                                { table: targetTable._id, status: { $nin: ['Completed', 'Cancelled'] } },
                                { status: 'Completed', paymentStatus: 'Paid' }
                            );

                            const updatedOrders = await Order.find({ table: targetTable._id, status: 'Completed' });
                            for (let ord of updatedOrders) {
                                io.emit('order_status_updated', ord);
                            }

                            io.emit('table_status_updated', targetTable);
                            io.emit('table_status_changed', targetTable);
                        }
                    } catch (tErr) {
                        console.error('Error freeing table on request completion:', tErr);
                    }
                }

                const tableIdStr = tableObj?._id ? tableObj._id.toString() : (tableObj || '');
                const tableNameStr = tableObj?.tableNumber || tableObj?.name || '';

                io.emit('table_payment_completed', { 
                    tableId: tableIdStr, 
                    tableNumber: tableNameStr, 
                    requestId: request._id 
                });
                io.emit('table_payment_received', { 
                    tableId: tableIdStr, 
                    tableNumber: tableNameStr, 
                    requestId: request._id 
                });
            }
        }

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

// @desc    Get All Service Requests Audit History (Fulfilled vs Pending)
// @route   GET /api/v1/waiters/requests/history
// @access  Private (Manager/Admin/Waiter)
exports.getRequestHistory = async (req, res) => {
    try {
        const requests = await ServiceRequest.find()
            .populate({
                path: 'table',
                populate: { path: 'floor' }
            })
            .populate('waiter', 'name role email')
            .populate('resolvedBy', 'name role')
            .populate('order', 'orderId')
            .sort({ createdAt: -1 })
            .limit(100);

        res.status(200).json({ success: true, data: requests });
    } catch (error) {
        console.error('Error fetching request history:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Waiter Punch & Order Performance Statistics
// @route   GET /api/v1/waiters/punch-stats
// @access  Private
exports.getWaiterPunchStats = async (req, res) => {
    try {
        const { timeframe, startDate, endDate } = req.query;
        let dateQuery = {};

        if (startDate || endDate) {
            dateQuery.createdAt = {};
            if (startDate) dateQuery.createdAt.$gte = new Date(startDate);
            if (endDate) dateQuery.createdAt.$lte = new Date(endDate);
        } else if (timeframe === 'today' || !timeframe) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            dateQuery.createdAt = { $gte: startOfDay };
        }

        // Get all active waiters and managers
        const waiters = await User.find({
            role: { $in: ['Waiter', 'Restaurant Manager', 'Waiter Manager', 'admin', 'super_admin', 'Super Admin'] }
        }).select('name email role status');

        // Fetch orders matching date filter
        const orders = await Order.find(dateQuery)
            .populate('waiter', 'name email role')
            .populate('items.addedBy', 'name email role')
            .populate('table', 'tableNumber');

        // Map statistics per waiter
        const waiterStatsMap = {};
        
        // Initialize for all known waiters
        waiters.forEach(w => {
            waiterStatsMap[w._id.toString()] = {
                waiterId: w._id,
                name: w.name,
                email: w.email,
                role: w.role,
                status: w.status,
                totalOrders: 0,
                totalItems: 0,
                totalSales: 0,
                activeOrders: 0,
                completedOrders: 0,
                ordersList: []
            };
        });

        // Add 'Unassigned / System' bucket for orders without a specific waiter
        waiterStatsMap['unassigned'] = {
            waiterId: null,
            name: 'Unassigned / Digital QR',
            email: '-',
            role: 'System',
            status: 'Active',
            totalOrders: 0,
            totalItems: 0,
            totalSales: 0,
            activeOrders: 0,
            completedOrders: 0,
            ordersList: []
        };

        orders.forEach(order => {
            const masterWIdKey = order.waiter ? order.waiter._id.toString() : 'unassigned';
            
            if (!waiterStatsMap[masterWIdKey]) {
                waiterStatsMap[masterWIdKey] = {
                    waiterId: order.waiter?._id || null,
                    name: order.waiter?.name || 'Staff Member',
                    email: order.waiter?.email || '',
                    role: order.waiter?.role || 'Staff',
                    status: 'Active',
                    totalOrders: 0,
                    totalItems: 0,
                    totalSales: 0,
                    activeOrders: 0,
                    completedOrders: 0,
                    ordersList: []
                };
            }

            const masterStats = waiterStatsMap[masterWIdKey];
            masterStats.totalOrders += 1;

            if (['Completed', 'Served'].includes(order.status)) {
                masterStats.completedOrders += 1;
            } else {
                masterStats.activeOrders += 1;
            }

            if (order.items && order.items.length > 0) {
                order.items.forEach(item => {
                    const itemWaiterUser = item.addedBy || order.waiter;
                    const itemWKey = itemWaiterUser ? itemWaiterUser._id.toString() : 'unassigned';

                    if (!waiterStatsMap[itemWKey]) {
                        waiterStatsMap[itemWKey] = {
                            waiterId: itemWaiterUser?._id || null,
                            name: itemWaiterUser?.name || 'Staff Member',
                            email: itemWaiterUser?.email || '',
                            role: itemWaiterUser?.role || 'Staff',
                            status: 'Active',
                            totalOrders: 0,
                            totalItems: 0,
                            totalSales: 0,
                            activeOrders: 0,
                            completedOrders: 0,
                            ordersList: []
                        };
                    }

                    const iStats = waiterStatsMap[itemWKey];
                    const qty = item.quantity || 1;
                    const itemVal = item.totalPrice || (item.unitPrice * qty) || 0;
                    iStats.totalItems += qty;
                    iStats.totalSales += itemVal;
                });
            } else {
                masterStats.totalSales += (order.total || 0);
            }

            const orderItemCount = order.items ? order.items.reduce((sum, item) => sum + (item.quantity || 1), 0) : 0;
            masterStats.ordersList.push({
                orderId: order.orderId,
                tableNumber: order.table?.tableNumber || 'Walk-in',
                status: order.status,
                total: order.total,
                itemCount: orderItemCount,
                createdAt: order.createdAt
            });
        });

        const statsArray = Object.values(waiterStatsMap).filter(s => s.totalOrders > 0 || s.waiterId !== null);

        res.status(200).json({
            success: true,
            timeframe: timeframe || 'today',
            summary: {
                totalOrders: orders.length,
                totalSales: orders.reduce((sum, o) => sum + (o.total || 0), 0),
                totalItems: orders.reduce((sum, o) => sum + (o.items ? o.items.reduce((iSum, i) => iSum + (i.quantity || 1), 0) : 0), 0)
            },
            data: statsArray
        });
    } catch (error) {
        console.error('Error in getWaiterPunchStats:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

