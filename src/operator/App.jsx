import { useCallback, useEffect, useRef, useState } from "react";
import { get, ref, remove, set } from "firebase/database";
import { AnimatePresence, motion } from "framer-motion";
import { db } from "../shared/firebase";
import Toast from "../shared/Toast";
import AnimatedNumber from "../shared/AnimatedNumber";
import { useToast } from "../shared/useToast";
import usePageStylesheet from "../shared/usePageStylesheet";
import { buttonTap, chipTap, gridContainer, gridItem, modalPop, overlayFade } from "../shared/motion";

const REASON_PRESETS = [
    { id: "Tool Change", icon: "fa-screwdriver-wrench", label: "Tool Change" },
    { id: "AirCheck", icon: "fa-circle-xmark", label: "AirCheck" },
    { id: "Material Wait", icon: "fa-boxes-packing", label: "Material Wait" },
    { id: "Maintenance", icon: "fa-gears", label: "Maintenance" },
    { id: "Setup Adjust", icon: "fa-sliders", label: "Setup / Adjust" },
    { id: "Other", icon: "fa-ellipsis-h", label: "Other Reason" },
];

const EMPTY_HOURS = [0, 0, 0, 0, 0, 0, 0, 0];
const SESSION_META_KEY = "activeSessionMeta";

function todayStr() {
    return new Date().toISOString().split("T")[0];
}

function suggestedShift() {
    const hour = new Date().getHours();
    if (hour >= 6 && hour < 14) return "A";
    if (hour >= 14 && hour < 22) return "B";
    return "C";
}

function buildLogKey(dateStr, shift, machineId, operatorId) {
    const cleanMachine = (machineId || "").replace(/\s+/g, "");
    return `${dateStr}_Shift${shift}_${cleanMachine}_${operatorId}`;
}

export default function App() {
    usePageStylesheet("/styles/operator.css");
    const { message: toastMsg, visible: toastVisible, showToast } = useToast();

    // ---------- Catalog data ----------
    const [dbMachines, setDbMachines] = useState([]);
    const [dbParts, setDbParts] = useState([]);

    // ---------- Session ----------
    const [session, setSession] = useState({
        operatorId: "---",
        operatorName: "---",
        machineId: "",
        partName: "",
        target: 18,
        shift: "A",
        hours: [...EMPTY_HOURS],
        reasons: {},
        reasonNotes: {},
    });
    const sessionRef = useRef(session);
    sessionRef.current = session;

    const [loggedIn, setLoggedIn] = useState(false);
    const [restoring, setRestoring] = useState(true);
    const [cssReady, setCssReady] = useState(false);

    // ---------- Login form ----------
    const [loginMachineId, setLoginMachineId] = useState("");
    const [loginPartName, setLoginPartName] = useState("");
    const [loginPartTarget, setLoginPartTarget] = useState(18);
    const [selectedShift, setSelectedShift] = useState(suggestedShift());
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [loginError, setLoginError] = useState("");
    const [loginBusy, setLoginBusy] = useState(false);

    // ---------- Welcome modal ----------
    const [welcomeOpen, setWelcomeOpen] = useState(false);
    const [welcomeInfo, setWelcomeInfo] = useState(null);

    // ---------- Other modals ----------
    const [machineModalOpen, setMachineModalOpen] = useState(false);
    const [partModalOpen, setPartModalOpen] = useState(false);
    const [reasonModalOpen, setReasonModalOpen] = useState(false);
    const [clearConfirmOpen, setClearConfirmOpen] = useState(false);
    const [activeModalHour, setActiveModalHour] = useState(0);
    const [tempSelectedReason, setTempSelectedReason] = useState("");
    const [customNote, setCustomNote] = useState("");

    // ---------- Offline queue ----------
    const [pendingQueue, setPendingQueue] = useState([]);
    const [syncBusy, setSyncBusy] = useState(false);

    // ==================================================================
    // CSS STYLESHEET DETECTION GUARD
    // ==================================================================
    useEffect(() => {
        const checkCssLoaded = () => {
            const sheets = Array.from(document.styleSheets);
            const isOperatorCssLoaded = sheets.some((sheet) => {
                try {
                    return sheet.href && sheet.href.includes("operator.css");
                } catch {
                    return false;
                }
            });

            if (isOperatorCssLoaded || sheets.length > 0) {
                setCssReady(true);
            } else {
                setTimeout(checkCssLoaded, 50);
            }
        };
        checkCssLoaded();
    }, []);

    // ==================================================================
    // CATALOG LOADING
    // ==================================================================
    useEffect(() => {
        (async () => {
            try {
                const machinesSnap = await get(ref(db, "machines"));
                const machines = machinesSnap.exists()
                    ? Object.values(machinesSnap.val())
                    : [
                        { id: "MSA 01", type: "Multi-Spindle CNC", target: 18 },
                        { id: "MSA 02", type: "Multi-Spindle CNC", target: 20 },
                    ];

                const partsSnap = await get(ref(db, "parts"));
                const parts = partsSnap.exists()
                    ? Object.values(partsSnap.val())
                    : [
                        { name: "T-Opal Front", code: "P-8821", target: 18 },
                        { name: "T-Opal Rear", code: "P-8822", target: 20 },
                    ];

                setDbMachines(machines);
                setDbParts(parts);

                if (machines.length > 0) setLoginMachineId(machines[0].id);
                if (parts.length > 0) {
                    setLoginPartName(parts[0].name);
                    setLoginPartTarget(parts[0].target || 18);
                }
            } catch (err) {
                console.error("Error fetching catalog from DB:", err);
            }
        })();
    }, []);

    // ==================================================================
    // SESSION RESTORE
    // ==================================================================
    useEffect(() => {
        (async () => {
            const storedMeta = sessionStorage.getItem(SESSION_META_KEY);
            if (!storedMeta) {
                setRestoring(false);
                return;
            }
            try {
                const meta = JSON.parse(storedMeta);
                const dateStr = todayStr();
                const logKey = buildLogKey(dateStr, meta.shift, meta.machineId, meta.operatorId);

                setSession((s) => ({
                    ...s,
                    operatorId: meta.operatorId,
                    operatorName: meta.operatorName || meta.operatorId,
                    machineId: meta.machineId,
                    partName: meta.partName,
                    shift: meta.shift,
                }));
                setLoggedIn(true);
                setRestoring(false);

                const snap = await get(ref(db, "daily_logs/" + logKey));
                if (snap.exists()) {
                    const existing = snap.val();
                    setSession((s) => ({
                        ...s,
                        hours: existing.hours || [...EMPTY_HOURS],
                        reasons: existing.reasons || {},
                        reasonNotes: existing.reasonNotes || {},
                        target: existing.hourlyTarget || 18,
                    }));
                }
                showToast(`🔄 Auto-restored (${meta.machineId})`);
            } catch (err) {
                console.error("Session auto-restore error:", err);
                setRestoring(false);
            }
        })();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ==================================================================
    // OFFLINE QUEUE
    // ==================================================================
    const flushQueue = useCallback(async () => {
        if (!pendingQueue.length) {
            showToast("✅ Nothing pending — already in sync");
            return;
        }
        const remaining = [];
        for (const item of pendingQueue) {
            try {
                await set(ref(db, "daily_logs/" + item.logKey), item.payload);
            } catch {
                remaining.push(item);
            }
        }
        setPendingQueue(remaining);
        showToast(
            remaining.length
                ? `⚠️ ${remaining.length} entr${remaining.length === 1 ? "y" : "ies"} still pending`
                : "⚡ All queued entries synced"
        );
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingQueue]);

    useEffect(() => {
        const handler = () => flushQueue();
        window.addEventListener("online", handler);
        return () => window.removeEventListener("online", handler);
    }, [flushQueue]);

    function enqueuePending(logKey, payload) {
        setPendingQueue((q) => {
            const idx = q.findIndex((item) => item.logKey === logKey);
            if (idx >= 0) {
                const copy = [...q];
                copy[idx] = { logKey, payload };
                return copy;
            }
            return [...q, { logKey, payload }];
        });
    }

    // ==================================================================
    // SAVE / AUTOSAVE
    // ==================================================================
    const autoSaveTimer = useRef(null);

    const saveCurrentMachineData = useCallback(async (silent) => {
        const s = sessionRef.current;
        if (!s.machineId || !s.operatorId || s.operatorId === "---") return;

        if (!silent) setSyncBusy(true);

        const dateStr = todayStr();
        const logKey = buildLogKey(dateStr, s.shift, s.machineId, s.operatorId);

        const payload = {
            date: dateStr,
            shift: s.shift,
            machineId: s.machineId,
            partName: s.partName,
            operatorId: s.operatorId,
            operatorName: s.operatorName || s.operatorId,
            hourlyTarget: s.target,
            hours: s.hours,
            reasons: s.reasons || {},
            reasonNotes: s.reasonNotes || {},
            totalPlan: s.target * 8,
            totalActual: s.hours.reduce((a, b) => a + Number(b), 0),
            updatedAt: new Date().toISOString(),
        };

        try {
            await set(ref(db, "daily_logs/" + logKey), payload);
            sessionStorage.setItem(
                SESSION_META_KEY,
                JSON.stringify({
                    operatorId: s.operatorId,
                    operatorName: s.operatorName,
                    machineId: s.machineId,
                    partName: s.partName,
                    shift: s.shift,
                })
            );
            if (!silent) showToast(`⚡ Realtime DB Updated: ${s.machineId} (${s.partName})`);
        } catch (err) {
            console.error(err);
            enqueuePending(logKey, payload);
            if (!silent) showToast(`📥 Offline — entry queued`);
        } finally {
            if (!silent) setSyncBusy(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const scheduleAutoSave = useCallback(() => {
        clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => saveCurrentMachineData(true), 1000);
    }, [saveCurrentMachineData]);

    // ==================================================================
    // LOGIN
    // ==================================================================
    async function handleOperatorLogin() {
        const uname = username.trim();
        const pass = password.trim();

        if (!uname || !pass) {
            setLoginError("Please enter both username and password.");
            return;
        }
        if (!loginMachineId) {
            setLoginError("Still loading machine list — try again in a moment.");
            return;
        }

        setLoginError("");
        setLoginBusy(true);

        const userKey = uname.replace(/\s+/g, "_");

        try {
            const userSnap = await get(ref(db, "users/" + userKey));
            if (!userSnap.exists()) {
                setLoginError("User not found.");
                setLoginBusy(false);
                return;
            }

            const userData = userSnap.val();
            if (userData.password !== pass) {
                setLoginError("Invalid password.");
                setLoginBusy(false);
                return;
            }

            const mat = userData.matriculation || uname;
            const opName = userData.name || userData.fullName || uname;
            const shift = selectedShift || "A";
            const dateStr = todayStr();
            const logKey = buildLogKey(dateStr, shift, loginMachineId, mat);

            let newHours = [...EMPTY_HOURS];
            let newReasons = {};
            let newReasonNotes = {};
            let newTarget = loginPartTarget;

            const snap = await get(ref(db, "daily_logs/" + logKey));
            if (snap.exists()) {
                const existing = snap.val();
                newHours = existing.hours || [...EMPTY_HOURS];
                newReasons = existing.reasons || {};
                newReasonNotes = existing.reasonNotes || {};
                newTarget = existing.hourlyTarget || newTarget;
            }

            const nextSession = {
                operatorId: mat,
                operatorName: opName,
                machineId: loginMachineId,
                partName: existingPartOrLogin(snap, loginPartName),
                target: newTarget,
                shift,
                hours: newHours,
                reasons: newReasons,
                reasonNotes: newReasonNotes,
            };

            setSession(nextSession);
            setWelcomeInfo({
                operatorName: opName,
                matriculation: mat,
                machineId: loginMachineId,
                partName: nextSession.partName,
            });
            setWelcomeOpen(true);
        } catch (err) {
            console.error("Login error:", err);
            setLoginError("Database error during authentication.");
        } finally {
            setLoginBusy(false);
        }
    }

    function existingPartOrLogin(snap, fallbackPart) {
        if (snap && snap.exists && snap.exists() && snap.val().partName) {
            return snap.val().partName;
        }
        return fallbackPart;
    }

    function confirmWelcomeModal() {
        sessionStorage.setItem(
            SESSION_META_KEY,
            JSON.stringify({
                operatorId: session.operatorId,
                operatorName: session.operatorName,
                machineId: session.machineId,
                partName: session.partName,
                shift: session.shift,
            })
        );
        setWelcomeOpen(false);
        setLoggedIn(true);
    }

    function logoutOperator() {
        sessionStorage.removeItem(SESSION_META_KEY);
        setUsername("");
        setPassword("");
        setLoginError("");
        setLoggedIn(false);
        setWelcomeOpen(false);
        setSession((s) => ({
            ...s,
            operatorId: "---",
            operatorName: "---",
            hours: [...EMPTY_HOURS],
            reasons: {},
            reasonNotes: {},
        }));
    }

    // ==================================================================
    // HOUR INPUT
    // ==================================================================
    function handleHourInput(h, rawVal) {
        let raw = rawVal.replace(/[^0-9]/g, "");
        if (raw.length > 1) raw = raw.replace(/^0+/, "") || "0";
        if (raw.length > 3) raw = raw.slice(0, 3);
        const num = raw === "" ? 0 : parseInt(raw, 10);

        setSession((s) => {
            const hours = [...s.hours];
            hours[h] = num;
            return { ...s, hours };
        });
        scheduleAutoSave();

        if (raw.length >= 2) {
            const next = document.querySelector(`input[data-hour="${h + 1}"]`);
            if (next) next.focus();
        }
        return raw;
    }

    // ==================================================================
    // CLEAR MACHINE DATA
    // ==================================================================
    async function confirmClearMachineData() {
        const s = sessionRef.current;
        const dateStr = todayStr();
        const logKey = buildLogKey(dateStr, s.shift, s.machineId, s.operatorId);

        try {
            await remove(ref(db, "daily_logs/" + logKey));
            setSession((prev) => ({
                ...prev,
                hours: [...EMPTY_HOURS],
                reasons: {},
                reasonNotes: {},
            }));
            setClearConfirmOpen(false);
            showToast(`🗑️ ${s.machineId} cleared for next shift`);
        } catch (err) {
            console.error(err);
            showToast(`❌ Clear failed: ${err.message}`);
        }
    }

    // ==================================================================
    // REASON MODAL
    // ==================================================================
    function openReasonModal(h) {
        setActiveModalHour(h);
        setTempSelectedReason((session.reasons && session.reasons[h]) || "");
        setCustomNote((session.reasonNotes && session.reasonNotes[h]) || "");
        setReasonModalOpen(true);
    }

    function saveSelectedReason() {
        const note = customNote.trim();
        setSession((s) => {
            const reasons = { ...s.reasons };
            const reasonNotes = { ...s.reasonNotes };
            if (tempSelectedReason) reasons[activeModalHour] = tempSelectedReason;
            else delete reasons[activeModalHour];
            if (note) reasonNotes[activeModalHour] = note;
            else delete reasonNotes[activeModalHour];
            return { ...s, reasons, reasonNotes };
        });
        setReasonModalOpen(false);
        scheduleAutoSave();
    }

    function clearSelectedReason() {
        setSession((s) => {
            const reasons = { ...s.reasons };
            const reasonNotes = { ...s.reasonNotes };
            delete reasons[activeModalHour];
            delete reasonNotes[activeModalHour];
            return { ...s, reasons, reasonNotes };
        });
        setReasonModalOpen(false);
        scheduleAutoSave();
    }

    function closeModals() {
        setMachineModalOpen(false);
        setPartModalOpen(false);
        setReasonModalOpen(false);
        setClearConfirmOpen(false);
    }

    // ==================================================================
    // DERIVED METRICS
    // ==================================================================
    const totalActual = session.hours.reduce((acc, curr) => acc + Math.max(0, Number(curr) || 0), 0);
    const totalTarget = session.target * 8;
    const efficiency = totalTarget > 0 ? Math.round((totalActual / totalTarget) * 100) : 0;
    let statusColor = "var(--neon-green)";
    if (efficiency < 85) statusColor = "var(--neon-red)";
    else if (efficiency < 98) statusColor = "var(--neon-yellow)";

    // ==================================================================
    // SKELETON RENDER (WHILE RESTORING SESSION OR CSS PARSING)
    // ==================================================================
    if (restoring || !cssReady) {
        return <DashboardSkeleton />;
    }

    return (
        <>
            <AnimatePresence>
                {!loggedIn && (
                    <LoginOverlay
                        key="login"
                        dbMachines={dbMachines}
                        dbParts={dbParts}
                        loginMachineId={loginMachineId}
                        loginPartName={loginPartName}
                        onOpenMachineModal={() => setMachineModalOpen(true)}
                        onOpenPartModal={() => setPartModalOpen(true)}
                        selectedShift={selectedShift}
                        setSelectedShift={setSelectedShift}
                        username={username}
                        setUsername={setUsername}
                        password={password}
                        setPassword={setPassword}
                        loginError={loginError}
                        loginBusy={loginBusy}
                        onSubmit={handleOperatorLogin}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {welcomeOpen && welcomeInfo && (
                    <WelcomeModal key="welcome" info={welcomeInfo} onConfirm={confirmWelcomeModal} />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {clearConfirmOpen && (
                    <ClearConfirmModal
                        key="clear"
                        machineId={session.machineId}
                        onConfirm={confirmClearMachineData}
                        onCancel={closeModals}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {machineModalOpen && (
                    <MachineModal
                        key="machine"
                        machines={dbMachines}
                        currentId={loggedIn ? session.machineId : loginMachineId}
                        onSelect={(mId) => {
                            if (loggedIn) {
                                setSession((s) => ({ ...s, machineId: mId }));
                            } else {
                                setLoginMachineId(mId);
                            }
                            closeModals();
                        }}
                        onClose={closeModals}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {partModalOpen && (
                    <PartModal
                        key="part"
                        parts={dbParts}
                        currentName={loggedIn ? session.partName : loginPartName}
                        onSelect={(pName, pTarget) => {
                            if (loggedIn) {
                                setSession((s) => ({ ...s, partName: pName, target: pTarget || 18 }));
                                scheduleAutoSave();
                            } else {
                                setLoginPartName(pName);
                                setLoginPartTarget(pTarget || 18);
                            }
                            closeModals();
                        }}
                        onClose={closeModals}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {reasonModalOpen && (
                    <ReasonModal
                        key="reason"
                        hour={activeModalHour}
                        tempSelectedReason={tempSelectedReason}
                        setTempSelectedReason={setTempSelectedReason}
                        customNote={customNote}
                        setCustomNote={setCustomNote}
                        onSave={saveSelectedReason}
                        onCancel={clearSelectedReason}
                        onClose={closeModals}
                    />
                )}
            </AnimatePresence>

            {loggedIn && (
                <>
                    <header>
                        <div className="shift-info">
                            <div className="hud-badge">
                                <i className="fa-regular fa-calendar" /> <span>{todayStr()}</span>
                            </div>
                            <div className="hud-badge">
                                <i className="fa-solid fa-clock" /> SHIFT <span>{session.shift}</span>
                            </div>
                            <div className="hud-badge">
                                <i className="fa-solid fa-user-gear" /> OP ID: <span>{session.operatorId}</span>
                            </div>
                            {pendingQueue.length > 0 && (
                                <motion.button
                                    className="hud-badge badge-alert"
                                    onClick={flushQueue}
                                    {...chipTap}
                                >
                                    <i className="fa-solid fa-triangle-exclamation" /> <span>{pendingQueue.length}</span> PENDING · TAP TO RETRY
                                </motion.button>
                            )}
                            <motion.button className="btn-switch" onClick={logoutOperator} {...chipTap}>
                                <i className="fa-solid fa-right-from-bracket" /> Logout
                            </motion.button>
                        </div>
                    </header>

                    <main className="machine-container">
                        <div className="machine-card">
                            <MachineCard
                                session={session}
                                totalActual={totalActual}
                                totalTarget={totalTarget}
                                efficiency={efficiency}
                                statusColor={statusColor}
                                onHourInput={handleHourInput}
                                onHourBlur={() => { }}
                                onOpenReasonModal={openReasonModal}
                                onSave={() => saveCurrentMachineData(false)}
                                onOpenClearConfirm={() => setClearConfirmOpen(true)}
                                syncBusy={syncBusy}
                            />
                        </div>
                    </main>
                </>
            )}

            <Toast message={toastMsg} visible={toastVisible} />
        </>
    );
}

// ======================================================================
// SKELETON LOADERS
// ======================================================================

function DashboardSkeleton() {
    return (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "16px" }}>
            <header style={{ marginBottom: 20 }}>
                <div className="shift-info" style={{ display: "flex", gap: 10 }}>
                    <div className="skeleton-box" style={{ width: 110, height: 32, borderRadius: 20 }} />
                    <div className="skeleton-box" style={{ width: 90, height: 32, borderRadius: 20 }} />
                    <div className="skeleton-box" style={{ width: 130, height: 32, borderRadius: 20 }} />
                </div>
            </header>

            <div className="machine-card">
                <div className="card-header" style={{ display: "flex", justifyContent: "space-between", marginBottom: 20 }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="skeleton-box" style={{ width: 150, height: 28, borderRadius: 6 }} />
                        <div className="skeleton-box" style={{ width: 100, height: 16, borderRadius: 4 }} />
                    </div>
                    <div className="skeleton-box" style={{ width: 140, height: 24, borderRadius: 12 }} />
                </div>

                <div className="metrics-row" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="metric-box" style={{ minHeight: 70, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
                            <div className="skeleton-box" style={{ width: "50%", height: 26, borderRadius: 4, marginBottom: 8 }} />
                            <div className="skeleton-box" style={{ width: "70%", height: 12, borderRadius: 4 }} />
                        </div>
                    ))}
                </div>

                <div className="hours-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((h) => (
                        <div key={h} className="hour-pill" style={{ minHeight: 80, padding: 12 }}>
                            <div className="skeleton-box" style={{ width: "40%", height: 12, borderRadius: 4, marginBottom: 10 }} />
                            <div className="skeleton-box" style={{ width: "100%", height: 38, borderRadius: 6 }} />
                        </div>
                    ))}
                </div>

                <div className="skeleton-box" style={{ width: "100%", height: 48, borderRadius: 8, marginBottom: 12 }} />
            </div>
        </div>
    );
}

// ======================================================================
// SUB-COMPONENTS
// ======================================================================

function LoginOverlay({
    dbMachines,
    dbParts,
    loginMachineId,
    loginPartName,
    onOpenMachineModal,
    onOpenPartModal,
    selectedShift,
    setSelectedShift,
    username,
    setUsername,
    password,
    setPassword,
    loginError,
    loginBusy,
    onSubmit,
}) {
    return (
        <motion.div className="overlay-container" variants={overlayFade} initial="initial" animate="animate" exit="exit">
            <motion.div className="login-box" variants={modalPop} initial="initial" animate="animate" exit="exit">
                <i className="fa-solid fa-clipboard-list" style={{ fontSize: "2rem", color: "var(--navy)", marginBottom: 8 }} />
                <h2>LOGIN</h2>
                <p style={{ color: "var(--ink-dim)", fontSize: "0.85rem", fontWeight: 600 }}>
                    CITIC DICASTAL &mdash; PRODUCTION HOURS
                </p>

                <div className="m-p-flex">
                    <div className="field-group-m">
                        <label>MACHINE</label>
                        <motion.button className="selector-btn" onClick={onOpenMachineModal} {...chipTap}>
                            <span className="selector-icon"><i className="fa-solid fa-server" /></span>
                            <span className="selector-text">
                                <span className="sel-label">Machine SW</span>
                                <span className="sel-value">{loginMachineId || "Select Machine..."}</span>
                            </span>
                        </motion.button>
                    </div>

                    <div className="field-group-p">
                        <label>PART</label>
                        <motion.button className="selector-btn" onClick={onOpenPartModal} {...chipTap}>
                            <span className="selector-icon"><i className="fa-solid fa-gear" /></span>
                            <span className="selector-text">
                                <span className="sel-label">Part</span>
                                <span className="sel-value">{loginPartName || "Select Part..."}</span>
                            </span>
                        </motion.button>
                    </div>
                </div>

                <div className="field-group">
                    <label>SHIFT</label>
                    <div className="shift-select">
                        {["A", "B", "C", "D"].map((letter) => (
                            <motion.button
                                key={letter}
                                type="button"
                                className={`shift-btn ${selectedShift === letter ? "active" : ""}`}
                                onClick={() => setSelectedShift(letter)}
                                {...chipTap}
                            >
                                {letter}
                            </motion.button>
                        ))}
                    </div>
                </div>

                <div className="field-group">
                    <label htmlFor="usernameInput">MATRICULATION</label>
                    <input
                        type="tel"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        id="usernameInput"
                        className="input-field"
                        placeholder="Ex 611"
                        autoComplete="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                    />
                </div>

                <div className="field-group">
                    <label htmlFor="passwordInput">PASSWORD</label>
                    <input
                        inputMode="numeric"
                        pattern="[0-9]*"
                        type="password"
                        id="passwordInput"
                        className="input-field"
                        placeholder="*****"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                    />
                </div>

                <AnimatePresence>
                    {loginError && (
                        <motion.div
                            className="error-msg"
                            style={{ display: "block" }}
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                        >
                            {loginError}
                        </motion.div>
                    )}
                </AnimatePresence>

                <motion.button className="btn-action" style={{ marginTop: 20 }} disabled={loginBusy} onClick={onSubmit} {...buttonTap}>
                    {loginBusy ? (
                        <>VERIFYING CREDENTIALS... <i className="fa-solid fa-spinner fa-spin" /></>
                    ) : (
                        <>START SHIFT <i className="fa-solid fa-bolt" /></>
                    )}
                </motion.button>
            </motion.div>
        </motion.div>
    );
}

function WelcomeModal({ info, onConfirm }) {
    return (
        <motion.div className="overlay-container" variants={overlayFade} initial="initial" animate="animate" exit="exit">
            <motion.div className="modal-box" style={{ textAlign: "center", maxWidth: 440 }} variants={modalPop} initial="initial" animate="animate" exit="exit">
                <motion.i
                    className="fa-solid fa-circle-check"
                    style={{ fontSize: "3rem", color: "var(--sage-ink)", marginBottom: 12, display: "inline-block" }}
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 18, delay: 0.05 }}
                />
                <h3 style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--brick)", fontSize: "1.6rem" }}>Welcome!</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-dim)", fontWeight: 600, marginTop: 4 }}>Session verified successfully.</p>

                <div className="summary-list">
                    <div className="summary-item">
                        <label><i className="fa-solid fa-user" /> OPERATOR NAME</label>
                        <span>{info.operatorName}</span>
                    </div>
                    <div className="summary-item">
                        <label><i className="fa-solid fa-id-card" /> MATRICULATION</label>
                        <span>{info.matriculation}</span>
                    </div>
                    <div className="summary-item">
                        <label><i className="fa-solid fa-server" /> MACHINE</label>
                        <span>{info.machineId}</span>
                    </div>
                    <div className="summary-item">
                        <label><i className="fa-solid fa-gear" /> PART</label>
                        <span>{info.partName}</span>
                    </div>
                </div>

                <motion.button className="btn-action" onClick={onConfirm} {...buttonTap}>
                    CONTINUE TO DASHBOARD <i className="fa-solid fa-arrow-right" />
                </motion.button>
            </motion.div>
        </motion.div>
    );
}

function ClearConfirmModal({ machineId, onConfirm, onCancel }) {
    return (
        <motion.div className="overlay-container" variants={overlayFade} initial="initial" animate="animate" exit="exit">
            <motion.div className="modal-box" style={{ textAlign: "center", maxWidth: 440 }} variants={modalPop} initial="initial" animate="animate" exit="exit">
                <i className="fa-solid fa-triangle-exclamation" style={{ fontSize: "3rem", color: "var(--brick)", marginBottom: 12 }} />
                <h3 style={{ fontFamily: "var(--serif)", fontStyle: "italic", color: "var(--brick)", fontSize: "1.5rem" }}>Clear Machine Data?</h3>
                <p style={{ fontSize: "0.85rem", color: "var(--ink-dim)", fontWeight: 600, marginTop: 8, lineHeight: 1.4 }}>
                    Are you sure you want to clear <strong>{machineId}</strong>'s saved hours? This action will permanently delete the entry from the database for this shift.
                </p>

                <div style={{ display: "flex", gap: 12, marginTop: 24 }}>
                    <motion.button className="btn-danger-action" style={{ flex: 1 }} onClick={onConfirm} {...buttonTap}>
                        YES <i className="fa-solid fa-trash-can" />
                    </motion.button>
                    <motion.button className="btn-action" style={{ flex: 1, background: "var(--paper)", color: "var(--navy)" }} onClick={onCancel} {...buttonTap}>
                        CANCEL
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function MachineModal({ machines, currentId, onSelect, onClose }) {
    return (
        <motion.div className="overlay-container" variants={overlayFade} initial="initial" animate="animate" exit="exit">
            <motion.div className="modal-box" variants={modalPop} initial="initial" animate="animate" exit="exit">
                <div className="modal-header">
                    <h3><i className="fa-solid fa-server" /> SELECT MACHINE</h3>
                    <motion.button className="close-btn" onClick={onClose} {...chipTap}><i className="fa-solid fa-xmark" /></motion.button>
                </div>
                <motion.div className="popup-grid" variants={gridContainer} initial="initial" animate="animate">
                    {machines.length === 0
                        ? [1, 2, 3, 4].map((n) => (
                            <div key={n} className="popup-card" style={{ pointerEvents: "none" }}>
                                <div className="skeleton-box" style={{ height: 18, width: "70%" }} />
                            </div>
                        ))
                        : machines.map((m) => (
                            <motion.div
                                key={m.id}
                                className={`popup-card ${m.id === currentId ? "active" : ""}`}
                                onClick={() => onSelect(m.id)}
                                variants={gridItem}
                                whileHover={{ y: -3 }}
                                whileTap={{ scale: 0.96 }}
                            >
                                <div className="popup-card-title">{m.id}</div>
                            </motion.div>
                        ))}
                </motion.div>
            </motion.div>
        </motion.div>
    );
}

function PartModal({ parts, currentName, onSelect, onClose }) {
    return (
        <motion.div className="overlay-container" variants={overlayFade} initial="initial" animate="animate" exit="exit">
            <motion.div className="modal-box" variants={modalPop} initial="initial" animate="animate" exit="exit">
                <div className="modal-header">
                    <h3><i className="fa-solid fa-gear" /> SELECT PART</h3>
                    <motion.button className="close-btn" onClick={onClose} {...chipTap}><i className="fa-solid fa-xmark" /></motion.button>
                </div>
                <motion.div className="popup-grid popup-grid-parts" variants={gridContainer} initial="initial" animate="animate">
                    {parts.length === 0
                        ? [1, 2, 3, 4].map((n) => (
                            <div key={n} className="popup-card" style={{ pointerEvents: "none", minHeight: 70 }}>
                                <div className="skeleton-box" style={{ height: 16, width: "70%", marginBottom: 8 }} />
                                <div className="skeleton-box" style={{ height: 12, width: "40%", marginBottom: 10 }} />
                                <div className="skeleton-box" style={{ height: 14, width: "50%" }} />
                            </div>
                        ))
                        : parts.map((p) => (
                            <motion.div
                                key={p.name}
                                className={`popup-card ${p.name === currentName ? "active" : ""}`}
                                onClick={() => onSelect(p.name, p.target)}
                                variants={gridItem}
                                whileHover={{ y: -3 }}
                                whileTap={{ scale: 0.96 }}
                            >
                                <div className="popup-card-title">{p.name}</div>
                                <div className="popup-card-sub">{p.code ? "SKU: " + p.code : ""}</div>
                                <span className="popup-card-tag"><i className="fa-solid fa-sliders" /> Target: {p.target}</span>
                            </motion.div>
                        ))}
                </motion.div>
            </motion.div>
        </motion.div>
    );
}

function ReasonModal({ hour, tempSelectedReason, setTempSelectedReason, customNote, setCustomNote, onSave, onCancel, onClose }) {
    return (
        <motion.div className="overlay-container" variants={overlayFade} initial="initial" animate="animate" exit="exit">
            <motion.div className="modal-box" variants={modalPop} initial="initial" animate="animate" exit="exit">
                <div className="modal-header">
                    <h3><i className="fa-solid fa-triangle-exclamation" /> DOWNTIME REASON <span>{hour + 1}</span></h3>
                    <motion.button className="close-btn" onClick={onClose} {...chipTap}><i className="fa-solid fa-xmark" /></motion.button>
                </div>

                <div className="field-group" style={{ marginTop: 0, marginBottom: 16 }}>
                    <label>SELECT CATEGORY</label>
                </div>

                <motion.div className="popup-grid popup-grid-reasons" variants={gridContainer} initial="initial" animate="animate">
                    {REASON_PRESETS.map((r) => (
                        <motion.div
                            key={r.id}
                            className={`popup-card ${r.id === tempSelectedReason ? "active" : ""}`}
                            onClick={() => setTempSelectedReason(r.id)}
                            variants={gridItem}
                            whileHover={{ y: -3 }}
                            whileTap={{ scale: 0.96 }}
                        >
                            <i className={`fa-solid ${r.icon}`} style={{ fontSize: "1.4rem", marginBottom: 6, color: "var(--brick)" }} />
                            <div className="popup-card-title">{r.label}</div>
                        </motion.div>
                    ))}
                </motion.div>

                <div className="field-group" style={{ marginTop: 20 }}>
                    <label htmlFor="customNoteInput">OPTIONAL NOTES / REMARKS</label>
                    <input
                        type="text"
                        id="customNoteInput"
                        className="input-field"
                        placeholder="e.g. Spindle overheating, line stoppage..."
                        autoComplete="off"
                        value={customNote}
                        onChange={(e) => setCustomNote(e.target.value)}
                    />
                </div>

                <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
                    <motion.button className="btn-action" style={{ flex: 2, fontSize: "0.85rem", padding: 12 }} onClick={onSave} {...buttonTap}>
                        SAVE REASON <i className="fa-solid fa-check" />
                    </motion.button>
                    <motion.button className="btn-danger-outline" style={{ flex: 1, marginTop: 0, fontSize: "0.75rem", padding: 12 }} onClick={onCancel} {...buttonTap}>
                        CANCEL
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>
    );
}

function MachineCard({
    session,
    totalActual,
    totalTarget,
    efficiency,
    statusColor,
    onHourInput,
    onOpenReasonModal,
    onSave,
    onOpenClearConfirm,
    syncBusy,
}) {
    return (
        <>
            <div className="card-header">
                <div>
                    <div className="machine-id">{session.machineId}</div>
                    <div className="card-header-target">
                        <span>TARGET: {session.target}/HR</span>
                    </div>
                </div>
                <div className="part-name-display"><i className="fa-solid fa-gear" /> {session.partName}</div>
            </div>

            <div className="metrics-row">
                <div className="metric-box">
                    <AnimatedNumber className="metric-val" style={{ color: "var(--neon-cyan)" }} value={totalActual} />
                    <div className="metric-label">Actual Produced</div>
                </div>
                <div className="metric-box">
                    <div className="metric-val">{totalTarget}</div>
                    <div className="metric-label">Shift Target</div>
                </div>
                <div className="metric-box">
                    <AnimatedNumber className="metric-val" style={{ color: statusColor }} value={efficiency} suffix="%" />
                    <div className="metric-label">Efficiency (OEE)</div>
                </div>
            </div>

            <motion.div
                className="hours-grid"
                variants={gridContainer}
                initial="initial"
                animate="animate"
            >
                {session.hours.map((val, h) => {
                    const belowTarget = Number(val) < session.target;
                    const currentReason = session.reasons[h] || "";
                    const hasReason = Boolean(currentReason);
                    return (
                        <motion.div
                            key={h}
                            layout
                            variants={gridItem}
                            className={`hour-pill ${belowTarget ? "below-target" : ""}`}
                        >
                            <label>HOUR {h + 1}</label>
                            <input
                                type="tel"
                                inputMode="numeric"
                                pattern="[0-9]*"
                                data-hour={h}
                                value={val}
                                onInput={(e) => {
                                    const cleaned = onHourInput(h, e.target.value);
                                    e.target.value = cleaned;
                                }}
                            />
                            <div className="reason-wrap" style={{ overflow: "hidden" }}>
                                <AnimatePresence initial={false}>
                                    {belowTarget && (
                                        <motion.button
                                            key="reason-btn"
                                            type="button"
                                            className={`reason-btn ${hasReason ? "has-reason" : ""}`}
                                            onClick={() => onOpenReasonModal(h)}
                                            initial={{ opacity: 0, height: 0, marginTop: 0 }}
                                            animate={{ opacity: 1, height: "auto", marginTop: 8 }}
                                            exit={{ opacity: 0, height: 0, marginTop: 0 }}
                                            transition={{ duration: 0.2, ease: "easeInOut" }}
                                            whileTap={{ scale: 0.95 }}
                                        >
                                            <i className={`fa-solid ${hasReason ? "fa-pen-to-square" : "fa-triangle-exclamation"}`} />{" "}
                                            {hasReason ? currentReason : "SELECT REASON"}
                                        </motion.button>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    );
                })}
            </motion.div>

            <motion.button className="btn-action" onClick={onSave} disabled={syncBusy} style={{ opacity: syncBusy ? 0.7 : 1 }} {...buttonTap}>
                {syncBusy ? (
                    <>SAVING... <i className="fa-solid fa-spinner fa-spin" /></>
                ) : (
                    <>SAVE DATA<i className="fa-solid fa-cloud-arrow-up" /></>
                )}
            </motion.button>
            <motion.button className="btn-danger-outline" onClick={onOpenClearConfirm} {...chipTap}>
                <i className="fa-solid fa-trash-can" /> CLEAR FOR NEXT SHIFT
            </motion.button>
        </>
    );
}
