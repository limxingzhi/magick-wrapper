const express = require("express");
const { execFile: execFileCb } = require("child_process");
const { promisify } = require("util");
const execFile = promisify(execFileCb);
const { unlink, mkdtemp, writeFile, rm } = require("fs/promises");
const { tmpdir } = require("os");
const { join } = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const IM_BIN = process.env.IM_BIN || "magick";

async function resolveFont(name) {
  try {
    const { stdout } = await execFile("fc-match", [name, "-f", "%{file}"]);
    return stdout.trim();
  } catch {
    return name;
  }
}

async function getImageDimensions(inputPath) {
  const { stdout } = await execFile(IM_BIN, ["identify", "-format", "%w %h", inputPath]);
  const [w, h] = stdout.trim().split(" ").map(Number);
  return { width: w, height: h };
}

function interlineSpacing(lineHeight, fontSize) {
  return Math.round((lineHeight - 1) * fontSize);
}

async function measureCaption(text, fontPath, fontSize, maxW, lineSpacing) {
  const args = [
    "-size", `${maxW}x`,
    "-font", fontPath,
    "-pointsize", String(fontSize),
    "-interline-spacing", String(lineSpacing),
    "caption:" + text,
    "-format", "%w %h",
    "info:",
  ];
  const { stdout } = await execFile(IM_BIN, args);
  const [w, h] = stdout.trim().split(" ").map(Number);
  return { width: w, height: h };
}

async function fitCaption(text, fontPath, maxFontSize, maxWidth, maxHeight, lineHeight) {
  const MIN_FONT_SIZE = 10;
  let fontSize = maxFontSize;
  let lineSpacing = interlineSpacing(lineHeight, fontSize);
  let m = await measureCaption(text, fontPath, fontSize, maxWidth, lineSpacing);

  if (m.height <= maxHeight && m.width <= maxWidth) {
    return { fontSize, textWidth: m.width, textHeight: m.height };
  }

  fontSize = Math.floor(fontSize * Math.min(maxWidth / m.width, maxHeight / m.height));
  fontSize = Math.max(fontSize, MIN_FONT_SIZE);
  lineSpacing = interlineSpacing(lineHeight, fontSize);
  m = await measureCaption(text, fontPath, fontSize, maxWidth, lineSpacing);
  return { fontSize, textWidth: m.width, textHeight: m.height };
}

async function downloadToTemp(url) {
  const dir = await mkdtemp(join(tmpdir(), "magick-"));

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status} ${res.statusText}`);

  const contentType = res.headers.get("content-type") || "";
  let ext = "jpg";

  if (contentType.includes("png")) ext = "png";
  else if (contentType.includes("webp")) ext = "webp";
  else if (contentType.includes("jpeg")) ext = "jpg";

  const dest = join(dir, `input.${ext}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) throw new Error("Downloaded file is empty");
  await writeFile(dest, buffer);
  return dest;
}

function buildArgs(inputPath, opts) {
  const {
    text,
    fontSize,
    color,
    fontPath,
    lineHeight,
    gravity,
    xOffset,
    yOffset,
    quality,
    maxTextWidth,
  } = opts;

  const lineSpacing = interlineSpacing(lineHeight, fontSize);
  const geometry = `+${xOffset}+${yOffset}`;
  const captionArg = "caption:" + text;
  const sizeArg = `${maxTextWidth}x`;

  const args = [inputPath];

  args.push(
    "(", "-size", sizeArg, "-background", "none",
    "-gravity", "center",
    "-font", fontPath, "-pointsize", String(fontSize),
    "-interline-spacing", String(lineSpacing),
    "-fill", color, "-stroke", "none",
    captionArg,
    ")",
    "-gravity", gravity, "-geometry", geometry, "-composite"
  );

  args.push("-quality", String(quality));
  args.push("jpg:-");

  return args;
}

app.get("/caption", async (req, res) => {
  const { url, text } = req.query;

  if (!url || !text) {
    return res.status(400).json({ error: "Missing required params: url, text" });
  }

  const requestedFont = req.query.font || "Noto Sans CJK SC";
  const lineHeight = parseFloat(req.query.lineHeight) || 1.3;
  const maxFontSize = parseInt(req.query.fontSize, 10) || 64;
  const maxWidthPct = parseFloat(req.query.maxWidthPct) || 0.85;

  let inputPath;

  try {
    inputPath = await downloadToTemp(url);
    const fontPath = await resolveFont(requestedFont);
    const { width: imgW, height: imgH } = await getImageDimensions(inputPath);
    const maxWidth = Math.floor(imgW * maxWidthPct);
    const maxHeight = Math.floor(imgH * 0.4);

    const { fontSize } = await fitCaption(text, fontPath, maxFontSize, maxWidth, maxHeight, lineHeight);

    const opts = {
      text,
      fontSize,
      color: req.query.color || "white",
      fontPath,
      lineHeight,
      gravity: req.query.gravity || "center",
      xOffset: parseInt(req.query.x, 10) || 0,
      yOffset: parseInt(req.query.y, 10) || 50,
      quality: parseInt(req.query.quality, 10) || 90,
      maxTextWidth: maxWidth,
    };

    const args = buildArgs(inputPath, opts);

    const { stdout } = await execFile(IM_BIN, args, { maxBuffer: 50 * 1024 * 1024, encoding: "buffer" });

    res.set({
      "Content-Type": "image/jpeg",
      // "Content-Disposition": 'attachment; filename="wallpaper.jpg"',
      "Content-Length": stdout.length,
    });
    res.send(stdout);
  } catch (err) {
    console.error("Error:", err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  } finally {
    if (inputPath) {
      try { await rm(join(inputPath, ".."), { recursive: true }); } catch {}
    }
  }
});

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`magick-wrapper listening on port ${PORT}`);
});
