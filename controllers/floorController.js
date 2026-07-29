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
