const mongoose = require('mongoose');
const User = require('./models/User');

mongoose.connect('mongodb://127.0.0.1:27017/mionco', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(async () => {
    const user = await User.findOne({});
    console.log("User:", user);
    if(user) {
        console.log("User role typeof:", typeof user.role, "value:", user.role);
    }
    process.exit(0);
}).catch(err => {
    console.error(err);
    process.exit(1);
});
