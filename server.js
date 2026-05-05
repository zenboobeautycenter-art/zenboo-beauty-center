const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const loadEnvFile = () => {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;

  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) return;
      const [key, ...valueParts] = trimmed.split("=");
      if (!process.env[key]) {
        process.env[key] = valueParts.join("=").trim();
      }
    });
};

loadEnvFile();

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, "zenboo-data.json");
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || "";
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || "zenboo_app_state";
const APP_STATE_ID = process.env.APP_STATE_ID || "main";

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const emptyData = {
  clients: [],
  services: [],
  employees: [],
  appointments: [],
  invoices: [],
  deductions: [],
  expenses: [],
  payrollPayments: [],
  dailyClosings: [],
  settings: { ncfType: "B02", ncfNext: 1, instagramUrl: "" },
};

const readData = () => {
  if (!fs.existsSync(DATA_FILE)) return emptyData;
  try {
    return { ...emptyData, ...JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) };
  } catch {
    return emptyData;
  }
};

const writeData = (data) => {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ ...emptyData, ...data }, null, 2));
};

const hasSupabase = () => SUPABASE_URL && SUPABASE_SERVICE_KEY;

const supabaseRequest = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      apikey: SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Supabase respondio ${response.status}`);
  }

  return response.json();
};

const readCloudData = async () => {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?id=eq.${encodeURIComponent(APP_STATE_ID)}&select=data`;
  const rows = await supabaseRequest(url);
  return rows[0]?.data ? { ...emptyData, ...rows[0].data } : emptyData;
};

const writeCloudData = async (data) => {
  const url = `${SUPABASE_URL}/rest/v1/${SUPABASE_TABLE}?on_conflict=id`;
  const payload = {
    id: APP_STATE_ID,
    data: { ...emptyData, ...data },
    updated_at: new Date().toISOString(),
  };

  await supabaseRequest(url, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(payload),
  });
};

const sendJson = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
};

const serveFile = (req, res) => {
  const requestedPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("No encontrado");
    return;
  }

  const ext = path.extname(filePath);
  res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
};

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.url === "/api/data" && req.method === "GET") {
    if (!hasSupabase()) {
      sendJson(res, 200, readData());
      return;
    }

    readCloudData()
      .then((data) => sendJson(res, 200, data))
      .catch(() => sendJson(res, 200, readData()));
    return;
  }

  if (req.url === "/api/status" && req.method === "GET") {
    sendJson(res, 200, {
      database: hasSupabase() ? "supabase" : "local",
      table: SUPABASE_TABLE,
      appStateId: APP_STATE_ID,
    });
    return;
  }

  if (req.url === "/api/data" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");
        writeData(data);
        if (hasSupabase()) {
          await writeCloudData(data);
        }
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false, error: "Datos invalidos" });
      }
    });
    return;
  }

  serveFile(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`ZENBOO listo en http://localhost:${PORT}`);
  console.log(hasSupabase() ? "Base de datos: Supabase" : "Base de datos: archivo local");
});
