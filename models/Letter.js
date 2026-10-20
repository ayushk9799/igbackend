import mongoose from 'mongoose';

export const LETTER_BIRD_IDS = Object.freeze(['penguin', 'pigeon', 'swallow', 'falcon']);
export const LETTER_STATUSES = Object.freeze(['flying', 'delivered', 'recalled']);
export const LETTER_BODY_MAX_LENGTH = 1000;

// City-level points only (rounded before saving), never exact positions.
const routePointSchema = new mongoose.Schema({
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
}, { _id: false });

const letterSchema = new mongoose.Schema({
    coupleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Couple',
        required: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    recipientId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    body: {
        type: String,
        required: true,
        trim: true,
        maxlength: LETTER_BODY_MAX_LENGTH,
    },
    bird: {
        type: String,
        enum: LETTER_BIRD_IDS,
        required: true,
    },
    status: {
        type: String,
        enum: LETTER_STATUSES,
        default: 'flying',
    },
    sentAt: { type: Date, required: true },
    // Fixed by the server from the bird's travel time when the letter is sent.
    deliverAt: { type: Date, required: true },
    deliveredAt: { type: Date, default: null },
    readAt: { type: Date, default: null },
    recalledAt: { type: Date, default: null },
    route: {
        from: { type: routePointSchema, default: null },
        to: { type: routePointSchema, default: null },
        distanceKm: { type: Number, default: null },
        // True when either partner has no shared location, so the app draws
        // a decorative path instead of real cities.
        isDecorative: { type: Boolean, default: true },
    },
}, {
    timestamps: true,
});

letterSchema.index({ coupleId: 1, sentAt: -1 });
// Used by the delivery check to find letters that are due.
letterSchema.index({ status: 1, deliverAt: 1 });
letterSchema.index({ senderId: 1, status: 1 });

const Letter = mongoose.model('Letter', letterSchema);

export default Letter;
