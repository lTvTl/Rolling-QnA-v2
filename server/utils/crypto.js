const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SECRET_FILE = path.join(DATA_DIR, '.server_secret');

const INVITE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

let cachedSecret = null;

function getServerSecret() {
    if (process.env.SESSION_SECRET) {
        return process.env.SESSION_SECRET;
    }
    if (cachedSecret) {
        return cachedSecret;
    }
    if (process.env.DB_PATH === ':memory:') {
        cachedSecret = crypto.randomBytes(32).toString('hex');
        return cachedSecret;
    }
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(SECRET_FILE)) {
        cachedSecret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
        if (cachedSecret.length >= 32) {
            return cachedSecret;
        }
    }
    cachedSecret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(SECRET_FILE, cachedSecret, { mode: 0o600 });
    return cachedSecret;
}

function generateId() {
    return crypto.randomUUID();
}

function generateInviteCode(length = 8) {
    const bytes = crypto.randomBytes(length);
    let code = '';
    for (let i = 0; i < length; i++) {
        code += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
    }
    return code;
}

function hashPin(pin) {
    const salt = crypto.randomBytes(16).toString('hex');
    const derived = crypto.scryptSync(String(pin), salt, 32).toString('hex');
    return `${salt}:${derived}`;
}

function verifyPin(pin, storedHash) {
    if (!storedHash || !storedHash.includes(':')) return false;
    const [salt, keyHex] = storedHash.split(':');
    const keyBuf = Buffer.from(keyHex, 'hex');
    const derivedBuf = crypto.scryptSync(String(pin), salt, 32);
    if (keyBuf.length !== derivedBuf.length) return false;
    return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

function getAnonymousAuthorKey(roomId, questionId, memberId) {
    const secret = process.env.ANON_HMAC_SECRET || getServerSecret();
    return 'anon_' + crypto
        .createHmac('sha256', secret)
        .update(`${roomId}:${questionId}:${memberId}`)
        .digest('hex')
        .substring(0, 32);
}

module.exports = {
    getServerSecret,
    generateId,
    generateInviteCode,
    hashPin,
    verifyPin,
    getAnonymousAuthorKey
};
