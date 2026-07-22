import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
    ownerUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    revenueCatAppUserId: {
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        index: true,
    },
    entitlementId: {
        type: String,
        required: true,
        trim: true,
    },
    productId: {
        type: String,
        default: null,
    },
    originalTransactionId: {
        type: String,
        default: null,
        index: true,
    },
    status: {
        type: String,
        enum: ['active', 'cancelled', 'billing_issue', 'paused', 'expired', 'revoked', 'unknown'],
        default: 'unknown',
        index: true,
    },
    givesAccess: {
        type: Boolean,
        default: false,
        index: true,
    },
    willRenew: {
        type: Boolean,
        default: null,
    },
    purchasedAt: Date,
    expiresAt: {
        type: Date,
        default: null,
        index: true,
    },
    cancelledAt: Date,
    billingIssueAt: Date,
    environment: {
        type: String,
        enum: ['production', 'sandbox', 'unknown'],
        default: 'unknown',
    },
    source: {
        type: String,
        enum: ['webhook', 'api', 'legacy'],
        default: 'webhook',
    },
    verificationStatus: {
        type: String,
        enum: ['verified', 'pending', 'failed'],
        default: 'verified',
    },
    lastEventId: String,
    lastEventAt: {
        type: Date,
        default: null,
        index: true,
    },
    lastVerifiedAt: Date,
    lastApiVerifiedAt: Date,
    lastMissingAt: Date,
    consecutiveMissingCount: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

subscriptionSchema.index(
    { ownerUserId: 1, entitlementId: 1, environment: 1 },
    { unique: true },
);

export default mongoose.model('Subscription', subscriptionSchema);
