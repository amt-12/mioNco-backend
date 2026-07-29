const QRCode = require('../models/QRCode');
const RestaurantSettings = require('../models/RestaurantSettings');
const Table = require('../models/Table');

// Utility to generate a unique QR ID
const generateUniqueQrId = async () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let unique = false;
    let qrId = '';
    while (!unique) {
        qrId = 'MIO-QR-';
        for (let i = 0; i < 6; i++) {
            qrId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await QRCode.findOne({ qrId });
        if (!existing) unique = true;
    }
    return qrId;
};

// @desc    Generate a single QR Code
// @route   POST /api/v1/qr
// @access  Private
exports.generateQRCode = async (req, res) => {
    try {
        const { qrType, floor, table, notes } = req.body;
        
        // Ensure Restaurant Config Exists
        const restaurant = await RestaurantSettings.findOne();
        if (!restaurant) {
            return res.status(400).json({ success: false, message: 'Restaurant settings not found. Please configure first.' });
        }

        // Generate ID and URL
        const qrId = await generateUniqueQrId();
        const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/qr-scan/${qrId}`;

        // Create Payload
        const qrData = {
            qrId,
            qrType,
            url,
            restaurant: restaurant._id,
            status: 'Active',
            assignedBy: req.user._id,
            notes,
            versionHistory: [{
                action: 'Created',
                userId: req.user._id,
                details: `Generated ${qrType} QR Code`
            }]
        };

        if (qrType === 'Table') {
            if (!floor || !table) {
                return res.status(400).json({ success: false, message: 'Floor and Table are required for Table QR' });
            }
            // Check if table already has active QR
            const existingActive = await QRCode.findOne({ table, status: 'Active' });
            if (existingActive) {
                return res.status(400).json({ success: false, message: 'This table already has an active QR code.' });
            }
            qrData.floor = floor;
            qrData.table = table;
        }

        const qrCode = await QRCode.create(qrData);
        res.status(201).json({ success: true, data: qrCode });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all QR Codes with filtering
// @route   GET /api/v1/qr
// @access  Private
exports.getQRCodes = async (req, res) => {
    try {
        const { status, qrType, floor } = req.query;
        let query = {};
        if (status) query.status = status;
        if (qrType) query.qrType = qrType;
        if (floor) query.floor = floor;

        const qrCodes = await QRCode.find(query)
            .populate('floor', 'name floorNumber')
            .populate('table', 'tableNumber capacity')
            .populate('assignedBy', 'name email')
            .sort({ createdAt: -1 });

        res.status(200).json({ success: true, count: qrCodes.length, data: qrCodes });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Bulk Generate QRs for a Floor
// @route   POST /api/v1/qr/bulk
// @access  Private
exports.bulkGenerateQRCodes = async (req, res) => {
    try {
        const { floor } = req.body;
        if (!floor) return res.status(400).json({ success: false, message: 'Floor ID is required' });

        const restaurant = await RestaurantSettings.findOne();
        if (!restaurant) return res.status(400).json({ success: false, message: 'Restaurant settings missing' });

        // Find tables on this floor without active QRs
        const tablesOnFloor = await Table.find({ floor });
        const activeQrs = await QRCode.find({ floor, status: 'Active' });
        const activeTableIds = activeQrs.map(qr => qr.table.toString());

        const tablesNeedingQrs = tablesOnFloor.filter(t => !activeTableIds.includes(t._id.toString()));

        if (tablesNeedingQrs.length === 0) {
            return res.status(400).json({ success: false, message: 'All tables on this floor already have active QR codes' });
        }

        const generatedQRs = [];
        for (const table of tablesNeedingQrs) {
            const qrId = await generateUniqueQrId();
            const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/qr-scan/${qrId}`;
            
            const qr = await QRCode.create({
                qrId,
                qrType: 'Table',
                url,
                restaurant: restaurant._id,
                floor,
                table: table._id,
                status: 'Active',
                assignedBy: req.user._id,
                notes: 'Bulk generated',
                versionHistory: [{
                    action: 'Created',
                    userId: req.user._id,
                    details: `Bulk Generated QR Code for Table ${table.tableNumber}`
                }]
            });
            generatedQRs.push(qr);
        }

        res.status(201).json({ 
            success: true, 
            message: `Successfully generated ${generatedQRs.length} QR Codes`,
            data: generatedQRs 
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update QR Status (Active, Inactive, Damaged)
// @route   PUT /api/v1/qr/:id/status
// @access  Private
exports.updateQRStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const validStatuses = ['Active', 'Inactive', 'Damaged', 'Deleted'];
        
        if (!validStatuses.includes(status)) {
            return res.status(400).json({ success: false, message: 'Invalid status' });
        }

        const qr = await QRCode.findById(req.params.id);
        if (!qr) {
            return res.status(404).json({ success: false, message: 'QR Code not found' });
        }

        // If activating a table QR, check if table already has another active QR
        if (status === 'Active' && qr.qrType === 'Table') {
            const existingActive = await QRCode.findOne({ table: qr.table, status: 'Active', _id: { $ne: qr._id } });
            if (existingActive) {
                return res.status(400).json({ success: false, message: 'Table already has an active QR code. Deactivate it first.' });
            }
        }

        qr.status = status;
        qr.versionHistory.push({
            action: 'Status Update',
            userId: req.user._id,
            details: `Status changed to ${status}`
        });

        await qr.save();
        res.status(200).json({ success: true, data: qr });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Log Scan (Public API)
// @route   POST /api/v1/qr/scan/:qrId
// @access  Public
exports.logScan = async (req, res) => {
    try {
        const { qrId } = req.params;
        const { device, browser, os, ipAddress } = req.body;

        const qr = await QRCode.findOne({ qrId }).populate('table').populate('floor');
        
        if (!qr) {
            return res.status(404).json({ success: false, message: 'Invalid QR Code' });
        }

        if (qr.status !== 'Active') {
            return res.status(403).json({ success: false, message: 'This QR Code is currently inactive.' });
        }

        // Update stats
        qr.scanCount += 1;
        qr.lastScanTime = Date.now();
        qr.scanHistory.push({
            timestamp: Date.now(),
            device,
            browser,
            os,
            ipAddress
        });

        await qr.save();

        res.status(200).json({ 
            success: true, 
            data: {
                qrType: qr.qrType,
                url: qr.url,
                tableInfo: qr.qrType === 'Table' ? {
                    tableNumber: qr.table?.tableNumber,
                    floorName: qr.floor?.name
                } : null
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get QR Dashboard KPIs
// @route   GET /api/v1/qr/dashboard/kpis
// @access  Private
exports.getQRDashboardKPIs = async (req, res) => {
    try {
        const totalQRs = await QRCode.countDocuments();
        const activeQRs = await QRCode.countDocuments({ status: 'Active' });
        const inactiveQRs = await QRCode.countDocuments({ status: { $in: ['Inactive', 'Damaged'] } });
        const publicQRs = await QRCode.countDocuments({ qrType: 'Public' });
        const tableQRs = await QRCode.countDocuments({ qrType: 'Table' });

        // Aggregate total scans
        const totalScansResult = await QRCode.aggregate([
            { $group: { _id: null, totalScans: { $sum: '$scanCount' } } }
        ]);
        const totalScans = totalScansResult[0]?.totalScans || 0;

        // Scans Today
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const scansTodayResult = await QRCode.aggregate([
            { $unwind: "$scanHistory" },
            { $match: { "scanHistory.timestamp": { $gte: startOfToday } } },
            { $count: "scansToday" }
        ]);
        const scansToday = scansTodayResult[0]?.scansToday || 0;

        // Top Scanned Tables
        const topScannedTables = await QRCode.find({ qrType: 'Table', scanCount: { $gt: 0 } })
            .populate('table', 'tableNumber')
            .sort({ scanCount: -1 })
            .limit(5);

        // Chart Data (Scans per day for last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const chartDataRaw = await QRCode.aggregate([
            { $unwind: "$scanHistory" },
            { $match: { "scanHistory.timestamp": { $gte: sevenDaysAgo } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$scanHistory.timestamp" } },
                    scans: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const chartData = chartDataRaw.map(item => ({
            date: item._id,
            scans: item.scans
        }));

        res.status(200).json({
            success: true,
            data: {
                totalQRs,
                activeQRs,
                inactiveQRs,
                publicQRs,
                tableQRs,
                totalScans,
                scansToday,
                topScannedTables,
                chartData
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
