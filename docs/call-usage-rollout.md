# Call usage rollout and enforcement

## Current implementation

The backend now consumes the CALLS_* flags and handles call:connected. Once both
participants report a media connection, it records a durable CallUsageSession and
sends a server deadline. Supported non-Premium clients stop media and open Premium
at expiry; the server also ends the signaling session. Legacy/mixed pairs remain
unrestricted. Exhausted updated pairs are rejected before ringing when the partner
client is known online; otherwise the quota is checked before acceptance, before
WebRTC media negotiation. Both clients must satisfy their own platform flag, minimum build and
callUsageVersion=1. Premium access is verified using the existing couple entitlement.

CALLS_FREE_SECONDS is a shared couple allowance. lifetime persists across calls;
daily and monthly use UTC calendar period keys. Early hangup records actual time;
duplicate connected reports do not reset the timer. Unfinished records after a
server restart conservatively consume elapsed time up to their recorded deadline.
The existing in-memory signaling sessions are not resumed after a server restart.
These records can also be queried by participantIds for user call history.

For the current local three-second test, keep the existing env values and start a
NEW call with updated clients. Verified Premium couples are exempt. Subsequent
calls after exhausting a lifetime allowance expire immediately. To restore the
five-minute quota set CALLS_FREE_SECONDS=300 and restart/redeploy the backend.
Disable each platform switch until that platform has store approval in production.
Blank minimum builds always disable that platform's enforcement.

## Environment

```
CALLS_USAGE_TRACKING_ENABLED=false
CALLS_FREE_SECONDS=300
CALLS_FREE_ALLOWANCE_PERIOD=lifetime
CALLS_PAYWALL_ANDROID_ENABLED=false
CALLS_PAYWALL_ANDROID_MIN_BUILD=
CALLS_PAYWALL_IOS_ENABLED=false
CALLS_PAYWALL_IOS_MIN_BUILD=
```

The intended initial allowance is 300 seconds TOTAL per couple (not per call),
with lifetime as the default. User participation is recorded separately without doubling the
couple's consumed seconds. WEBRTC_ICE_TRANSPORT_POLICY controls transport separately.

## Frontend protocol

Socket authentication and call:start, call:accept, call:getPending include:

```json
{"platform":"android","appVersion":"1.1.4","buildNumber":"14","callUsageVersion":1}
```

These are illustrative version/build values, not the actual release identifiers.
Both participants emit call:connected with callId and the same metadata when their
peer connection connects. The future server must verify membership and handle duplicate
connection/reconnection reports idempotently. Client reports aren't billing proof.

The server broadcasts call:usage-policy to each participant:

```json
{
  "callId":"the-active-call-id",
  "callLimit":{
    "version":1,
    "enabled":true,
    "isPremium":false,
    "serverNow":"2026-10-26T10:00:00.000Z",
    "expiresAt":"2026-10-26T10:05:00.000Z",
    "warningSeconds":30
  }
}
```

The absolute server deadline is derived from REMAINING allowance; never grant a
new 300 seconds on every call. Policies may also be included in outgoing/incoming/
accepted call payloads. Send a fresh serverNow for every update. Duplicate and older
updates do not extend time. enabled=false or isPremium=true removes the deadline;
include version and a fresh serverNow in those messages too.

At exhaustion broadcast call:limit-reached with callId, code=CALL_FREE_LIMIT_REACHED,
and callLimit containing version=1, enabled=true, isPremium=false. A pre-call denial
uses call:error with the same code and callLimit. The app stops media immediately,
ends the call, and opens the existing Premium flow after its call modal dismisses.
Successful purchases/restores use existing subscription handling; the server must
verify entitlement before allowing subsequent calls or removing an active deadline.

## Production rollout and further hardening

1. CallUsageSession stores connected start/end times, the couple, participant IDs,
   quota deadline and end reason. It is separate from expiring diagnostics.
2. Enforce only when the platform switch is true, the build meets that platform's
   approved minimum, and BOTH clients advertise supported callUsageVersion. Missing
   metadata, older clients and mixed legacy pairs must retain existing calling.
3. Derive allowance/deadline from server time and verified couple Premium. Recover
   counters/timers after restart and reconcile abrupt disconnects without granting
   new free time. Provide a policy resync when a socket reconnects.
4. Implement a server deadline as well as frontend signals. Strong protection against
   modified clients also requires a media-layer termination mechanism; signaling
   disconnect alone cannot guarantee an established WebRTC transport stops.
5. Bump app version and build for each review submission. Do not deliver these changes
   to an old appVersion OTA target if that population must remain unchanged.
6. Once Android is approved, set its minimum to the ACTUAL approved versionCode and
   enable Android only. Do the equivalent for iOS after its approval using the actual
   CFBundleVersion. Both approvals are independent. Restart/redeploy the backend
   after environment changes. A blank minimum must always mean no enforcement.

Test old/old, new/old and new/new pairs; each platform on/off; missing and malformed
policies; repeated calls; Premium restore during a call; backgrounding; reconnects;
server restarts and duplicate connected/end events before activating any gate.
