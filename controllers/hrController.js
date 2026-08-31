const EmployeeProfile = require('../models/EmployeeProfile');
const User = require('../models/User');

// Helper to generate a unique employee ID starting from MIO-EMP-002
const generateUniqueEmployeeId = async () => {
    let num = 2;
    let candidate = `MIO-EMP-${num.toString().padStart(3, '0')}`; // 'MIO-EMP-002'
    while (
        await EmployeeProfile.findOne({ employeeId: candidate }) ||
        await User.findOne({ employeeId: candidate })
    ) {
        num++;
        candidate = `MIO-EMP-${num.toString().padStart(3, '0')}`;
    }
    return candidate;
};

// @desc    Get HR Dashboard Analytics
// @route   GET /api/v1/hr/dashboard
// @access  Private
exports.getDashboardAnalytics = async (req, res) => {
    try {
        const totalEmployees = await EmployeeProfile.countDocuments();
        const activeEmployees = await EmployeeProfile.countDocuments({ onboardingStatus: 'Active' });
        const pendingOnboarding = await EmployeeProfile.countDocuments({ 
            onboardingStatus: { $in: ['Draft', 'Pending Documents', 'Pending Verification', 'Pending Approval'] } 
        });

        // Basic department breakdown
        const deptBreakdown = await EmployeeProfile.aggregate([
            { $group: { _id: '$employmentDetails.department', count: { $sum: 1 } } }
        ]);

        res.status(200).json({
            success: true,
            data: {
                totalEmployees,
                activeEmployees,
                pendingOnboarding,
                deptBreakdown
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get next recommended unique Employee ID
// @route   GET /api/v1/hr/next-employee-id
// @access  Private
exports.getNextEmployeeId = async (req, res) => {
    try {
        const nextId = await generateUniqueEmployeeId();
        res.status(200).json({ success: true, data: { employeeId: nextId } });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get all employees
// @route   GET /api/v1/hr/employees
// @access  Private
exports.getEmployees = async (req, res) => {
    try {
        const employees = await EmployeeProfile.find().sort({ createdAt: -1 });
        res.status(200).json({ success: true, data: employees });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Get single employee
// @route   GET /api/v1/hr/employees/:id
// @access  Private
exports.getEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id)
            .populate('employmentDetails.reportingManager', 'name email')
            .populate('userAccount', 'email status employeeId role');
            
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });
        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Create draft employee (Step 1 of Wizard)
// @route   POST /api/v1/hr/employees
// @access  Private
exports.createEmployee = async (req, res) => {
    try {
        let { employeeId, initialPassword, autoActivate, ...rest } = req.body;

        // Generate pseudo employee ID if not provided
        if (!employeeId || !employeeId.trim()) {
            employeeId = await generateUniqueEmployeeId();
        } else {
            employeeId = employeeId.trim();
            // Check uniqueness in EmployeeProfile and User
            const existingEmp = await EmployeeProfile.findOne({ employeeId });
            if (existingEmp) {
                return res.status(400).json({ success: false, message: `Employee ID "${employeeId}" already exists.` });
            }
            const existingUser = await User.findOne({ employeeId });
            if (existingUser) {
                return res.status(400).json({ success: false, message: `Employee ID "${employeeId}" is already assigned to a system user.` });
            }
        }
        
        const cleanId = employeeId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const staffEmail = rest.email?.trim() || `${cleanId}@staff.mioandco.co`;
        const staffLastName = rest.lastName ? rest.lastName.trim() : '';

        const employee = await EmployeeProfile.create({
            ...rest,
            lastName: staffLastName,
            email: staffEmail,
            employeeId
        });

        // If autoActivate is requested or password is provided upfront
        if (autoActivate) {
            const staffPassword = initialPassword?.trim() || employee.phoneNumber?.toString().trim() || 'MioPassword123!';
            let role = employee.employmentDetails?.designation || 'Reception Staff';
            const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.firstName;

            const newUser = await User.create({
                name: fullName,
                email: staffEmail,
                employeeId: employee.employeeId,
                password: staffPassword,
                role: role,
                phoneNumber: employee.phoneNumber,
                status: 'Active'
            });

            employee.userAccount = newUser._id;
            employee.onboardingStatus = 'Active';
            await employee.save();
        }

        res.status(201).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Update employee profile (Subsequent Wizard steps or HR edit)
// @route   PUT /api/v1/hr/employees/:id
// @access  Private
exports.updateEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        const { employeeId, password, ...rest } = req.body;

        // If employeeId is being changed
        if (employeeId && employeeId.trim() !== employee.employeeId) {
            const formattedId = employeeId.trim();
            const existingEmp = await EmployeeProfile.findOne({ employeeId: formattedId, _id: { $ne: employee._id } });
            if (existingEmp) {
                return res.status(400).json({ success: false, message: `Employee ID "${formattedId}" is already taken.` });
            }
            const existingUser = await User.findOne({ employeeId: formattedId, ...(employee.userAccount ? { _id: { $ne: employee.userAccount } } : {}) });
            if (existingUser) {
                return res.status(400).json({ success: false, message: `Employee ID "${formattedId}" is already assigned to a user account.` });
            }
            employee.employeeId = formattedId;
        }

        // Apply remaining updates
        Object.keys(rest).forEach(key => {
            if (rest[key] !== undefined) {
                employee[key] = rest[key];
            }
        });

        await employee.save();

        // If linked User account exists, sync user details as well
        if (employee.userAccount) {
            const user = await User.findById(employee.userAccount);
            if (user) {
                user.employeeId = employee.employeeId;
                if (rest.firstName !== undefined || rest.lastName !== undefined) {
                    user.name = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.firstName;
                }
                if (rest.email) user.email = rest.email;
                if (rest.phoneNumber) user.phoneNumber = rest.phoneNumber;
                if (rest.employmentDetails?.designation) {
                    user.role = rest.employmentDetails.designation;
                }
                if (rest.onboardingStatus) {
                    user.status = (rest.onboardingStatus === 'Active') ? 'Active' : (rest.onboardingStatus === 'Suspended' || rest.onboardingStatus === 'Terminated' ? 'Inactive' : user.status);
                }
                if (password && password.trim().length >= 6) {
                    user.password = password.trim();
                }
                await user.save();
            }
        }

        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Verify Employee Document
// @route   PUT /api/v1/hr/employees/:id/documents/verify
// @access  Private
exports.verifyDocument = async (req, res) => {
    try {
        const { docId, status, remarks } = req.body;
        const employee = await EmployeeProfile.findOneAndUpdate(
            { _id: req.params.id, "documents._id": docId },
            { 
                $set: { 
                    "documents.$.status": status,
                    "documents.$.remarks": remarks
                }
            },
            { new: true }
        );
        res.status(200).json({ success: true, data: employee });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Activate Employee Account (Generates User with Employee ID and Password)
// @route   POST /api/v1/hr/employees/:id/activate
// @access  Private
exports.activateEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (employee.userAccount) {
            // If already exists, ensure employeeId is synchronized and activate status
            const existingUser = await User.findById(employee.userAccount);
            if (existingUser) {
                existingUser.employeeId = employee.employeeId;
                existingUser.status = 'Active';
                if (req.body.password && req.body.password.trim().length >= 6) {
                    existingUser.password = req.body.password.trim();
                }
                await existingUser.save();
                employee.onboardingStatus = 'Active';
                await employee.save();
                return res.status(200).json({ 
                    success: true, 
                    message: 'Employee account synchronized and activated.',
                    data: employee 
                });
            }
        }

        // 1. Determine staff password & email
        const staffPassword = req.body.password?.trim() || (employee.phoneNumber ? employee.phoneNumber.toString().trim() : 'MioPassword123!');
        const cleanId = employee.employeeId.toLowerCase().replace(/[^a-z0-9]/g, '');
        const staffEmail = employee.email || `${cleanId}@staff.mioandco.co`;
        
        // Ensure role exists in userSchema
        let role = employee.employmentDetails?.designation || 'Reception Staff';
        
        // Check if a user with same email or employeeId already exists
        let user = await User.findOne({
            $or: [
                { email: staffEmail },
                { employeeId: employee.employeeId }
            ]
        });

        const fullName = [employee.firstName, employee.lastName].filter(Boolean).join(' ').trim() || employee.firstName;

        if (user) {
            user.employeeId = employee.employeeId;
            user.name = fullName;
            user.phoneNumber = employee.phoneNumber;
            user.role = role;
            user.status = 'Active';
            user.password = staffPassword;
            await user.save();
        } else {
            user = await User.create({
                name: fullName,
                email: staffEmail,
                employeeId: employee.employeeId,
                password: staffPassword,
                role: role,
                phoneNumber: employee.phoneNumber,
                status: 'Active'
            });
        }

        // 2. Link back to EmployeeProfile and update status
        employee.userAccount = user._id;
        employee.onboardingStatus = 'Active';
        await employee.save();

        res.status(200).json({ 
            success: true, 
            message: `Employee activated successfully! Staff can sign in using Employee ID (${employee.employeeId}) and password.`,
            data: employee 
        });

    } catch (error) {
        console.error('Activation Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

// @desc    Delete employee profile and linked user account
// @route   DELETE /api/v1/hr/employees/:id
// @access  Private (Super Admin / Admin / HR Manager)
exports.deleteEmployee = async (req, res) => {
    try {
        const employee = await EmployeeProfile.findById(req.params.id);
        if (!employee) return res.status(404).json({ success: false, message: 'Employee not found' });

        if (employee.userAccount) {
            await User.findByIdAndDelete(employee.userAccount);
        }

        await EmployeeProfile.findByIdAndDelete(req.params.id);

        res.status(200).json({ success: true, message: 'Employee deleted successfully' });
    } catch (error) {
        console.error('Delete Employee Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
};

