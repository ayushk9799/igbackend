import mongoose from 'mongoose';

const subscriptionEventSchema = new mongoose.Schema({
    revenueCatEventId: {
        type: String,
        required: true,
        unique: true,
        index: true,
    },
    revenueCatAppUserId: {
        type: String,
        trim: true,
        lowercase: true,
        index: true,
    },
    ownerUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    subscriptionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
        default: null,
    },
    type: {
        type: String,
        required: true,
        index: true,
    },
    eventTimestamp: {
        type: Date,
        required: true,
        index: true,
    },
    productId: String,
    entitlementIds: [String],
    expirationAt: Date,
    cancellationReason: String,
    environment: {
        type: String,
        enum: ['production', 'sandbox', 'unknown'],
        default: 'unknown',
    },
    processed: {
        type: Boolean,
        default: false,
        index: true,
    },
    ignoredReason: String,
    processedAt: Date,
    processingError: String,
    payload: mongoose.Schema.Types.Mixed,
}, {
    timestamps: true,
});

export default mongoose.model('SubscriptionEvent', subscriptionEventSchema);
