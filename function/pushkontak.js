import { delay } from '@whiskeysockets/baileys';

// Gunakan 'export async function' agar bisa di-import menggunakan kurung kurawal { executePushKontak }
export async function executePushKontak(sock, groupJid, delaySeconds, messageText, m) {
    try {
        const groupMetadata = await sock.groupMetadata(groupJid);
        const participants = groupMetadata.participants;

        await sock.sendMessage(m.key.remoteJid, { text: `⏳ Memulai push kontak ke ${participants.length} anggota...` }, { quoted: m });

        let successCount = 0;
        let failCount = 0;

        for (const participant of participants) {
            const memberJid = participant.id;

            // Lewati nomor bot sendiri
            if (memberJid === sock.user?.id) continue;

            try {
                await sock.sendMessage(memberJid, { text: messageText });
                successCount++;
                
                await delay(delaySeconds * 1000);
            } catch (err) {
                console.error(`Gagal kirim ke ${memberJid}:`, err);
                failCount++;
            }
        }

        return { successCount, failCount };
    } catch (error) {
        throw error;
    }
}