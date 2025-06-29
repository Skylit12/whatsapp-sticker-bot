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

      // Clean up previous files if exist
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
      if (fs.existsSync(outPath)) fs.unlinkSync(outPath);

      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync(imgPath, buffer);

      // Run FFmpeg with overwrite enabled and logging
      exec(
        `ffmpeg -y -i ${imgPath} -vf "scale=512:512:force_original_aspect_ratio=decrease" -vcodec libwebp -lossless 1 -q:v 50 -preset default -loop 0 -an -vsync 0 ${outPath}`,
        async (err, stdout, stderr) => {
          if (err) {
            console.error("❌ FFmpeg error:", err);
            console.error("🔧 FFmpeg stderr:", stderr);
            return;
          }

          console.log("🛠️ FFmpeg finished");
          const stickerBuffer = fs.readFileSync(outPath);
          await sock.sendMessage(sender, { sticker: stickerBuffer });
          console.log("✅ Sticker sent to", sender);
        }
      );
    } else {
      console.log("⚠️ Not an image. Ignoring.");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();

// Express web server (for Render to stay live)
const app = express();
app.get("/", (req, res) => res.send("✅ WhatsApp Sticker Bot is running"));
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Server is running on port", process.env.PORT || 3000);
});
