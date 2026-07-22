import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import User from "../models/User.js";
import Couple from "../models/Couple.js";
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { generatePartnerCode, generateUserId } from "../utils/partnerCode.js";
import { getCouplePremiumStatus } from "../utils/couplePremium.js";

const router = Router();

// Apple JWKS client for verifying Apple identity tokens
const appleJwksClient = jwksClient({
    jwksUri: "https://appleid.apple.com/auth/keys",
    cache: true,
    cacheMaxAge: 86400000, // 24 hours
});

// Google Client IDs - UPDATE THESE with your actual client IDs
const GOOGLE_CLIENT_ID_ANDROID = process.env.GOOGLE_CLIENT_ID_ANDROID || "971652730552-1g49usqdnhu2dc1rh5lh6p9i7cocov9m.apps.googleusercontent.com";
const GOOGLE_CLIENT_ID_IOS = process.env.GOOGLE_CLIENT_ID_IOS || "971652730552-1g49usqdnhu2dc1rh5lh6p9i7cocov9m.apps.googleusercontent.com";

// Apple Bundle ID - UPDATE THIS with your actual bundle ID
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "com.thousandways.love";

const VALID_PLATFORMS = new Set(["ios", "android", "web"]);

const normalizePlatform = (platform) => (
    typeof platform === "string" && VALID_PLATFORMS.has(platform) ? platform : "unknown"
);

const applyDeviceInfo = (user, { platform, timezone, appVersion, appBuildNumber }) => {
    user.platform = normalizePlatform(platform);
    if (typeof timezone === "string" && timezone.trim()) {
        user.timezone = timezone.trim();
    }
    if (typeof appVersion === "string" && appVersion.trim()) {
        user.appVersion = appVersion.trim();
    }
    if (appBuildNumber !== undefined) {
        const parsedBuildNumber = Number.parseInt(appBuildNumber, 10);
        if (Number.isFinite(parsedBuildNumber)) {
            user.appBuildNumber = parsedBuildNumber;
        }
    }
    user.deviceInfoUpdatedAt = new Date();
};

const getRelationshipStartDateStateForUser = async (user) => {
    if (!user?.partnerId) {
        return {
            relationshipStartDate: user?.pendingRelationshipStartDate || null,
            pendingRelationshipStartDate: user?.pendingRelationshipStartDate || null,
            shouldAskRelationshipStartDate: false,
        };
    }

    const couple = await Couple.findByPartner(user._id);
    return {
        relationshipStartDate: couple?.relationshipStartDate || user?.pendingRelationshipStartDate || null,
        pendingRelationshipStartDate: user?.pendingRelationshipStartDate || null,
        shouldAskRelationshipStartDate: !!(
            couple
            && !couple.relationshipStartDate
            && couple.relationshipStartDatePromptUserId?.toString() === user._id.toString()
        ),
    };
};

// Google authentication route
router.post("/google/loginSignUp", async (req, res) => {

    try {
        const { token, platform, timezone, appVersion, appBuildNumber } = req.body;



        if (!token) {
            return res.status(400).json({ error: "Token is required" });
        }

        // Select client ID based on platform
        const clientId = platform === "android" ? GOOGLE_CLIENT_ID_ANDROID : GOOGLE_CLIENT_ID_IOS;
        const client = new OAuth2Client(clientId);

        // Verify the token
        const ticket = await client.verifyIdToken({
            idToken: token,
            audience: clientId,
        });

        const payload = ticket.getPayload();

        // Check if user exists
        let user = await User.findOne({ email: payload.email });

        if (!user) {
            // Pre-generate user ID for partner code
            const userId = generateUserId();
            const partnerCode = generatePartnerCode(userId);

            // Create new user with pre-generated ID and partner code
            user = await User.create({
                _id: userId,
                email: payload.email,
                name: payload.name,
                partnerCode,
                platform: normalizePlatform(platform),
                timezone: typeof timezone === "string" && timezone.trim() ? timezone.trim() : undefined,
                appVersion: typeof appVersion === "string" && appVersion.trim() ? appVersion.trim() : undefined,
                appBuildNumber: Number.isFinite(Number.parseInt(appBuildNumber, 10)) ? Number.parseInt(appBuildNumber, 10) : undefined,
                deviceInfoUpdatedAt: new Date(),
            });
        } else {
            applyDeviceInfo(user, { platform, timezone, appVersion, appBuildNumber });
            await user.save();
        }

        // Compute couple premium status
        const couplePremium = await getCouplePremiumStatus(user);
        const relationshipStartDateState = await getRelationshipStartDateStateForUser(user);

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                partnerId: user.partnerId,
                partnerUsername: user.partnerUsername,
                connectionDate: user.connectionDate,
                partnerCode: user.partnerCode,
                nickname: user.nickname,
                relationshipStartDate: relationshipStartDateState.relationshipStartDate,
                pendingRelationshipStartDate: relationshipStartDateState.pendingRelationshipStartDate,
                shouldAskRelationshipStartDate: relationshipStartDateState.shouldAskRelationshipStartDate,
                timezone: user.timezone,
                platform: user.platform,
                isPremium: couplePremium.isPremium,
                premiumExpiresAt: couplePremium.premiumExpiresAt,
                premiumPlan: couplePremium.premiumPlan,
                premiumWillRenew: couplePremium.premiumWillRenew,
                premiumCancelledAt: couplePremium.premiumCancelledAt,
                premiumSource: couplePremium.premiumSource,
                premiumOwnerUserId: couplePremium.premiumOwnerUserId,
                subscriptionStatus: couplePremium.subscriptionStatus,
                subscriptionBillingIssueAt: couplePremium.subscriptionBillingIssueAt,
            },
        });
    } catch (error) {
        res.status(401).json({
            success: false,
            error: "Invalid token",
        });
    }
});

// Helper function to get Apple signing key
function getAppleSigningKey(header, callback) {
    appleJwksClient.getSigningKey(header.kid, (err, key) => {
        if (err) {
            callback(err);
        } else {
            const signingKey = key.getPublicKey();
            callback(null, signingKey);
        }
    });
}

// Apple authentication route
router.post("/apple/loginSignUp", async (req, res) => {
    try {
        const { idToken, displayName, email: providedEmail, platform, timezone, appVersion, appBuildNumber } = req.body;

        if (!idToken) {
            return res.status(400).json({ error: "Identity token is required" });
        }

        // Verify the Apple identity token
        const decodedToken = await new Promise((resolve, reject) => {
            jwt.verify(
                idToken,
                getAppleSigningKey,
                {
                    algorithms: ["RS256"],
                    issuer: "https://appleid.apple.com",
                    audience: APPLE_BUNDLE_ID,
                },
                (err, decoded) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(decoded);
                    }
                }
            );
        });

        // Extract email from token or use provided email
        const email = decodedToken.email || providedEmail;
        const appleUserId = decodedToken.sub;

        if (!email) {
            return res.status(400).json({
                error: "Email is required. Please try signing in again."
            });
        }

        // Check if user exists by email or Apple user ID
        let user = await User.findOne({
            $or: [{ email }, { appleUserId }]
        });

        if (!user) {
            // Pre-generate user ID for partner code
            const userId = generateUserId();
            const partnerCode = generatePartnerCode(userId);

            // Create new user with pre-generated ID and partner code
            user = await User.create({
                _id: userId,
                email,
                name: displayName || "User",
                appleUserId,
                partnerCode,
                platform: normalizePlatform(platform),
                timezone: typeof timezone === "string" && timezone.trim() ? timezone.trim() : undefined,
                appVersion: typeof appVersion === "string" && appVersion.trim() ? appVersion.trim() : undefined,
                appBuildNumber: Number.isFinite(Number.parseInt(appBuildNumber, 10)) ? Number.parseInt(appBuildNumber, 10) : undefined,
                deviceInfoUpdatedAt: new Date(),
            });
        } else {
            // Update existing user with Apple ID
            if (!user.appleUserId) {
                user.appleUserId = appleUserId;
            }
            applyDeviceInfo(user, { platform, timezone, appVersion, appBuildNumber });
            await user.save();
        }

        // Compute couple premium status
        const couplePremium = await getCouplePremiumStatus(user);
        const relationshipStartDateState = await getRelationshipStartDateStateForUser(user);

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                avatar: user.avatar,
                partnerId: user.partnerId,
                partnerUsername: user.partnerUsername,
                connectionDate: user.connectionDate,
                partnerCode: user.partnerCode,
                nickname: user.nickname,
                relationshipStartDate: relationshipStartDateState.relationshipStartDate,
                pendingRelationshipStartDate: relationshipStartDateState.pendingRelationshipStartDate,
                shouldAskRelationshipStartDate: relationshipStartDateState.shouldAskRelationshipStartDate,
                timezone: user.timezone,
                platform: user.platform,
                isPremium: couplePremium.isPremium,
                premiumExpiresAt: couplePremium.premiumExpiresAt,
                premiumPlan: couplePremium.premiumPlan,
                premiumWillRenew: couplePremium.premiumWillRenew,
                premiumCancelledAt: couplePremium.premiumCancelledAt,
                premiumSource: couplePremium.premiumSource,
                premiumOwnerUserId: couplePremium.premiumOwnerUserId,
                subscriptionStatus: couplePremium.subscriptionStatus,
                subscriptionBillingIssueAt: couplePremium.subscriptionBillingIssueAt,
            },
        });
    } catch (error) {
        console.error("Error verifying Apple token:", error.message);
        res.status(401).json({
            success: false,
            error: "Invalid token",
        });
    }
});

export default router;
