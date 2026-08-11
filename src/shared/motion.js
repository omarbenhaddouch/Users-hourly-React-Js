// Shared Framer Motion presets so all 3 apps animate consistently.

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export const modalPop = {
  initial: { opacity: 0, scale: 0.92, y: 14 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 420, damping: 32 },
  },
  exit: { opacity: 0, scale: 0.94, y: 8, transition: { duration: 0.15 } },
};

// For popup cards / grid items that stagger in
export const gridContainer = {
  animate: { transition: { staggerChildren: 0.03 } },
};

export const gridItem = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.16 } },
};

// Standard tap/hover feel for primary action buttons
export const buttonTap = {
  whileHover: { y: -2 },
  whileTap: { scale: 0.96, y: 0 },
  transition: { type: "spring", stiffness: 500, damping: 30 },
};

// Lighter tap feel for smaller/secondary controls (chips, icon buttons)
export const chipTap = {
  whileTap: { scale: 0.94 },
  transition: { type: "spring", stiffness: 500, damping: 30 },
};
