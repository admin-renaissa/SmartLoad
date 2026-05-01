import type { Variants } from 'framer-motion';

export function buildStagger({ staggerChildren = 0.08, delay = 0 }: { staggerChildren?: number; delay?: number } = {}): Variants {
  return {
    hidden: { opacity: 1 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren,
        delay,
      },
    },
  };
}

