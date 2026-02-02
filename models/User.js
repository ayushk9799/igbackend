import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true,
        trim: true,
    },
    name: {
        type: String,
        trim: true,
    },
    nickname: {
        type: String,
        trim: true,
    },
    avatar: {
        type: String,
        default: null,
    },
    gender: {
        type: String,
        enum: ['male', 'female', 'other'],
    },
    age: {
        type: Number,
    },
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    partnerUsername: {
        type: String,
    },
    connectionDate: {
        type: Date,
    },
    fcmToken: {
        type: String,
    },
    appleUserId: {
        type: String,
    },
    partnerCode: {
        type: String,
        unique: true,
        sparse: true, // Allow null values while maintaining uniqueness
    },
    // Real-time sync fields
    currentMood: {
        emoji: { type: String, default: '😊' },
        label: { type: String, default: 'Happy' },
        updatedAt: { type: Date },
    },
    // Last scribble received from partner (for offline delivery)
    lastScribble: {
        paths: { type: Array, default: [] }, // Array of {d, color, strokeWidth}
        fromUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        fromUserName: { type: String },
        receivedAt: { type: Date },
    },
    isOnline: {
        type: Boolean,
        default: false,
    },
    lastSeen: {
        type: Date,
    },
}, {
    timestamps: true,
});

const User = mongoose.model('User', userSchema);

export default User;
