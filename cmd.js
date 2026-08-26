// main.js (file utama yang sudah dimodifikasi)
import os from 'os';
import fs from 'fs';
import path from 'path';
import axios from 'axios';

import {
    saveSVUser,
    getPhoneFromMessage
} from './function/sv.js';

import { executePushKontak } from './function/pushkontak.js';
import { createSVVCF } from './function/svcv.js';

import {
    enableAFK,
    disableAFK,
    getAFK,
    normalizeTime,
    isAFK,
    checkAutoOpen,
    getAFKResponse
} from './function/asisten/afk.js';

// Import mapping functions
import {
    getPhoneFromMessageKey,
    getPhoneFromJid,
    mapLidToPhone,
    isLidJid,
    isPhoneJid,
    normalizeId
} from './function/mapping.js';

// =====================================================
// ERROR LOG
// =====================================================

function logError(error, context = '') {

    const timestamp =
        new Date().toLocaleString('id-ID', {
            timeZone: 'Asia/Jakarta'
        });

    const logMessage =
        `[${timestamp}] [CONTEXT: ${context}] ` +
        `${error?.stack || error?.message || error}\n` +
        `--------------------------------------------------\n`;

    fs.appendFile(
        'error.log',
        logMessage,
        err => {

            if (err) {

                console.error(
                    'Gagal menulis ke error.log:',
                    err
                );

            }

        }
    );
}

// =====================================================
// GET BOT JID
// =====================================================

function getBotJid(sock) {

    try {

        const botJid =
            sock?.user?.id;

        if (
            botJid &&
            typeof botJid === 'string'
        ) {

            return botJid;

        }

        return '';

    } catch (error) {

        logError(
            error,
            'GET BOT JID'
        );

        return '';

    }
}

// =====================================================
// GET NOMOR USER - MENGGUNAKAN MAPPING.JS
// =====================================================

async function getPhoneNumber(
    sock,
    msg
) {

    try {

        const key =
            msg?.key || {};

        // Gunakan mapping.js untuk mendapatkan nomor HP
        const phone = await getPhoneFromMessageKey(sock, key);

        if (phone) {
            console.log(`[SV] Phone detected: ${phone}`);
            return phone;
        }

        // Fallback: coba dari helper
        try {

            const helperPhone =
                await getPhoneFromMessage(
                    msg
                );

            if (
                helperPhone &&
                /^\d{8,15}$/.test(
                    String(helperPhone)
                )
            ) {

                return String(
                    helperPhone
                );

            }

        } catch (error) {

            console.log(
                '[SV] getPhoneFromMessage gagal:',
                error.message
            );

        }

        // Fallback terakhir: dari teks pesan
        try {
            const messageText =
                msg.message?.conversation ||
                msg.message?.extendedTextMessage?.text ||
                msg.message?.imageMessage?.caption ||
                msg.message?.videoMessage?.caption ||
                '';

            const phoneMatch = messageText.match(/(\d{8,15})/);
            if (phoneMatch) {
                const phone = phoneMatch[1];
                if (phone.length >= 8 && phone.length <= 15) {
                    return phone;
                }
            }
        } catch (error) {
            console.log(
                '[SV] Gagal ekstrak nomor dari pesan:',
                error.message
            );
        }

        return '';

    } catch (error) {

        console.error(
            '[SV] Error getPhoneNumber:',
            error
        );

        logError(
            error,
            'GET PHONE NUMBER'
        );

        return '';

    }
}

// =====================================================
// GET SENDER PHONE - MENGGUNAKAN MAPPING.JS
// =====================================================

async function getSenderPhone(
    sock,
    senderJID
) {

    try {

        if (!senderJID) {
            return '';
        }

        // Gunakan mapping.js
        const phone = await getPhoneFromJid(sock, senderJID);

        if (phone) {
            console.log(`[SENDER] Phone: ${phone} dari JID: ${senderJID}`);
            return phone;
        }

        return '';

    } catch (error) {
        console.error(
            '[SENDER] Error getSenderPhone:',
            error
        );
        return '';
    }
}

// =====================================================
// SV XIN STORE
// =====================================================

async function handleSV(
    sock,
    msg,
    text
) {

    try {

        const cleanText =
            String(text || '')
                .trim()
                .replace(/\s+/g, ' ')
                .toUpperCase();

        if (
            cleanText !== 'SV XIN STORE'
        ) {

            return false;

        }

        const remoteJid =
            msg?.key?.remoteJid || '';

        if (
            remoteJid.endsWith('@g.us')
        ) {

            return false;

        }

        const phone =
            await getPhoneNumber(
                sock,
                msg
            );

        const botJid =
            getBotJid(sock);

        if (!phone) {

            console.log(
                '[SV] Nomor HP user tidak ditemukan.'
            );

            console.log(
                '[SV] MESSAGE KEY:',
                JSON.stringify(
                    msg?.key,
                    null,
                    2
                )
            );

            if (botJid) {

                await sendCommandResponse(
                    sock,
                    botJid,
                    {
                        text:
                            `❌ *SV XIN STORE GAGAL*\n\n` +
                            `Nomor HP pengirim tidak dapat dideteksi.\n\n` +
                            `Remote JID: ${remoteJid}`
                    },
                    null
                );

            }

            return true;

        }

        console.log(
            `[SV] Permintaan SV dari nomor: ${phone}`
        );

        await saveSVUser(
            phone
        );

        console.log(
            `[SV] Nomor ${phone} berhasil disimpan.`
        );

        if (!botJid) {

            console.log(
                '[SV] JID bot tidak ditemukan.'
            );

            logError(
                new Error(
                    'JID bot tidak ditemukan'
                ),
                'SV BOT RESPONSE'
            );

            return true;

        }

        await sendCommandResponse(
            sock,
            botJid,
            {
                text:
                    `✅ *SV XIN STORE BERHASIL*\n\n` +
                    `📱 Nomor User: *${phone}*\n` +
                    `💬 Pesan: *SV XIN STORE*\n` +
                    `⏰ Waktu: *${getWaktu()}*\n\n` +
                    `Nomor berhasil ditambahkan ke database.`
            },
            null
        );

        console.log(
            `[SV] Notifikasi berhasil dikirim ke bot: ${botJid}`
        );

        return true;

    } catch (error) {

        console.error(
            '[SV] Gagal menyimpan:',
            error
        );

        logError(
            error,
            'SV XIN STORE'
        );

        try {

            const botJid =
                getBotJid(sock);

            if (botJid) {

                await sendCommandResponse(
                    sock,
                    botJid,
                    {
                        text:
                            `❌ *SV XIN STORE ERROR*\n\n` +
                            `${error?.message || error}`
                    },
                    null
                );

            }

        } catch (sendError) {

            console.error(
                '[SV] Gagal mengirim notifikasi error:',
                sendError
            );

            logError(
                sendError,
                'SV ERROR NOTIFICATION'
            );

        }

        return true;

    }
}

// =====================================================
// VALIDASI ARGUMENT
// =====================================================

async function requireArgs(
    sock,
    msg,
    args,
    usage,
    example = ''
) {

    if (
        args.length > 0
    ) {

        return true;

    }

    let text =
        `❌ *Format Salah!*\n\n` +
        `Gunakan:\n` +
        `\`${usage}\``;

    if (example) {

        text +=
            `\n\nContoh:\n` +
            `\`${example}\``;

    }

    await sendCommandResponse(
        sock,
        msg.key.remoteJid,
        {
            text
        },
        msg
    );

    return false;

}

// =====================================================
// CEK BOT ADMIN
// =====================================================

async function isBotAdmin(
    sock,
    groupJid
) {

    try {

        if (
            !groupJid?.endsWith('@g.us')
        ) {

            return false;

        }

        const metadata =
            await sock.groupMetadata(
                groupJid
            );

        const botId =
            normalizeId(
                sock?.user?.id
            );

        if (!botId) {

            return false;

        }

        const botParticipant =
            metadata.participants.find(
                participant =>
                    normalizeId(
                        participant.id
                    ) === botId
            );

        if (!botParticipant) {

            return false;

        }

        return (
            botParticipant.admin === 'admin' ||
            botParticipant.admin === 'superadmin'
        );

    } catch (error) {

        console.error(
            'Gagal mengecek admin bot:',
            error.message
        );

        logError(
            error,
            'CHECK BOT ADMIN'
        );

        return false;

    }
}

// =====================================================
// REQUIRE BOT ADMIN
// =====================================================

async function requireBotAdmin(
    sock,
    msg
) {

    const jid =
        msg.key.remoteJid;

    if (
        !jid?.endsWith('@g.us')
    ) {

        await sendCommandResponse(
            sock,
            jid,
            {
                text:
                    '❌ Command ini hanya bisa digunakan di grup!'
            },
            msg
        );

        return false;

    }

    const admin =
        await isBotAdmin(
            sock,
            jid
        );

    if (!admin) {

        await sendCommandResponse(
            sock,
            jid,
            {
                text:
                    '❌ FAILED! THE BOT MUST BE AN ADMIN.'
            },
            msg
        );

        return false;

    }

    return true;

}

// =====================================================
// OWNER - MENGGUNAKAN MAPPING.JS
// =====================================================

async function isOwner(
    senderJID,
    sock
) {

    try {

        // Ambil nomor HP asli dari senderJID menggunakan mapping.js
        const senderPhone = await getSenderPhone(sock, senderJID);

        if (!senderPhone) {
            console.log(`[OWNER] Tidak dapat nomor dari: ${senderJID}`);
            return false;
        }

        console.log(`[OWNER] Sender phone: ${senderPhone}`);

        // Cek apakah sender adalah bot itu sendiri
        const botId =
            normalizeId(
                sock?.user?.id
            );

        if (
            senderPhone === botId &&
            botId
        ) {

            return true;

        }

        const filePath =
            path.resolve(
                './db/own.json'
            );

        if (
            !fs.existsSync(
                filePath
            )
        ) {

            console.log('[OWNER] File own.json tidak ditemukan');
            return false;

        }

        const data =
            fs.readFileSync(
                filePath,
                'utf8'
            ).trim();

        if (!data) {

            console.log('[OWNER] File own.json kosong');
            return false;

        }

        let db;

        try {

            db =
                JSON.parse(
                    data
                );

        } catch {

            console.log(
                '❌ own.json bukan JSON yang valid!'
            );

            return false;

        }

        let owners = [];

        if (
            Array.isArray(db)
        ) {

            owners = db;

        } else if (
            Array.isArray(
                db?.owners
            )
        ) {

            owners = db.owners;

        } else if (
            Array.isArray(
                db?.owner
            )
        ) {

            owners = db.owner;

        }

        const isOwnerResult = owners.some(
            owner => {

                if (
                    typeof owner === 'string'
                ) {

                    const ownerPhone = normalizeId(owner);
                    return ownerPhone === senderPhone;

                }

                if (
                    typeof owner === 'object' &&
                    owner !== null
                ) {

                    // Cek phone
                    if (owner.phone) {
                        const ownerPhone = normalizeId(owner.phone);
                        if (ownerPhone === senderPhone) {
                            return true;
                        }
                    }

                    // Cek lid (jika ada di database)
                    if (owner.lid) {
                        const ownerLid = normalizeId(owner.lid);
                        if (ownerLid === senderPhone) {
                            return true;
                        }
                    }

                    return false;

                }

                return false;

            }
        );

        console.log(`[OWNER] Hasil pengecekan untuk ${senderPhone}: ${isOwnerResult}`);
        return isOwnerResult;

    } catch (error) {

        console.log(
            '❌ GAGAL MEMBACA DATABASE OWNER!'
        );

        logError(
            error,
            'IS OWNER'
        );

        return false;

    }
}

// =====================================================
// WAKTU
// =====================================================

function getWaktu() {

    return new Date().toLocaleTimeString(
        'id-ID',
        {
            timeZone: 'Asia/Jakarta',
            hour12: false
        }
    );

}

// =====================================================
// CONFIG
// =====================================================

const year =
    new Date().getFullYear();

const version =
    '1.0';

const name =
    'XBOTZ';

// =====================================================
// SERVER
// =====================================================

function toGB(bytes) {

    return (
        bytes /
        1024 /
        1024 /
        1024
    ).toFixed(2);

}

function getServerInfo() {

    return {

        platform:
            os.platform(),

        arch:
            os.arch(),

        totalram:
            toGB(
                os.totalmem()
            ),

        freeram:
            toGB(
                os.freemem()
            ),

        uptime:
            os.uptime()

    };

}

// =====================================================
// PREFIX
// =====================================================

const prefixes = [
    '!',
    '.',
    '#',
    '/'
];

// =====================================================
// RESPONSE
// =====================================================

async function sendCommandResponse(
    sock,
    remoteJid,
    content = {},
    quotedMsg
) {

    if (!remoteJid) {

        return;

    }

    const fakeReply = {

        key: {

            remoteJid:
                '0@s.whatsapp.net',

            fromMe:
                false,

            id:
                'XBOTZ_SYSTEM_' +
                Date.now(),

            participant:
                '0@s.whatsapp.net'

        },

        message: {

            conversation:
                'XIN PEMULA⚡'

        }

    };

    const contextInfo = {

        forwardingScore:
            999,

        isForwarded:
            true,

        forwardedNewsletterMessageInfo: {

            newsletterJid:
                '120363000000000000@newsletter',

            newsletterName:
                'XIN STORE OFFICIAL',

            serverMessageId:
                1

        }

    };

    if (
        content.caption !== undefined &&
        !content.document
    ) {

        return sock.sendMessage(
            remoteJid,
            {

                video: {
                    url:
                        './assets/start.mp4'
                },

                caption:
                    content.caption,

                gifPlayback:
                    true,

                contextInfo

            },
            {
                quoted:
                    fakeReply
            }
        );

    }

    if (
        content.text !== undefined
    ) {

        return sock.sendMessage(
            remoteJid,
            {

                text:
                    content.text,

                contextInfo

            },
            {
                quoted:
                    fakeReply
            }
        );

    }

    return sock.sendMessage(
        remoteJid,
        {

            ...content,

            contextInfo

        },
        {
            quoted:
                fakeReply
        }
    );

}

// =====================================================
// HANDLE MESSAGE
// =====================================================

export async function handleMessage(
    sock,
    messages
) {

    try {

        const msg =
            messages?.[0];

        if (!msg?.message) {

            return;

        }

        const text =
            msg.message.conversation ||
            msg.message.extendedTextMessage?.text ||
            msg.message.imageMessage?.caption ||
            msg.message.videoMessage?.caption ||
            '';

        const senderJID =
            msg.key.participantAlt ||
            msg.key.participant ||
            msg.key.remoteJid ||
            '';



        if (text) {

            console.log(
                `[PESAN MASUK] Dari: ${senderJID} | Teks: ${text}`
            );

        }

        // AFK SYSTEM

        try {

            // AUTO OPEN
            // Jika jam sekarang sudah melewati closeTime,
            // AFK otomatis dimatikan.
            const autoOpened =
                checkAutoOpen();

            if (autoOpened) {

                console.log(
                    '[AFK] Status otomatis OPEN.'
                );

            }

            // Ambil DATA AFK
            const afkData =
                getAFK();

            // Kalau AFK aktif
            if (
                afkData &&
                afkData.enabled === true
            ) {

                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                // OWNER TETAP BISA MENGGUNAKAN BOT
                if (!owner) {

                    const afkMessage =
                        getAFKResponse();

                    if (afkMessage) {

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    afkMessage
                            },
                            msg
                        );

                        console.log(
                            `[AFK] Pesan AFK dikirim ke ${msg.key.remoteJid}`
                        );

                    }

                    // PENTING:
                    // user tidak boleh lanjut ke command
                    return;

                }

            }

        } catch (error) {

            console.error(
                '[AFK] Error:',
                error
            );

            logError(
                error,
                'AFK MESSAGE CHECK'
            );

        }

        // =================================================
        // SV XIN STORE
        // =================================================

        const isSV =
            await handleSV(
                sock,
                msg,
                text
            );

        if (isSV) {

            return;

        }

        // =================================================
        // PREFIX
        // =================================================

        const prefix =
            prefixes.find(
                p =>
                    text.startsWith(p)
            );

        if (!prefix) {

            return;

        }

        const args =
            text
                .slice(prefix.length)
                .trim()
                .split(/\s+/);

        const command =
            args
                .shift()
                ?.toLowerCase();

        if (!command) {

            return;

        }
        // COMMAND SWITCH

        switch (command) {
            // AFK

            case 'afk': {

                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                if (!owner) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ ACCESS DENIED! Command ini hanya untuk owner.'
                        },
                        msg
                    );

                    break;

                }

                const action =
                    String(
                        args[0] || ''
                    ).toLowerCase();

                // =========================================
                // .afk
                // =========================================

                if (!action) {

                    const data =
                        getAFK();

                    if (!data?.enabled) {

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    `🟢 *AFK: OFF*\n\n` +
                                    `Bot sedang dalam status *OPEN*.\n\n` +
                                    `Gunakan:\n` +
                                    `.afk on 16.00 istirahat`
                            },
                            msg
                        );

                        break;

                    }

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `🔴 *AFK: ON*\n\n` +
                                `⏰ Open otomatis: *${data.closeTime}*\n` +
                                `📝 Alasan: *${data.reason}*`
                        },
                        msg
                    );

                    break;

                }

                // =========================================
                // .afk on
                // =========================================

                if (
                    action === 'on'
                ) {

                    if (
                        args.length < 2
                    ) {

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    `❌ *Format salah!*\n\n` +
                                    `Gunakan:\n` +
                                    `.afk on <jam> <alasan>\n\n` +
                                    `Contoh:\n` +
                                    `.afk on 16.00 istirahat`
                            },
                            msg
                        );

                        break;

                    }

                    const closeTime =
                        args[1];

                    const reason =
                        args
                            .slice(2)
                            .join(' ') ||
                        'Tidak ada alasan';

                    const normalizedTime =
                        normalizeTime(
                            closeTime
                        );

                    if (
                        !normalizedTime
                    ) {

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    `❌ Format jam salah!\n\n` +
                                    `Gunakan contoh:\n` +
                                    `.afk on 16.00 istirahat`
                            },
                            msg
                        );

                        break;

                    }

                    try {

                        const data =
                            enableAFK(
                                normalizedTime,
                                reason,
                                senderJID
                            );

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    `🔴 *AFK AKTIF*\n\n` +
                                    `⏰ Open otomatis: *${data.closeTime}*\n` +
                                    `📝 Alasan: *${data.reason}*\n\n` +
                                    `Semua chat akan mendapatkan notifikasi AFK.\n` +
                                    `Gunakan *.afk off* untuk membuka lebih awal.`
                            },
                            msg
                        );

                        console.log(
                            `[AFK] ON sampai ${data.closeTime} | ${data.reason}`
                        );

                    } catch (error) {

                        console.error(
                            '[AFK] Gagal mengaktifkan:',
                            error
                        );

                        logError(
                            error,
                            'AFK ENABLE'
                        );

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    `❌ Gagal mengaktifkan AFK!\n\n` +
                                    `${error.message}`
                            },
                            msg
                        );

                    }

                    break;

                }

                // =========================================
                // .afk off
                // =========================================

                if (
                    action === 'off'
                ) {

                    const data =
                        getAFK();

                    if (
                        !data?.enabled
                    ) {

                        await sendCommandResponse(
                            sock,
                            msg.key.remoteJid,
                            {
                                text:
                                    `🟢 *AFK sudah OFF.*\n\n` +
                                    `Bot sudah dalam status *OPEN*.`
                            },
                            msg
                        );

                        break;

                    }

                    disableAFK(
                        senderJID
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `🟢 *AFK DIMATIKAN*\n\n` +
                                `Bot kembali dalam status *OPEN*.\n` +
                                `Jadwal *${data.closeTime}* telah dibatalkan.`
                        },
                        msg
                    );

                    console.log(
                        `[AFK] OFF manual.`
                    );

                    break;

                }

                // =========================================
                // UNKNOWN
                // =========================================

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        text:
                            `❌ Command tidak dikenal.\n\n` +
                            `Contoh:\n` +
                            `.afk on 16.00 istirahat\n` +
                            `.afk off\n` +
                            `.afk`
                    },
                    msg
                );

                break;

            }

            // =============================================
            // SVVCF
            // =============================================

            case 'svvcf': {

                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                if (!owner) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ ACCESS DENIED! You are not an owner.'
                        },
                        msg
                    );

                    break;

                }

                try {

                    const result =
                        createSVVCF();

                    const fileName =
                        `SV-XIN-STORE-${Date.now()}.vcf`;

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            document:
                                result.buffer,

                            mimetype:
                                'text/vcard',

                            fileName,

                            caption:
                                `✅ *SV JSON → VCF BERHASIL*\n\n` +
                                `📱 Total kontak: *${result.count}*\n` +
                                `📄 File: *${fileName}*\n\n` +
                                `Format nama:\n` +
                                `WA-(NO HP)-(4 RANDOM)\n\n` +
                                `Contoh:\n` +
                                `WA-628123456789-A7K2`
                        },
                        msg
                    );

                    console.log(
                        `[SV VCF] ${result.count} kontak berhasil dibuat.`
                    );

                } catch (error) {

                    console.error(
                        '[SV VCF] Gagal:',
                        error
                    );

                    logError(
                        error,
                        'SV JSON TO VCF'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `❌ Gagal membuat VCF!\n\n` +
                                `Error: ${error.message}`
                        },
                        msg
                    );

                }

                break;

            }

            // =============================================
            // ADD ADMIN
            // =============================================

            case 'addadmin': {

                if (
                    !await requireBotAdmin(
                        sock,
                        msg
                    )
                ) {

                    break;

                }

                const target =
                    msg.message
                        ?.extendedTextMessage
                        ?.contextInfo
                        ?.mentionedJid
                    ?.[0];

                if (!target) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `❌ Tag user yang akan di-promote!\n\n` +
                                `Example: .addadmin @orangbaik`
                        },
                        msg
                    );

                    break;

                }

                try {

                    await sock.groupParticipantsUpdate(
                        msg.key.remoteJid,
                        [target],
                        'promote'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `✅ @${target.split('@')[0]} BERHASIL DIJADIKAN ADMIN!`,

                            mentions:
                                [target]
                        },
                        msg
                    );

                } catch (error) {

                    console.error(
                        'Gagal promote:',
                        error
                    );

                    logError(
                        error,
                        'ADD ADMIN'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ GAGAL MENJADIKAN USER SEBAGAI ADMIN!'
                        },
                        msg
                    );

                }

                break;

            }

            // =============================================
            // AI
            // =============================================

            case 'ai': {

                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MODEL AI*
.gemini
.chatgpt
.cici
.unli-ai

_© ${year} ${name} V${version}_
                `.trim();

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        caption
                    },
                    msg
                );

                break;

            }

            // =============================================
            // ASIST
            // =============================================

            case 'asist': {
                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                if (!owner) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ ACCESS DENIED! Command ini hanya untuk owner.'
                        },
                        msg
                    );

                    break;

                }

                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU ASIST*
.afk
.autoread
.autoreadsw
.autores
.autotyping
.calc
.csw
.diskon
.done
.fee
.mathrandom
.payment
.pemasukan
.pengeluaran
.produk
.profit
.rekap
.self
.server
.fjp
.fnd

_© ${year} ${name} V${version}_
                `.trim();

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        caption
                    },
                    msg
                );

                break;

            }

            case 'download': {
                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU DOWNLOADER*
.cc
.spt
.ttv1
.ttv2
.ttv3
.twit
.tbox
.yt
.ytshort
.mp4
.mp3

`;
 await sendCommandResponse(sock, msg.key.remoteJid,{
    caption
 }, msg)
  break;
            }



            // =============================================
            // CHATGPT
            // =============================================

            case 'chatgpt': {

                if (
                    !await requireArgs(
                        sock,
                        msg,
                        args,
                        '.chatgpt <pertanyaan>',
                        '.chatgpt Halo ChatGPT'
                    )
                ) {

                    break;

                }

                const prompt =
                    args.join(' ');

                try {

                    const response =
                        await axios.get(
                            `https://api.ikyyxd.my.id/ai/gpt-5-mini?question=${encodeURIComponent(prompt)}`
                        );

                    const result =
                        response.data.result;

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                result
                        },
                        msg
                    );

                } catch (error) {

                    logError(
                        error,
                        'CHATGPT API'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ Error cik ChatGPT-nya wkwkwkwk!'
                        },
                        msg
                    );

                }

                break;

            }

            case 'ent': {
                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU ENTERTAIMENT*
.bratv1
.bratvideo
.fakecallwa
.fakedana
.fakedev
.ffduo
.logogen
.musicapple
.nulis
.qciphone
.texttoimg

_© ${year} ${name} V${version}_
                `
                await sendCommandResponse(sock, msg.key.remoteJid, {
                    caption
                }, msg);
            } break;

            // GEMINI

            case 'gemini': {

                if (
                    !await requireArgs(
                        sock,
                        msg,
                        args,
                        '.gemini <pertanyaan>',
                        '.gemini Hai Gemini'
                    )
                ) {

                    break;

                }

                const prompt =
                    args.join(' ');

                try {

                    const response =
                        await axios.get(
                            `https://api.ikyyxd.my.id/ai/gemini?text=${encodeURIComponent(prompt)}&sessionsId=kyzz`
                        );

                    const result =
                        response.data.result;

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                result
                        },
                        msg
                    );

                } catch (error) {

                    logError(
                        error,
                        'GEMINI API'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ Terjadi kesalahan saat menghubungi Gemini.'
                        },
                        msg
                    );

                }

                break;

            }

            // =============================================
            // CICI
            // =============================================

            case 'cici': {

                if (
                    !await requireArgs(
                        sock,
                        msg,
                        args,
                        '.cici <pertanyaan>',
                        '.cici Hai Cici'
                    )
                ) {

                    break;

                }

                const prompt =
                    args.join(' ');

                try {

                    const response =
                        await axios.get(
                            `https://api.ikyyxd.my.id/ai/cici?prompt=${encodeURIComponent(prompt)}`
                        );

                    const result =
                        response.data.result.reply;

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                result
                        },
                        msg
                    );

                } catch (error) {

                    logError(
                        error,
                        'CICI API'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ Waduh error mas si Cici-nya!'
                        },
                        msg
                    );

                }

                break;

            }

            // =============================================
            // UNLI AI
            // =============================================

            case 'unli-ai': {

                if (
                    !await requireArgs(
                        sock,
                        msg,
                        args,
                        '.unli-ai <pertanyaan>',
                        '.unli-ai Kamu siapa?'
                    )
                ) {

                    break;

                }

                const prompt =
                    args.join(' ');

                try {

                    const response =
                        await axios.get(
                            `https://api.ikyyxd.my.id/ai/unliai?teks=${encodeURIComponent(prompt)}`
                        );

                    const result =
                        response.data.result.response;

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                result
                        },
                        msg
                    );

                } catch (error) {

                    logError(
                        error,
                        'UNLI AI API'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ Error API Unlimited AI-nya cik!'
                        },
                        msg
                    );

                }

                break;

            }

            // =============================================
            // HELP
            // =============================================

            case 'help': {

                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU BOT*
.pcall
.vcf
.svvcf
.setgb
.cmenu
.install
.ai
.asist
.ent
.own
.ptero
.bug
.guard
.anime
.download
.random
.search
.berita

_© ${year} ${name} V${version}_
                `.trim();

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        caption
                    },
                    msg
                );

                break;

            }

            // ID GROUP
            case 'idgb': {

                if (
                    !msg.key.remoteJid?.endsWith('@g.us')
                ) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ Perintah ini hanya bisa digunakan di dalam grup!'
                        },
                        msg
                    );

                    break;

                }

                const groupId =
                    msg.key.remoteJid;

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        text:
                            `✅ *ID Grup ini adalah:*\n\n` +
                            `\`${groupId}\`\n\n` +
                            `Silakan salin ID tersebut untuk kebutuhan push kontak.`
                    },
                    msg
                );

                break;

            }

            // OWN
            case 'own': {

                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                console.log(
                    `[OWNER CHECK] ${senderJID} => ${owner}`
                );

                if (!owner) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ ACCESS DENIED! You are not an owner.'
                        },
                        msg
                    );

                    break;

                }

                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU OWNER*
.addadmin
.deladmin
.addowner
.delowner
.addprem
.delprem
.kick
.linkgb
.warn

_© ${year} ${name} V${version}_
                `.trim();

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        caption
                    },
                    msg
                );

                break;

            }

            // =============================================
            // PCALL
            // =============================================

            case 'pcall': {

                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                if (!owner) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ ACCESS DENIED! You are not an owner.'
                        },
                        msg
                    );

                    break;

                }

                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU PUSH*
.push <id_grup> <delay_second> <pesan>
.pushv2 <delay_second> <pesan>
.save <id_grup>
.save2

_© ${year} ${name} V${version}_
                `.trim();

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        caption
                    },
                    msg
                );

                break;

            }

            // =============================================
            // PTERO
            // =============================================

            case 'ptero': {

                const caption = `
*NAME     :* ${name}
*VERSION  :* ${version}
*LANGUAGE :* JavaScript
*RUN TIME :* 24/7
*TIME     :* ${getWaktu()}
*SERVER   :* ${getServerInfo().platform} ${getServerInfo().arch}

*// ALL MENU PTERO*
.cadminp
.deladminp
.status
.sus
.cpanel
.dpanel
.stop
.start
.restart

_© ${year} ${name} V${version}_
                `.trim();

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        caption
                    },
                    msg
                );

                break;

            }

            // =============================================
            // PUSH
            // =============================================

            case 'push': {

                if (
                    args.length < 3
                ) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `❌ Format salah!\n` +
                                `Gunakan: .push <id_grup> <delay_detik> <pesan>`
                        },
                        msg
                    );

                    break;

                }

                const groupJid =
                    args[0];

                const delaySeconds =
                    parseInt(
                        args[1],
                        10
                    );

                const messageText =
                    args
                        .slice(2)
                        .join(' ');

                if (
                    !groupJid.endsWith('@g.us')
                ) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '⚠️ ID Grup harus berakhiran @g.us'
                        },
                        msg
                    );

                    break;

                }

                if (
                    isNaN(delaySeconds) ||
                    delaySeconds < 1
                ) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '⚠️ Delay harus berupa angka minimal 1 detik!'
                        },
                        msg
                    );

                    break;

                }

                try {

                    const report =
                        await executePushKontak(
                            sock,
                            groupJid,
                            delaySeconds,
                            messageText,
                            msg
                        );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `✅ Push Selesai!\n\n` +
                                `- Berhasil: ${report.successCount}\n` +
                                `- Gagal: ${report.failCount}`
                        },
                        msg
                    );

                } catch (error) {

                    logError(
                        error,
                        'EXECUTING .PUSH COMMAND'
                    );

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `❌ Error saat push kontak: ${error.message}`
                        },
                        msg
                    );

                }

                break;

            }

            case 'ttv1':{
                if(!await requireArgs(
                    sock,
                    msg,
                    '.ttv1 <url>',
                    '.ttv1 https://vt.tiktok.com/xxxx'
                )) break;
            }

            const urltarget = args.join(' ');

            
            
            // =============================================
            // VCF
            // =============================================

            case 'vcf': {

                const owner =
                    await isOwner(
                        senderJID,
                        sock
                    );

                if (!owner) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ ACCESS DENIED! You are not an owner.'
                        },
                        msg
                    );

                    break;

                }

                if (
                    args.length < 2
                ) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                `❌ *Format Salah!*\n\n` +
                                `Gunakan:\n` +
                                `.vcf <kata_kunci> <nomor1, nomor2, ...>\n\n` +
                                `Contoh:\n` +
                                `.vcf kontak 08123456789, 085812345678`
                        },
                        msg
                    );

                    break;

                }

                const customPrefix =
                    args[0];

                const rawNumbersInput =
                    args
                        .slice(1)
                        .join(' ');

                const numbers =
                    rawNumbersInput
                        .split(/[\n,\s]+/)
                        .map(
                            n =>
                                n.replace(
                                    /\D/g,
                                    ''
                                )
                        )
                        .filter(
                            n =>
                                n.length >= 8
                        );

                if (
                    numbers.length === 0
                ) {

                    await sendCommandResponse(
                        sock,
                        msg.key.remoteJid,
                        {
                            text:
                                '❌ Tidak ada nomor valid yang ditemukan!'
                        },
                        msg
                    );

                    break;

                }

                let vcardCollection =
                    '';

                numbers.forEach(
                    num => {

                        let formattedNum =
                            num;

                        if (
                            formattedNum.startsWith(
                                '0'
                            )
                        ) {

                            formattedNum =
                                '62' +
                                formattedNum.slice(1);

                        }

                        const random5Digits =
                            Math.floor(
                                10000 +
                                Math.random() *
                                90000
                            );

                        const contactName =
                            `${customPrefix}${formattedNum}C${random5Digits}`;

                        vcardCollection +=
                            `BEGIN:VCARD\n` +
                            `VERSION:3.0\n` +
                            `FN:${contactName}\n` +
                            `TEL;type=CELL;type=VOICE;waid=${formattedNum}:+${formattedNum}\n` +
                            `END:VCARD\n`;

                    }
                );

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {

                        document:
                            Buffer.from(
                                vcardCollection,
                                'utf-8'
                            ),

                        mimetype:
                            'text/vcard',

                        fileName:
                            `${customPrefix}_Contacts_${Date.now()}.vcf`,

                        caption:
                            `✅ Berhasil! File VCF dibuat dengan ${numbers.length} kontak.\n\n` +
                            `Format: ${customPrefix} + nohp + C + 5 angka random`

                    },
                    msg
                );

                break;

            }

            // =============================================
            // DEFAULT
            // =============================================

            default: {

                await sendCommandResponse(
                    sock,
                    msg.key.remoteJid,
                    {
                        text:
                            `❌ Command tidak ditemukan.\n\n` +
                            `Ketik *.help* untuk melihat daftar menu!`
                    },
                    msg
                );

                break;

            }

        }

    } catch (err) {

        logError(
            err,
            'HANDLE MESSAGE FUNCTION'
        );

        console.error(
            'Error tertangkap di handleMessage:',
            err
        );

    }

}