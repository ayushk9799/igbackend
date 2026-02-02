import mongoose from 'mongoose';

const coupleSchema = new mongoose.Schema({
    // Both partners (sorted by ID for consistent lookups)
    partner1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    partner2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Connection date when they paired
    connectionDate: {
        type: Date,
        required: true,
        default: Date.now,
    },
    // Status of the relationship
    status: {
        type: String,
        enum: ['active', 'unpaired'],
        default: 'active',
    },
    // Date when unpaired (if applicable)
    unpairedDate: {
        type: Date,
    },
}, {
    timestamps: true,
});

// Static method to generate a consistent coupleId from two user IDs
coupleSchema.statics.generateCoupleId = function (userId1, userId2) {
    const ids = [userId1.toString(), userId2.toString()].sort();
    return ids.join('_');
};

// Static method to find active couple by either partner
coupleSchema.statics.findByPartner = function (userId) {
    return this.findOne({
        status: 'active',
        $or: [
            { partner1: userId },
            { partner2: userId }
        ]
    });
};

// Static method to find couple by both partners
coupleSchema.statics.findByPartners = function (userId1, userId2) {
    const [p1, p2] = [userId1.toString(), userId2.toString()].sort();
    return this.findOne({
        partner1: p1,
        partner2: p2,
        status: 'active'
    });
};

// Virtual coupleId field
coupleSchema.virtual('coupleId').get(function () {
    return `${this.partner1}_${this.partner2}`;
});

// Ensure JSON includes virtuals
coupleSchema.set('toJSON', { virtuals: true });
coupleSchema.set('toObject', { virtuals: true });

// Index for efficient lookups
coupleSchema.index({ partner1: 1, partner2: 1 }, { unique: true });
coupleSchema.index({ partner1: 1, status: 1 });
coupleSchema.index({ partner2: 1, status: 1 });
coupleSchema.index({ status: 1 });

const Couple = mongoose.model('Couple', coupleSchema);

export default Couple;
