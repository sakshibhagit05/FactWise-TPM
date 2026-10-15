
import { useEffect, useState } from "react";
import "./App.css";

const API_URL = "https://factwise-tpm-backend.onrender.com/api/patients";

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function mapPatient(item) {
  return {
    mongoId: item._id,
    id: item.patientId,
    name: item.name,
    age: item.age,
    gender: item.gender,
    room: item.room ?? "—",
    temp: item.temperature == null ? null : Number(item.temperature),
    days: Number(item.days ?? 0),
    visited: Boolean(item.visited),
    status: item.status || "Admitted",
    history: Array.isArray(item.history) ? item.history : [],
    symptoms: item.symptoms || "",
    doctor: item.doctor || "",
    admissionDate: item.admissionDate,
  };
}

function calculateNoFeverDays(history) {
  const byDate = new Map();

  history.forEach((entry) => {
    if (!entry.date || !Number.isFinite(Number(entry.temperature))) return;

    const readings = byDate.get(entry.date) || [];
    readings.push(Number(entry.temperature));
    byDate.set(entry.date, readings);
  });

  let count = 0;
  const cursor = new Date();
  cursor.setHours(12, 0, 0, 0);

  while (count < 365) {
    const dateKey = getDateKey(cursor);
    const readings = byDate.get(dateKey);

    if (!readings || readings.some((value) => value >= 38)) break;

    count += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return count;
}

function App() {
  const [patients, setPatients] = useState([]);
  const [role, setRole] = useState("Nurse");
  const [page, setPage] = useState("Dashboard");
  const [selected, setSelected] = useState(null);
  const [temperature, setTemperature] = useState("");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const emptyPatient = {
    patientId: "",
    name: "",
    age: "",
    gender: "Female",
    room: "",
    temperature: "",
    symptoms: "",
    doctor: "",
  };

  const [newPatient, setNewPatient] = useState(emptyPatient);

  async function loadPatients() {
    try {
      setLoading(true);
      const response = await fetch(API_URL);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load patients.");
      }

      setPatients(data.patients.map(mapPatient));
    } catch (error) {
      console.error(error);
      setMessage(
        "Backend connection failed. Make sure the backend is running on port 5000."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPatients();
  }, []);

  async function updatePatient(patient, changes) {
    if (!patient?.mongoId) {
      setMessage("Patient database ID missing. Please refresh.");
      return false;
    }

    try {
      setSaving(true);

      const response = await fetch(`${API_URL}/${patient.mongoId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Update failed.");
      }

      await loadPatients();
      return true;
    } catch (error) {
      console.error(error);
      setMessage(error.message || "Could not update patient.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addPatient(event) {
    event.preventDefault();

    if (
      !newPatient.patientId.trim() ||
      !newPatient.name.trim() ||
      newPatient.age === ""
    ) {
      setMessage("Patient ID, name and age are required.");
      return;
    }

    const age = Number(newPatient.age);
    const temp =
      newPatient.temperature === ""
        ? null
        : Number(newPatient.temperature);
    const room =
      newPatient.room === "" ? null : Number(newPatient.room);

    if (!Number.isFinite(age) || age < 0) {
      setMessage("Enter a valid age.");
      return;
    }

    if (room !== null && (!Number.isFinite(room) || room < 1)) {
      setMessage("Enter a valid room number.");
      return;
    }

    if (temp !== null && (!Number.isFinite(temp) || temp < 30 || temp > 45)) {
      setMessage("Temperature must be between 30°C and 45°C.");
      return;
    }

    try {
      setSaving(true);

      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientId: newPatient.patientId.trim(),
          name: newPatient.name.trim(),
          age,
          gender: newPatient.gender,
          room,
          temperature: temp,
          symptoms: newPatient.symptoms.trim(),
          doctor: newPatient.doctor.trim(),
          status: "Admitted",
          visited: false,
          days: 0,
          history:
            temp === null
              ? []
              : [{ date: getDateKey(), temperature: temp }],
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Could not add patient.");
      }

      await loadPatients();
      setNewPatient({ ...emptyPatient });
      setShowAddForm(false);
      setMessage("Patient added successfully.");
    } catch (error) {
      setMessage(error.message || "Could not add patient.");
    } finally {
      setSaving(false);
    }
  }

  async function recordTemperature() {
    if (!selected || temperature.trim() === "") {
      setMessage("Please enter a temperature.");
      return;
    }

    const value = Number(temperature);

    if (!Number.isFinite(value) || value < 30 || value > 45) {
      setMessage("Temperature must be between 30°C and 45°C.");
      return;
    }

    const today = getDateKey();

    if (selected.history.some((entry) => entry.date === today)) {
      setMessage(
        "A temperature is already recorded today. View Daily Monitoring for its history."
      );
      return;
    }

    const history = [
      ...selected.history,
      { date: today, temperature: value },
    ];

    const days = calculateNoFeverDays(history);

    const success = await updatePatient(selected, {
      temperature: value,
      history,
      days,
      status: "Admitted",
    });

    if (success) {
      setSelected(null);
      setTemperature("");
      setMessage(`Temperature saved for ${selected.name}.`);
    }
  }

  async function markVisit(patient) {
    const success = await updatePatient(patient, { visited: true });

    if (success) {
      setMessage(`Doctor visit recorded for ${patient.name}.`);
    }
  }

  async function discharge(patient) {
    if (patient.days < 3 || patient.temp == null || patient.temp >= 38) {
      setMessage("This demo patient does not meet the configured criteria.");
      return;
    }

    const success = await updatePatient(patient, { status: "Discharged" });

    if (success) {
      setMessage(`${patient.name} marked as discharged.`);
    }
  }

  const admitted = patients.filter((p) => p.status !== "Discharged");

  const feverCount = admitted.filter(
    (p) => p.temp != null && p.temp >= 38
  ).length;

  const awaitingDoctor = admitted.filter((p) => !p.visited).length;

  const eligible = admitted.filter(
    (p) => p.days >= 3 && p.temp != null && p.temp < 38
  );

  const filteredPatients = patients.filter((p) => {
    const query = search.toLowerCase();

    return (
      (page === "Daily Monitoring" || p.status !== "Discharged") &&
      (p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query) ||
        String(p.room).includes(query))
    );
  });

  function changePage(nextPage) {
    setPage(nextPage);
    setSelected(null);
    setTemperature("");
    setMessage("");
    setSearch("");
    setShowAddForm(false);
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <h2>✚ FactWise</h2>
        <p className="side-label">QUARANTINE CARE</p>

        {["Dashboard", "Patients", "Daily Monitoring"].map((item) => (
          <button
            key={item}
            className={`nav ${page === item ? "active" : ""}`}
            onClick={() => changePage(item)}
          >
            {item === "Dashboard" && "▦ "}
            {item === "Patients" && "♙ "}
            {item === "Daily Monitoring" && "♡ "}
            {item}
          </button>
        ))}

        <div className="side-bottom">
          Patient Care System
          <br />
          Version 1.0
        </div>
      </aside>

      <main className="main">
        <header>
          <div>
            <p className="eyebrow">FACILITY OVERVIEW</p>
            <h1>
              {page === "Daily Monitoring"
                ? "Daily Monitoring"
                : page === "Patients"
                  ? "Patient Records"
                  : "Quarantine Dashboard"}
            </h1>
            <p className="muted">
              {page === "Daily Monitoring"
                ? "View date-wise temperature history and fever-free days."
                : "Monitor patient records, temperatures and care progress."}
            </p>
          </div>

          <div className="role-box">
            <label htmlFor="role">Your role</label>
            <select
              id="role"
              value={role}
              onChange={(e) => {
                setRole(e.target.value);
                setSelected(null);
                setTemperature("");
                setMessage("");
              }}
            >
              <option>Nurse</option>
              <option>Doctor</option>
              <option>Admin</option>
            </select>
          </div>
        </header>

        {message && (
          <div className="notice" role="status">
            <span>{message}</span>
            <button onClick={() => setMessage("")} aria-label="Dismiss message">
              ✕
            </button>
          </div>
        )}

        {page === "Dashboard" && (
          <section className="stats">
            <div className="stat">
              <span>Admitted Patients</span>
              <strong>{admitted.length} <small>/ 74 beds</small></strong>
              <p>Current occupancy</p>
            </div>
            <div className="stat">
              <span>Fever Alerts</span>
              <strong>{feverCount}</strong>
              <p>Temperature ≥ 38°C</p>
            </div>
            <div className="stat">
              <span>Awaiting Doctor</span>
              <strong>{awaitingDoctor}</strong>
              <p>Visits not recorded</p>
            </div>
            <div className="stat">
              <span>Discharge Review</span>
              <strong>{eligible.length}</strong>
              <p>Needs admin review</p>
            </div>
          </section>
        )}

        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>
                {page === "Daily Monitoring"
                  ? "Temperature History"
                  : page === "Patients"
                    ? "Patient Records"
                    : "Patient Management"}
              </h2>
              <p className="muted">
                Data is loaded from your backend and MongoDB database.
              </p>
            </div>
            <span className="pill">{role} view</span>
          </div>

          <div className="search-row">
            <input
              type="search"
              placeholder="Search by patient name, ID or room..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {page !== "Daily Monitoring" && (
              <button
                className="primary"
                onClick={() => setShowAddForm(!showAddForm)}
              >
                {showAddForm ? "Cancel" : "+ Add Patient"}
              </button>
            )}

            <button
              className="secondary"
              onClick={loadPatients}
              disabled={loading}
            >
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>

          {showAddForm && page !== "Daily Monitoring" && (
            <form className="entry-form" onSubmit={addPatient}>
              <h3>Add New Patient</h3>

              <label>Patient ID</label>
              <input
                required
                placeholder="e.g. PT002"
                value={newPatient.patientId}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, patientId: e.target.value })
                }
              />

              <label>Full Name</label>
              <input
                required
                value={newPatient.name}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, name: e.target.value })
                }
              />

              <label>Age</label>
              <input
                required
                type="number"
                min="0"
                value={newPatient.age}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, age: e.target.value })
                }
              />

              <label>Gender</label>
              <select
                value={newPatient.gender}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, gender: e.target.value })
                }
              >
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>

              <label>Room</label>
              <input
                type="number"
                min="1"
                value={newPatient.room}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, room: e.target.value })
                }
              />

              <label>Initial Temperature (optional)</label>
              <input
                type="number"
                min="30"
                max="45"
                step="0.1"
                value={newPatient.temperature}
                onChange={(e) =>
                  setNewPatient({
                    ...newPatient,
                    temperature: e.target.value,
                  })
                }
              />

              <label>Symptoms</label>
              <input
                value={newPatient.symptoms}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, symptoms: e.target.value })
                }
              />

              <label>Doctor</label>
              <input
                value={newPatient.doctor}
                onChange={(e) =>
                  setNewPatient({ ...newPatient, doctor: e.target.value })
                }
              />

              <button className="primary" type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save Patient"}
              </button>
            </form>
          )}

          {selected && role === "Nurse" && page !== "Daily Monitoring" && (
            <div className="entry-form">
              <h3>Record Temperature — {selected.name}</h3>
              <label htmlFor="temp">Temperature (°C)</label>
              <input
                id="temp"
                type="number"
                min="30"
                max="45"
                step="0.1"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                placeholder="e.g. 36.8"
              />
              <button
                className="primary"
                onClick={recordTemperature}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Temperature"}
              </button>
              <button
                className="secondary"
                onClick={() => {
                  setSelected(null);
                  setTemperature("");
                }}
              >
                Cancel
              </button>
            </div>
          )}

          {loading ? (
            <p>Loading patients from MongoDB...</p>
          ) : page === "Daily Monitoring" ? (
            <div className="monitoring-list">
              {filteredPatients.map((patient) => (
                <article className="monitoring-card" key={patient.mongoId}>
                  <div className="monitoring-heading">
                    <div>
                      <h3>{patient.name}</h3>
                      <p className="muted">
                        {patient.id} · {patient.age} years · Room {patient.room}
                      </p>
                    </div>
                    <span
                      className={
                        patient.temp != null && patient.temp >= 38
                          ? "fever"
                          : "normal"
                      }
                    >
                      {patient.temp == null
                        ? "No current reading"
                        : `${patient.temp.toFixed(1)}°C`}
                    </span>
                  </div>

                  <p>
                    <strong>Fever-free days recorded:</strong>{" "}
                    {patient.days}
                  </p>

                  <h4>Temperature History</h4>

                  {patient.history.length === 0 ? (
                    <p className="muted">No temperature history recorded yet.</p>
                  ) : (
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Temperature</th>
                            <th>Reading</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[...patient.history]
                            .sort((a, b) => b.date.localeCompare(a.date))
                            .map((entry, index) => (
                              <tr key={`${entry.date}-${index}`}>
                                <td>{entry.date}</td>
                                <td>{Number(entry.temperature).toFixed(1)}°C</td>
                                <td>
                                  {Number(entry.temperature) >= 38
                                    ? "Fever alert"
                                    : "Below 38°C"}
                                </td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {role === "Nurse" && patient.status !== "Discharged" && (
                    <button
                      className="primary"
                      onClick={() => {
                        setPage("Patients");
                        setSelected(patient);
                        setTemperature("");
                        setMessage("");
                      }}
                    >
                      Record Temperature
                    </button>
                  )}
                </article>
              ))}

              {filteredPatients.length === 0 && (
                <p>No matching patients found.</p>
              )}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Room</th>
                    <th>Temperature</th>
                    <th>Doctor Visit</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPatients.map((patient) => {
                    const canDischarge =
                      patient.days >= 3 &&
                      patient.temp != null &&
                      patient.temp < 38;

                    return (
                      <tr key={patient.mongoId || patient.id}>
                        <td>
                          <strong>{patient.name}</strong>
                          <small>
                            {patient.id} · {patient.age} years
                          </small>
                        </td>
                        <td>{patient.room}</td>
                        <td>
                          <span
                            className={
                              patient.temp != null && patient.temp >= 38
                                ? "fever"
                                : "normal"
                            }
                          >
                            {patient.temp == null
                              ? "Not recorded"
                              : `${patient.temp.toFixed(1)}°C`}
                          </span>
                        </td>
                        <td>
                          <span className={patient.visited ? "normal" : "pending"}>
                            {patient.visited ? "Completed" : "Pending"}
                          </span>
                        </td>
                        <td>{patient.status}</td>
                        <td>
                          {role === "Nurse" && (
                            <button
                              className="action"
                              disabled={saving || patient.status === "Discharged"}
                              onClick={() => {
                                setSelected(patient);
                                setTemperature("");
                                setMessage("");
                              }}
                            >
                              Record
                            </button>
                          )}

                          {role === "Doctor" && (
                            <button
                              className="action"
                              disabled={patient.visited || saving}
                              onClick={() => markVisit(patient)}
                            >
                              {patient.visited ? "Visited" : "Mark Visit"}
                            </button>
                          )}

                          {role === "Admin" && (
                            <button
                              className="action"
                              disabled={!canDischarge || saving}
                              onClick={() => discharge(patient)}
                            >
                              {canDischarge ? "Discharge" : "Not Eligible"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}

                  {filteredPatients.length === 0 && (
                    <tr>
                      <td colSpan="6">No matching patients found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <p className="footnote">
            Prototype for development and demonstration only. Not for clinical
            decision-making or storing real patient information.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
