import mongoose from 'mongoose';

const candidatePairSchema = new mongoose.Schema({
    localType: { type: String, enum: ['host', 'srflx', 'prflx', 'relay', 'unknown'] },
    remoteType: { type: String, enum: ['host', 'srflx', 'prflx', 'relay', 'unknown'] },
    protocol: { type: String, enum: ['udp', 'tcp', 'unknown'] },
}, { _id: false });

const callDiagnosticSchema = new mongoose.Schema({
    callId: { type: String, required: true, index: true },
    reporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    platform: { type: String, enum: ['ios', 'android', 'unknown'], default: 'unknown' },
    appVersion: { type: String, maxlength: 40 },
    outcome: {
        type: String,
        enum: ['connected', 'failed', 'rejected', 'cancelled', 'missed', 'ended'],
        required: true,
    },
    failureCode: {
        type: String,
        enum: [
            'permission_denied',
            'partner_rejected',
            'ring_timeout',
            'signaling_timeout',
            'offer_failed',
            'answer_failed',
            'ice_gathering_failed',
            'ice_connectivity_failed_no_relay',
            'media_track_failed',
            'socket_disconnected',
            'remote_ended',
            'unknown',
        ],
    },
    signalingCompleted: { type: Boolean, default: false },
    offerCreated: { type: Boolean, default: false },
    answerReceived: { type: Boolean, default: false },
    localCandidateTypes: [{ type: String, enum: ['host', 'srflx', 'prflx', 'relay', 'unknown'] }],
    remoteCandidateTypes: [{ type: String, enum: ['host', 'srflx', 'prflx', 'relay', 'unknown'] }],
    iceGatheringState: { type: String, maxlength: 40 },
    iceConnectionState: { type: String, maxlength: 40 },
    peerConnectionState: { type: String, maxlength: 40 },
    selectedCandidatePair: candidatePairSchema,
    timeToFirstCandidateMs: { type: Number, min: 0 },
    timeToConnectedMs: { type: Number, min: 0 },
    roundTripTimeMs: { type: Number, min: 0 },
    packetsLost: { type: Number, min: 0 },
    outboundAudioBytes: { type: Number, min: 0 },
    outboundVideoBytes: { type: Number, min: 0 },
    inboundAudioBytes: { type: Number, min: 0 },
    inboundVideoBytes: { type: Number, min: 0 },
    videoFramesEncoded: { type: Number, min: 0 },
    videoFramesDecoded: { type: Number, min: 0 },
    localAudioTrackPresent: { type: Boolean },
    localVideoTrackPresent: { type: Boolean },
    localAudioTrackEnabled: { type: Boolean },
    localVideoTrackEnabled: { type: Boolean },
    remoteAudioTrackPresent: { type: Boolean },
    remoteVideoTrackPresent: { type: Boolean },
    startedAt: { type: Date },
    endedAt: { type: Date },
}, { timestamps: true });

callDiagnosticSchema.index({ callId: 1, reporterId: 1 }, { unique: true });
callDiagnosticSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

export default mongoose.model('CallDiagnostic', callDiagnosticSchema);
