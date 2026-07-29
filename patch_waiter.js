const fs = require('fs');
const controllerPath = './controllers/waiterController.js';
let code = fs.readFileSync(controllerPath, 'utf8');

const newEndpoint = `
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
`;

code = code.replace('exports.updateRequestStatus =', newEndpoint + '\nexports.updateRequestStatus =');
fs.writeFileSync(controllerPath, code);
console.log('Controller patched');

const routePath = './routes/waiterRoutes.js';
let routeCode = fs.readFileSync(routePath, 'utf8');
routeCode = routeCode.replace('createServiceRequest,', 'createServiceRequest,\n    getTableRequests,');
routeCode = routeCode.replace("router.post('/requests', createServiceRequest);", "router.post('/requests', createServiceRequest);\nrouter.get('/requests/public', getTableRequests);");
fs.writeFileSync(routePath, routeCode);
console.log('Routes patched');
