const Reservation = require('../models/Reservation');
const Customer = require('../models/Customer');
const Table = require('../models/Table');

// Generate unique ID
const generateResId = async () => {
    const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let id = '';
    let unique = false;
    while (!unique) {
        id = 'RES-';
        for (let i = 0; i < 6; i++) {
            id += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await Reservation.findOne({ reservationId: id });
        if (!existing) unique = true;
    }
    return id;
};

// Check Availability Engine
const checkTableAvailability = async (date, time, guests, floorId, durationMinutes = 120) => {
    // 1. Get all tables that match basic capacity
    let tableQuery = { status: { $nin: ['Maintenance', 'Out of Service'] } };
    if (floorId) tableQuery.floor = floorId;
    
    // Allow tables with capacity slightly lower if they can be pushed together, but for simple MVP, just get tables >= guests
    tableQuery.capacity = { $gte: guests };
    const suitableTables = await Table.find(tableQuery).sort({ capacity: 1 });

    if (suitableTables.length === 0) return [];

    // 2. Determine time overlaps
    const requestedStart = new Date(`${date.split('T')[0]}T${time}:00.000Z`);
    const requestedEnd = new Date(requestedStart.getTime() + durationMinutes * 60000);

    // Get all reservations for this date
    const startOfDay = new Date(requestedStart);
    startOfDay.setUTCHours(0,0,0,0);
    const endOfDay = new Date(requestedStart);
    endOfDay.setUTCHours(23,59,59,999);

    const existingReservations = await Reservation.find({
        date: { $gte: startOfDay, $lte: endOfDay },
        status: { $in: ['Confirmed', 'Checked-in', 'Seated', 'Pending'] }
    });

    const bookedTableIds = new Set();
    
    existingReservations.forEach(res => {
        const resStart = new Date(`${res.date.toISOString().split('T')[0]}T${res.time}:00.000Z`);
        const resEnd = new Date(resStart.getTime() + res.durationMinutes * 60000);
        
        // Overlap logic: (StartA < EndB) and (EndA > StartB)
        if (requestedStart < resEnd && requestedEnd > resStart) {
            res.tables.forEach(t => bookedTableIds.add(t.toString()));
        }
    });

    // 3. Filter out booked tables
    return suitableTables.filter(t => !bookedTableIds.has(t._id.toString()));
};

// @desc    Check Availability (Public or Private)
// @route   POST /api/v1/reservations/availability
// @access  Public
exports.checkAvailability = async (req, res) => {
    try {
        const { date, time, guests, floor } = req.body;
        if (!date || !time || !guests) {
            return res.status(400).json({ success: false, message: 'Date, time, and guests are required' });
        }

        const availableTables = await checkTableAvailability(date, time, guests, floor);
        
        res.status(200).json({
            success: true,
            available: availableTables.length > 0,
            tables: availableTables
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create a reservation
// @route   POST /api/v1/reservations
// @access  Public
exports.createReservation = async (req, res) => {
    try {
        const { customer, date, time, guests, source, floor, tables, specialOccasion, seatingPreference, specialRequests } = req.body;
        
        // 1. Handle Customer
        let customerDoc = await Customer.findOne({ phone: customer.phone });
        if (!customerDoc) {
            customerDoc = await Customer.create(customer);
        } else {
            // Update email or name if missing
            if (!customerDoc.email && customer.email) customerDoc.email = customer.email;
            if (customer.name) customerDoc.name = customer.name;
            await customerDoc.save();
        }

        // 2. Validate Double Booking for same customer
        const existingRes = await Reservation.findOne({ customer: customerDoc._id, date, time });
        if (existingRes) {
            return res.status(400).json({ success: false, message: 'Customer already has a booking at this time.' });
        }

        // 3. (Optional) Auto-assign table if not provided
        let assignedTables = tables;
        if (!assignedTables || assignedTables.length === 0) {
            const availableTables = await checkTableAvailability(date, time, guests, floor);
            if (availableTables.length > 0) {
                assignedTables = [availableTables[0]._id];
            }
        }

        const reservationId = await generateResId();
        
        const reservation = await Reservation.create({
            reservationId,
            customer: customerDoc._id,
            date,
            time,
            guests,
            source,
            floor,
            tables: assignedTables,
            specialOccasion,
            seatingPreference,
            specialRequests,
            status: 'Pending'
        });

        const populatedRes = await Reservation.findById(reservation._id).populate('customer').populate('tables').populate('floor');

        // Emit socket event
        try {
            const io = req.app.get('io');
            if (io) io.emit('reservation_created', populatedRes);
        } catch (e) { console.error('Socket error:', e); }

        res.status(201).json({ success: true, data: populatedRes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all reservations
// @route   GET /api/v1/reservations
// @access  Private
exports.getReservations = async (req, res) => {
    try {
        const { status, date, floor, search } = req.query;
        let query = {};
        
        if (status) query.status = status;
        if (floor) query.floor = floor;
        if (date) {
            const start = new Date(date);
            start.setUTCHours(0,0,0,0);
            const end = new Date(date);
            end.setUTCHours(23,59,59,999);
            query.date = { $gte: start, $lte: end };
        }

        let reservations = await Reservation.find(query)
            .populate('customer')
            .populate('tables')
            .populate('floor')
            .populate('assignedStaff')
            .sort({ date: 1, time: 1 });

        // Filter by search term on customer name/phone if provided
        if (search) {
            const s = search.toLowerCase();
            reservations = reservations.filter(r => 
                r.customer.name.toLowerCase().includes(s) || 
                r.customer.phone.includes(s) || 
                r.reservationId.toLowerCase().includes(s)
            );
        }

        res.status(200).json({ success: true, count: reservations.length, data: reservations });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Reservation Status
// @route   PUT /api/v1/reservations/:id/status
// @access  Private
exports.updateReservationStatus = async (req, res) => {
    try {
        const { status, tableId } = req.body;
        const reservation = await Reservation.findById(req.params.id).populate('customer');
        
        if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found' });

        const previousStatus = reservation.status;
        reservation.status = status;

        // If assigning a new table during check-in
        if (tableId && !reservation.tables.includes(tableId)) {
            reservation.tables = [tableId];
        }

        // Logic for CRM
        if (status === 'No-Show' && previousStatus !== 'No-Show') {
            await Customer.findByIdAndUpdate(reservation.customer._id, { $inc: { noShows: 1 } });
        } else if (status === 'Cancelled' && previousStatus !== 'Cancelled') {
            await Customer.findByIdAndUpdate(reservation.customer._id, { $inc: { totalCancellations: 1 } });
        } else if (status === 'Completed' && previousStatus !== 'Completed') {
            await Customer.findByIdAndUpdate(reservation.customer._id, { 
                $inc: { totalVisits: 1 },
                lastVisit: new Date()
            });
        }

        await reservation.save();

        // Update Table statuses based on Reservation status
        if (reservation.tables && reservation.tables.length > 0) {
            let tableStatus = null;
            if (['Confirmed', 'Checked-in', 'Reserved'].includes(status)) {
                tableStatus = 'Reserved';
            } else if (status === 'Seated') {
                tableStatus = 'Occupied';
            } else if (['Completed', 'Cancelled', 'No-Show'].includes(status)) {
                tableStatus = 'Available';
            }

            if (tableStatus) {
                await Table.updateMany({ _id: { $in: reservation.tables } }, { status: tableStatus });
                
                try {
                    const io = req.app.get('io');
                    const tables = await Table.find({ _id: { $in: reservation.tables } }).populate('floor', 'name slug');
                    if (io) {
                        tables.forEach(t => {
                            io.emit('table_status_changed', t);
                            io.emit('table_status_updated', t);
                        });
                    }
                } catch (e) { console.error('Socket error:', e); }
            }
        }

        const updatedRes = await Reservation.findById(reservation._id).populate('customer').populate('tables').populate('floor');
        
        try {
            const io = req.app.get('io');
            if (io) io.emit('reservation_updated', updatedRes);
        } catch (e) { console.error('Socket error:', e); }

        res.status(200).json({ success: true, data: updatedRes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get Dashboard Analytics
// @route   GET /api/v1/reservations/analytics/dashboard
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
    try {
        const startOfToday = new Date();
        startOfToday.setUTCHours(0,0,0,0);
        const endOfToday = new Date();
        endOfToday.setUTCHours(23,59,59,999);

        const todaysReservations = await Reservation.find({ date: { $gte: startOfToday, $lte: endOfToday } });
        const allReservations = await Reservation.find();

        const data = {
            total: allReservations.length,
            today: todaysReservations.length,
            walkInsToday: todaysReservations.filter(r => r.source === 'Walk-in').length,
            activeSessions: todaysReservations.filter(r => r.status === 'Seated' || r.status === 'Checked-in').length,
            upcomingToday: todaysReservations.filter(r => r.status === 'Confirmed' || r.status === 'Pending').length,
            noShowsToday: todaysReservations.filter(r => r.status === 'No-Show').length,
            completedToday: todaysReservations.filter(r => r.status === 'Completed').length,
            cancelledToday: todaysReservations.filter(r => r.status === 'Cancelled').length,
            waitlistToday: todaysReservations.filter(r => r.status === 'Waitlisted').length,
        };

        // Source distribution (Pie Chart)
        const sources = {};
        allReservations.forEach(r => {
            sources[r.source] = (sources[r.source] || 0) + 1;
        });

        // Peak hours today (Line Chart)
        const peakHours = {};
        todaysReservations.forEach(r => {
            const hour = r.time.split(':')[0] + ':00';
            peakHours[hour] = (peakHours[hour] || 0) + r.guests;
        });

        const sortedPeakHours = Object.keys(peakHours).sort().map(time => ({
            time,
            guests: peakHours[time]
        }));

        res.status(200).json({ 
            success: true, 
            data: {
                metrics: data,
                sources: Object.keys(sources).map(name => ({ name, value: sources[name] })),
                peakHours: sortedPeakHours
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update Full Reservation Details
// @route   PUT /api/v1/reservations/:id
// @access  Private (Admin / Reception)
exports.updateReservation = async (req, res) => {
    try {
        const { customer, date, time, guests, source, floor, tables, status, specialOccasion, seatingPreference, specialRequests } = req.body;
        
        let reservation = await Reservation.findById(req.params.id);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        // Update customer details if provided
        if (customer && reservation.customer) {
            await Customer.findByIdAndUpdate(reservation.customer, {
                name: customer.name,
                email: customer.email,
                phone: customer.phone
            });
        }

        const prevTables = reservation.tables || [];
        const newTables = tables !== undefined ? tables : prevTables;
        const newStatus = status || reservation.status;

        if (req.body.date) reservation.date = date;
        if (req.body.time) reservation.time = time;
        if (req.body.guests) reservation.guests = guests;
        if (req.body.source) reservation.source = source;
        if (req.body.floor !== undefined) reservation.floor = floor;
        if (tables !== undefined) reservation.tables = tables;
        if (req.body.status) reservation.status = status;
        if (req.body.specialOccasion !== undefined) reservation.specialOccasion = specialOccasion;
        if (req.body.seatingPreference !== undefined) reservation.seatingPreference = seatingPreference;
        if (req.body.specialRequests !== undefined) reservation.specialRequests = specialRequests;

        await reservation.save();

        // Sync Table statuses
        if (newTables && newTables.length > 0) {
            let tableStatus = null;
            if (['Confirmed', 'Checked-in', 'Reserved'].includes(newStatus)) {
                tableStatus = 'Reserved';
            } else if (newStatus === 'Seated') {
                tableStatus = 'Occupied';
            } else if (['Completed', 'Cancelled', 'No-Show'].includes(newStatus)) {
                tableStatus = 'Available';
            }

            if (tableStatus) {
                await Table.updateMany({ _id: { $in: newTables } }, { status: tableStatus });
                
                try {
                    const io = req.app.get('io');
                    const tList = await Table.find({ _id: { $in: newTables } }).populate('floor', 'name slug');
                    if (io) {
                        tList.forEach(t => {
                            io.emit('table_status_changed', t);
                            io.emit('table_status_updated', t);
                        });
                    }
                } catch (e) { console.error('Socket error:', e); }
            }
        }

        const updatedRes = await Reservation.findById(reservation._id).populate('customer').populate('tables').populate('floor');

        try {
            const io = req.app.get('io');
            if (io) io.emit('reservation_updated', updatedRes);
        } catch (e) { console.error('Socket error:', e); }

        res.status(200).json({ success: true, data: updatedRes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete Reservation
// @route   DELETE /api/v1/reservations/:id
// @access  Private (Admin / Reception)
exports.deleteReservation = async (req, res) => {
    try {
        const reservation = await Reservation.findById(req.params.id);
        if (!reservation) {
            return res.status(404).json({ success: false, message: 'Reservation not found' });
        }

        // Free any assigned tables
        if (reservation.tables && reservation.tables.length > 0) {
            await Table.updateMany({ _id: { $in: reservation.tables } }, { status: 'Available' });
            try {
                const io = req.app.get('io');
                const tList = await Table.find({ _id: { $in: reservation.tables } }).populate('floor', 'name slug');
                if (io) {
                    tList.forEach(t => {
                        io.emit('table_status_changed', t);
                        io.emit('table_status_updated', t);
                    });
                }
            } catch (e) { console.error('Socket error:', e); }
        }

        const resId = reservation._id;
        await reservation.deleteOne();

        try {
            const io = req.app.get('io');
            if (io) io.emit('reservation_deleted', resId);
        } catch (e) { console.error('Socket error:', e); }

        res.status(200).json({ success: true, message: 'Reservation deleted successfully', data: {} });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
