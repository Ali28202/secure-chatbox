const STORAGE_KEY = 'chatbox.device-id';

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

function deviceTraits(): string {
  const { userAgent, language, hardwareConcurrency, platform } = navigator;

  return [
    userAgent,
    language,
    hardwareConcurrency,
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

let ephemeralDeviceId: string | null = null;

export function getDeviceId(): string {
  const stored = readStoredDeviceId();
  if (stored) return stored;

  if (ephemeralDeviceId) return ephemeralDeviceId;

  ephemeralDeviceId = `${fnv1a(deviceTraits())}-${randomHex(16)}`;

  writeStoredDeviceId(ephemeralDeviceId);

  return ephemeralDeviceId;
}

function readStoredDeviceId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredDeviceId(value: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}
