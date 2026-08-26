import fs from 'fs';

// ==========================================
// CONFIG
// ==========================================

const MAX_TEXT_LENGTH = 10000;
const MAX_OBJECT_KEYS = 100;
const MAX_ARRAY_LENGTH = 100;

// ==========================================
// BLOCKED USER
// ==========================================

const blockedUsers = new Set();

// ==========================================
// NORMALIZE JID
// ==========================================

function normalizeJid(jid = '') {
    return String(jid)
        .trim()
        .toLowerCase();
}

// ==========================================
// CHECK BLOCK
// ==========================================

export function isBlocked(jid) {
    return blockedUsers.has(
        normalizeJid(jid)
    );
}

// ==========================================
// BLOCK USER
// ==========================================

export function blockUser(jid, reason = 'Suspicious payload') {

    const user = normalizeJid(jid);

    if (!user) {
        return false;
    }

    blockedUsers.add(user);

    console.log(
        `🚫 [GUARD] BLOCKED: ${user} | ${reason}`
    );

    return true;
}

// ==========================================
// UNBLOCK USER
// ==========================================

export function unblockUser(jid) {

    return blockedUsers.delete(
        normalizeJid(jid)
    );
}

// ==========================================
// STRING CHECK
// ==========================================

function inspectString(value) {

    if (typeof value !== 'string') {
        return false;
    }

    // Terlalu panjang
    if (value.length > MAX_TEXT_LENGTH) {
        return true;
    }

    // Banyak null byte / control character
    let controlCount = 0;

    for (const char of value) {

        const code = char.charCodeAt(0);

        if (
            code === 0 ||
            (code < 32 &&
            code !== 9 &&
            code !== 10 &&
            code !== 13)
        ) {
            controlCount++;
        }
    }

    if (controlCount > 20) {
        return true;
    }

    return false;
}

// ==========================================
// RECURSIVE PAYLOAD INSPECTION
// ==========================================

function inspectPayload(value, depth = 0, visited = new WeakSet()) {

    // Jangan terlalu dalam
    if (depth > 15) {
        return {
            suspicious: true,
            reason: 'Payload terlalu dalam'
        };
    }

    // STRING
    if (typeof value === 'string') {

        if (inspectString(value)) {

            return {
                suspicious: true,
                reason: 'String payload mencurigakan'
            };
        }

        return {
            suspicious: false
        };
    }

    // NULL / primitive
    if (
        value === null ||
        typeof value !== 'object'
    ) {
        return {
            suspicious: false
        };
    }

    // Circular object
    if (visited.has(value)) {

        return {
            suspicious: true,
            reason: 'Circular payload'
        };
    }

    visited.add(value);

    // ARRAY
    if (Array.isArray(value)) {

        if (value.length > MAX_ARRAY_LENGTH) {

            return {
                suspicious: true,
                reason: 'Array payload terlalu besar'
            };
        }

        for (const item of value) {

            const result =
                inspectPayload(
                    item,
                    depth + 1,
                    visited
                );

            if (result.suspicious) {
                return result;
            }
        }

        return {
            suspicious: false
        };
    }

    // OBJECT
    const keys = Object.keys(value);

    if (keys.length > MAX_OBJECT_KEYS) {

        return {
            suspicious: true,
            reason: 'Object memiliki terlalu banyak property'
        };
    }

    for (const key of keys) {

        // key terlalu panjang
        if (key.length > 500) {

            return {
                suspicious: true,
                reason: 'Property name terlalu panjang'
            };
        }

        const result =
            inspectPayload(
                value[key],
                depth + 1,
                visited
            );

        if (result.suspicious) {
            return result;
        }
    }

    return {
        suspicious: false
    };
}

// ==========================================
// GET SENDER
// ==========================================

function getSender(msg) {

    return (
        msg?.key?.participantAlt ||
        msg?.key?.participant ||
        msg?.key?.remoteJid ||
        ''
    );
}

// ==========================================
// DELETE MESSAGE
// ==========================================

async function deleteMessage(sock, msg) {

    try {

        if (!sock || !msg?.key) {
            return false;
        }

        await sock.sendMessage(
            msg.key.remoteJid,
            {
                delete: msg.key
            }
        );

        console.log(
            `🗑️ [GUARD] Pesan dihapus`
        );

        return true;

    } catch (error) {

        console.log(
            `⚠️ [GUARD] Gagal menghapus pesan:`,
            error.message
        );

        return false;
    }
}

// ==========================================
// MAIN GUARD
// ==========================================

export async function guardMessage(sock, msg) {

    try {

        if (!msg?.message) {

            return {
                safe: true
            };
        }

        const sender =
            getSender(msg);

        // ==================================
        // SUDAH DIBLOCK
        // ==================================

        if (isBlocked(sender)) {

            await deleteMessage(
                sock,
                msg
            );

            return {
                safe: false,
                blocked: true,
                reason: 'User sudah diblokir'
            };
        }

        // ==================================
        // INSPEKSI PAYLOAD
        // ==================================

        const payload =
            inspectPayload(
                msg.message
            );

        if (payload.suspicious) {

            console.log(
                `🚨 [GUARD] Payload mencurigakan`
            );

            console.log(
                `👤 Sender : ${sender}`
            );

            console.log(
                `📌 Reason : ${payload.reason}`
            );

            // BLOCK
            blockUser(
                sender,
                payload.reason
            );

            // DELETE MESSAGE
            await deleteMessage(
                sock,
                msg
            );

            return {
                safe: false,
                blocked: true,
                reason: payload.reason
            };
        }

        // ==================================
        // AMAN
        // ==================================

        return {
            safe: true,
            blocked: false
        };

    } catch (error) {

        console.error(
            '❌ [GUARD ERROR]',
            error
        );

        // Kalau guard sendiri error,
        // jangan langsung anggap payload aman.
        return {
            safe: false,
            blocked: false,
            reason: 'Guard error'
        };
    }
}