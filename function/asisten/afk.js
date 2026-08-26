import fs from 'fs';
import path from 'path';

const DB_DIR = path.resolve('./db');
const FILE_PATH = path.join(DB_DIR, 'afk.json');

const TIMEZONE = 'Asia/Jakarta';

const defaultData = {
    enabled: false,
    closeTime: null,
    reason: null,
    updatedAt: null,
    updatedBy: null
};

// ENSURE FILE

function ensureFile() {

    if (!fs.existsSync(DB_DIR)) {
        fs.mkdirSync(DB_DIR, {
            recursive: true
        });
    }

    if (!fs.existsSync(FILE_PATH)) {

        fs.writeFileSync(
            FILE_PATH,
            JSON.stringify(
                defaultData,
                null,
                2
            )
        );
    }
}

// READ

export function getAFK() {

    ensureFile();

    try {

        const data =
            fs.readFileSync(
                FILE_PATH,
                'utf8'
            ).trim();

        if (!data) {
            return {
                ...defaultData
            };
        }

        return {
            ...defaultData,
            ...JSON.parse(data)
        };

    } catch (error) {

        console.error(
            '[AFK] Gagal membaca afk.json:',
            error.message
        );

        return {
            ...defaultData
        };
    }
}

// WRITE

function saveAFK(data) {

    ensureFile();

    fs.writeFileSync(
        FILE_PATH,
        JSON.stringify(
            data,
            null,
            2
        )
    );
}

// NORMALIZE TIME

export function normalizeTime(time) {

    if (
        typeof time !== 'string'
    ) {
        return null;
    }

    time =
        time
            .trim()
            .replace('.', ':');

    if (
        !/^([01]\d|2[0-3]):([0-5]\d)$/.test(time)
    ) {
        return null;
    }

    return time;
}

// ENABLE AFK

export function enableAFK(
    closeTime,
    reason = '',
    updatedBy = ''
) {

    const normalizedTime =
        normalizeTime(closeTime);

    if (!normalizedTime) {

        throw new Error(
            'Format jam tidak valid. Gunakan HH.MM atau HH:MM'
        );
    }

    const data = {

        enabled: true,

        closeTime:
            normalizedTime,

        reason:
            reason.trim() ||
            'Tidak ada alasan',

        updatedAt:
            new Date().toISOString(),

        updatedBy:
            String(updatedBy || '')
    };

    saveAFK(data);

    console.log(
        `[AFK] ON | Open kembali ${normalizedTime} | ${data.reason}`
    );

    return data;
}

// DISABLE AFK

export function disableAFK(
    updatedBy = ''
) {

    const data = {

        enabled: false,

        closeTime: null,

        reason: null,

        updatedAt:
            new Date().toISOString(),

        updatedBy:
            String(updatedBy || '')
    };

    saveAFK(data);

    console.log(
        `[AFK] OFF | Status kembali OPEN`
    );

    return data;
}

// GET WIB TIME

function getWIBTime() {

    const formatter =
        new Intl.DateTimeFormat(
            'en-GB',
            {
                timeZone: TIMEZONE,
                hour: '2-digit',
                minute: '2-digit',
                hour12: false
            }
        );

    return formatter.format(
        new Date()
    );
}

// GET WIB MINUTES

function getCurrentMinutes() {

    const currentTime =
        getWIBTime();

    const [
        hour,
        minute
    ] =
        currentTime
            .split(':')
            .map(Number);

    return (
        hour * 60 +
        minute
    );
}

// GET CLOSE MINUTES

function getCloseMinutes(
    closeTime
) {

    if (!closeTime) {
        return null;
    }

    const [
        hour,
        minute
    ] =
        closeTime
            .split(':')
            .map(Number);

    if (
        Number.isNaN(hour) ||
        Number.isNaN(minute)
    ) {
        return null;
    }

    return (
        hour * 60 +
        minute
    );
}

// CEK SUDAH WAKTU OPEN

export function shouldOpen() {

    const data =
        getAFK();

    if (
        !data.enabled ||
        !data.closeTime
    ) {
        return false;
    }

    const currentMinutes =
        getCurrentMinutes();

    const closeMinutes =
        getCloseMinutes(
            data.closeTime
        );

    if (
        closeMinutes === null
    ) {
        return false;
    }

    return (
        currentMinutes >=
        closeMinutes
    );
}

// CEK STATUS AFK

export function isAFK() {

    const data =
        getAFK();

    if (!data.enabled) {
        return false;
    }

    if (
        shouldOpen()
    ) {
        return false;
    }

    return true;
}

// AUTO OPEN

export function checkAutoOpen() {

    const data =
        getAFK();

    if (!data.enabled) {
        return false;
    }

    if (!data.closeTime) {
        return false;
    }

    if (!shouldOpen()) {
        return false;
    }

    const oldTime =
        data.closeTime;

    disableAFK(
        'AUTO_SYSTEM'
    );

    console.log(
        `[AFK] AUTO OPEN pada ${oldTime} WIB`
    );

    return true;
}

// RESPONSE AFK

export function getAFKResponse() {

    const data =
        getAFK();

    if (!data.enabled) {
        return null;
    }

    if (shouldOpen()) {

        checkAutoOpen();

        return null;
    }

    return (
        `🤖 *XIN STORE*\n\n` +
        `Maaf, atmin sedang *${data.reason}*.\n\n` +
        `⏰ Atmin akan buka kembali pukul *${data.closeTime} WIB*.\n\n` +
        `Silakan kirim pesan kembali setelah jam tersebut.\n\n` +
        `_Terima kasih sudah menunggu 🙏_\n\n` +
        `_Save ${global.OwnName || 'XIN STORE'} jika kamu hanya melakukan push kontak!_`
    );
}

// STATUS

export function getAFKStatus() {

    const data =
        getAFK();

    if (!data.enabled) {

        return {
            enabled: false,
            status: 'OPEN',
            closeTime: null,
            reason: null
        };
    }

    if (shouldOpen()) {

        checkAutoOpen();

        return {
            enabled: false,
            status: 'OPEN',
            closeTime: null,
            reason: null
        };
    }

    return {
        enabled: true,
        status: 'AFK',
        closeTime: data.closeTime,
        reason: data.reason
    };
}