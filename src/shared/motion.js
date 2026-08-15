// Shared Framer Motion presets so all 3 apps animate consistently.

export const overlayFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18 } },

};

export const modalPop = {
  initial: { opacity: 0, scale: 0.92, y: 14 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring", stiffness: 3000, damping: 32 },
  },
};

// For popup cards / grid items that stagger in
export const gridContainer = {
  initial: { opacity: 0 },
  animate: {
    opacity:1,
    transition: {
      staggerChildren: 0.1,
    }
  },
};

export const gridItem = {
  initial: { y: 7, opacity: 0 },
  animate: {
    y: 0, opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 3000,
    }
  },
};

// Standard tap/hover feel for primary action buttons
export const buttonTap = {
  whileTap: { scale: 0.96 },
  transition: { type: "spring", stiffness: 1000, damping: 30 },
};

// Lighter tap feel for smaller/secondary controls (chips, icon buttons)
export const chipTap = {
  whileTap: { scale: 0.94 },
  transition: { type: "spring", stiffness: 500, damping: 30 },
};
