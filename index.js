import makeWASocket, {
    DisconnectReason,
    useMultiFileAuthState,
    Browsers
} from '@whiskeysockets/baileys';

import P from 'pino';
import readline from 'readline';
import fs from 'fs';
import chalk from 'chalk';

import { handleMessage } from './cmd.js';

const CONFIG = {
    session: './session',
    password: 'XinPemula135',
    browser: Browsers.macOS('Safari'),
    reconnect: 3000
};

export let sock = null;
export let isConnected = false;
export let botNumber = null;

// ======================================================
// LID -> PHONE CACHE
// ======================================================

const lidToPhone = new Map();


// ======================================================
// GLOBAL ERROR LOGGER
// ======================================================

function logGlobalError(error, context = '') {
    const timestamp = new Date().toLocaleString(
        'id-ID',
        {
            timeZone: 'Asia/Jakarta'
        }
    );

    const logMessage =
        `[${timestamp}] [GLOBAL ERROR: ${context}] ${
            error.stack || error.message
        }\n--------------------------------------------------\n`;

    fs.appendFile(
        'error.log',
        logMessage,
        (err) => {
            if (err) {
                console.error(
                    'Gagal menulis ke error.log:',
                    err
                );
            }
        }
    );
}


// ======================================================
// GET PHONE FROM LID
// ======================================================

async function getPhoneFromLid(lid) {
    try {

        if (!lid) {
            return null;
        }

        // Bukan LID
        if (!lid.endsWith('@lid')) {
            return lid;
        }

        // Cek cache
        if (lidToPhone.has(lid)) {
            return lidToPhone.get(lid);
        }

        // ==================================================
        // BAILEYS LID MAPPING
        // ==================================================

        const mapping =
            sock?.signalRepository?.lidMapping;

        if (
            mapping &&
            typeof mapping.getPNForLID === 'function'
        ) {

            const phone =
                await mapping.getPNForLID(lid);

            if (phone) {

                const result =
                    phone.endsWith('@s.whatsapp.net')
                        ? phone
                        : `${phone}@s.whatsapp.net`;

                lidToPhone.set(
                    lid,
                    result
                );

                console.log(
                    `[LID -> PHONE] ${lid} => ${result}`
                );

                return result;
            }
        }

    } catch (error) {

        logGlobalError(
            error,
            'GET PHONE FROM LID'
        );

    }

    return null;
}


// ======================================================
// RESOLVE MESSAGE LID
// ======================================================

async function resolveMessageLid(msg) {
    try {

        if (!msg?.key) {
            return;
        }

        const participant =
            msg.key.participant;

        // Kalau bukan LID tidak perlu diproses
        if (
            !participant ||
            !participant.endsWith('@lid')
        ) {
            return;
        }

        const phone =
            await getPhoneFromLid(
                participant
            );

        if (
            phone &&
            phone.endsWith('@s.whatsapp.net')
        ) {

            /*
            Jangan mengubah participant asli
            karena bisa digunakan oleh Baileys.

            Kita simpan nomor asli di participantAlt.
            */

            msg.key.participantAlt =
                phone;
        }

    } catch (error) {

        logGlobalError(
            error,
            'RESOLVE MESSAGE LID'
        );

    }
}


// ======================================================
// READLINE
// ======================================================

const ask = q =>
    new Promise(resolve => {

        const rl =
            readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });

        rl.question(
            q,
            a => {
                rl.close();
                resolve(a);
            }
        );

    });


// ======================================================
// SLEEP
// ======================================================

const sleep = ms =>
    new Promise(
        r => setTimeout(r, ms)
    );


// ======================================================
// LOGIN
// ======================================================

async function login() {

    console.clear();

    console.log(
        chalk.blue('\n╔════════════════════════════╗')
    );

    console.log(
        '║      XIN WHATSAPP BOT      ║'
    );

    console.log(
      chalk.red('╚════════════════════════════╝\n')
    );

    const pw =
        await ask(
            chalk.green('🔐 Password: ')
        );

    if (
        pw !== CONFIG.password
    ) {

        console.log(
            '\n❌ Password salah.\n'
        );

        process.exit(1);
    }

    console.log(
        '\n✅ Login berhasil.\n'
    );
}


// ======================================================
// START BOT
// ======================================================

async function startBot() {

    const {
        state,
        saveCreds
    } =
        await useMultiFileAuthState(
            CONFIG.session
        );

    sock =
        makeWASocket({

            auth: state,

            browser:
                CONFIG.browser,

            printQRInTerminal:
                false,

            logger:
                P({
                    level: 'silent'
                }),

            connectTimeoutMs:
                60000,

            defaultQueryTimeoutMs:
                60000,

            keepAliveIntervalMs:
                25000,

            markOnlineOnConnect:
                false,

            syncFullHistory:
                false
        });


    // ==================================================
    // SAVE CREDENTIAL
    // ==================================================

    sock.ev.on(
        'creds.update',
        saveCreds
    );


    // ==================================================
    // PESAN MASUK
    // ==================================================

    sock.ev.on(
        'messages.upsert',
        async ({
            messages,
            type
        }) => {

            try {

                // Hanya pesan baru
                if (
                    type !== 'notify'
                ) {
                    return;
                }

                // ==================================================
                // LID -> PHONE
                // ==================================================

                for (
                    const msg
                    of messages
                ) {

                    await resolveMessageLid(
                        msg
                    );

                }

                // ==================================================
                // HANDLE MESSAGE
                // ==================================================

                await handleMessage(
                    sock,
                    messages
                );

            } catch (err) {

                logGlobalError(
                    err,
                    'MESSAGES.UPSERT EVENT'
                );

                console.error(
                    'Error pada event messages.upsert:',
                    err
                );

            }

        }
    );


    // ==================================================
    // CONNECTION UPDATE
    // ==================================================

    sock.ev.on(
        'connection.update',
        async ({
            connection,
            qr,
            lastDisconnect
        }) => {

            // ==================================================
            // CONNECTING
            // ==================================================

            if (
                connection ===
                'connecting'
            ) {

                console.log(
                    '[•] Connecting...'
                );

            }


            // ==================================================
            // PAIRING
            // ==================================================

            if (
                qr &&
                !state.creds.registered
            ) {

                try {

                    let number =
                        await ask(
                            '\n📱 Nomor: '
                        );

                    number =
                        number.replace(
                            /\D/g,
                            ''
                        );

                    if (
                        number.startsWith(
                            '0'
                        )
                    ) {

                        number =
                            '62' +
                            number.slice(
                                1
                            );

                    }

                    if (
                        !/^62\d{8,15}$/.test(
                            number
                        )
                    ) {

                        console.log(
                            '❌ Nomor tidak valid.'
                        );

                        return;
                    }

                    await sleep(
                        1000
                    );

                    const code =
                        await sock.requestPairingCode(
                            number
                        );

                    const pairing =
                        code
                            .match(
                                /.{1,4}/g
                            )
                            ?.join('-') ||
                        code;

                    console.log(
                        `\n🔑 Pairing: ${pairing}`
                    );

                    console.log(
                        '→ WhatsApp > Perangkat tertaut'
                    );

                    console.log(
                        '→ Tautkan dengan nomor telepon\n'
                    );

                } catch (err) {

                    logGlobalError(
                        err,
                        'PAIRING CODE GENERATION'
                    );

                    console.log(
                        '❌ Pairing error:',
                        err.message
                    );

                }

            }

            // ONLINE
           

            if (
                connection ===
                'open'
            ) {

                isConnected =
                    true;

                botNumber =
                    sock.user
                        ?.id
                        ?.split(':')[0]
                        ?.split('@')[0] ||
                    null;

                console.log(
                    `\n🟢 ONLINE | ${botNumber}\n`
                );

            }


            
            // CLOSE

            if (
                connection ===
                'close'
            ) {

                isConnected =
                    false;

                const code =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode;

                if (
                    code ===
                    DisconnectReason.loggedOut
                ) {

                    console.log(
                        '🔴 Logout.'
                    );

                    return;
                }

                console.log(
                    `🔄 Reconnect (${code})...`
                );

                setTimeout(
                    startBot,
                    CONFIG.reconnect
                );

            }

        }
    );


    return sock;
}



// START

await login();

await startBot();