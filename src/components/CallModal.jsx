import { useState, useEffect, useRef, useCallback } from "react";

// WebRTC Configuration with Public STUN & Free TURN Relay Servers
// TURN relays packets over port 80/443 so WebRTC audio & video streams bypass
// local NAT, Windows Firewall, and Wi-Fi router AP isolation.
const STUN_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    { urls: "stun:stun.services.mozilla.com" },
    { urls: "stun:global.stun.twilio.com:3478" },
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelay",
      credential: "openrelay",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelay",
      credential: "openrelay",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelay",
      credential: "openrelay",
    },
  ],
  iceCandidatePoolSize: 10,
};

// Web Audio Ringing Tone Generator
const playRingingChime = (ctxRef) => {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    const ctx = new AudioCtx();
    ctxRef.current = ctx;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const gain = ctx.createGain();

    osc1.type = "sine";
    osc2.type = "sine";
    osc1.frequency.setValueAtTime(440, ctx.currentTime);
    osc2.frequency.setValueAtTime(480, ctx.currentTime);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(ctx.destination);

    osc1.start();
    osc2.start();

    return ctx;
  } catch {
    return null;
  }
};

const stopRingingChime = (ctxRef) => {
  if (ctxRef.current) {
    try {
      ctxRef.current.close();
    } catch {
      // ignore
    }
    ctxRef.current = null;
  }
};

const CallModal = ({
  callState,
  socketRef,
  currentUser,
  onSignalRef,
  onAcceptCall,
  onDeclineCall,
  onEndCall,
}) => {
  const { status, callType, peerUser, peerFullName, peerAvatar, isIncoming } = callState;

  const [isMicMuted, setIsMicMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  const peerConnectionRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const timerIntervalRef = useRef(null);

  const pendingIceCandidatesRef = useRef([]);
  const pendingOfferRef = useRef(null);

  // Play ringing sound during incoming or outgoing ringing state
  useEffect(() => {
    if (status === "ringing" || status === "outgoing" || status === "incoming") {
      playRingingChime(audioCtxRef);
    } else {
      stopRingingChime(audioCtxRef);
    }

    return () => {
      stopRingingChime(audioCtxRef);
    };
  }, [status]);

  // Call duration counter for active calls
  useEffect(() => {
    let timer = null;
    let isCancelled = false;

    if (status === "active") {
      stopRingingChime(audioCtxRef);
      setTimeout(() => {
        if (!isCancelled) setCallDuration(0);
      }, 0);

      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
      timerIntervalRef.current = timer;
    }

    return () => {
      isCancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [status]);

  // Cleanup WebRTC connection & local media streams on unmount or end call
  const cleanupMediaAndPeer = () => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    stopRingingChime(audioCtxRef);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (remoteStreamRef.current) {
      remoteStreamRef.current.getTracks().forEach((track) => track.stop());
      remoteStreamRef.current = null;
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    pendingIceCandidatesRef.current = [];
    pendingOfferRef.current = null;
  };

  // Helper to add candidate or queue if remote description isn't set yet
  const addIceCandidateOrQueue = async (pc, candidate) => {
    if (!candidate) return;
    try {
      if (pc && pc.remoteDescription && pc.remoteDescription.type) {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } else {
        pendingIceCandidatesRef.current.push(candidate);
      }
    } catch (err) {
      console.error("Error adding ICE candidate:", err);
    }
  };

  // Flush queued ICE candidates once setRemoteDescription is done
  const processPendingIceCandidates = async (pc) => {
    while (pendingIceCandidatesRef.current.length > 0) {
      const candidate = pendingIceCandidatesRef.current.shift();
      try {
        if (pc && pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
      } catch (err) {
        console.error("Error processing pending ICE candidate:", err);
      }
    }
  };

  // Process Offer and send Answer
  const processOffer = async (pc, offer) => {
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      await processPendingIceCandidates(pc);

      const answer = await pc.createAnswer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: callType === "video",
      });
      await pc.setLocalDescription(answer);

      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "webrtcAnswer",
            to: peerUser,
            from: currentUser,
            answer: answer,
          })
        );
      }
    } catch (err) {
      console.error("Error processing offer:", err);
    }
  };

  // Initialize WebRTC & Get User Media Stream
  useEffect(() => {
    let isCancelled = false;

    const setupWebRTC = async () => {
      if (status !== "active") return;

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === "video" ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
        });

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        localStreamRef.current = stream;

        if (localVideoRef.current && callType === "video") {
          localVideoRef.current.srcObject = stream;
        }

        // Create WebRTC Peer Connection with TURN & STUN servers
        const pc = new RTCPeerConnection(STUN_SERVERS);
        peerConnectionRef.current = pc;

        // Add local tracks to peer connection
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });

        // Listen for remote tracks (Robust handling with MediaStream fallback)
        pc.ontrack = (event) => {
          let remoteStream = (event.streams && event.streams[0]) ? event.streams[0] : null;

          if (!remoteStream) {
            if (!remoteStreamRef.current) {
              remoteStreamRef.current = new MediaStream();
            }
            remoteStreamRef.current.addTrack(event.track);
            remoteStream = remoteStreamRef.current;
          } else {
            remoteStreamRef.current = remoteStream;
          }

          // Attach to Remote Audio Element (Unmuted & Autoplay)
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.muted = false;
            remoteAudioRef.current.play().catch((e) => console.log("Remote audio play error:", e));
          }

          // Attach to Remote Video Element
          if (remoteVideoRef.current && callType === "video") {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch((e) => console.log("Remote video play error:", e));
          }
        };

        // Listen for ICE candidates and send to peer via WebSocket
        pc.onicecandidate = (event) => {
          if (event.candidate && socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                type: "webrtcIceCandidate",
                to: peerUser,
                from: currentUser,
                candidate: event.candidate,
              })
            );
          }
        };

        // If caller (outgoing), create and send WebRTC SDP offer
        if (!isIncoming) {
          const offer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: callType === "video",
          });
          await pc.setLocalDescription(offer);

          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(
              JSON.stringify({
                type: "webrtcOffer",
                to: peerUser,
                from: currentUser,
                offer: offer,
              })
            );
          }
        } else if (pendingOfferRef.current) {
          // If offer arrived before getUserMedia finished, process queued offer
          const offerToProcess = pendingOfferRef.current;
          pendingOfferRef.current = null;
          await processOffer(pc, offerToProcess);
        }

      } catch (err) {
        console.error("WebRTC getUserMedia or PeerConnection error:", err);
        const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
        alert(
          `⚠️ Camera/Microphone Access Blocked by Browser!\n\n` +
          `Reason: Chrome/Edge blocks camera/microphone access on HTTP IP addresses (http://${host}:5173).\n\n` +
          `💡 Quick 10-Second Fix for Chrome on Second Laptop:\n` +
          `1. Open Chrome address bar and go to: chrome://flags/#unsafely-treat-insecure-origin-as-secure\n` +
          `2. Change to 'Enabled' & enter: http://${host}:5173\n` +
          `3. Click 'Relaunch' at the bottom of Chrome.\n\n` +
          `Or open the HTTPS URL: https://${host}:5173 !`
        );
        cleanupMediaAndPeer();
        if (onEndCall) onEndCall();
      }
    };

    setupWebRTC();

    return () => {
      isCancelled = true;
    };
  }, [status, callType, isIncoming, peerUser, currentUser, socketRef, onEndCall]);

  // Handle incoming WebRTC signaling messages passed directly from parent via onSignalRef
  const handleSignal = useCallback(async (data) => {
    if (!data) return;
    const pc = peerConnectionRef.current;

    if (data.type === "webrtcOffer" && isIncoming) {
      if (pc) {
        await processOffer(pc, data.offer);
      } else {
        pendingOfferRef.current = data.offer;
      }
    }

    if (data.type === "webrtcAnswer" && pc && !isIncoming) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await processPendingIceCandidates(pc);
      } catch (err) {
        console.error("Error setting WebRTC answer:", err);
      }
    }

    if (data.type === "webrtcIceCandidate") {
      if (pc) {
        await addIceCandidateOrQueue(pc, data.candidate);
      } else {
        pendingIceCandidatesRef.current.push(data.candidate);
      }
    }
  }, [isIncoming]);

  useEffect(() => {
    if (onSignalRef) {
      onSignalRef.current = handleSignal;
    }
    return () => {
      if (onSignalRef) {
        onSignalRef.current = null;
      }
    };
  }, [onSignalRef, handleSignal]);

  // Toggle Microphone Mute
  const handleToggleMic = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicMuted(!audioTrack.enabled);
      }
    }
  };

  // Toggle Camera Off
  const handleToggleCamera = () => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOff(!videoTrack.enabled);
      }
    }
  };

  // Hang Up / End Call
  const handleHangUp = () => {
    cleanupMediaAndPeer();
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: "callEnded",
          to: peerUser,
          from: currentUser,
        })
      );
    }
    if (onEndCall) onEndCall();
  };

  const formatTimer = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // 1. INCOMING RINGING MODAL
  if (isIncoming && status === "ringing") {
    return (
      <div className="call-modal-overlay">
        <div className="call-modal-card call-ringing-card">
          <div className="call-avatar-pulsing">
            {peerAvatar ? (
              <img src={peerAvatar} alt={peerUser} className="call-avatar-img" />
            ) : (
              <span className="call-avatar-text">
                {peerFullName ? peerFullName.charAt(0).toUpperCase() : peerUser.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <h3 className="call-peer-name">{peerFullName || peerUser}</h3>
          <span className="call-peer-handle">@{peerUser}</span>
          <span className="call-type-badge">
            {callType === "video" ? "📹 Incoming Video Call..." : "📞 Incoming Audio Call..."}
          </span>

          <div className="call-actions-row">
            <button
              type="button"
              className="btn-call-decline"
              onClick={() => {
                cleanupMediaAndPeer();
                onDeclineCall();
              }}
              title="Decline Call"
            >
              ❌ Decline
            </button>

            <button
              type="button"
              className="btn-call-accept"
              onClick={onAcceptCall}
              title="Accept Call"
            >
              📞 Accept
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 2. OUTGOING RINGING MODAL
  if (!isIncoming && status === "outgoing") {
    return (
      <div className="call-modal-overlay">
        <div className="call-modal-card call-ringing-card">
          <div className="call-avatar-pulsing">
            {peerAvatar ? (
              <img src={peerAvatar} alt={peerUser} className="call-avatar-img" />
            ) : (
              <span className="call-avatar-text">
                {peerFullName ? peerFullName.charAt(0).toUpperCase() : peerUser.charAt(0).toUpperCase()}
              </span>
            )}
          </div>

          <h3 className="call-peer-name">{peerFullName || peerUser}</h3>
          <span className="call-peer-handle">@{peerUser}</span>
          <span className="call-type-badge">
            {callType === "video" ? "📹 Calling (Video)..." : "📞 Calling (Audio)..."}
          </span>

          <div className="call-actions-row">
            <button
              type="button"
              className="btn-call-hangup"
              onClick={handleHangUp}
              title="Cancel Call"
            >
              🔴 Cancel Call
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 3. ACTIVE CALL SCREEN (AUDIO / VIDEO)
  return (
    <div className="call-modal-overlay active-call-overlay">
      {/* Hidden Audio element for playing remote voice stream across all devices */}
      <audio ref={remoteAudioRef} autoPlay playsInline controls={false} />

      <div className="active-call-container">
        {callType === "video" ? (
          /* VIDEO CALL VIEW */
          <div className="video-streams-wrapper">
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="remote-video-full"
            />

            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="local-video-pip"
            />

            {/* Top Bar Call Timer */}
            <div className="call-top-bar">
              <span className="call-timer-display">⏱️ {formatTimer(callDuration)}</span>
              <span className="call-with-label">Video Call with @{peerUser}</span>
            </div>
          </div>
        ) : (
          /* AUDIO CALL VIEW */
          <div className="audio-call-wrapper">
            <div className="call-avatar-pulsing active-audio-pulse">
              {peerAvatar ? (
                <img src={peerAvatar} alt={peerUser} className="call-avatar-img-large" />
              ) : (
                <span className="call-avatar-text-large">
                  {peerFullName ? peerFullName.charAt(0).toUpperCase() : peerUser.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <h2 className="audio-peer-title">{peerFullName || peerUser}</h2>
            <span className="audio-peer-sub">@{peerUser}</span>
            <div className="audio-timer-badge">⏱️ {formatTimer(callDuration)}</div>
          </div>
        )}

        {/* CALL TOOLBAR CONTROLS */}
        <div className="call-toolbar-floating">
          <button
            type="button"
            className={`btn-toolbar-action ${isMicMuted ? "disabled" : ""}`}
            onClick={handleToggleMic}
            title={isMicMuted ? "Unmute Mic" : "Mute Mic"}
          >
            {isMicMuted ? "🎙️ Muted" : "🎙️ Mic On"}
          </button>

          {callType === "video" && (
            <button
              type="button"
              className={`btn-toolbar-action ${isCameraOff ? "disabled" : ""}`}
              onClick={handleToggleCamera}
              title={isCameraOff ? "Turn Camera On" : "Turn Camera Off"}
            >
              {isCameraOff ? "📹 Cam Off" : "📹 Cam On"}
            </button>
          )}

          <button
            type="button"
            className="btn-toolbar-hangup"
            onClick={handleHangUp}
            title="End Call"
          >
            🔴 End Call
          </button>
        </div>
      </div>
    </div>
  );
};

export default CallModal;
