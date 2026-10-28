const DEFAULT_STUN_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

let cachedIceServers = null;
let cacheExpiresAt = 0;
let cachedKeyId;
let cachedApiToken;

export const getIceTransportPolicy = () => {
    const policy = (process.env.WEBRTC_ICE_TRANSPORT_POLICY || 'all').trim().toLowerCase();
    if (!['all', 'relay'].includes(policy)) throw new Error('WEBRTC_ICE_TRANSPORT_POLICY must be all or relay');
    return policy;
};

const hasTurn = (servers) => servers.some(server => (
    server.username && server.credential
    && [server.urls].flat().some(url => /^turns?:/i.test(url || ''))
));
const turnUnavailable = () => Object.assign(new Error('TURN relay is unavailable. Please try again later.'), { code: 'TURN_UNAVAILABLE' });

// Fetch short-lived credentials server-side. Relay-only mode never falls back
// to STUN/direct connections, including during a provider failure or expiry.
export async function getIceServers() {
    const relayOnly = getIceTransportPolicy() === 'relay';
    const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
    const apiToken = process.env.CLOUDFLARE_TURN_API_TOKEN;
    const validCache = () => cachedIceServers && Date.now() < cacheExpiresAt
        && cachedKeyId === keyId && cachedApiToken === apiToken;
    const fallback = () => {
        if (validCache() && (!relayOnly || hasTurn(cachedIceServers))) return cachedIceServers;
        if (relayOnly) throw turnUnavailable();
        return DEFAULT_STUN_SERVERS;
    };
    if (!keyId || !apiToken) return fallback();
    if (validCache() && Date.now() < cacheExpiresAt - 10 * 60 * 1000) return cachedIceServers;

    try {
        const ttlSeconds = 86400;
        const response = await fetch(
            `https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ ttl: ttlSeconds }),
                signal: AbortSignal.timeout(10000),
            },
        );
        if (!response.ok) throw new Error(`Cloudflare credential API returned HTTP ${response.status}`);
        const data = await response.json();
        if (!Array.isArray(data.iceServers) || !hasTurn(data.iceServers)) {
            throw new Error('Cloudflare did not return usable TURN credentials');
        }
        cachedIceServers = data.iceServers;
        cachedKeyId = keyId;
        cachedApiToken = apiToken;
        cacheExpiresAt = Date.now() + ttlSeconds * 1000;
        return cachedIceServers;
    } catch (error) {
        console.error('Cloudflare TURN credential request failed:', error.message);
        return fallback();
    }
}

export const getIceConfiguration = async () => ({
    iceServers: await getIceServers(),
    iceTransportPolicy: getIceTransportPolicy(),
});

export default { getIceServers, getIceConfiguration, getIceTransportPolicy };
