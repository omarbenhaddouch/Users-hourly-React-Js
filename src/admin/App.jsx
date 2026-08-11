import { useState } from "react";
import { ref, set } from "firebase/database";
import { AnimatePresence, motion } from "framer-motion";
import { db } from "../shared/firebase";
import Toast from "../shared/Toast";
import { useToast } from "../shared/useToast";
import usePageStylesheet from "../shared/usePageStylesheet";
import { buttonTap, chipTap } from "../shared/motion";

export default function App() {
  usePageStylesheet("/styles/admin.css");
  const { message: toastMsg, visible: toastVisible, showToast } = useToast();
  const [tab, setTab] = useState("user");

  // ---- Add user form ----
  const [operatorName, setOperatorName] = useState("");
  const [matriculation, setMatriculation] = useState("");
  const [password, setPassword] = useState("");
  const [userBusy, setUserBusy] = useState(false);

  // ---- Add part form ----
  const [partName, setPartName] = useState("");
  const [partTarget, setPartTarget] = useState("");
  const [partBusy, setPartBusy] = useState(false);

  async function saveUser() {
    const name = operatorName.trim();
    const mat = matriculation.trim();
    const pass = password.trim();

    if (!name) return showToast("⚠️ Please enter Operator Name");
    if (!mat) return showToast("⚠️ Please enter Matriculation");
    if (!pass) return showToast("⚠️ Please enter Password");

    const userKey = mat.replace(/\s+/g, "_");
    setUserBusy(true);
    try {
      await set(ref(db, "users/" + userKey), {
        name,
        matriculation: mat,
        username: mat,
        password: pass,
      });
      showToast(`✅ User "${name}" added successfully!`);
      setOperatorName("");
      setMatriculation("");
      setPassword("");
    } catch (err) {
      console.error(err);
      showToast(`❌ Error saving user: ${err.message}`);
    } finally {
      setUserBusy(false);
    }
  }

  async function savePart() {
    const name = partName.trim();
    const targetVal = String(partTarget).trim();

    if (!name) return showToast("⚠️ Please enter a Part Name");
    if (!targetVal || isNaN(targetVal)) return showToast("⚠️ Please enter a valid Target number");

    const partKey = name.replace(/\s+/g, "_");
    setPartBusy(true);
    try {
      await set(ref(db, "parts/" + partKey), {
        name,
        target: Number(targetVal),
      });
      showToast(`✅ Part "${name}" added successfully!`);
      setPartName("");
      setPartTarget("");
    } catch (err) {
      console.error(err);
      showToast(`❌ Error saving part: ${err.message}`);
    } finally {
      setPartBusy(false);
    }
  }

  return (
    <>
      <motion.header
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
      >
        <div className="brand-title">
          <i className="fa-solid fa-database" /> DATABASE MANAGER
        </div>
      </motion.header>

      <motion.main
        className="container"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
      >
        <div className="toggle-container">
          <motion.button className={`toggle-btn ${tab === "user" ? "active" : ""}`} onClick={() => setTab("user")} {...chipTap}>
            <i className="fa-solid fa-user-plus" /> ADD USER
          </motion.button>
          <motion.button className={`toggle-btn ${tab === "part" ? "active" : ""}`} onClick={() => setTab("part")} {...chipTap}>
            <i className="fa-solid fa-gear" /> ADD PART
          </motion.button>
        </div>

        <AnimatePresence mode="wait">
          {tab === "user" ? (
            <motion.div
              key="user-form"
              className="form-section active"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.18 }}
            >
              <div className="field-group">
                <label htmlFor="operatorNameInput">NAME OF OPERATOR</label>
                <input
                  type="text"
                  id="operatorNameInput"
                  className="input-field"
                  placeholder="e.g. John Doe"
                  value={operatorName}
                  onChange={(e) => setOperatorName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="matriculationInput">MATRICULATION (USERNAME)</label>
                <input
                  type="text"
                  id="matriculationInput"
                  className="input-field"
                  placeholder="e.g. EMP12345"
                  value={matriculation}
                  onChange={(e) => setMatriculation(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="passwordInput">PASSWORD</label>
                <input
                  type="password"
                  id="passwordInput"
                  className="input-field"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              <motion.button className="btn-action" disabled={userBusy} onClick={saveUser} {...buttonTap}>
                {userBusy ? (
                  <>SAVING... <i className="fa-solid fa-spinner fa-spin" /></>
                ) : (
                  <>SAVE USER <i className="fa-solid fa-user-check" /></>
                )}
              </motion.button>
            </motion.div>
          ) : (
            <motion.div
              key="part-form"
              className="form-section active"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.18 }}
            >
              <div className="field-group">
                <label htmlFor="partNameInput">PART NAME</label>
                <input
                  type="text"
                  id="partNameInput"
                  className="input-field"
                  placeholder="e.g. Honda, Meb Rear"
                  value={partName}
                  onChange={(e) => setPartName(e.target.value)}
                />
              </div>

              <div className="field-group">
                <label htmlFor="partTargetInput">HOURLY TARGET</label>
                <input
                  type="number"
                  id="partTargetInput"
                  className="input-field"
                  placeholder="e.g. 28, 48"
                  min="1"
                  value={partTarget}
                  onChange={(e) => setPartTarget(e.target.value)}
                />
              </div>

              <motion.button className="btn-action" disabled={partBusy} onClick={savePart} {...buttonTap}>
                {partBusy ? (
                  <>SAVING... <i className="fa-solid fa-spinner fa-spin" /></>
                ) : (
                  <>SAVE PART <i className="fa-solid fa-plus" /></>
                )}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.main>

      <Toast message={toastMsg} visible={toastVisible} />
    </>
  );
}
