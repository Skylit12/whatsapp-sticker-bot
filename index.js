const { makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const { exec } = require("child_process");
const express = require("express");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");

  const sock = makeWASocket({ auth: state });

  // QR Code and connection handling
  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;
    if (qr) {
      console.log("📱 Scan this QR code:\n", qr);
    }
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    } else if (connection === "close") {
      console.log("❌ Disconnected. Reconnecting...");
      startBot(); // Retry on disconnect
    }
  });

  // Message handler
  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    console.log("📩 New message:", msg?.key?.remoteJid || "unknown");

    if (!msg.message || msg.key.fromMe) return;

    const sender = msg.key.remoteJid;
    const imageMessage = msg.message.imageMessage;

    if (imageMessage) {
      console.log("🖼 Image received from:", sender);

      const imgPath = "image.jpg";
      const outPath = "output.webp";

      // Remove old files
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync(imgPath, buffer);

      // FFmpeg command to maintain aspect ratio with padding
      const ffmpegCmd = `ffmpeg -y -i ${imgPath} -vf "scale=iw*min(512/iw\\,512/ih):ih*min(512/iw\\,512/ih),pad=512:512:(512-iw*min(512/iw\\,512/ih))/2:(512-ih*min(512/iw\\,512/ih))/2:color=0x00000000" -vcodec libwebp -lossless 1 -q:v 50 -preset default -loop 0 -an -vsync 0 ${outPath}`;

      exec(ffmpegCmd, async (err, stdout, stderr) => {
        if (err) {
          console.error("❌ FFmpeg error:", err);
          console.error("🔧 FFmpeg stderr:", stderr);
          return;
        }

        console.log("🛠️ FFmpeg finished");
        const stickerBuffer = fs.readFileSync(outPath);
        await sock.sendMessage(sender, { sticker: stickerBuffer });
        console.log("✅ Sticker sent to", sender);
      });
    } else {
      console.log("⚠️ Not an image. Ignoring.");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();

// Express server for Render
const app = express();
app.get("/", (req, res) => res.send("✅ WhatsApp Sticker Bot is running"));
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Server is running on port", process.env.PORT || 3000);
});
