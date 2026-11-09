import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { crc32 } from "node:zlib";

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;
const ICON_SIZE = 512;
const BACKGROUND = [0xf5, 0xef, 0xe2];
const INK = [0x20, 0x21, 0x1e];
const ACCENT = [0xcc, 0x5b, 0x45];
const PAPER = [0xff, 0xfd, 0xf7];

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([length, body, checksum]);
}

function roundedSquare(x, y, size, radius) {
  return (px, py) => {
    if (px < x || py < y || px >= x + size || py >= y + size) return false;
    const dx = Math.min(px - x, x + size - 1 - px);
    const dy = Math.min(py - y, y + size - 1 - py);
    if (dx >= radius || dy >= radius) return true;
    return (radius - dx) ** 2 + (radius - dy) ** 2 <= radius ** 2;
  };
}

function encodePng(width, height, paint) {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  let offset = 0;
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0;
    offset += 1;
    for (let x = 0; x < width; x += 1) {
      const color = paint(x, y);
      raw[offset] = color[0];
      raw[offset + 1] = color[1];
      raw[offset + 2] = color[2];
      offset += 3;
    }
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const markSize = 280;
const markX = (OG_WIDTH - markSize) / 2;
const markY = 150;
const inMark = roundedSquare(markX, markY, markSize, 76);
const inInner = roundedSquare(markX + 88, markY + 88, markSize - 176, 26);

const barHeight = 22;
const barWidth = 420;
const barY = markY + markSize + 68;
const barX = (OG_WIDTH - barWidth) / 2;
const inBar = roundedSquare(barX, barY, barWidth, barHeight / 2);

const og = encodePng(OG_WIDTH, OG_HEIGHT, (x, y) => {
  if (inMark(x, y)) return inInner(x, y) ? PAPER : INK;
  if (inBar(x, y) && y < barY + barHeight) return ACCENT;
  return BACKGROUND;
});
writeFileSync("public/og.png", og);
console.log("wrote public/og.png " + OG_WIDTH + "x" + OG_HEIGHT + " " + og.length + " bytes");

const iconPad = 44;
const iconMark = roundedSquare(iconPad, iconPad, ICON_SIZE - iconPad * 2, 116);
const iconInner = roundedSquare(iconPad + 134, iconPad + 134, ICON_SIZE - iconPad * 2 - 268, 40);
const icon = encodePng(ICON_SIZE, ICON_SIZE, (x, y) => {
  if (iconMark(x, y)) return iconInner(x, y) ? PAPER : INK;
  return BACKGROUND;
});
writeFileSync("public/icon.png", icon);
console.log("wrote public/icon.png " + ICON_SIZE + "x" + ICON_SIZE + " " + icon.length + " bytes");

const svg = [
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">',
  '  <rect width="512" height="512" rx="112" fill="#20211e"/>',
  '  <rect x="178" y="178" width="156" height="156" rx="40" fill="#fffdf7"/>',
  "</svg>",
  "",
].join("\n");
writeFileSync("public/favicon.svg", svg);
console.log("wrote public/favicon.svg");
