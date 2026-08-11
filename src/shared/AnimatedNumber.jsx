import { useEffect } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "framer-motion";

/**
 * Renders a number that smoothly "rolls" from its old value to its new
 * value (spring-driven), instead of just popping to the new digit.
 *
 * Usage: <AnimatedNumber value={totalActual} />
 *        <AnimatedNumber value={efficiency} suffix="%" />
 *        <AnimatedNumber value={12345} decimals={0} />
 *
 * Note: the rounded/formatted MotionValue is passed directly as children —
 * Framer Motion subscribes to it and updates the DOM text node directly on
 * every animation frame, without going through React re-renders.
 */
export default function AnimatedNumber({
  value,
  suffix = "",
  prefix = "",
  decimals = 0,
  springConfig,
  className,
  style,
}) {
  const numericValue = Number(value) || 0;
  const motionVal = useMotionValue(numericValue);
  const spring = useSpring(motionVal, springConfig || { stiffness: 260, damping: 28, mass: 0.7 });

  const display = useTransform(spring, (v) => {
    const fixed = decimals > 0 ? v.toFixed(decimals) : Math.round(v).toString();
    const withCommas = decimals > 0 ? fixed : Number(fixed).toLocaleString();
    return `${prefix}${withCommas}${suffix}`;
  });

  useEffect(() => {
    motionVal.set(numericValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numericValue]);

  return (
    <motion.span className={className} style={style}>
      {display}
    </motion.span>
  );
}
