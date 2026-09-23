const DEFAULT_STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

let cachedIceServers = null;
let cacheExpiresAt = 0;

/**
 * Fetches short-lived ICE servers (STUN + TURN) from Cloudflare Calls.
 * Caches credentials to avoid unnecessary HTTP requests.
 */
export async function getIceServers() {
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;

    // If Cloudflare credentials aren't configured, fall back to Google STUN
    if (!keyId || !apiToken) {
        return DEFAULT_STUN_SERVERS;
    }

    const now = Date.now();
    // Return cached servers if still valid (refresh 10 minutes before expiry)
    if (cachedIceServers && now < cacheExpiresAt - 10 * 60 * 1000) {
        return cachedIceServers;
    }

    try {
        const ttlSeconds = 86400; // 24 hours
        const response = await fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ttl: ttlSeconds }),
            }
        );

        if (!response.ok) {
            const errText = await response.text().catch(() => '');
            console.error('Cloudflare TURN API failed:', response.status, errText);
            return cachedIceServers || DEFAULT_STUN_SERVERS;
        }

        const data = await response.json();
        if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
            cachedIceServers = data.iceServers;
            cacheExpiresAt = now + ttlSeconds * 1000;
            return cachedIceServers;
        }

        return cachedIceServers || DEFAULT_STUN_SERVERS;
    } catch (error) {
        console.error('Error fetching Cloudflare ICE servers:', error.message || error);
        return cachedIceServers || DEFAULT_STUN_SERVERS;
    }
}

export default { getIceServers };
