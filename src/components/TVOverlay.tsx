
import React, { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { QRCodeSVG } from 'qrcode.react';
import { LiveMatchState, Team, Tournament, User, Player } from '../types';
import { ScoreControl } from './ScoreControl';
import { RotationView } from './RotationView';
import { calculateSetWinProbability } from '../services/volleyballPrediction';

interface TVOverlayProps {
  match: LiveMatchState;
  onUpdateMatch?: (updates: Partial<LiveMatchState>) => void;
  teamA: Team;
  teamB: Team;
  swapSides?: boolean;
  tournament?: Tournament | null;
  currentUser?: User | null;
  onExit: () => void;
  onLogout?: () => void;
  onBack?: () => void; // New prop for Viewers to go back to Dashboard
  onNextSet?: () => void;
  nextSetCountdown?: number | null;
  showStatsOverlay?: boolean;
  showScoreboard?: boolean;
  isCloudConnected?: boolean;
  // Control Handlers
  onPoint?: (teamId: string, type: 'attack' | 'block' | 'ace' | 'opponent_error' | 'yellow_card' | 'red_card', playerId?: string) => void;
  onSubtractPoint?: (teamId: string) => void;
  onRequestTimeout?: (teamId: string) => void;
  onRequestSub?: (teamId: string) => void;
  onModifyRotation?: (teamId: string) => void;
  onSetServe?: (teamId: string) => void;
}

const TVOverlay: React.FC<TVOverlayProps> = ({ 
  match, 
  teamA, 
  teamB, 
  swapSides = false,
  tournament,
  currentUser,
  onExit, 
  onNextSet,
  nextSetCountdown,
  showStatsOverlay = false,
  showScoreboard = true,
  isCloudConnected = true,
  onUpdateMatch,
  onPoint,
  onSubtractPoint,
  onRequestTimeout,
  onRequestSub,
  onModifyRotation,
  onSetServe
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isViewer = currentUser?.role === 'VIEWER';
  const isAdmin = currentUser?.role === 'ADMIN' || currentUser?.role?.includes('COACH');

  // PeerJS State
  const isBroadcasting = true; // Hardcoded to true now since toggle was removed
  const [viewerStream, setViewerStream] = useState<MediaStream | null>(null);
  
  // Controls State
  const [showControls, setShowControls] = useState(false);

  // Transition States
  const [stingerAnim, setStingerAnim] = useState<'idle' | 'in' | 'out'>('idle');
  const [boardAnim, setBoardAnim] = useState<'idle' | 'in' | 'out'>('idle');
  const [renderScoreboard, setRenderScoreboard] = useState(showScoreboard);
  const [isConstructing, setIsConstructing] = useState(false);

  // New features state
  const [pointBanner, setPointBanner] = useState<{ text: string, color: string } | null>(null);

  // Set Point / Match Point Logic
  const prevScore = useRef({ a: match.scoreA, b: match.scoreB });
  useEffect(() => {
      // Calculate current wins based ONLY on finished sets
      let calcWinsA = 0; let calcWinsB = 0;
      match.sets.forEach((s, idx) => {
          const isFinished = idx < match.currentSet - 1 || match.status === 'finished' || (match.status === 'finished_set' && idx === match.currentSet - 1);
          if (isFinished) {
              if (s.scoreA > s.scoreB) calcWinsA++;
              else if (s.scoreB > s.scoreA) calcWinsB++;
          }
      });
      const requiredWins = Math.ceil((match.config.maxSets || 3) / 2);
      const isTieBreak = match.currentSet === (match.config.maxSets || 3);
      const targetScore = isTieBreak ? (match.config.tieBreakPoints || 15) : (match.config.pointsPerSet || 25);

      const checkPoint = (currentScoreA: number, currentScoreB: number, prevA: number, prevB: number) => {
          let teamAPoint = (currentScoreA >= targetScore - 1) && (currentScoreA - currentScoreB >= 1);
          let teamBPoint = (currentScoreB >= targetScore - 1) && (currentScoreB - currentScoreA >= 1);

          // Only trigger if it just became point
          let wasTeamAPoint = (prevA >= targetScore - 1) && (prevA - prevB >= 1);
          let wasTeamBPoint = (prevB >= targetScore - 1) && (prevB - prevA >= 1);

          if (teamAPoint && !wasTeamAPoint) {
             const isMatchPoint = calcWinsA === requiredWins - 1;
             setPointBanner({ text: isMatchPoint ? 'PUNTO DE PARTIDO' : 'PUNTO DE SET', color: '#827DFF' });
             setTimeout(() => setPointBanner(null), 3000);
          } else if (teamBPoint && !wasTeamBPoint) {
             const isMatchPoint = calcWinsB === requiredWins - 1;
             setPointBanner({ text: isMatchPoint ? 'PUNTO DE PARTIDO' : 'PUNTO DE SET', color: '#4C8BFF' });
             setTimeout(() => setPointBanner(null), 3000);
          }
      };

      checkPoint(match.scoreA, match.scoreB, prevScore.current.a, prevScore.current.b);
      prevScore.current = { a: match.scoreA, b: match.scoreB };
  }, [match.scoreA, match.scoreB, match.currentSet, match.sets, match.config]);
  // const [showRotationView, setShowRotationView] = useState(false); // Removed, now using activeShowRotation

  // Camera Selection State
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const chromaMode = 'green' as string; // Replaced local state with fallback default
  const [showUI, setShowUI] = useState(true);

  // --- VAR & REPLAY SYSTEM STATE & HOOKS ---
  const [showVarDashboard, setShowVarDashboard] = useState(false);
  const [replayActive, setReplayActive] = useState(false);
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayPlayhead, setReplayPlayhead] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState<number>(0.5); // Default 50% slow motion
  const [activeReplayCamId, setActiveReplayCamId] = useState<string>('sim_halcon'); // Default to our cool hawk eye sim
  const [replayTypeLabel, setReplayTypeLabel] = useState<string>('DESAFÍO VAR');
  const [wirelessCams, setWirelessCams] = useState<{ id: string; label: string; stream: MediaStream }[]>([]);
  const [showQRModal, setShowQRModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const varPeerRef = useRef<Peer | null>(null);
  const replayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraBuffersRef = useRef<{ [camId: string]: ImageData[] }>({});

  // Combined Camera Sources list
  const cameras = React.useMemo(() => {
    const list: any[] = [];
    
    // 1. Local camera
    list.push({
      id: 'local_main',
      label: 'CÁMARA PRINCIPAL (PC)',
      type: 'local',
      status: (!isViewer && !cameraError) ? 'active' : 'inactive'
    });

    // 2. Wireless PeerJS cameras
    wirelessCams.forEach(wc => {
      list.push({
        id: wc.id,
        label: wc.label.toUpperCase(),
        type: 'wireless',
        stream: wc.stream
      });
    });

    // 3. Simulated cameras
    list.push({
      id: 'sim_red',
      label: 'CÁMARA CENTRAL - RED (SIM)',
      type: 'simulated'
    });
    list.push({
      id: 'sim_saque',
      label: 'CÁMARA LATERAL - SAQUE (SIM)',
      type: 'simulated'
    });
    list.push({
      id: 'sim_halcon',
      label: 'CÁMARA LÍNEA - OJO DE HALCÓN (SIM)',
      type: 'simulated'
    });

    return list;
  }, [wirelessCams, isViewer, cameraError]);

  // Helper to draw simulated cameras
  const drawSimulatedFrame = (id: string, ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const now = Date.now();
    
    // Draw background
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, height);

    if (id === 'sim_red') {
      // Court view from top
      ctx.fillStyle = '#1e3a8a'; // Blue court
      ctx.fillRect(10, 10, width - 20, height - 20);
      
      // Net line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(width / 2, 10);
      ctx.lineTo(width / 2, height - 10);
      ctx.stroke();

      // Ball bouncing back and forth
      const ballX = (width / 2) + Math.sin(now / 1200) * (width / 2.8);
      const ballY = (height / 2) + Math.cos(now / 2400) * (height / 5);
      
      ctx.fillStyle = '#eab308'; // Yellow ball
      ctx.beginPath();
      ctx.arc(ballX, ballY, 8, 0, Math.PI * 2);
      ctx.fill();
      
      // Draw simulated players as rectangles
      ctx.fillStyle = '#ef4444'; // Team A block
      ctx.fillRect(width/2 - 20, height/2 - 15, 8, 30);

      ctx.fillStyle = '#3b82f6'; // Team B block
      ctx.fillRect(width/2 + 12, height/2 - 15, 8, 30);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('CAM-2 CENTRAL RED (120 FPS)', 20, 25);

    } else if (id === 'sim_saque') {
      // Side perspective view of court
      ctx.fillStyle = '#ea580c'; // Orange court
      ctx.fillRect(10, 45, width - 20, height - 55);

      // White line of net vertical
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(width / 2, 25);
      ctx.lineTo(width / 2, height - 10);
      ctx.stroke();

      // Net grid
      ctx.strokeStyle = '#cbd5e1';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let y = 25; y < 65; y += 8) {
        ctx.moveTo(width / 2 - 8, y);
        ctx.lineTo(width / 2 + 8, y);
      }
      ctx.stroke();

      // Serve parabola animation
      const cycle = (now % 3500) / 3500; // 0 to 1
      const ballX = 30 + cycle * (width - 60);
      const ballY = height - 30 - Math.sin(cycle * Math.PI) * 80;

      ctx.fillStyle = '#eab308'; // Ball
      ctx.beginPath();
      ctx.arc(ballX, ballY, 7, 0, Math.PI * 2);
      ctx.fill();

      // HUD speed overlay
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`CAM-3 LATERAL (SAQUE)`, 20, 25);
      
      const speed = 92 + Math.floor((Math.sin(now/8000) + 1) * 12);
      ctx.fillText(`VELOCIDAD: ${speed} km/h`, 20, 38);

    } else if (id === 'sim_halcon') {
      // Hawk Eye line collision simulation
      ctx.fillStyle = '#1e3a8a'; // Dark court
      ctx.fillRect(0, 0, width, height);

      // White line (bottom boundary line)
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, height / 2, width, 10);

      // Cycle every 3 seconds
      const cycle = (now % 3000) / 3000;
      let ballY = 0;
      let ballSize = 22;
      let squash = 1;
      let showRipple = false;
      let isBallIn = true;

      // Decide if this drop is IN or OUT
      const isEven = Math.floor(now / 3000) % 2 === 0;
      const targetY = height / 2 + (isEven ? 3 : -20); // Inside boundary line (In) or outside (Out)

      if (cycle < 0.5) {
        // Dropping ball
        const dropProgress = cycle / 0.5;
        ballY = dropProgress * targetY;
        ballSize = 22 - dropProgress * 10;
      } else {
        // Impact ripple / bounce away
        ballY = targetY;
        ballSize = 12;
        squash = 0.6;
        showRipple = true;
        isBallIn = isEven;
      }

      // Draw ripple
      if (showRipple) {
        ctx.strokeStyle = isBallIn ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 2;
        ctx.beginPath();
        const pulse = ((now % 1500) / 1500) * 35;
        ctx.ellipse(width / 2, targetY + 5, pulse, pulse / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Draw ball shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.ellipse(width / 2, targetY + 10, ballSize, ballSize / 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Draw dropping ball
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.ellipse(width / 2, ballY, ballSize, ballSize * squash, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('CAM-4 OJO DE HALCÓN LÍNEA (240 FPS)', 20, 25);
      
      if (showRipple) {
        ctx.fillStyle = isBallIn ? '#22c55e' : '#ef4444';
        ctx.font = 'bold 12px sans-serif';
        ctx.fillText(isBallIn ? 'BALÓN DENTRO' : 'BALÓN FUERA', width - 110, 28);
      }
    }
  };

  // NOTA: El receptor PeerJS para cámaras inalámbricas está alojado exclusivamente
  // en la consola VAR (VARConsole.tsx) para evitar colisiones de ID con el celular transmisor.


  // 2. Rolling Buffer Capture Loop (Captura frames cada 100ms)
  useEffect(() => {
    if (replayActive) return; // Congela el búfer al estar activa la repetición

    const interval = setInterval(() => {
      cameras.forEach(cam => {
        const width = 320;
        const height = 180;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let frameCaptured = false;

        if (cam.type === 'local' && videoRef.current && videoRef.current.srcObject) {
          try {
            ctx.drawImage(videoRef.current, 0, 0, width, height);
            frameCaptured = true;
          } catch(e){}
        } else if (cam.type === 'wireless') {
          const remoteVideo = document.getElementById(`video-wireless-${cam.id}`) as HTMLVideoElement;
          if (remoteVideo && remoteVideo.readyState >= 2) {
            try {
              ctx.drawImage(remoteVideo, 0, 0, width, height);
              frameCaptured = true;
            } catch(e){}
          }
        } else if (cam.type === 'simulated') {
          try {
            drawSimulatedFrame(cam.id, ctx, width, height);
            frameCaptured = true;
          } catch(e){}
        }

        if (frameCaptured) {
          const imgData = ctx.getImageData(0, 0, width, height);
          if (!cameraBuffersRef.current[cam.id]) {
            cameraBuffersRef.current[cam.id] = [];
          }
          cameraBuffersRef.current[cam.id].push(imgData);
          if (cameraBuffersRef.current[cam.id].length > 80) { // 8 segundos (80 frames a 10fps)
            cameraBuffersRef.current[cam.id].shift();
          }
        }
      });
    }, 100);

    return () => clearInterval(interval);
  }, [cameras, replayActive]);

  // 3. Replay Rendering Loop (Dibuja los frames y avanza el playhead)
  useEffect(() => {
    if (!replayActive || !replayCanvasRef.current) return;

    const canvas = replayCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 640;
    canvas.height = 360;

    const renderFrame = () => {
      const buffer = cameraBuffersRef.current[activeReplayCamId];
      if (!buffer || buffer.length === 0) {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.font = '12px monospace';
        ctx.fillText("BÚFER DE REPUESTO VACÍO / CARGANDO...", canvas.width / 2 - 120, canvas.height / 2);
        return;
      }

      const index = Math.min(replayPlayhead, buffer.length - 1);
      const imgData = buffer[index];
      if (imgData) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgData.width;
        tempCanvas.height = imgData.height;
        const tempCtx = tempCanvas.getContext('2d');
        if (tempCtx) {
          tempCtx.putImageData(imgData, 0, 0);
          ctx.drawImage(tempCanvas, 0, 0, canvas.width, canvas.height);
        }
      }
    };

    renderFrame();

    if (!replayPlaying) return;

    const stepMs = 100 / replaySpeed;
    const timer = setTimeout(() => {
      setReplayPlayhead(prev => {
        const buffer = cameraBuffersRef.current[activeReplayCamId];
        const maxLen = buffer ? buffer.length : 80;
        if (prev >= maxLen - 1) {
          return 0; // Bucle infinito
        }
        return prev + 1;
      });
    }, stepMs);

    return () => clearTimeout(timer);
  }, [replayActive, replayPlaying, replayPlayhead, replaySpeed, activeReplayCamId]);

  // PeerJS Logic (Admin - Broadcaster)
  useEffect(() => {
      if (!isAdmin || !isBroadcasting || !videoRef.current || !videoRef.current.srcObject) return;

      const stream = videoRef.current.srcObject as MediaStream;
      const peer = new Peer();

      peer.on('open', (id) => {
          console.log('My peer ID is: ' + id);
          if (onUpdateMatch) {
              onUpdateMatch({ adminPeerId: id });
          }
      });

      peer.on('call', (call) => {
          call.answer(stream); // Answer the call with an A/V stream.
      });

      return () => {
          peer.destroy();
          if (onUpdateMatch) {
             // onUpdateMatch({ adminPeerId: undefined }); // Optional: clear ID on stop
          }
      };
  }, [isAdmin, isBroadcasting, selectedDeviceId]); // Re-run if camera changes

  // PeerJS Logic (Viewer - Receiver)
  useEffect(() => {
      if (!isViewer || !match.adminPeerId || viewerStream) return;

      const peer = new Peer();

      peer.on('open', () => {
          // const conn = peer.connect(match.adminPeerId!); // Not needed for stream only
          const call = peer.call(match.adminPeerId!, new MediaStream()); // Call to get stream

          call.on('stream', (remoteStream) => {
              setViewerStream(remoteStream);
              if (videoRef.current) {
                  videoRef.current.srcObject = remoteStream;
                  videoRef.current.play().catch(e => console.error("Error playing remote stream", e));
              }
          });
      });

      return () => {
          peer.destroy();
      };
  }, [isViewer, match.adminPeerId]);

  // Determine if it's "Pre-Match" based on status
  const isPreMatch = match.status === 'warmup';
  
  // Determine if set is finished
  const isSetFinished = match.status === 'finished_set';

  // Broadcast Settings
  const isVertical = match.tvSettings?.style === 'vertical';

  // Unified Transitions ("Stinger Effect")
  const [visibleState, setVisibleState] = useState({
      showScoreboard,
      showStatsOverlay,
      showRotation: match.showRotation,
      tvSettings: match.tvSettings
  });

  const isTransitioningRef = useRef(false);
  const activePropsRef = useRef({
      showScoreboard,
      showStatsOverlay,
      showRotation: match.showRotation,
      tvSettings: match.tvSettings
  });

  useEffect(() => {
      // Check if any visual setting has changed vs our targeted active props
      const hasChanged = 
          showScoreboard !== activePropsRef.current.showScoreboard ||
          showStatsOverlay !== activePropsRef.current.showStatsOverlay ||
          match.showRotation !== activePropsRef.current.showRotation ||
          JSON.stringify(match.tvSettings) !== JSON.stringify(activePropsRef.current.tvSettings);

      if (hasChanged && !isTransitioningRef.current) {
          isTransitioningRef.current = true;
          
          const oldProps = activePropsRef.current;
          const oldSettings = oldProps.tvSettings;
          const newSettings = match.tvSettings;

          // Determine if we are changing major overlays
          const majorSettingsChanged = 
              oldProps.showStatsOverlay !== showStatsOverlay ||
              oldProps.showRotation !== match.showRotation ||
              oldSettings?.showVersus !== newSettings?.showVersus ||
              oldSettings?.featuredPlayerMode !== newSettings?.featuredPlayerMode ||
              oldSettings?.showFormations !== newSettings?.showFormations ||
              oldSettings?.showRotationMode !== newSettings?.showRotationMode ||
              oldSettings?.showSetStatsExt !== newSettings?.showSetStatsExt ||
              oldSettings?.showMatchStatsExt !== newSettings?.showMatchStatsExt ||
              oldSettings?.showTopPlayersExt !== newSettings?.showTopPlayersExt;

          activePropsRef.current = {
             showScoreboard, showStatsOverlay, showRotation: match.showRotation, tvSettings: match.tvSettings
          };

          const performStateUpdate = () => {
              setVisibleState({
                  showScoreboard,
                  showStatsOverlay,
                  showRotation: match.showRotation,
                  tvSettings: match.tvSettings
              });
              setRenderScoreboard(showScoreboard);
              
              if (showStatsOverlay && !visibleState.showStatsOverlay) {
                  setIsConstructing(true);
                  setTimeout(() => setIsConstructing(false), 500);
              }

              if (showScoreboard && !visibleState.showScoreboard) {
                  setBoardAnim('in');
                  setTimeout(() => setBoardAnim('idle'), 800);
              } else if (!showScoreboard && visibleState.showScoreboard) {
                  setBoardAnim('out');
                  setTimeout(() => setBoardAnim('idle'), 800);
              }
          };

          const runStinger = (callback: () => void) => {
              setStingerAnim('in');
              setTimeout(() => {
                  callback();
                  setStingerAnim('out');
                  setTimeout(() => {
                      setStingerAnim('idle');
                      isTransitioningRef.current = false;
                  }, 500);
              }, 500);
          };

          if (!majorSettingsChanged) {
              // No stinger for minor features
              performStateUpdate();
              isTransitioningRef.current = false;
          } else {
              // Both hiding and showing major overlays should trigger stinger first
              runStinger(() => {
                  performStateUpdate();
              });
          }
      }
  }, [showScoreboard, showStatsOverlay, match.showRotation, match.tvSettings, visibleState]);

  // Use visibleState properties instead of the direct props for UI rendering
  const activeShowStatsOverlay = visibleState.showStatsOverlay;
  const activeShowRotation = visibleState.showRotation;
  const activeTvSettings = visibleState.tvSettings;

  // ... (rest of the code)

  // Enumerate Devices on Mount (Admin Only)
  useEffect(() => {
      if (isViewer) return;
      
      // Check support
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          console.warn("Media Devices API not supported");
          return;
      }

      const getDevices = async () => {
          try {
              // Request permission first to get labels, handle rejection gracefully
              try {
                  const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                  // Stop the stream immediately, we just needed permission
                  stream.getTracks().forEach(track => track.stop());
              } catch (e) {
                  console.warn("Permission check failed, proceeding without labels if possible");
              }
              
              const devices = await navigator.mediaDevices.enumerateDevices();
              const videoInputs = devices.filter(d => d.kind === 'videoinput');
              setVideoDevices(videoInputs);
              if (videoInputs.length > 0 && !selectedDeviceId) {
                  // Prefer back camera if available, otherwise first
                  const backCam = videoInputs.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment'));
                  setSelectedDeviceId(backCam ? backCam.deviceId : videoInputs[0].deviceId);
              }
          } catch (e) {
              console.warn("Error enumerating devices", e);
          }
      };
      getDevices();
  }, [isViewer]);

  // Handle Remote Camera Switch
  useEffect(() => {
     if (activeTvSettings?.forceCameraChangeTrigger) {
         if (videoDevices.length > 1) {
             const currentIndex = videoDevices.findIndex(d => d.deviceId === selectedDeviceId);
             const nextIndex = (currentIndex + 1) % videoDevices.length;
             setSelectedDeviceId(videoDevices[nextIndex].deviceId);
         }
     }
  }, [activeTvSettings?.forceCameraChangeTrigger]);

  // Activate Camera Logic
  useEffect(() => {
    if (isViewer) return; // Skip camera for viewers
    if (chromaMode !== 'none') {
       // Stop any existing stream
       if (videoRef.current && videoRef.current.srcObject) {
         try {
            const oldStream = videoRef.current.srcObject as MediaStream;
            oldStream.getTracks().forEach(track => track.stop());
         } catch(e) { }
         videoRef.current.srcObject = null;
       }
       setCameraError(null);
       return;
    }

    let activeStream: MediaStream | null = null;
    let isMounted = true;

    async function setupCamera() {
      // Reset error state
      setCameraError(null);

      // FORCE STOP previous stream if exists in ref
      if (videoRef.current && videoRef.current.srcObject) {
         try {
            const oldStream = videoRef.current.srcObject as MediaStream;
            oldStream.getTracks().forEach(track => track.stop());
         } catch(e) { /* ignore */ }
         if (videoRef.current) videoRef.current.srcObject = null;
      }

      // Check if API exists
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          if (isMounted) setCameraError("Navegador no soporta cámara o contexto inseguro (HTTPS requerido).");
          return;
      }

      try {
        const constraints: MediaStreamConstraints = {
            video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode: 'environment' }
        };

        // Try high res if possible
        if (!selectedDeviceId) {
             // @ts-ignore
             constraints.video.width = { ideal: 1920 };
             // @ts-ignore
             constraints.video.height = { ideal: 1080 };
        }

        console.log("Requesting camera with constraints:", constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (isMounted) {
            activeStream = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = activeStream;
                await videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
            }
        } else {
            stream.getTracks().forEach(track => track.stop());
        }

      } catch (err) {
        console.warn("High-spec camera failed, trying fallback...", err);
        
        try {
            if (!isMounted) return;
            // Stop any previous stream if it exists (though it shouldn't if we are in catch)
            if (activeStream) {
                activeStream.getTracks().forEach(track => track.stop());
                activeStream = null;
            }
            
            // Wait a bit before retrying to let the hardware release
            await new Promise(resolve => setTimeout(resolve, 500));

            // Fallback 1: Standard VGA
            const fallbackConstraints = { 
                video: { width: 640, height: 480, facingMode: 'environment' } 
            };
            console.log("Trying fallback 1:", fallbackConstraints);
            
            const stream = await navigator.mediaDevices.getUserMedia(fallbackConstraints);
            
            if (isMounted) {
                activeStream = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = activeStream;
                    await videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
                }
            } else {
                stream.getTracks().forEach(track => track.stop());
            }
        } catch (err2: any) {
            console.warn("Fallback 1 failed, trying ultimate fallback...", err2);
            
            try {
                if (!isMounted) return;
                await new Promise(resolve => setTimeout(resolve, 500));
                
                // Fallback 2: Any video source
                const ultimateFallback = { video: true };
                console.log("Trying ultimate fallback:", ultimateFallback);
                
                const stream = await navigator.mediaDevices.getUserMedia(ultimateFallback);
                
                if (isMounted) {
                    activeStream = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = activeStream;
                        await videoRef.current.play().catch(e => console.warn("Autoplay blocked", e));
                    }
                } else {
                    stream.getTracks().forEach(track => track.stop());
                }
            } catch (err3: any) {
                console.error("Critical Camera Error:", err3);
                if (isMounted) {
                    let msg = "No se pudo iniciar la cámara. " + (err3.message || err3.name);
                    if (err3.name === 'NotAllowedError' || err3.name === 'PermissionDeniedError') {
                        msg = "Permiso de cámara denegado. Por favor, habilítalo en la configuración del navegador.";
                    } else if (err3.name === 'NotFoundError' || err3.name === 'DevicesNotFoundError') {
                        msg = "No se encontró ninguna cámara.";
                    } else if (err3.name === 'NotReadableError' || err3.name === 'TrackStartError') {
                        msg = "La cámara está en uso por otra aplicación o no se puede acceder.";
                    }
                    setCameraError(msg);
                }
            }
        }
      }
    }
    
    setupCamera();
    
    return () => {
       isMounted = false;
       if (activeStream) {
         try {
            activeStream.getTracks().forEach(track => track.stop());
         } catch (e) { /* ignore */ }
       }
    };
  }, [isViewer, selectedDeviceId, chromaMode]);

  // Determine match state
  const sets = match.sets || [];
  const requiredWins = Math.ceil(match.config.maxSets / 2);
  
  let winsA = 0; let winsB = 0;
  sets.forEach((s, idx) => {
      const isFinished = idx < match.currentSet - 1 || match.status === 'finished' || (match.status === 'finished_set' && idx === match.currentSet - 1);
      if (isFinished) {
          if (s.scoreA > s.scoreB) winsA++;
          else if (s.scoreB > s.scoreA) winsB++;
      }
  });

  const matchEnded = winsA === requiredWins || winsB === requiredWins;
  const winner = winsA === requiredWins ? teamA : (winsB === requiredWins ? teamB : null);

  // Stats Logic
  const calculateTeamTotal = (teamId: string, type: 'attack' | 'block' | 'ace') => {
      let total = 0;
      // If specific set is selected, only count that set
      const setsToCount = (match.statsSetIndex !== undefined && match.sets[match.statsSetIndex]) 
          ? [match.sets[match.statsSetIndex]] 
          : sets;

      setsToCount.forEach(set => {
          total += (set.history || []).filter(h => h.teamId === teamId && h.type === type).length;
      });
      return total;
  };
  const calculateTeamErrors = (teamId: string) => {
      let total = 0;
      const setsToCount = (match.statsSetIndex !== undefined && match.sets[match.statsSetIndex]) 
          ? [match.sets[match.statsSetIndex]] 
          : sets;

      setsToCount.forEach(set => {
           total += (set.history || []).filter(h => h.teamId !== teamId && h.type === 'opponent_error').length;
      });
      return total;
  };

  const statsA = {
      attacks: calculateTeamTotal(teamA.id, 'attack'),
      blocks: calculateTeamTotal(teamA.id, 'block'),
      aces: calculateTeamTotal(teamA.id, 'ace'),
      errors: calculateTeamErrors(teamA.id)
  };

  const statsB = {
      attacks: calculateTeamTotal(teamB.id, 'attack'),
      blocks: calculateTeamTotal(teamB.id, 'block'),
      aces: calculateTeamTotal(teamB.id, 'ace'),
      errors: calculateTeamErrors(teamB.id)
  };

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end pb-0 font-sans bg-transparent overflow-hidden transition-all duration-300">
      
      {/* Hidden Video Elements for WebRTC Streams */}
      <div className="absolute w-1 h-1 opacity-0 overflow-hidden pointer-events-none">
        {wirelessCams.map((cam) => (
          <video
            key={cam.id}
            id={`video-wireless-${cam.id}`}
            autoPlay
            playsInline
            muted
            ref={(el) => {
              if (el && el.srcObject !== cam.stream) {
                el.srcObject = cam.stream;
                el.play().catch(e => console.warn(e));
              }
            }}
          />
        ))}
      </div>

      {/* --- OFFICIAL VNL CHALLENGER / VAR BROADCAST DISPLAY --- */}
      {match.varChallenge?.isActive && (() => {
        const ch = match.varChallenge!;
        const requestingTeam = ch.requestingTeamId === teamB.id ? teamB : teamA;
        
        return (
          <div className="absolute inset-0 w-full h-full z-[85] flex flex-col items-center justify-between bg-black/90 backdrop-blur-md animate-in fade-in duration-300 pointer-events-auto p-4 md:p-8">
            {/* Top Bar with Tournament Logo and Challenge Header */}
            <div className="w-full max-w-6xl flex items-center justify-between bg-gradient-to-r from-slate-950/95 via-[#0c162c]/95 to-slate-950/95 border border-cyan-500/40 rounded-2xl p-4 md:p-6 shadow-2xl">
              <div className="flex items-center gap-4">
                {tournament?.logoUrl ? (
                  <img src={tournament.logoUrl} alt="Torneo" className="h-12 md:h-16 object-contain drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-cyan-600/30 border border-cyan-400/40 flex items-center justify-center text-cyan-300 font-black text-xl">
                    VAR
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-600 animate-ping"></span>
                    <span className="bg-red-600 text-white font-black text-[10px] md:text-xs px-2.5 py-0.5 rounded uppercase tracking-widest">
                      DESAFÍO VAR EN VIVO
                    </span>
                    <span className="text-cyan-400 font-mono text-xs font-bold uppercase tracking-wider">
                      SISTEMA OFICIAL DE DESAFÍO VAR
                    </span>
                  </div>
                  <h1 className="text-2xl md:text-4xl font-black text-white uppercase italic tracking-wider mt-1 drop-shadow-md">
                    {ch.challengeLabel || 'REVISIÓN DE JUGADA'}
                  </h1>
                </div>
              </div>

              {/* Requesting Team Badge */}
              <div className="flex items-center gap-3 bg-black/60 border border-white/10 rounded-2xl p-2.5 px-4 shadow-inner">
                {requestingTeam.logoUrl && (
                  <img src={requestingTeam.logoUrl} alt={requestingTeam.name} className="w-10 h-10 object-contain" />
                )}
                <div className="text-right">
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                    SOLICITADO POR
                  </span>
                  <span className="text-sm md:text-lg font-black text-white uppercase truncate">
                    {requestingTeam.name}
                  </span>
                </div>
              </div>
            </div>

            {/* Center Content: Dynamic Camera / Replay Frame / Hawk Eye simulation */}
            <div className="relative w-full max-w-5xl flex-1 my-4 flex items-center justify-center rounded-3xl overflow-hidden border-2 border-white/20 bg-slate-950 shadow-[0_0_50px_rgba(0,0,0,0.9)]">
              {ch.replayDataUrl ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <img src={ch.replayDataUrl} alt="Revisión VAR" className="w-full h-full object-contain" />
                  <div className="absolute top-4 left-4 flex flex-col gap-1.5 z-20">
                    <div className="bg-red-600/95 text-white font-mono font-black text-xs px-3 py-1.5 rounded-xl uppercase tracking-wider shadow-lg flex items-center gap-2 border border-red-400">
                      <span className="w-2.5 h-2.5 rounded-full bg-white animate-pulse"></span>
                      REPETICIÓN EN CÁMARA LENTA {Math.round((ch.slowMoSpeed || 0.25) * 100)}%
                    </div>
                    <div className="bg-black/80 backdrop-blur text-cyan-300 font-mono font-bold text-xs px-3 py-1 rounded-lg border border-cyan-500/30 uppercase flex items-center gap-1.5">
                      <span>📹</span> CÁMARA: {ch.cameraLabel || ch.cameraAngle.toUpperCase()}
                    </div>
                  </div>
                  <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_center,transparent_0%,rgba(0,0,0,0.4)_100%)]"></div>
                </div>
              ) : ch.cameraAngle === 'halcon' ? (
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1936] to-[#040915] p-6">
                  {/* High Tech Court Line */}
                  <div className="relative w-full max-w-3xl h-64 border-b-8 border-white flex flex-col items-center justify-end">
                    <div className="absolute inset-0 bg-blue-900/10 pointer-events-none"></div>
                    
                    {/* Ripple on impact */}
                    <div className={`absolute bottom-0 w-32 h-12 border-4 rounded-full animate-ping ${ch.simulatedIn !== false ? 'border-green-400 bg-green-500/20' : 'border-red-500 bg-red-500/20'}`}></div>
                    
                    {/* Volleyball impact */}
                    <div className="relative -mb-4 w-20 h-20 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-500 to-blue-700 border-2 border-white shadow-[0_0_25px_rgba(250,204,21,0.6)] flex items-center justify-center">
                      <span className="text-[10px] font-black text-slate-950 uppercase font-mono">240 FPS</span>
                    </div>
                  </div>

                  {/* Impact Distance Metric */}
                  <div className="mt-8 flex items-center gap-3">
                    <div className={`px-6 py-2 rounded-2xl font-black text-lg md:text-2xl uppercase tracking-widest border-2 shadow-2xl ${
                      ch.simulatedIn !== false 
                        ? 'bg-green-600/30 border-green-400 text-green-300 shadow-[0_0_30px_rgba(34,197,94,0.4)]' 
                        : 'bg-red-600/30 border-red-400 text-red-300 shadow-[0_0_30px_rgba(239,68,68,0.4)]'
                    }`}>
                      {ch.simulatedIn !== false ? '🟢 BALÓN DENTRO (+12 mm)' : '🔴 BALÓN FUERA (-18 mm)'}
                    </div>
                  </div>
                </div>
              ) : ch.cameraAngle === 'wireless' && wirelessCams.length > 0 ? (
                <div className="relative w-full h-full flex items-center justify-center bg-black">
                  <video 
                    autoPlay 
                    playsInline 
                    muted 
                    ref={el => { if (el && el.srcObject !== wirelessCams[0].stream) el.srcObject = wirelessCams[0].stream; }}
                    className="w-full h-full object-contain"
                  />
                  <div className="absolute top-4 left-4 bg-red-600/90 text-white font-mono font-black text-xs px-3 py-1 rounded uppercase tracking-wider">
                    CÁMARA INALÁMBRICA MÓVIL EN VIVO
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex flex-col items-center justify-center bg-gradient-to-b from-[#0a1124] to-[#04060c] p-6 text-center">
                  <div className="text-4xl mb-2">📹</div>
                  <h3 className="text-xl md:text-2xl font-black text-white uppercase tracking-wider">
                    REPETICIÓN EN CÁMARA LENTA {Math.round((ch.slowMoSpeed || 0.25) * 100)}%
                  </h3>
                  <p className="text-slate-400 text-xs md:text-sm max-w-md mt-1 font-mono">
                    ÁNGULO: {ch.cameraAngle === 'attack' ? 'RED Y BLOQUEO' : ch.cameraAngle === 'serve' ? 'LÍNEA DE SAQUE' : ch.cameraAngle === 'timeout' ? 'TIEMPO TÉCNICO Y BANCA' : 'PLANO GENERAL'}
                  </p>
                </div>
              )}
            </div>

            {/* Bottom Verdict Banner */}
            <div className="w-full max-w-4xl flex items-center justify-between bg-slate-950/95 border border-white/20 rounded-2xl p-4 md:p-5 shadow-2xl">
              <div className="flex items-center gap-3">
                <span className="text-2xl">
                  {ch.verdict === 'BALL_IN' ? '🟢' : ch.verdict === 'BALL_OUT' ? '🔴' : ch.verdict === 'CONFIRMED' ? '✅' : ch.verdict === 'TOUCH_NET' ? '🏐' : ch.verdict === 'OVERTURNED' ? '❌' : '⏳'}
                </span>
                <div>
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest block">
                    DECISIÓN ARBITRAL
                  </span>
                  <h3 className="text-lg md:text-2xl font-black text-white uppercase tracking-wide">
                    {ch.verdict === 'BALL_IN' ? 'BALÓN DENTRO - PUNTO ASIGNADO' :
                     ch.verdict === 'BALL_OUT' ? 'BALÓN FUERA - PUNTO ASIGNADO' :
                     ch.verdict === 'CONFIRMED' ? 'DECISIÓN ORIGINAL CONFIRMADA' :
                     ch.verdict === 'TOUCH_NET' ? 'INFRACCIÓN: TOQUE DE RED' :
                     ch.verdict === 'TOUCH_BLOCK' ? 'INFRACCIÓN: TOQUE DE BLOQUEO' :
                     ch.verdict === 'OVERTURNED' ? 'DECISIÓN ARBITRAL REVOCADA' :
                     'REVISIÓN EN PROCESO POR LA MESA DE CONTROL...'}
                  </h3>
                </div>
              </div>

              {onUpdateMatch && (
                <button
                  onClick={() => onUpdateMatch({ varChallenge: { ...ch, isActive: false } })}
                  className="bg-red-600 hover:bg-red-500 text-white font-black text-xs px-4 py-2 rounded-xl uppercase tracking-wider transition cursor-pointer"
                >
                  ✕ Cerrar
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* --- BROADCAST SLOW-MOTION REPLAY DISPLAY (TV MODE / OBS) --- */}
      {replayActive && (
        <div className="absolute inset-0 w-full h-full z-[30] flex flex-col items-center justify-center bg-black animate-in fade-in duration-300">
            {/* Replay Canvas */}
            <canvas 
              ref={replayCanvasRef} 
              className="w-full h-full object-contain select-none"
            />
            
            {/* Sleek TV Broadcast HUD Overlays */}
            <div className="absolute inset-x-0 top-0 p-5 md:p-8 bg-gradient-to-b from-black/90 to-transparent flex justify-between items-start pointer-events-none z-10">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-3.5 h-3.5 rounded-full bg-red-600 animate-pulse shadow-[0_0_12px_#ef4444]"></div>
                  <span className="text-xs md:text-sm font-black tracking-[0.25em] text-red-500 uppercase font-mono">REPETICIÓN EN CURSO</span>
                  <span className="bg-blue-600 text-white text-[9px] font-black font-mono px-2 py-0.5 rounded uppercase tracking-wider">
                    {replayTypeLabel}
                  </span>
                </div>
                <h2 className="text-xl md:text-3xl font-black text-white tracking-wide uppercase italic">
                  {cameras.find(c => c.id === activeReplayCamId)?.label || 'Cámara Seleccionada'}
                </h2>
              </div>

              {/* Status information right-aligned */}
              <div className="flex flex-col items-end gap-1.5 font-mono text-[10px] md:text-xs pointer-events-auto">
                <div className="bg-red-600/90 text-white font-black px-3.5 py-1 rounded-md uppercase tracking-wider flex items-center gap-1.5 shadow-lg border border-red-500/30">
                  <span>🎥</span> CÁMARA LENTA {Math.round(replaySpeed * 100)}%
                </div>
                
                {/* Floating active exit button right on the screen */}
                <button 
                  onClick={() => {
                    setReplayActive(false);
                    setReplayPlaying(false);
                  }}
                  className="mt-1 bg-red-600 hover:bg-red-500 text-white border border-red-500 px-3.5 py-1.5 rounded-lg text-xs font-black tracking-wider uppercase flex items-center gap-1.5 transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95"
                  title="Salir de la repetición y volver al partido en vivo"
                >
                  <span>✕</span> VOLVER AL VIVO
                </button>

                <div className="text-white/60 font-mono tracking-wider mt-1 text-[9px]">
                  BÚFER DE REPUESTO:ÚLTIMOS 8 SEGUNDOS
                </div>
              </div>
            </div>

            {/* Vintage Scanlines / Static Filter */}
            <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-white/5 to-transparent mix-blend-overlay z-[5]"></div>
            <div className="absolute inset-0 pointer-events-none opacity-[0.03] bg-radial-gradient from-white via-black to-black mix-blend-overlay z-[5]"></div>
            
            {/* Big Screen "VAR" HUD Watermark */}
            <div className="absolute inset-x-8 top-1/2 -translate-y-1/2 pointer-events-none flex flex-col items-center justify-center opacity-10 select-none z-0">
                <div className="text-[6rem] md:text-[11rem] font-black text-white italic tracking-[0.2em] leading-none text-center">
                    VAR
                </div>
                <div className="text-xs md:text-lg font-bold text-white tracking-[0.4em] uppercase text-center mt-2">
                    SISTEMA DE VERIFICACIÓN TECNOLÓGICA
                </div>
            </div>

            {/* Bottom Playback HUD Bar for TV view */}
            <div className="absolute inset-x-0 bottom-6 flex justify-center pointer-events-none z-10">
               <div className="bg-black/85 border border-white/10 backdrop-blur-md px-6 py-2.5 rounded-full flex items-center gap-4 text-[11px] font-mono font-bold text-white shadow-2xl pointer-events-auto">
                  <span className="text-slate-400">CUADRO {replayPlayhead + 1}/80</span>
                  <div className="w-44 h-1.5 bg-white/10 rounded-full overflow-hidden relative">
                     <div 
                       className="h-full bg-red-500 rounded-full transition-all duration-75"
                       style={{ width: `${(replayPlayhead / 79) * 100}%` }}
                     />
                  </div>
                  <span className="text-red-400">-{((79 - replayPlayhead) * 0.1).toFixed(1)}s</span>

                  <button 
                    onClick={() => {
                      setReplayActive(false);
                      setReplayPlaying(false);
                    }}
                    className="ml-2 bg-slate-800 hover:bg-red-600 text-white hover:text-white px-3.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer border border-white/10"
                  >
                    CERRAR
                  </button>
               </div>
            </div>
        </div>
      )}

      {/* Background (Chroma Key, Solid Color, or Camera) */}
      {chromaMode !== 'none' ? (
        <div 
          className="absolute inset-0 w-full h-full pointer-events-none" 
          style={{ 
            zIndex: -1, 
            backgroundColor: chromaMode === 'green' ? '#00FF00' : chromaMode === 'magenta' ? '#FF00FF' : '#0d1b2a' 
          }} 
        />
      ) : (!isViewer && !cameraError) || (isViewer && viewerStream) ? (
        <>
            <video 
                ref={videoRef}
                autoPlay 
                playsInline 
                muted={!isViewer}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ zIndex: -1 }} 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" style={{ zIndex: 0 }}></div>
        </>
      ) : (
        <div className={`absolute inset-0 w-full h-full ${isViewer ? 'bg-transparent' : 'bg-corp-bg'}`} style={{ zIndex: -1 }}>
            {/* Viewer Mode: Transparent background for OBS/Overlay usage */}
            {isViewer && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    {/* Optional Placeholder */}
                </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" style={{ zIndex: 0 }}></div>
        </div>
      )}

      {/* --- STINGER TRANSITION OVERLAY --- */}
      {stingerAnim !== 'idle' && (
      <div key={stingerAnim} className={`absolute inset-0 z-50 flex items-center justify-center pointer-events-none rounded-[100%] md:rounded-none ${isVertical ? 'rotate-90' : ''}`}>
          <div 
            style={{ 
                animation: stingerAnim === 'in' 
                    ? 'emphasisIn 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' 
                    : 'emphasisOut 0.5s cubic-bezier(0.2, 0.8, 0.2, 1) forwards' 
            }}
          >
              <div className="flex flex-col items-center">
                  {tournament?.logoUrl ? <img src={tournament.logoUrl} className="w-48 h-48 sm:w-64 sm:h-64 object-contain drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]" /> : <div className="text-[10rem] sm:text-[14rem] drop-shadow-[0_0_30px_rgba(255,255,255,0.5)]">🏐</div>}
              </div>
          </div>
      </div>
      )}


      {/* UI Toggle Button (Always visible but subtle) */}
      {!isViewer && (
        <div className="absolute top-4 right-4 z-[60]">
            <button 
                onClick={() => setShowUI(!showUI)}
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${showUI ? 'bg-white/10 text-white/50 hover:bg-white/20 hover:text-white' : 'bg-red-600 text-white animate-pulse shadow-lg'}`}
                title={showUI ? "Ocultar Interfaz (Modo Limpio)" : "Mostrar Interfaz"}
            >
                {showUI ? '👁️' : '👁️‍🗨️'}
            </button>
        </div>
      )}

      {/* --- HEADER ELEMENTS (TOP LEFT) - NAV BAR --- */}
      {showUI && (
      <div className="absolute top-4 left-4 md:top-6 md:left-6 landscape:top-3 landscape:left-4 landscape:scale-90 flex flex-col gap-3 z-50 items-start transition-all">
          
          {/* NAVIGATION BUTTONS */}
          <div className="flex flex-col gap-2">
              {!isViewer && (
                  // Admin: Back to Controls
                  <div className="flex items-center gap-2">
                    <button 
                        onClick={onExit}
                        className="bg-corp-accent hover:bg-corp-accent-hover text-white px-5 py-3 rounded-lg text-xs font-black transition backdrop-blur-md border border-white/20 uppercase tracking-widest shadow-[0_0_15px_rgba(59,130,246,0.5)] flex items-center gap-2 transform hover:scale-105 active:scale-95"
                    >
                        <span>🎛️</span> Volver
                    </button>
                  </div>
              )}

          </div>

          {/* STATUS BADGES */}
          {!matchEnded && (
              <div className="hidden md:flex gap-2"> 
                  {!isPreMatch && (
                   <div className="bg-black/60 text-white px-3 py-1 rounded font-bold text-sm backdrop-blur-md border border-white/10 uppercase tracking-wider">
                      SET {match.currentSet}
                   </div>
                  )}
                  {!isCloudConnected && (
                      <div className="bg-yellow-500 text-black px-3 py-1 rounded font-bold text-xs uppercase animate-bounce shadow-lg">
                          ⚠️ Sin Conexión
                      </div>
                  )}
                  {/* NEXT SET BUTTON IN OVERLAY */}
                  {isSetFinished && isAdmin && onNextSet && (
                      <button 
                        onClick={onNextSet}
                        className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded font-bold text-xs uppercase animate-pulse shadow-lg flex items-center gap-1"
                      >
                        ▶ Siguiente Set {nextSetCountdown ? `(${nextSetCountdown})` : ''}
                      </button>
                  )}
              </div>
          )}
      </div>
      )}


      {/* --- TOURNAMENT LOGO (TOP RIGHT) --- */}
      {tournament?.logoUrl && activeShowRotation === false && !isPreMatch && renderScoreboard && (
          <div className="absolute top-6 md:top-8 right-6 md:right-8 z-[60] animate-in fade-in zoom-in duration-500 pointer-events-none drop-shadow-[0_0_20px_rgba(255,255,255,0.3)]">
              <img src={tournament.logoUrl} className="h-16 w-16 md:h-20 md:w-20 object-contain" alt="Torneo" />
          </div>
      )}

      {/* --- ROTATION OVERLAY (DETAILED TACTICAL COURT VISUALIZATION) --- */}
      {Boolean(activeShowRotation || activeTvSettings?.showFormations || activeTvSettings?.showRotationMode) && (
          <RotationView 
            teamA={teamA} 
            teamB={teamB} 
            rotationA={match.rotationA} 
            rotationB={match.rotationB} 
            isVertical={isVertical} 
            servingTeamId={match.servingTeamId}
            isBroadcast={true}
            initialTab={
              (typeof activeShowRotation === 'string' && ['both', 'teamA', 'teamB'].includes(activeShowRotation))
                ? (activeShowRotation as 'both' | 'teamA' | 'teamB')
                : (activeTvSettings?.showRotationMode || 'both')
            }
          />
      )}

      {/* --- CONSTRUCTION EFFECT (VNL STYLE - STATS GRID) --- */}
      {isConstructing && (
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl px-2 z-40 pointer-events-none
            ${isVertical ? 'rotate-90 scale-[0.85] origin-center h-[50vh] w-[85vh]' : 'scale-90 md:scale-100'}
        `}>
             <div className="relative w-full h-[400px] flex items-center justify-center">
                
                {/* 1. Main Horizontal Lines (Top/Bottom) - Draw from center out */}
                <div className="absolute top-0 left-1/2 w-full h-[2px] bg-white transform -translate-x-1/2 animate-[slideInLeft_0.4s_ease-out_forwards] origin-center scale-x-0 shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                <div className="absolute bottom-0 left-1/2 w-full h-[2px] bg-white transform -translate-x-1/2 animate-[slideInRight_0.4s_ease-out_forwards] origin-center scale-x-0 shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                
                {/* 2. Main Vertical Lines (Left/Right) - Draw from center out */}
                <div className="absolute left-0 top-1/2 h-full w-[2px] bg-white transform -translate-y-1/2 animate-[scaleY_0.4s_ease-out_0.2s_forwards] origin-center scale-y-0 shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>
                <div className="absolute right-0 top-1/2 h-full w-[2px] bg-white transform -translate-y-1/2 animate-[scaleY_0.4s_ease-out_0.2s_forwards] origin-center scale-y-0 shadow-[0_0_10px_rgba(255,255,255,0.8)]"></div>

                {/* 3. Internal Grid Lines - Creating the "Construction" feel */}
                {/* Horizontal Dividers */}
                <div className="absolute top-1/4 left-0 w-full h-[1px] bg-white/50 animate-[slideInLeft_0.5s_ease-out_0.3s_forwards] origin-left scale-x-0"></div>
                <div className="absolute top-2/4 left-0 w-full h-[1px] bg-white/50 animate-[slideInRight_0.5s_ease-out_0.4s_forwards] origin-right scale-x-0"></div>
                <div className="absolute top-3/4 left-0 w-full h-[1px] bg-white/50 animate-[slideInLeft_0.5s_ease-out_0.5s_forwards] origin-left scale-x-0"></div>

                {/* Vertical Dividers */}
                <div className="absolute top-0 left-1/4 h-full w-[1px] bg-white/50 animate-[scaleY_0.5s_ease-out_0.3s_forwards] origin-top scale-y-0"></div>
                <div className="absolute top-0 left-2/4 h-full w-[1px] bg-white/50 animate-[scaleY_0.5s_ease-out_0.4s_forwards] origin-bottom scale-y-0"></div>
                <div className="absolute top-0 left-3/4 h-full w-[1px] bg-white/50 animate-[scaleY_0.5s_ease-out_0.5s_forwards] origin-top scale-y-0"></div>

                {/* 4. Intersection Flashes */}
                <div className="absolute top-0 left-0 w-2 h-2 bg-white rounded-full animate-[ping_0.3s_ease-out_0.2s_forwards] opacity-0"></div>
                <div className="absolute top-0 right-0 w-2 h-2 bg-white rounded-full animate-[ping_0.3s_ease-out_0.2s_forwards] opacity-0"></div>
                <div className="absolute bottom-0 left-0 w-2 h-2 bg-white rounded-full animate-[ping_0.3s_ease-out_0.2s_forwards] opacity-0"></div>
                <div className="absolute bottom-0 right-0 w-2 h-2 bg-white rounded-full animate-[ping_0.3s_ease-out_0.2s_forwards] opacity-0"></div>

                {/* Central Loading Text */}
                <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-white font-mono text-xs tracking-[0.5em] animate-pulse bg-black/50 px-4 py-1 border border-white/30">CARGANDO ESTADÍSTICAS...</span>
                </div>
             </div>
        </div>
      )}

      {/* --- COMPARATIVE STATS OVERLAY (VNL STYLE) --- */}
      {activeShowStatsOverlay && !matchEnded && !activeShowRotation && (
        <div className={`absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-full max-w-5xl px-2 z-40 transition-transform 
            ${isVertical ? 'rotate-90 scale-[0.85] origin-center h-[50vh] w-[85vh] flex items-center justify-center' : 'scale-90 md:scale-100'}
        `}>
            <div className="relative w-full max-w-3xl mx-auto">
                
                {/* Floating Logo Box - Positioned absolutely to the left of the stats table */}
                <div className="absolute -left-24 top-14 z-30 shadow-2xl hidden md:block">
                    <div className="bg-[#1e3a8a] w-28 h-28 flex items-center justify-center border-4 border-white">
                         {tournament?.logoUrl ? (
                             <img src={tournament.logoUrl} className="w-24 h-24 object-contain" />
                         ) : (
                             <div className="text-white font-black text-center leading-none">
                                 <div className="text-4xl italic">VNL</div>
                                 <div className="text-[9px] tracking-widest uppercase mt-1">Torneo Oficial<br/>Voleibol</div>
                             </div>
                         )}
                    </div>
                </div>
                {/* Mobile Logo - Visible only on small screens, positioned differently or hidden to save space */}
                <div className="absolute -left-4 top-14 z-30 shadow-2xl md:hidden scale-75 origin-right">
                     <div className="bg-[#1e3a8a] w-20 h-20 flex items-center justify-center border-2 border-white">
                         {tournament?.logoUrl ? (
                             <img src={tournament.logoUrl} className="w-16 h-16 object-contain" />
                         ) : (
                             <div className="text-white font-black text-center leading-none">
                                 <div className="text-2xl italic">VNL</div>
                             </div>
                         )}
                    </div>
                </div>

                {/* Main Content Column */}
                <div className="flex flex-col w-full">
                    
                    {/* Top Labels Row */}
                    <div className="flex items-end pl-0 md:pl-0 relative z-20">
                        {(() => {
                            const isGeneral = match.statsSetIndex === undefined;
                            const activeSetLabel = isGeneral ? 'PARTIDO' : `SET ${match.statsSetIndex! + 1}`;
                            const titleLabel = isGeneral ? 'ESTADÍSTICAS DEL PARTIDO' : 'ESTADÍSTICAS DEL SET';
                            return (
                                <>
                                {/* Set Label */}
                                <div className="bg-[#ef4444] text-white h-14 px-8 flex items-center justify-center border-4 border-white border-b-0 shadow-md ml-16 md:ml-0">
                                    <span className="font-black italic text-3xl uppercase tracking-tighter drop-shadow-md">
                                        {activeSetLabel}
                                    </span>
                                </div>

                                {/* Team Stats Label */}
                                <div className="bg-white text-[#1e3a8a] h-10 px-6 flex items-center justify-center border-t-4 border-r-4 border-white shadow-sm mb-0">
                                    <span className="font-black italic text-sm uppercase tracking-widest">
                                        {titleLabel}
                                    </span>
                                </div>
                                </>
                            );
                        })()}
                    </div>

                    {/* Main Stats Container */}
                    <div className="bg-white border-4 border-white shadow-2xl relative z-10">
                        
                        {/* Team Header Row */}
                        <div className="flex h-16 relative border-b-2 border-white">
                            {/* Team A Name Bar */}
                            <div className="flex-1 bg-[#1e3a8a] flex items-center justify-center relative overflow-hidden">
                                <div className="absolute left-0 top-0 bottom-0 w-3 bg-[#facc15]"></div> {/* Yellow Accent */}
                                <span className="text-white font-black italic text-3xl uppercase tracking-tighter z-10 drop-shadow-md">{teamA.name}</span>
                            </div>

                            {/* Scores Center */}
                            <div className="w-40 flex relative z-20">
                                {(() => {
                                    const isGeneral = match.statsSetIndex === undefined;
                                    const scoreA = isGeneral ? winsA : ((match.sets[match.statsSetIndex!]?.scoreA) || 0);
                                    const scoreB = isGeneral ? winsB : ((match.sets[match.statsSetIndex!]?.scoreB) || 0);
                                    return (
                                        <>
                                        <div className="flex-1 bg-[#ef4444] flex items-center justify-center border-r-2 border-white">
                                            <span className="text-white font-black text-4xl">{scoreA}</span>
                                        </div>
                                        <div className="flex-1 bg-[#ef4444] flex items-center justify-center">
                                            <span className="text-white font-black text-4xl">{scoreB}</span>
                                        </div>
                                        </>
                                    );
                                })()}
                            </div>

                            {/* Team B Name Bar */}
                            <div className="flex-1 bg-[#1e3a8a] flex items-center justify-center relative overflow-hidden">
                                <div className="absolute right-0 top-0 bottom-0 w-3 bg-[#ef4444]"></div> {/* Red Accent */}
                                <span className="text-white font-black italic text-3xl uppercase tracking-tighter z-10 drop-shadow-md">{teamB.name}</span>
                            </div>
                        </div>

                        {/* Stats Rows */}
                        <div className="flex flex-col">
                            {[
                                { l: sets.filter(s => s.scoreA > s.scoreB).length, label: 'SETS', r: sets.filter(s => s.scoreB > s.scoreA).length },
                                { l: statsA.attacks, label: 'ATAQUES', r: statsB.attacks },
                                { l: statsA.blocks, label: 'BLOQUEOS', r: statsB.blocks },
                                { l: statsA.aces, label: 'SAQUES ACES', r: statsB.aces },
                                { l: statsA.errors, label: 'ERRORES DEL RIVAL', r: statsB.errors }
                            ].map((row, idx) => (
                                <div key={idx} className={`flex h-12 items-center border-b border-white/10 ${idx % 2 === 0 ? 'bg-[#dc2626]' : 'bg-[#1e3a8a]'}`}>
                                    {/* Team A Value */}
                                    <div className="flex-1 text-center">
                                        <span className="text-white font-black text-2xl drop-shadow-sm">{row.l}</span>
                                    </div>

                                    {/* Label */}
                                    <div className="w-56 text-center">
                                        <span className="text-white font-bold text-base uppercase tracking-widest opacity-100 drop-shadow-md">{row.label}</span>
                                    </div>

                                    {/* Team B Value */}
                                    <div className="flex-1 text-center">
                                        <span className="text-white font-black text-2xl drop-shadow-sm">{row.r}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* --- PRE-MATCH / WARMUP BANNER & TEAM VS (COMPACT MODE) --- */}
      {(isPreMatch || isSetFinished) && !matchEnded && (
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 w-[90%] max-w-4xl z-30 animate-in slide-in-from-bottom-10 duration-700">
             {/* Compact Pre-Match Bar - Allows full camera visibility */}
            <div className="bg-black/70 backdrop-blur-md border border-white/20 rounded-2xl overflow-hidden shadow-2xl flex items-stretch h-20 md:h-24">
                
                {/* Team A */}
                <div className="flex-1 flex items-center justify-end px-4 md:px-6 gap-3 md:gap-4 bg-gradient-to-r from-transparent to-blue-900/30">
                    <h3 className="hidden md:block text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-right leading-none">{teamA.name}</h3>
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-lg p-1 md:p-2 border border-white/10 shadow-lg">
                        {teamA.logoUrl ? (
                            <img src={teamA.logoUrl} className="w-full h-full object-contain" /> 
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-black text-blue-400">{teamA.name[0]}</div>
                        )}
                    </div>
                </div>

                {/* Center VS / Status */}
                <div className="w-32 md:w-40 flex flex-col items-center justify-center bg-black/50 border-x border-white/10 relative">
                     <div className="absolute inset-0 bg-gradient-to-t from-red-900/20 to-transparent animate-pulse"></div>
                     <span className="text-2xl md:text-4xl font-black text-yellow-400 italic drop-shadow-lg">VS</span>
                     <span className="text-[9px] md:text-[10px] font-bold text-white uppercase tracking-widest bg-red-600/80 px-2 py-0.5 rounded mt-1">
                        {isSetFinished ? 'INTERMEDIO' : 'Calentamiento'}
                     </span>
                </div>

                {/* Team B */}
                <div className="flex-1 flex items-center justify-start px-4 md:px-6 gap-3 md:gap-4 bg-gradient-to-l from-transparent to-red-900/30">
                    <div className="w-12 h-12 md:w-16 md:h-16 bg-white/10 rounded-lg p-1 md:p-2 border border-white/10 shadow-lg">
                        {teamB.logoUrl ? (
                            <img src={teamB.logoUrl} className="w-full h-full object-contain" /> 
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-xl font-black text-red-400">{teamB.name[0]}</div>
                        )}
                    </div>
                    <h3 className="hidden md:block text-xl md:text-2xl font-black text-white uppercase italic tracking-tighter text-left leading-none">{teamB.name}</h3>
                </div>

            </div>
          </div>
      )}

      {/* VERSUS OVERLAY (PLAYER vs PLAYER) */}
      {!!activeTvSettings?.showVersus && (() => {
          let pA: typeof teamA.players[0] | undefined = undefined;
          let pB: typeof teamA.players[0] | undefined = undefined;

          // FIRST, calculate scores for ALL players to make informed decisions
          const currSet = match.sets[match.currentSet - 1] || { history: [] };
          const scoresA:Record<string, {pts:number, att:number, blk:number, srv:number, attTot:number}> = {};
          const scoresB:Record<string, {pts:number, att:number, blk:number, srv:number, attTot:number}> = {};
          
          teamA.players.forEach(p => scoresA[p.id] = {pts:0, att:0, blk:0, srv:0, attTot:0 });
          teamB.players.forEach(p => scoresB[p.id] = {pts:0, att:0, blk:0, srv:0, attTot:0 });

          const setHistory = currSet.history || [];
          setHistory.forEach(h => {
              if(h.playerId) {
                  let sc = h.teamId === teamA.id ? scoresA[h.playerId] : scoresB[h.playerId];
                  if(sc) {
                      if(['attack','block','ace'].includes(h.type)) sc.pts++;
                      if(h.type==='attack') { sc.att++; sc.attTot++; }
                      if(h.type==='block') sc.blk++;
                      if(h.type==='ace') sc.srv++;
                  }
              }
          });
          
          if (typeof activeTvSettings.showVersus === 'string' && activeTvSettings.showVersus !== 'auto') {
               const vsOption = activeTvSettings.showVersus;

               if (vsOption.startsWith('pos_')) {
                   // Comparación por POSICIÓN DE CAMPO (P1 a P6 en rotación actual)
                   const posIdx = Math.max(0, Math.min(5, parseInt(vsOption.replace('pos_', '')) - 1));
                   pA = match.rotationA[posIdx] || teamA.players[posIdx] || teamA.players[0];
                   pB = match.rotationB[posIdx] || teamB.players[posIdx] || teamB.players[0];
               } else {
                   // Comparación por ROL / POSICIÓN TÁCTICA (Armador, Opuesto, Punta, Central, Líbero)
                   // "no importa si no está en juego" -> Se busca en toda la plantilla (titulares + banca)
                   const normalizeRole = (r?: string) => {
                       if (!r) return '';
                       const lr = r.toLowerCase();
                       if (lr.includes('armad') || lr.includes('sett')) return 'armador';
                       if (lr.includes('opuest') || lr.includes('oppo')) return 'opuesto';
                       if (lr.includes('punt') || lr.includes('recep') || lr.includes('outs')) return 'punta';
                       if (lr.includes('centr') || lr.includes('midd')) return 'central';
                       if (lr.includes('liber')) return 'libero';
                       return lr;
                   };

                   const targetNorm = normalizeRole(vsOption);
                   let candidatesA = teamA.players.filter(p => normalizeRole(p.role) === targetNorm);
                   let candidatesB = teamB.players.filter(p => normalizeRole(p.role) === targetNorm);
                   
                   // Si hay varios del mismo rol, priorizar al que tenga más puntos anotados
                   candidatesA.sort((a,b) => (scoresA[b.id]?.pts || 0) - (scoresA[a.id]?.pts || 0));
                   candidatesB.sort((a,b) => (scoresB[b.id]?.pts || 0) - (scoresB[a.id]?.pts || 0));
                   
                   pA = candidatesA[0] || teamA.players[0];
                   pB = candidatesB[0] || teamB.players[0];
               }
          } else {
              pA = activeTvSettings.featuredPlayerId ? teamA.players.find(p => p.id === activeTvSettings?.featuredPlayerId) : undefined;
              if (!pA) {
                  pA = teamB.players.find(p => p.id === activeTvSettings?.featuredPlayerId);
                  if (pA) {
                     // Swap if selected player is from team B
                     pB = pA;
                     pA = undefined;
                  }
              }

              // Fallbacks for Player A and B
              if (!pA && !pB) {
                  let bestAId = teamA.players[0]?.id; let maxA = -1;
                  Object.entries(scoresA).forEach(([id, st]) => { if(st.pts > maxA) { maxA=st.pts; bestAId=id; }});
                  pA = teamA.players.find(p => p.id === bestAId) || teamA.players[0];
              }

              if (pA && !pB) {
                  // Find best matching role on Team B
                  const roleMatches = teamB.players.filter(p => p.role === pA?.role);
                  let bestBId = roleMatches[0]?.id || teamB.players[0]?.id; let maxB = -1;
                  roleMatches.forEach(p => { if((scoresB[p.id]?.pts || 0) > maxB) { maxB=(scoresB[p.id]?.pts || 0); bestBId=p.id; }});
                  pB = teamB.players.find(p => p.id === bestBId) || teamB.players[0];
              } else if (pB && !pA) {
                  const roleMatches = teamA.players.filter(p => p.role === pB?.role);
                  let bestAId = roleMatches[0]?.id || teamA.players[0]?.id; let maxA = -1;
                  roleMatches.forEach(p => { if((scoresA[p.id]?.pts || 0) > maxA) { maxA=(scoresA[p.id]?.pts || 0); bestAId=p.id; }});
                  pA = teamA.players.find(p => p.id === bestAId) || teamA.players[0];
              }
          }

          // Selección manual explícita de jugadores para un Versus más preciso
          if (activeTvSettings.versusPlayerAId) {
              const explicitA = teamA.players.find(p => p.id === activeTvSettings.versusPlayerAId);
              if (explicitA) pA = explicitA;
          }
          if (activeTvSettings.versusPlayerBId) {
              const explicitB = teamB.players.find(p => p.id === activeTvSettings.versusPlayerBId);
              if (explicitB) pB = explicitB;
          }

          if (!pA || !pB) return null;


          const stA = scoresA[pA.id] || {pts:0,att:0,blk:0,srv:0,attTot:1};
          const stB = scoresB[pB.id] || {pts:0,att:0,blk:0,srv:0,attTot:1};

          const effA = stA.attTot > 0 ? Math.round((stA.att/stA.attTot)*100) : 0;
          const effB = stB.attTot > 0 ? Math.round((stB.att/stB.attTot)*100) : 0;

          const formatRoleSpanish = (role?: string) => {
              if (!role) return '-';
              const r = role.toLowerCase();
              if (r.includes('armad') || r.includes('sett')) return 'ARMADOR';
              if (r.includes('opuest') || r.includes('oppo')) return 'OPUESTO';
              if (r.includes('centr') || r.includes('midd')) return 'CENTRAL';
              if (r.includes('liber')) return 'LÍBERO';
              if (r.includes('punt') || r.includes('outs') || r.includes('recep')) return 'PUNTA';
              return role.toUpperCase();
          };

          const rows = [
              { label: 'POSICIÓN', l: formatRoleSpanish(pA.role), r: formatRoleSpanish(pB.role) },
              { label: 'EDAD', l: pA.profile?.birthDate ? (new Date().getFullYear() - new Date(pA.profile.birthDate).getFullYear()) : '-', r: pB.profile?.birthDate ? (new Date().getFullYear() - new Date(pB.profile.birthDate).getFullYear()) : '-' },
              { label: 'ESTATURA', l: pA.profile?.height ? pA.profile.height+' cm' : '-', r: pB.profile?.height ? pB.profile.height+' cm' : '-' },
              { label: 'PUNTOS TOTALES', l: stA.pts, r: stB.pts },
              { label: 'EFECTIVIDAD', l: effA+'%', r: effB+'%' },
              { label: 'ATAQUES', l: stA.att, r: stB.att },
              { label: 'BLOQUEOS', l: stA.blk, r: stB.blk },
              { label: 'SAQUES ACES', l: stA.srv, r: stB.srv },
          ];

          return (
          <div className="fixed inset-0 z-50 flex flex-col pointer-events-none items-center justify-center p-2 md:p-6 bg-black/40 backdrop-blur-[2px] animate-in slide-in-from-bottom duration-500">
             <div className="relative flex flex-col items-center w-full max-w-6xl xl:max-w-7xl">
                 {/* ENCABEZADO SUPERIOR */}
                 <div className="flex flex-col items-center mb-3 md:mb-5 drop-shadow-2xl">
                     <span className="text-cyan-400 font-mono text-xs md:text-sm font-bold tracking-[0.3em] uppercase bg-black/60 px-4 py-0.5 rounded-full border border-cyan-500/30 mb-1">
                        VOLEIBOL TV
                     </span>
                     <h2 className="text-3xl md:text-5xl font-black text-white italic tracking-wider uppercase drop-shadow-[0_4px_12px_rgba(0,0,0,0.9)] text-center">
                        CUADRO COMPARATIVO
                     </h2>
                     <div className="flex items-center gap-2 mt-1">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                        <span className="text-white/90 font-bold tracking-[0.25em] text-[10px] md:text-xs uppercase bg-black/60 px-3 py-0.5 rounded-full border border-white/10">
                           SET {match.currentSet}
                        </span>
                     </div>
                 </div>

                 {/* CONTENIDO PRINCIPAL: JUGADOR IZQUIERDO (EXTREMO) | CUADRO COMPARATIVO (CENTRO DESPEJADO) | JUGADOR DERECHO (EXTREMO) */}
                 <div className="flex w-full items-end justify-between h-[52vh] relative px-2">
                     
                     {/* JUGADOR IZQUIERDO (AVANZADO AL EXTREMO IZQUIERDO) */}
                     <div className="w-[25%] md:w-[27%] h-[115%] relative flex flex-col items-center justify-end z-10 shrink-0">
                         {pA.profile?.photoUrl ? (
                            <img 
                               src={pA.profile.photoUrl} 
                               alt={pA.name}
                               className="absolute bottom-0 h-full object-contain mb-10 z-10 drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)] transition-all"
                            />
                         ) : (
                            <div className="absolute bottom-16 w-36 h-36 md:w-48 md:h-48 bg-gradient-to-br from-blue-950 to-slate-900 border-2 border-cyan-400/30 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center z-10">
                                {teamA.logoUrl ? (
                                   <img src={teamA.logoUrl} className="w-full h-full object-cover p-2" alt={teamA.name} />
                                ) : (
                                   <div className="text-cyan-400 font-black text-5xl">{teamA.name.substring(0,3).toUpperCase()}</div>
                                )}
                            </div>
                         )}
                         {/* Placa con Nombre y Rol en el extremo izquierdo */}
                         <div className="w-full max-w-[260px] text-white font-black italic bg-gradient-to-r from-blue-700 via-indigo-700 to-blue-900 px-3 py-2 rounded-t-2xl z-30 shadow-[0_-5px_25px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center border-t-2 border-x border-cyan-400">
                            <span className="text-[10px] md:text-xs font-mono font-bold tracking-wider bg-black/40 px-2 py-0.5 rounded-full text-cyan-300 uppercase mb-0.5">
                               {formatRoleSpanish(pA.role)} #{pA.number}
                            </span>
                            <div className="text-base md:text-xl drop-shadow-md truncate max-w-full uppercase text-center">
                               {pA.name}
                            </div>
                         </div>
                     </div>

                     {/* TABLA CENTRAL: CUADRO COMPARATIVO (100% VISIBLE Y DESPEJADO) */}
                     <div className="w-[48%] md:w-[44%] max-w-xl mx-auto bg-gradient-to-br from-[#120e2e]/98 via-[#0c0a1a]/98 to-[#06050e]/98 rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.95)] border-2 border-white/20 z-20 relative flex flex-col mb-1">
                         {/* Encabezado con Logos y Nombres de Equipo */}
                         <div className="flex justify-between items-center py-2.5 px-4 md:px-6 bg-gradient-to-r from-blue-950/80 via-black/80 to-rose-950/80 border-b border-white/10">
                             <div className="flex items-center gap-2 min-w-0">
                                 <div className="w-9 h-7 md:w-11 md:h-8 rounded bg-white/10 p-0.5 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                     {teamA.logoUrl ? <img src={teamA.logoUrl} className="object-contain h-full w-full" alt="" /> : <span className="font-black text-xs text-cyan-400">{teamA.name.substring(0,3)}</span>}
                                 </div>
                                 <span className="text-white font-black text-xs md:text-sm uppercase italic truncate max-w-[90px] md:max-w-[130px]">
                                     {teamA.name}
                                 </span>
                             </div>

                             <div className="text-[10px] md:text-xs font-mono font-bold text-amber-400 px-2 py-0.5 rounded bg-black/50 border border-amber-400/30 uppercase tracking-widest shrink-0">
                                 VS
                             </div>

                             <div className="flex items-center gap-2 min-w-0 flex-row-reverse">
                                 <div className="w-9 h-7 md:w-11 md:h-8 rounded bg-white/10 p-0.5 border border-white/20 flex items-center justify-center overflow-hidden shrink-0">
                                     {teamB.logoUrl ? <img src={teamB.logoUrl} className="object-contain h-full w-full" alt="" /> : <span className="font-black text-xs text-rose-400">{teamB.name.substring(0,3)}</span>}
                                 </div>
                                 <span className="text-white font-black text-xs md:text-sm uppercase italic truncate max-w-[90px] md:max-w-[130px]">
                                     {teamB.name}
                                 </span>
                             </div>
                         </div>

                         {/* Filas de Estadísticas Comparativas */}
                         <div className="flex flex-col p-2 md:p-3 gap-1">
                             {rows.map((r, i) => (
                                 <div key={i} className="flex font-black text-sm md:text-base h-8 md:h-9 rounded-lg overflow-hidden border border-white/5">
                                     <div className="flex-1 bg-gradient-to-r from-blue-900/60 to-blue-700/80 flex items-center justify-start px-3 md:px-5 text-white drop-shadow-md">
                                         {r.l}
                                     </div>
                                     <div className="w-[36%] md:w-[32%] bg-black/60 flex items-center justify-center text-[#c2bdf0] tracking-wider text-[10px] md:text-xs font-bold uppercase text-center px-1">
                                         {r.label}
                                     </div>
                                     <div className="flex-1 bg-gradient-to-l from-rose-900/60 to-rose-700/80 flex items-center justify-end px-3 md:px-5 text-white drop-shadow-md">
                                         {r.r}
                                     </div>
                                 </div>
                             ))}
                         </div>
                     </div>

                     {/* JUGADOR DERECHO (AVANZADO AL EXTREMO DERECHO) */}
                     <div className="w-[25%] md:w-[27%] h-[115%] relative flex flex-col items-center justify-end z-10 shrink-0">
                         {pB.profile?.photoUrl ? (
                            <img 
                               src={pB.profile.photoUrl} 
                               alt={pB.name}
                               className="absolute bottom-0 h-full object-contain mb-10 z-10 drop-shadow-[0_15px_30px_rgba(0,0,0,0.9)] scale-x-[-1] transition-all"
                            />
                         ) : (
                            <div className="absolute bottom-16 w-36 h-36 md:w-48 md:h-48 bg-gradient-to-br from-rose-950 to-slate-900 border-2 border-rose-400/30 rounded-2xl shadow-2xl overflow-hidden flex items-center justify-center z-10">
                                {teamB.logoUrl ? (
                                   <img src={teamB.logoUrl} className="w-full h-full object-cover p-2" alt={teamB.name} />
                                ) : (
                                   <div className="text-rose-400 font-black text-5xl">{teamB.name.substring(0,3).toUpperCase()}</div>
                                )}
                            </div>
                         )}
                         {/* Placa con Nombre y Rol en el extremo derecho */}
                         <div className="w-full max-w-[260px] text-white font-black italic bg-gradient-to-l from-rose-700 via-pink-700 to-rose-900 px-3 py-2 rounded-t-2xl z-30 shadow-[0_-5px_25px_rgba(0,0,0,0.8)] flex flex-col items-center justify-center border-t-2 border-x border-rose-400">
                            <span className="text-[10px] md:text-xs font-mono font-bold tracking-wider bg-black/40 px-2 py-0.5 rounded-full text-rose-300 uppercase mb-0.5">
                               {formatRoleSpanish(pB.role)} #{pB.number}
                            </span>
                            <div className="text-base md:text-xl drop-shadow-md truncate max-w-full uppercase text-center">
                               {pB.name}
                            </div>
                         </div>
                     </div>

                 </div>
             </div>
          </div>
          );
      })()}

      {/* HAWK EYE EFFECT */}
      {activeTvSettings?.hawkEyeStatus && (
          <div className="absolute bottom-8 left-8 z-40 pointer-events-none flex items-center justify-center animate-in zoom-in slide-in-from-left duration-500">
              <div className="flex flex-col items-center justify-center gap-2 relative z-10 w-[300px] h-[340px] border-2 border-slate-500/50 bg-[#0f111a]/95 shadow-[0_0_30px_rgba(0,0,0,0.9)] rounded-xl overflow-hidden pointer-events-auto">
                  <div className="absolute top-0 w-full h-1 bg-blue-500"></div>
                  
                  <h2 className="text-xl font-black text-white italic tracking-[0.2em] mt-4 mb-2">DESAFÍO VAR</h2>
                  
                  <div className="relative w-[280px] h-[180px] overflow-hidden bg-[#2582b5] rounded border border-white/10 shadow-inner">
                        {/* The Line */}
                        <div className="absolute top-[35%] w-full h-full bg-[#d96a32] border-t-[12px] border-white flex flex-col items-center shadow-[inset_0_10px_20px_rgba(0,0,0,0.2)]"></div>
                        
                        <div className="absolute bottom-[65%] w-full flex justify-center pb-2">
                             <span className="text-white/40 font-black uppercase tracking-[0.3em] text-2xl">FUERA</span>
                        </div>
                        <div className="absolute top-[40%] w-full flex justify-center pt-2">
                             <span className="text-white/40 font-black uppercase tracking-[0.3em] text-2xl">DENTRO</span>
                        </div>

                        {/* The Ball Animation */}
                        {activeTvSettings.hawkEyeStatus === 'in' ? (
                            <>
                                {/* Permanent impact mark */}
                                <div className="absolute w-12 h-6 rounded-[50%] bg-[#22c55e]/60 mix-blend-multiply opacity-0 shadow-[0_0_10px_#4ade80]" style={{top: '32%', left: '42%', animation: 'showMark 2s forwards 0.5s'}}></div>
                                
                                <div className="absolute w-10 h-10 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.8),inset_-2px_-2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center pointer-events-none" style={{animation: 'dropInBall 3s cubic-bezier(0.2, 0, 0.8, 1) forwards'}}>
                                    <div className="w-full h-[1px] bg-black/20 rotate-45"></div>
                                    <div className="w-full h-[1px] bg-black/20 -rotate-45 absolute"></div>
                                </div>
                                <div className="absolute w-12 h-6 border-2 border-white rounded-[50%] opacity-0" style={{top: '32%', left: '42%', animation: 'ripple 1s ease-out 0.5s forwards'}}></div>
                            </>
                        ) : (
                            <>
                                {/* Permanent impact mark */}
                                <div className="absolute w-12 h-6 rounded-[50%] bg-[#ef4444]/60 mix-blend-multiply opacity-0 shadow-[0_0_10px_#ef4444]" style={{top: '20%', left: '55%', animation: 'showMark 2s forwards 0.5s'}}></div>
                                
                                <div className="absolute w-10 h-10 bg-gradient-to-br from-yellow-300 to-yellow-500 rounded-full shadow-[0_10px_20px_rgba(0,0,0,0.8),inset_-2px_-2px_6px_rgba(0,0,0,0.3)] flex items-center justify-center pointer-events-none" style={{animation: 'dropOutBall 3s cubic-bezier(0.2, 0, 0.8, 1) forwards'}}>
                                    <div className="w-full h-[1px] bg-black/20 rotate-45"></div>
                                    <div className="w-full h-[1px] bg-black/20 -rotate-45 absolute"></div>
                                </div>
                                <div className="absolute w-12 h-6 border-2 border-white rounded-[50%] opacity-0" style={{top: '20%', left: '55%', animation: 'ripple 1s ease-out 0.5s forwards'}}></div>
                            </>
                        )}
                        <style>{`
                          @keyframes dropInBall { 
                              0% { top: -20%; left: 120%; transform: scale(3) rotate(0deg); opacity: 0; filter: blur(5px); } 
                              10% { opacity: 1; filter: blur(2px); }
                              45% { top: 32%; left: 45%; transform: scale(0.9) rotate(200deg); filter: blur(0px); }
                              48% { top: 35%; left: 43%; transform: scaleX(1.3) scaleY(0.7) rotate(220deg); filter: blur(0px); }
                              52% { top: 30%; left: 42%; transform: scaleX(0.9) scaleY(1.1) rotate(240deg); filter: blur(1px); }
                              70% { top: -100px; left: -20%; transform: scale(2) rotate(400deg); opacity: 1; filter: blur(3px); }
                              100% { top: -100px; left: -20%; transform: scale(2) rotate(400deg); opacity: 0; }
                          }
                          @keyframes dropOutBall { 
                              0% { top: -20%; left: 120%; transform: scale(3) rotate(0deg); opacity: 0; filter: blur(5px); } 
                              10% { opacity: 1; filter: blur(2px); }
                              45% { top: 20%; left: 57%; transform: scale(0.9) rotate(200deg); filter: blur(0px); }
                              48% { top: 22%; left: 56%; transform: scaleX(1.3) scaleY(0.7) rotate(220deg); filter: blur(0px); }
                              52% { top: 18%; left: 55%; transform: scaleX(0.9) scaleY(1.1) rotate(240deg); filter: blur(1px); }
                              70% { top: -100px; left: 10%; transform: scale(2) rotate(400deg); opacity: 1; filter: blur(3px); }
                              100% { top: -100px; left: 10%; transform: scale(2) rotate(400deg); opacity: 0; }
                          }
                          @keyframes showMark {
                              0% { opacity: 0; transform: scale(0.2); }
                              60% { opacity: 0.8; transform: scale(1.1); }
                              100% { opacity: 0.8; transform: scale(1); }
                          }
                          @keyframes ripple {
                              0% { transform: scale(0.5); opacity: 1; border-width: 4px; }
                              100% { transform: scale(4); opacity: 0; border-width: 0px; }
                          }
                        `}</style>
                  </div>

                  {activeTvSettings.hawkEyeStatus === 'in' ? (
                      <div className="animate-in fade-in zoom-in delay-1000 duration-500 fill-mode-both flex flex-col items-center pb-2 mt-2">
                          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-green-300 to-green-600 drop-shadow-[0_0_20px_rgba(34,197,94,0.8)] leading-none">DENTRO</h1>
                          <p className="text-green-400 font-bold text-xs tracking-[0.3em] mt-1">BALÓN DENTRO</p>
                      </div>
                  ) : (
                      <div className="animate-in fade-in zoom-in delay-1000 duration-500 fill-mode-both flex flex-col items-center pb-2 mt-2">
                          <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-b from-red-400 to-red-600 drop-shadow-[0_0_20px_rgba(220,38,38,0.8)] leading-none">FUERA</h1>
                          <p className="text-red-400 font-bold text-xs tracking-[0.3em] mt-1">BALÓN FUERA</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* FEATURED PLAYER EFFECT */}
      {activeTvSettings?.featuredPlayerId && activeTvSettings.featuredPlayerMode === 'presentation' && (
          <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in zoom-in duration-500">
             {(() => {
                 const player = teamA.players.find(p => p.id === activeTvSettings!.featuredPlayerId) || 
                                teamB.players.find(p => p.id === activeTvSettings!.featuredPlayerId) ||
                                match.rotationA.find(p => p.id === activeTvSettings!.featuredPlayerId) || 
                                match.benchA.find(p => p.id === activeTvSettings!.featuredPlayerId) || 
                                match.rotationB.find(p => p.id === activeTvSettings!.featuredPlayerId) || 
                                match.benchB.find(p => p.id === activeTvSettings!.featuredPlayerId);
                 if (!player) return null;
                 
                 const pTeam = teamA.players.some(p => p.id === player.id) ? teamA : teamB;

                 const isPresentation = activeTvSettings.featuredPlayerMode === 'presentation';

                 // Calculate simplistic stats
                 const acts = match.sets.flatMap(s => s.history).filter(h => h.playerId === player.id);
                 const kills = acts.filter(h => h.type === 'attack').length;
                 const blocks = acts.filter(h => h.type === 'block').length;
                 const aces = acts.filter(h => h.type === 'ace').length;
                 const pts = kills + blocks + aces;

                 return (
                     <div className="w-[90vw] max-w-4xl bg-gradient-to-br from-black/90 to-slate-900 border border-white/20 rounded-2xl shadow-[0_0_50px_rgba(255,255,255,0.1)] overflow-hidden flex relative">
                         {/* Player Image Side */}
                         <div className="w-1/2 relative bg-gray-800 flex items-center justify-center min-h-[400px] border-r border-white/10">
                             {player.profile?.photoUrl ? (
                                 <img src={player.profile.photoUrl} className="absolute w-full h-full object-cover opacity-80 mix-blend-luminosity" />
                             ) : (
                                 <span className="text-[10rem] opacity-20">👤</span>
                             )}
                             <p className="absolute bottom-4 left-4 text-[6rem] font-black text-white/10 italic leading-none">{player.number}</p>
                         </div>
                         
                         {/* Info Side */}
                         <div className="w-1/2 p-8 flex flex-col justify-center">
                             <div className="mb-6">
                                 <h2 className="text-6xl font-black text-white uppercase italic tracking-tighter leading-none">{player.name}</h2>
                                 <p className="text-xl font-bold text-vnl-accent uppercase tracking-widest mt-2">{(() => { const r = (player.role || "").toLowerCase(); if (r.includes("armad") || r.includes("sett")) return "ARMADOR"; if (r.includes("opuest") || r.includes("oppo")) return "OPUESTO"; if (r.includes("centr") || r.includes("midd")) return "CENTRAL"; if (r.includes("liber")) return "LÍBERO"; if (r.includes("punt") || r.includes("outs") || r.includes("recep")) return "PUNTA"; return (player.role || "-").toUpperCase(); })()} | {pTeam.name}</p>
                             </div>
                             
                             {isPresentation ? (
                                 <div className="space-y-4 animate-in slide-in-from-right-8 delay-150">
                                     <div className="bg-white/5 p-4 rounded border-l-4 border-vnl-accent">
                                         <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nacionalidad</p>
                                         <p className="text-2xl font-black text-white">N/A</p>
                                     </div>
                                     <div className="bg-white/5 p-4 rounded border-l-4 border-yellow-500">
                                         <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Altura</p>
                                         <p className="text-2xl font-black text-white">{player.profile?.height || 'N/A'} cm</p>
                                     </div>
                                 </div>
                             ) : (
                                 <div className="grid grid-cols-2 gap-4 animate-in slide-in-from-right-8 delay-150">
                                     <div className="col-span-2 bg-white/5 p-4 rounded border-l-4 border-vnl-accent flex justify-between items-center">
                                         <p className="text-sm text-slate-400 font-bold uppercase tracking-widest">Puntos Totales</p>
                                         <p className="text-4xl font-black text-white">{pts}</p>
                                     </div>
                                     <div className="bg-white/5 p-4 rounded flex flex-col items-center justify-center">
                                         <p className="text-3xl font-black text-white">{kills}</p>
                                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center mt-1">Ataques</p>
                                     </div>
                                     <div className="bg-white/5 p-4 rounded flex flex-col items-center justify-center">
                                         <p className="text-3xl font-black text-white">{blocks}</p>
                                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center mt-1">Bloqueos</p>
                                     </div>
                                     <div className="col-span-2 bg-white/5 p-4 rounded flex flex-col items-center justify-center">
                                         <p className="text-3xl font-black text-white">{aces}</p>
                                         <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center mt-1">Aces</p>
                                     </div>
                                 </div>
                             )}
                         </div>
                         {/* Watermark Logo */}
                         <div className="absolute top-4 right-4 opacity-30">
                             <img src={tournament?.logoUrl} className="w-16 h-16 object-contain grayscale" />
                         </div>
                     </div>
                 );
             })()}
          </div>
      )}





      {/* --- POINT EVOLUTION (TIMELINE & TECHNICAL TIMEOUT SCREEN) --- */}
      {activeTvSettings?.showPointEvolution && (
          <div className="z-40 pointer-events-none">
              {(() => {
                  const evoMode = activeTvSettings?.pointEvolutionMode || 'general';
                  const isTeamTimeout = evoMode === 'teamA' || evoMode === 'teamB';
                  const currSet = match.sets[match.currentSet - 1] || { history: [] };
                  const setHistory = currSet.history || [];

                  // Si es Opción 2: Evolución de puntos en una sola pantalla para Tiempo Técnico (Equipo Izquierdo o Derecho)
                  if (isTeamTimeout) {
                      const isTeamA = evoMode === 'teamA';
                      const fTeam = isTeamA ? teamA : teamB;
                      const fScore = isTeamA ? match.scoreA : match.scoreB;
                      const oppScore = isTeamA ? match.scoreB : match.scoreA;
                      const fTeamActs = setHistory.filter(h => h.teamId === fTeam.id);
                      
                      const kills = fTeamActs.filter(h => h.type === 'attack').length;
                      const blocks = fTeamActs.filter(h => h.type === 'block').length;
                      const aces = fTeamActs.filter(h => h.type === 'ace').length;
                      const oppErrors = setHistory.filter(h => h.teamId !== fTeam.id && h.type === 'opponent_error').length;

                      // Calcular racha reciente de este equipo
                      let streak = 0;
                      for (let i = setHistory.length - 1; i >= 0; i--) {
                          const h = setHistory[i];
                          const whoScored = (h.type === 'opponent_error' || h.type === 'red_card')
                              ? (h.teamId === teamA.id ? teamB.id : teamA.id)
                              : h.teamId;
                          if (whoScored === fTeam.id) streak++;
                          else break;
                      }

                      // Últimos puntos anotados por este equipo
                      const scoringPills = setHistory
                          .filter(h => {
                              const who = (h.type === 'opponent_error' || h.type === 'red_card')
                                  ? (h.teamId === teamA.id ? teamB.id : teamA.id)
                                  : h.teamId;
                              return who === fTeam.id;
                          })
                          .slice(-8)
                          .reverse();

                      return (
                          <div className={`fixed bottom-6 ${isTeamA ? 'left-6' : 'right-6'} w-[360px] md:w-[420px] animate-in slide-in-from-bottom duration-500`}>
                              <div className={`p-4 rounded-2xl border-2 backdrop-blur-xl shadow-[0_20px_50px_rgba(0,0,0,0.9)] flex flex-col gap-3 ${
                                  isTeamA 
                                      ? 'bg-gradient-to-br from-[#0c1c38]/95 via-[#081326]/95 to-[#040814]/95 border-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.35)]'
                                      : 'bg-gradient-to-br from-[#280c20]/95 via-[#1a0816]/95 to-[#080206]/95 border-rose-400/80 shadow-[0_0_25px_rgba(244,63,94,0.35)]'
                              }`}>
                                  {/* Encabezado de Tiempo Técnico */}
                                  <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                                      <div className="flex items-center gap-2.5">
                                          <div className={`w-3 h-3 rounded-full animate-ping ${isTeamA ? 'bg-cyan-400' : 'bg-rose-400'}`}></div>
                                          <div>
                                              <span className={`text-[9px] font-black tracking-widest uppercase px-2 py-0.5 rounded border ${
                                                  isTeamA ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/30' : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                                              }`}>
                                                  ⏱️ TIEMPO TÉCNICO • EVOLUCIÓN
                                              </span>
                                              <h3 className="text-white font-black text-sm md:text-base uppercase tracking-wider truncate mt-0.5">
                                                  {fTeam.name}
                                              </h3>
                                          </div>
                                      </div>
                                      <div className="text-right">
                                          <span className="text-[10px] text-slate-400 font-mono block">MARCADOR SET {match.currentSet}</span>
                                          <span className={`text-2xl font-mono font-black ${isTeamA ? 'text-cyan-300' : 'text-rose-300'}`}>
                                              {fScore} <span className="text-xs text-white/50">- {oppScore}</span>
                                          </span>
                                      </div>
                                  </div>

                                  {/* Cámara para el Tiempo Técnico (Banca y Charla Estratégica) */}
                                  <div className="relative w-full h-32 md:h-36 rounded-xl overflow-hidden border border-white/15 bg-black/60 shadow-inner flex items-center justify-center">
                                      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 bg-black/70 px-2 py-0.5 rounded text-[8px] font-mono font-bold text-yellow-400 border border-yellow-400/30 uppercase">
                                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                          CÁMARA BANCA {fTeam.name.substring(0,3).toUpperCase()}
                                      </div>
                                      <div className="absolute top-2 right-2 z-10 bg-black/70 px-2 py-0.5 rounded text-[8px] font-mono font-bold text-white/80 border border-white/10 uppercase">
                                          CHARLA TÁCTICA
                                      </div>
                                      {/* Canvas simulado o video de tiempo técnico */}
                                      <div className="w-full h-full flex flex-col items-center justify-center p-3 text-center bg-gradient-to-b from-slate-900 via-blue-950/60 to-slate-950">
                                          <div className="text-2xl mb-1">⏱️</div>
                                          <span className="text-xs font-black text-white uppercase tracking-wider">
                                              Instrucciones del Director Técnico
                                          </span>
                                          <span className="text-[9px] text-slate-400 font-mono mt-0.5">
                                              {fTeam.coachName ? `DT: ${fTeam.coachName}` : 'Pizarra de Estrategia'}
                                          </span>
                                      </div>
                                  </div>

                                  {/* Desglose de Puntos del Equipo */}
                                  <div className="grid grid-cols-4 gap-1.5 text-center">
                                      <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                                          <span className="text-xs font-mono font-black text-white block">{kills}</span>
                                          <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider">Ataques</span>
                                      </div>
                                      <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                                          <span className="text-xs font-mono font-black text-white block">{blocks}</span>
                                          <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider">Bloqueos</span>
                                      </div>
                                      <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                                          <span className="text-xs font-mono font-black text-white block">{aces}</span>
                                          <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider">Aces</span>
                                      </div>
                                      <div className="bg-white/5 p-1.5 rounded-lg border border-white/5">
                                          <span className="text-xs font-mono font-black text-white block">{oppErrors}</span>
                                          <span className="text-[8px] text-slate-400 uppercase font-bold tracking-wider">Errores</span>
                                      </div>
                                  </div>

                                  {/* Racha y Últimos Puntos */}
                                  <div className="flex items-center justify-between bg-black/40 px-3 py-1.5 rounded-xl border border-white/5 text-[9px]">
                                      <div className="flex items-center gap-1 text-amber-300 font-bold uppercase">
                                          <span>🔥</span> Racha: {streak > 0 ? `+${streak} pts seguidos` : 'En disputa'}
                                      </div>
                                      <div className="flex items-center gap-1 font-mono text-[8px] text-slate-400">
                                          {scoringPills.slice(0, 4).map((p, idx) => (
                                              <span key={idx} className="bg-white/10 px-1.5 py-0.5 rounded text-white font-bold">
                                                  {p.type === 'attack' ? 'ATK' : p.type === 'block' ? 'BLK' : p.type === 'ace' ? 'ACE' : 'ERR'}
                                              </span>
                                          ))}
                                      </div>
                                  </div>
                              </div>
                          </div>
                      );
                  }

                  // Opción 1: Evolución General durante el partido o set (Ambos Equipos)
                  const timeline: { a: number, b: number, whoScored: string }[] = [];
                  const scoringEvents = setHistory.filter(h => 
                      h.type === 'attack' || h.type === 'block' || h.type === 'ace' || h.type === 'opponent_error' || h.type === 'red_card'
                  );

                  scoringEvents.forEach((h, index) => {
                      const [scoreAStr, scoreBStr] = h.scoreSnapshot.split('-');
                      const newA = parseInt(scoreAStr);
                      const newB = parseInt(scoreBStr);

                      let whoScored = '';
                      const prevA = index > 0 ? timeline[index-1].a : 0;
                      const prevB = index > 0 ? timeline[index-1].b : 0;
                      
                      if (newA > prevA && newB === prevB) {
                          whoScored = teamA.id;
                      } else if (newB > prevB && newA === prevA) {
                          whoScored = teamB.id;
                      } else {
                          if (h.type === 'opponent_error' || h.type === 'red_card') {
                              whoScored = h.teamId === teamA.id ? teamB.id : teamA.id;
                          } else {
                              whoScored = h.teamId;
                          }
                      }
                      timeline.push({ a: newA, b: newB, whoScored });
                  });

                  const maxColumns = 14; 
                  const reversedDisplay = [...timeline].reverse();
                  const historyDisplay = reversedDisplay.slice(0, maxColumns);

                  return (
                      <div className="fixed bottom-4 md:bottom-8 left-1/2 -translate-x-1/2 w-full max-w-5xl flex flex-col pointer-events-none items-center justify-center p-4 bg-transparent animate-in slide-in-from-bottom duration-500">
                         <div className="relative w-full flex flex-col items-center drop-shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                              <div className="bg-gradient-to-r from-slate-950/95 via-[#0c162c]/95 to-slate-950/95 px-5 py-1 rounded-t-xl border-t border-x border-white/20 text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300 flex items-center gap-2">
                                  <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
                                  EVOLUCIÓN GENERAL DE PUNTOS • SET {match.currentSet}
                              </div>
                              <div className="flex flex-col rounded-b-xl overflow-hidden shadow-2xl relative w-full border-2 border-white/10">
                                  <div className="flex h-12 md:h-14 text-white bg-gradient-to-r from-[#82193b] to-[#400e23] border-b border-white/20">
                                      <div className="w-48 flex items-center justify-between px-4 shrink-0">
                                          <div className="w-10 h-6 bg-white flex items-center justify-center overflow-hidden rounded">
                                              {teamA.logoUrl ? <img src={teamA.logoUrl} className="object-cover w-full h-full" alt="" /> : <div className="text-black font-black text-[10px]">{teamA.name.substring(0,3)}</div>}
                                          </div>
                                          <span className="font-black text-2xl md:text-3xl italic tracking-tighter drop-shadow-md truncate max-w-[110px]">{teamA.name}</span>
                                      </div>
                                      <div className="w-16 md:w-20 bg-[#1c38fa] flex items-center justify-center text-2xl md:text-4xl font-black tabular-nums border-x border-white/20 shrink-0 shadow-2xl z-20">
                                          {match.scoreA}
                                      </div>
                                      {historyDisplay.map((pointState, i) => (
                                          <div key={i} className={`flex-1 flex items-center justify-center border-r border-[#ffffff15] text-lg md:text-2xl font-black ${pointState.whoScored === teamA.id ? 'text-white bg-[#ffffff15]' : 'text-white/40'}`}>
                                              {pointState.a}
                                          </div>
                                      ))}
                                      {Array.from({length: Math.max(0, maxColumns - historyDisplay.length)}).map((_, i) => (
                                          <div key={'e'+i} className="flex-1 flex items-center justify-center border-r border-[#ffffff15]"></div>
                                      ))}
                                  </div>

                                  <div className="flex h-12 md:h-14 text-white bg-gradient-to-r from-[#100742] to-[#0a0521]">
                                      <div className="w-48 flex items-center justify-between px-4 shrink-0">
                                          <div className="w-10 h-6 bg-white flex items-center justify-center overflow-hidden rounded">
                                              {teamB.logoUrl ? <img src={teamB.logoUrl} className="object-cover w-full h-full" alt="" /> : <div className="text-black font-black text-[10px]">{teamB.name.substring(0,3)}</div>}
                                          </div>
                                          <span className="font-black text-2xl md:text-3xl italic tracking-tighter drop-shadow-md truncate max-w-[110px]">{teamB.name}</span>
                                      </div>
                                      <div className="w-16 md:w-20 bg-[#1c38fa] flex items-center justify-center text-2xl md:text-4xl font-black tabular-nums border-x border-white/20 shrink-0 shadow-2xl z-20">
                                          {match.scoreB}
                                      </div>
                                      {historyDisplay.map((pointState, i) => (
                                          <div key={i} className={`flex-1 flex items-center justify-center border-r border-[#ffffff15] text-lg md:text-2xl font-black ${pointState.whoScored === teamB.id ? 'text-white bg-[#ffffff15]' : 'text-white/40'}`}>
                                              {pointState.b}
                                          </div>
                                      ))}
                                      {Array.from({length: Math.max(0, maxColumns - historyDisplay.length)}).map((_, i) => (
                                          <div key={'e'+i} className="flex-1 flex items-center justify-center border-r border-[#ffffff15]"></div>
                                      ))}
                                  </div>
                              </div>
                         </div>
                      </div>
                  );
              })()}
          </div>
      )}

      {/* --- RADAR DE SAQUE (SEGÚN JUGADOR EN ROTACIÓN ZONA 1 Y CÁLCULO DE TRAYECTORIA DEL BALÓN) --- */}
      {activeTvSettings?.showServeSpeed && (
          <div className="fixed bottom-28 right-8 z-40 animate-in slide-in-from-right fade-in pointer-events-none">
              {(() => {
                  const isServingTeamA = match.servingTeamId === teamA.id;
                  const sTeam = isServingTeamA ? teamA : teamB;
                  const sRot = isServingTeamA ? match.rotationA : match.rotationB;
                  // En rotación de voleibol, la posición 1 (Zona 1 de saque) es el sacador en turno:
                  const serverPlayer = (sRot && sRot[0]) || sTeam.players[0];

                  const rawNum = serverPlayer?.number;
                  const numVal = typeof rawNum === 'number' ? rawNum : (parseInt(String(rawNum || '7'), 10) || 7);
                  const seed = (numVal * 11 + match.scoreA * 3 + match.scoreB * 7);
                  const isJumpServe = (serverPlayer?.role || '').toLowerCase().includes('punt') || (serverPlayer?.role || '').toLowerCase().includes('opuest');

                  const roleInSpanish = (() => {
                      const r = (serverPlayer?.role || '').toUpperCase();
                      if (r.includes('SET') || r.includes('ARM')) return 'Armador';
                      if (r.includes('OUT') || r.includes('PUNT')) return 'Punta Receptor';
                      if (r.includes('MID') || r.includes('CENT')) return 'Central';
                      if (r.includes('OPP') || r.includes('OPU')) return 'Opuesto';
                      if (r.includes('LIB')) return 'Líbero';
                      return serverPlayer?.role || 'Jugador';
                  })();

                  // Cálculo físico de trayectoria del balón:
                  // Distancia: desde detrás de la línea de saque (0m), sobre la red (a 9m, altura 2.43m) hacia la zona de recepción rival (~15.2m a 16.6m)
                  const flightDistance = 15.2 + (seed % 14) * 0.1;
                  const flightTime = isJumpServe ? (0.45 + (seed % 5) * 0.01) : (0.58 + (seed % 7) * 0.01);
                  const calculatedSpeed = ((flightDistance / flightTime) * 3.6).toFixed(1);

                  return (
                      <div className="bg-gradient-to-br from-[#071322]/98 via-[#040a14]/98 to-slate-950/98 border-2 border-emerald-400/80 rounded-2xl shadow-[0_0_40px_rgba(16,185,129,0.35)] p-4 w-72 md:w-80 backdrop-blur-xl flex flex-col gap-2.5">
                          {/* Encabezado: Radar & Equipo */}
                          <div className="flex justify-between items-center border-b border-white/10 pb-2">
                              <div className="flex items-center gap-1.5">
                                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
                                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest font-mono">
                                      RADAR DE SAQUE • ZONA 1
                                  </span>
                              </div>
                              <span className="text-[9px] font-bold text-slate-400 uppercase font-mono">
                                  {sTeam.name.substring(0,4)}
                              </span>
                          </div>

                          {/* Jugador en Rotación (Sacador Oficial) */}
                          <div className="flex items-center gap-3 bg-black/50 p-2 rounded-xl border border-white/10">
                              <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border-2 border-emerald-400 shrink-0 flex items-center justify-center font-black text-white text-lg shadow-md">
                                  {serverPlayer?.profile?.photoUrl ? (
                                      <img src={serverPlayer.profile.photoUrl} alt={serverPlayer.name} className="w-full h-full object-cover" />
                                  ) : (
                                      <span>#{serverPlayer?.number || '1'}</span>
                                  )}
                              </div>
                              <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1">
                                      <span className="text-[8px] font-mono font-bold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30 uppercase">
                                          ZONA 1
                                      </span>
                                      <span className="text-[8px] text-slate-400 font-bold uppercase truncate">
                                          {roleInSpanish}
                                      </span>
                                  </div>
                                  <h4 className="text-sm font-black text-white uppercase truncate tracking-wide mt-0.5">
                                      {serverPlayer?.name || 'Sacador'}
                                  </h4>
                              </div>
                          </div>

                          {/* Velocidad Medida */}
                          <div className="flex items-baseline justify-between px-1">
                              <div className="flex items-baseline gap-1.5">
                                  <span className="text-4xl md:text-5xl font-black text-white italic drop-shadow-[0_0_15px_rgba(52,211,153,0.5)] tracking-tighter">
                                      {calculatedSpeed}
                                  </span>
                                  <span className="text-emerald-400 font-black text-base italic">km/h</span>
                              </div>
                              <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider bg-white/5 px-2 py-1 rounded">
                                  {isJumpServe ? '🚀 Potencia Salto' : '🎯 Flotante Táctico'}
                              </span>
                          </div>

                          {/* Gráfico 3D de Trayectoria del Balón sobre la Red */}
                          <div className="relative w-full h-14 bg-black/60 rounded-xl overflow-hidden border border-white/10 p-1 flex items-end">
                              <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="none">
                                  {/* Línea de suelo */}
                                  <line x1="0" y1="38" x2="100" y2="38" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
                                  {/* Red central (a x=50, altura 2.43m proporcional) */}
                                  <line x1="50" y1="38" x2="50" y2="14" stroke="#ffffff" strokeWidth="2" strokeDasharray="2 1" />
                                  <rect x="48" y="14" width="4" height="2" fill="#ef4444" />
                                  
                                  {/* Trayectoria parabólica del balón */}
                                  <path 
                                      d="M 5,26 Q 50,4 95,36" 
                                      fill="none" 
                                      stroke="#34d399" 
                                      strokeWidth="2" 
                                      strokeDasharray="3 1"
                                  />
                                  {/* Balón animado sobre la trayectoria */}
                                  <circle cx="50" cy="10" r="3" fill="#facc15" stroke="#ffffff" strokeWidth="1" className="animate-pulse" />
                              </svg>
                              <span className="absolute bottom-1 left-2 text-[7px] font-mono text-slate-400">0m (Saque)</span>
                              <span className="absolute top-1 left-1/2 -translate-x-1/2 text-[7px] font-mono text-emerald-400">Red: 2.43m</span>
                              <span className="absolute bottom-1 right-2 text-[7px] font-mono text-slate-400">{flightDistance.toFixed(1)}m</span>
                          </div>

                          {/* Telemetría física de la trayectoria */}
                          <div className="grid grid-cols-3 gap-1 text-[8px] font-mono text-slate-300 text-center bg-black/40 p-1.5 rounded-lg border border-white/5">
                              <div>Dist: <span className="text-white font-bold">{flightDistance.toFixed(1)}m</span></div>
                              <div>Tiempo: <span className="text-white font-bold">{flightTime.toFixed(2)}s</span></div>
                              <div>Red: <span className="text-white font-bold">2.43m</span></div>
                          </div>
                      </div>
                  );
              })()}
          </div>
      )}

      {activeTvSettings?.showSetStatsExt && (
          <div className="fixed inset-0 z-40 flex flex-col pointer-events-none items-center justify-center p-4 bg-transparent animate-in zoom-in duration-500">
             <div className="relative w-full max-w-4xl bg-gradient-to-b from-[#141236]/95 via-[#0d0926]/95 to-[#060417]/95 border-y-4 border-[#38bdf8] rounded-xl overflow-hidden shadow-[0_0_60px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                 <div className="flex flex-col pt-5 pb-4 relative">
                     <div className="absolute top-3 left-6 text-cyan-400 font-black italic text-lg opacity-70 tracking-wider">VOLLEY TV</div>
                     <div className="text-center w-full text-white/80 font-black tracking-[0.3em] text-xs uppercase mb-3">
                         ESTADÍSTICAS DEL SET {match.currentSet} & PREDICCIÓN
                     </div>

                     {/* Teams and Score Header */}
                     <div className="flex items-center justify-between px-8 md:px-14 mb-4">
                         <div className="flex items-center gap-4">
                            <div className="w-14 h-14 bg-black/40 border-2 border-cyan-400/50 rounded-xl shadow-lg overflow-hidden flex items-center justify-center p-1">
                                {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-full h-full object-contain"/> : <div className="text-cyan-300 font-black text-xl">{teamA.name.substring(0,3).toUpperCase()}</div>}
                            </div>
                            <div>
                                <span className="text-4xl md:text-5xl font-black text-white italic tracking-tighter drop-shadow-lg">{teamA.name.substring(0,3).toUpperCase()}</span>
                                <div className="text-[10px] text-cyan-300 font-bold uppercase tracking-widest">{teamA.name}</div>
                            </div>
                         </div>
                         
                         {/* Live Set Score */}
                         <div className="flex flex-col items-center">
                             <div className="text-4xl md:text-6xl font-mono font-black text-white tracking-widest drop-shadow-[0_0_20px_rgba(255,255,255,0.4)]">
                                 {match.scoreA} - {match.scoreB}
                             </div>
                             <div className="text-[10px] font-black uppercase text-slate-400 tracking-widest bg-white/10 px-3 py-0.5 rounded-full mt-1">
                                 SETS: {match.sets.filter(s=>s.scoreA > s.scoreB).length} - {match.sets.filter(s=>s.scoreB > s.scoreA).length}
                             </div>
                         </div>

                         <div className="flex items-center gap-4 text-right flex-row-reverse">
                            <div className="w-14 h-14 bg-black/40 border-2 border-rose-500/50 rounded-xl shadow-lg overflow-hidden flex items-center justify-center p-1">
                                {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-full h-full object-contain"/> : <div className="text-rose-300 font-black text-xl">{teamB.name.substring(0,3).toUpperCase()}</div>}
                            </div>
                            <div>
                                <span className="text-4xl md:text-5xl font-black text-white italic tracking-tighter drop-shadow-lg">{teamB.name.substring(0,3).toUpperCase()}</span>
                                <div className="text-[10px] text-rose-300 font-bold uppercase tracking-widest">{teamB.name}</div>
                            </div>
                         </div>
                     </div>

                     {(() => {
                         const currSet = match.sets[match.currentSet - 1] || { history: [], scoreA: match.scoreA, scoreB: match.scoreB };
                         const setHistory = currSet.history || [];
                         const actsA = setHistory.filter(h => h.teamId === teamA.id);
                         const actsB = setHistory.filter(h => h.teamId === teamB.id);

                         const ptsA = match.scoreA;
                         const ptsB = match.scoreB;

                         const attA = actsA.filter(h => h.type === 'attack').length;
                         const attB = actsB.filter(h => h.type === 'attack').length;

                         const blkA = actsA.filter(h => h.type === 'block').length;
                         const blkB = actsB.filter(h => h.type === 'block').length;

                         const srvA = actsA.filter(h => h.type === 'ace').length;
                         const srvB = actsB.filter(h => h.type === 'ace').length;

                         const errOPA = actsB.filter(h => h.type === 'opponent_error').length;
                         const errOPB = actsA.filter(h => h.type === 'opponent_error').length;

                         const setProb = calculateSetWinProbability({
                             scoreA: ptsA,
                             scoreB: ptsB,
                             currentSet: match.currentSet,
                             maxSets: match.config.maxSets,
                             pointsPerSet: match.config.pointsPerSet,
                             tieBreakPoints: match.config.tieBreakPoints,
                             servingTeamId: match.servingTeamId,
                             teamAId: teamA.id,
                             teamBId: teamB.id,
                             history: setHistory
                         });

                         const rows = [
                             { label: 'PUNTOS TOTALES', l: ptsA, r: ptsB, isTotal: true },
                             { label: 'ATAQUES EFECTIVOS', l: attA, r: attB },
                             { label: 'BLOQUEOS DE PUNTO', l: blkA, r: blkB },
                             { label: 'ACES (SAQUE)', l: srvA, r: srvB },
                             { label: 'ERRORES DEL RIVAL', l: errOPA, r: errOPB },
                         ];

                         return (
                             <>
                             {/* REAL WIN PROBABILITY DISPLAY */}
                             <div className="mx-8 md:mx-14 mb-4 bg-black/50 border border-white/10 rounded-xl p-3 shadow-inner">
                                 <div className="flex justify-between items-center text-xs font-black uppercase tracking-wider mb-1.5">
                                     <div className="flex items-center gap-2 text-cyan-400">
                                         <span className="text-xl font-mono">{setProb.probA}%</span>
                                         <span className="text-[10px] text-white/70">PROB. SET</span>
                                         {setProb.momentum === 'A' && (
                                             <span className="bg-cyan-500/20 text-cyan-300 text-[9px] px-1.5 py-0.5 rounded font-black border border-cyan-500/30">
                                                 🔥 RACHA {setProb.streakA > 0 ? `+${setProb.streakA}` : ''}
                                             </span>
                                         )}
                                     </div>

                                     <div className="text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                         META: {setProb.targetScore} PTS • FALTAN {setProb.pointsNeededA} vs {setProb.pointsNeededB}
                                     </div>

                                     <div className="flex items-center gap-2 text-rose-400 flex-row-reverse">
                                         <span className="text-xl font-mono">{setProb.probB}%</span>
                                         <span className="text-[10px] text-white/70">PROB. SET</span>
                                         {setProb.momentum === 'B' && (
                                             <span className="bg-rose-500/20 text-rose-300 text-[9px] px-1.5 py-0.5 rounded font-black border border-rose-500/30">
                                                 🔥 RACHA {setProb.streakB > 0 ? `+${setProb.streakB}` : ''}
                                             </span>
                                         )}
                                     </div>
                                 </div>

                                 {/* Probability Bar */}
                                 <div className="w-full h-3 bg-black/80 rounded-full overflow-hidden flex border border-white/10 shadow-inner">
                                     <div 
                                         className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-700 shadow-[0_0_12px_rgba(6,182,212,0.6)]" 
                                         style={{ width: `${setProb.probA}%` }}
                                     />
                                     <div 
                                         className="h-full bg-gradient-to-r from-red-500 to-rose-500 transition-all duration-700 shadow-[0_0_12px_rgba(244,63,94,0.6)]" 
                                         style={{ width: `${setProb.probB}%` }}
                                     />
                                 </div>
                             </div>

                             {/* Stats Rows */}
                             <div className="flex flex-col gap-2 px-8 md:px-14 pb-4">
                                 {rows.map((r, idx) => {
                                     const totalShare = r.l + r.r;
                                     const shareL = totalShare > 0 ? Math.round((r.l / totalShare) * 100) : 50;
                                     const shareR = 100 - shareL;

                                     // % of team's total points scored from this category
                                     const pctOfTeamA = ptsA > 0 ? Math.round((r.l / ptsA) * 100) : 0;
                                     const pctOfTeamB = ptsB > 0 ? Math.round((r.r / ptsB) * 100) : 0;

                                     return (
                                         <div key={idx} className="flex justify-center items-center w-full bg-white/[0.03] border border-white/5 rounded-lg py-1.5 px-3">
                                             {/* Team A Side */}
                                             <div className="flex-1 flex justify-end items-center gap-3">
                                                 {!r.isTotal && (
                                                     <span className="text-[10px] text-cyan-300/80 font-mono font-bold bg-cyan-950/60 px-2 py-0.5 rounded border border-cyan-800/40">
                                                         {pctOfTeamA}% pts
                                                     </span>
                                                 )}
                                                 <span className="text-xl font-mono font-black text-white">{r.l}</span>
                                                 <div className="w-24 h-2 bg-black/60 rounded-full overflow-hidden flex justify-end">
                                                     <div className="h-full bg-gradient-to-l from-cyan-400 to-blue-600 rounded-full" style={{ width: `${shareL}%` }}></div>
                                                 </div>
                                             </div>

                                             {/* Label */}
                                             <div className="w-48 text-center text-white/90 font-black tracking-wider text-xs uppercase px-2">
                                                 {r.label}
                                             </div>

                                             {/* Team B Side */}
                                             <div className="flex-1 flex justify-start items-center gap-3">
                                                 <div className="w-24 h-2 bg-black/60 rounded-full overflow-hidden flex justify-start">
                                                     <div className="h-full bg-gradient-to-r from-rose-500 to-red-600 rounded-full" style={{ width: `${shareR}%` }}></div>
                                                 </div>
                                                 <span className="text-xl font-mono font-black text-white">{r.r}</span>
                                                 {!r.isTotal && (
                                                     <span className="text-[10px] text-rose-300/80 font-mono font-bold bg-rose-950/60 px-2 py-0.5 rounded border border-rose-800/40">
                                                         {pctOfTeamB}% pts
                                                     </span>
                                                 )}
                                             </div>
                                         </div>
                                     );
                                 })}
                             </div>
                             </>
                         );
                     })()}
                 </div>
             </div>
          </div>
      )}

      {/* WIN PREDICTION */}
      {activeTvSettings?.showWinPrediction && (
          <div className={`absolute bottom-8 z-40 flex flex-col pointer-events-none items-center justify-center bg-transparent animate-in duration-500 ${
              activeTvSettings?.winPredictionTeam === 'teamA' 
                  ? 'left-8 slide-in-from-left w-[360px]' 
                  : activeTvSettings?.winPredictionTeam === 'teamB'
                  ? 'right-8 slide-in-from-right w-[360px]'
                  : 'right-8 slide-in-from-right w-[360px]'
          }`}>
              {(() => {
                  const currSet = match.sets[match.currentSet - 1] || { history: [], scoreA: match.scoreA, scoreB: match.scoreB };
                  const setHistory = currSet.history || [];
                  const setProb = calculateSetWinProbability({
                      scoreA: match.scoreA,
                      scoreB: match.scoreB,
                      currentSet: match.currentSet,
                      maxSets: match.config.maxSets,
                      pointsPerSet: match.config.pointsPerSet,
                      tieBreakPoints: match.config.tieBreakPoints,
                      servingTeamId: match.servingTeamId,
                      teamAId: teamA.id,
                      teamBId: teamB.id,
                      history: setHistory
                  });

                  const winTeamMode = activeTvSettings?.winPredictionTeam || 'both';

                  // Build SVG trajectory line from actual point evolution in the set
                  const hist = setProb.historyProbabilities;
                  const ptsCount = hist.length;
                  const polyA = ptsCount >= 2 
                      ? hist.map((p: { probA: number }, i: number) => {
                          const x = Math.round((i / (ptsCount - 1)) * 100);
                          const y = Math.round(100 - p.probA); // 100% probA at top (y=0)
                          return `${x},${y}`;
                        }).join(' ')
                      : `0,${100 - setProb.probA} 100,${100 - setProb.probA}`;

                  const polyB = ptsCount >= 2 
                      ? hist.map((p: { probA: number }, i: number) => {
                          const x = Math.round((i / (ptsCount - 1)) * 100);
                          const y = Math.round(p.probA); // 100% probB at bottom (y=0 in inverted)
                          return `${x},${y}`;
                        }).join(' ')
                      : `0,${setProb.probA} 100,${setProb.probA}`;

                  // RENDER SINGLE TEAM VIEW: TEAM A
                  if (winTeamMode === 'teamA') {
                      const isServing = match.servingTeamId === teamA.id;
                      const progressPct = Math.min(100, Math.round((match.scoreA / setProb.targetScore) * 100));
                      return (
                          <div className="relative w-full bg-[#0a0f1d]/95 border-l-4 border-cyan-400 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl border border-white/10">
                              <div className="flex flex-col relative w-full pt-3 pb-3 px-4">
                                  {/* Top Header */}
                                  <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-white/10">
                                      <div className="flex items-center gap-2">
                                          <div className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_10px_#22d3ee]"></div>
                                          <span className="text-[11px] font-black tracking-widest text-white uppercase">PREDICCIÓN SET {match.currentSet}</span>
                                      </div>
                                      <span className="text-[9px] font-black text-cyan-400 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30 uppercase tracking-widest">
                                          {teamA.name}
                                      </span>
                                  </div>

                                  {/* Main probability display for Team A */}
                                  <div className="flex items-center justify-between bg-black/60 rounded-lg p-3 border border-white/5 mb-2.5">
                                      <div className="flex items-center gap-3">
                                          <div className="w-12 h-12 rounded-lg bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center overflow-hidden">
                                              {teamA.logoUrl ? (
                                                  <img src={teamA.logoUrl} alt={teamA.name} className="w-full h-full object-contain p-1" />
                                              ) : (
                                                  <span className="text-xl font-black text-cyan-400">{teamA.name.substring(0, 2).toUpperCase()}</span>
                                              )}
                                          </div>
                                          <div className="flex flex-col">
                                              <span className="text-xs font-black text-white uppercase tracking-wider">{teamA.name}</span>
                                              <span className="text-[10px] text-cyan-300 font-bold mt-0.5 flex items-center gap-1">
                                                  {isServing ? '🏐 Al Saque' : '🛡️ En Recepción'}
                                                  {setProb.status === 'set_point_A' && (
                                                      <span className="text-amber-400 font-black animate-pulse ml-1">★ PUNTO DE SET</span>
                                                  )}
                                              </span>
                                          </div>
                                      </div>
                                      <div className="flex flex-col items-end">
                                          <span className="text-3xl font-mono font-black text-cyan-300 leading-none drop-shadow-[0_0_12px_rgba(34,211,238,0.5)]">
                                              {setProb.probA}%
                                          </span>
                                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-1">PROBABILIDAD</span>
                                      </div>
                                  </div>

                                  {/* Progress bar towards target score */}
                                  <div className="space-y-1 mb-2.5 bg-black/40 p-2.5 rounded-lg border border-white/5">
                                      <div className="flex justify-between text-[10px] font-bold">
                                          <span className="text-slate-300">Marcador Actual: <b className="text-white font-mono">{match.scoreA}</b></span>
                                          <span className="text-slate-400">Meta: <b className="text-cyan-400 font-mono">{setProb.targetScore} pts</b></span>
                                      </div>
                                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                          <div className="h-full bg-gradient-to-r from-cyan-600 to-cyan-400 rounded-full transition-all duration-500 shadow-[0_0_8px_#22d3ee]" style={{ width: `${progressPct}%` }}></div>
                                      </div>
                                      <div className="flex justify-between items-center text-[9px] pt-1 text-slate-400 font-medium">
                                          <span>Faltan <b className="text-cyan-300 font-black">{setProb.pointsNeededA} pts</b> para cerrar</span>
                                          <span>Rival ({teamB.name.substring(0, 3)}): {match.scoreB} pts</span>
                                      </div>
                                  </div>

                                  {/* Mini evolution trajectory */}
                                  <div className="h-10 relative w-full bg-black/50 rounded border border-white/5 overflow-hidden px-1 mb-1.5 flex items-center">
                                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                          <polyline 
                                              points={polyA} 
                                              fill="none" 
                                              stroke="#22d3ee" 
                                              strokeWidth="3" 
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                          />
                                          <circle 
                                              cx={ptsCount >= 2 ? 100 : 50} 
                                              cy={Math.round(100 - setProb.probA)} 
                                              r="4" 
                                              fill="#22d3ee" 
                                              stroke="#ffffff" 
                                              strokeWidth="1.5"
                                          />
                                      </svg>
                                      <div className="absolute left-2 text-[8px] text-cyan-300 font-mono font-bold">TENDENCIA SET</div>
                                  </div>

                                  {/* Status footer */}
                                  <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 font-bold">
                                      <span>Pronóstico en vivo</span>
                                      <span className={setProb.momentum === 'A' ? 'text-cyan-400 font-black flex items-center gap-1' : 'text-slate-400'}>
                                          {setProb.momentum === 'A' ? '🔥 Racha favorable para ganar' : 'En disputa directa'}
                                      </span>
                                  </div>
                              </div>
                          </div>
                      );
                  }

                  // RENDER SINGLE TEAM VIEW: TEAM B
                  if (winTeamMode === 'teamB') {
                      const isServing = match.servingTeamId === teamB.id;
                      const progressPct = Math.min(100, Math.round((match.scoreB / setProb.targetScore) * 100));
                      return (
                          <div className="relative w-full bg-[#120a15]/95 border-r-4 border-rose-500 rounded-xl overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.9)] backdrop-blur-xl border border-white/10">
                              <div className="flex flex-col relative w-full pt-3 pb-3 px-4">
                                  {/* Top Header */}
                                  <div className="flex justify-between items-center mb-2.5 pb-2 border-b border-white/10">
                                      <span className="text-[9px] font-black text-rose-400 bg-rose-950/80 px-2 py-0.5 rounded border border-rose-500/30 uppercase tracking-widest">
                                          {teamB.name}
                                      </span>
                                      <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-black tracking-widest text-white uppercase">PREDICCIÓN SET {match.currentSet}</span>
                                          <div className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-[0_0_10px_#f43f5e]"></div>
                                      </div>
                                  </div>

                                  {/* Main probability display for Team B */}
                                  <div className="flex items-center justify-between bg-black/60 rounded-lg p-3 border border-white/5 mb-2.5">
                                      <div className="flex flex-col">
                                          <span className="text-3xl font-mono font-black text-rose-400 leading-none drop-shadow-[0_0_12px_rgba(244,63,94,0.5)]">
                                              {setProb.probB}%
                                          </span>
                                          <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider mt-1">PROBABILIDAD</span>
                                      </div>
                                      <div className="flex items-center gap-3">
                                          <div className="flex flex-col items-end">
                                              <span className="text-xs font-black text-white uppercase tracking-wider">{teamB.name}</span>
                                              <span className="text-[10px] text-rose-300 font-bold mt-0.5 flex items-center gap-1">
                                                  {setProb.status === 'set_point_B' && (
                                                      <span className="text-amber-400 font-black animate-pulse mr-1">★ PUNTO DE SET</span>
                                                  )}
                                                  {isServing ? '🏐 Al Saque' : '🛡️ En Recepción'}
                                              </span>
                                          </div>
                                          <div className="w-12 h-12 rounded-lg bg-rose-500/20 border border-rose-400/40 flex items-center justify-center overflow-hidden">
                                              {teamB.logoUrl ? (
                                                  <img src={teamB.logoUrl} alt={teamB.name} className="w-full h-full object-contain p-1" />
                                              ) : (
                                                  <span className="text-xl font-black text-rose-400">{teamB.name.substring(0, 2).toUpperCase()}</span>
                                              )}
                                          </div>
                                      </div>
                                  </div>

                                  {/* Progress bar towards target score */}
                                  <div className="space-y-1 mb-2.5 bg-black/40 p-2.5 rounded-lg border border-white/5">
                                      <div className="flex justify-between text-[10px] font-bold">
                                          <span className="text-slate-400">Meta: <b className="text-rose-400 font-mono">{setProb.targetScore} pts</b></span>
                                          <span className="text-slate-300">Marcador Actual: <b className="text-white font-mono">{match.scoreB}</b></span>
                                      </div>
                                      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden relative">
                                          <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 rounded-full transition-all duration-500 shadow-[0_0_8px_#f43f5e]" style={{ width: `${progressPct}%` }}></div>
                                      </div>
                                      <div className="flex justify-between items-center text-[9px] pt-1 text-slate-400 font-medium">
                                          <span>Rival ({teamA.name.substring(0, 3)}): {match.scoreA} pts</span>
                                          <span>Faltan <b className="text-rose-300 font-black">{setProb.pointsNeededB} pts</b> para cerrar</span>
                                      </div>
                                  </div>

                                  {/* Mini evolution trajectory */}
                                  <div className="h-10 relative w-full bg-black/50 rounded border border-white/5 overflow-hidden px-1 mb-1.5 flex items-center">
                                      <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                          <polyline 
                                              points={polyB} 
                                              fill="none" 
                                              stroke="#f43f5e" 
                                              strokeWidth="3" 
                                              strokeLinecap="round"
                                              strokeLinejoin="round"
                                          />
                                          <circle 
                                              cx={ptsCount >= 2 ? 100 : 50} 
                                              cy={Math.round(setProb.probA)} 
                                              r="4" 
                                              fill="#f43f5e" 
                                              stroke="#ffffff" 
                                              strokeWidth="1.5"
                                          />
                                      </svg>
                                      <div className="absolute right-2 text-[8px] text-rose-300 font-mono font-bold">TENDENCIA SET</div>
                                  </div>

                                  {/* Status footer */}
                                  <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 font-bold">
                                      <span className={setProb.momentum === 'B' ? 'text-rose-400 font-black flex items-center gap-1' : 'text-slate-400'}>
                                          {setProb.momentum === 'B' ? '🔥 Racha favorable para ganar' : 'En disputa directa'}
                                      </span>
                                      <span>Pronóstico en vivo</span>
                                  </div>
                              </div>
                          </div>
                      );
                  }

                  // DEFAULT: COMPARATIVE VIEW (BOTH TEAMS)
                  return (
                      <div className="relative w-full bg-[#0d0f1f]/95 border-l-4 border-cyan-400 rounded-xl overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.85)] backdrop-blur-xl border border-white/10">
                          <div className="flex flex-col relative w-full pt-3 pb-2 px-3">
                              {/* Top Bar */}
                              <div className="flex justify-between items-center mb-2">
                                  <div className="flex items-center gap-1.5">
                                      <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_#22d3ee]"></div>
                                      <span className="text-[11px] font-black tracking-widest text-white uppercase">PREDICCIÓN SET {match.currentSet}</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                      META {setProb.targetScore} PTS
                                  </span>
                              </div>

                              {/* Big Live Win Probabilities */}
                              <div className="flex justify-between items-center bg-black/50 rounded-lg p-2.5 mb-2 border border-white/5">
                                  <div className="flex flex-col">
                                      <span className="text-[10px] font-black text-cyan-400 uppercase tracking-wider">{teamA.name.substring(0,4)}</span>
                                      <span className="text-2xl font-mono font-black text-white leading-none mt-0.5">{setProb.probA}%</span>
                                      <span className="text-[8px] text-slate-400 mt-1">Faltan {setProb.pointsNeededA} pts</span>
                                  </div>

                                  {/* Center VS & Score */}
                                  <div className="flex flex-col items-center px-2">
                                      <div className="text-xs font-mono font-black text-white/90 bg-white/10 px-2 py-0.5 rounded">
                                          {match.scoreA} - {match.scoreB}
                                      </div>
                                      {setProb.status === 'set_point_A' && (
                                          <span className="text-[8px] font-black text-amber-400 uppercase mt-1 animate-pulse">PUNTO DE SET A</span>
                                      )}
                                      {setProb.status === 'set_point_B' && (
                                          <span className="text-[8px] font-black text-amber-400 uppercase mt-1 animate-pulse">PUNTO DE SET B</span>
                                      )}
                                      {setProb.servingAdvantage !== 'none' && (
                                          <span className="text-[8px] text-cyan-300 font-bold uppercase mt-0.5">
                                              🏐 Saque {setProb.servingAdvantage === 'A' ? teamA.name.substring(0,3) : teamB.name.substring(0,3)}
                                          </span>
                                      )}
                                  </div>

                                  <div className="flex flex-col items-end">
                                      <span className="text-[10px] font-black text-rose-400 uppercase tracking-wider">{teamB.name.substring(0,4)}</span>
                                      <span className="text-2xl font-mono font-black text-white leading-none mt-0.5">{setProb.probB}%</span>
                                      <span className="text-[8px] text-slate-400 mt-1">Faltan {setProb.pointsNeededB} pts</span>
                                  </div>
                              </div>

                              {/* Real Evolution Graph */}
                              <div className="h-16 relative w-full bg-black/40 rounded border border-white/10 overflow-hidden mb-2 px-1">
                                  {/* 50% guide line */}
                                  <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 border-t border-white/15 border-dashed"></div>

                                  <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                                      <polyline 
                                          points={polyA} 
                                          fill="none" 
                                          stroke="#38bdf8" 
                                          strokeWidth="2.5" 
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                      />
                                      <circle 
                                          cx={ptsCount >= 2 ? 100 : 50} 
                                          cy={Math.round(100 - setProb.probA)} 
                                          r="3.5" 
                                          fill="#22d3ee" 
                                          stroke="#ffffff" 
                                          strokeWidth="1.5"
                                      />
                                  </svg>

                                  <div className="absolute left-1 top-0.5 text-[7px] text-cyan-400 font-bold">100% {teamA.name.substring(0,3)}</div>
                                  <div className="absolute left-1 bottom-0.5 text-[7px] text-rose-400 font-bold">100% {teamB.name.substring(0,3)}</div>
                              </div>

                              {/* Momentum Footer */}
                              <div className="flex justify-between items-center text-[9px] text-slate-400 pt-1 border-t border-white/5 font-bold">
                                  <span>Evolución en vivo del set</span>
                                  {setProb.momentum !== 'neutral' ? (
                                      <span className="text-amber-400 flex items-center gap-1 font-black">
                                          🔥 Racha favorable: {setProb.momentum === 'A' ? teamA.name.substring(0,3) : teamB.name.substring(0,3)}
                                      </span>
                                  ) : (
                                      <span className="text-slate-400">Set equilibrado</span>
                                  )}
                              </div>
                          </div>
                      </div>
                  );
              })()}
          </div>
      )}

      {/* RECEIVER ACCURACY / SERVE ERRORS */}
      {activeTvSettings?.showReceiverAccuracy && (
          <div className="fixed inset-0 z-40 flex flex-col pointer-events-none items-center justify-end pb-32 animate-in slide-in-from-bottom fade-in duration-700">
              <div className="relative border-b-4 border-slate-300 w-full max-w-5xl h-80 bg-[#b29f8a] border-4 border-white shadow-[0_20px_50px_rgba(0,0,0,0.8)] perspective-1000 transform rotate-x-[20deg] flex flex-col items-center overflow-hidden">
                 {/* Court lines */}
                 <div className="absolute inset-4 border-2 border-white"></div>
                 <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 w-full h-1 bg-white z-10 shadow-[0_5px_15px_rgba(0,0,0,0.5)]"></div>
                 <div className="absolute inset-x-4 top-[33%] w-[calc(100%-2rem)] h-1 bg-white/50"></div>
                 <div className="absolute inset-x-4 top-[66%] w-[calc(100%-2rem)] h-1 bg-white/50"></div>
                 <div className="absolute text-[8rem] font-black text-rose-500/20 italic tracking-tighter top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">VOLEIBOL TV</div>
                 
                 {/* 3D Balls (Fake positions for representation, as we don't track XY currently) */}
                 <div className="absolute inset-0">
                     <div className="absolute top-[20%] left-[30%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[25%] left-[40%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[35%] left-[55%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[55%] left-[65%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[50%] left-[45%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[60%] left-[50%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[65%] left-[35%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[80%] left-[45%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                     <div className="absolute top-[40%] left-[80%] w-3 h-3 bg-yellow-400 rounded-full shadow-lg border border-yellow-600"></div>
                 </div>

                 {/* Zone Overlays */}
                 <div className="absolute top-[10%] right-10 bg-[#302766] text-white font-bold px-4 py-1 flex items-center gap-2 border border-blue-400/50 shadow-xl">
                     <span className="text-sm">Zona Externa</span> <span className="text-xl font-black">15%</span>
                 </div>
                 <div className="absolute top-[35%] right-10 bg-[#302766] text-white font-bold px-4 py-1 flex items-center gap-2 border border-blue-400/50 shadow-xl">
                     <span className="text-sm">Zona Media</span> <span className="text-xl font-black">38%</span>
                 </div>
                 <div className="absolute top-[60%] right-10 bg-[#302766] text-white font-bold px-4 py-1 flex items-center gap-2 border border-blue-400/50 shadow-xl">
                     <span className="text-sm">Zona Diana / Objetivo</span> <span className="text-xl font-black">47%</span>
                 </div>
              </div>

              {/* Bottom Label Bar */}
              <div className="relative mt-2 flex bg-indigo-900 shadow-2xl h-12 w-full max-w-4xl text-white font-black items-center overflow-hidden">
                   <div className="flex bg-[#302766] h-full items-center px-6 gap-4">
                       {teamA.logoUrl ? <img src={teamA.logoUrl} className="h-8"/> : <span className="text-2xl">{teamA.name.substring(0,3).toUpperCase()}</span>}
                   </div>
                   <div className="flex-1 text-center bg-transparent items-center justify-center flex flex-col">
                       <span className="text-sm tracking-widest leading-none mt-1">EFECTIVIDAD DE RECEPCIÓN</span>
                       <span className="text-[10px] text-white/50 tracking-widest leading-none mt-1">SEGUNDO CONTACTO / ARMADO</span>
                   </div>
                   <div className="bg-pink-600 h-full w-20 flex items-center justify-center flex-col text-sm tracking-widest leading-none">
                       SET {match.currentSet}
                   </div>
              </div>
          </div>
      )}

      {/* --- MATCH STATISTICS OVERLAY --- */}
      {(activeTvSettings?.showMatchStatsExt || (matchEnded && winner)) ? (
          <div className="relative z-40 w-full max-w-4xl mx-auto mb-10 animate-in slide-in-from-bottom-10 fade-in duration-700 mt-20 md:mt-0">
             <div className="bg-gradient-to-b from-slate-900/95 to-blue-950/95 text-white rounded-xl overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.8)] border border-white/20 backdrop-blur-xl m-4">
                 <div className="bg-gradient-to-r from-blue-600 to-indigo-700 p-4 text-center border-b border-white/10">
                     <h2 className="text-2xl font-black uppercase tracking-widest italic">{matchEnded ? 'RESULTADO FINAL' : 'ESTADÍSTICAS DEL PARTIDO'}</h2>
                 </div>
                 
                 <div className="p-8 flex flex-col items-center">
                     {(matchEnded && winner) && <div className="text-sm font-bold text-blue-200 uppercase tracking-widest mb-4">Ganador del Partido</div>}
                     <div className={`flex items-center gap-6 mb-8 transform scale-125 transition-all`}>
                         {(matchEnded && winner) ? (
                             <>
                                {winner.logoUrl && <img src={winner.logoUrl} className="w-20 h-20 object-contain bg-white rounded-full p-2 shadow-lg" alt="" />}
                                <div className="text-5xl font-black text-white italic drop-shadow-lg uppercase">{winner.name}</div>
                             </>
                         ) : (
                             <>
                                {teamA.logoUrl ? <img src={teamA.logoUrl} className="w-16 h-16 object-contain bg-white rounded-full p-2 shadow-lg" /> : <div className="text-3xl font-black">{teamA.name.substring(0,3).toUpperCase()}</div>}
                                <div className="text-4xl font-black text-white italic drop-shadow-lg uppercase">{teamA.name}</div>
                                <div className="text-4xl text-white/50 px-4">VS</div>
                                <div className="text-4xl font-black text-white italic drop-shadow-lg uppercase">{teamB.name}</div>
                                {teamB.logoUrl ? <img src={teamB.logoUrl} className="w-16 h-16 object-contain bg-white rounded-full p-2 shadow-lg" /> : <div className="text-3xl font-black">{teamB.name.substring(0,3).toUpperCase()}</div>}
                             </>
                         )}
                     </div>
                     
                     <div className="flex gap-2 mb-8">
                         {sets.map((s, i) => {
                             const isSetPlayed = s.scoreA > 0 || s.scoreB > 0 || (i <= match.currentSet - 1);
                             if (!isSetPlayed) return null;
                             return (
                                 <div key={i} className="flex flex-col items-center bg-black/40 px-6 py-4 rounded-xl border-2 border-white/10 shadow-lg">
                                     <div className="text-xs text-gray-400 uppercase font-bold mb-2">Set {i+1}</div>
                                     <div className={`text-4xl font-mono font-black ${matchEnded ? (winner?.id === teamA.id ? (s.scoreA > s.scoreB ? 'text-yellow-400' : 'text-white') : (s.scoreB > s.scoreA ? 'text-yellow-400' : 'text-white')) : 'text-white'}`}>
                                         <span className={s.scoreA > s.scoreB ? 'text-yellow-400 drop-shadow-md' : 'text-white'}>{s.scoreA}</span>
                                         <span className="text-white/30 px-2">-</span>
                                         <span className={s.scoreB > s.scoreA ? 'text-yellow-400 drop-shadow-md' : 'text-white'}>{s.scoreB}</span>
                                     </div>
                                 </div>
                             );
                         })}
                     </div>
                 </div>
             </div>
          </div>
      ) : (
          /* --- SCOREBOARD (RESPONSIVE VERTICAL/HORIZONTAL) --- */
          renderScoreboard && !isPreMatch && !activeShowRotation && (() => {
            const isSelectedTeamA = activeTvSettings?.showTeamStats === teamA.id;
            const isSelectedTeamB = activeTvSettings?.showTeamStats === teamB.id;
            const activeStatTeam = isSelectedTeamA ? teamA : isSelectedTeamB ? teamB : null;
            const isLeftTeamActive = (isSelectedTeamA && !swapSides) || (isSelectedTeamB && swapSides);
            const isRightTeamActive = (isSelectedTeamB && !swapSides) || (isSelectedTeamA && swapSides);

            // Helper para calcular estadísticas en tiempo real y jugadores en juego
            const getTeamDetailedStats = (targetTeam: Team, onCourtRotation: Player[]) => {
                const history = match.sets.flatMap(s => s.history || []).filter(h => h.teamId === targetTeam.id);
                const totalPts = match.sets.reduce((sum, s) => {
                    return sum + (targetTeam.id === teamA.id ? s.scoreA : s.scoreB);
                }, 0) + (targetTeam.id === teamA.id ? match.scoreA : match.scoreB);

                const attacks = history.filter(h => h.type === 'attack').length;
                const oppErrors = match.sets.flatMap(s => s.history || []).filter(h => h.teamId !== targetTeam.id && h.type === 'opponent_error').length;
                const attackTot = attacks + oppErrors;
                const attackPct = attackTot > 0 ? Math.round((attacks / attackTot) * 100) : 0;
                const blocks = history.filter(h => h.type === 'block').length;
                const aces = history.filter(h => h.type === 'ace').length;

                // Conteo de puntos por jugador
                const pScores: Record<string, { pts: number, att: number, blk: number, ace: number }> = {};
                history.forEach(h => {
                    if (h.playerId) {
                        if (!pScores[h.playerId]) pScores[h.playerId] = { pts: 0, att: 0, blk: 0, ace: 0 };
                        if (['attack', 'block', 'ace'].includes(h.type)) pScores[h.playerId].pts++;
                        if (h.type === 'attack') pScores[h.playerId].att++;
                        if (h.type === 'block') pScores[h.playerId].blk++;
                        if (h.type === 'ace') pScores[h.playerId].ace++;
                    }
                });

                // Jugadores actualmente en cancha (rotación) con datos reales
                const inCourt = (onCourtRotation || []).slice(0, 6).map(p => ({
                    player: p,
                    stats: pScores[p.id] || { pts: 0, att: 0, blk: 0, ace: 0 }
                }));

                // Jugador destacado seleccionado por el operador para este equipo
                const targetFeaturedId = targetTeam.id === teamA.id 
                    ? (activeTvSettings?.featuredPlayerAId || (activeTvSettings?.featuredPlayerId && teamA.players.some(p => p.id === activeTvSettings.featuredPlayerId) ? activeTvSettings.featuredPlayerId : undefined))
                    : (activeTvSettings?.featuredPlayerBId || (activeTvSettings?.featuredPlayerId && teamB.players.some(p => p.id === activeTvSettings.featuredPlayerId) ? activeTvSettings.featuredPlayerId : undefined));

                const featured = targetFeaturedId 
                    ? targetTeam.players.find(p => p.id === targetFeaturedId)
                    : null;
                const featuredStats = featured ? (pScores[featured.id] || { pts: 0, att: 0, blk: 0, ace: 0 }) : null;


                // Jugador con más puntos del equipo
                let topPId = '';
                let topPts = 0;
                Object.entries(pScores).forEach(([pId, st]) => {
                    if (st.pts > topPts) { topPts = st.pts; topPId = pId; }
                });
                const topPlayer = targetTeam.players.find(p => p.id === topPId);

                // Jugador a mostrar: el seleccionado manualmente o el top anotador o el primer jugador
                const displayPlayer = featured || topPlayer || (onCourtRotation && onCourtRotation[0]) || targetTeam.players[0] || null;
                const displayStats = displayPlayer 
                    ? (pScores[displayPlayer.id] || { pts: 0, att: 0, blk: 0, ace: 0 }) 
                    : { pts: 0, att: 0, blk: 0, ace: 0 };
                const isManuallySelected = !!featured;

                return { 
                    totalPts, 
                    attacks, 
                    attackPct, 
                    blocks, 
                    aces, 
                    inCourt, 
                    featured, 
                    featuredStats, 
                    topPlayer, 
                    topPts,
                    displayPlayer,
                    displayStats,
                    isManuallySelected
                };
            };

            const leftTeam = swapSides ? teamB : teamA;
            const rightTeam = swapSides ? teamA : teamB;
            const leftRotation = swapSides ? match.rotationB : match.rotationA;
            const rightRotation = swapSides ? match.rotationA : match.rotationB;

            const isTeamASelected = activeTvSettings?.showTeamStats === true || 
                                    activeTvSettings?.showTeamStats === teamA.id || 
                                    activeTvSettings?.showTeamStats === 'team_a' || 
                                    activeTvSettings?.showTeamStats === 'EQ_A';

            const isTeamBSelected = activeTvSettings?.showTeamStats === true || 
                                    activeTvSettings?.showTeamStats === teamB.id || 
                                    activeTvSettings?.showTeamStats === 'team_b' || 
                                    activeTvSettings?.showTeamStats === 'EQ_B';

            const showLeftWing = (leftTeam.id === teamA.id && isTeamASelected) || (leftTeam.id === teamB.id && isTeamBSelected);
            const showRightWing = (rightTeam.id === teamA.id && isTeamASelected) || (rightTeam.id === teamB.id && isTeamBSelected);

            const leftStats = showLeftWing ? getTeamDetailedStats(leftTeam, leftRotation) : null;
            const rightStats = showRightWing ? getTeamDetailedStats(rightTeam, rightRotation) : null;

            return (
              <div className={`relative z-10 transition-all duration-300
                  ${isVertical 
                      ? 'absolute top-0 left-0 h-full w-40 md:w-48 flex items-center justify-center pointer-events-none' 
                      : 'absolute bottom-3 md:bottom-5 left-1/2 -translate-x-1/2 w-full max-w-[480px] sm:max-w-[520px] md:max-w-[560px] px-2 pointer-events-none scale-90 sm:scale-95 lg:scale-100 flex justify-center origin-bottom'
                  }
              `}
              style={(boardAnim === 'in' || boardAnim === 'out') ? {
                  animation: boardAnim === 'in' 
                      ? 'drawBoardIn 0.8s cubic-bezier(0.8, 0, 0.2, 1) forwards' 
                      : 'drawBoardOut 0.8s cubic-bezier(0.8, 0, 0.2, 1) forwards'
              } : {}}
              >
                  
                  <div className={`bg-transparent rounded-none overflow-visible flex flex-col items-center pointer-events-auto shrink-0 relative
                      ${isVertical 
                          ? 'rotate-90 origin-center w-[58vh] max-w-none h-11 md:h-12 shadow-[0_25px_50px_rgba(0,0,0,0.85)]' 
                          : 'w-full h-11 md:h-12 shadow-[0_25px_50px_rgba(0,0,0,0.85)]'
                      }
                  `}>
                      {/* Pestaña superior del torneo */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 bg-gradient-to-r from-slate-950/95 via-[#0b1022]/95 to-slate-950/95 rounded-t-xl px-4 md:px-7 py-0.5 md:py-1 flex items-center gap-2 text-white font-black text-[9px] md:text-[10px] tracking-[0.2em] shadow-xl border-t border-x border-white/15">
                         <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse shadow-[0_0_6px_#ef4444]"></div>
                         <span className="truncate max-w-[150px] md:max-w-[280px]">{tournament?.name || "LIGA PROFESIONAL"}</span>
                         <span className="text-white/30 text-[8px]">|</span>
                         <span className="text-cyan-400 text-[8px] md:text-[9px] font-bold">SET {match.currentSet}</span>
                      </div>
                      
                      {/* Set Point / Match Point Banner */}
                      {pointBanner && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 z-50 pointer-events-none flex flex-col items-center justify-center animate-in slide-in-from-bottom-5 duration-500">
                               <div className="bg-gradient-to-t from-black/95 to-black/75 backdrop-blur-md px-8 md:px-16 py-2 md:py-3.5 rounded-t-[1.25rem] border-t-4 border-x border-white/20 shadow-[0_-20px_50px_rgba(0,0,0,0.7)]" style={{ borderTopColor: pointBanner.color }}>
                                   <h1 className="text-3xl md:text-5xl font-black text-white italic uppercase tracking-[0.15em] drop-shadow-lg" style={{ color: pointBanner.color }}>
                                       {pointBanner.text}
                                   </h1>
                                   <div className="mt-0.5 flex justify-center">
                                       <div className="text-white/90 font-bold uppercase tracking-[0.2em] text-[10px] md:text-xs bg-white/10 px-3 py-0.5 rounded-full border border-white/10">
                                           {pointBanner.text.includes('PARTIDO') ? 'PUNTO DEFINITIVO' : 'PUNTO DE CIERRE'}
                                       </div>
                                   </div>
                               </div>
                          </div>
                      )}

                      {/* --- ALA LATERAL IZQUIERDA (EQ. A / EQUIPO IZQUIERDO AL COSTADO DEL MARCADOR) --- */}
                      {showLeftWing && leftStats && !isVertical && (
                          <div className="absolute right-[100%] mr-2 sm:mr-3 bottom-0 w-48 sm:w-56 md:w-60 z-30 pointer-events-auto animate-in slide-in-from-right-3 fade-in duration-300">
                              <div className={`p-2 sm:p-2.5 rounded-2xl border-2 backdrop-blur-xl shadow-2xl flex flex-col gap-1.5 ${
                                  leftTeam.id === teamA.id
                                      ? 'bg-gradient-to-br from-[#0a162e]/95 via-[#071022]/95 to-[#040814]/95 border-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.35)]'
                                      : 'bg-gradient-to-br from-[#280c20]/95 via-[#180814]/95 to-[#090307]/95 border-rose-400/80 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                              }`}>
                                  {/* Encabezado del Ala */}
                                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                          {leftTeam.logoUrl ? (
                                              <img src={leftTeam.logoUrl} className="w-6 h-6 object-contain rounded-md bg-black/50 p-0.5 border border-white/10 shrink-0" alt="" />
                                          ) : (
                                              <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center font-black text-[10px] text-white shrink-0">
                                                  {leftTeam.name[0]}
                                              </div>
                                          )}
                                          <div className="min-w-0">
                                              <span className={`px-1 py-0.5 rounded text-[7px] font-black uppercase tracking-wider block leading-none w-fit mb-0.5 ${
                                                  leftTeam.id === teamA.id ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40' : 'bg-rose-500/30 text-rose-300 border border-rose-400/40'
                                              }`}>
                                                  {leftTeam.id === teamA.id ? 'EQ. A' : 'EQ. B'}
                                              </span>
                                              <h3 className="text-white font-black text-[11px] md:text-xs uppercase tracking-wider truncate">
                                                  {leftTeam.name}
                                              </h3>
                                          </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                          <span className="text-[7px] text-slate-400 uppercase font-mono block leading-none">PTS</span>
                                          <span className={`text-sm md:text-base font-mono font-black ${leftTeam.id === teamA.id ? 'text-cyan-300' : 'text-rose-400'}`}>
                                              {leftStats.totalPts}
                                          </span>
                                      </div>
                                  </div>

                                  {/* Métricas Principales */}
                                  <div className="grid grid-cols-3 gap-1 text-center">
                                      <div className="bg-black/50 rounded-lg p-1 border border-white/5">
                                          <div className="text-[7px] text-slate-400 uppercase font-bold">Ataque</div>
                                          <div className="text-[10px] font-mono font-black text-white">
                                              {leftStats.attacks} <span className="text-[8px] text-slate-400 font-normal">({leftStats.attackPct}%)</span>
                                          </div>
                                      </div>
                                      <div className="bg-black/50 rounded-lg p-1 border border-white/5">
                                          <div className="text-[7px] text-slate-400 uppercase font-bold">Bloqueo</div>
                                          <div className="text-[10px] font-mono font-black text-amber-300">
                                              {leftStats.blocks}
                                          </div>
                                      </div>
                                      <div className="bg-black/50 rounded-lg p-1 border border-white/5">
                                          <div className="text-[7px] text-slate-400 uppercase font-bold">Aces</div>
                                          <div className="text-[10px] font-mono font-black text-emerald-400">
                                              {leftStats.aces}
                                          </div>
                                      </div>
                                  </div>

                                  {/* Jugador Seleccionado (Solo el jugador y su foto pequeña) */}
                                   {leftStats.displayPlayer && (
                                       <div className={`p-2 rounded-xl border flex items-center gap-2.5 ${
                                           leftTeam.id === teamA.id
                                               ? "bg-cyan-950/40 border-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                                               : "bg-rose-950/40 border-rose-400/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                                       }`}>
                                           {/* Foto pequeña del jugador */}
                                           {leftStats.displayPlayer.profile?.photoUrl ? (
                                               <img 
                                                   src={leftStats.displayPlayer.profile.photoUrl} 
                                                   alt={leftStats.displayPlayer.name} 
                                                   className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover bg-black/60 border border-white/20 shadow-md shrink-0" 
                                               />
                                           ) : (
                                               <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg border flex flex-col items-center justify-center font-mono font-black shrink-0 ${
                                                   leftTeam.id === teamA.id 
                                                       ? "bg-cyan-500/20 border-cyan-400/30 text-cyan-300" 
                                                       : "bg-rose-500/20 border-rose-400/30 text-rose-300"
                                               }`}>
                                                   <span className="text-[8px] text-slate-400 font-bold">#</span>
                                                   <span className="text-sm font-black leading-none">{leftStats.displayPlayer.number}</span>
                                               </div>
                                           )}

                                           {/* Información del jugador */}
                                           <div className="flex-1 min-w-0">
                                               <div className="flex items-center gap-1 mb-0.5">
                                                   <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded leading-none ${
                                                       leftStats.isManuallySelected
                                                           ? (leftTeam.id === teamA.id ? "bg-cyan-400 text-slate-950 font-black" : "bg-rose-500 text-white font-black")
                                                           : "bg-white/10 text-slate-300"
                                                   }`}>
                                                       {leftStats.isManuallySelected ? "★ SELECCIONADO" : "TOP ANOTADOR"}
                                                   </span>
                                                   <span className="text-[7px] font-mono text-slate-400 font-bold">#{leftStats.displayPlayer.number}</span>
                                               </div>
                                               <div className="text-white font-black text-[11px] sm:text-xs uppercase tracking-wide truncate">
                                                   {leftStats.displayPlayer.name}
                                               </div>
                                               <div className="text-[8px] text-slate-400 uppercase font-bold truncate">
                                                   {leftStats.displayPlayer.role || "JUGADOR"}
                                               </div>
                                           </div>

                                           {/* Puntos y desglose */}
                                           <div className="text-right shrink-0 pl-1 border-l border-white/10">
                                               <span className="text-[7px] text-slate-400 uppercase font-mono block leading-none">PTS</span>
                                               <span className={`text-sm sm:text-base font-mono font-black block leading-tight ${
                                                   leftTeam.id === teamA.id ? "text-cyan-300" : "text-rose-400"
                                               }`}>
                                                   {leftStats.displayStats.pts}
                                               </span>
                                               <div className="text-[6.5px] text-slate-400 font-mono flex items-center justify-end gap-1 mt-0.5">
                                                   <span title="Ataques">A:{leftStats.displayStats.att}</span>
                                                   <span title="Bloqueos">B:{leftStats.displayStats.blk}</span>
                                                   <span title="Aces">S:{leftStats.displayStats.ace}</span>
                                               </div>
                                           </div>
                                       </div>
                                   )}
                              </div>
                          </div>
                      )}

                      {/* --- ALA LATERAL DERECHA (EQ. B / EQUIPO DERECHO AL COSTADO DEL MARCADOR) --- */}
                      {showRightWing && rightStats && !isVertical && (
                          <div className="absolute left-[100%] ml-2 sm:ml-3 bottom-0 w-48 sm:w-56 md:w-60 z-30 pointer-events-auto animate-in slide-in-from-left-3 fade-in duration-300">
                              <div className={`p-2 sm:p-2.5 rounded-2xl border-2 backdrop-blur-xl shadow-2xl flex flex-col gap-1.5 ${
                                  rightTeam.id === teamB.id
                                      ? 'bg-gradient-to-br from-[#280c20]/95 via-[#180814]/95 to-[#090307]/95 border-rose-400/80 shadow-[0_0_20px_rgba(244,63,94,0.35)]'
                                      : 'bg-gradient-to-br from-[#0a162e]/95 via-[#071022]/95 to-[#040814]/95 border-cyan-400/80 shadow-[0_0_20px_rgba(34,211,238,0.35)]'
                              }`}>
                                  {/* Encabezado del Ala */}
                                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                                      <div className="flex items-center gap-1.5 min-w-0">
                                          {rightTeam.logoUrl ? (
                                              <img src={rightTeam.logoUrl} className="w-6 h-6 object-contain rounded-md bg-black/50 p-0.5 border border-white/10 shrink-0" alt="" />
                                          ) : (
                                              <div className="w-6 h-6 rounded-md bg-white/10 flex items-center justify-center font-black text-[10px] text-white shrink-0">
                                                  {rightTeam.name[0]}
                                              </div>
                                          )}
                                          <div className="min-w-0">
                                              <span className={`px-1 py-0.5 rounded text-[7px] font-black uppercase tracking-wider block leading-none w-fit mb-0.5 ${
                                                  rightTeam.id === teamB.id ? 'bg-rose-500/30 text-rose-300 border border-rose-400/40' : 'bg-cyan-500/30 text-cyan-300 border border-cyan-400/40'
                                              }`}>
                                                  {rightTeam.id === teamB.id ? 'EQ. B' : 'EQ. A'}
                                              </span>
                                              <h3 className="text-white font-black text-[11px] md:text-xs uppercase tracking-wider truncate">
                                                  {rightTeam.name}
                                              </h3>
                                          </div>
                                      </div>
                                      <div className="text-right shrink-0">
                                          <span className="text-[7px] text-slate-400 uppercase font-mono block leading-none">PTS</span>
                                          <span className={`text-sm md:text-base font-mono font-black ${rightTeam.id === teamB.id ? 'text-rose-400' : 'text-cyan-300'}`}>
                                              {rightStats.totalPts}
                                          </span>
                                      </div>
                                  </div>

                                  {/* Métricas Principales */}
                                  <div className="grid grid-cols-3 gap-1 text-center">
                                      <div className="bg-black/50 rounded-lg p-1 border border-white/5">
                                          <div className="text-[7px] text-slate-400 uppercase font-bold">Ataque</div>
                                          <div className="text-[10px] font-mono font-black text-white">
                                              {rightStats.attacks} <span className="text-[8px] text-slate-400 font-normal">({rightStats.attackPct}%)</span>
                                          </div>
                                      </div>
                                      <div className="bg-black/50 rounded-lg p-1 border border-white/5">
                                          <div className="text-[7px] text-slate-400 uppercase font-bold">Bloqueo</div>
                                          <div className="text-[10px] font-mono font-black text-amber-300">
                                              {rightStats.blocks}
                                          </div>
                                      </div>
                                      <div className="bg-black/50 rounded-lg p-1 border border-white/5">
                                          <div className="text-[7px] text-slate-400 uppercase font-bold">Aces</div>
                                          <div className="text-[10px] font-mono font-black text-emerald-400">
                                              {rightStats.aces}
                                          </div>
                                      </div>
                                  </div>

                                  {/* Jugador Seleccionado (Solo el jugador y su foto pequeña) */}
                                   {rightStats.displayPlayer && (
                                       <div className={`p-2 rounded-xl border flex items-center gap-2.5 ${
                                           rightTeam.id === teamB.id
                                               ? "bg-rose-950/40 border-rose-400/40 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
                                               : "bg-cyan-950/40 border-cyan-400/40 shadow-[0_0_15px_rgba(34,211,238,0.15)]"
                                       }`}>
                                           {/* Foto pequeña del jugador */}
                                           {rightStats.displayPlayer.profile?.photoUrl ? (
                                               <img 
                                                   src={rightStats.displayPlayer.profile.photoUrl} 
                                                   alt={rightStats.displayPlayer.name} 
                                                   className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg object-cover bg-black/60 border border-white/20 shadow-md shrink-0" 
                                               />
                                           ) : (
                                               <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-lg border flex flex-col items-center justify-center font-mono font-black shrink-0 ${
                                                   rightTeam.id === teamB.id 
                                                       ? "bg-rose-500/20 border-rose-400/30 text-rose-300" 
                                                       : "bg-cyan-500/20 border-cyan-400/30 text-cyan-300"
                                               }`}>
                                                   <span className="text-[8px] text-slate-400 font-bold">#</span>
                                                   <span className="text-sm font-black leading-none">{rightStats.displayPlayer.number}</span>
                                               </div>
                                           )}

                                           {/* Información del jugador */}
                                           <div className="flex-1 min-w-0">
                                               <div className="flex items-center gap-1 mb-0.5">
                                                   <span className={`text-[7px] font-black uppercase px-1 py-0.5 rounded leading-none ${
                                                       rightStats.isManuallySelected
                                                           ? (rightTeam.id === teamB.id ? "bg-rose-500 text-white font-black" : "bg-cyan-400 text-slate-950 font-black")
                                                           : "bg-white/10 text-slate-300"
                                                   }`}>
                                                       {rightStats.isManuallySelected ? "★ SELECCIONADO" : "TOP ANOTADOR"}
                                                   </span>
                                                   <span className="text-[7px] font-mono text-slate-400 font-bold">#{rightStats.displayPlayer.number}</span>
                                               </div>
                                               <div className="text-white font-black text-[11px] sm:text-xs uppercase tracking-wide truncate">
                                                   {rightStats.displayPlayer.name}
                                               </div>
                                               <div className="text-[8px] text-slate-400 uppercase font-bold truncate">
                                                   {rightStats.displayPlayer.role || "JUGADOR"}
                                               </div>
                                           </div>

                                           {/* Puntos y desglose */}
                                           <div className="text-right shrink-0 pl-1 border-l border-white/10">
                                               <span className="text-[7px] text-slate-400 uppercase font-mono block leading-none">PTS</span>
                                               <span className={`text-sm sm:text-base font-mono font-black block leading-tight ${
                                                   rightTeam.id === teamB.id ? "text-rose-400" : "text-cyan-300"
                                               }`}>
                                                   {rightStats.displayStats.pts}
                                               </span>
                                               <div className="text-[6.5px] text-slate-400 font-mono flex items-center justify-end gap-1 mt-0.5">
                                                   <span title="Ataques">A:{rightStats.displayStats.att}</span>
                                                   <span title="Bloqueos">B:{rightStats.displayStats.blk}</span>
                                                   <span title="Aces">S:{rightStats.displayStats.ace}</span>
                                               </div>
                                           </div>
                                       </div>
                                   )}
                              </div>
                          </div>
                      )}

                      {/* --- CUERPO CENTRAL DEL MARCADOR TV (COMPACTO Y ELEGANTE) --- */}
                      <div className="w-full h-full flex rounded-xl shadow-2xl overflow-hidden font-sans border border-white/15 backdrop-blur-xl">
                          
                          {/* Equipo Izquierdo (Team A / B según swapSides) */}
                          <div className={`flex-1 flex items-center justify-between pl-2 md:pl-3 pr-0 bg-gradient-to-r from-slate-950/95 via-[#0e172e]/95 to-[#162347]/95 transition-all duration-300 ${
                              showLeftWing ? 'ring-2 ring-cyan-400 shadow-[0_0_15px_rgba(34,211,238,0.5)] z-20' : ''
                          }`} style={{ borderLeft: `4px solid ${swapSides ? '#f43f5e' : '#38bdf8'}` }}>
                              <div className="flex flex-row items-center flex-1 min-w-0">
                                  {/* Logo */}
                                  <div className="bg-black/50 border border-white/10 rounded-lg relative flex-shrink-0 flex items-center justify-center w-7 h-7 md:w-9 md:h-9 mr-1.5 md:mr-2 p-1 shadow-md">
                                      {leftTeam.logoUrl ? (
                                          <img src={leftTeam.logoUrl} className="w-full h-full object-contain" alt="" />
                                      ) : (
                                          <div className="w-full h-full bg-cyan-950/60 rounded flex items-center justify-center text-cyan-300 font-black text-xs">
                                              {leftTeam.name[0]}
                                          </div>
                                      )}
                                  </div>

                                  {/* Nombre, Etiqueta y Sets */}
                                  <div className="flex-1 min-w-0 pr-1">
                                      <div className="flex items-center gap-1.5">
                                          <span className={`px-1 py-0.2 rounded text-[7px] md:text-[8px] font-black tracking-wider uppercase shrink-0 border ${
                                              swapSides 
                                                  ? 'bg-rose-500/25 text-rose-300 border-rose-400/40' 
                                                  : 'bg-cyan-500/25 text-cyan-300 border-cyan-400/40'
                                          }`}>
                                              {swapSides ? 'EQ. B' : 'EQ. A'}
                                          </span>
                                          <h2 className="text-white font-black uppercase tracking-wider truncate drop-shadow-md text-[11px] sm:text-xs md:text-sm">
                                              {leftTeam.name}
                                          </h2>
                                          {(swapSides ? match.servingTeamId === teamB.id : match.servingTeamId === teamA.id) && (
                                              <div className="flex items-center gap-0.5 bg-cyan-400 text-slate-950 font-black text-[7px] md:text-[8px] px-1 py-0.2 rounded shadow-[0_0_6px_rgba(34,211,238,0.8)] animate-pulse shrink-0">
                                                  <span>🏐</span>
                                              </div>
                                          )}
                                      </div>
                                      
                                      {/* Dots de Sets y Tiempos */}
                                      <div className="flex items-center gap-1 mt-0.5">
                                          {Array.from({length: requiredWins}).map((_, i) => (
                                              <div 
                                                  key={i} 
                                                  className={`w-3 md:w-4 h-1 md:h-1.5 rounded-sm transition-all duration-300 ${
                                                      i < (swapSides ? winsB : winsA) 
                                                          ? 'bg-cyan-400 shadow-[0_0_6px_#22d3ee]' 
                                                          : 'bg-white/10 border border-white/5'
                                                  }`}
                                              />
                                          ))}
                                          <span className="text-[7px] md:text-[8px] text-slate-400 font-bold ml-1 font-mono">
                                              {swapSides 
                                                  ? `T:${match.timeoutsB || 0}/2 • S:${match.substitutionsB || 0}/6` 
                                                  : `T:${match.timeoutsA || 0}/2 • S:${match.substitutionsA || 0}/6`
                                              }
                                          </span>
                                      </div>
                                  </div>
                              </div>

                              {/* Puntos Equipo Izquierdo */}
                              <div className="bg-gradient-to-b from-[#060810] to-[#0c1322] h-full flex items-center justify-center px-3 md:px-5 border-l border-white/10 border-r border-[#080d1a] shadow-inner shrink-0">
                                  <span className="font-mono font-black tabular-nums tracking-tighter leading-none text-cyan-300 drop-shadow-[0_0_12px_rgba(34,211,238,0.4)] text-2xl md:text-3xl">
                                      {swapSides ? match.scoreB : match.scoreA}
                                  </span>
                              </div>
                          </div>

                          {/* Centro del Marcador - SET / Torneo */}
                          <div className="flex flex-col items-center justify-center z-10 relative flex-shrink-0 bg-[#090d1c] w-12 md:w-16 h-full p-1 border-x border-white/15 shadow-inner">
                              <div className="text-[8px] md:text-[9px] font-black italic uppercase tracking-wider text-amber-300 bg-amber-400/15 px-1.5 py-0.2 rounded border border-amber-400/30 shadow-[0_0_6px_rgba(251,191,36,0.25)] text-center leading-none mb-0.5">
                                  SET {match.currentSet}
                              </div>
                              {tournament?.logoUrl ? (
                                  <img src={tournament.logoUrl} className="h-5 md:h-6 w-full object-contain drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]" alt="" />
                              ) : (
                                  <div className="text-[7px] md:text-[8px] text-white/50 font-black uppercase tracking-widest text-center leading-none">
                                      VS
                                  </div>
                              )}
                          </div>

                          {/* Equipo Derecho (Team B / A según swapSides) */}
                          <div className={`flex-1 flex items-center justify-between pr-2 md:pr-3 pl-0 bg-gradient-to-l from-slate-950/95 via-[#241324]/95 to-[#331733]/95 flex-row-reverse transition-all duration-300 ${
                              showRightWing ? 'ring-2 ring-rose-400 shadow-[0_0_15px_rgba(244,63,94,0.5)] z-20' : ''
                          }`} style={{ borderRight: `4px solid ${swapSides ? '#38bdf8' : '#f43f5e'}` }}>
                              <div className="flex flex-row-reverse items-center flex-1 min-w-0">
                                  {/* Logo */}
                                  <div className="bg-black/50 border border-white/10 rounded-lg relative flex-shrink-0 flex items-center justify-center w-7 h-7 md:w-9 md:h-9 ml-1.5 md:ml-2 p-1 shadow-md">
                                      {rightTeam.logoUrl ? (
                                          <img src={rightTeam.logoUrl} className="w-full h-full object-contain" alt="" />
                                      ) : (
                                          <div className="w-full h-full bg-rose-950/60 rounded flex items-center justify-center text-rose-300 font-black text-xs">
                                              {rightTeam.name[0]}
                                          </div>
                                      )}
                                  </div>

                                  {/* Nombre, Etiqueta y Sets */}
                                  <div className="flex-1 min-w-0 pl-1 flex flex-col items-end">
                                      <div className="flex items-center gap-1.5 justify-end">
                                          {(swapSides ? match.servingTeamId === teamA.id : match.servingTeamId === teamB.id) && (
                                              <div className="flex items-center gap-0.5 bg-rose-500 text-white font-black text-[7px] md:text-[8px] px-1 py-0.2 rounded shadow-[0_0_6px_rgba(244,63,94,0.8)] animate-pulse shrink-0">
                                                  <span>🏐</span>
                                              </div>
                                          )}
                                          <h2 className="text-white font-black uppercase tracking-wider truncate drop-shadow-md text-[11px] sm:text-xs md:text-sm">
                                              {rightTeam.name}
                                          </h2>
                                          <span className={`px-1 py-0.2 rounded text-[7px] md:text-[8px] font-black tracking-wider uppercase shrink-0 border ${
                                              swapSides 
                                                  ? 'bg-cyan-500/25 text-cyan-300 border-cyan-400/40' 
                                                  : 'bg-rose-500/25 text-rose-300 border-rose-400/40'
                                          }`}>
                                              {swapSides ? 'EQ. A' : 'EQ. B'}
                                          </span>
                                      </div>
                                      
                                      {/* Dots de Sets y Tiempos */}
                                      <div className="flex items-center gap-1 mt-0.5 justify-end">
                                          <span className="text-[7px] md:text-[8px] text-slate-400 font-bold mr-1 font-mono">
                                              {swapSides 
                                                  ? `T:${match.timeoutsA || 0}/2 • S:${match.substitutionsA || 0}/6` 
                                                  : `T:${match.timeoutsB || 0}/2 • S:${match.substitutionsB || 0}/6`
                                              }
                                          </span>
                                          {Array.from({length: requiredWins}).map((_, i) => (
                                              <div 
                                                  key={i} 
                                                  className={`w-3 md:w-4 h-1 md:h-1.5 rounded-sm transition-all duration-300 ${
                                                      i < (swapSides ? winsA : winsB) 
                                                          ? 'bg-rose-500 shadow-[0_0_6px_#f43f5e]' 
                                                          : 'bg-white/10 border border-white/5'
                                                  }`}
                                              />
                                          ))}
                                      </div>
                                  </div>
                              </div>

                              {/* Puntos Equipo Derecho */}
                              <div className="bg-gradient-to-b from-[#060810] to-[#1c0c1b] h-full flex items-center justify-center px-3 md:px-5 border-r border-white/10 border-l border-[#140813] shadow-inner shrink-0">
                                  <span className="font-mono font-black tabular-nums tracking-tighter leading-none text-rose-300 drop-shadow-[0_0_12px_rgba(244,63,94,0.4)] text-2xl md:text-3xl">
                                      {swapSides ? match.scoreA : match.scoreB}
                                  </span>
                              </div>
                          </div>

                      </div>
                  </div>
              </div>
            );
          })()

      )}

      {/* --- CONTROLS OVERLAY --- */}
      {showControls && isAdmin && onPoint && (
          <div className="absolute inset-x-0 bottom-0 z-50 bg-black/80 backdrop-blur-xl border-t border-white/20 p-4 animate-in slide-in-from-bottom-10 max-h-[60vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-4">
                  <h3 className="text-xl font-black text-white uppercase italic">Controles de Partido</h3>
                  <button onClick={() => setShowControls(false)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded font-bold uppercase text-xs">Cerrar</button>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Team A Controls */}
                  <ScoreControl 
                      role={currentUser?.role as any}
                      linkedTeamId={currentUser?.linkedTeamId}
                      onPoint={onPoint}
                      onSubtractPoint={onSubtractPoint}
                      onRequestTimeout={onRequestTimeout!}
                      onRequestSub={onRequestSub!}
                      onModifyRotation={onModifyRotation!}
                      onSetServe={onSetServe!}
                      teamId={teamA.id}
                      teamName={teamA.name}
                      players={teamA.players || []}
                      disabled={match.status === 'finished'}
                      timeoutsUsed={match.timeoutsA}
                      subsUsed={match.substitutionsA}
                      isServing={match.servingTeamId === teamA.id}
                  />

                  {/* Team B Controls */}
                  <ScoreControl 
                      role={currentUser?.role as any}
                      linkedTeamId={currentUser?.linkedTeamId}
                      onPoint={onPoint}
                      onSubtractPoint={onSubtractPoint}
                      onRequestTimeout={onRequestTimeout!}
                      onRequestSub={onRequestSub!}
                      onModifyRotation={onModifyRotation!}
                      onSetServe={onSetServe!}
                      teamId={teamB.id}
                      teamName={teamB.name}
                      players={teamB.players || []}
                      disabled={match.status === 'finished'}
                      timeoutsUsed={match.timeoutsB}
                      subsUsed={match.substitutionsB}
                      isServing={match.servingTeamId === teamB.id}
                  />
              </div>
          </div>
      )}

      {/* Consola VAR y enrutamiento de cámaras se gestionan exclusivamente desde el Panel de Control (VARConsole) */}





    </div>
  );
};

// --- MULTI-CAM MINIATURE COMPONENT ---
interface CameraMiniatureProps {
  camera: any;
  isActive: boolean;
  onSelect: () => void;
  localStream?: MediaStream | null;
}

const CameraMiniature: React.FC<CameraMiniatureProps> = ({ camera, isActive, onSelect, localStream }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (camera.type !== 'simulated' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    const draw = () => {
      const now = Date.now();
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (camera.id === 'sim_red') {
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(4, 4, canvas.width - 8, canvas.height - 8);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 4);
        ctx.lineTo(canvas.width / 2, canvas.height - 4);
        ctx.stroke();

        const ballX = (canvas.width / 2) + Math.sin(now / 1200) * (canvas.width / 3.2);
        const ballY = (canvas.height / 2) + Math.cos(now / 2400) * (canvas.height / 4);
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (camera.id === 'sim_saque') {
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(4, 15, canvas.width - 8, canvas.height - 20);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(canvas.width / 2, 10);
        ctx.lineTo(canvas.width / 2, canvas.height - 4);
        ctx.stroke();

        const cycle = (now % 3500) / 3500;
        const ballX = 10 + cycle * (canvas.width - 20);
        const ballY = canvas.height - 10 - Math.sin(cycle * Math.PI) * 20;
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(ballX, ballY, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (camera.id === 'sim_halcon') {
        ctx.fillStyle = '#1e3a8a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, canvas.height / 2, canvas.width, 4);

        const cycle = (now % 3000) / 3000;
        const targetY = canvas.height / 2 + (Math.floor(now / 3000) % 2 === 0 ? 1 : -6);
        const ballY = cycle < 0.5 ? (cycle / 0.5) * targetY : targetY;
        ctx.fillStyle = '#eab308';
        ctx.beginPath();
        ctx.arc(canvas.width / 2, ballY, cycle >= 0.5 ? 4 : 6, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [camera]);

  return (
    <div 
      onClick={onSelect}
      className={`relative bg-slate-900 border-2 rounded-xl overflow-hidden cursor-pointer group transition-all h-[55px] md:h-[65px] flex flex-col justify-end p-1.5 ${
        isActive ? 'border-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]' : 'border-white/10 hover:border-white/30'
      }`}
    >
      {camera.type === 'simulated' ? (
        <canvas ref={canvasRef} width={120} height={68} className="absolute inset-0 w-full h-full object-cover rounded-lg z-0 pointer-events-none" />
      ) : camera.type === 'local' ? (
        <video 
          ref={(el) => {
            if (el && el.srcObject !== (localStream || null)) {
              el.srcObject = localStream || null;
              el.play().catch(() => {});
            }
          }}
          muted autoPlay playsInline className="absolute inset-0 w-full h-full object-cover rounded-lg z-0 pointer-events-none" 
        />
      ) : (
        <video 
          ref={(el) => {
            if (el && el.srcObject !== (camera.stream || null)) {
              el.srcObject = camera.stream || null;
              el.play().catch(() => {});
            }
          }}
          muted autoPlay playsInline className="absolute inset-0 w-full h-full object-cover rounded-lg z-0 pointer-events-none" 
        />
      )}

      {/* Overlay label */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent rounded-lg z-10 pointer-events-none" />
      <span className="text-[7px] md:text-[9px] font-black tracking-wider text-white truncate z-20 font-mono uppercase bg-black/40 px-1 py-0.5 rounded backdrop-blur-[2px]">
        {camera.label.split(' ')[0]} {camera.type === 'simulated' ? 'SIM' : camera.type === 'wireless' ? 'WIFI' : 'PC'}
      </span>
    </div>
  );
};

export default TVOverlay;
