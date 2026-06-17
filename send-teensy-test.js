const WebSocket = require("ws");

const url = process.env.TEENSY_WS || "ws://10.100.2.233";
const INTERVAL_MS = 50;

/** h: 0–360, s,v: 0–1 → RGB 0–255 */
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const i = Math.floor(h / 60);
  const f = h / 60 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  let r, g, b;
  switch (i) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    default:
      r = v;
      g = p;
      b = q;
      break;
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function fillFrame(buf) {
  const t = Date.now();
  const pulse = (Math.sin(t * 0.004) + 1) / 2;
  const whiteMix = pulse * 0.9;

  for (let i = 0; i < 100; i++) {
    const hue = (i / 100) * 360;
    const [r0, g0, b0] = hsvToRgb(hue, 1, 1);
    buf[i * 3] = Math.min(
      255,
      Math.round(r0 * (1 - whiteMix) + 255 * whiteMix),
    );
    buf[i * 3 + 1] = Math.min(
      255,
      Math.round(g0 * (1 - whiteMix) + 255 * whiteMix),
    );
    buf[i * 3 + 2] = Math.min(
      255,
      Math.round(b0 * (1 - whiteMix) + 255 * whiteMix),
    );
  }
}

const ws = new WebSocket(url);
const buf = Buffer.alloc(300);
let timer;

ws.on("open", () => {
  console.log(
    "rainbow + pulsing white →",
    url,
    `(${INTERVAL_MS}ms)  Ctrl+C to stop`,
  );
  timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
    fillFrame(buf);
    ws.send(buf);
  }, INTERVAL_MS);
});

ws.on("close", () => {
  if (timer) clearInterval(timer);
});

ws.on("error", (e) => {
  console.error(e.message);
  if (timer) clearInterval(timer);
  process.exit(1);
});

function shutdown() {
  if (timer) clearInterval(timer);
  ws.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
