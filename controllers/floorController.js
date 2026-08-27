const Floor = require('../models/Floor');

// @desc    Get all floors (with their tables)
// @route   GET /api/v1/floors
// @access  Private
exports.getFloors = async (req, res, next) => {
    try {
        const floors = await Floor.find().populate('tables');
        res.status(200).json({ success: true, count: floors.length, data: floors });
    } catch (error) {
        next(error);
    }
};

// @desc    Create new floor
// @route   POST /api/v1/floors
// @access  Private (Admin)
exports.createFloor = async (req, res, next) => {
    try {
        req.body.createdBy = req.user.id;
        const floor = await Floor.create(req.body);
        res.status(201).json({ success: true, data: floor });
    } catch (error) {
        next(error);
    }
};

// @desc    Update floor
// @route   PUT /api/v1/floors/:id
// @access  Private (Admin)
exports.updateFloor = async (req, res, next) => {
    try {
        const floor = await Floor.findByIdAndUpdate(req.params.id, req.body, {
            new: true,
            runValidators: true
        });

        if (!floor) return res.status(404).json({ success: false, message: 'Floor not found' });
        res.status(200).json({ success: true, data: floor });
    } catch (error) {
        next(error);
    }
};

const Table = require('../models/Table');
const DiningSession = require('../models/DiningSession');
const Order = require('../models/Order');
const dayjs = require('dayjs');

// @desc    Get floor-wise footfall analytics
// @route   GET /api/v1/floors/footfall
// @access  Private
exports.getFloorFootfallAnalytics = async (req, res, next) => {
    try {
        const { timeframe = 'today', startDate, endDate } = req.query;

        let start = dayjs().startOf('day').toDate();
        let end = dayjs().endOf('day').toDate();

        if (timeframe === 'yesterday') {
            start = dayjs().subtract(1, 'day').startOf('day').toDate();
            end = dayjs().subtract(1, 'day').endOf('day').toDate();
        } else if (timeframe === 'this_week') {
            start = dayjs().startOf('week').toDate();
            end = dayjs().endOf('week').toDate();
        } else if (timeframe === 'this_month') {
            start = dayjs().startOf('month').toDate();
            end = dayjs().endOf('month').toDate();
        } else if (timeframe === 'all_time') {
            start = new Date(0);
            end = new Date();
        } else if (startDate && endDate) {
            start = dayjs(startDate).startOf('day').toDate();
            end = dayjs(endDate).endOf('day').toDate();
        }

        const floors = await Floor.find().lean();
        const allTables = await Table.find().lean();
        const allSessions = await DiningSession.find({
            createdAt: { $gte: start, $lte: end }
        }).lean();

        const activeSessions = await DiningSession.find({ status: 'Active' }).lean();

        const allOrders = await Order.find({
            createdAt: { $gte: start, $lte: end },
            status: { $ne: 'Cancelled' }
        }).lean();

        let totalRestaurantFootfall = 0;
        let totalLiveSeatedGuests = 0;
        let totalOccupiedTablesCount = 0;
        let totalTablesCount = allTables.length;

        const floorMetrics = floors.map(floor => {
            const floorTables = allTables.filter(t => String(t.floor) === String(floor._id));
            const floorTableIds = floorTables.map(t => String(t._id));

            const occupiedTablesCount = floorTables.filter(t => t.status === 'Occupied' || t.status === 'Dining' || t.status === 'Ordering').length;
            totalOccupiedTablesCount += occupiedTablesCount;

            // Sessions on this floor
            const floorSessions = allSessions.filter(s => 
                (s.floor && String(s.floor) === String(floor._id)) ||
                (s.table && floorTableIds.includes(String(s.table)))
            );

            // Active live sessions on this floor
            const floorActiveSessions = activeSessions.filter(s =>
                (s.floor && String(s.floor) === String(floor._id)) ||
                (s.table && floorTableIds.includes(String(s.table)))
            );

            // Orders on this floor
            const floorOrders = allOrders.filter(o => 
                (o.floor && String(o.floor) === String(floor._id)) ||
                (o.table && floorTableIds.includes(String(o.table)))
            );

            // Footfall = sum of guests across sessions (or order pax)
            let sessionFootfall = floorSessions.reduce((sum, s) => sum + (Number(s.guests) || 1), 0);
            let orderFootfall = floorOrders.reduce((sum, o) => sum + (Number(o.pax) || 0), 0);
            
            let totalFootfall = Math.max(sessionFootfall, orderFootfall);
            if (totalFootfall === 0 && (floorSessions.length > 0 || floorOrders.length > 0)) {
                totalFootfall = Math.max(floorSessions.length, floorOrders.length);
            }

            const liveSeatedGuests = floorActiveSessions.reduce((sum, s) => sum + (Number(s.guests) || 1), 0);
            totalLiveSeatedGuests += liveSeatedGuests;
            totalRestaurantFootfall += totalFootfall;

            const totalSessions = Math.max(floorSessions.length, floorOrders.length);
            const avgPaxPerTable = totalSessions > 0 ? Number((totalFootfall / totalSessions).toFixed(1)) : 0;
            const floorRevenue = floorOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

            return {
                _id: floor._id,
                name: floor.name,
                code: floor.code || floor.name.substring(0, 3).toUpperCase(),
                totalTables: floorTables.length,
                occupiedTables: occupiedTablesCount,
                occupancyRate: floorTables.length > 0 ? Math.round((occupiedTablesCount / floorTables.length) * 100) : 0,
                totalFootfall,
                liveSeatedGuests,
                totalSessions,
                avgPaxPerTable,
                floorRevenue
            };
        });

        // Calculate footfall percentage share per floor
        floorMetrics.forEach(fm => {
            fm.footfallShare = totalRestaurantFootfall > 0 
                ? Math.round((fm.totalFootfall / totalRestaurantFootfall) * 100) 
                : 0;
        });

        // Top busy floor
        const topFloor = [...floorMetrics].sort((a, b) => b.totalFootfall - a.totalFootfall)[0];

        res.status(200).json({
            success: true,
            summary: {
                totalRestaurantFootfall,
                totalLiveSeatedGuests,
                totalTablesCount,
                totalOccupiedTablesCount,
                peakOccupancyRate: totalTablesCount > 0 ? Math.round((totalOccupiedTablesCount / totalTablesCount) * 100) : 0,
                topBusyFloor: topFloor && topFloor.totalFootfall > 0 ? topFloor.name : 'N/A',
                timeframe,
                dateRange: { start, end }
            },
            data: floorMetrics
        });
    } catch (error) {
        next(error);
    }
};

// @desc    Delete floor
// @route   DELETE /api/v1/floors/:id
// @access  Private (Admin)
exports.deleteFloor = async (req, res, next) => {
    try {
        const floor = await Floor.findById(req.params.id);
        if (!floor) return res.status(404).json({ success: false, message: 'Floor not found' });
        
        // Use deleteOne to trigger any potential pre-remove hooks if added later
        await floor.deleteOne();
        res.status(200).json({ success: true, data: {} });
    } catch (error) {
        next(error);
    }
};
