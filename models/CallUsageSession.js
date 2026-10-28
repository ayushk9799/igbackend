import mongoose from 'mongoose';

// Separate from expiring call diagnostics: one durable record per connected call.
const schema = new mongoose.Schema({
    callId: { type: String, required: true, unique: true },
    coupleId: { type: String, required: true, index: true },
    participantIds: { type: [String], required: true, index: true },
    periodKey: { type: String, required: true },
    charged: { type: Boolean, required: true },
    startedAt: { type: Date, required: true },
    deadlineAt: Date,
    endedAt: { type: Date, default: null },
    endReason: String,
}, { timestamps: true });
schema.index({ coupleId: 1, periodKey: 1, charged: 1 });
export default mongoose.model('CallUsageSession', schema);
