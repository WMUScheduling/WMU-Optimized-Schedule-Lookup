import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Search, Filter, Star, Users, CalendarDays, Clock3, BookOpen, Wifi, RotateCcw } from "lucide-react";
import { motion } from "framer-motion";

const CSV_PATH = `${import.meta.env.BASE_URL}wmu_summer_2026_with_rmp.csv`;

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractDays(meetingSummary = "") {
  const matches = [...meetingSummary.matchAll(/\|\s*([MTWRFSU]{1,7})\s*\|/g)].map((m) => m[1]);
  return [...new Set(matches)].join(", ");
}

function inferModality(row) {
  const text = `${row.instructionalMethodDescription || ""} ${row.meetingTypes || ""} ${row.meetingSummary || ""}`.toLowerCase();
  if (text.includes("asynchronous")) return "Asynchronous Online";
  if (text.includes("fully synchronous")) return "Fully Synchronous Online";
  if (text.includes("partially synchronous")) return "Partially Synchronous Online";
  if (text.includes("online")) return "Online";
  return row.campusDescription || "Other";
}

function summarizeCredits(row) {
  if (row.creditHours) return String(row.creditHours);
  if (row.creditHourLow && row.creditHourHigh && row.creditHourLow !== row.creditHourHigh) {
    return `${row.creditHourLow}-${row.creditHourHigh}`;
  }
  if (row.creditHourLow) return String(row.creditHourLow);
  return "—";
}

function rowScore(row) {
  const rating = parseNumber(row.rmp_rating) ?? 0;
  const difficulty = parseNumber(row.rmp_difficulty) ?? 0;
  const ratingsCount = parseNumber(row.rmp_num_ratings) ?? 0;
  const seats = parseNumber(row.seatsAvailable) ?? 0;
  return rating * 2 - difficulty * 0.6 + Math.min(ratingsCount / 20, 1.5) + Math.min(seats / 20, 1);
}

function pillStyle(bg, color) {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "999px",
    background: bg,
    color,
    fontSize: "13px",
    fontWeight: 500,
  };
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [modality, setModality] = useState("all");
  const [sortBy, setSortBy] = useState("best");
  const [minRating, setMinRating] = useState(0);
  const [openOnly, setOpenOnly] = useState(false);
  const [upperDivisionOnly, setUpperDivisionOnly] = useState(false);
  const [psychOnly, setPsychOnly] = useState(false);

  useEffect(() => {
    Papa.parse(CSV_PATH, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsed = (results.data || []).map((row, index) => ({
          ...row,
          _id: `${row.CRN || index}`,
          _modality: inferModality(row),
          _creditsText: summarizeCredits(row),
          _days: extractDays(row.meetingSummary),
          _rating: parseNumber(row.rmp_rating),
          _difficulty: parseNumber(row.rmp_difficulty),
          _ratingsCount: parseNumber(row.rmp_num_ratings),
          _seats: parseNumber(row.seatsAvailable) ?? 0,
          _open: String(row.openSection).toLowerCase() === "true",
          _upperDivision:
            (parseNumber(row.courseNumber) ?? 0) >= 3000 ||
            String(row.attributes || "").toLowerCase().includes("upper division"),
          _score: rowScore(row),
        }));
        setRows(parsed);
        setLoading(false);
      },
      error: () => {
        setError("Could not load the CSV. Make sure the file is inside your public folder.");
        setLoading(false);
      },
    });
  }, []);

  const subjects = useMemo(() => {
    return [...new Set(rows.map((r) => r.subject).filter(Boolean))].sort();
  }, [rows]);

  const modalities = useMemo(() => {
    return [...new Set(rows.map((r) => r._modality).filter(Boolean))].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    let data = [...rows];

    if (query.trim()) {
      const q = query.toLowerCase();
      data = data.filter((r) =>
        [
          r.subject,
          r.courseNumber,
          r.courseTitle,
          r.facultyNames,
          r.attributes,
          r.campusDescription,
          r.meetingSummary,
          r.rmp_department,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (subject !== "all") data = data.filter((r) => r.subject === subject);
    if (psychOnly) data = data.filter((r) => r.subject === "PSY");
    if (modality !== "all") data = data.filter((r) => r._modality === modality);
    if (openOnly) data = data.filter((r) => r._open && r._seats > 0);
    if (upperDivisionOnly) data = data.filter((r) => r._upperDivision);
    if (minRating > 0) data = data.filter((r) => (r._rating ?? 0) >= minRating);

    switch (sortBy) {
      case "rating":
        data.sort((a, b) => (b._rating ?? -1) - (a._rating ?? -1));
        break;
      case "difficulty":
        data.sort((a, b) => (a._difficulty ?? 999) - (b._difficulty ?? 999));
        break;
      case "seats":
        data.sort((a, b) => (b._seats ?? 0) - (a._seats ?? 0));
        break;
      case "course":
        data.sort((a, b) => `${a.subject}${a.courseNumber}`.localeCompare(`${b.subject}${b.courseNumber}`));
        break;
      default:
        data.sort((a, b) => b._score - a._score);
    }

    return data;
  }, [rows, query, subject, modality, sortBy, minRating, openOnly, upperDivisionOnly, psychOnly]);

  const stats = useMemo(() => {
    const openCount = filtered.filter((r) => r._open && r._seats > 0).length;
    const rated = filtered.filter((r) => r._rating != null);
    const avgRating = rated.length
      ? (rated.reduce((sum, r) => sum + (r._rating ?? 0), 0) / rated.length).toFixed(2)
      : "—";

    return {
      total: filtered.length,
      open: openCount,
      avgRating,
    };
  }, [filtered]);

  function resetFilters() {
    setQuery("");
    setSubject("all");
    setModality("all");
    setSortBy("best");
    setMinRating(0);
    setOpenOnly(false);
    setUpperDivisionOnly(false);
    setPsychOnly(false);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f8fafc",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        color: "#0f172a",
      }}
    >
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "24px",
              boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)",
              marginBottom: "24px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <h1 style={{ margin: 0, fontSize: "36px" }}>WMU Course Finder</h1>
                <p style={{ marginTop: "10px", color: "#475569" }}>
                  Search classes, compare instructors, and filter by modality, availability, level, and ratings.
                </p>
              </div>
              <div style={pillStyle("#e2e8f0", "#0f172a")}>Summer 2026</div>
            </div>
          </div>
        </motion.div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "280px 1fr",
            gap: "24px",
            alignItems: "start",
          }}
        >
          <div
            style={{
              background: "#ffffff",
              borderRadius: "24px",
              padding: "20px",
              boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)",
              position: "sticky",
              top: "24px",
            }}
          >
            <h2 style={{ marginTop: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <Filter size={18} /> Filters
            </h2>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Search</label>
              <div style={{ position: "relative" }}>
                <Search size={16} style={{ position: "absolute", left: "10px", top: "12px", color: "#64748b" }} />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="PSY, async, professor..."
                  style={{
                    width: "100%",
                    padding: "10px 12px 10px 34px",
                    borderRadius: "12px",
                    border: "1px solid #cbd5e1",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Subject</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "12px", border: "1px solid #cbd5e1" }}
              >
                <option value="all">All subjects</option>
                {subjects.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Modality</label>
              <select
                value={modality}
                onChange={(e) => setModality(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "12px", border: "1px solid #cbd5e1" }}
              >
                <option value="all">All modalities</option>
                {modalities.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>
                Minimum RMP Rating: {minRating.toFixed(1)}
              </label>
              <input
                type="range"
                min="0"
                max="5"
                step="0.1"
                value={minRating}
                onChange={(e) => setMinRating(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label style={{ display: "block", marginBottom: "6px", fontWeight: 600 }}>Sort by</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{ width: "100%", padding: "10px", borderRadius: "12px", border: "1px solid #cbd5e1" }}
              >
                <option value="best">Best overall</option>
                <option value="rating">Highest rating</option>
                <option value="difficulty">Lowest difficulty</option>
                <option value="seats">Most open seats</option>
                <option value="course">Course number</option>
              </select>
            </div>

            <div
              style={{
                background: "#f8fafc",
                borderRadius: "16px",
                padding: "12px",
                marginBottom: "16px",
              }}
            >
              <label style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
                Open sections only
              </label>
              <label style={{ display: "flex", gap: "8px", marginBottom: "10px" }}>
                <input
                  type="checkbox"
                  checked={upperDivisionOnly}
                  onChange={(e) => setUpperDivisionOnly(e.target.checked)}
                />
                Upper division only
              </label>
              <label style={{ display: "flex", gap: "8px" }}>
                <input type="checkbox" checked={psychOnly} onChange={(e) => setPsychOnly(e.target.checked)} />
                PSY only
              </label>
            </div>

            <button
              onClick={resetFilters}
              style={{
                width: "100%",
                padding: "12px",
                borderRadius: "12px",
                border: "1px solid #cbd5e1",
                background: "#ffffff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              <span style={{ display: "inline-flex", alignItems: "center", gap: "8px" }}>
                <RotateCcw size={16} />
                Reset filters
              </span>
            </button>
          </div>

          <div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: "16px",
                marginBottom: "20px",
              }}
            >
              <div style={{ background: "#fff", borderRadius: "20px", padding: "18px", boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>Results</div>
                <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "6px" }}>{stats.total}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: "20px", padding: "18px", boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>Open</div>
                <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "6px" }}>{stats.open}</div>
              </div>
              <div style={{ background: "#fff", borderRadius: "20px", padding: "18px", boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)" }}>
                <div style={{ fontSize: "12px", color: "#64748b", textTransform: "uppercase" }}>Avg Rating</div>
                <div style={{ fontSize: "30px", fontWeight: 700, marginTop: "6px" }}>{stats.avgRating}</div>
              </div>
            </div>

            {loading && <div>Loading courses...</div>}
            {error && <div style={{ color: "crimson" }}>{error}</div>}

            {!loading &&
              !error &&
              filtered.map((row, i) => (
                <motion.div
                  key={row._id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.01, 0.12) }}
                  style={{
                    background: "#ffffff",
                    borderRadius: "24px",
                    padding: "20px",
                    boxShadow: "0 4px 18px rgba(15, 23, 42, 0.08)",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "18px", flexWrap: "wrap" }}>
                    <div style={{ flex: 1, minWidth: "300px" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                        <span style={pillStyle("#e2e8f0", "#0f172a")}>{row.subject} {row.courseNumber}</span>
                        <span style={pillStyle("#f1f5f9", "#334155")}>Section {row.section}</span>
                        <span style={pillStyle("#f1f5f9", "#334155")}>CRN {row.CRN}</span>
                        {row._open && row._seats > 0 ? (
                          <span style={pillStyle("#dcfce7", "#166534")}>{row._seats} seats open</span>
                        ) : (
                          <span style={pillStyle("#fee2e2", "#991b1b")}>Closed or full</span>
                        )}
                      </div>

                      <h3 style={{ margin: "0 0 6px 0", fontSize: "24px" }}>{row.courseTitle || "Untitled Course"}</h3>
                      <p style={{ margin: "0 0 12px 0", color: "#475569" }}>{row.facultyNames || "Instructor not listed"}</p>

                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <span style={pillStyle("#f8fafc", "#334155")}><BookOpen size={14} /> {row._creditsText} credits</span>
                        <span style={pillStyle("#f8fafc", "#334155")}><Wifi size={14} /> {row._modality}</span>
                        <span style={pillStyle("#f8fafc", "#334155")}><CalendarDays size={14} /> {row._days || "No fixed days"}</span>
                        <span style={pillStyle("#f8fafc", "#334155")}><Clock3 size={14} /> {row.campusDescription || "Campus not listed"}</span>
                        <span style={pillStyle("#f8fafc", "#334155")}><Users size={14} /> {row.enrollment || 0}/{row.maximumEnrollment || "—"} enrolled</span>
                      </div>

                      {row.attributes && (
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          {String(row.attributes)
                            .split(";")
                            .filter(Boolean)
                            .slice(0, 6)
                            .map((attr) => (
                              <span key={attr} style={pillStyle("#eff6ff", "#1d4ed8")}>
                                {attr.trim()}
                              </span>
                            ))}
                        </div>
                      )}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(110px, 1fr))",
                        gap: "12px",
                        minWidth: "320px",
                      }}
                    >
                      <div style={{ background: "#fffbeb", borderRadius: "18px", padding: "14px" }}>
                        <div style={{ fontSize: "13px", color: "#a16207", display: "flex", alignItems: "center", gap: "6px" }}>
                          <Star size={14} /> RMP Rating
                        </div>
                        <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "8px" }}>{row._rating ?? "—"}</div>
                        <div style={{ fontSize: "12px", color: "#64748b" }}>{row._ratingsCount ?? 0} ratings</div>
                      </div>

                      <div style={{ background: "#f1f5f9", borderRadius: "18px", padding: "14px" }}>
                        <div style={{ fontSize: "13px", color: "#334155" }}>Difficulty</div>
                        <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "8px" }}>{row._difficulty ?? "—"}</div>
                      </div>

                      <div style={{ background: "#ecfdf5", borderRadius: "18px", padding: "14px" }}>
                        <div style={{ fontSize: "13px", color: "#047857" }}>Best Fit</div>
                        <div style={{ fontSize: "28px", fontWeight: 700, marginTop: "8px" }}>{row._score.toFixed(1)}</div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}