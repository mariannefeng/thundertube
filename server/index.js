const bodyParser = require("body-parser");
const express = require("express");
const https = require("https");
const path = require("path");

const Database = require("./database.js").Database;
const Filesystem = require("./filesystem.js").Filesystem;
const DatabaseConfig = require("./databaseconfig.js").DatabaseConfig;

const app = express();
const server = require("http").createServer(app);
let database;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const AI_SYSTEM_PROMPT = `You generate JavaScript functions for controlling a strip of 100 RGB LEDs.

Return ONLY a single JavaScript function (no markdown, no explanation, no code fences):

function draw(previousFrame, tick) {
  // previousFrame: array of 300 numbers (previous LED state)
  // tick: Date.now() timestamp in milliseconds, use for animation timing
  // Return an array of exactly 300 numbers (100 LEDs x 3 RGB values)
  // Index 0-2 = LED 0 (R, G, B), Index 3-5 = LED 1 (R, G, B), etc.
  // Values 0-255.
}

CRITICAL rules:
- The ENTIRE code is re-evaluated every frame (~20fps). Do NOT declare variables outside the function. ALL state must live inside the function body.
- Use the tick parameter (Date.now() ms timestamp) for ALL time-based animation. Derive positions, colors, and phases from tick using Math.sin, modulo, etc.
- Do NOT use Math.random() — it causes flashing. Use deterministic math based on tick and LED index.
- Do NOT store state in outer scope variables or closures — they reset every frame.
- previousFrame can be used to read the prior frame's LED values for smooth transitions.
- Return an array of exactly 300 numbers, values 0-255.
- Make effects vivid, smooth, and visually interesting.
- Return ONLY the function, nothing else.`;

function callGemini(userPrompt) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: AI_SYSTEM_PROMPT }] },
      generationConfig: { temperature: 0.7 },
    });

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GEMINI_API_KEY}`;
    const parsed = new URL(url);

    const req = https.request(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: "POST",
        headers: { "Content-Type": "application/json" },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            if (json.error) return reject(new Error(json.error.message));
            const text = json.candidates[0].content.parts[0].text;
            resolve(text);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

if (DatabaseConfig.type === "local") {
  database = new Filesystem();
} else {
  database = new Database();
}

app
  .use(express.static(path.join(__dirname, "../client")))
  .use(bodyParser.json())
  .post("/loadallcodes", (req, res) => {
    database
      .loadAllCodes()
      .then((allCodes) => res.send(allCodes || {}))
      .catch((err) => {
        console.error(err);
        res.send({});
      });
  })
  .post("/saveallcodes", (req, res) => {
    if (!req.body) {
      res.status(400).send("Expecting JSON object.");
      return;
    }
    database
      .saveAllCodes(req.body)
      .then(() => res.send({ success: true }))
      .catch((err) => {
        console.error(err);
        res.send({ success: false });
      });
  })
  .post("/generate", (req, res) => {
    if (!GEMINI_API_KEY) {
      return res.json({ error: "GEMINI_API_KEY not set on server" });
    }
    const prompt = req.body && req.body.prompt;
    if (!prompt) {
      return res.json({ error: "No prompt provided" });
    }
    callGemini(prompt)
      .then((raw) => {
        const code = raw
          .replace(/```javascript\n?/gi, "")
          .replace(/```js\n?/gi, "")
          .replace(/```\n?/g, "")
          .trim();
        res.json({ code });
      })
      .catch((err) => {
        res.json({ error: err.message });
      });
  });

server.listen(5000, () => {
  console.log("Listening on port 5000...");

  database.connect(DatabaseConfig.PATH);
});
