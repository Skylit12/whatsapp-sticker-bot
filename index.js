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
    if (connection === "open") console.log("✅ Connected to WhatsApp");
    else if (connection === "close") {
      console.log("❌ Disconnected. Reconnecting...");
      startBot();
    }
  });

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const msg = messages[0];
    if (!msg?.message || msg.key.fromMe) return;
    const sender = msg.key.remoteJid;
    const msgType = msg.message;

    // Cleanup old files
    ["jpg", "png", "webp", "mp4"].forEach(ext => {
      ["media_input", "media_output"].forEach(file => {
        const path = `${file}.${ext}`;
        if (fs.existsSync(path)) fs.unlinkSync(path);
      });
    });

    // IMAGE → STICKER
    if (msgType.imageMessage) {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync("media_input.jpg", buffer);
      const cmd = `ffmpeg -y -i media_input.jpg -vf "scale=iw*min(512/iw\\,512/ih):ih*min(512/iw\\,512/ih),pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0" -vcodec libwebp -lossless 1 -q:v 50 -preset default -loop 0 -an -vsync 0 -pix_fmt yuva420p media_output.webp`;
      exec(cmd, async (err) => {
        if (err) return console.error("❌ Image → Sticker error:", err);
        const sticker = fs.readFileSync("media_output.webp");
        await sock.sendMessage(sender, { sticker });
        console.log("✅ Image → Sticker sent");
      });
    }

    // VIDEO (≤6s) → STICKER
    else if (msgType.videoMessage) {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync("media_input.mp4", buffer);
      const cmd = `ffmpeg -y -i media_input.mp4 -t 6 -vf "scale=512:512:force_original_aspect_ratio=decrease,pad=512:512:(ow-iw)/2:(oh-ih)/2:color=white@0,fps=15" -vcodec libwebp -loop 0 -an -vsync 0 -preset default media_output.webp`;
      exec(cmd, async (err) => {
        if (err) return console.error("❌ Video → Sticker error:", err);
        const sticker = fs.readFileSync("media_output.webp");
        await sock.sendMessage(sender, { sticker });
        console.log("✅ Video → Sticker sent");
      });
    }

    // STICKER → IMAGE (static)
    else if (msgType.stickerMessage && !msgType.stickerMessage.isAnimated) {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync("media_input.webp", buffer);
      const cmd = `ffmpeg -y -i media_input.webp -pix_fmt rgba media_output.png`;
      exec(cmd, async (err) => {
        if (err) return console.error("❌ Sticker → Image error:", err);
        const image = fs.readFileSync("media_output.png");
        await sock.sendMessage(sender, { image, mimetype: "image/png" });
        console.log("✅ Sticker → Image sent");
      });
    }

    // STICKER → VIDEO (animated)
    else if (msgType.stickerMessage && msgType.stickerMessage.isAnimated) {
      const buffer = await downloadMediaMessage(msg, "buffer", {}, { logger: console });
      fs.writeFileSync("media_input.webp", buffer);
      const cmd = `ffmpeg -y -i media_input.webp -movflags faststart -pix_fmt yuv420p -vf "fps=15,scale=512:-1:flags=lanczos" media_output.mp4`;
      exec(cmd, async (err) => {
        if (err) return console.error("❌ Sticker → Video error:", err);
        const video = fs.readFileSync("media_output.mp4");
        await sock.sendMessage(sender, { video });
        console.log("✅ Sticker → Video sent");
      });
    }

    else {
      console.log("⚠️ Unsupported message type");
    }
  });

  sock.ev.on("creds.update", saveCreds);
}

startBot();

const app = express();
app.get("/", (_, res) => res.send("✅ WhatsApp Sticker Bot is running"));
app.listen(process.env.PORT || 3000, () => {
  console.log("🌐 Server is running on port", process.env.PORT || 3000);
});
