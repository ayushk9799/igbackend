import express from 'express';

const router = express.Router();

const DEFAULT_ANDROID_STORE_URL = 'market://details?id=com.thousandways.love';
const DEFAULT_ANDROID_WEB_STORE_URL = 'https://play.google.com/store/apps/details?id=com.thousandways.love';

const parseInteger = (value, fallback = 0) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value, fallback = true) => {
    if (value === undefined) return fallback;
    return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
};

const normalizePlatform = (platform) => (
    platform === 'ios' || platform === 'android' ? platform : 'unknown'
);

const getVersionPolicy = (platform) => {
    if (platform === 'android') {
        const minimumBuild = parseInteger(process.env.ANDROID_MIN_SUPPORTED_BUILD, 0);
        const latestBuild = parseInteger(process.env.ANDROID_LATEST_BUILD, minimumBuild);

        return {
            platform,
            minimumBuild,
            latestBuild: Math.max(latestBuild, minimumBuild),
            forceUpdateEnabled: parseBoolean(process.env.ANDROID_FORCE_UPDATE_ENABLED, true),
            storeUrl: process.env.ANDROID_STORE_URL || DEFAULT_ANDROID_STORE_URL,
            webStoreUrl: process.env.ANDROID_WEB_STORE_URL || DEFAULT_ANDROID_WEB_STORE_URL,
        };
    }

    if (platform === 'ios') {
        const minimumBuild = parseInteger(process.env.IOS_MIN_SUPPORTED_BUILD, 0);
        const latestBuild = parseInteger(process.env.IOS_LATEST_BUILD, minimumBuild);

        return {
            platform,
            minimumBuild,
            latestBuild: Math.max(latestBuild, minimumBuild),
            forceUpdateEnabled: parseBoolean(process.env.IOS_FORCE_UPDATE_ENABLED, true),
            storeUrl: process.env.IOS_STORE_URL || '',
            webStoreUrl: process.env.IOS_WEB_STORE_URL || process.env.IOS_STORE_URL || '',
        };
    }

    return {
        platform: 'unknown',
        minimumBuild: 0,
        latestBuild: 0,
        forceUpdateEnabled: false,
        storeUrl: '',
        webStoreUrl: '',
    };
};

router.get('/version', (req, res) => {
    const platform = normalizePlatform(req.query.platform);
    const currentBuild = parseInteger(req.query.currentBuild, 0);
    const currentVersion = typeof req.query.currentVersion === 'string' ? req.query.currentVersion : null;
    const policy = getVersionPolicy(platform);
    const updateRequired = policy.forceUpdateEnabled && currentBuild > 0 && currentBuild < policy.minimumBuild;
    const updateAvailable = currentBuild > 0 && currentBuild < policy.latestBuild;

    res.json({
        success: true,
        platform: policy.platform,
        currentBuild,
        currentVersion,
        minimumBuild: policy.minimumBuild,
        latestBuild: policy.latestBuild,
        updateRequired,
        updateAvailable,
        forceUpdate: updateRequired,
        storeUrl: policy.storeUrl,
        webStoreUrl: policy.webStoreUrl,
        title: updateRequired ? 'Penguin has a new update' : 'Penguin has a new update',
        message: updateRequired
            ? 'Penguin has a new update. Please update it to continue.'
            : 'Penguin has a new update available.',
    });
});

export default router;
