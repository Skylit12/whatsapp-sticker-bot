const { makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const { exec } = require("child_process");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const imageMessage = msg.message.imageMessage;

    if (imageMessage) {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync("image.jpg", buffer);

      exec(`ffmpeg -i image.jpg -vf "scale=512:512:force_original_aspect_ratio=decrease" -vcodec libwebp -lossless 1 -q:v 50 -preset default -loop 0 -an -vsync 0 output.webp`, async (err) => {
        if (!err) {
          const stickerBuffer = fs.readFileSync("output.webp");
          await sock.sendMessage(sender, { sticker: stickerBuffer });
        }
      });
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();
