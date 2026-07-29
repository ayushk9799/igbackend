export const ONBOARDING_VERSION = 1;

export const ONBOARDING_STEPS = new Set([
    'intro',
    'avatar',
    'notifications',
    'partner',
    'premium',
    'completed',
]);

const timestampFields = {
    intro: 'introCompletedAt',
    avatar: 'avatarDecisionAt',
    notifications: 'notificationPromptedAt',
    partner: 'partnerStepCompletedAt',
    premium: 'premiumOfferShownAt',
    completed: 'completedAt',
};

export const serializeOnboarding = (user) => ({
    version: user?.onboarding?.version || ONBOARDING_VERSION,
    introCompletedAt: user?.onboarding?.introCompletedAt || null,
    nicknameCompletedAt: user?.onboarding?.nicknameCompletedAt || null,
    avatarDecisionAt: user?.onboarding?.avatarDecisionAt || null,
    notificationPromptedAt: user?.onboarding?.notificationPromptedAt || null,
    partnerStepCompletedAt: user?.onboarding?.partnerStepCompletedAt || null,
    premiumOfferShownAt: user?.onboarding?.premiumOfferShownAt || null,
    completedAt: user?.onboarding?.completedAt || null,
});

export const initializeOnboarding = (user, { isNewUser = false } = {}) => {
    const now = new Date();
    const hasVersion = Number(user?.onboarding?.version) > 0;

    if (!user.onboarding) user.onboarding = {};
    user.onboarding.version = ONBOARDING_VERSION;

    if (isNewUser) {
        user.onboarding.introCompletedAt ||= now;
        return;
    }

    if (!hasVersion) {
        user.onboarding.introCompletedAt ||= now;
        if (user.nickname) {
            user.onboarding.nicknameCompletedAt ||= now;
            user.onboarding.avatarDecisionAt ||= now;
            user.onboarding.notificationPromptedAt ||= now;
        }
        if (user.partnerId) {
            user.onboarding.partnerStepCompletedAt ||= now;
            user.onboarding.completedAt ||= now;
        }
    }
};

export const markOnboardingStep = (user, step, at = new Date()) => {
    if (!ONBOARDING_STEPS.has(step)) throw new Error('Invalid onboarding step');
    if (!user.onboarding) user.onboarding = {};
    user.onboarding.version = ONBOARDING_VERSION;
    user.onboarding[timestampFields[step]] ||= at;
};

