const Table = require('../models/Table');
const Floor = require('../models/Floor');

// @desc    Get all tables (or by floorId)
// @route   GET /api/v1/tables
// @route   GET /api/v1/floors/:floorId/tables
// @access  Private
exports.getTables = async (req, res, next) => {
    try {
        let query;
        if (req.params.floorId) {
            query = Table.find({ floor: req.params.floorId });
        } else {
            query = Table.find();
        }

        query.populate({ path: 'floor', select: 'name' })
             .populate({ path: 'assignedWaiter', select: 'name email' })
             .populate({ path: 'mergedWith', select: 'tableNumber' });

        const tables = await query;
        res.status(200).json({ success: true, count: tables.length, data: tables });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new table
// @route   POST /api/v1/tables
// @access  Private (Admin/Manager)
exports.createTable = async (req, res, next) => {
    try {
        req.body.createdBy = req.user.id;
        const table = await Table.create(req.body);
        
        const io = req.app.get('io');
        if (io) io.to(`floor_${table.floor}`).emit('table_created', table);

        res.status(201).json({ success: true, data: table });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Table number already exists on this floor' });
        }
        next(error);
    }
};

// @desc    Update table
// @route   PUT /api/v1/tables/:id
// @access  Private (Admin/Manager)
exports.updateTable = async (req, res, next) => {
    try {
        const table = await Table.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
        
        const io = req.app.get('io');
        if (io) io.to(`floor_${table.floor}`).emit('table_updated', table);

        res.status(200).json({ success: true, data: table });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ success: false, message: 'Table number already exists on this floor' });
        }
        next(error);
    }
};

// @desc    Delete table
// @route   DELETE /api/v1/tables/:id
// @access  Private (Admin)
exports.deleteTable = async (req, res, next) => {
    try {
        const table = await Table.findById(req.params.id);
        if (!table) return res.status(404).json({ success: false, message: 'Table not found' });
        
        const floorId = table.floor;
        await table.deleteOne();
        
        const io = req.app.get('io');
        if (io) io.to(`floor_${floorId}`).emit('table_deleted', req.params.id);

        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};

// @desc    Update table status
// @route   PUT /api/v1/tables/:id/status
// @access  Private
exports.updateTableStatus = async (req, res, next) => {
    try {
        const { status, note } = req.body;
        
        const table = await Table.findById(req.params.id);
        if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

        table.status = status;
        table.activityHistory.push({
            status,
            userId: req.user.id,
            note
        });

        await table.save();

        const populatedTable = await Table.findById(req.params.id)
            .populate('assignedWaiter', 'name')
            .populate('mergedWith', 'tableNumber');

        const io = req.app.get('io');
        if (io) io.to(`floor_${table.floor}`).emit('table_status_changed', populatedTable);

        res.status(200).json({ success: true, data: populatedTable });
    } catch (error) {
        next(error);
    }
};

// @desc    Update table position (Drag & Drop)
// @route   PUT /api/v1/tables/:id/position
// @access  Private (Admin/Manager)
exports.updateTablePosition = async (req, res, next) => {
    try {
        const { x, y } = req.body;
        
        const table = await Table.findByIdAndUpdate(req.params.id, {
            $set: { 'position.x': x, 'position.y': y }
        }, { new: true });

        if (!table) return res.status(404).json({ success: false, message: 'Table not found' });

        const io = req.app.get('io');
        if (io) io.to(`floor_${table.floor}`).emit('table_position_changed', table);

        res.status(200).json({ success: true, data: table });
    } catch (error) {
        next(error);
    }
};

// @desc    Get Table KPIs
// @route   GET /api/v1/tables/kpis
// @access  Private (Admin/Manager)
exports.getTableKPIs = async (req, res, next) => {
    try {
        const tables = await Table.find();
        
        const kpis = {
            total: tables.length,
            available: tables.filter(t => t.status === 'Available').length,
            occupied: tables.filter(t => ['Occupied', 'Dining', 'Ordering', 'Food Preparing'].includes(t.status)).length,
            reserved: tables.filter(t => t.status === 'Reserved').length,
            maintenance: tables.filter(t => ['Maintenance', 'Out of Service'].includes(t.status)).length,
            cleaning: tables.filter(t => t.status === 'Cleaning').length,
            capacityTotal: tables.reduce((acc, t) => acc + (t.capacity || 0), 0)
        };

        res.status(200).json({ success: true, data: kpis });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify QR Code table scan
// @route   GET /api/v1/tables/:id/verify
// @access  Public
exports.verifyTable = async (req, res, next) => {
    try {
        const table = await Table.findById(req.params.id).populate('floor', 'name slug');
        
        if (!table) {
            return res.status(404).json({ success: false, message: 'Invalid QR Code. Table not found.' });
        }

        const floorName = table.floor ? table.floor.name : 'Main Floor';
        const floorSlug = table.floor && table.floor.slug 
            ? table.floor.slug 
            : floorName.toLowerCase().replace(/\s+/g, '-');

        // Check if table is Reserved
        if (table.status === 'Reserved') {
            return res.status(200).json({ 
                success: true, 
                isReserved: true,
                message: 'This table is currently reserved.',
                data: {
                    tableId: table._id,
                    tableNumber: table.tableNumber,
                    floorSlug: floorSlug,
                    floorName: floorName,
                    isReserved: true
                }
            });
        }

        // Update table status to Occupied if it was Available
        if (table.status === 'Available') {
            table.status = 'Occupied';
            table.activityHistory.push({
                status: 'Occupied',
                note: 'QR Code successfully scanned by guest'
            });
            await table.save();
        }

        // Emit socket event to update admin panel in real-time
        const io = req.app.get('io');
        if (io) {
            const populatedTable = await Table.findById(table._id)
                .populate('assignedWaiter', 'name')
                .populate('mergedWith', 'tableNumber');
            io.emit('table_status_changed', populatedTable);
            io.emit('table_status_updated', populatedTable);
            io.to(`floor_${table.floor?._id || table.floor}`).emit('table_status_changed', populatedTable);
        }

        res.status(200).json({ 
            success: true, 
            isReserved: false,
            data: {
                tableId: table._id,
                tableNumber: table.tableNumber,
                floorSlug: floorSlug,
                floorName: floorName,
                isReserved: false
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Occupy a table (Public AIR menu table selection)
// @route   POST /api/v1/tables/public/occupy
// @access  Public
exports.occupyTablePublic = async (req, res, next) => {
    try {
        const { tableId } = req.body;
        if (!tableId) return res.status(400).json({ success: false, message: 'Table ID required' });

        const mongoose = require('mongoose');

        let table = null;
        if (mongoose.Types.ObjectId.isValid(tableId)) {
            table = await Table.findById(tableId);
        }
        if (!table) {
            table = await Table.findOne({
                $or: [
                    { tableNumber: tableId },
                    { tableNumber: tableId.toString().replace(/^t/i, '') },
                    { name: tableId },
                    { qrSlug: tableId }
                ]
            });
        }

        if (!table) {
            return res.status(404).json({ success: false, message: 'Table not found' });
        }

        // Update table status to Occupied if Available
        if (table.status === 'Available') {
            table.status = 'Occupied';
            table.activityHistory.push({
                status: 'Occupied',
                note: 'Table confirmed on AIR Menu'
            });
            await table.save();
        }

        const populatedTable = await Table.findById(table._id)
            .populate('floor', 'name slug')
            .populate('assignedWaiter', 'name')
            .populate('mergedWith', 'tableNumber');

        const io = req.app.get('io');
        if (io) {
            io.emit('table_status_changed', populatedTable);
            io.emit('table_status_updated', populatedTable);
            io.to(`floor_${table.floor?._id || table.floor}`).emit('table_status_changed', populatedTable);
        }

        res.status(200).json({ success: true, data: populatedTable });
    } catch (error) {
        next(error);
    }
};

// @desc    Free a table after customer checkout (Public AIR menu)
// @route   POST /api/v1/tables/public/free
// @access  Public
exports.freeTablePublic = async (req, res, next) => {
    try {
        const { tableId } = req.body;
        if (!tableId) return res.status(400).json({ success: false, message: 'Table ID required' });

        const mongoose = require('mongoose');

        let table = null;
        if (mongoose.Types.ObjectId.isValid(tableId)) {
            table = await Table.findById(tableId);
        }
        if (!table) {
            table = await Table.findOne({
                $or: [
                    { tableNumber: tableId },
                    { tableNumber: tableId.toString().replace(/^t/i, '') },
                    { name: tableId },
                    { qrSlug: tableId }
                ]
            });
        }

        if (!table) {
            return res.status(404).json({ success: false, message: 'Table not found' });
        }

        // Set table back to Available
        table.status = 'Available';
        table.assignedWaiter = null;
        table.activityHistory.push({
            status: 'Available',
            note: 'Table released / switched by customer via AIR Menu.'
        });
        await table.save();

        const populatedTable = await Table.findById(table._id)
            .populate('floor', 'name slug')
            .populate('assignedWaiter', 'name')
            .populate('mergedWith', 'tableNumber');

        const io = req.app.get('io');
        if (io) {
            io.emit('table_status_changed', populatedTable);
            io.emit('table_status_updated', populatedTable);
            io.to(`floor_${table.floor?._id || table.floor}`).emit('table_status_changed', populatedTable);
        }

        res.status(200).json({ success: true, data: populatedTable });
    } catch (error) {
        next(error);
    }
};

// @desc    Verify Phone Number for Reserved Table (Public)
// @route   POST /api/v1/tables/public/verify-reserved-phone
// @access  Public
exports.verifyReservedTablePhone = async (req, res, next) => {
    try {
        const { tableId, phone } = req.body;
        if (!tableId || !phone) {
            return res.status(400).json({ success: false, message: 'Table ID and phone number are required.' });
        }

        const mongoose = require('mongoose');
        const Reservation = require('../models/Reservation');
        const Customer = require('../models/Customer');

        let table = null;
        if (mongoose.Types.ObjectId.isValid(tableId)) {
            table = await Table.findById(tableId).populate('floor', 'name slug');
        }
        if (!table) {
            table = await Table.findOne({
                $or: [
                    { tableNumber: tableId },
                    { tableNumber: tableId.toString().replace(/^t/i, '') },
                    { name: tableId },
                    { qrSlug: tableId }
                ]
            }).populate('floor', 'name slug');
        }

        if (!table) {
            return res.status(404).json({ success: false, message: 'Table not found.' });
        }

        // Clean phone input (digits only)
        const cleanPhone = phone.replace(/[^0-9]/g, '').slice(-10);

        // Find customer with matching phone regex
        const matchingCustomers = await Customer.find({
            phone: { $regex: cleanPhone, $options: 'i' }
        });

        const customerIds = matchingCustomers.map(c => c._id);

        // Search for active reservation for this table and matching customer
        const reservation = await Reservation.findOne({
            tables: table._id,
            customer: { $in: customerIds },
            status: { $in: ['Confirmed', 'Checked-in', 'Reserved', 'Pending', 'Seated'] }
        }).populate('customer');

        if (!reservation) {
            return res.status(400).json({
                success: false,
                message: `Phone number ${phone} does not match any active reservation for Table ${table.tableNumber}. Please check with staff.`
            });
        }

        // Verified! Update table status to Occupied and reservation to Seated
        table.status = 'Occupied';
        table.activityHistory.push({
            status: 'Occupied',
            note: `Reserved table unlocked by guest via phone verification (${phone})`
        });
        await table.save();

        reservation.status = 'Seated';
        await reservation.save();

        const populatedTable = await Table.findById(table._id)
            .populate('floor', 'name slug')
            .populate('assignedWaiter', 'name')
            .populate('mergedWith', 'tableNumber');

        // Emit real-time socket events
        const io = req.app.get('io');
        if (io) {
            io.emit('table_status_changed', populatedTable);
            io.emit('table_status_updated', populatedTable);
            io.to(`floor_${table.floor?._id || table.floor}`).emit('table_status_changed', populatedTable);
            io.emit('reservation_updated', reservation);
        }

        const floorName = table.floor ? table.floor.name : 'Main Floor';
        const floorSlug = table.floor && table.floor.slug 
            ? table.floor.slug 
            : floorName.toLowerCase().replace(/\s+/g, '-');

        res.status(200).json({
            success: true,
            verified: true,
            message: 'Reservation verified successfully!',
            data: {
                tableId: table._id,
                tableNumber: table.tableNumber,
                floorSlug: floorSlug,
                floorName: floorName,
                customerName: reservation.customer?.name || 'Guest'
            }
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Update Table Pax / Guest Footfall Count
// @route   PUT /api/v1/tables/:id/pax
// @access  Private
exports.updateTablePax = async (req, res, next) => {
    try {
        const { pax, guests } = req.body;
        const paxCount = Math.max(1, Number(pax || guests || 1));
        const tableId = req.params.id;

        const DiningSession = require('../models/DiningSession');
        const Order = require('../models/Order');
        const generateId = require('../utils/generateId');

        const table = await Table.findById(tableId);
        if (!table) {
            return res.status(404).json({ success: false, message: 'Table not found' });
        }

        // 1. Find active session or create new one
        let session = await DiningSession.findOne({ table: tableId, status: 'Active' });
        if (!session) {
            const sessionId = await generateId('SESS', DiningSession);
            session = await DiningSession.create({
                sessionId,
                table: tableId,
                floor: table.floor,
                waiter: req.user?._id || table.assignedWaiter || null,
                status: 'Active',
                guests: paxCount,
                startTime: new Date()
            });
        } else {
            session.guests = paxCount;
            await session.save();
        }

        // 2. Update active order if exists
        const activeOrder = await Order.findOne({
            table: tableId,
            session: session._id,
            status: { $nin: ['Completed', 'Cancelled'] }
        });
        if (activeOrder) {
            activeOrder.pax = paxCount;
            await activeOrder.save();
        }

        // Emit real-time update
        const io = req.app.get('io');
        if (io) {
            io.emit('table_pax_updated', { tableId, pax: paxCount, sessionId: session._id });
        }

        res.status(200).json({
            success: true,
            message: `Table Pax / Footfall updated to ${paxCount} guests!`,
            data: { tableId, pax: paxCount, session }
        });
    } catch (error) {
        next(error);
    }
};

