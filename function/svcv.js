import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// =====================================================
// RANDOM 4 ANGKA + HURUF
// =====================================================

function randomCode(length = 4) {

    const chars =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

    let result = '';

    const bytes =
        crypto.randomBytes(length);

    for (let i = 0; i < length; i++) {

        result +=
            chars[
                bytes[i] % chars.length
            ];
    }

    return result;
}

// =====================================================
// NORMALIZE NOMOR
// =====================================================

function normalizePhone(phone) {

    let number =
        String(phone || '')
            .replace(/\D/g, '');

    if (!number) {
        return '';
    }

    // 08xxxx -> 628xxxx
    if (number.startsWith('0')) {

        number =
            '62' +
            number.slice(1);
    }

    // 8xxxx -> 628xxxx
    else if (number.startsWith('8')) {

        number =
            '62' +
            number;
    }

    return number;
}

// =====================================================
// AMBIL NOMOR DARI DATA SV
// =====================================================

function extractNumbers(data) {

    let numbers = [];

    // ---------------------------------------------
    // ARRAY
    // ---------------------------------------------

    if (Array.isArray(data)) {

        numbers =
            data;
    }

    // ---------------------------------------------
    // OBJECT
    // ---------------------------------------------

    else if (
        data &&
        typeof data === 'object'
    ) {

        if (Array.isArray(data.numbers)) {

            numbers =
                data.numbers;

        } else if (Array.isArray(data.users)) {

            numbers =
                data.users;

        } else if (Array.isArray(data.data)) {

            numbers =
                data.data;

        } else if (Array.isArray(data.contacts)) {

            numbers =
                data.contacts;
        }
    }

    // ---------------------------------------------
    // AMBIL VALUE
    // ---------------------------------------------

    numbers =
        numbers.map(item => {

            if (
                typeof item === 'string' ||
                typeof item === 'number'
            ) {

                return String(item);
            }

            if (
                item &&
                typeof item === 'object'
            ) {

                return (
                    item.phone ||
                    item.number ||
                    item.nomor ||
                    item.jid ||
                    ''
                );
            }

            return '';
        });

    // ---------------------------------------------
    // NORMALIZE + UNIQUE
    // ---------------------------------------------

    return [
        ...new Set(
            numbers
                .map(normalizePhone)
                .filter(
                    number =>
                        number.length >= 8 &&
                        number.length <= 15
                )
        )
    ];
}

// =====================================================
// BUAT VCF DARI SV.JSON
// =====================================================

export function createSVVCF() {

    const filePath =
        path.resolve(
            './db/sv.json'
        );

    if (!fs.existsSync(filePath)) {

        throw new Error(
            'File db/sv.json tidak ditemukan.'
        );
    }

    const rawData =
        fs.readFileSync(
            filePath,
            'utf8'
        ).trim();

    if (!rawData) {

        throw new Error(
            'File sv.json masih kosong.'
        );
    }

    let data;

    try {

        data =
            JSON.parse(
                rawData
            );

    } catch {

        throw new Error(
            'sv.json bukan JSON yang valid.'
        );
    }

    const numbers =
        extractNumbers(data);

    if (
        numbers.length === 0
    ) {

        throw new Error(
            'Tidak ada nomor valid di sv.json.'
        );
    }

    // =================================================
    // GENERATE VCARD
    // =================================================

    let vcardCollection = '';

    for (const number of numbers) {

        const random =
            randomCode(4);

        const contactName =
            `WA-${number}-${random}`;

        vcardCollection +=
            `BEGIN:VCARD\r\n` +
            `VERSION:3.0\r\n` +
            `FN:${contactName}\r\n` +
            `N:${contactName};;;;\r\n` +
            `TEL;TYPE=CELL;TYPE=VOICE;waid=${number}:+${number}\r\n` +
            `END:VCARD\r\n`;
    }

    return {
        buffer:
            Buffer.from(
                vcardCollection,
                'utf8'
            ),

        count:
            numbers.length,

        numbers
    };
}