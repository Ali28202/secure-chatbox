/**
 * The browser's device fingerprint.
 *
 * A session belongs to one device, and this is what identifies it. The web has
 * no MAC address, no serial number and nothing else a page can read that is
 * both stable and unique — so this is not a *derived* identifier at all. It is a
 * random value minted once and kept, with a short digest of the browser's own
 * traits glued to the front so a value that outlives the browser it was made
 * for is recognisably foreign.
 *
 * That ordering matters. A fingerprint built purely from traits (screen size,
 * platform, language) is the same on every machine in a university computer
 * lab, which would mean one student signing in evicts the person next to them.
 * Random-first makes collisions impossible; the traits only add the ability to
 * notice that storage has been copied somewhere else.
 */

const STORAGE_KEY = 'chatbox.device-id';

/**
 * FNV-1a, 32-bit.
 *
 * Hand-written because the obvious answer — `crypto.subtle.digest` — does not
 * exist here. `crypto.subtle` is restricted to secure contexts, and this app is
 * served over plain HTTP on the campus LAN, so on the machines that matter it
 * is `undefined`. (`crypto.getRandomValues` below is the exception: it *is*
 * available in insecure contexts, which is what makes the random half of this
 * possible at all.)
 *
 * The weakness of FNV is irrelevant here: nothing about the design depends on
 * this being hard to reverse or collision-free. It is a label, not a secret.
 */
function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    // The FNV prime, as shifts — `hash * 16777619` overflows a float's exact
    // integer range and starts rounding, which silently ruins the mixing.
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

/** Traits that survive a reload and a reboot, but not a different machine. */
function deviceTraits(): string {
  const { userAgent, language, hardwareConcurrency, platform } = navigator;

  return [
    userAgent,
    language,
    hardwareConcurrency,
    // Deprecated, and frozen to a handful of values in newer browsers. Included
    // anyway: it costs nothing and still separates a lab PC from a phone.
    platform,
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    new Date().getTimezoneOffset(),
  ].join('|');
}

function randomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);

  return [...buffer].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * The id for the lifetime of this page, when it could not be stored.
 *
 * Storage throws rather than returning null when a browser has site data
 * disabled — a locked-down lab profile, or private mode in some browsers. The
 * device is then only remembered until the tab closes, which costs that user an
 * extra login later and is a great deal better than a page that cannot sign in.
 */
let ephemeralDeviceId: string | null = null;

/**
 * This device's id, minting and storing one on first use.
 *
 * `localStorage` rather than a cookie: a cookie would be sent on every request,
 * which is exactly what this must not be. The id travels in the login body
 * only, and from then on it lives inside the signed token — so there is nothing
 * on the wire for an attacker holding a stolen cookie to copy.
 *
 * Clearing site data mints a new one and therefore ends the session on the next
 * request. That is correct: a browser that has forgotten which device it is
 * cannot prove it is the same one.
 *
 * Client-only — `localStorage` does not exist during SSR, so every caller runs
 * inside an event handler or an effect.
 */
export function getDeviceId(): string {
  const stored = readStoredDeviceId();
  if (stored) return stored;

  // Checked whether or not the read threw: a browser can allow reads and refuse
  // writes, and minting a fresh id on every call would make each login look
  // like a different device and evict the one before it.
  if (ephemeralDeviceId) return ephemeralDeviceId;

  // 8 + 1 + 32 = 41 characters, comfortably inside `LIMITS.deviceId` and made
  // only of characters `deviceIdSchema` accepts.
  ephemeralDeviceId = `${fnv1a(deviceTraits())}-${randomHex(16)}`;

  try {
    localStorage.setItem(STORAGE_KEY, ephemeralDeviceId);
  } catch {
    // Remembered for this page only. See `ephemeralDeviceId`.
  }

  return ephemeralDeviceId;
}

function readStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
