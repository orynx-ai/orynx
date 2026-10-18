import { useEffect, useState } from 'react';
import { minute } from './calendar.ts';

/**
 * The laptop's time, moved on each `every` milliseconds, so dates and waits move on with no request (specs 007
 * and 008). Once a minute by default; a session's working time moves each second (spec 011).
 */
export function useNow(every: number = minute): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, every);
    return () => {
      clearInterval(timer);
    };
  }, [every]);
  return now;
}
