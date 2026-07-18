import crypto from 'node:crypto';

const getSigningSecret = (env = process.env) => {
    const secret = env.SCRIBBLE_WIDGET_SIGNING_SECRET?.trim();
    if (!secret) {
        throw new Error('SCRIBBLE_WIDGET_SIGNING_SECRET is not configured');
    }
    return secret;
};

const getSignaturePayload = (coupleId, recipientId) => (
    `${String(coupleId)}:${String(recipientId)}`
);

export const createCurrentScribbleSignature = (
    coupleId,
    recipientId,
    env = process.env
) => crypto
    .createHmac('sha256', getSigningSecret(env))
    .update(getSignaturePayload(coupleId, recipientId))
    .digest('hex');

export const verifyCurrentScribbleSignature = (
    coupleId,
    recipientId,
    signature,
    env = process.env
) => {
    if (typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) {
        return false;
    }

    const expected = createCurrentScribbleSignature(coupleId, recipientId, env);
    return crypto.timingSafeEqual(
        Buffer.from(signature.toLowerCase(), 'hex'),
        Buffer.from(expected, 'hex')
    );
};
