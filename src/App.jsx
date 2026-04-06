import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import {
  Search,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Wifi,
  MapPin,
  Users,
} from "lucide-react";
import { motion } from "framer-motion";
import "./App.css";

const CSV_PATH = `${import.meta.env.BASE_URL}wmu_summer_2026_with_rmp.csv`;
const WEEK_DAYS = ["M", "T", "W", "R", "F", "S", "U"];
const WEEK_LABELS = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
  S: "Sat",
  U: "Sun",
};

function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function extractDaysArray(meetingSummary = "") {
  const matches = [...meetingSummary.matchAll(/\|\s*([MTWRFSU]{1,7})\s*\|/g)].map(
    (m) => m[1]
  );

  const set = new Set();
  matches.forEach((group) => {
    group.split("").forEach((d) => set.add(d));
  });

  return WEEK_DAYS.filter((d) => set.has(d));
}

function extractTimeRange(meetingSummary = "") {
  const timeMatch = meetingSummary.match(
    /\|\s*(\d{1,2}:\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:\d{2}\s*[AP]M)\s*\|/i
  );

  if (!timeMatch) return "";
  return `${timeMatch[1]} to ${timeMatch[2]}`;
}

function inferModality(row) {
  const text =
    `${row.instructionalMethodDescription || ""} ${row.meetingTypes || ""} ${row.meetingSummary || ""}`.toLowerCase();

  if (
    text.includes("asynchronous") ||
    text.includes("fully synchronous") ||
    text.includes("partially synchronous") ||
    text.includes("online") ||
    text.includes("remote") ||
    text.includes("web")
  ) {
    return "Online";
  }

  return "In Person";
}

function summarizeCredits(row) {
  if (row.creditHours) return String(row.creditHours);
  if (
    row.creditHourLow &&
    row.creditHourHigh &&
    row.creditHourLow !== row.creditHourHigh
  ) {
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

  return (
    rating * 2 -
    difficulty * 0.6 +
    Math.min(ratingsCount / 20, 1.5) +
    Math.min(seats / 20, 1)
  );
}

function normalizeUrl(url) {
  if (!url) return "";
  const trimmed = String(url).trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.includes("ratemyprofessors.com")) {
    return `https://${trimmed.replace(/^\/+/, "")}`;
  }
  return "";
}

function getProfessorLink(row) {
  const preferredKeys = [
    "rmp_link",
    "rmp_url",
    "rmp_profile",
    "rmp_profile_link",
    "professor_link",
    "rateMyProfessorLink",
    "rateMyProfessorURL",
    "rateMyProfessorProfile",
    "RMP Link",
    "RMP URL",
    "Rate My Professor",
    "Rate My Professor Link",
    "Professor URL",
  ];

  for (const key of preferredKeys) {
    const value = row[key];
    const normalized = normalizeUrl(value);
    if (normalized) return normalized;
  }

  for (const [key, value] of Object.entries(row)) {
    if (!value) continue;
    const keyText = String(key).toLowerCase();
    const valueText = String(value).trim();

    const looksRelevant =
      keyText.includes("rmp") ||
      keyText.includes("rate") ||
      keyText.includes("professor") ||
      valueText.toLowerCase().includes("ratemyprofessors.com");

    if (!looksRelevant) continue;

    const normalized = normalizeUrl(valueText);
    if (normalized) return normalized;
  }

  return "";
}

function getSubjectDescription(row) {
  return (
    row.subjectDescription ||
    row.subjectDesc ||
    row.departmentDescription ||
    row.subjectLong ||
    row.subjectLongDescription ||
    row["Subject Description"] ||
    row["Subject Desc"] ||
    ""
  );
}

function isUpperDivision(row) {
  const courseNumber = parseNumber(row.courseNumber);
  return courseNumber !== null && courseNumber >= 3000;
}

function buildScheduleBlocks(row) {
  const activeDays = extractDaysArray(row.meetingSummary || "");
  const timeRange = extractTimeRange(row.meetingSummary || "");

  return WEEK_DAYS.map((day) => ({
    key: day,
    label: WEEK_LABELS[day],
    active: activeDays.includes(day),
    time: activeDays.includes(day) ? timeRange : "",
  }));
}

export default function App() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [modality, setModality] = useState("all");
  const [sortBy, setSortBy] = useState("best");
  const [openOnly, setOpenOnly] = useState(false);
  const [upperDivisionOnly, setUpperDivisionOnly] = useState(false);
  const [minRating, setMinRating] = useState(0);
  const [page, setPage] = useState(1);
  const [resultsPerPage, setResultsPerPage] = useState(25);

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
          _rating: parseNumber(row.rmp_rating),
          _difficulty: parseNumber(row.rmp_difficulty),
          _ratingsCount: parseNumber(row.rmp_num_ratings),
          _seats: parseNumber(row.seatsAvailable) ?? 0,
          _open: String(row.openSection).toLowerCase() === "true",
          _score: rowScore(row),
          _professorLink: getProfessorLink(row),
          _subjectDescription: getSubjectDescription(row),
          _upperDivision: isUpperDivision(row),
          _scheduleBlocks: buildScheduleBlocks(row),
        }));

        setRows(parsed);
        setLoading(false);
      },
      error: () => {
        setError(
          "Could not load the CSV. Make sure wmu_summer_2026_with_rmp.csv is in the public folder."
        );
        setLoading(false);
      },
    });
  }, []);

  const subjects = useMemo(() => {
    const map = new Map();

    rows.forEach((row) => {
      if (!row.subject) return;
      if (!map.has(row.subject)) {
        map.set(row.subject, row._subjectDescription || "");
      } else if (!map.get(row.subject) && row._subjectDescription) {
        map.set(row.subject, row._subjectDescription);
      }
    });

    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([abbr, desc]) => ({
        value: abbr,
        label: desc ? `${abbr} | ${desc}` : abbr,
      }));
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
          r.section,
          r.CRN,
          r._subjectDescription,
        ]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }

    if (subject !== "all") {
      data = data.filter((r) => r.subject === subject);
    }

    if (modality !== "all") {
      data = data.filter((r) => r._modality === modality);
    }

    if (openOnly) {
      data = data.filter((r) => r._open && r._seats > 0);
    }

    if (upperDivisionOnly) {
      data = data.filter((r) => r._upperDivision);
    }

    if (minRating > 0) {
      data = data.filter((r) => (r._rating ?? 0) >= minRating);
    }

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
        data.sort((a, b) =>
          `${a.subject}${a.courseNumber}`.localeCompare(`${b.subject}${b.courseNumber}`)
        );
        break;
      default:
        data.sort((a, b) => b._score - a._score);
    }

    return data;
  }, [rows, query, subject, modality, openOnly, upperDivisionOnly, minRating, sortBy]);

  useEffect(() => {
    setPage(1);
  }, [query, subject, modality, openOnly, upperDivisionOnly, minRating, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / resultsPerPage));

  const paginatedRows = useMemo(() => {
    const start = (page - 1) * resultsPerPage;
    return filtered.slice(start, start + resultsPerPage);
  }, [filtered, page, resultsPerPage]);

  const stats = useMemo(() => {
    const openCount = filtered.filter((r) => r._open && r._seats > 0).length;
    const avgRatingRows = filtered.filter((r) => r._rating != null);
    const avgRating = avgRatingRows.length
      ? (
          avgRatingRows.reduce((sum, r) => sum + (r._rating ?? 0), 0) /
          avgRatingRows.length
        ).toFixed(2)
      : "—";

    return {
      total: filtered.length,
      open: openCount,
      avgRating,
    };
  }, [filtered]);

  const resetFilters = () => {
    setQuery("");
    setSubject("all");
    setModality("all");
    setSortBy("best");
    setOpenOnly(false);
    setUpperDivisionOnly(false);
    setMinRating(0);
    setResultsPerPage(25);
    setPage(1);
  };

  return (
    <div className="app-shell">
      <div className="app-container">
        <motion.header
          className="hero"
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          <div className="hero-topline">WMU Schedule Lookup</div>
          <h1>Find classes faster</h1>
          <p>
            Search courses, compare instructors, and filter by subject, format,
            availability, rating, and upper division status.
          </p>
        </motion.header>

        <section className="stats-grid">
          <div className="stat-card">
            <div className="stat-label">Results</div>
            <div className="stat-value">{stats.total}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Open</div>
            <div className="stat-value">{stats.open}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg Rating</div>
            <div className="stat-value">{stats.avgRating}</div>
          </div>
        </section>

        <section className="filters-panel">
          <div className="filters-header">
            <h2>Filters</h2>
            <button className="reset-button" onClick={resetFilters}>
              <RotateCcw size={16} />
              Reset
            </button>
          </div>

          <div className="filters-grid">
            <div className="field field-search">
              <label>Search</label>
              <div className="search-wrap">
                <Search size={16} className="search-icon" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Course, professor, CRN, subject..."
                />
              </div>
            </div>

            <div className="field">
              <label>Subject</label>
              <select value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="all">All subjects</option>
                {subjects.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="field">
              <label>Format</label>
              <select value={modality} onChange={(e) => setModality(e.target.value)}>
                <option value="all">All formats</option>
                <option value="Online">Online</option>
                <option value="In Person">In person</option>
              </select>
            </div>

            <div className="field">
              <label>Sort by</label>
              <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                <option value="best">Best overall</option>
                <option value="rating">Highest rating</option>
                <option value="difficulty">Lowest difficulty</option>
                <option value="seats">Most open seats</option>
                <option value="course">Course number</option>
              </select>
            </div>

            <div className="field">
              <label>Minimum RMP rating</label>
              <div className="slider-wrap">
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.5"
                  value={minRating}
                  onChange={(e) => setMinRating(Number(e.target.value))}
                />
                <div className="slider-value">
                  {minRating === 0 ? "Any" : `${minRating.toFixed(1)}+`}
                </div>
              </div>
            </div>

            <div className="field">
              <label>Results per page</label>
              <select
                value={resultsPerPage}
                onChange={(e) => {
                  setResultsPerPage(Number(e.target.value));
                  setPage(1);
                }}
              >
                <option value="10">10</option>
                <option value="25">25</option>
                <option value="50">50</option>
              </select>
            </div>

            <div className="checkbox-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                />
                Open sections only
              </label>
            </div>

            <div className="checkbox-row">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={upperDivisionOnly}
                  onChange={(e) => setUpperDivisionOnly(e.target.checked)}
                />
                Upper Division Course
              </label>
            </div>
          </div>
        </section>

        <section className="results-panel">
          <div className="results-toolbar">
            <div>
              Showing{" "}
              <strong>
                {filtered.length === 0 ? 0 : (page - 1) * resultsPerPage + 1}
              </strong>{" "}
              to{" "}
              <strong>{Math.min(page * resultsPerPage, filtered.length)}</strong>{" "}
              of <strong>{filtered.length}</strong>
            </div>

            <div className="pagination">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft size={16} />
                Prev
              </button>
              <span>
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                Next
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {loading && <div className="status-card">Loading courses...</div>}
          {error && <div className="status-card error">{error}</div>}

          {!loading && !error && paginatedRows.length === 0 && (
            <div className="status-card">No courses matched your filters.</div>
          )}

          {!loading && !error && paginatedRows.length > 0 && (
            <div className="cards-grid">
              {paginatedRows.map((row, i) => (
                <motion.article
                  key={row._id}
                  className="course-card"
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.015 }}
                >
                  <div className="course-top">
                    <div>
                      <div className="course-code">
                        {row.subject} {row.courseNumber}
                      </div>
                      <h3>{row.courseTitle || "Untitled Course"}</h3>
                    </div>

                    <div className="course-top-right">
                      {row._upperDivision && (
                        <div className="pill pill-upper">Upper Division</div>
                      )}
                      <div
                        className={`pill ${
                          row._open && row._seats > 0 ? "pill-open" : "pill-closed"
                        }`}
                      >
                        {row._open && row._seats > 0
                          ? `${row._seats} seats open`
                          : "Closed or full"}
                      </div>
                    </div>
                  </div>

                  <div className="course-meta">
                    <span>{row.facultyNames || "Instructor not listed"}</span>
                    <span>Section {row.section || "—"}</span>
                    <span>CRN {row.CRN || "—"}</span>
                  </div>

                  <div className="tag-row">
                    <span className="tag">
                      <Users size={14} />
                      {row._creditsText} credits
                    </span>
                    <span className="tag">
                      <Wifi size={14} />
                      {row._modality}
                    </span>
                    <span className="tag">
                      <MapPin size={14} />
                      {row.campusDescription || "Campus not listed"}
                    </span>

                    {row._professorLink ? (
                      <a
                        href={row._professorLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tag tag-rmp-button"
                        title="Open Rate My Professors profile"
                      >
                        <span className="grad-cap" aria-hidden="true">🎓</span>
                        RMP
                      </a>
                    ) : (
                      <span className="tag tag-rmp-button tag-rmp-missing" title="No RMP link found in this row">
                        <span className="grad-cap" aria-hidden="true">🎓</span>
                        No RMP
                      </span>
                    )}
                  </div>

                  <div className="schedule-panel">
                    <div className="schedule-header">
                      <span>Schedule</span>
                      <span className="schedule-time">
                        {extractTimeRange(row.meetingSummary || "") || "Time not listed"}
                      </span>
                    </div>

                    <div className="schedule-grid">
                      {row._scheduleBlocks.map((block) => (
                        <div
                          key={block.key}
                          className={`schedule-day ${block.active ? "schedule-day-active" : ""}`}
                        >
                          <div className="schedule-day-label">{block.label}</div>
                          <div className="schedule-day-dot">
                            {block.active ? "●" : "○"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {row.attributes && (
                    <div className="attributes">
                      {String(row.attributes)
                        .split(";")
                        .filter(Boolean)
                        .slice(0, 6)
                        .map((attr) => (
                          <span key={attr} className="attribute-chip">
                            {attr.trim()}
                          </span>
                        ))}
                    </div>
                  )}

                  <div className="score-grid">
                    <div className="score-box">
                      <div className="score-label">RMP Rating</div>
                      <div className="score-value">{row._rating ?? "—"}</div>
                      <div className="score-sub">
                        {row._ratingsCount ?? 0} ratings
                      </div>
                    </div>

                    <div className="score-box">
                      <div className="score-label">Difficulty</div>
                      <div className="score-value">{row._difficulty ?? "—"}</div>
                    </div>

                    <div className="score-box">
                      <div className="score-label">Best Fit</div>
                      <div className="score-value score-star">
                        <span className="star-emoji" aria-hidden="true">⭐</span>
                        {row._score.toFixed(1)}
                      </div>
                    </div>
                  </div>
                </motion.article>
              ))}
            </div>
          )}

          {!loading && !error && paginatedRows.length > 0 && (
            <div className="results-footer">
              <div className="pagination">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                >
                  <ChevronLeft size={16} />
                  Prev
                </button>
                <span>
                  Page {page} of {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                >
                  Next
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}