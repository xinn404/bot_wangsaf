import fs from 'fs';
import path from 'path';

const dbDir = path.resolve('./db');
const dbFile = path.join(dbDir, 'sv.json');

function ensureDB() {
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(dbFile)) {
        fs.writeFileSync(dbFile, '[]', 'utf8');
    }
}

function normalizePhone(value) {
    if (!value) return '';

    let phone = String(value)
        .trim()
        .split('@')[0]
        .split(':')[0]
        .replace(/\D/g, '');

    // Indonesia: 08xxx -> 628xxx
    if (phone.startsWith('0')) {
        phone = '62' + phone.slice(1);
    }

    return phone;
}

export function getPhoneFromMessage(msg) {
    /*
     * participantAlt biasanya berisi nomor HP
     * sedangkan participant bisa berisi LID.
     */

    const candidates = [
        msg?.key?.participantAlt,
        msg?.key?.participant
    ];

    for (const value of candidates) {
        if (!value) continue;

        const phone = normalizePhone(value);

        // Nomor HP normal biasanya minimal 8 digit
        if (phone.length >= 8) {
            return phone;
        }
    }

    return '';
}

export function saveSVUser(phone) {
    try {
        ensureDB();

        const normalizedPhone =
            normalizePhone(phone);

        if (!normalizedPhone) {
            return {
                success: false,
                message: 'Nomor HP tidak ditemukan.'
            };
        }

        let users = [];

        try {
            const data =
                fs.readFileSync(
                    dbFile,
                    'utf8'
                ).trim();

            if (data) {
                users = JSON.parse(data);
            }

            if (!Array.isArray(users)) {
                users = [];
            }

        } catch {
            users = [];
        }

        const exists =
            users.some(
                user =>
                    normalizePhone(user.phone) ===
                    normalizedPhone
            );

        if (exists) {
            return {
                success: true,
                exists: true,
                phone: normalizedPhone
            };
        }

        users.push({
            phone: normalizedPhone,
            createdAt: new Date().toISOString()
        });

        fs.writeFileSync(
            dbFile,
            JSON.stringify(
                users,
                null,
                2
            ),
            'utf8'
        );

        return {
            success: true,
            exists: false,
            phone: normalizedPhone
        };

    } catch (error) {

        console.error(
            'Gagal menyimpan SV user:',
            error
        );

        return {
            success: false,
            message: error.message
        };
    }
}