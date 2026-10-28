import { LETTER_BODY_MAX_LENGTH } from '../../models/Letter.js';

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Travel time is fixed per bird, never by distance, so couples who live
// close together still get the full wait.
export const LETTER_BIRDS = Object.freeze([
    Object.freeze({ id: 'penguin', name: 'Penguin Post', travelMs: 48 * HOUR_MS, premium: false }),
    Object.freeze({ id: 'pigeon', name: 'Pigeon', travelMs: 12 * HOUR_MS, premium: false }),
    Object.freeze({ id: 'swallow', name: 'Swallow', travelMs: 3 * HOUR_MS, premium: true }),
    Object.freeze({ id: 'falcon', name: 'Falcon', travelMs: 45 * MINUTE_MS, premium: true }),
]);

export const MAX_LETTERS_IN_FLIGHT_PER_SENDER = 10;

export class LetterError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export const getBird = (birdId) => LETTER_BIRDS.find((bird) => bird.id === birdId) || null;

export const computeDeliverAt = (birdId, sentAt = new Date()) => {
    const bird = getBird(birdId);
    if (!bird) throw new LetterError(400, 'invalid_bird', 'Unknown bird');
    return new Date(sentAt.getTime() + bird.travelMs);
};

export const normalizeLetterBody = (value) => {
    const body = typeof value === 'string' ? value.trim() : '';
    if (!body) throw new LetterError(400, 'empty_letter', 'Write something before sending');
    if (body.length > LETTER_BODY_MAX_LENGTH) {
        throw new LetterError(400, 'letter_too_long', `Letters can be up to ${LETTER_BODY_MAX_LENGTH} characters`);
    }
    return body;
};

const isValidPoint = (latitude, longitude) => (
    Number.isFinite(latitude) && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180
);

// The exact spot a phone sent with a letter, or null when it sent none (or nonsense).
export const parseLetterLocation = (value) => {
    const latitude = Number(value?.latitude);
    const longitude = Number(value?.longitude);
    return value && isValidPoint(latitude, longitude) ? { latitude, longitude } : null;
};

export const toCityPoint = (user) => {
    const latitude = Number(user?.location?.latitude);
    const longitude = Number(user?.location?.longitude);
    if (!user?.locationSharingEnabled || !isValidPoint(latitude, longitude)) {
        return null;
    }
    // Exact, so each partner and each bird sit where they really are.
    return { latitude, longitude };
};

export const haversineKm = (from, to) => {
    const toRadians = (degrees) => degrees * Math.PI / 180;
    const earthRadiusKm = 6371;
    const dLat = toRadians(to.latitude - from.latitude);
    const dLng = toRadians(to.longitude - from.longitude);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(from.latitude)) * Math.cos(toRadians(to.latitude)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
};

// The bird flies from where the sender was when they sent it (sentFrom), or their saved
// location, to the recipient's saved location. A missing end keeps the route decorative; the
// end that is known is kept so the route can be completed later.
export const buildLetterRoute = (sender, recipient, sentFrom = null, knownTo = null) => {
    const from = sentFrom || toCityPoint(sender);
    const to = knownTo || toCityPoint(recipient);
    if (!from || !to) {
        return { from: from || null, to: to || null, distanceKm: null, isDecorative: true };
    }
    return { from, to, distanceKm: Math.round(haversineKm(from, to)), isDecorative: false };
};

export const getFlightProgress = (letter, now = new Date()) => {
    if (letter.status !== 'flying') return letter.status === 'delivered' ? 1 : 0;
    const start = new Date(letter.sentAt).getTime();
    const end = new Date(letter.deliverAt).getTime();
    if (end <= start) return 1;
    return Math.min(1, Math.max(0, (now.getTime() - start) / (end - start)));
};

const idOf = (value) => String(value?._id || value || '');

/**
 * Shape a letter for one viewer. The recipient never receives the text
 * before the letter is delivered, so it cannot be read early from the API.
 */
export const serializeLetter = (letter, viewerId, now = new Date()) => {
    const viewer = String(viewerId);
    const isSender = idOf(letter.senderId) === viewer;
    const canReadBody = isSender || letter.status === 'delivered';

    return {
        id: idOf(letter._id),
        direction: isSender ? 'outgoing' : 'incoming',
        senderId: idOf(letter.senderId),
        recipientId: idOf(letter.recipientId),
        bird: letter.bird,
        paper: letter.paper || null,
        textSize: letter.textSize || null,
        status: letter.status,
        body: canReadBody ? letter.body : null,
        sentAt: letter.sentAt,
        deliverAt: letter.deliverAt,
        deliveredAt: letter.deliveredAt || null,
        readAt: letter.readAt || null,
        recalledAt: letter.recalledAt || null,
        progress: getFlightProgress(letter, now),
        route: {
            from: letter.route?.from || null,
            to: letter.route?.to || null,
            distanceKm: letter.route?.distanceKm ?? null,
            isDecorative: letter.route?.isDecorative !== false,
        },
    };
};
