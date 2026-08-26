// mapping.js
// =====================================================
// MAPPING LID KE NOMOR HP
// =====================================================

import fs from 'fs';
import path from 'path';

/**
 * Cek apakah sebuah JID adalah LID
 */
export function isLidJid(jid) {
    if (!jid) return false;
    return typeof jid === 'string' && jid.endsWith('@lid');
}

/**
 * Cek apakah sebuah JID adalah nomor HP
 */
export function isPhoneJid(jid) {
    if (!jid) return false;
    return typeof jid === 'string' && jid.endsWith('@s.whatsapp.net');
}

/**
 * Normalisasi ID (hapus @ dan karakter non-digit)
 */
export function normalizeId(value) {
    if (!value) return '';
    return String(value)
        .trim()
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');
}

/**
 * Mapping LID ke nomor HP menggunakan signalRepository
 */
export async function mapLidToPhone(sock, lidJid) {
    try {
        if (!lidJid || !isLidJid(lidJid)) {
            return null;
        }

        const lidMapping = sock?.signalRepository?.lidMapping;
        if (!lidMapping) {
            console.log('[MAPPING] lidMapping tidak tersedia');
            return null;
        }

        const phoneJid = await lidMapping.getPNForLID(lidJid);
        if (!phoneJid || !isPhoneJid(phoneJid)) {
            console.log(`[MAPPING] Gagal mapping LID: ${lidJid}`);
            return null;
        }

        const phoneNumber = normalizeId(phoneJid);
        console.log(`[MAPPING] LID ${lidJid} -> Phone: ${phoneNumber}`);
        return phoneNumber;

    } catch (error) {
        console.error('[MAPPING] Error mapping LID:', error.message);
        return null;
    }
}

/**
 * Mendapatkan nomor HP dari berbagai sumber JID
 * Support: LID, Phone JID, atau nomor biasa
 */
export async function getPhoneFromJid(sock, jid) {
    try {
        if (!jid) return null;

        // Jika sudah phone JID
        if (isPhoneJid(jid)) {
            return normalizeId(jid);
        }

        // Jika LID, mapping
        if (isLidJid(jid)) {
            return await mapLidToPhone(sock, jid);
        }

        // Jika sudah nomor biasa (tanpa @)
        const normalized = normalizeId(jid);
        if (normalized && normalized.length >= 8 && normalized.length <= 15) {
            return normalized;
        }

        return null;

    } catch (error) {
        console.error('[MAPPING] Error getPhoneFromJid:', error.message);
        return null;
    }
}

/**
 * Mendapatkan nomor HP dari message key
 * Prioritas: participantAlt -> remoteJidAlt -> participant -> remoteJid
 */
export async function getPhoneFromMessageKey(sock, key) {
    try {
        if (!key) return null;

        // 1. Cek participantAlt
        if (key.participantAlt) {
            const phone = await getPhoneFromJid(sock, key.participantAlt);
            if (phone) return phone;
        }

        // 2. Cek remoteJidAlt
        if (key.remoteJidAlt) {
            const phone = await getPhoneFromJid(sock, key.remoteJidAlt);
            if (phone) return phone;
        }

        // 3. Cek participant
        if (key.participant) {
            const phone = await getPhoneFromJid(sock, key.participant);
            if (phone) return phone;
        }

        // 4. Cek remoteJid
        if (key.remoteJid) {
            // Skip jika group
            if (key.remoteJid.endsWith('@g.us')) {
                return null;
            }
            const phone = await getPhoneFromJid(sock, key.remoteJid);
            if (phone) return phone;
        }

        return null;

    } catch (error) {
        console.error('[MAPPING] Error getPhoneFromMessageKey:', error.message);
        return null;
    }
}

/**
 * Cache mapping LID ke nomor HP
 * Untuk mengurangi panggilan ke signalRepository
 */
const lidCache = new Map();

export async function mapLidToPhoneWithCache(sock, lidJid) {
    try {
        if (!lidJid || !isLidJid(lidJid)) {
            return null;
        }

        // Cek cache
        if (lidCache.has(lidJid)) {
            const cached = lidCache.get(lidJid);
            // Cache expire setelah 1 jam
            if (Date.now() - cached.timestamp < 3600000) {
                console.log(`[MAPPING] Cache hit: ${lidJid} -> ${cached.phone}`);
                return cached.phone;
            } else {
                lidCache.delete(lidJid);
            }
        }

        // Mapping
        const phone = await mapLidToPhone(sock, lidJid);
        if (phone) {
            lidCache.set(lidJid, {
                phone: phone,
                timestamp: Date.now()
            });
        }

        return phone;

    } catch (error) {
        console.error('[MAPPING] Error mapLidToPhoneWithCache:', error.message);
        return null;
    }
}

/**
 * Batch mapping multiple LIDs ke nomor HP
 */
export async function mapMultipleLidsToPhone(sock, lidJids) {
    try {
        if (!lidJids || !Array.isArray(lidJids) || lidJids.length === 0) {
            return new Map();
        }

        const results = new Map();
        const lidMapping = sock?.signalRepository?.lidMapping;
        
        if (!lidMapping) {
            console.log('[MAPPING] lidMapping tidak tersedia untuk batch');
            return results;
        }

        // Filter hanya LID
        const validLids = lidJids.filter(jid => isLidJid(jid));
        
        if (validLids.length === 0) {
            return results;
        }

        // Mapping satu per satu (WhatsApp tidak support batch)
        for (const lid of validLids) {
            const phone = await mapLidToPhoneWithCache(sock, lid);
            if (phone) {
                results.set(lid, phone);
            }
        }

        return results;

    } catch (error) {
        console.error('[MAPPING] Error mapMultipleLidsToPhone:', error.message);
        return new Map();
    }
}

/**
 * Clear cache mapping
 */
export function clearLidCache() {
    lidCache.clear();
    console.log('[MAPPING] Cache cleared');
}

/**
 * Get cache stats
 */
export function getLidCacheStats() {
    return {
        size: lidCache.size,
        keys: Array.from(lidCache.keys())
    };
}

// =====================================================
// LOGGING
// =====================================================

function logMappingError(error, context = '') {
    const timestamp = new Date().toLocaleString('id-ID', {
        timeZone: 'Asia/Jakarta'
    });

    const logMessage =
        `[${timestamp}] [MAPPING: ${context}] ` +
        `${error?.stack || error?.message || error}\n` +
        `--------------------------------------------------\n`;

    fs.appendFile(
        'mapping-error.log',
        logMessage,
        err => {
            if (err) {
                console.error('Gagal menulis ke mapping-error.log:', err);
            }
        }
    );
}

// =====================================================
// EXPORT DEFAULT
// =====================================================

export default {
    isLidJid,
    isPhoneJid,
    normalizeId,
    mapLidToPhone,
    getPhoneFromJid,
    getPhoneFromMessageKey,
    mapLidToPhoneWithCache,
    mapMultipleLidsToPhone,
    clearLidCache,
    getLidCacheStats
};