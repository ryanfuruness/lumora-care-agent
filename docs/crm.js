// Mock Lumora systems of record (CRM, handover scheduler, finance, maintenance).
// In production each handler below is a webhook tool into the real system; here they run in the
// browser as ElevenLabs client tools so the demo needs no backend. Verification is enforced here,
// not only in the prompt: account tools refuse to answer until verify_owner has succeeded.

const DAY = 86400000;
const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const addDays = (d, n) => new Date(d.getTime() + n * DAY);
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fromIso = (s) => { const [y, m, d] = String(s).split("-").map(Number); return y && m && d ? new Date(y, m - 1, d) : null; };
const spoken = (d) => d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const aed = (n) => Math.round(n * 100) / 100;

// Quarterly service-charge due dates: 31 Jan, 30 Apr, 31 Jul, 31 Oct.
function quarterDates(year) {
  return [new Date(year, 0, 31), new Date(year, 3, 30), new Date(year, 6, 31), new Date(year, 9, 31)];
}
function nextDue(from) {
  const all = [...quarterDates(from.getFullYear()), ...quarterDates(from.getFullYear() + 1)];
  return all.find((d) => d >= from);
}
function previousDue(from, back = 1) {
  const all = [...quarterDates(from.getFullYear() - 1), ...quarterDates(from.getFullYear())].filter((d) => d < from);
  return all[all.length - back];
}

function buildUnits() {
  const t = today();
  return {
    "CRK-A-1204": {
      owner: "Omar Haddad", first: "Omar", last4: "4417", language: "ar",
      community: "Lumora Creek", building: "Tower A", type: "2-bedroom apartment", area_sqft: 1180, rate: 16.5,
      handover: { status: "ready", outstanding: [], centre: "Lumora Creek Handover Centre, ground floor, Tower A" },
      charges: { balance: 0, status: "paid_in_advance" },
    },
    "CRK-B-0807": {
      owner: "Sarah Mitchell", first: "Sarah", last4: "2290", language: "en",
      community: "Lumora Creek", building: "Tower B", type: "1-bedroom apartment", area_sqft: 810, rate: 16.5,
      handover: {
        status: "not_ready",
        centre: "Lumora Creek Handover Centre, ground floor, Tower A",
        outstanding: [
          { item: "final_instalment", detail: "Final instalment of AED 42,300 is unpaid. Pay through the Lumora app or by bank transfer quoting the unit number." },
          { item: "utility_registration", detail: "Water and electricity account number not yet shared. Register the unit with the local provider, then upload the account number in the owner portal." },
        ],
      },
      charges: { balance: 0, status: "paid_in_advance" },
    },
    "OAS-TH-031": {
      owner: "Fatima Al Mansoori", first: "Fatima", last4: "7731", language: "ar",
      community: "Lumora Oasis", building: "Townhouse 31", type: "3-bedroom townhouse", area_sqft: 2400, rate: 5.2,
      handover: { status: "completed", completed_on: addDays(t, -214) },
      charges: { status: "current", quartersDue: 1 },
    },
    "OAS-V-112": {
      owner: "Rahul Menon", first: "Rahul", last4: "5582", language: "en",
      community: "Lumora Oasis", building: "Villa 112", type: "4-bedroom villa", area_sqft: 4150, rate: 5.2,
      handover: { status: "completed", completed_on: addDays(t, -668) },
      charges: { status: "overdue", quartersDue: 2 },
    },
  };
}

const SLA = { emergency: "a technician on the way within 2 hours", urgent: "a technician within 24 hours", routine: "a visit within 5 working days" };
const ref = (prefix) => `${prefix}-${Math.floor(100000 + Math.random() * 900000)}`;
const norm = (u) => String(u || "").toUpperCase().replace(/\s+/g, "-").replace(/[^A-Z0-9-]/g, "").replace(/-+/g, "-");

export function createCrm(onRecord = () => {}) {
  const units = buildUnits();
  const session = { verified: null, attempts: 0 };

  const guard = (unit_number) => {
    const u = norm(unit_number);
    if (session.verified !== u) return { error: "not_verified", message: "This unit has not been verified in this conversation. Ask for the unit number and last four digits of the registered mobile, then call verify_owner." };
    return null;
  };

  const handlers = {
    verify_owner({ unit_number, phone_last4 }) {
      if (session.attempts >= 3) return { verified: false, attempts_remaining: 0, message: "Too many failed attempts. Offer a callback from the care team." };
      const u = norm(unit_number);
      const digits = String(phone_last4 || "").replace(/\D/g, "");
      if (!u || digits.length !== 4) return { verified: false, error: "missing_details", message: "Ask the caller for both the unit number and the last four digits of the registered mobile. This did not count as an attempt." };
      const unit = units[u];
      if (unit && digits === unit.last4) {
        session.verified = u;
        session.attempts = 0;
        return { verified: true, unit_number: u, owner_first_name: unit.first, preferred_language: unit.language, community: unit.community, unit_type: unit.type };
      }
      session.attempts += 1;
      return { verified: false, attempts_remaining: 3 - session.attempts, message: "The details do not match our records." };
    },

    get_handover_status({ unit_number }) {
      const denied = guard(unit_number); if (denied) return denied;
      const h = units[norm(unit_number)].handover;
      if (h.status === "completed") return { status: "completed", handed_over_on: spoken(h.completed_on) };
      if (h.status === "not_ready") return { status: "not_ready", outstanding_items: h.outstanding, note: "An appointment can be booked once every item is complete." };
      return { status: "ready", outstanding_items: [], handover_centre: h.centre };
    },

    get_handover_slots({ unit_number, preferred_date }) {
      const denied = guard(unit_number); if (denied) return denied;
      const h = units[norm(unit_number)].handover;
      if (h.status !== "ready") return { error: "not_ready", message: "This unit is not ready for a handover appointment." };
      let d = addDays(today(), 2);
      const p = preferred_date ? fromIso(preferred_date) : null;
      if (p && p > d) d = p;
      const slots = [];
      while (slots.length < 3) {
        const dow = d.getDay();
        if (dow >= 1 && dow <= 5) {
          for (const time of ["09:30", "13:00"]) {
            if (slots.length < 3) slots.push({ slot_id: `${iso(d)}T${time}`, date: spoken(d), time, location: h.centre });
          }
        }
        d = addDays(d, 1);
      }
      return { slots };
    },

    book_handover_appointment({ unit_number, slot_id }) {
      const denied = guard(unit_number); if (denied) return denied;
      const h = units[norm(unit_number)].handover;
      if (h.status !== "ready") return { error: "not_ready" };
      const [date, time] = String(slot_id).split("T");
      const day = fromIso(date);
      if (!day || !time) return { error: "invalid_slot", message: "Use a slot_id returned by get_handover_slots." };
      const confirmation_ref = ref("HO");
      h.status = "booked";
      const record = { kind: "Handover appointment", ref: confirmation_ref, detail: `${norm(unit_number)} · ${spoken(day)} at ${time}` };
      onRecord(record);
      return {
        booked: true, confirmation_ref, date: spoken(day), time, location: h.centre, duration_minutes: 90,
        bring: ["Original Emirates ID or passport", "Notarised power of attorney if someone attends for the owner", "The handover notice (printed or in the app)"],
        change_policy: "Can be moved free of charge up to 24 hours before, through the app or the care line.",
      };
    },

    get_service_charges({ unit_number }) {
      const denied = guard(unit_number); if (denied) return denied;
      const unit = units[norm(unit_number)];
      const annual = aed(unit.area_sqft * unit.rate);
      const quarter = aed(annual / 4);
      const base = { unit_number: norm(unit_number), area_sqft: unit.area_sqft, annual_rate_aed_per_sqft: unit.rate, annual_charge_aed: annual, pay_via: ["Lumora app", "owner portal", "bank transfer quoting the unit number"] };
      const t = today();
      if (unit.charges.status === "paid_in_advance") {
        return { ...base, status: "paid", balance_aed: 0, note: "The first service-charge advance is paid. The next invoice is issued in January." };
      }
      if (unit.charges.status === "overdue") {
        const since = previousDue(t, unit.charges.quartersDue);
        return { ...base, status: "overdue", balance_aed: aed(quarter * unit.charges.quartersDue), overdue_since: spoken(since), days_overdue: Math.round((t - since) / DAY), last_payment: { amount_aed: quarter, date: spoken(previousDue(since, 1) || addDays(since, -92)) } };
      }
      const due = nextDue(t);
      return { ...base, status: "current", balance_aed: quarter, due_date: spoken(due), last_payment: { amount_aed: quarter, date: spoken(addDays(previousDue(t), -3)) } };
    },

    create_maintenance_ticket({ unit_number, category, urgency, location_in_unit, description }) {
      const denied = guard(unit_number); if (denied) return denied;
      const unit = units[norm(unit_number)];
      const ticket_id = ref("MT");
      let coverage, cost_note;
      if (unit.handover.status !== "completed") {
        coverage = "pre_handover";
        cost_note = "The unit is not handed over yet. The issue is logged for the engineer to check at the handover inspection.";
      } else {
        const dlpEnds = addDays(unit.handover.completed_on, 365);
        if (today() <= dlpEnds && category !== "pest") {
          coverage = "covered_under_dlp";
          cost_note = `Covered at no cost under the defects liability period, which runs until ${spoken(dlpEnds)}.`;
        } else {
          coverage = "chargeable";
          cost_note = `The defects liability period ended on ${spoken(dlpEnds)}. Lumora Facility Services charges a visit fee of AED 150 plus parts and labour, quoted before work starts.`;
        }
      }
      onRecord({ kind: `Maintenance · ${urgency}`, ref: ticket_id, detail: `${norm(unit_number)} · ${category}${location_in_unit ? " · " + location_in_unit : ""}` });
      return { ticket_id, urgency, response: SLA[urgency] || SLA.routine, coverage, cost_note, description };
    },

    request_human_callback({ reason, priority, summary, unit_number, caller_language, contact_number }) {
      const case_id = ref("CB");
      const hour = new Date().getHours();
      const inHours = hour >= 8 && hour < 20 && new Date().getDay() !== 0;
      const expected = priority === "high" ? "within 30 minutes" : reason === "payment_plan" || reason === "complaint" ? "within 2 working days" : inHours ? "within 4 hours" : "tomorrow morning after 8 am";
      onRecord({ kind: `Callback · ${reason}`, ref: case_id, detail: summary });
      return { case_id, expected_callback: expected, language: caller_language, uses_number_on_file: !contact_number && session.verified !== null, unit_number: unit_number ? norm(unit_number) : null };
    },
  };

  return { handlers, units };
}
