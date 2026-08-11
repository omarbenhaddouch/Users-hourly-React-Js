import { AnimatePresence, motion } from "framer-motion";

export default function Toast({ message, visible }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          id="toast"
          style={{ display: "block" }}
          initial={{ opacity: 0, y: 16, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.96, transition: { duration: 0.15 } }}
          transition={{ type: "spring", stiffness: 420, damping: 30 }}
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
