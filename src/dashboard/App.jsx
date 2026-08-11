import { useEffect, useMemo, useState } from "react";
import { get, onValue, ref } from "firebase/database";
import { AnimatePresence, motion } from "framer-motion";
import { db } from "../shared/firebase";
import Toast from "../shared/Toast";
import AnimatedNumber from "../shared/AnimatedNumber";
import { useToast } from "../shared/useToast";
import usePageStylesheet from "../shared/usePageStylesheet";
import { buttonTap, chipTap, gridContainer, gridItem, modalPop, overlayFade } from "../shared/motion";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function polar(cx, cy, r, thetaDeg) {
  const rad = (thetaDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy - r * Math.sin(rad) };
}

function arcPath(cx, cy, r, thetaStart, thetaEnd) {
  const p1 = polar(cx, cy, r, thetaStart);
  const p2 = polar(cx, cy, r, thetaEnd);
  return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
}

function GaugeSVG({ effPct }) {
  const cx = 60, cy = 62, r = 48;
  const maxScale = 120;
  const clamped = Math.max(0, Math.min(maxScale, effPct));
  const pRed = 85 / maxScale, pAmber = 98 / maxScale;
  const thetaOf = (p) => 180 - 180 * p;

  const redPath = arcPath(cx, cy, r, thetaOf(0), thetaOf(pRed));
  const amberPath = arcPath(cx, cy, r, thetaOf(pRed), thetaOf(pAmber));
  const greenPath = arcPath(cx, cy, r, thetaOf(pAmber), thetaOf(1));

  let needleColor = "var(--red)";
  if (effPct >= 98) needleColor = "var(--green)";
  else if (effPct >= 85) needleColor = "var(--amber)";

  const needleLen = arcPath(cx, cy, r, thetaOf(0), thetaOf(Math.min(clamped / maxScale, 1)));

  return (
    <svg width="120" height="60" viewBox="0 0 120 70">
      <path d={redPath} stroke="#fee2e2" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={amberPath} stroke="#fef3c7" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d={greenPath} stroke="#dcfce7" strokeWidth="9" fill="none" strokeLinecap="round" />
      <motion.path
        d={needleLen}
        stroke={needleColor}
        strokeWidth="9"
        fill="none"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </svg>
  );
}

export default function App() {
  usePageStylesheet("/styles/dashboard.css");
  const { message: toastMsg, visible: toastVisible, showToast } = useToast();

  const [allLogs, setAllLogs] = useState({});
  const [totalMachineCount, setTotalMachineCount] = useState(21);
  const [liveText, setLiveText] = useState("Live · connecting");
  const [clock, setClock] = useState("--:--:--");

  const [date, setDate] = useState(todayStr());
  const [shift, setShift] = useState("ALL");
  const [search, setSearch] = useState("");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [sort, setSort] = useState("id");

  const [detailKey, setDetailKey] = useState(null);

  // ---------- Clock ----------
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-GB"));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ---------- Machine count ----------
  useEffect(() => {
    (async () => {
      try {
        const snap = await get(ref(db, "machines"));
        if (snap.exists()) setTotalMachineCount(Object.keys(snap.val()).length);
      } catch {
        /* fall back to default of 21 */
      }
    })();
  }, []);

  // ---------- Live listener ----------
  useEffect(() => {
    const logsRef = ref(db, "daily_logs");
    const unsub = onValue(
      logsRef,
      (snapshot) => {
        setAllLogs(snapshot.exists() ? snapshot.val() : {});
        setLiveText("Live · synced " + new Date().toLocaleTimeString("en-GB"));
      },
      (err) => {
        console.error(err);
        setLiveText("Connection error");
        showToast("⚠️ Could not reach Realtime Database");
      }
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Escape key closes modal ----------
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setDetailKey(null);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // ---------- Filtering ----------
  const filteredLogs = useMemo(() => {
    const q = search.trim().toUpperCase();
    return Object.entries(allLogs)
      .map(([key, log]) => ({ key, ...log }))
      .filter((l) => l.date === date)
      .filter((l) => shift === "ALL" || l.shift === shift)
      .filter((l) => !q || (l.machineId || "").toUpperCase().includes(q))
      .map((l) => {
        const target = (l.hourlyTarget || 0) * 8;
        const actual = Array.isArray(l.hours) ? l.hours.reduce((a, b) => a + (Number(b) || 0), 0) : l.totalActual || 0;
        const efficiency = target > 0 ? (actual / target) * 100 : 0;
        const downtimeCount = l.reasons ? Object.keys(l.reasons).length : 0;
        return { ...l, target, actual, efficiency, downtimeCount };
      })
      .filter((l) => !alertsOnly || l.efficiency < 85)
      .sort((a, b) => {
        if (sort === "eff_asc") return a.efficiency - b.efficiency;
        if (sort === "eff_desc") return b.efficiency - a.efficiency;
        if (sort === "downtime") return b.downtimeCount - a.downtimeCount;
        return (a.machineId || "").localeCompare(b.machineId || "");
      });
  }, [allLogs, date, shift, search, alertsOnly, sort]);

  // ---------- KPIs ----------
  const kpis = useMemo(() => {
    const totalActual = filteredLogs.reduce((a, l) => a + l.actual, 0);
    const totalTarget = filteredLogs.reduce((a, l) => a + l.target, 0);
    const overallEff = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    const alertCount = filteredLogs.filter((l) => l.efficiency < 85).length;
    const downtimeEvents = filteredLogs.reduce((a, l) => a + l.downtimeCount, 0);
    const reporting = filteredLogs.length;

    let effAccent = "var(--red)";
    if (overallEff >= 98) effAccent = "var(--green)";
    else if (overallEff >= 85) effAccent = "var(--amber)";

    return [
      { label: "Actual Output", numeric: totalActual, sub: `of ${totalTarget.toLocaleString()} planned`, accent: "var(--blue)" },
      { label: "Overall OEE", numeric: overallEff, suffix: "%", sub: "target-weighted", accent: effAccent },
      { label: "Machines Reporting", numeric: reporting, sub: `of ${totalMachineCount} on the line`, accent: "var(--metal-text)" },
      { label: "In Alert (<85%)", numeric: alertCount, sub: alertCount ? "needs attention" : "all clear", accent: alertCount ? "var(--red)" : "var(--green)" },
      { label: "Downtime Events", numeric: downtimeEvents, sub: "tagged this view", accent: "var(--amber)" },
      { label: "Shift", val: shift === "ALL" ? "ALL" : shift, sub: date, accent: "var(--steel-light)" },
    ];
  }, [filteredLogs, totalMachineCount, shift, date]);

  const detailLog = detailKey ? allLogs[detailKey] : null;

  return (
    <>
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark"><i className="fa-solid fa-gauge-high" /></div>
          <div className="brand-text">
            <h1>Production Control</h1>
            <div className="sub">SW CNC Line · MSA01–MSA21</div>
          </div>
        </div>
        <div className="status-cluster">
          <div className="clock">{clock}</div>
          <div className="live-indicator"><span className="live-dot" /> <span>{liveText}</span></div>
        </div>
      </div>

      <div className="kpi-strip">
        {kpis.map((k) => (
          <motion.div
            className="kpi"
            key={k.label}
            style={{ "--kpi-accent": k.accent }}
            layout
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div className="kpi-label">{k.label}</div>
            {k.numeric !== undefined ? (
              <AnimatedNumber className="kpi-val" value={k.numeric} suffix={k.suffix || ""} />
            ) : (
              <motion.div
                className="kpi-val"
                key={k.val}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
              >
                {k.val}
              </motion.div>
            )}
            <div className="kpi-sub">{k.sub}</div>
          </motion.div>
        ))}
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value || todayStr())} />
        </div>
        <div className="filter-group">
          <span className="filter-label">Shift</span>
          <div className="shift-chips">
            {["ALL", "A", "B", "C", "D"].map((s) => (
              <motion.button
                key={s}
                className={`chip ${shift === s ? "active" : ""}`}
                onClick={() => setShift(s)}
                {...chipTap}
              >
                {s}
              </motion.button>
            ))}
          </div>
        </div>
        <div className="filter-group">
          <span className="filter-label">Search</span>
          <input type="text" className="search" placeholder="e.g. MSA07" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="filter-group">
          <span className="filter-label">Sort</span>
          <select className="ctl" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="id">Machine ID</option>
            <option value="eff_asc">Efficiency ↑</option>
            <option value="eff_desc">Efficiency ↓</option>
            <option value="downtime">Most Downtime</option>
          </select>
        </div>
        <motion.div className={`toggle-switch ${alertsOnly ? "on" : ""}`} onClick={() => setAlertsOnly((v) => !v)} whileTap={{ scale: 0.96 }}>
          <div className="toggle-track" />
          <span className="toggle-text">Alerts only</span>
        </motion.div>
      </div>

      <div className="section-heading">
        <h2>Machines</h2>
        <span className="count">{filteredLogs.length} reporting</span>
      </div>

      <motion.div className="machine-grid" variants={gridContainer} initial="initial" animate="animate">
        {filteredLogs.length === 0 ? (
          <div className="empty-state">
            <i className="fa-solid fa-inbox" />
            <strong>No production logged</strong>
            for {date}{shift !== "ALL" ? ` · Shift ${shift}` : ""} — check the date or shift filter.
          </div>
        ) : (
          <AnimatePresence>
            {filteredLogs.map((l) => (
              <MachineCard key={l.key} log={l} onClick={() => setDetailKey(l.key)} />
            ))}
          </AnimatePresence>
        )}
      </motion.div>

      <AnimatePresence>
        {detailLog && (
          <motion.div
            className="overlay open"
            variants={overlayFade}
            initial="initial"
            animate="animate"
            exit="exit"
            onClick={(e) => {
              if (e.target === e.currentTarget) setDetailKey(null);
            }}
          >
            <motion.div className="modal" variants={modalPop} initial="initial" animate="animate" exit="exit">
              <div className="modal-head">
                <div>
                  <h2>{detailLog.machineId || "—"}</h2>
                  <div className="meta">
                    {(detailLog.partName || "No part")} · Shift {detailLog.shift} · OP {detailLog.operatorId} · {detailLog.date}
                  </div>
                </div>
                <motion.button className="modal-close" onClick={() => setDetailKey(null)} {...chipTap}>
                  <i className="fa-solid fa-xmark" />
                </motion.button>
              </div>
              <table className="hour-table">
                <thead>
                  <tr>
                    <th>Hour</th>
                    <th>Target</th>
                    <th>Actual</th>
                    <th>Status</th>
                    <th>Reason</th>
                    <th>Note</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(detailLog.hours) ? detailLog.hours : [0, 0, 0, 0, 0, 0, 0, 0]).map((h, i) => {
                    const below = Number(h) < (detailLog.hourlyTarget || 0);
                    const reason = (detailLog.reasons && detailLog.reasons[i]) || "—";
                    const note = (detailLog.reasonNotes && detailLog.reasonNotes[i]) || "";
                    return (
                      <motion.tr
                        key={i}
                        initial={{ opacity: 0, x: -6 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.02, duration: 0.15 }}
                      >
                        <td>H{i + 1}</td>
                        <td>{detailLog.hourlyTarget || 0}</td>
                        <td>{h}</td>
                        <td><span className={`pill-status ${below ? "low" : "ok"}`}>{below ? "BELOW" : "OK"}</span></td>
                        <td>{reason}</td>
                        <td>{note}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}

function MachineCard({ log: l, onClick }) {
  const statusClass = l.efficiency < 85 ? "status-red" : l.efficiency < 98 ? "status-amber" : "status-green";
  const barColor = l.efficiency < 85 ? "var(--red)" : l.efficiency < 98 ? "var(--amber)" : "var(--green)";
  const hours = Array.isArray(l.hours) ? l.hours : [0, 0, 0, 0, 0, 0, 0, 0];
  const maxHour = Math.max(1, ...hours.map((h) => Number(h) || 0), l.hourlyTarget || 1);

  return (
    <motion.div
      className={`machine-card ${statusClass}`}
      tabIndex={0}
      onClick={onClick}
      layout
      variants={gridItem}
      initial="initial"
      animate="animate"
      exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.15 } }}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 400, damping: 20 } }}
      whileTap={{ scale: 0.97 }}
    >
      {l.efficiency < 85 && <i className="fa-solid fa-triangle-exclamation mc-alert-flag" />}
      <div className="mc-top">
        <div className="mc-id">{l.machineId || "—"}</div>
        <div className="mc-shift-badge">SHIFT {l.shift || "-"}</div>
      </div>
      <div className="mc-part">{l.partName || "No part set"}</div>
      <div className="mc-op">OP: {l.operatorId || "---"}</div>
      <div className="gauge-wrap">
        <GaugeSVG effPct={l.efficiency} />
        <div />
        <AnimatedNumber className="gauge-val" style={{ color: barColor }} value={l.efficiency} suffix="%" />
        <div className="gauge-caption">
          <AnimatedNumber value={l.actual} /> / {l.target} units
        </div>
      </div>
      <div className="spark-row">
        {hours.map((h, i) => {
          const pct = Math.max(4, Math.round(((Number(h) || 0) / maxHour) * 100));
          const below = Number(h) < (l.hourlyTarget || 0);
          return (
            <motion.div
              key={i}
              className="spark-bar"
              style={{ background: below ? "var(--red)" : "var(--green)" }}
              initial={{ height: 0 }}
              animate={{ height: `${pct}%` }}
              transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 24 }}
            />
          );
        })}
      </div>
    </motion.div>
  );
}
