const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('../models/User');

// Load env vars
dotenv.config();

const seedSuperAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        // Check if Super Admin exists
        const adminExists = await User.findOne({ email: 'admin@gmail.com' });

        if (adminExists) {
            console.log('Super Admin already exists.');
        } else {
            const superAdmin = await User.create({
                name: 'Super Admin',
                email: 'admin@gmail.com',
                password: 'admin@123',
                role: 'Super Admin',
                status: 'Active',
            });
            console.log('Super Admin account created successfully.');
        }

        process.exit();
    } catch (error) {
        console.error('Error seeding Super Admin:', error);
        process.exit(1);
    }
};

seedSuperAdmin();
