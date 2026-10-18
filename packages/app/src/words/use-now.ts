import { useEffect, useState } from 'react';
import { minute } from './calendar.ts';

/** The laptop's time, moved on each minute, so dates and waits move on with no request (specs 007 and 008). */
export function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, minute);
    return () => {
      clearInterval(timer);
    };
  }, []);
  return now;
}
