const WebSocket = require("ws");

const url = process.env.TEENSY_WS || "ws://10.100.2.233";
const INTERVAL_MS = 50;

const buf = Buffer.alloc(300, 255);

const ws = new WebSocket(url);
let timer;

ws.on("open", () => {
  console.log("solid white →", url, `(${INTERVAL_MS}ms)  Ctrl+C to stop`);
  timer = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) return;
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
