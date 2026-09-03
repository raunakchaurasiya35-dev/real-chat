import { useState, useEffect, useRef, useCallback } from "react";
import useAnalytics from "../hooks/useAnalytics";
import { sanitizeInput } from "../utils/sanitize";
import CallModal from "./CallModal";
import { API_BASE_URL, WEBSOCKET_ENDPOINT as DEFAULT_ENDPOINT } from "../config";

const CHANNEL_NAME = "prodesk_realtime_chat_channel";

// Web Audio API Synthesizer for instant low-latency sound effects
const playTone = (frequency, duration, type = "sine") => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch {
    // Ignore audio autoplay restrictions
  }
};

const playSendSound = () => playTone(659.25, 0.12, "sine"); // E5
const playReceiveSound = () => {
  playTone(880, 0.1, "sine"); // A5
  setTimeout(() => playTone(1174.66, 0.15, "sine"), 90); // D6
};

/**
 * LiveFeedEngine Component
 * Full-featured WhatsApp-style 1-on-1 real-time chat interface with
 * Saved Contacts Sidebar, WhatsApp Pill Input Bar, Attachment Popup Menu, Live Voice Note Recording & WebRTC Audio/Video Calling.
 */
const LiveFeedEngine = ({
  endpoint = DEFAULT_ENDPOINT,
  currentUser = "Dispatcher",
}) => {
  const [connectionStatus, setConnectionStatus] = useState("CONNECTING");
  const [messageLog, setMessageLog] = useState([]);
  const [inputText, setInputText] = useState("");
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [errorMessage, setErrorMessage] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUser, setTypingUser] = useState(null);

  // Receiver, file, reply, lightbox, dropdown, contacts & clear modal state
  const [selectedReceiver, setSelectedReceiver] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [replyToMessage, setReplyToMessage] = useState(null);
  const [previewImageModal, setPreviewImageModal] = useState(null);
  const [activeDropdownId, setActiveDropdownId] = useState(null);

  // WhatsApp Attachment Popup & Emoji Panel state
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  // WhatsApp Multi-Select & Delete Mode state
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState([]);
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);

  // Voice Note Recording state & refs
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  // Audio / Video Call State
  const [callState, setCallState] = useState(null); // null | { status, callType, peerUser, peerFullName, peerAvatar, isIncoming, signalData }

  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const recordingTimerRef = useRef(null);

  // Saved contacts state
  const [savedContacts, setSavedContacts] = useState([]);
  const [contactInput, setContactInput] = useState("");
  const [contactStatus, setContactStatus] = useState({ text: "", type: "" });
  const [showClearConfirm, setShowClearConfirm] = useState(false);

  const socketRef = useRef(null);
  const broadcastChannelRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const feedContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Keep savedContacts ref updated for stable WebSocket event handlers
  const savedContactsRef = useRef(savedContacts);
  useEffect(() => {
    savedContactsRef.current = savedContacts;
  }, [savedContacts]);
  const docInputRef = useRef(null);
  const mediaInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const audioInputRef = useRef(null);

  const retryCountRef = useRef(0);
  const isComponentMounted = useRef(true);
  const connectWebSocketRef = useRef(null);
  const typingTimerRef = useRef(null);
  const heartbeatTimerRef = useRef(null);
  const connectingTimeoutRef = useRef(null);
  const onSignalRef = useRef(null);

  const { logAnalytics } = useAnalytics();

  // Close dropdown menu, attach menu, and emoji panel when clicking outside
  useEffect(() => {
    const handleDocumentClick = () => {
      setActiveDropdownId(null);
      setIsAttachMenuOpen(false);
      setShowEmojiPicker(false);
    };
    document.addEventListener("click", handleDocumentClick);
    return () => {
      document.removeEventListener("click", handleDocumentClick);
    };
  }, []);

  // Request browser Notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Scroll feed to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (feedContainerRef.current) {
        feedContainerRef.current.scrollTop =
          feedContainerRef.current.scrollHeight;
      }
    }, 30);
  }, []);

  // Fetch saved contacts for current user
  const loadContacts = useCallback(async () => {
    if (!currentUser) return;
    try {
      const res = await fetch(`${API_BASE_URL}/users/contacts/${currentUser}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          const contacts = data.contacts || [];
          setSavedContacts(contacts);

          // Default select first contact if none selected
          setSelectedReceiver((prev) => {
            if (!prev && contacts.length > 0) {
              return contacts[0].username;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error("Failed to fetch saved contacts:", err);
    }
  }, [currentUser]);

  useEffect(() => {
    let isCancelled = false;
    const fetchSaved = async () => {
      if (!currentUser) return;
      try {
        const res = await fetch(`${API_BASE_URL}/users/contacts/${currentUser}`);
        if (res.ok) {
          const data = await res.json();
          if (data.success && !isCancelled) {
            const contacts = data.contacts || [];
            setSavedContacts(contacts);

            setSelectedReceiver((prev) => {
              if (!prev && contacts.length > 0) {
                return contacts[0].username;
              }
              return prev;
            });
          }
        }
      } catch (err) {
        console.error("Failed to fetch saved contacts:", err);
      }
    };

    fetchSaved();
    return () => {
      isCancelled = true;
    };
  }, [currentUser]);

  // Fetch chat history from MongoDB for selected receiver
  useEffect(() => {
    if (!currentUser || !selectedReceiver) return;
    let isCancelled = false;
    const loadHistory = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/messages/${currentUser}/${selectedReceiver}`);
        if (res.ok) {
          const data = await res.json();
          if (!isCancelled) {
            const formatted = data.map((m) => ({
              id: m._id || m.id || `msg-${Date.now()}`,
              _id: m._id,
              sender: m.sender,
              receiver: m.receiver,
              text: m.text || "",
              status: m.status || "delivered",
              fileUrl: m.fileUrl || null,
              fileType: m.fileType || null,
              fileName: m.fileName || null,
              fileSize: m.fileSize || null,
              replyTo: m.replyTo || null,
              reactions: m.reactions || [],
              timestamp: m.createdAt
                ? new Date(m.createdAt).toLocaleTimeString()
                : new Date().toLocaleTimeString(),
            }));

            setMessageLog((prev) => {
              const remaining = prev.filter(
                (m) =>
                  !(
                    (m.sender === currentUser && m.receiver === selectedReceiver) ||
                    (m.sender === selectedReceiver && m.receiver === currentUser)
                  )
              );
              return [...remaining, ...formatted];
            });
            scrollToBottom();
          }
        }
      } catch (err) {
        console.error("Failed to fetch chat history:", err);
      }
    };

    loadHistory();
    return () => {
      isCancelled = true;
    };
  }, [currentUser, selectedReceiver, scrollToBottom]);

  // Handle adding a contact by Email or Username
  const handleAddContact = async (e) => {
    if (e) e.preventDefault();
    setContactStatus({ text: "", type: "" });

    if (!contactInput.trim()) {
      setContactStatus({ text: "Please enter an Email or Username.", type: "error" });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/users/contacts/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUser,
          contactQuery: contactInput.trim(),
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.message || "User not available");
      }

      setContactStatus({ text: data.message, type: "success" });
      setSavedContacts(data.contacts || []);
      setContactInput("");

      const addedUsername = data.targetUsername || contactInput.trim();
      setSelectedReceiver(addedUsername);

      // Notify WebSocket target user to refresh contacts list live
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "notifyContactAdd",
            sender: currentUser,
            receiver: addedUsername,
          })
        );
      }
    } catch (err) {
      setContactStatus({ text: err.message || "User not available", type: "error" });
    }
  };

  // Handle removing a contact
  const handleRemoveContact = async (contactUsername, e) => {
    if (e) e.stopPropagation();
    try {
      const res = await fetch(`${API_BASE_URL}/users/contacts/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentUser,
          contactUsername,
        }),
      });
      const data = await res.json();
      if (data.success) {
        const remaining = data.contacts || [];
        setSavedContacts(remaining);
        if (selectedReceiver === contactUsername) {
          setSelectedReceiver(remaining.length > 0 ? remaining[0].username : null);
        }
      }
    } catch (err) {
      console.error("Failed to remove contact:", err);
    }
  };

  // Handle clearing / deleting chat history for current receiver
  const handleClearChatHistory = async () => {
    if (!selectedReceiver) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/messages/clear/${currentUser}/${selectedReceiver}`,
        { method: "DELETE" }
      );
      const data = await res.json();

      if (data.success) {
        setMessageLog((prev) =>
          prev.filter(
            (m) =>
              m.sender &&
              m.receiver &&
              !(
                (m.sender.toLowerCase() === currentUser.toLowerCase() &&
                  m.receiver.toLowerCase() === selectedReceiver.toLowerCase()) ||
                (m.sender.toLowerCase() === selectedReceiver.toLowerCase() &&
                  m.receiver.toLowerCase() === currentUser.toLowerCase())
              )
          )
        );
        setShowClearConfirm(false);
      }
    } catch (err) {
      console.error("Failed to clear chat history:", err);
    }
  };

  // Call Handlers
  const startCall = (callType) => {
    if (!selectedReceiver || connectionStatus !== "CONNECTED") return;
    const targetContact = savedContacts.find((c) => c.username === selectedReceiver);

    setCallState({
      status: "outgoing",
      callType: callType,
      peerUser: selectedReceiver,
      peerFullName: targetContact ? targetContact.fullName : selectedReceiver,
      peerAvatar: targetContact ? targetContact.avatar : "",
      isIncoming: false,
    });

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "callRequest",
          from: currentUser,
          to: selectedReceiver,
          callType: callType,
        })
      );
    }
  };

  const handleAcceptCall = () => {
    if (!callState) return;

    setCallState((prev) => ({
      ...prev,
      status: "active",
    }));

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "callAccepted",
          from: currentUser,
          to: callState.peerUser,
        })
      );
    }
  };

  const handleDeclineCall = () => {
    if (!callState) return;

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "callDeclined",
          from: currentUser,
          to: callState.peerUser,
        })
      );
    }
    setCallState(null);
  };

  const handleEndCall = () => {
    setCallState(null);
  };

  // Browser Broadcast Channel for multi-tab sync
  useEffect(() => {
    if (typeof window !== "undefined" && "BroadcastChannel" in window) {
      const channel = new BroadcastChannel(CHANNEL_NAME);
      broadcastChannelRef.current = channel;

      channel.onmessage = (event) => {
        if (!isComponentMounted.current) return;
        const incomingData = event.data;

        if (incomingData && incomingData.type === "reactionUpdated") {
          setMessageLog((prev) =>
            prev.map((msg) => {
              if (
                msg.id === incomingData.messageId ||
                msg._id === incomingData.messageId
              ) {
                const filtered = (msg.reactions || []).filter(
                  (r) => r.user !== incomingData.user
                );
                return {
                  ...msg,
                  reactions: [
                    ...filtered,
                    { emoji: incomingData.emoji, user: incomingData.user },
                  ],
                };
              }
              return msg;
            })
          );
        }
      };

      return () => {
        channel.close();
      };
    }
  }, []);

  // WebSocket Connection Logic with Auto-Connect Watchdog & Fast Retry
  const connectWebSocket = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    // Clean up any hanging socket before opening new connection
    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore
      }
    }

    try {
      setConnectionStatus("CONNECTING");
      const ws = new WebSocket(endpoint);
      socketRef.current = ws;

      // 4-second Connecting Watchdog: If stuck in CONNECTING for > 4s, force auto-reconnect
      if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
      connectingTimeoutRef.current = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          try {
            ws.close();
          } catch (closeErr) {
            console.error("Error closing hanging socket:", closeErr);
          }
          if (isComponentMounted.current && connectWebSocketRef.current) {
            connectWebSocketRef.current();
          }
        }
      }, 4000);

      ws.onopen = () => {
        if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
        if (!isComponentMounted.current) return;
        setConnectionStatus("CONNECTED");
        setErrorMessage(null);
        retryCountRef.current = 0;
        setReconnectAttempt(0);

        // Register currentUser on socket server
        ws.send(JSON.stringify({ type: "addUser", username: currentUser }));

        // Start 15s Heartbeat Ping to keep connection active and prevent offline drop-outs
        if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = setInterval(() => {
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "ping" }));
          }
        }, 15000);

        logAnalytics({
          event: "websocket_connected",
          timestamp: new Date().toISOString(),
          user: currentUser,
        });
      };

      ws.onmessage = (event) => {
        if (!isComponentMounted.current) return;

        try {
          const parsedData = JSON.parse(event.data);

          if (parsedData.type === "onlineUsersList") {
            setOnlineUsers(parsedData.payload || []);
            return;
          }

          if (parsedData.type === "contactUpdated") {
            loadContacts();
            return;
          }

          if (parsedData.type === "typing") {
            if (parsedData.sender !== currentUser) {
              setTypingUser(parsedData.sender);
            }
            return;
          }

          if (parsedData.type === "stopTyping") {
            if (parsedData.sender !== currentUser) {
              setTypingUser(null);
            }
            return;
          }

          if (parsedData.type === "messageRead") {
            setMessageLog((prev) =>
              prev.map((msg) =>
                msg.id === parsedData.messageId || msg._id === parsedData.messageId
                  ? { ...msg, status: "read" }
                  : msg
              )
            );
            return;
          }

          if (parsedData.type === "reactionUpdated") {
            setMessageLog((prev) =>
              prev.map((msg) => {
                if (
                  msg.id === parsedData.messageId ||
                  msg._id === parsedData.messageId
                ) {
                  return {
                    ...msg,
                    reactions: parsedData.reactions || [],
                  };
                }
                return msg;
              })
            );
            return;
          }

          // WebRTC & Call Signaling Messages
          if (parsedData.type === "callRequest") {
            const senderContact = (savedContactsRef.current || []).find((c) => c.username === parsedData.from);
            setCallState({
              status: "ringing",
              callType: parsedData.callType || "audio",
              peerUser: parsedData.from,
              peerFullName: senderContact ? senderContact.fullName : parsedData.from,
              peerAvatar: senderContact ? senderContact.avatar : null,
              isIncoming: true,
            });
            return;
          }

          if (parsedData.type === "callAccepted") {
            setCallState((prev) => (prev ? { ...prev, status: "active" } : null));
            return;
          }

          if (parsedData.type === "callDeclined") {
            setCallState(null);
            setErrorMessage(`Call declined by @${parsedData.from}: ${parsedData.reason || "User is currently unavailable"}`);
            return;
          }

          if (parsedData.type === "callEnded") {
            setCallState(null);
            return;
          }

          if (
            parsedData.type === "webrtcOffer" ||
            parsedData.type === "webrtcAnswer" ||
            parsedData.type === "webrtcIceCandidate"
          ) {
            if (onSignalRef.current) {
              onSignalRef.current(parsedData);
            }
            return;
          }

          if (parsedData.type === "receiveMessage") {
            const msgPayload = parsedData.payload;
            const isFromMe = msgPayload.sender === currentUser;

            if (!isFromMe) {
              playReceiveSound();
              if (
                typeof document !== "undefined" &&
                document.hidden &&
                "Notification" in window &&
                Notification.permission === "granted"
              ) {
                new Notification(`Message from ${msgPayload.sender}`, {
                  body: msgPayload.text || "Sent a voice note or file",
                  icon: "⚡",
                });
              }

              // Auto-refresh contacts so sender appears in receiver's sidebar automatically
              loadContacts();
            }

            setMessageLog((prev) => {
              const exists = prev.some(
                (m) => m.id === msgPayload.id || (m._id && m._id === msgPayload._id)
              );
              if (exists) return prev;
              return [...prev, msgPayload];
            });

            scrollToBottom();

            // Mark incoming 1-on-1 message as read if viewing this conversation
            if (!isFromMe && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
              socketRef.current.send(
                JSON.stringify({
                  type: "markRead",
                  messageId: msgPayload._id || msgPayload.id,
                })
              );
            }
          }
        } catch (parseError) {
          console.error("Error parsing WebSocket payload:", parseError);
        }
      };

      ws.onerror = () => {
        if (!isComponentMounted.current) return;
        setErrorMessage("Network anomaly detected on WebSocket connection.");
      };

      ws.onclose = () => {
        if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        if (!isComponentMounted.current) return;
        setConnectionStatus("DISCONNECTED");

        const currentRetry = retryCountRef.current + 1;
        retryCountRef.current = currentRetry;
        setReconnectAttempt(currentRetry);

        // Fast retry backoff: 1s, 1.5s, 2.2s, max 4s
        const delay = Math.min(1000 * Math.pow(1.5, currentRetry - 1), 4000);

        if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = setTimeout(() => {
          if (isComponentMounted.current && connectWebSocketRef.current) {
            connectWebSocketRef.current();
          }
        }, delay);
      };
    } catch (err) {
      console.error("Failed to instantiate WebSocket:", err);
      setConnectionStatus("DISCONNECTED");
    }
  }, [endpoint, currentUser]);

  useEffect(() => {
    connectWebSocketRef.current = connectWebSocket;
  }, [connectWebSocket]);

  // Window Online Event & Visibility Change Auto-Reconnector (No Page Refresh Needed!)
  useEffect(() => {
    const handleOnlineOrVisible = () => {
      if (!isComponentMounted.current) return;
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        console.log("Network online or tab active. Auto-connecting WebSocket...");
        if (connectWebSocketRef.current) {
          connectWebSocketRef.current();
        }
      }
    };

    window.addEventListener("online", handleOnlineOrVisible);
    document.addEventListener("visibilitychange", handleOnlineOrVisible);

    return () => {
      window.removeEventListener("online", handleOnlineOrVisible);
      document.removeEventListener("visibilitychange", handleOnlineOrVisible);
    };
  }, []);

  useEffect(() => {
    isComponentMounted.current = true;
    const timer = setTimeout(() => {
      if (isComponentMounted.current) {
        connectWebSocket();
      }
    }, 0);

    return () => {
      isComponentMounted.current = false;
      clearTimeout(timer);
      if (connectingTimeoutRef.current) clearTimeout(connectingTimeoutRef.current);
      if (heartbeatTimerRef.current) clearInterval(heartbeatTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (socketRef.current) socketRef.current.close();
    };
  }, [connectWebSocket]);

  const handleManualReconnect = () => {
    setConnectionStatus("CONNECTING");
    connectWebSocket();
  };

  // Typing indicator handlers
  const handleInputChange = (e) => {
    setInputText(e.target.value);

    if (selectedReceiver && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "typing",
          sender: currentUser,
          receiver: selectedReceiver,
        })
      );

      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: "stopTyping",
              sender: currentUser,
              receiver: selectedReceiver,
            })
          );
        }
      }, 2000);
    }
  };

  // File selection
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      setSelectedFile({
        name: file.name,
        type: file.type.startsWith("audio/")
          ? "audio"
          : file.type.startsWith("image/")
          ? "image"
          : file.type.startsWith("video/")
          ? "video"
          : "file",
        size: `${(file.size / 1024).toFixed(1)} KB`,
        dataUrl: event.target.result,
      });
    };
    reader.readAsDataURL(file);
  };

  // Voice Recording Handlers
  const startVoiceRecording = async () => {
    if (!selectedReceiver || connectionStatus !== "CONNECTED") return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start(100);

      setIsRecording(true);
      setRecordingDuration(0);

      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Microphone access denied or error:", err);
      alert("Microphone access is required to record voice notes.");
    }
  };

  const stopAndSendVoiceRecording = () => {
    if (!mediaRecorderRef.current || !isRecording) return;

    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;

    recorder.onstop = () => {
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }

      const audioBlob = new Blob(audioChunksRef.current, { type: "audio/mp3" });
      const reader = new FileReader();

      reader.onloadend = () => {
        const dataUrl = reader.result;
        const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
        const durationFormatted = `${Math.floor(recordingDuration / 60)}:${(recordingDuration % 60)
          .toString()
          .padStart(2, "0")}`;

        const fileNameMp3 = `Voice_Note_${Date.now()}.mp3`;

        const messagePayload = {
          type: "sendMessage",
          id: messageId,
          sender: currentUser,
          receiver: selectedReceiver,
          text: `🎙️ Voice Note (${durationFormatted})`,
          fileUrl: dataUrl,
          fileType: "audio",
          fileName: fileNameMp3,
          fileSize: `${(audioBlob.size / 1024).toFixed(1)} KB`,
          replyTo: null,
        };

        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
          socketRef.current.send(JSON.stringify(messagePayload));
          playSendSound();
        }
      };

      reader.readAsDataURL(audioBlob);
      setIsRecording(false);
      setRecordingDuration(0);
    };

    recorder.stop();
  };

  const cancelVoiceRecording = () => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (mediaRecorderRef.current) {
      const recorder = mediaRecorderRef.current;
      recorder.onstop = null;
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      if (recorder.stream) {
        recorder.stream.getTracks().forEach((track) => track.stop());
      }
    }

    audioChunksRef.current = [];
    setIsRecording(false);
    setRecordingDuration(0);
  };

  // Send Message handler
  const handleSendMessage = () => {
    if (!selectedReceiver || connectionStatus !== "CONNECTED") return;

    if (!inputText.trim() && !selectedFile) {
      // Trigger voice recording if input is empty
      startVoiceRecording();
      return;
    }

    const sanitized = sanitizeInput(inputText);
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;

    const messagePayload = {
      type: "sendMessage",
      id: messageId,
      sender: currentUser,
      receiver: selectedReceiver,
      text: sanitized,
      fileUrl: selectedFile ? selectedFile.dataUrl : null,
      fileType: selectedFile ? selectedFile.type : null,
      fileName: selectedFile ? selectedFile.name : null,
      fileSize: selectedFile ? selectedFile.size : null,
      replyTo: replyToMessage
        ? {
            id: replyToMessage.id,
            text: replyToMessage.text || (replyToMessage.fileName ? `File: ${replyToMessage.fileName}` : ""),
            sender: replyToMessage.sender,
          }
        : null,
    };

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(messagePayload));
      playSendSound();
    }

    // Reset input fields
    setInputText("");
    setSelectedFile(null);
    setReplyToMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Emoji Reactions
  const handleAddEmojiReaction = (messageId, emoji) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "addReaction",
          messageId,
          emoji,
          user: currentUser,
        })
      );
    }
    setActiveDropdownId(null);
  };

  // Pin Message Toggle Handler
  const handleTogglePinMessage = (messageId) => {
    setMessageLog((prev) =>
      prev.map((m) =>
        m.id === messageId || m._id === messageId
          ? { ...m, isPinned: !m.isPinned }
          : m
      )
    );
    setActiveDropdownId(null);
  };

  // Keep / Star Message Toggle Handler
  const handleToggleKeepMessage = (messageId) => {
    setMessageLog((prev) =>
      prev.map((m) =>
        m.id === messageId || m._id === messageId
          ? { ...m, isKept: !m.isKept }
          : m
      )
    );
    setActiveDropdownId(null);
  };

  // Selection Mode & Delete Handlers
  const handleInitiateDeleteSelection = (messageId) => {
    setIsSelectionMode(true);
    setSelectedMessageIds([messageId]);
    setActiveDropdownId(null);
  };

  const handleToggleSelectMessage = (messageId) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId)
        ? prev.filter((id) => id !== messageId)
        : [...prev, messageId]
    );
  };

  const handleSelectAllMessages = () => {
    if (selectedMessageIds.length === filteredMessages.length) {
      setSelectedMessageIds([]);
    } else {
      setSelectedMessageIds(filteredMessages.map((m) => m.id));
    }
  };

  const handleCancelSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMessageIds([]);
    setShowDeleteConfirmModal(false);
  };

  const handleConfirmDeleteSelectedMessages = (deleteMode = "everyone") => {
    setMessageLog((prev) =>
      prev.filter(
        (m) =>
          !selectedMessageIds.includes(m.id) &&
          !selectedMessageIds.includes(m._id)
      )
    );

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      selectedMessageIds.forEach((msgId) => {
        socketRef.current.send(
          JSON.stringify({
            type: "deleteMessage",
            messageId: msgId,
            deleteMode,
            user: currentUser,
          })
        );
      });
    }

    setIsSelectionMode(false);
    setSelectedMessageIds([]);
    setShowDeleteConfirmModal(false);
  };

  const isSendDisabled = !selectedReceiver || connectionStatus !== "CONNECTED";

  // Strict 1-on-1 Message Filtering for active conversation (Case-Insensitive)
  const filteredMessages = messageLog.filter(
    (m) =>
      selectedReceiver &&
      m.sender &&
      m.receiver &&
      ((m.sender.toLowerCase() === currentUser.toLowerCase() &&
        m.receiver.toLowerCase() === selectedReceiver.toLowerCase()) ||
        (m.sender.toLowerCase() === selectedReceiver.toLowerCase() &&
          m.receiver.toLowerCase() === currentUser.toLowerCase()))
  );

  const selectedContact = savedContacts.find((c) => c.username === selectedReceiver);

  return (
    <div className={`chat-layout-wrapper ${selectedReceiver ? "has-active-receiver" : ""}`}>
      {/* LEFT SIDEBAR: SAVED CONTACTS */}
      <aside className="chat-sidebar">
        <div className="sidebar-header">
          <h3 className="sidebar-title">💬 Saved Contacts</h3>
          <span className="sidebar-subtitle">1-on-1 Private Messaging</span>
        </div>

        {/* Add Contact Form */}
        <form onSubmit={handleAddContact} className="add-contact-form">
          <div className="contact-input-wrapper">
            <input
              type="text"
              placeholder="Save by Email or Username..."
              value={contactInput}
              onChange={(e) => setContactInput(e.target.value)}
              className="contact-search-input"
            />
            <button type="submit" className="btn-add-contact" title="Save Contact">
              + Save
            </button>
          </div>
          {contactStatus.text && (
            <div className={`contact-status-alert alert-${contactStatus.type}`}>
              {contactStatus.text}
            </div>
          )}
        </form>

        {/* Contacts Scroll List */}
        <div className="contacts-scroll-list">
          <div className="list-section-header">Direct Messages</div>

          {savedContacts.length === 0 ? (
            <div className="no-contacts-hint">
              No saved contacts yet. Enter a user's Email or Username above to start 1-on-1 private chat!
            </div>
          ) : (
            savedContacts.map((contact) => {
              const isOnline = onlineUsers.some(
                (u) => u && contact.username && u.toLowerCase() === contact.username.toLowerCase()
              );
              const isSelected = selectedReceiver === contact.username;

              return (
                <div
                  key={contact.username}
                  className={`contact-item-card ${isSelected ? "active" : ""}`}
                  onClick={() => setSelectedReceiver(contact.username)}
                >
                  <div className="contact-avatar-wrapper">
                    {contact.avatar ? (
                      <img src={contact.avatar} alt="Avatar" className="contact-avatar-img" />
                    ) : (
                      <span className="contact-avatar">
                        {contact.fullName ? contact.fullName.charAt(0).toUpperCase() : contact.username.charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span className={`status-indicator-dot ${isOnline ? "online" : "offline"}`} title={isOnline ? "Online" : "Offline"} />
                  </div>

                  <div className="contact-info">
                    <span className="contact-name">{contact.fullName || contact.username}</span>
                    <span className="contact-meta">@{contact.username}</span>
                  </div>

                  <button
                    type="button"
                    className="btn-remove-contact"
                    title="Remove contact"
                    onClick={(e) => handleRemoveContact(contact.username, e)}
                  >
                    &times;
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>

      {/* RIGHT MAIN CHAT AREA */}
      <main className="chat-main-area">
        {/* Chat Header */}
        <header className="feed-header">
          {isSelectionMode ? (
            <div className="selection-mode-bar">
              <div className="selection-info">
                <button
                  type="button"
                  className="btn-cancel-selection"
                  onClick={handleCancelSelectionMode}
                  title="Cancel selection"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <span className="selection-count-text">
                  {selectedMessageIds.length} Selected
                </span>
              </div>

              <div className="selection-actions">
                <button
                  type="button"
                  className="btn-select-all-toggle"
                  onClick={handleSelectAllMessages}
                >
                  {selectedMessageIds.length === filteredMessages.length ? "Deselect All" : "Select All"}
                </button>
                <button
                  type="button"
                  className="btn-delete-selected-trigger"
                  disabled={selectedMessageIds.length === 0}
                  onClick={() => setShowDeleteConfirmModal(true)}
                  title="Delete selected messages"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                  <span>Delete ({selectedMessageIds.length})</span>
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="header-title-section">
                {selectedReceiver && (
                  <button
                    type="button"
                    className="btn-mobile-back"
                    onClick={() => setSelectedReceiver(null)}
                    title="Back to contacts list"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="19" y1="12" x2="5" y2="12" />
                      <polyline points="12 19 5 12 12 5" />
                    </svg>
                  </button>
                )}
                <div className="title-text-group">
                  <h2 className="feed-title">
                    {selectedReceiver
                      ? `💬 ${selectedContact ? selectedContact.fullName : selectedReceiver}`
                      : "Select a Contact"}
                  </h2>
                  <span className="feed-subtitle">
                    {selectedReceiver
                      ? `Private 1-on-1 Session with @${selectedReceiver} • ${
                          onlineUsers.some(
                            (u) => u && u.toLowerCase() === selectedReceiver.toLowerCase()
                          )
                            ? "🟢 Online"
                            : "⚫ Offline"
                        }`
                      : "Choose or save a contact from the sidebar to chat"}
                  </span>
                </div>
              </div>

              <div className="header-actions-group">
                {selectedReceiver && (
                  <>
                    <button
                      type="button"
                      className="btn-header-call btn-call-video"
                      onClick={() => startCall("video")}
                      title="Start Video Call"
                      disabled={connectionStatus !== "CONNECTED"}
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="4" width="14" height="16" rx="2" />
                        <path d="M22 7l-6 5 6 5V7z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="btn-header-call btn-call-audio"
                      onClick={() => startCall("audio")}
                      title="Start Audio Call"
                      disabled={connectionStatus !== "CONNECTED"}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    </button>

                    <button
                      type="button"
                      className="btn-clear-chat"
                      onClick={() => setShowClearConfirm(true)}
                      title="Delete Chat History"
                    >
                      🗑️ Clear Chat
                    </button>
                  </>
                )}

                <span className={`status-badge status-${connectionStatus.toLowerCase()}`}>
                  <span className="status-dot"></span>
                  {connectionStatus}
                </span>

                <button
                  type="button"
                  className="btn-reconnect"
                  onClick={handleManualReconnect}
                  disabled={connectionStatus === "CONNECTED"}
                >
                  ⚡ Reconnect
                </button>
              </div>
            </>
          )}
        </header>

        {/* Clear Chat Confirmation Banner */}
        {showClearConfirm && (
          <div className="clear-confirm-bar">
            <span>Are you sure you want to delete all chat history with <strong>@{selectedReceiver}</strong>?</span>
            <div className="confirm-btn-group">
              <button onClick={handleClearChatHistory} className="btn-confirm-delete">
                Yes, Delete History
              </button>
              <button onClick={() => setShowClearConfirm(false)} className="btn-cancel-delete">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Connection Lost Banner */}
        {connectionStatus === "DISCONNECTED" && (
          <div className="reconnect-banner">
            <span>Connection Lost. Attempting to reconnect... (Attempt #{reconnectAttempt})</span>
            <button onClick={handleManualReconnect} className="banner-retry-btn">
              Retry Now
            </button>
          </div>
        )}

        {/* Error Notice */}
        {errorMessage && (
          <div className="error-notice">
            <span>{errorMessage}</span>
            <button onClick={() => setErrorMessage(null)}>&times;</button>
          </div>
        )}

        {/* Scrollable Message Feed */}
        <div className="feed-container" ref={feedContainerRef}>
          {!selectedReceiver ? (
            <div className="empty-state">
              <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <h3>No Contact Selected</h3>
              <p>Enter an Email or Username in the sidebar to add a contact and start 1-on-1 private messaging.</p>
            </div>
          ) : filteredMessages.length === 0 ? (
            <div className="empty-state">
              <svg className="empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <h3>No Messages in this Chat</h3>
              <p>Send a message or voice note to start private conversation with @{selectedReceiver}. History will be safely saved in MongoDB.</p>
            </div>
          ) : (
            <div className="message-stream">
              {filteredMessages.map((msg) => {
                const isCurrentUser = msg.sender === currentUser;
                const isDropdownOpen = activeDropdownId === msg.id;
                const isSelected =
                  selectedMessageIds.includes(msg.id) ||
                  selectedMessageIds.includes(msg._id);

                return (
                  <article
                    key={msg.id}
                    className={`message-card ${isCurrentUser ? "outgoing" : "incoming"} ${
                      isSelectionMode ? "selection-mode" : ""
                    } ${isSelected ? "selected" : ""}`}
                    onClick={() => {
                      if (isSelectionMode) {
                        handleToggleSelectMessage(msg.id);
                      }
                    }}
                  >
                    {/* WhatsApp-style Checkbox in Selection Mode */}
                    {isSelectionMode && (
                      <div className="message-selection-checkbox">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleToggleSelectMessage(msg.id);
                          }}
                        />
                        <span className="checkbox-custom-mark">
                          {isSelected && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </span>
                      </div>
                    )}

                    {/* Top-Right Hover Dropdown Arrow & Context Menu */}
                    {!isSelectionMode && (
                      <div className="message-dropdown-container" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className={`dropdown-trigger-btn ${isDropdownOpen ? "active" : ""}`}
                          onClick={() =>
                            setActiveDropdownId(isDropdownOpen ? null : msg.id)
                          }
                          aria-label="Message options"
                          title="Message options"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {isDropdownOpen && (
                          <div className={`message-dropdown-menu ${isCurrentUser ? "align-right" : "align-left"}`}>
                            {/* Quick Emoji Bar (Matching Image 2 Top Row) */}
                            <div className="dropdown-reactions-bar">
                              {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                                <button
                                  key={emoji}
                                  type="button"
                                  className="emoji-reaction-btn"
                                  onClick={() => handleAddEmojiReaction(msg.id, emoji)}
                                  title={`React ${emoji}`}
                                >
                                  {emoji}
                                </button>
                              ))}
                              <button
                                type="button"
                                className="emoji-reaction-btn emoji-plus-btn"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                }}
                                title="More reactions"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <line x1="12" y1="5" x2="12" y2="19" />
                                  <line x1="5" y1="12" x2="19" y2="12" />
                                </svg>
                              </button>
                            </div>

                            <div className="dropdown-divider" />

                            {/* Options List (Matching Image 2 Context Menu) */}
                            <div className="dropdown-menu-list">
                              <button
                                type="button"
                                className="dropdown-menu-item"
                                onClick={() => {
                                  setReplyToMessage(msg);
                                  setActiveDropdownId(null);
                                }}
                              >
                                <svg className="menu-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="9 17 4 12 9 7" />
                                  <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                                </svg>
                                <span>Reply</span>
                              </button>

                              <button
                                type="button"
                                className="dropdown-menu-item"
                                onClick={() => {
                                  setActiveDropdownId(null);
                                }}
                              >
                                <svg className="menu-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <circle cx="12" cy="12" r="10" />
                                  <path d="M8 14s1.5 2 4 2 4-2 4-2" />
                                  <line x1="9" y1="9" x2="9.01" y2="9" />
                                  <line x1="15" y1="9" x2="15.01" y2="9" />
                                </svg>
                                <span>React</span>
                              </button>

                              <button
                                type="button"
                                className="dropdown-menu-item"
                                onClick={() => handleTogglePinMessage(msg.id)}
                              >
                                <svg className="menu-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M12 17v5" />
                                  <path d="M9 2v7l-2 3v2h10v-2l-2-3V2z" />
                                </svg>
                                <span>{msg.isPinned ? "Unpin" : "Pin"}</span>
                              </button>

                              <button
                                type="button"
                                className="dropdown-menu-item"
                                onClick={() => handleToggleKeepMessage(msg.id)}
                              >
                                <svg className="menu-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                                </svg>
                                <span>{msg.isKept ? "Unkeep" : "Keep"}</span>
                              </button>

                              <div className="dropdown-divider" />

                              <button
                                type="button"
                                className="dropdown-menu-item item-delete"
                                onClick={() => handleInitiateDeleteSelection(msg.id)}
                              >
                                <svg className="menu-item-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  <line x1="10" y1="11" x2="10" y2="17" />
                                  <line x1="14" y1="11" x2="14" y2="17" />
                                </svg>
                                <span>Delete</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    <div className="message-header">
                      <span className="sender-name">{msg.sender}</span>
                      <div className="message-header-meta">
                        {msg.isPinned && <span className="message-badge-icon" title="Pinned">📌</span>}
                        {msg.isKept && <span className="message-badge-icon" title="Kept">🔖</span>}
                        <span className="message-time">{msg.timestamp}</span>
                      </div>
                    </div>

                    {/* Quoted Reply Block */}
                    {msg.replyTo && (
                      <div className="quoted-reply-box">
                        <span className="reply-author">@{msg.replyTo.sender}:</span>
                        <span className="reply-snippet">{msg.replyTo.text}</span>
                      </div>
                    )}

                    {/* Message Body Text */}
                    {msg.text && <p className="message-body">{msg.text}</p>}

                    {/* File & Voice Note Attachment Rendering */}
                    {msg.fileUrl && (
                      <div className="message-attachment">
                        {msg.fileType === "audio" ? (
                          <div className="voice-note-card">
                            <span className="voice-note-icon">🎙️</span>
                            <audio src={msg.fileUrl} controls className="message-audio-player" />
                            <a
                              href={msg.fileUrl}
                              download={
                                msg.fileName
                                  ? msg.fileName.replace(/\.[^/.]+$/, "") + ".mp3"
                                  : "voice-note.mp3"
                              }
                              className="btn-download-audio"
                              title="Download MP3 Audio"
                            >
                              ⬇️ MP3
                            </a>
                          </div>
                        ) : msg.fileType === "image" ? (
                          <div
                            className="attachment-image-wrapper"
                            onClick={() => setPreviewImageModal(msg.fileUrl)}
                          >
                            <img src={msg.fileUrl} alt={msg.fileName || "attachment"} className="attachment-image" />
                          </div>
                        ) : msg.fileType === "video" ? (
                          <video src={msg.fileUrl} controls className="attachment-video" />
                        ) : (
                          <a
                            href={msg.fileUrl}
                            download={msg.fileName || "download"}
                            className="attachment-file-link"
                          >
                            📎 {msg.fileName} ({msg.fileSize})
                          </a>
                        )}
                      </div>
                    )}

                    {/* Reactions Display Badges */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div className="message-reactions-container">
                        {msg.reactions.map((r, idx) => (
                          <span key={idx} className="reaction-badge" title={r.user}>
                            {r.emoji}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Message Read Status Indicators */}
                    {isCurrentUser && (
                      <div className="message-status-bar">
                        {msg.status === "read" ? (
                          <span className="read-receipt read">✓✓ Read</span>
                        ) : msg.status === "delivered" ? (
                          <span className="read-receipt delivered">✓ Delivered</span>
                        ) : (
                          <span className="read-receipt sent">✓ Sent</span>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>

        {/* Typing Indicator Bar */}
        {typingUser && selectedReceiver && (
          <div className="typing-indicator-bar">
            <span className="typing-dots">•••</span>
            <span className="typing-text">{typingUser} is typing a message...</span>
          </div>
        )}

        {/* Pre-Send File Attachment Preview Bar */}
        {selectedFile && (
          <div className="file-preview-bar">
            <span>📎 Attached: {selectedFile.name} ({selectedFile.size})</span>
            <button
              type="button"
              className="btn-remove-file"
              onClick={() => {
                setSelectedFile(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              &times;
            </button>
          </div>
        )}

        {/* Pre-Send Reply Preview Bar */}
        {replyToMessage && (
          <div className="reply-preview-bar">
            <span>↩ Replying to @{replyToMessage.sender}: "{replyToMessage.text || replyToMessage.fileName}"</span>
            <button
              type="button"
              className="btn-cancel-reply"
              onClick={() => setReplyToMessage(null)}
            >
              &times;
            </button>
          </div>
        )}

        {/* WHATSAPP STYLE MESSAGE INPUT CONTROL FOOTER */}
        <footer className="feed-footer">
          {/* Category-Specific Hidden File Inputs */}
          <input
            type="file"
            ref={docInputRef}
            onChange={handleFileSelect}
            className="sr-only"
            accept=".pdf,.doc,.docx,.txt,.zip"
          />
          <input
            type="file"
            ref={mediaInputRef}
            onChange={handleFileSelect}
            className="sr-only"
            accept="image/*,video/*"
          />
          <input
            type="file"
            ref={cameraInputRef}
            onChange={handleFileSelect}
            className="sr-only"
            accept="image/*"
            capture="environment"
          />
          <input
            type="file"
            ref={audioInputRef}
            onChange={handleFileSelect}
            className="sr-only"
            accept="audio/*"
          />

          {isRecording ? (
            /* Live Voice Note Recording Bar */
            <div className="whatsapp-recording-pill">
              <div className="recording-status">
                <span className="recording-pulsing-dot">🔴</span>
                <span className="recording-timer">
                  {Math.floor(recordingDuration / 60)}:
                  {(recordingDuration % 60).toString().padStart(2, "0")}
                </span>
                <span className="recording-text">Recording voice note...</span>
              </div>

              <div className="recording-action-buttons">
                <button
                  type="button"
                  className="btn-cancel-recording"
                  onClick={cancelVoiceRecording}
                  title="Cancel Recording"
                >
                  🗑️ Cancel
                </button>

                <button
                  type="button"
                  className="btn-send-recording"
                  onClick={stopAndSendVoiceRecording}
                  title="Send Voice Note"
                >
                  🚀 Send Voice Note
                </button>
              </div>
            </div>
          ) : (
            <div className="whatsapp-input-wrapper" onClick={(e) => e.stopPropagation()}>
              {/* WhatsApp Attachment Pop-up Menu */}
              {isAttachMenuOpen && (
                <div className="whatsapp-attach-popup">
                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      if (docInputRef.current) docInputRef.current.click();
                    }}
                  >
                    <span className="attach-icon-badge badge-document">📄</span>
                    <span className="attach-item-label">Document</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      if (mediaInputRef.current) mediaInputRef.current.click();
                    }}
                  >
                    <span className="attach-icon-badge badge-media">🖼️</span>
                    <span className="attach-item-label">Photos & videos</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      if (cameraInputRef.current) cameraInputRef.current.click();
                    }}
                  >
                    <span className="attach-icon-badge badge-camera">📷</span>
                    <span className="attach-item-label">Camera</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      if (audioInputRef.current) audioInputRef.current.click();
                    }}
                  >
                    <span className="attach-icon-badge badge-audio">🎧</span>
                    <span className="attach-item-label">Audio</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      const name = prompt("Enter contact name/phone to share:");
                      if (name) setInputText(`👤 Contact Info: ${name}`);
                    }}
                  >
                    <span className="attach-icon-badge badge-contact">👤</span>
                    <span className="attach-item-label">Contact</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      const pollQ = prompt("Enter Poll Question:");
                      if (pollQ) setInputText(`📊 Poll: ${pollQ}`);
                    }}
                  >
                    <span className="attach-icon-badge badge-poll">📊</span>
                    <span className="attach-item-label">Poll</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      const evName = prompt("Enter Event Title:");
                      if (evName) setInputText(`📅 Event: ${evName}`);
                    }}
                  >
                    <span className="attach-icon-badge badge-event">📅</span>
                    <span className="attach-item-label">Event</span>
                  </button>

                  <button
                    type="button"
                    className="attach-menu-item"
                    onClick={() => {
                      setIsAttachMenuOpen(false);
                      if (mediaInputRef.current) mediaInputRef.current.click();
                    }}
                  >
                    <span className="attach-icon-badge badge-sticker">🟢</span>
                    <span className="attach-item-label">New sticker</span>
                  </button>
                </div>
              )}

              {/* Quick Emoji Picker Panel */}
              {showEmojiPicker && (
                <div className="whatsapp-emoji-panel">
                  {["😀", "😂", "😍", "👍", "🔥", "🎉", "❤️", "🙏", "😎", "🙌", "💯", "✨"].map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      className="emoji-panel-btn"
                      onClick={() => {
                        setInputText((prev) => prev + emoji);
                        setShowEmojiPicker(false);
                      }}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}

              {/* WhatsApp Pill Input Bar */}
              <div className="whatsapp-input-pill">
                <button
                  type="button"
                  className={`btn-pill-action btn-plus ${isAttachMenuOpen ? "active" : ""}`}
                  onClick={() => {
                    setIsAttachMenuOpen(!isAttachMenuOpen);
                    setShowEmojiPicker(false);
                  }}
                  title="Attach menu"
                >
                  +
                </button>

                <button
                  type="button"
                  className={`btn-pill-action btn-emoji ${showEmojiPicker ? "active" : ""}`}
                  onClick={() => {
                    setShowEmojiPicker(!showEmojiPicker);
                    setIsAttachMenuOpen(false);
                  }}
                  title="Choose emoji"
                >
                  😃
                </button>

                <textarea
                  className="whatsapp-message-input"
                  placeholder={
                    selectedReceiver
                      ? "Type a message"
                      : "Select a contact to send a message..."
                  }
                  value={inputText}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  disabled={!selectedReceiver}
                  rows={1}
                />

                <button
                  type="button"
                  className="btn-pill-send"
                  onClick={handleSendMessage}
                  disabled={isSendDisabled}
                  title={inputText.trim() || selectedFile ? "Send message" : "Record voice note"}
                >
                  {inputText.trim() || selectedFile ? "🚀" : "🎙️"}
                </button>
              </div>
            </div>
          )}
        </footer>
      </main>

      {/* Image Lightbox Modal */}
      {previewImageModal && (
        <div className="lightbox-modal" onClick={() => setPreviewImageModal(null)}>
          <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
            <img src={previewImageModal} alt="Enlarged preview" />
            <button
              type="button"
              className="lightbox-close"
              onClick={() => setPreviewImageModal(null)}
            >
              &times;
            </button>
          </div>
        </div>
      )}

      {/* Real-Time Audio / Video Call Modal */}
      {callState && (
        <CallModal
          callState={callState}
          socketRef={socketRef}
          currentUser={currentUser}
          onSignalRef={onSignalRef}
          onAcceptCall={handleAcceptCall}
          onDeclineCall={handleDeclineCall}
          onEndCall={handleEndCall}
        />
      )}

      {/* WhatsApp Delete Confirmation Modal */}
      {showDeleteConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirmModal(false)}>
          <div className="whatsapp-delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="delete-modal-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f15c6d" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="delete-modal-title">
              Delete {selectedMessageIds.length} message{selectedMessageIds.length > 1 ? "s" : ""}?
            </h3>
            <p className="delete-modal-desc">
              Are you sure you want to delete the selected message{selectedMessageIds.length > 1 ? "s" : ""}?
            </p>
            <div className="delete-modal-actions">
              <button
                type="button"
                className="btn-modal-action btn-delete-everyone"
                onClick={() => handleConfirmDeleteSelectedMessages("everyone")}
              >
                Delete for Everyone
              </button>
              <button
                type="button"
                className="btn-modal-action btn-delete-me"
                onClick={() => handleConfirmDeleteSelectedMessages("me")}
              >
                Delete for Me
              </button>
              <button
                type="button"
                className="btn-modal-action btn-delete-cancel"
                onClick={() => setShowDeleteConfirmModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveFeedEngine;
