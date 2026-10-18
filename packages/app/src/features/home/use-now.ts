import { useEffect, useState } from 'react';

const minute = 60_000;

/** The laptop's time, moved on each minute, so waits move on with no request (spec 007, AC-13). */
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
