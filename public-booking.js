const publicHours = ["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00"];
const publicState = { employees: [], appointments: [], settings: {} };

const publicById = (id) => document.getElementById(id);
const publicToday = () => new Date().toISOString().slice(0, 10);

const loadPublicData = async () => {
  const response = await fetch("/api/public-booking-data");
  const data = await response.json();
  Object.assign(publicState, data);
  renderPublicPage();
};

const renderPublicPage = () => {
  publicById("publicBusinessName").textContent = publicState.settings.businessName || "ZENBOO Beauty Center";
  publicById("publicDate").value ||= publicToday();
  publicById("publicEmployee").innerHTML =
    '<option value="">Selecciona empleada</option>' +
    publicState.employees
      .map((employee) => `<option value="${employee.id}">${escapePublic(employee.name)}${employee.role ? ` - ${escapePublic(employee.role)}` : ""}</option>`)
      .join("");

  if (publicState.settings.instagramUrl) {
    publicById("publicInstagram").href = publicState.settings.instagramUrl;
    publicById("publicInstagram").hidden = false;
  }

  renderPublicSlots();
};

const renderPublicSlots = () => {
  const employeeId = publicById("publicEmployee").value;
  const dateIso = publicById("publicDate").value;
  const selectedTime = publicById("publicTime").value;
  const slots = publicById("publicSlots");

  if (!employeeId || !dateIso) {
    slots.innerHTML = '<span class="empty mini-empty">Elige empleada y fecha.</span>';
    return;
  }

  const occupied = publicState.appointments
    .filter((item) => item.employeeId === employeeId && item.dateIso === dateIso && item.status !== "Cancelada")
    .map((item) => item.time);

  slots.innerHTML = publicHours
    .map((hour) => {
      const taken = occupied.includes(hour);
      const active = selectedTime === hour;
      return `<button class="slot-btn ${active ? "active" : ""}" type="button" data-public-slot="${hour}" ${taken ? "disabled" : ""}>${taken ? "Ocupada" : hour}</button>`;
    })
    .join("");
};

const escapePublic = (text) =>
  String(text).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));

document.body.addEventListener("click", (event) => {
  if (!event.target.dataset.publicSlot) return;
  publicById("publicTime").value = event.target.dataset.publicSlot;
  renderPublicSlots();
});

["publicEmployee", "publicDate"].forEach((id) => {
  publicById(id).addEventListener("input", () => {
    publicById("publicTime").value = "";
    renderPublicSlots();
  });
});

publicById("publicBookingForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = publicById("publicMessage");
  const payload = {
    clientName: publicById("publicClientName").value,
    phone: publicById("publicPhone").value,
    service: publicById("publicService").value,
    employeeId: publicById("publicEmployee").value,
    dateIso: publicById("publicDate").value,
    time: publicById("publicTime").value,
  };

  if (!payload.time) {
    message.textContent = "Elige una hora disponible.";
    message.className = "form-message error";
    return;
  }

  const response = await fetch("/api/public-booking", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    message.textContent = "Esa hora ya no esta disponible. Elige otra.";
    message.className = "form-message error";
    await loadPublicData();
    return;
  }

  message.textContent = "Cita reservada. Te contactaremos para confirmar.";
  message.className = "form-message success";
  event.target.reset();
  publicById("publicTime").value = "";
  await loadPublicData();
});

loadPublicData();
