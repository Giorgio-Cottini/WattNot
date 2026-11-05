// Renders icon.svg and splash.svg to the PNG files of release/icon/.
// Usage, from this directory: node render.cjs
// Needs Playwright with Chromium (npm i -g playwright && npx playwright install chromium).
// Chromium draws the SVG on a canvas at each target size, so the CSS colour
// variables apply. This script writes the PNG itself: RGB without alpha for the
// icon, which App Store Connect requires, and RGBA for the splash.

const { readFileSync, writeFileSync } = require("node:fs");
const { crc32, deflateSync } = require("node:zlib");
const { chromium } = require("playwright");

const OUTPUTS = [
  { svg: "icon.svg", png: "icon-1024.png", size: 1024, alpha: false },
  { svg: "icon.svg", png: "preview-180.png", size: 180, alpha: false },
  { svg: "icon.svg", png: "preview-58.png", size: 58, alpha: false },
  { svg: "splash.svg", png: "splash.png", size: 1024, alpha: true },
];

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

// rgba: size * size * 4 bytes. Colour type 2 (RGB) or 6 (RGBA), 8 bits, no filter.
function encodePng(rgba, size, alpha) {
  const channels = alpha ? 4 : 3;
  const raw = Buffer.alloc(size * (size * channels + 1));
  for (let y = 0; y < size; y++) {
    const row = y * (size * channels + 1);
    for (let x = 0; x < size; x++) {
      const src = (y * size + x) * 4;
      const dst = row + 1 + x * channels;
      for (let c = 0; c < channels; c++) raw[dst + c] = rgba[src + c];
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const { svg, png, size, alpha } of OUTPUTS) {
    const url = `data:image/svg+xml;base64,${readFileSync(svg).toString("base64")}`;
    const rgba = await page.evaluate(
      async ({ url, size }) => {
        const image = new Image();
        image.src = url;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, size, size);
        return Array.from(context.getImageData(0, 0, size, size).data);
      },
      { url, size },
    );
    if (!alpha && rgba.some((value, i) => i % 4 === 3 && value !== 255)) {
      throw new Error(`${svg} has transparent pixels at ${size} px: the icon must be opaque`);
    }
    writeFileSync(png, encodePng(Buffer.from(rgba), size, alpha));
    console.log(`${png}: ${size} x ${size}, ${alpha ? "RGBA" : "RGB"}`);
  }
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
