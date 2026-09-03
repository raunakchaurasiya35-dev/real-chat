/**
 * Centralized API & WebSocket Configuration
 * Automatically switches between local dev backend and live Render backend.
 */
export const getHostName = () => {
  if (typeof window !== "undefined" && window.location && window.location.hostname) {
    return window.location.hostname;
  }
  return "localhost";
};

const hostname = getHostName();
const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname.startsWith("192.168.");

// Production Render Backend URL
const RENDER_BACKEND_HTTP = "https://real-chat-communication.onrender.com";
const RENDER_BACKEND_WS = "wss://real-chat-communication.onrender.com";

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 
  (isLocal ? `http://${hostname}:5000/api` : `${RENDER_BACKEND_HTTP}/api`);

export const WEBSOCKET_ENDPOINT = import.meta.env.VITE_WEBSOCKET_ENDPOINT || 
  (isLocal ? `ws://${hostname}:5000` : RENDER_BACKEND_WS);

