import React, { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { Search, Filter, Star, Users, CalendarDays, Clock3, BookOpen, Wifi, RotateCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { motion } from "framer-motion";

const CSV_PATH = "/mnt/data/wmu_summer_2026_with_rmp.csv";

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

export default function WmuCourseFinderApp() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("all");
  const [modality, setModality] = useState("all");
  const [sortBy, setSortBy] = useState("best");
  const [minRating, setMinRating] = useState([0]);
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
          _subjectCourse: `${row.subject || ""}${row.courseNumber || ""}`,
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
        setError("Could not load the CSV. Make sure wmu_summer_2026_with_rmp.csv is available.");
        setLoading(false);
      },
    });
  }, []);

  const subjects = useMemo(() => {
    const vals = [...new Set(rows.map((r) => r.subject).filter(Boolean))].sort();
    return vals;
  }, [rows]);

  const modalities = useMemo(() => {
    const vals = [...new Set(rows.map((r) => r._modality).filter(Boolean))].sort();
    return vals;
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
    if (minRating[0] > 0) data = data.filter((r) => (r._rating ?? 0) >= minRating[0]);

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

  const resetFilters = () => {
    setQuery("");
    setSubject("all");
    setModality("all");
    setSortBy("best");
    setMinRating([0]);
    setOpenOnly(false);
    setUpperDivisionOnly(false);
    setPsychOnly(false);
  };

  const stats = useMemo(() => {
    const openCount = filtered.filter((r) => r._open && r._seats > 0).length;
    const avgRating = filtered.filter((r) => r._rating != null);
    const meanRating = avgRating.length
      ? (avgRating.reduce((sum, r) => sum + (r._rating ?? 0), 0) / avgRating.length).toFixed(2)
      : "—";
    return {
      total: filtered.length,
      open: openCount,
      avgRating: meanRating,
    };
  }, [filtered]);

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid gap-4 md:grid-cols-[1.4fr_0.6fr]"
        >
          <Card className="rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-3xl font-semibold tracking-tight">WMU Course Finder</CardTitle>
                  <p className="mt-2 text-sm text-slate-600">
                    Search classes, compare instructors, and filter by modality, level, availability, and rating.
                  </p>
                </div>
                <Badge className="rounded-full px-3 py-1 text-sm">Summer 2026</Badge>
              </div>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-3 gap-4">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs uppercase text-slate-500">Results</div>
                <div className="mt-2 text-2xl font-semibold">{stats.total}</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs uppercase text-slate-500">Open</div>
                <div className="mt-2 text-2xl font-semibold">{stats.open}</div>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardContent className="p-4">
                <div className="text-xs uppercase text-slate-500">Avg Rating</div>
                <div className="mt-2 text-2xl font-semibold">{stats.avgRating}</div>
              </CardContent>
            </Card>
          </div>
        </motion.div>

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="h-fit rounded-2xl border-0 shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5" /> Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" placeholder="PSY, async, professor..." />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Subject</Label>
                <Select value={subject} onValueChange={setSubject}>
                  <SelectTrigger>
                    <SelectValue placeholder="All subjects" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All subjects</SelectItem>
                    {subjects.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Modality</Label>
                <Select value={modality} onValueChange={setModality}>
                  <SelectTrigger>
                    <SelectValue placeholder="All modalities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All modalities</SelectItem>
                    {modalities.map((m) => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3">
                <Label>Minimum RMP Rating: {minRating[0].toFixed(1)}</Label>
                <Slider value={minRating} min={0} max={5} step={0.1} onValueChange={setMinRating} />
              </div>

              <div className="space-y-3">
                <Label>Sort by</Label>
                <Select value={sortBy} onValueChange={setSortBy}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="best">Best overall</SelectItem>
                    <SelectItem value="rating">Highest rating</SelectItem>
                    <SelectItem value="difficulty">Lowest difficulty</SelectItem>
                    <SelectItem value="seats">Most open seats</SelectItem>
                    <SelectItem value="course">Course number</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 rounded-xl bg-slate-50 p-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="openOnly" checked={openOnly} onCheckedChange={(v) => setOpenOnly(Boolean(v))} />
                  <Label htmlFor="openOnly">Open sections only</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="upperDivisionOnly" checked={upperDivisionOnly} onCheckedChange={(v) => setUpperDivisionOnly(Boolean(v))} />
                  <Label htmlFor="upperDivisionOnly">Upper division only</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="psychOnly" checked={psychOnly} onCheckedChange={(v) => setPsychOnly(Boolean(v))} />
                  <Label htmlFor="psychOnly">PSY only</Label>
                </div>
              </div>

              <Button variant="outline" className="w-full gap-2" onClick={resetFilters}>
                <RotateCcw className="h-4 w-4" /> Reset filters
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-4">
            {loading && <Card className="rounded-2xl border-0 shadow-sm"><CardContent className="p-6">Loading courses...</CardContent></Card>}
            {error && <Card className="rounded-2xl border-0 shadow-sm"><CardContent className="p-6 text-red-600">{error}</CardContent></Card>}

            {!loading && !error && filtered.map((row, i) => (
              <motion.div key={row._id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.01, 0.15) }}>
                <Card className="rounded-2xl border-0 shadow-sm transition-shadow hover:shadow-md">
                  <CardContent className="p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="secondary" className="rounded-full">{row.subject} {row.courseNumber}</Badge>
                          <Badge variant="outline" className="rounded-full">Section {row.section}</Badge>
                          <Badge variant="outline" className="rounded-full">CRN {row.CRN}</Badge>
                          {row._open && row._seats > 0 ? (
                            <Badge className="rounded-full">{row._seats} seats open</Badge>
                          ) : (
                            <Badge variant="destructive" className="rounded-full">Closed or full</Badge>
                          )}
                        </div>

                        <div>
                          <h3 className="text-xl font-semibold text-slate-900">{row.courseTitle || "Untitled Course"}</h3>
                          <p className="mt-1 text-sm text-slate-600">{row.facultyNames || "Instructor not listed"}</p>
                        </div>

                        <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><BookOpen className="h-4 w-4" /> {row._creditsText} credits</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Wifi className="h-4 w-4" /> {row._modality}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><CalendarDays className="h-4 w-4" /> {row._days || "No fixed days listed"}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Clock3 className="h-4 w-4" /> {row.campusDescription || "Campus not listed"}</span>
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1"><Users className="h-4 w-4" /> {row.enrollment || 0}/{row.maximumEnrollment || "—"} enrolled</span>
                        </div>

                        {row.attributes && (
                          <div className="flex flex-wrap gap-2">
                            {String(row.attributes).split(";").filter(Boolean).slice(0, 6).map((attr) => (
                              <Badge key={attr} variant="secondary" className="rounded-full bg-blue-50 text-blue-700 hover:bg-blue-50">{attr.trim()}</Badge>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid min-w-[240px] gap-3 sm:grid-cols-3 xl:grid-cols-1">
                        <div className="rounded-2xl bg-amber-50 p-4">
                          <div className="flex items-center gap-2 text-sm font-medium text-amber-700"><Star className="h-4 w-4" /> RMP Rating</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{row._rating ?? "—"}</div>
                          <div className="text-xs text-slate-500">{row._ratingsCount ?? 0} ratings</div>
                        </div>
                        <div className="rounded-2xl bg-slate-100 p-4">
                          <div className="text-sm font-medium text-slate-700">Difficulty</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{row._difficulty ?? "—"}</div>
                        </div>
                        <div className="rounded-2xl bg-emerald-50 p-4">
                          <div className="text-sm font-medium text-emerald-700">Best Fit Score</div>
                          <div className="mt-2 text-2xl font-semibold text-slate-900">{row._score.toFixed(1)}</div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
