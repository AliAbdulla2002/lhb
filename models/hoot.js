const mongoose = require('mongoose')

const commentSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
}, {timestamps: true})

const hootSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
    },
    text: {
        type: String,
        required: true,
    },
    category: {
        type: String,
        enum: ['News', 'Sports', 'Games', 'Movies', 'Music', 'Television', 'Other'],
        default: 'Other',
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    comments: [commentSchema],
}, {timestamps: true})

const Hoot = mongoose.model('Hoot', hootSchema)
module.exports = Hoot