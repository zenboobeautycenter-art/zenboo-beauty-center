const money = new Intl.NumberFormat("es-DO", {
  style: "currency",
  currency: "DOP",
});

const read = (key, fallback) => JSON.parse(localStorage.getItem(key)) || fallback;
const API_URL = "/api/data";

let store = {
  clients: read("zenboo_clients", []),
  services: read("zenboo_services", []),
  employees: read("zenboo_employees", []),
  appointments: read("zenboo_appointments", []),
  invoices: read("zenboo_invoices", []),
  deductions: read("zenboo_deductions", []),
  expenses: read("zenboo_expenses", []),
  payrollPayments: read("zenboo_payroll_payments", []),
  dailyClosings: read("zenboo_daily_closings", []),
  settings: read("zenboo_settings", {
    ncfType: "B02",
    ncfNext: 1,
    instagramUrl: "",
    businessName: "ZENBOO Beauty Center",
    electronicEnabled: "no",
    businessRnc: "",
    showBusinessRnc: "yes",
    businessPhone: "",
    businessAddress: "",
    businessEmail: "",
    appointmentHours: ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"],
    dgiiEnvironment: "Pruebas",
    adminPassword: "1234",
  }),
};

const defaultAdminPassword = "1234";
const protectedTabs = ["negocio", "empleadas", "nomina", "contabilidad"];
let unlockedTabs = JSON.parse(sessionStorage.getItem("zenboo_unlocked_tabs")) || [];
let serverLoaded = false;

const migrateOldData = () => {
  store.invoices = store.invoices.map((invoice) => {
    const withDefaults = { paymentMethod: invoice.paymentMethod || "Efectivo", ...invoice };
    if (withDefaults.employeeId || !withDefaults.employeeName) return withDefaults;
    const employee = store.employees.find((item) => item.name === invoice.employeeName);
    return employee ? { ...withDefaults, employeeId: employee.id, payrollPaid: false } : withDefaults;
  });
};

const save = () => {
  saveLocal();
  saveToServer();
};

const saveLocal = () => {
  localStorage.setItem("zenboo_clients", JSON.stringify(store.clients));
  localStorage.setItem("zenboo_services", JSON.stringify(store.services));
  localStorage.setItem("zenboo_employees", JSON.stringify(store.employees));
  localStorage.setItem("zenboo_appointments", JSON.stringify(store.appointments));
  localStorage.setItem("zenboo_invoices", JSON.stringify(store.invoices));
  localStorage.setItem("zenboo_deductions", JSON.stringify(store.deductions));
  localStorage.setItem("zenboo_expenses", JSON.stringify(store.expenses));
  localStorage.setItem("zenboo_payroll_payments", JSON.stringify(store.payrollPayments));
  localStorage.setItem("zenboo_daily_closings", JSON.stringify(store.dailyClosings));
  localStorage.setItem("zenboo_settings", JSON.stringify(store.settings));
};

const saveToServer = () => {
  if (!serverLoaded) return;
  fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(store),
  }).catch(() => {});
};

const loadFromServer = async () => {
  try {
    const response = await fetch(API_URL);
    if (!response.ok) return;
    const data = await response.json();
    store = {
      ...store,
      ...data,
      settings: { ...store.settings, ...(data.settings || {}) },
    };
    serverLoaded = true;
    saveLocal();
    render();
  } catch {
    serverLoaded = true;
    render();
  }
};

const refreshFromCloud = () => {
  const activeTag = document.activeElement?.tagName;
  const userIsTyping = ["INPUT", "SELECT", "TEXTAREA"].includes(activeTag);
  if (!document.hidden && !userIsTyping) {
    loadFromServer();
  }
};

const byId = (id) => document.getElementById(id);
const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toLocaleDateString("es-DO");
const isoToday = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const numberValue = (id) => Number(byId(id).value || 0);
const formatTime12 = (time) => {
  const [hourText, minute = "00"] = String(time || "").split(":");
  let hour = Number(hourText);
  if (Number.isNaN(hour)) return time || "";
  const suffix = hour >= 12 ? "PM" : "AM";
  hour = hour % 12 || 12;
  return `${hour}:${minute.padStart(2, "0")} ${suffix}`;
};
const inDateRange = (dateIso, start, end) => {
  if (!dateIso) return false;
  return (!start || dateIso >= start) && (!end || dateIso <= end);
};
const monthBounds = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { start, end };
};
const biweeklyBounds = () => {
  const now = new Date();
  const day = now.getDate();
  const startDay = day <= 15 ? 1 : 16;
  const endDay = day <= 15 ? 15 : new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const start = new Date(now.getFullYear(), now.getMonth(), startDay).toISOString().slice(0, 10);
  const end = new Date(now.getFullYear(), now.getMonth(), endDay).toISOString().slice(0, 10);
  return { start, end };
};

const render = () => {
  renderSummary();
  renderClients();
  renderAppointments();
  renderServices();
  renderEmployees();
  renderInvoiceOptions();
  renderAppointmentOptions();
  renderAvailableSlots();
  renderInvoicePreview();
  renderInvoices();
  renderPayroll();
  renderExpenses();
  renderAccounting();
  renderSettings();
  renderClosingDefaults();
  renderLocks();
};

const totals = () => {
  const income = store.invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const businessExpenses = store.expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const payrollPaid = store.payrollPayments.reduce((sum, payment) => sum + payment.net, 0);
  const pendingPayroll = payrollRows().reduce((sum, row) => sum + row.net, 0);
  const profit = income - businessExpenses - payrollPaid - pendingPayroll;
  return { income, businessExpenses, payrollPaid, pendingPayroll, profit };
};

const renderSummary = () => {
  const todayInvoices = invoicesForDate(isoToday());
  const todayExpenses = rowsForDate(store.expenses, isoToday());
  const todayPayroll = rowsForDate(store.payrollPayments, isoToday());
  const todayIncome = todayInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const todayExpenseTotal =
    todayExpenses.reduce((sum, expense) => sum + expense.amount, 0) +
    todayPayroll.reduce((sum, payment) => sum + payment.net, 0);
  byId("clientCount").textContent = store.clients.length;
  byId("employeeCount").textContent = store.employees.length;
  byId("invoiceTotal").textContent = money.format(todayIncome);
  byId("expenseTotal").textContent = money.format(todayExpenseTotal);
};

const renderClients = () => {
  const list = byId("clientList");
  if (!store.clients.length) {
    list.innerHTML = '<div class="empty">Todavia no hay clientes guardados.</div>';
    return;
  }

  list.innerHTML = store.clients
    .map((client) => {
      const history = clientHistory(client);
      return `
        <article class="item">
          <div>
            <strong>${escapeHtml(client.name)} | ${history.visits} visita(s)</strong>
            <small>${escapeHtml(client.phone || "Sin telefono")} | RNC/Cedula: ${escapeHtml(client.taxId || "No indicado")} | ${escapeHtml(client.note || "Sin nota")}</small>
            <small>Servicios: ${history.services || "Sin servicios registrados"}</small>
          </div>
          <div class="item-actions">
            <button class="delete-btn" type="button" data-delete-client="${client.id}">Eliminar</button>
          </div>
        </article>
      `;
    })
    .join("");
};

const clientHistory = (client) => {
  const phone = whatsappPhone(client.phone || "");
  const name = String(client.name || "").toLowerCase();
  const clientAppointments = store.appointments.filter((appointment) => {
    const appointmentPhone = whatsappPhone(appointment.phone || "");
    const appointmentName = String(appointment.clientName || "").toLowerCase();
    return (phone && appointmentPhone === phone) || appointmentName === name;
  });
  const completed = clientAppointments.filter((appointment) => appointment.status === "Realizada");
  const serviceCounts = completed.reduce((result, appointment) => {
    const service = appointment.service || "Servicio";
    result[service] = (result[service] || 0) + 1;
    return result;
  }, {});
  const services = Object.entries(serviceCounts)
    .map(([service, count]) => `${service} x ${count}`)
    .join(" | ");
  return { visits: completed.length, services };
};

const renderServices = () => {
  const list = byId("serviceList");
  if (!store.services.length) {
    list.innerHTML = '<div class="empty">Todavia no hay servicios guardados.</div>';
    return;
  }

  list.innerHTML = store.services
    .map(
      (service) => `
        <article class="item">
          <div>
            <strong>${escapeHtml(service.name)} | ${money.format(service.price)}</strong>
            <small>${escapeHtml(service.duration || "Duracion no indicada")}</small>
          </div>
          <div class="item-actions">
            <button class="delete-btn" type="button" data-delete-service="${service.id}">Eliminar</button>
          </div>
        </article>
      `
    )
    .join("");
};

const renderEmployees = () => {
  const list = byId("employeeList");
  if (!store.employees.length) {
    list.innerHTML = '<div class="empty">Todavia no hay empleadas guardadas.</div>';
    return;
  }

  list.innerHTML = store.employees
    .map(
      (employee) => `
        <article class="item">
          <div>
            <strong>${escapeHtml(employee.name)} | Sueldo ${money.format(employee.salary || 0)}</strong>
            <small>Telefono: ${escapeHtml(employee.phone || "Sin telefono")} | ID: ${escapeHtml(employee.identity || "No indicado")} | ${escapeHtml(employee.role || "Sin especialidad")}</small>
          </div>
          <div class="item-actions">
            <button class="print-btn" type="button" data-reset-salary="${employee.id}">Nuevo pago</button>
            <button class="print-btn" type="button" data-edit-employee="${employee.id}">Editar</button>
            <button class="delete-btn" type="button" data-delete-employee="${employee.id}">Eliminar</button>
          </div>
        </article>
      `
    )
    .join("");
};

const renderSettings = () => {
  byId("ncfType").value = store.settings.ncfType || "B02";
  byId("ncfNext").value = store.settings.ncfNext || 1;
  byId("businessName").value = store.settings.businessName || "ZENBOO Beauty Center";
  byId("businessRnc").value = store.settings.businessRnc || "";
  byId("showBusinessRnc").value = store.settings.showBusinessRnc || "yes";
  byId("businessPhone").value = store.settings.businessPhone || "";
  byId("businessAddress").value = store.settings.businessAddress || "";
  byId("businessEmail").value = store.settings.businessEmail || "";
  byId("appointmentHoursConfig").value = appointmentHours().join(",");
  byId("electronicEnabled").value = store.settings.electronicEnabled || "no";
  byId("dgiiEnvironment").value = store.settings.dgiiEnvironment || "Pruebas";
  byId("instagramUrl").value = store.settings.instagramUrl || "";
  byId("instagramLink").href = store.settings.instagramUrl || "#";
};

const renderClosingDefaults = () => {
  if (!byId("closingDate").value) byId("closingDate").value = isoToday();
  if (!byId("closingMonth").value) byId("closingMonth").value = currentMonth();
  if (!byId("appointmentDate").value) byId("appointmentDate").value = isoToday();
  if (!byId("payrollStart").value || !byId("payrollEnd").value) {
    const bounds = byId("payrollPeriod").value === "biweekly" ? biweeklyBounds() : monthBounds();
    byId("payrollStart").value ||= bounds.start;
    byId("payrollEnd").value ||= bounds.end;
  }
};

const renderInvoiceOptions = () => {
  keepSelectedOption("invoiceClient", store.clients, "Selecciona cliente");
  keepSelectedOption("invoiceService", store.services, "Selecciona servicio");
  keepSelectedOption("invoiceEmployee", store.employees, "Selecciona empleada");
  keepSelectedOption("deductionEmployee", store.employees, "Selecciona empleada");
};

const renderAppointmentOptions = () => {
  keepSelectedOption("appointmentEmployee", store.employees, "Selecciona empleada");
};

const optionList = (items, placeholder) => {
  const options = items
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`)
    .join("");
  return `<option value="">${placeholder}</option>${options}`;
};

const keepSelectedOption = (selectId, items, placeholder) => {
  const select = byId(selectId);
  const selected = select.value;
  select.innerHTML = optionList(items, placeholder);
  if (items.some((item) => item.id === selected)) select.value = selected;
};

const appointmentHours = () =>
  Array.isArray(store.settings.appointmentHours) && store.settings.appointmentHours.length
    ? store.settings.appointmentHours
    : ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

const parseHours = (value) =>
  value
    .split(",")
    .map((hour) => hour.trim())
    .filter((hour) => /^\d{2}:\d{2}$/.test(hour));

const whatsappPhone = (phone) => {
  const clean = String(phone || "").replace(/\D/g, "");
  if (clean.length === 10 && /^[89]\d{2}/.test(clean)) {
    return `1${clean}`;
  }
  return clean;
};

const renderAvailableSlots = () => {
  const employeeId = byId("appointmentEmployee").value;
  const date = byId("appointmentDate").value;
  const selectedTime = byId("appointmentTime").value;
  const list = byId("availableSlots");

  if (!employeeId || !date) {
    list.innerHTML = '<span class="empty mini-empty">Elige empleada y fecha.</span>';
    return;
  }

  const occupied = store.appointments
    .filter((item) => item.employeeId === employeeId && item.dateIso === date && item.status !== "Cancelada")
    .map((item) => item.time);

  list.innerHTML = appointmentHours()
    .map((hour) => {
      const taken = occupied.includes(hour);
      const active = selectedTime === hour;
      return `<button class="slot-btn ${active ? "active" : ""}" type="button" data-slot="${hour}" ${taken ? "disabled" : ""}>${taken ? "Ocupada" : formatTime12(hour)}</button>`;
    })
    .join("");
};

const renderAppointments = () => {
  const list = byId("appointmentList");
  if (!store.appointments.length) {
    list.innerHTML = '<div class="empty">Todavia no hay citas reservadas.</div>';
    return;
  }

  list.innerHTML = store.appointments
    .slice()
    .reverse()
    .map(
      (appointment) => `
        <article class="item">
          <div>
            <strong>${escapeHtml(appointment.clientName)} | ${escapeHtml(appointment.dateIso)} ${escapeHtml(formatTime12(appointment.time))}</strong>
            <small>${escapeHtml(appointment.service)} | ${escapeHtml(appointment.employeeName)} | ${escapeHtml(appointment.status)}</small>
          </div>
          <div class="item-actions">
            ${
              appointment.status === "Cancelada"
                ? `
                  <span class="status-pill">Cancelada</span>
                  <button class="delete-btn" type="button" data-delete-appointment="${appointment.id}">Borrar</button>
                `
                : appointment.status === "Realizada"
                  ? `
                    <span class="status-pill done">Realizada</span>
                    <button class="delete-btn" type="button" data-delete-appointment="${appointment.id}">Borrar</button>
                  `
                : `
                  <button class="print-btn" type="button" data-confirm-appointment="${appointment.id}">Confirmar</button>
                  <button class="print-btn" type="button" data-complete-appointment="${appointment.id}">Realizada</button>
                  <button class="print-btn" type="button" data-edit-appointment="${appointment.id}">Modificar</button>
                  <a class="print-btn" href="${clientConfirmationLink(appointment)}" target="_blank" rel="noreferrer">Confirmar WhatsApp</a>
                  <a class="print-btn" href="${clientCancellationLink(appointment)}" target="_blank" rel="noreferrer">Cancelar WhatsApp</a>
                  <a class="print-btn" href="${employeeReminderLink(appointment)}" target="_blank" rel="noreferrer">Avisar empleada</a>
                  <a class="print-btn" href="${reminderLink(appointment)}" target="_blank" rel="noreferrer">Recordar</a>
                  <button class="delete-btn" type="button" data-cancel-appointment="${appointment.id}">Cancelar</button>
                `
            }
          </div>
        </article>
      `
    )
    .join("");
};

const reminderLink = (appointment) => {
  const phone = whatsappPhone(appointment.phone);
  const text = encodeURIComponent(
    `Hola ${appointment.clientName}, te recordamos tu cita en ZENBOO Beauty Center el ${appointment.dateIso} a las ${formatTime12(appointment.time)} con ${appointment.employeeName}.`
  );
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
};

const clientConfirmationLink = (appointment) => {
  const phone = whatsappPhone(appointment.phone);
  const text = encodeURIComponent(
    `Hola ${appointment.clientName}, tu cita en ZENBOO Beauty Center ha sido confirmada para el ${appointment.dateIso} a las ${formatTime12(appointment.time)} con ${appointment.employeeName}. Te esperamos.`
  );
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
};

const clientCancellationLink = (appointment) => {
  const phone = whatsappPhone(appointment.phone);
  const text = encodeURIComponent(
    `Hola ${appointment.clientName}, sentimos informarte que tu cita en ZENBOO Beauty Center para el ${appointment.dateIso} a las ${formatTime12(appointment.time)} ha sido cancelada. Puedes escribirnos para reagendar.`
  );
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
};

const employeeReminderLink = (appointment) => {
  const employee = store.employees.find((item) => item.id === appointment.employeeId);
  const phone = whatsappPhone(employee?.phone || "");
  const text = encodeURIComponent(
    `Nueva cita en ZENBOO Beauty Center: ${appointment.clientName}, servicio ${appointment.service}, fecha ${appointment.dateIso}, hora ${formatTime12(appointment.time)}. Telefono clienta: ${appointment.phone}.`
  );
  return phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
};

const renderInvoicePreview = () => {
  const client = store.clients.find((item) => item.id === byId("invoiceClient").value);
  const service = store.services.find((item) => item.id === byId("invoiceService").value);
  const employee = store.employees.find((item) => item.id === byId("invoiceEmployee").value);
  const quantity = numberValue("invoiceQuantity") || 1;
  const paymentMethod = byId("invoicePayment").value;
  const electronicType = byId("invoiceElectronic").value;
  const preview = byId("invoicePreview");

  if (!client || !service || !employee) {
    preview.innerHTML = `
      <h3>Factura rapida</h3>
      <p>Selecciona cliente, servicio y empleada para ver el total.</p>
    `;
    return;
  }

  const total = service.price * quantity;
  const commission = total * 0.1;
  const ncf = formatNcf(store.settings.ncfType, store.settings.ncfNext);
  preview.innerHTML = invoiceHtml({
    clientName: client.name,
    clientTaxId: client.taxId,
    serviceName: service.name,
    employeeName: employee.name,
    quantity,
    total,
    commission,
    ncf,
    paymentMethod,
    electronicType,
    electronicStatus: electronicType === "electronica" ? "Pendiente de enviar a DGII" : "No aplica",
    businessName: store.settings.businessName,
    businessRnc: store.settings.businessRnc,
    showBusinessRnc: store.settings.showBusinessRnc,
    businessPhone: store.settings.businessPhone,
    businessAddress: store.settings.businessAddress,
    businessEmail: store.settings.businessEmail,
    date: today(),
    dateIso: isoToday(),
  });
};

const renderInvoices = () => {
  const list = byId("invoiceList");
  if (!store.invoices.length) {
    list.innerHTML = '<div class="empty">Todavia no hay facturas creadas.</div>';
    return;
  }

  const isAdmin = protectedTabs.some((tabName) => unlockedTabs.includes(tabName));
  list.innerHTML = store.invoices
    .slice()
    .reverse()
    .map(
      (invoice) => `
        <article class="item">
          <div>
            <strong>${escapeHtml(invoice.ncf || "Sin NCF")} | ${escapeHtml(invoice.clientName)}${isAdmin ? ` | ${money.format(invoice.total)}` : ""}</strong>
            <small>${escapeHtml(invoice.serviceName)} x ${invoice.quantity} | ${escapeHtml(invoice.employeeName || "Sin empleada")} | ${escapeHtml(invoice.paymentMethod || "Sin metodo")} | ${escapeHtml(invoice.electronicStatus || "No aplica")} | Comision ${money.format(invoice.commission || 0)} | ${invoice.date}</small>
          </div>
          <div class="item-actions">
            <button class="print-btn" type="button" data-view-invoice="${invoice.id}">Ver</button>
            <button class="print-btn" type="button" data-print-invoice="${invoice.id}">Imprimir</button>
            <button class="delete-btn" type="button" data-delete-invoice="${invoice.id}">Eliminar</button>
          </div>
        </article>
      `
    )
    .join("");
};

const payrollPeriodConfig = () => ({
  period: byId("payrollPeriod")?.value || "monthly",
  start: byId("payrollStart")?.value || monthBounds().start,
  end: byId("payrollEnd")?.value || monthBounds().end,
});

const salaryForPeriod = (employee, period, start, end) => {
  const salary = employee.salary || 0;
  const alreadyPaid = store.payrollPayments.some(
    (payment) => payment.employeeId === employee.id && payment.start === start && payment.end === end && payment.period === period
  );
  if (alreadyPaid) return 0;
  if (period === "biweekly") return salary / 2;
  return salary;
};

const serviceBreakdown = (invoices) =>
  Object.values(
    invoices.reduce((result, invoice) => {
      const name = invoice.serviceName || "Servicio";
      if (!result[name]) {
        result[name] = { name, count: 0, sales: 0, commission: 0 };
      }
      result[name].count += invoice.quantity || 1;
      result[name].sales += invoice.total || 0;
      result[name].commission += invoice.commission || 0;
      return result;
    }, {})
  );

const payrollRows = () => {
  const config = payrollPeriodConfig();
  return store.employees.map((employee) => {
    const employeeInvoices = store.invoices.filter(
      (invoice) =>
        invoice.employeeId === employee.id &&
        !invoice.payrollPaid &&
        inDateRange(invoice.dateIso, config.start, config.end)
    );
    const deductions = store.deductions.filter(
      (deduction) =>
        deduction.employeeId === employee.id &&
        !deduction.paid &&
        inDateRange(deduction.dateIso || isoToday(), config.start, config.end)
    );
    const sales = employeeInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const commission = employeeInvoices.reduce((sum, invoice) => sum + (invoice.commission || 0), 0);
    const deductionTotal = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
    const salary = salaryForPeriod(employee, config.period, config.start, config.end);
    const net = salary + commission - deductionTotal;
    return {
      employee,
      employeeInvoices,
      deductions,
      sales,
      commission,
      deductionTotal,
      salary,
      net,
      services: serviceBreakdown(employeeInvoices),
      period: config.period,
      start: config.start,
      end: config.end,
    };
  });
};

const renderPayroll = () => {
  const list = byId("payrollList");
  const rows = payrollRows();
  const payrollTotal = rows.reduce((sum, row) => sum + row.net, 0);
  byId("payrollTotal").textContent = money.format(payrollTotal);

  if (!rows.length) {
    list.innerHTML = '<div class="empty">Agrega empleadas para preparar nomina.</div>';
    return;
  }

  list.innerHTML = rows
    .map(
      (row) => `
        <article class="item payroll-card">
          <div>
            <strong>${escapeHtml(row.employee.name)} | Neto a pagar ${money.format(row.net)}</strong>
            <div class="breakdown">
              <span>Sueldo: ${money.format(row.salary)}</span>
              <span>Comision acumulada: ${money.format(row.commission)}</span>
              <span>Descuentos: ${money.format(row.deductionTotal)}</span>
              <span>Servicios pendientes: ${row.employeeInvoices.length}</span>
            </div>
            ${serviceText(row.services)}
            ${deductionText(row.deductions)}
          </div>
          <div class="item-actions">
            <button class="print-btn" type="button" data-print-payroll="${row.employee.id}">Imprimir desglose</button>
            <button class="print-btn" type="button" data-pay-employee="${row.employee.id}">Marcar pagado</button>
          </div>
        </article>
      `
    )
    .join("");
};

const serviceText = (services) => {
  if (!services.length) return '<small>Sin servicios realizados en este periodo.</small>';
  return `<small>Servicios: ${services
    .map((item) => `${escapeHtml(item.name)} x ${item.count} (${money.format(item.sales)})`)
    .join(" | ")}</small>`;
};

const deductionText = (deductions) => {
  if (!deductions.length) return '<small>Sin gastos a descontar.</small>';
  return `<small>Descuentos: ${deductions
    .map((item) => `${escapeHtml(item.reason)} ${money.format(item.amount)}`)
    .join(" | ")}</small>`;
};

const payrollHtml = (row, paid = false) => `
  <h3>${escapeHtml(store.settings.businessName || "ZENBOO Beauty Center")}</h3>
  <p><strong>Desglose de pago de nomina</strong></p>
  <p><strong>Empleada:</strong> ${escapeHtml(row.employee.name)}</p>
  <p><strong>Periodo:</strong> ${escapeHtml(row.start)} al ${escapeHtml(row.end)} (${row.period === "biweekly" ? "Quincenal" : row.period === "monthly" ? "Mensual" : "Manual"})</p>
  <p><strong>Sueldo:</strong> ${money.format(row.salary)}</p>
  <p><strong>Comision:</strong> ${money.format(row.commission)}</p>
  <p><strong>Total descuentos:</strong> ${money.format(row.deductionTotal)}</p>
  <p><strong>Total pagado:</strong> ${money.format(row.net)}</p>
  <p><strong>Estado:</strong> ${paid ? "Pagado" : "Pendiente"}</p>
  <h4>Servicios realizados</h4>
  ${
    row.services.length
      ? row.services
          .map(
            (service) =>
              `<p>${escapeHtml(service.name)} x ${service.count} | Ventas ${money.format(service.sales)} | Comision ${money.format(service.commission)}</p>`
          )
          .join("")
      : "<p>Sin servicios en este periodo.</p>"
  }
  <h4>Descuentos</h4>
  ${
    row.deductions.length
      ? row.deductions
          .map((deduction) => `<p>${escapeHtml(deduction.reason)} | ${money.format(deduction.amount)} | ${escapeHtml(deduction.date || "")}</p>`)
          .join("")
      : "<p>Sin descuentos.</p>"
  }
`;

const renderAccounting = () => {
  const currentTotals = totals();
  byId("accountIncome").textContent = money.format(currentTotals.income);
  byId("accountExpenses").textContent = money.format(currentTotals.businessExpenses);
  byId("accountPayroll").textContent = money.format(currentTotals.payrollPaid);
  byId("accountProfit").textContent = money.format(currentTotals.profit);

  const list = byId("accountingList");
  const expenses = store.expenses
    .slice()
    .reverse()
    .map(
      (expense) => `
        <article class="item">
          <div>
            <strong>Gasto: ${escapeHtml(expense.category)} | ${money.format(expense.amount)}</strong>
            <small>${escapeHtml(expense.detail || "Sin detalle")} | ${expense.date}</small>
          </div>
          <div class="item-actions">
            <button class="delete-btn" type="button" data-delete-expense="${expense.id}">Eliminar</button>
          </div>
        </article>
      `
    );

  const payments = store.payrollPayments
    .slice()
    .reverse()
    .map(
      (payment) => `
        <article class="item">
          <div>
            <strong>Nomina pagada: ${escapeHtml(payment.employeeName)} | ${money.format(payment.net)}</strong>
            <small>Sueldo ${money.format(payment.salary)} | Comision ${money.format(payment.commission)} | Descuentos ${money.format(payment.deductions)} | ${payment.date}</small>
          </div>
        </article>
      `
    );

  const closings = store.dailyClosings
    .slice()
    .reverse()
    .map(
      (closing) => `
        <article class="item">
          <div>
            <strong>Cierre diario: ${escapeHtml(closing.date)} | Ganancia ${money.format(closing.profit)}</strong>
            <small>Ingresos ${money.format(closing.income)} | Gastos ${money.format(closing.totalExpenses)} | Efectivo ${money.format(closing.methods.Efectivo || 0)} | Tarjeta ${money.format(closing.methods.Tarjeta || 0)} | Transferencia ${money.format(closing.methods.Transferencia || 0)}</small>
          </div>
        </article>
      `
    );

  list.innerHTML = expenses.concat(payments, closings).join("") || '<div class="empty">Aqui apareceran gastos del negocio, pagos de nomina y cierres.</div>';
};

const renderExpenses = () => {
  const list = byId("expenseList");
  if (!store.expenses.length) {
    list.innerHTML = '<div class="empty">Todavia no hay gastos registrados.</div>';
    return;
  }

  list.innerHTML = store.expenses
    .slice()
    .reverse()
    .map(
      (expense) => `
        <article class="item">
          <div>
            <strong>${escapeHtml(expense.category)} | ${money.format(expense.amount)}</strong>
            <small>${escapeHtml(expense.detail || "Sin detalle")} | ${expense.date}</small>
          </div>
          <div class="item-actions">
            <button class="delete-btn" type="button" data-delete-expense="${expense.id}">Eliminar</button>
          </div>
        </article>
      `
    )
    .join("");
};

const renderLocks = () => {
  protectedTabs.forEach((tabName) => {
    const unlocked = unlockedTabs.includes(tabName);
    const lockBox = document.querySelector(`[data-lock-box="${tabName}"]`);
    const content = document.querySelector(`[data-protected-content="${tabName}"]`);
    if (lockBox) lockBox.hidden = unlocked;
    if (content) content.hidden = !unlocked;
  });
  const isAdmin = protectedTabs.some((tabName) => unlockedTabs.includes(tabName));
  document.querySelectorAll("[data-admin-only]").forEach((item) => {
    item.hidden = !isAdmin;
  });
};

const invoicesForDate = (dateIso) =>
  store.invoices.filter((invoice) => invoice.dateIso === dateIso || (!invoice.dateIso && invoice.date === dateIso));

const rowsForDate = (items, dateIso) =>
  items.filter((item) => item.dateIso === dateIso || (!item.dateIso && item.date === dateIso));

const rowsForMonth = (items, month) =>
  items.filter((item) => (item.dateIso || "").startsWith(month));

const paymentBreakdown = (invoices) =>
  invoices.reduce(
    (result, invoice) => {
      const method = invoice.paymentMethod || "Sin metodo";
      result[method] = (result[method] || 0) + invoice.total;
      return result;
    },
    { Efectivo: 0, Tarjeta: 0, Transferencia: 0, Mixto: 0 }
  );

const closingData = (mode, value) => {
  const invoices = mode === "day" ? invoicesForDate(value) : rowsForMonth(store.invoices, value);
  const expenses = mode === "day" ? rowsForDate(store.expenses, value) : rowsForMonth(store.expenses, value);
  const payroll = mode === "day" ? rowsForDate(store.payrollPayments, value) : rowsForMonth(store.payrollPayments, value);
  const income = invoices.reduce((sum, invoice) => sum + invoice.total, 0);
  const businessExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const payrollPaid = payroll.reduce((sum, payment) => sum + payment.net, 0);
  const totalExpenses = businessExpenses + payrollPaid;
  return {
    label: mode === "day" ? `Cierre diario ${value}` : `Cierre mensual ${value}`,
    date: value,
    income,
    businessExpenses,
    payrollPaid,
    totalExpenses,
    profit: income - totalExpenses,
    methods: paymentBreakdown(invoices),
    invoiceCount: invoices.length,
  };
};

const renderClosingPreview = (data) => {
  byId("closingPreview").innerHTML = `
    <h3>ZENBOO Beauty Center</h3>
    <p><strong>${escapeHtml(data.label)}</strong></p>
    <div class="breakdown">
      <span>Efectivo: ${money.format(data.methods.Efectivo || 0)}</span>
      <span>Tarjeta: ${money.format(data.methods.Tarjeta || 0)}</span>
      <span>Transferencia: ${money.format(data.methods.Transferencia || 0)}</span>
      <span>Mixto: ${money.format(data.methods.Mixto || 0)}</span>
    </div>
    <p><strong>Total cobrado:</strong> ${money.format(data.income)}</p>
    <p><strong>Gastos del negocio:</strong> ${money.format(data.businessExpenses)}</p>
    <p><strong>Nomina pagada:</strong> ${money.format(data.payrollPaid)}</p>
    <p><strong>Total gastos:</strong> ${money.format(data.totalExpenses)}</p>
    <p><strong>Ganancia:</strong> ${money.format(data.profit)}</p>
    <p><strong>Facturas:</strong> ${data.invoiceCount}</p>
  `;
};

const formatNcf = (type, next) => `${type}${String(next || 1).padStart(8, "0")}`;

const invoiceHtml = (invoice) => `
  <h3>${escapeHtml(invoice.businessName || store.settings.businessName || "ZENBOO Beauty Center")}</h3>
  ${invoice.showBusinessRnc === "no" || store.settings.showBusinessRnc === "no" ? "" : `<p><strong>RNC negocio:</strong> ${escapeHtml(invoice.businessRnc || store.settings.businessRnc || "No indicado")}</p>`}
  <p><strong>Telefono:</strong> ${escapeHtml(invoice.businessPhone || store.settings.businessPhone || "No indicado")}</p>
  <p><strong>Direccion:</strong> ${escapeHtml(invoice.businessAddress || store.settings.businessAddress || "No indicada")}</p>
  <p><strong>Correo:</strong> ${escapeHtml(invoice.businessEmail || store.settings.businessEmail || "No indicado")}</p>
  <p><strong>NCF:</strong> ${escapeHtml(invoice.ncf || "")}</p>
  <p><strong>Fecha:</strong> ${escapeHtml(invoice.date || "")}</p>
  <p><strong>Cliente:</strong> ${escapeHtml(invoice.clientName || "")}</p>
  <p><strong>RNC/Cedula:</strong> ${escapeHtml(invoice.clientTaxId || "No indicado")}</p>
  <p><strong>Servicio:</strong> ${escapeHtml(invoice.serviceName || "")} x ${invoice.quantity || 1}</p>
  <p><strong>Empleada:</strong> ${escapeHtml(invoice.employeeName || "")}</p>
  <p><strong>Metodo de pago:</strong> ${escapeHtml(invoice.paymentMethod || "No indicado")}</p>
  <p><strong>Factura electronica:</strong> ${escapeHtml(invoice.electronicType === "electronica" ? "e-CF" : "No")}</p>
  <p><strong>Estado DGII:</strong> ${escapeHtml(invoice.electronicStatus || "No aplica")}</p>
  <p><strong>Total:</strong> ${money.format(invoice.total || 0)}</p>
`;

const escapeHtml = (text) =>
  String(text).replace(/[&<>"']/g, (char) => {
    const entities = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
    return entities[char];
  });

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((panel) => panel.classList.remove("active"));
    tab.classList.add("active");
    byId(tab.dataset.tab).classList.add("active");
  });
});

document.querySelectorAll(".unlock-form").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const tabName = form.dataset.unlockForm;
    const input = document.querySelector(`[data-password-input="${tabName}"]`);
    if (input.value !== (store.settings.adminPassword || defaultAdminPassword)) {
      input.value = "";
      input.placeholder = "Clave incorrecta";
      return;
    }
    unlockedTabs = [...new Set([...unlockedTabs, tabName])];
    sessionStorage.setItem("zenboo_unlocked_tabs", JSON.stringify(unlockedTabs));
    input.value = "";
    renderLocks();
  });
});

byId("passwordForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const message = byId("passwordMessage");
  const currentPassword = byId("currentAdminPassword").value;
  const newPassword = byId("newAdminPassword").value;
  const confirmPassword = byId("confirmAdminPassword").value;

  if (currentPassword !== (store.settings.adminPassword || defaultAdminPassword)) {
    message.textContent = "La clave actual no es correcta.";
    message.className = "form-message error";
    return;
  }

  if (newPassword.length < 4) {
    message.textContent = "La nueva clave debe tener minimo 4 caracteres.";
    message.className = "form-message error";
    return;
  }

  if (newPassword !== confirmPassword) {
    message.textContent = "La nueva clave no coincide.";
    message.className = "form-message error";
    return;
  }

  store.settings.adminPassword = newPassword;
  byId("passwordForm").reset();
  message.textContent = "Clave cambiada correctamente.";
  message.className = "form-message success";
  save();
});

byId("clientForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.clients.push({
    id: createId(),
    name: byId("clientName").value.trim(),
    phone: byId("clientPhone").value.trim(),
    taxId: byId("clientTaxId").value.trim(),
    note: byId("clientNote").value.trim(),
  });
  event.target.reset();
  save();
  render();
});

byId("serviceForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.services.push({
    id: createId(),
    name: byId("serviceName").value.trim(),
    duration: byId("serviceDuration").value.trim(),
    price: numberValue("servicePrice"),
  });
  event.target.reset();
  save();
  render();
});

byId("employeeForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const editId = byId("employeeEditId").value;
  const employeeData = {
    name: byId("employeeName").value.trim(),
    phone: byId("employeePhone").value.trim(),
    identity: byId("employeeIdentity").value.trim(),
    role: byId("employeeRole").value.trim(),
    salary: numberValue("employeeSalary"),
  };

  if (editId) {
    store.employees = store.employees.map((employee) =>
      employee.id === editId ? { ...employee, ...employeeData } : employee
    );
    store.appointments = store.appointments.map((appointment) =>
      appointment.employeeId === editId ? { ...appointment, employeeName: employeeData.name } : appointment
    );
    store.invoices = store.invoices.map((invoice) =>
      invoice.employeeId === editId ? { ...invoice, employeeName: employeeData.name } : invoice
    );
  } else {
    store.employees.push({
      id: createId(),
      ...employeeData,
    });
  }

  event.target.reset();
  resetEmployeeForm();
  save();
  render();
});

byId("ncfForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.settings.ncfType = byId("ncfType").value;
  store.settings.ncfNext = numberValue("ncfNext") || 1;
  save();
  render();
});

byId("businessForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.settings.businessName = byId("businessName").value.trim() || "ZENBOO Beauty Center";
  store.settings.businessRnc = byId("businessRnc").value.trim();
  store.settings.showBusinessRnc = byId("showBusinessRnc").value;
  store.settings.businessPhone = byId("businessPhone").value.trim();
  store.settings.businessAddress = byId("businessAddress").value.trim();
  store.settings.businessEmail = byId("businessEmail").value.trim();
  store.settings.appointmentHours = parseHours(byId("appointmentHoursConfig").value);
  save();
  render();
});

byId("electronicForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.settings.electronicEnabled = byId("electronicEnabled").value;
  store.settings.dgiiEnvironment = byId("dgiiEnvironment").value;
  save();
  render();
});

byId("instagramForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.settings.instagramUrl = byId("instagramUrl").value.trim();
  save();
  render();
});

byId("appointmentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const employee = store.employees.find((item) => item.id === byId("appointmentEmployee").value);
  const time = byId("appointmentTime").value;
  if (!employee || !time) return;

  store.appointments.push({
    id: createId(),
    clientName: byId("appointmentClient").value.trim(),
    phone: byId("appointmentPhone").value.trim(),
    service: byId("appointmentService").value.trim(),
    employeeId: employee.id,
    employeeName: employee.name,
    dateIso: byId("appointmentDate").value,
    time,
    status: "Reservada",
    createdAt: new Date().toISOString(),
  });
  byId("appointmentTime").value = "";
  event.target.reset();
  byId("appointmentDate").value = isoToday();
  save();
  render();
});

byId("invoiceForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const client = store.clients.find((item) => item.id === byId("invoiceClient").value);
  const service = store.services.find((item) => item.id === byId("invoiceService").value);
  const employee = store.employees.find((item) => item.id === byId("invoiceEmployee").value);
  const quantity = numberValue("invoiceQuantity") || 1;
  const paymentMethod = byId("invoicePayment").value;
  const electronicType = byId("invoiceElectronic").value;
  if (!client || !service || !employee) return;

  const total = service.price * quantity;
  const invoice = {
    id: createId(),
    clientId: client.id,
    clientName: client.name,
    clientTaxId: client.taxId,
    serviceName: service.name,
    employeeId: employee.id,
    employeeName: employee.name,
    quantity,
    total,
    commission: total * 0.1,
    paymentMethod,
    electronicType,
    electronicStatus: electronicType === "electronica" ? "Pendiente de enviar a DGII" : "No aplica",
    businessName: store.settings.businessName || "ZENBOO Beauty Center",
    businessRnc: store.settings.businessRnc || "",
    showBusinessRnc: store.settings.showBusinessRnc || "yes",
    businessPhone: store.settings.businessPhone || "",
    businessAddress: store.settings.businessAddress || "",
    businessEmail: store.settings.businessEmail || "",
    dgiiEnvironment: store.settings.dgiiEnvironment || "Pruebas",
    ncf: formatNcf(store.settings.ncfType, store.settings.ncfNext),
    date: today(),
    dateIso: isoToday(),
    payrollPaid: false,
  };
  store.invoices.push(invoice);
  store.settings.ncfNext = (store.settings.ncfNext || 1) + 1;
  save();
  render();
  showInvoice(invoice);
});

byId("deductionForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const employee = store.employees.find((item) => item.id === byId("deductionEmployee").value);
  if (!employee) return;
  store.deductions.push({
    id: createId(),
    employeeId: employee.id,
    employeeName: employee.name,
    reason: byId("deductionReason").value.trim(),
    amount: numberValue("deductionAmount"),
    date: today(),
    dateIso: isoToday(),
    paid: false,
  });
  event.target.reset();
  save();
  render();
});

byId("payrollPeriod").addEventListener("change", () => {
  if (byId("payrollPeriod").value === "monthly") {
    const bounds = monthBounds();
    byId("payrollStart").value = bounds.start;
    byId("payrollEnd").value = bounds.end;
  }
  if (byId("payrollPeriod").value === "biweekly") {
    const bounds = biweeklyBounds();
    byId("payrollStart").value = bounds.start;
    byId("payrollEnd").value = bounds.end;
  }
  renderPayroll();
});

byId("payrollFilterForm").addEventListener("submit", (event) => {
  event.preventDefault();
  renderPayroll();
});

byId("expenseForm").addEventListener("submit", (event) => {
  event.preventDefault();
  store.expenses.push({
    id: createId(),
    category: byId("expenseCategory").value.trim(),
    detail: byId("expenseDetail").value.trim(),
    amount: numberValue("expenseAmount"),
    date: today(),
    dateIso: isoToday(),
  });
  event.target.reset();
  save();
  render();
});

document.body.addEventListener("click", (event) => {
  const target = event.target;
  const action = (name) => target.closest(`[data-${name}]`)?.dataset[name];
  let changed = false;

  const deleteClient = action("deleteClient");
  const deleteService = action("deleteService");
  const deleteEmployee = action("deleteEmployee");
  const deleteInvoice = action("deleteInvoice");
  const deleteExpense = action("deleteExpense");
  const deleteAppointment = action("deleteAppointment");
  const cancelAppointment = action("cancelAppointment");
  const confirmAppointment = action("confirmAppointment");
  const completeAppointment = action("completeAppointment");
  const editAppointmentId = action("editAppointment");
  const editEmployeeId = action("editEmployee");
  const slot = action("slot");
  const viewInvoice = action("viewInvoice");
  const printInvoice = action("printInvoice");
  const printPayroll = action("printPayroll");
  const payEmployeeId = action("payEmployee");
  const resetSalary = action("resetSalary");

  if (deleteClient) {
    store.clients = store.clients.filter((client) => client.id !== deleteClient);
    changed = true;
  }
  if (deleteService) {
    store.services = store.services.filter((service) => service.id !== deleteService);
    changed = true;
  }
  if (deleteEmployee) {
    store.employees = store.employees.filter((employee) => employee.id !== deleteEmployee);
    changed = true;
  }
  if (deleteInvoice) {
    store.invoices = store.invoices.filter((invoice) => invoice.id !== deleteInvoice);
    changed = true;
  }
  if (deleteExpense) {
    store.expenses = store.expenses.filter((expense) => expense.id !== deleteExpense);
    changed = true;
  }
  if (deleteAppointment) {
    store.appointments = store.appointments.filter((appointment) => appointment.id !== deleteAppointment);
    changed = true;
  }
  if (cancelAppointment) {
    store.appointments = store.appointments.map((appointment) =>
      appointment.id === cancelAppointment ? { ...appointment, status: "Cancelada" } : appointment
    );
    changed = true;
  }
  if (confirmAppointment) {
    store.appointments = store.appointments.map((appointment) =>
      appointment.id === confirmAppointment ? { ...appointment, status: "Confirmada" } : appointment
    );
    changed = true;
  }
  if (completeAppointment) {
    store.appointments = store.appointments.map((appointment) =>
      appointment.id === completeAppointment ? { ...appointment, status: "Realizada" } : appointment
    );
    changed = true;
  }
  if (editAppointmentId) {
    editAppointment(editAppointmentId);
    return;
  }
  if (editEmployeeId) {
    editEmployee(editEmployeeId);
    return;
  }
  if (slot) {
    byId("appointmentTime").value = slot;
    renderAvailableSlots();
    return;
  }
  if (viewInvoice) {
    const invoice = store.invoices.find((item) => item.id === viewInvoice);
    if (invoice) showInvoice(invoice);
    return;
  }
  if (printInvoice) {
    const invoice = store.invoices.find((item) => item.id === printInvoice);
    if (invoice) {
      showInvoice(invoice);
      printSection("invoice");
    }
    return;
  }
  if (printPayroll) {
    const row = payrollRows().find((item) => item.employee.id === printPayroll);
    if (row) {
      byId("payrollPrintArea").innerHTML = payrollHtml(row);
      printSection("payroll");
    }
    return;
  }
  if (payEmployeeId) {
    payEmployee(payEmployeeId);
    return;
  }
  if (resetSalary) {
    store.employees = store.employees.map((employee) =>
      employee.id === resetSalary ? { ...employee, salaryPaid: false } : employee
    );
    changed = true;
  }
  if (changed) {
    save();
    render();
  }
});

byId("employeeCancelEdit").addEventListener("click", () => {
  byId("employeeForm").reset();
  resetEmployeeForm();
});

const editEmployee = (employeeId) => {
  const employee = store.employees.find((item) => item.id === employeeId);
  if (!employee) return;
  byId("employeeEditId").value = employee.id;
  byId("employeeName").value = employee.name || "";
  byId("employeePhone").value = employee.phone || "";
  byId("employeeIdentity").value = employee.identity || "";
  byId("employeeRole").value = employee.role || "";
  byId("employeeSalary").value = employee.salary || "";
  byId("employeeSubmitBtn").textContent = "Actualizar empleada";
  byId("employeeCancelEdit").hidden = false;
  document.querySelector('[data-tab="empleadas"]').click();
  byId("employeeName").focus();
};

const resetEmployeeForm = () => {
  byId("employeeEditId").value = "";
  byId("employeeSubmitBtn").textContent = "Guardar empleada";
  byId("employeeCancelEdit").hidden = true;
};

const payEmployee = (employeeId) => {
  const row = payrollRows().find((item) => item.employee.id === employeeId);
  if (!row) return;

  const invoiceIds = row.employeeInvoices.map((invoice) => invoice.id);
  const deductionIds = row.deductions.map((deduction) => deduction.id);

  store.payrollPayments.push({
    id: createId(),
    employeeId,
    employeeName: row.employee.name,
    salary: row.salary,
    commission: row.commission,
    deductions: row.deductionTotal,
    deductionDetails: row.deductions.map((deduction) => ({
      reason: deduction.reason,
      amount: deduction.amount,
      date: deduction.date,
    })),
    services: row.services,
    start: row.start,
    end: row.end,
    period: row.period,
    net: row.net,
    date: today(),
    dateIso: isoToday(),
  });

  store.invoices = store.invoices.map((invoice) =>
    invoiceIds.includes(invoice.id) ? { ...invoice, payrollPaid: true } : invoice
  );
  store.deductions = store.deductions.map((deduction) =>
    deductionIds.includes(deduction.id) ? { ...deduction, paid: true } : deduction
  );
  save();
  render();
  byId("payrollPrintArea").innerHTML = payrollHtml(row, true);
};

byId("previewDailyClose").addEventListener("click", () => {
  renderClosingPreview(closingData("day", byId("closingDate").value || isoToday()));
});

byId("saveDailyClose").addEventListener("click", () => {
  const data = closingData("day", byId("closingDate").value || isoToday());
  const existing = store.dailyClosings.find((closing) => closing.date === data.date);
  if (existing) {
    Object.assign(existing, data);
  } else {
    store.dailyClosings.push({ id: createId(), ...data });
  }
  save();
  render();
  renderClosingPreview(data);
});

byId("previewMonthlyClose").addEventListener("click", () => {
  renderClosingPreview(closingData("month", byId("closingMonth").value || currentMonth()));
});

byId("printMonthlyClose").addEventListener("click", () => {
  renderClosingPreview(closingData("month", byId("closingMonth").value || currentMonth()));
  printSection("closing");
});

byId("printInvoiceBtn").addEventListener("click", () => printSection("invoice"));

["invoiceClient", "invoiceService", "invoiceEmployee", "invoicePayment", "invoiceElectronic", "invoiceQuantity"].forEach((id) => {
  byId(id).addEventListener("input", renderInvoicePreview);
});

["appointmentEmployee", "appointmentDate"].forEach((id) => {
  byId(id).addEventListener("input", () => {
    byId("appointmentTime").value = "";
    renderAvailableSlots();
  });
});

const showInvoice = (invoice) => {
  byId("invoicePreview").innerHTML = invoiceHtml(invoice);
};

const editAppointment = (appointmentId) => {
  const appointment = store.appointments.find((item) => item.id === appointmentId);
  if (!appointment) return;

  const dateIso = prompt("Nueva fecha de la cita (YYYY-MM-DD):", appointment.dateIso);
  if (!dateIso) return;

  const time = prompt("Nueva hora de la cita (Ej. 10:00):", appointment.time);
  if (!time) return;

  const employeeId = appointment.employeeId;
  const occupied = store.appointments.some(
    (item) =>
      item.id !== appointmentId &&
      item.employeeId === employeeId &&
      item.dateIso === dateIso &&
      item.time === time &&
      item.status !== "Cancelada"
  );

  if (occupied) {
    alert("Esa hora ya esta ocupada para esa empleada.");
    return;
  }

  store.appointments = store.appointments.map((item) =>
    item.id === appointmentId ? { ...item, dateIso, time, status: "Confirmada" } : item
  );
  save();
  render();
};

const printSection = (mode) => {
  document.body.dataset.printMode = mode;
  window.print();
  setTimeout(() => {
    document.body.dataset.printMode = "";
  }, 300);
};

migrateOldData();
render();
loadFromServer();
setInterval(refreshFromCloud, 15000);
