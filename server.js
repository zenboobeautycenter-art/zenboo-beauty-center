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
const SITE_USER = process.env.SITE_USER || "zenboo";
const SITE_PASSWORD = process.env.SITE_PASSWORD || "";
const BOOKING_WEBHOOK_URL = process.env.BOOKING_WEBHOOK_URL || "";
const ADMIN_WHATSAPP_PHONE = process.env.ADMIN_WHATSAPP_PHONE || "";
const formatTime12 = (time) => {
  const [hourText, minute = "00"] = String(time || "").split(":");
  let hour = Number(hourText);
  if (Number.isNaN(hour)) return time || "";
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute.padStart(2, "0")} ${suffix}`;
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const publicPaths = new Set(["/reservar", "/reservar.html", "/public-booking.js"]);

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

const sendBookingNotification = async (appointment) => {
  if (!BOOKING_WEBHOOK_URL) return;

  try {
    await fetch(BOOKING_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "new_appointment",
        business: "ZENBOO Beauty Center",
        appointment,
      }),
    });
  } catch {
    // La cita se guarda aunque falle la notificacion externa.
  }
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

const isAuthorized = (req) => {
  if (!SITE_PASSWORD) return true;

  const header = req.headers.authorization || "";
  if (!header.startsWith("Basic ")) return false;

  const credentials = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = credentials.indexOf(":");
  const user = credentials.slice(0, separator);
  const password = credentials.slice(separator + 1);
  return user === SITE_USER && password === SITE_PASSWORD;
};

const requestLogin = (res) => {
  res.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="ZENBOO Beauty Center"',
    "Content-Type": "text/plain; charset=utf-8",
  });
  res.end("Acceso protegido");
};

const serveFile = (req, res) => {
  const routePath = decodeURIComponent(req.url.split("?")[0]);
  const requestedPath = routePath === "/" ? "/index.html" : routePath === "/reservar" ? "/reservar.html" : routePath;
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

  if (req.url === "/api/public-booking-data" && req.method === "GET") {
    const getData = hasSupabase() ? readCloudData().catch(() => readData()) : Promise.resolve(readData());
    getData.then((data) => {
      sendJson(res, 200, {
        employees: data.employees.map((employee) => ({
          id: employee.id,
          name: employee.name,
          role: employee.role || "",
        })),
        appointments: data.appointments.map((appointment) => ({
          employeeId: appointment.employeeId,
          dateIso: appointment.dateIso,
          time: appointment.time,
          status: appointment.status,
        })),
        settings: {
          businessName: data.settings.businessName || "ZENBOO Beauty Center",
          instagramUrl: data.settings.instagramUrl || "",
          appointmentHours: data.settings.appointmentHours || [],
        },
      });
    });
    return;
  }

  if (req.url === "/api/public-booking" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 100_000) req.destroy();
    });
    req.on("end", async () => {
      try {
        const booking = JSON.parse(body || "{}");
        const data = hasSupabase() ? await readCloudData().catch(() => readData()) : readData();
        const employee = data.employees.find((item) => item.id === booking.employeeId);
        const exists = data.appointments.some(
          (item) =>
            item.employeeId === booking.employeeId &&
            item.dateIso === booking.dateIso &&
            item.time === booking.time &&
            item.status !== "Cancelada"
        );

        if (!employee || exists || !booking.clientName || !booking.phone || !booking.dateIso || !booking.time) {
          sendJson(res, 400, { ok: false, error: "Cita no disponible" });
          return;
        }

        const appointment = {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          clientName: String(booking.clientName).trim(),
          phone: String(booking.phone).trim(),
          service: String(booking.service || "Unas").trim(),
          employeeId: employee.id,
          employeeName: employee.name,
          employeePhone: employee.phone || "",
          dateIso: booking.dateIso,
          time: booking.time,
          status: "Pendiente",
          createdAt: new Date().toISOString(),
          source: "Link publico",
          employeeWhatsappMessage: `Nueva cita en ZENBOO Beauty Center: ${String(booking.clientName).trim()}, servicio ${String(booking.service || "Unas").trim()}, fecha ${booking.dateIso}, hora ${formatTime12(booking.time)}. Telefono clienta: ${String(booking.phone).trim()}.`,
          adminWhatsappPhone: ADMIN_WHATSAPP_PHONE,
          adminWhatsappMessage: `Nueva cita en ZENBOO Beauty Center: ${String(booking.clientName).trim()} agendo ${String(booking.service || "Unas").trim()} con ${employee.name} para el ${booking.dateIso} a las ${formatTime12(booking.time)}. Telefono: ${String(booking.phone).trim()}.`,
        };

        data.appointments.push(appointment);

        writeData(data);
        if (hasSupabase()) await writeCloudData(data);
        await sendBookingNotification(appointment);
        sendJson(res, 200, { ok: true });
      } catch {
        sendJson(res, 400, { ok: false, error: "Datos invalidos" });
      }
    });
    return;
  }

  const pathname = req.url.split("?")[0];
  if (!publicPaths.has(pathname) && !isAuthorized(req)) {
    requestLogin(res);
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
      protected: Boolean(SITE_PASSWORD),
      bookingWebhook: Boolean(BOOKING_WEBHOOK_URL),
      adminWhatsapp: Boolean(ADMIN_WHATSAPP_PHONE),
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
