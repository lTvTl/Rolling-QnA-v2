// Browser-native Web Crypto API (AES-256-GCM) End-to-End Encryption utilities.
// The room secret key lives ONLY in the URL fragment (#key=...) and local browser storage;
// it is NEVER sent to the server.

const RECENT_ROOMS_KEY = 'rolling_qna_recent_rooms_v2';

function bytesToBase64Url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(base64Url) {
    let base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4 !== 0) {
        base64 += '=';
    }
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

export async function generateRoomKey() {
    const cryptoKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
    const raw = new Uint8Array(await crypto.subtle.exportKey('raw', cryptoKey));
    return {
        cryptoKey,
        keyString: bytesToBase64Url(raw)
    };
}

export async function importRoomKey(keyString) {
    const raw = base64UrlToBytes(keyString.trim());
    if (raw.length !== 32) {
        throw new Error('유효하지 않은 암호화 키 길이입니다.');
    }
    return crypto.subtle.importKey(
        'raw',
        raw,
        { name: 'AES-GCM' },
        false,
        ['encrypt', 'decrypt']
    );
}

export async function encryptJson(cryptoKey, data) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(JSON.stringify(data));
    const cipherBuf = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        encoded
    );
    return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(cipherBuf))}`;
}

export async function decryptJson(cryptoKey, encryptedString) {
    if (!encryptedString || typeof encryptedString !== 'string') {
        throw new Error('암호화된 데이터가 비어 있습니다.');
    }
    const parts = encryptedString.split('.');
    if (parts.length !== 3 || parts[0] !== 'v1') {
        throw new Error('지원하지 않는 암호화 형식입니다.');
    }
    const iv = base64UrlToBytes(parts[1]);
    const cipherBytes = base64UrlToBytes(parts[2]);
    const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        cryptoKey,
        cipherBytes
    );
    const jsonStr = new TextDecoder().decode(plainBuf);
    return JSON.parse(jsonStr);
}

export function extractKeyFromHash(hash) {
    if (!hash) return null;
    const cleaned = hash.startsWith('#') ? hash.slice(1) : hash;
    const params = new URLSearchParams(cleaned);
    return params.get('key');
}

export function saveRecentRoom({ inviteCode, keyString, title }) {
    try {
        const list = getRecentRooms().filter(r => r.inviteCode !== inviteCode);
        list.unshift({
            inviteCode,
            keyString,
            title: title || inviteCode,
            visitedAt: new Date().toISOString()
        });
        localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(list.slice(0, 12)));
    } catch {
        // Ignore storage quota errors
    }
}

export function getRecentRooms() {
    try {
        const raw = localStorage.getItem(RECENT_ROOMS_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

export function removeRecentRoom(inviteCode) {
    try {
        const list = getRecentRooms().filter(r => r.inviteCode !== inviteCode);
        localStorage.setItem(RECENT_ROOMS_KEY, JSON.stringify(list));
    } catch {
        // Ignore
    }
}

export function getStoredKeyForRoom(inviteCode) {
    const found = getRecentRooms().find(r => r.inviteCode.toUpperCase() === String(inviteCode || '').toUpperCase());
    return found ? found.keyString : null;
}

export function buildInviteUrl(inviteCode, keyString) {
    return `${window.location.origin}/room/${inviteCode}#key=${keyString}`;
}

export function parseInviteInput(input) {
    const trimmed = String(input || '').trim();
    if (!trimmed) return { inviteCode: '', keyString: '' };

    // Try full URL format: .../room/XXXXXXXX#key=YYYY
    try {
        const url = new URL(trimmed);
        const match = url.pathname.match(/\/room\/([A-Za-z0-9]+)/);
        const inviteCode = match ? match[1].toUpperCase() : '';
        const keyString = extractKeyFromHash(url.hash) || '';
        return { inviteCode, keyString };
    } catch {
        // Fallback: maybe "CODE#key=KEY" or just "CODE"
        const [left, hashPart] = trimmed.split('#');
        const codeMatch = left.match(/([A-Za-z0-9]{6,12})$/);
        const inviteCode = codeMatch ? codeMatch[1].toUpperCase() : left.toUpperCase();
        const keyString = hashPart ? extractKeyFromHash('#' + hashPart) || '' : '';
        return { inviteCode, keyString };
    }
}
