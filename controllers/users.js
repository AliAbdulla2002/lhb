const User = require('../models/user')

const index = async (req, res) => {
   const users = await User.find()
   res.json(users)
}

module.exports = {
    index,
}