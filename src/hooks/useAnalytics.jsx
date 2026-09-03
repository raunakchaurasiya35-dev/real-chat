import { useCallback } from 'react';

/**
 * Custom hook to simulate analytics telemetry pings.
 * Logs events to console following enterprise telemetry standards.
 */
export const useAnalytics = () => {
  const logAnalytics = useCallback((eventName, payload = {}) => {
    const timestamp = new Date().toISOString();
    console.log(`[Analytics] [${timestamp}] ${eventName}`, payload);
  }, []);

  return { logAnalytics };
};

export default useAnalytics;
