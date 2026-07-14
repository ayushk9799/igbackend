import mongoose from 'mongoose';

const memorySchema = new mongoose.Schema({
    coupleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Couple',
        required: true,
        index: true,
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    entryType: {
        type: String,
        enum: ['memory', 'special_date', 'photo', 'moment', 'date'],
        default: 'memory',
        index: true,
    },
    iconKey: {
        type: String,
        default: 'ring',
        maxlength: 40,
        trim: true,
    },
    title: {
        type: String,
        default: '',
        maxlength: 80,
        trim: true,
    },
    imageUrl: {
        type: String,
        trim: true,
    },
    fileKey: {
        type: String,
        trim: true,
    },
    width: {
        type: Number,
        min: 1,
    },
    height: {
        type: Number,
        min: 1,
    },
    capturedAt: {
        type: Date,
        required: true,
        index: true,
    },
    capturedAtSource: {
        type: String,
        enum: ['exif', 'manual', 'upload_time'],
        default: 'upload_time',
    },
    caption: {
        type: String,
        default: '',
        maxlength: 500,
        trim: true,
    },
    deletedAt: {
        type: Date,
        default: null,
        index: true,
    },
}, {
    timestamps: true,
});

memorySchema.index({ coupleId: 1, capturedAt: -1, _id: -1 });
memorySchema.index({ coupleId: 1, deletedAt: 1, capturedAt: -1 });

const Memory = mongoose.model('Memory', memorySchema);

export default Memory;
