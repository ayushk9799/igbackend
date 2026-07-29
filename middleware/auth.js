import jwt from 'jsonwebtoken';

const getSessionSecret = () => (
    process.env.APP_JWT_SECRET
    || process.env.JWT_SECRET
    || (process.env.NODE_ENV !== 'production'
        ? 'penguin-local-development-session-secret'
        : null)
);

export const createSessionToken = (user) => {
    const secret = getSessionSecret();
    if (!secret) throw new Error('APP_JWT_SECRET is not configured');

    return jwt.sign(
        {
            sub: user._id.toString(),
            email: user.email,
            type: 'app_session',
        },
        secret,
        {
            algorithm: 'HS256',
            expiresIn: '30d',
            issuer: 'penguin-api',
            audience: 'penguin-mobile',
        },
    );
};

export const requireAuth = (req, res, next) => {
    const secret = getSessionSecret();
    if (!secret) {
        return res.status(503).json({ success: false, error: 'Authentication is not configured' });
    }

    const authorization = req.headers.authorization || '';
    const [scheme, token] = authorization.split(' ');
    if (scheme !== 'Bearer' || !token) {
        return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    try {
        const payload = jwt.verify(token, secret, {
            algorithms: ['HS256'],
            issuer: 'penguin-api',
            audience: 'penguin-mobile',
        });
        if (payload.type !== 'app_session' || !payload.sub) throw new Error('Invalid session token');
        req.auth = { userId: String(payload.sub), email: payload.email || null };
        next();
    } catch {
        return res.status(401).json({ success: false, error: 'Session expired or invalid' });
    }
};

export const requireSelf = (req, res, next) => {
    const requestedUserId = req.body?.userId || req.params?.userId;
    if (!requestedUserId || String(requestedUserId) !== req.auth?.userId) {
        return res.status(403).json({
            success: false,
            error: 'You cannot access another user account',
        });
    }
    next();
};
