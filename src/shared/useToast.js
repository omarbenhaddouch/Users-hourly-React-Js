import { useCallback, useRef, useState } from "react";

/**
 * Simple toast hook shared across all three apps.
 * Usage: const { message, visible, showToast } = useToast();
 */
export function useToast(duration = 3000) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);

  const showToast = useCallback((msg) => {
    setMessage(msg);
    setVisible(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), duration);
  }, [duration]);

  return { message, visible, showToast };
}
