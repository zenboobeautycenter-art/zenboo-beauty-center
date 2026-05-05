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
    dgiiEnvironment: "Pruebas",
    adminPassword: "1234",
  }),
};

const defaultAdminPassword = "1234";
const protectedTabs = ["negocio", "empleadas", "nomina", "contabilidad"];
let unlockedTabs = JSON.parse(sessionStorage.getItem("zenboo_unlocked_tabs")) || [];

const migrateOldData = () => {
  store.invoices = store.invoices.map((invoice) => {
    const withDefaults = { paymentMethod: invoice.paymentMethod || "Efectivo", ...invoice };
    if (withDefaults.employeeId || !withDefaults.employeeName) return withDefaults;
    const employee = store.employees.find((item) => item.name === invoice.employeeName);
    return employee ? { ...withDefaults, employeeId: employee.id, payrollPaid: false } : withDefaults;
  });
};

const save = () => {
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
  saveToServer();
};

const saveToServer = () => {
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
    save();
    render();
  } catch {
    render();
  }
};

const byId = (id) => document.getElementById(id);
const createId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date().toLocaleDateString("es-DO");
const isoToday = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => new Date().toISOString().slice(0, 7);
const numberValue = (id) => Number(byId(id).value || 0);

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
    .map(
      (client) => `
        <article class="item">
          <div>
            <strong>${escapeHtml(client.name)}</strong>
            <small>${escapeHtml(client.phone || "Sin telefono")} | RNC/Cedula: ${escapeHtml(client.taxId || "No indicado")} | ${escapeHtml(client.note || "Sin nota")}</small>
          </div>
          <div class="item-actions">
            <button class="delete-btn" type="button" data-delete-client="${client.id}">Eliminar</button>
          </div>
        </article>
      `
    )
    .join("");
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
  byId("electronicEnabled").value = store.settings.electronicEnabled || "no";
  byId("dgiiEnvironment").value = store.settings.dgiiEnvironment || "Pruebas";
  byId("instagramUrl").value = store.settings.instagramUrl || "";
  byId("instagramLink").href = store.settings.instagramUrl || "#";
};

const renderClosingDefaults = () => {
  if (!byId("closingDate").value) byId("closingDate").value = isoToday();
  if (!byId("closingMonth").value) byId("closingMonth").value = currentMonth();
  if (!byId("appointmentDate").value) byId("appointmentDate").value = isoToday();
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

const appointmentHours = [
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
];

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

  list.innerHTML = appointmentHours
    .map((hour) => {
      const taken = occupied.includes(hour);
      const active = selectedTime === hour;
      return `<button class="slot-btn ${active ? "active" : ""}" type="button" data-slot="${hour}" ${taken ? "disabled" : ""}>${taken ? "Ocupada" : hour}</button>`;
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
            <strong>${escapeHtml(appointment.clientName)} | ${escapeHtml(appointment.dateIso)} ${escapeHtml(appointment.time)}</strong>
            <small>${escapeHtml(appointment.service)} | ${escapeHtml(appointment.employeeName)} | ${escapeHtml(appointment.status)}</small>
          </div>
          <div class="item-actions">
            <a class="print-btn" href="${reminderLink(appointment)}" target="_blank" rel="noreferrer">Recordar</a>
            <button class="delete-btn" type="button" data-cancel-appointment="${appointment.id}">Cancelar</button>
          </div>
        </article>
      `
    )
    .join("");
};

const reminderLink = (appointment) => {
  const phone = appointment.phone.replace(/\D/g, "");
  const text = encodeURIComponent(
    `Hola ${appointment.clientName}, te recordamos tu cita en ZENBOO Beauty Center el ${appointment.dateIso} a las ${appointment.time} con ${appointment.employeeName}.`
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

const payrollRows = () =>
  store.employees.map((employee) => {
    const employeeInvoices = store.invoices.filter(
      (invoice) => invoice.employeeId === employee.id && !invoice.payrollPaid
    );
    const deductions = store.deductions.filter(
      (deduction) => deduction.employeeId === employee.id && !deduction.paid
    );
    const sales = employeeInvoices.reduce((sum, invoice) => sum + invoice.total, 0);
    const commission = employeeInvoices.reduce((sum, invoice) => sum + (invoice.commission || 0), 0);
    const deductionTotal = deductions.reduce((sum, deduction) => sum + deduction.amount, 0);
    const salary = employee.salaryPaid ? 0 : employee.salary || 0;
    const net = salary + commission - deductionTotal;
    return { employee, employeeInvoices, deductions, sales, commission, deductionTotal, salary, net };
  });

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
            ${deductionText(row.deductions)}
          </div>
          <div class="item-actions">
            <button class="print-btn" type="button" data-pay-employee="${row.employee.id}">Marcar pagado</button>
          </div>
        </article>
      `
    )
    .join("");
};

const deductionText = (deductions) => {
  if (!deductions.length) return '<small>Sin gastos a descontar.</small>';
  return `<small>Descuentos: ${deductions
    .map((item) => `${escapeHtml(item.reason)} ${money.format(item.amount)}`)
    .join(" | ")}</small>`;
};

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
  store.employees.push({
    id: createId(),
    name: byId("employeeName").value.trim(),
    phone: byId("employeePhone").value.trim(),
    identity: byId("employeeIdentity").value.trim(),
    role: byId("employeeRole").value.trim(),
    salary: numberValue("employeeSalary"),
  });
  event.target.reset();
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
  let changed = false;

  if (target.dataset.deleteClient) {
    store.clients = store.clients.filter((client) => client.id !== target.dataset.deleteClient);
    changed = true;
  }
  if (target.dataset.deleteService) {
    store.services = store.services.filter((service) => service.id !== target.dataset.deleteService);
    changed = true;
  }
  if (target.dataset.deleteEmployee) {
    store.employees = store.employees.filter((employee) => employee.id !== target.dataset.deleteEmployee);
    changed = true;
  }
  if (target.dataset.deleteInvoice) {
    store.invoices = store.invoices.filter((invoice) => invoice.id !== target.dataset.deleteInvoice);
    changed = true;
  }
  if (target.dataset.deleteExpense) {
    store.expenses = store.expenses.filter((expense) => expense.id !== target.dataset.deleteExpense);
    changed = true;
  }
  if (target.dataset.cancelAppointment) {
    store.appointments = store.appointments.map((appointment) =>
      appointment.id === target.dataset.cancelAppointment ? { ...appointment, status: "Cancelada" } : appointment
    );
    changed = true;
  }
  if (target.dataset.slot) {
    byId("appointmentTime").value = target.dataset.slot;
    renderAvailableSlots();
    return;
  }
  if (target.dataset.viewInvoice) {
    const invoice = store.invoices.find((item) => item.id === target.dataset.viewInvoice);
    if (invoice) showInvoice(invoice);
    return;
  }
  if (target.dataset.printInvoice) {
    const invoice = store.invoices.find((item) => item.id === target.dataset.printInvoice);
    if (invoice) {
      showInvoice(invoice);
      printSection("invoice");
    }
    return;
  }
  if (target.dataset.payEmployee) {
    payEmployee(target.dataset.payEmployee);
    return;
  }
  if (target.dataset.resetSalary) {
    store.employees = store.employees.map((employee) =>
      employee.id === target.dataset.resetSalary ? { ...employee, salaryPaid: false } : employee
    );
    changed = true;
  }
  if (changed) {
    save();
    render();
  }
});

const payEmployee = (employeeId) => {
  const row = payrollRows().find((item) => item.employee.id === employeeId);
  if (!row) return;

  store.payrollPayments.push({
    id: createId(),
    employeeId,
    employeeName: row.employee.name,
    salary: row.salary,
    commission: row.commission,
    deductions: row.deductionTotal,
    net: row.net,
    date: today(),
    dateIso: isoToday(),
  });

  store.invoices = store.invoices.map((invoice) =>
    invoice.employeeId === employeeId ? { ...invoice, payrollPaid: true } : invoice
  );
  store.deductions = store.deductions.map((deduction) =>
    deduction.employeeId === employeeId ? { ...deduction, paid: true } : deduction
  );
  store.employees = store.employees.map((employee) =>
    employee.id === employeeId ? { ...employee, salaryPaid: true } : employee
  );

  save();
  render();
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

const printSection = (mode) => {
  document.body.dataset.printMode = mode;
  window.print();
  setTimeout(() => {
    document.body.dataset.printMode = "";
  }, 300);
};

migrateOldData();
save();
render();
loadFromServer();
