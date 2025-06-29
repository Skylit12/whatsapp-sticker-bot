const { makeWASocket, useMultiFileAuthState, downloadMediaMessage } = require("@whiskeysockets/baileys");
const fs = require("fs");
const { exec } = require("child_process");
const express = require("express");

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info");
  const sock = makeWASocket({ auth: state });

  sock.ev.on("connection.update", (update) => {
    const { connection, qr } = update;
    if (qr) console.log("📱 Scan this QR code:\n", qr);
    if (connection === "open") {
      console.log("✅ Connected to WhatsApp");
    } else if (connection === "close") {
      console.log("❌ Disconnected. Reconnecting...");
      startBot();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    console.log("📩 New message:", msg?.key?.remoteJid || "unknown");

    if (!msg.message || msg.key.fromMe) return;
    const sender = msg.key.remoteJid;

    const imageMessage = msg.message.imageMessage;
    const stickerMessage = msg.message.stickerMessage;

    if (imageMessage) {
      console.log("🖼 Image received from:", sender);
      const imgPath = "image.jpg";
      const outPath = "output.webp";

      [imgPath, outPath].forEach(file => fs.existsSync(file) && fs.unlinkSync(file));
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync(imgPath, buffer);

      const ffmpegCmd = `ffmpeg -y -i ${imgPath} -vf "scale=iw*min(512/iw\\,512/ih):ih*min(512/iw\\,512/ih),pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0" -vcodec libwebp -lossless 1 -q:v 50 -preset default -loop 0 -an -vsync 0 -pix_fmt yuva420p ${outPath}`;

      exec(ffmpegCmd, async (err) => {
        if (err) return console.error("❌ FFmpeg error:", err);
        const stickerBuffer = fs.readFileSync(outPath);
        await sock.sendMessage(sender, { sticker: stickerBuffer });
        console.log("✅ Sticker sent to", sender);
      });

    } else if (stickerMessage) {
      console.log("🧷 Sticker received from:", sender);
      const stickerPath = "sticker.webp";
      const outputImg = "converted.png";

      [stickerPath, outputImg].forEach(file => fs.existsSync(file) && fs.unlinkSync(file));
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync(stickerPath, buffer);

      const ffmpegCmd = `ffmpeg -y -i ${stickerPath} -pix_fmt rgba ${outputImg}`;
      exec(ffmpegCmd, async (err) => {
        if (err) return console.error("❌ FFmpeg error:", err);
        const imageBuffer = fs.readFileSync(outputImg);
        await sock.sendMessage(sender, { image: imageBuffer, mimetype: "image/png", caption: "" });
        console.log("✅ Image sent to", sender);
      });
    } else {
      console.log("⚠️ Not an image or sticker.");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();

// 🌐 Render keep-alive
const app = express();
app.get("/", (_, res) => res.send("✅ WhatsApp Sticker Bot is running"));
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Server is running on port", process.env.PORT || 3000);
});
