import React, { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { LiveMatchState, Team, Tournament, VarChallengeState } from '../types';
import { PEER_CONFIG, getVarPeerId, getVarDirectUrl } from '../constants/peerConfig';
import { QRCodeSVG } from 'qrcode.react';

interface VARConsoleProps {
  match: LiveMatchState;
  teamA: Team;
  teamB: Team;
  tournament?: Tournament | null;
  onUpdateMatch?: (updates: Partial<LiveMatchState>) => void;
  onClose?: () => void;
}

type CameraAngleType = 'attack' | 'serve' | 'halcon' | 'crowd' | 'wireless';

interface RecordedFrame {
  timestamp: number;
  dataUrl: string;
}

export const VARConsole: React.FC<VARConsoleProps> = ({
  match,
  teamA,
  teamB,
  tournament,
  onUpdateMatch,
  onClose
}) => {
  // Estado del Desafío Activo
  const [requestingTeamId, setRequestingTeamId] = useState<string>(match.varChallenge?.requestingTeamId || teamA.id);
  const [challengeType, setChallengeType] = useState<VarChallengeState['challengeType']>(match.varChallenge?.challengeType || 'net_touch');
  const [challengeLabel, setChallengeLabel] = useState<string>(match.varChallenge?.challengeLabel || 'TOQUE DE RED');
  const [selectedAngle, setSelectedAngle] = useState<CameraAngleType>(match.varChallenge?.cameraAngle || 'attack');
  const [verdict, setVerdict] = useState<VarChallengeState['verdict']>(match.varChallenge?.verdict || 'IN_PROGRESS');
  const [isLiveBroadcast, setIsLiveBroadcast] = useState<boolean>(match.varChallenge?.isActive || false);
  
  // Controles de Reproducción y Búfer
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(0.25); // Default 25% cámara lenta
  const [playheadIndex, setPlayheadIndex] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [showInspectionCircle, setShowInspectionCircle] = useState<boolean>(false);
  const [circlePos, setCirclePos] = useState<{ x: number; y: number }>({ x: 320, y: 180 });
  const [circleRadius, setCircleRadius] = useState<number>(45);
  const [interactionMode, setInteractionMode] = useState<'pan' | 'circle'>('pan');
  const [hawkEyeIn, setHawkEyeIn] = useState<boolean>(true);
  const [showQRModal, setShowQRModal] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);


  // Configuración de Fuente de Cámara por cada Sección del Challenger
  const [sectionConfigs, setSectionConfigs] = useState<Record<CameraAngleType, { sourceType: 'simulation' | 'webcam' | 'wireless'; wirelessId?: string; label: string }>>({
    attack: { sourceType: 'simulation', label: 'Simulación Red y Bloqueo' },
    serve: { sourceType: 'simulation', label: 'Simulación Línea de Saque' },
    halcon: { sourceType: 'simulation', label: 'Simulación 3D Ojo de Halcón' },
    crowd: { sourceType: 'simulation', label: 'Simulación Plano General' },
    wireless: { sourceType: 'wireless', label: 'Cámara Celular Auxiliar' }
  });
  const [modalSection, setModalSection] = useState<CameraAngleType>('attack');

  // Cámaras inalámbricas recibidas
  const [wirelessCams, setWirelessCams] = useState<{ id: string; label: string; stream: MediaStream; section?: CameraAngleType }[]>([]);
  const peerRef = useRef<Peer | null>(null);

  // Canvas y Búfer Continuo de 5 Minutos (Máx 1200 frames a 4 fps = 300 segundos = 5 minutos)
  const MAX_BUFFER_FRAMES = 1200; // 5 minutos de grabación continua
  const buffersRef = useRef<{ [key in CameraAngleType]: RecordedFrame[] }>({
    attack: [],
    serve: [],
    halcon: [],
    crowd: [],
    wireless: []
  });
  const [bufferLengths, setBufferLengths] = useState<{ [key in CameraAngleType]: number }>({
    attack: 0,
    serve: 0,
    halcon: 0,
    crowd: 0,
    wireless: 0
  });

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  // 1. Iniciar Receptor WebRTC para cámaras de celulares en la consola VAR
  useEffect(() => {
    const peerId = getVarPeerId(match.matchId);
    let peer: Peer | null = null;
    try {
      peer = new Peer(peerId, PEER_CONFIG);
      peerRef.current = peer;

      peer.on('call', (call) => {
        call.answer(new MediaStream());
        call.on('stream', (remoteStream) => {
          const camLabel = call.metadata?.label || `Celular ${call.peer.substring(0, 4)}`;
          const callerSec = call.metadata?.section as CameraAngleType | undefined;
          
          setWirelessCams(prev => {
            const filtered = prev.filter(c => c.id !== call.peer);
            return [...filtered, { id: call.peer, label: camLabel, stream: remoteStream, section: callerSec }];
          });

          // Vincular automáticamente el celular a la sección asignada o disponible
          setSectionConfigs(prev => {
            const updated = { ...prev };
            if (callerSec && updated[callerSec]) {
              updated[callerSec] = {
                sourceType: 'wireless',
                wirelessId: call.peer,
                label: camLabel
              };
            } else {
              // Asignar al modalSection o a wireless
              const target = modalSection || 'wireless';
              updated[target] = {
                sourceType: 'wireless',
                wirelessId: call.peer,
                label: camLabel
              };
            }
            return updated;
          });
        });

        call.on('close', () => {
          setWirelessCams(prev => prev.filter(c => c.id !== call.peer));
        });
      });

      peer.on('error', (err) => {
        console.warn("PeerJS receptor en VARConsole:", err?.type || err);
      });
    } catch (e) {
      console.error("Error al iniciar PeerJS en VARConsole:", e);
    }

    return () => {
      if (peer) {
        try { peer.destroy(); } catch(e){}
      }
    };
  }, [match.matchId, modalSection]);

  // 2. Iniciar cámara web local si existe (para ángulo de ataque o público)
  useEffect(() => {
    async function initCamera() {
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 }, audio: false });
          if (localVideoRef.current) {
            localVideoRef.current.srcObject = stream;
            localVideoRef.current.play().catch(() => {});
          }
        }
      } catch (err) {
        console.warn("Cámara local no disponible en VARConsole:", err);
      }
    }
    initCamera();

    return () => {
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        const stream = localVideoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  // 3. Captura continua del Búfer de 5 Minutos (cada 250ms = 4 fps)
  useEffect(() => {
    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = 480;
    renderCanvas.height = 270;
    const rCtx = renderCanvas.getContext('2d');
    if (!rCtx) return;

    const interval = setInterval(() => {
      const now = Date.now();

      // Generar frame para cada ángulo
      (['attack', 'serve', 'halcon', 'crowd', 'wireless'] as CameraAngleType[]).forEach(angle => {
        rCtx.clearRect(0, 0, 480, 270);
        drawAngleFrame(angle, rCtx, 480, 270, now);
        const dataUrl = renderCanvas.toDataURL('image/jpeg', 0.6);

        const list = buffersRef.current[angle];
        list.push({ timestamp: now, dataUrl });

        // Mantener como máximo 5 minutos (1200 frames) y descartar el más viejo (FIFO)
        if (list.length > MAX_BUFFER_FRAMES) {
          list.shift();
        }
      });

      // Actualizar longitudes de búfer para el timeline
      setBufferLengths({
        attack: buffersRef.current.attack.length,
        serve: buffersRef.current.serve.length,
        halcon: buffersRef.current.halcon.length,
        crowd: buffersRef.current.crowd.length,
        wireless: buffersRef.current.wireless.length
      });
    }, 250);

    return () => clearInterval(interval);
  }, [wirelessCams, hawkEyeIn]);

  // Función de dibujado de cada ángulo
  const drawAngleFrame = (
    angle: CameraAngleType,
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    timeMs: number
  ) => {
    const cfg = sectionConfigs[angle];

    // 1. Si la sección está asignada a un celular específico y está conectado
    if (cfg?.sourceType === 'wireless' && cfg.wirelessId) {
      const el = document.getElementById(`var-cam-stream-${cfg.wirelessId}`) as HTMLVideoElement;
      if (el && el.readyState >= 2) {
        try {
          ctx.drawImage(el, 0, 0, w, h);
          drawHudOverlay(ctx, w, h, `📱 ${cfg.label.toUpperCase()} (EN VIVO)`, timeMs);
          return;
        } catch(e){}
      }
    }

    // 2. Si es sección wireless genérica y hay celular conectado
    if (angle === 'wireless' && wirelessCams.length > 0) {
      const el = document.getElementById(`var-cam-stream-${wirelessCams[0].id}`) as HTMLVideoElement;
      if (el && el.readyState >= 2) {
        try {
          ctx.drawImage(el, 0, 0, w, h);
          drawHudOverlay(ctx, w, h, `📱 ${wirelessCams[0].label.toUpperCase()} (EN VIVO)`, timeMs);
          return;
        } catch(e){}
      }
    }

    // 3. Si la sección está asignada a la cámara web USB/local
    if (cfg?.sourceType === 'webcam' && localVideoRef.current && localVideoRef.current.readyState >= 2) {
      try {
        ctx.drawImage(localVideoRef.current, 0, 0, w, h);
        drawHudOverlay(ctx, w, h, `📷 CÁMARA LOCAL (${angle.toUpperCase()})`, timeMs);
        return;
      } catch(e){}
    }

    // Fallback: Si no hay cámara asignada a attack o crowd pero hay webcam local
    if ((angle === 'attack' || angle === 'crowd') && !cfg?.wirelessId && cfg?.sourceType !== 'simulation' && localVideoRef.current && localVideoRef.current.readyState >= 2) {
      try {
        ctx.drawImage(localVideoRef.current, 0, 0, w, h);
        drawHudOverlay(ctx, w, h, angle === 'attack' ? 'CAM-1 RED / TOQUE DE BLOQUEO' : 'CAM-5 PLANO GENERAL Y PÚBLICO', timeMs);
        return;
      } catch(e){}
    }

    // Simulación broadcast para ángulos tácticos
    if (angle === 'halcon') {
      // Pista y Línea de Ojo de Halcón 3D
      ctx.fillStyle = '#0f2b5c';
      ctx.fillRect(0, 0, w, h);

      // Línea blanca de fondo de cancha (ancho 12px)
      ctx.fillStyle = '#ffffff';
      const lineY = h * 0.58;
      ctx.fillRect(0, lineY, w, 12);

      // Impacto animado cíclico cada 3 segundos
      const cycle = (timeMs % 2800) / 2800;
      const targetY = hawkEyeIn ? lineY + 5 : lineY - 24; // Dentro pisando línea vs fuera
      let bY = 0;
      let bSize = 22;
      let squash = 1;
      let impact = false;

      if (cycle < 0.55) {
        const p = cycle / 0.55;
        bY = p * targetY;
        bSize = 24 - p * 10;
      } else {
        bY = targetY;
        bSize = 13;
        squash = 0.55;
        impact = true;
      }

      // Onda de impacto
      if (impact) {
        ctx.strokeStyle = hawkEyeIn ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 3;
        ctx.beginPath();
        const pulse = ((timeMs % 1200) / 1200) * 45;
        ctx.ellipse(w / 2, targetY + 6, pulse, pulse / 2.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Sombra
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.beginPath();
      ctx.ellipse(w / 2, targetY + 10, bSize, bSize / 3, 0, 0, Math.PI * 2);
      ctx.fill();

      // Balón amarillo/azul VNL
      ctx.fillStyle = '#eab308';
      ctx.beginPath();
      ctx.ellipse(w / 2, bY, bSize, bSize * squash, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cartel Ojo de Halcón
      ctx.fillStyle = impact ? (hawkEyeIn ? '#15803d' : '#b91c1c') : '#1e293b';
      ctx.fillRect(w / 2 - 80, 20, 160, 32);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w / 2 - 80, 20, 160, 32);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(impact ? (hawkEyeIn ? 'IN (DENTRO: +8mm)' : 'OUT (FUERA: -14mm)') : 'CALCULANDO...', w / 2, 40);
      ctx.textAlign = 'left';

      drawHudOverlay(ctx, w, h, 'CAM-3 OJO DE HALCÓN HD (240 FPS)', timeMs);

    } else if (angle === 'attack') {
      // Simulación de Red y Bloqueo
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(0, 0, w, h);

      // Red central blanca con malla
      ctx.strokeStyle = 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1;
      for (let x = 0; x < w; x += 15) {
        ctx.beginPath();
        ctx.moveTo(x, h * 0.4);
        ctx.lineTo(x, h * 0.85);
        ctx.stroke();
      }
      for (let y = h * 0.4; y < h * 0.85; y += 15) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Banda superior de la red
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, h * 0.38, w, 8);

      // Manos de bloqueo / Balón rozando
      const osc = Math.sin(timeMs / 400) * 15;
      ctx.fillStyle = '#f59e0b';
      ctx.beginPath();
      ctx.arc(w * 0.5 + osc, h * 0.36, 16, 0, Math.PI * 2);
      ctx.fill();

      drawHudOverlay(ctx, w, h, 'CAM-1 RED / TOQUE DE MANOS Y BLOQUEO', timeMs);

    } else if (angle === 'serve') {
      // Simulación de Línea de Saque
      ctx.fillStyle = '#172554';
      ctx.fillRect(0, 0, w, h);

      // Línea de saque blanca
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(w * 0.4, 0, 8, h);

      // Zapatilla / Pie en saque
      const footPos = Math.sin(timeMs / 800) * 10;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(w * 0.4 - 30 + footPos, h * 0.6, 24, 12);

      drawHudOverlay(ctx, w, h, 'CAM-2 SAQUE / CONTROL DE FALTA DE PIE', timeMs);

    } else {
      // Plano General y Público
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, w, h);

      ctx.fillStyle = '#334155';
      ctx.fillRect(0, h * 0.7, w, h * 0.3);

      drawHudOverlay(ctx, w, h, 'CAM-4 PLANO GENERAL DE CANCHA', timeMs);
    }
  };

  const drawHudOverlay = (ctx: CanvasRenderingContext2D, w: number, h: number, title: string, timeMs: number) => {
    // Barra superior HUD
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, w, 24);
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 9px monospace';
    ctx.fillText(title, 10, 16);

    const d = new Date(timeMs);
    const timeStr = d.toTimeString().split(' ')[0] + '.' + Math.floor(d.getMilliseconds() / 100);
    ctx.fillStyle = '#facc15';
    ctx.textAlign = 'right';
    ctx.fillText(timeStr, w - 10, 16);
    ctx.textAlign = 'left';
  };

  // 4. Renderizar frame en el visor principal de la consola según playhead, zoom, pan y círculo
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const list = buffersRef.current[selectedAngle];
    if (list.length === 0) {
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('GRABANDO BÚFER CONTINUO DE 5 MINUTOS...', canvas.width / 2, canvas.height / 2);
      ctx.textAlign = 'left';
      return;
    }

    // Calcular índice del frame (0 = más viejo hace 5 min, total-1 = en vivo)
    const targetIdx = Math.min(Math.max(0, playheadIndex), list.length - 1);
    const targetFrame = list[targetIdx];
    if (!targetFrame) return;

    const img = new Image();
    img.src = targetFrame.dataUrl;
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Dibujar imagen con Zoom y Desplazamiento (Pan)
      ctx.save();
      // Trasladar al centro + desplazamiento arrastrable
      ctx.translate(canvas.width / 2 + panOffset.x, canvas.height / 2 + panOffset.y);
      ctx.scale(zoomLevel, zoomLevel);
      ctx.translate(-canvas.width / 2, -canvas.height / 2);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      ctx.restore();

      // Dibujar CÍRCULO RETÍCULA DEL DESAFÍO (Herramienta de precisión arbitral)
      if (showInspectionCircle) {
        const cx = circlePos.x;
        const cy = circlePos.y;
        const r = circleRadius;

        ctx.save();
        // Resplandor exterior
        ctx.shadowColor = 'rgba(239, 68, 68, 0.8)';
        ctx.shadowBlur = 15;

        // Círculo principal rojo/dorado
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.stroke();

        // Anillo interior sutil
        ctx.setLineDash([]);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.4, 0, Math.PI * 2);
        ctx.stroke();

        // Punto central de impacto
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(cx, cy, 3, 0, Math.PI * 2);
        ctx.fill();

        // Miras / Cruz de coordenadas
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx - r - 8, cy);
        ctx.lineTo(cx - r * 0.4, cy);
        ctx.moveTo(cx + r * 0.4, cy);
        ctx.lineTo(cx + r + 8, cy);
        ctx.moveTo(cx, cy - r - 8);
        ctx.lineTo(cx, cy - r * 0.4);
        ctx.moveTo(cx, cy + r * 0.4);
        ctx.lineTo(cx, cy + r + 8);
        ctx.stroke();

        // Etiqueta indicadora
        ctx.shadowBlur = 0;
        const tagText = '🎯 ZONA DE REVISIÓN VAR';
        ctx.font = 'bold 10px monospace';
        const metrics = ctx.measureText(tagText);
        const tagW = metrics.width + 14;
        const tagH = 18;
        const tagX = cx - tagW / 2;
        const tagY = cy - r - 24;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(tagX, tagY, tagW, tagH, 4);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.fillStyle = '#f8fafc';
        ctx.textAlign = 'center';
        ctx.fillText(tagText, cx, tagY + 13);
        ctx.restore();
      }
    };
  }, [selectedAngle, playheadIndex, zoomLevel, panOffset, showInspectionCircle, circlePos, circleRadius, bufferLengths]);

  // 5. Animación de reproducción en cámara lenta
  useEffect(() => {
    if (!isPlaying) return;

    const total = buffersRef.current[selectedAngle].length;
    if (total === 0) return;

    // Intervalo ajustado a la velocidad seleccionada
    const frameInterval = Math.max(20, Math.round(250 / (playbackSpeed * 4)));
    const timer = setInterval(() => {
      setPlayheadIndex(prev => {
        const next = prev + 1;
        return next >= total ? total - 1 : next;
      });
    }, frameInterval);

    return () => clearInterval(timer);
  }, [isPlaying, playbackSpeed, selectedAngle, bufferLengths]);

  // Sincronizar el playhead al final (EN VIVO) por defecto cuando crece el buffer
  useEffect(() => {
    const total = buffersRef.current[selectedAngle].length;
    if (total > 0 && isPlaying && playheadIndex >= total - 2) {
      setPlayheadIndex(total - 1);
    }
  }, [bufferLengths, selectedAngle]);

  // Enviar Desafío al EN VIVO (TV Overlay y Cloud)
  const handleBroadcastChallenge = (activate: boolean) => {
    setIsLiveBroadcast(activate);
    const reqTeam = requestingTeamId === teamA.id ? teamA : teamB;
    const currentList = buffersRef.current[selectedAngle];
    
    // Captura exacta del lienzo actual (incluye ampliación, desplazamiento y círculo retícula)
    let currentFrame: string | undefined = undefined;
    if (previewCanvasRef.current) {
      try {
        currentFrame = previewCanvasRef.current.toDataURL('image/jpeg', 0.88);
      } catch (e) {
        currentFrame = currentList.length > 0 ? currentList[Math.min(playheadIndex, currentList.length - 1)]?.dataUrl : undefined;
      }
    } else {
      currentFrame = currentList.length > 0 ? currentList[Math.min(playheadIndex, currentList.length - 1)]?.dataUrl : undefined;
    }

    const currentCfg = sectionConfigs[selectedAngle];

    const challengePayload: VarChallengeState = {
      isActive: activate,
      requestingTeamId: reqTeam.id,
      requestingTeamName: reqTeam.name,
      challengeType,
      challengeLabel,
      cameraAngle: selectedAngle,
      cameraLabel: currentCfg?.label || selectedAngle.toUpperCase(),
      assignedWirelessPeerId: currentCfg?.wirelessId,
      replayDataUrl: currentFrame,
      verdict: activate ? verdict : null,
      slowMoSpeed: playbackSpeed,
      replayFrameIndex: playheadIndex,
      simulatedIn: hawkEyeIn,
      updatedAt: Date.now()
    };

    if (onUpdateMatch) {
      onUpdateMatch({
        varChallenge: challengePayload
      });
    }
  };

  // Veredicto final del árbitro
  const handleSetVerdict = (newVerdict: VarChallengeState['verdict']) => {
    setVerdict(newVerdict);
    const currentList = buffersRef.current[selectedAngle];
    
    let currentFrame: string | undefined = undefined;
    if (previewCanvasRef.current) {
      try {
        currentFrame = previewCanvasRef.current.toDataURL('image/jpeg', 0.88);
      } catch (e) {
        currentFrame = currentList.length > 0 ? currentList[Math.min(playheadIndex, currentList.length - 1)]?.dataUrl : undefined;
      }
    } else {
      currentFrame = currentList.length > 0 ? currentList[Math.min(playheadIndex, currentList.length - 1)]?.dataUrl : undefined;
    }

    const currentCfg = sectionConfigs[selectedAngle];

    if (isLiveBroadcast && onUpdateMatch) {
      onUpdateMatch({
        varChallenge: {
          isActive: true,
          requestingTeamId,
          requestingTeamName: requestingTeamId === teamA.id ? teamA.name : teamB.name,
          challengeType,
          challengeLabel,
          cameraAngle: selectedAngle,
          cameraLabel: currentCfg?.label || selectedAngle.toUpperCase(),
          assignedWirelessPeerId: currentCfg?.wirelessId,
          replayDataUrl: currentFrame,
          verdict: newVerdict,
          slowMoSpeed: playbackSpeed,
          replayFrameIndex: playheadIndex,
          simulatedIn: hawkEyeIn,
          updatedAt: Date.now()
        }
      });
    }
  };

  const totalFrames = buffersRef.current[selectedAngle].length;
  const currentSecondsFromLive = totalFrames > 0 
    ? Math.round((totalFrames - 1 - playheadIndex) * 0.25)
    : 0;

  return (
    <div className="bg-[#0b101d] border border-cyan-500/40 rounded-3xl p-4 md:p-6 text-white shadow-2xl flex flex-col gap-4 animate-in fade-in duration-300">
      
      {/* Video elements ocultos para capturas de streams locales e inalámbricos */}
      <video ref={localVideoRef} muted playsInline autoPlay className="hidden" />
      {wirelessCams.map(cam => (
        <video 
          key={cam.id} 
          id={`var-cam-stream-${cam.id}`}
          ref={el => { if (el && el.srcObject !== cam.stream) el.srcObject = cam.stream; }}
          muted 
          playsInline 
          autoPlay 
          className="hidden" 
        />
      ))}

      {/* Encabezado Principal */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="bg-red-600/20 border border-red-500/40 p-2.5 rounded-2xl text-red-400 shadow-md flex items-center justify-center">
            <span className="text-xl">📹</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="bg-red-600 text-white font-black text-[9px] px-2 py-0.5 rounded uppercase tracking-wider animate-pulse">
                SISTEMA VAR CHALLENGE
              </span>
              <span className="text-xs text-green-400 bg-green-500/20 border border-green-500/30 px-2 py-0.5 rounded font-mono font-bold">
                ● Búfer 5 Min ({Math.round(totalFrames * 0.25)}s grabados)
              </span>
            </div>
            <h2 className="text-lg md:text-xl font-black uppercase italic tracking-wider text-white mt-0.5">
              Consola de Desafío y Repeticiones
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          {/* Botón Celular VAR */}
          <button
            onClick={() => setShowQRModal(true)}
            className="bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-400/30 px-3 py-1.5 rounded-xl text-xs font-bold uppercase transition flex items-center gap-1.5 shadow"
          >
            <span>📱</span> Celular VAR ({wirelessCams.length})
          </button>

          {/* Botón Cerrar */}
          {onClose && (
            <button
              onClick={onClose}
              className="bg-red-500/20 hover:bg-red-500 text-red-300 hover:text-white px-3 py-1.5 rounded-xl font-bold uppercase text-xs border border-red-500/30 transition"
            >
              ✕ Cerrar
            </button>
          )}
        </div>
      </div>

      {/* Selector de Secciones del Challenger y Conexión de Cámaras */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
        {[
          { id: 'attack', label: 'Ataque / Bloqueo', icon: '🏐', desc: 'Toque de Red y Manos', defaultLabel: 'Cámara Red / Ataque' },
          { id: 'serve', label: 'Línea de Saque', icon: '🚀', desc: 'Línea y Falta de Pie', defaultLabel: 'Cámara Saque / Fondo' },
          { id: 'halcon', label: 'Ojo de Halcón', icon: '🦅', desc: 'In & Out Milimétrico', defaultLabel: 'Cámara Línea In/Out' },
          { id: 'crowd', label: 'Vista General', icon: '👥', desc: 'Cancha y Árbitros', defaultLabel: 'Cámara Gran Angular' },
          { id: 'wireless', label: 'Celular Auxiliar', icon: '📱', desc: 'Cámara Móvil P2P', defaultLabel: 'Cámara Móvil Auxiliar' }
        ].map(sec => {
          const isSelected = selectedAngle === sec.id;
          const cfg = sectionConfigs[sec.id as CameraAngleType];
          const isWirelessActive = cfg?.sourceType === 'wireless' && cfg?.wirelessId;
          const isWebcamActive = cfg?.sourceType === 'webcam';

          return (
            <div
              key={sec.id}
              onClick={() => setSelectedAngle(sec.id as CameraAngleType)}
              className={`p-3 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                isSelected 
                  ? 'bg-gradient-to-b from-[#0c2238] to-[#081524] border-cyan-400 text-white shadow-[0_0_20px_rgba(6,182,212,0.35)] ring-1 ring-cyan-400/60' 
                  : 'bg-slate-900/70 border-white/10 text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
                    <span>{sec.icon}</span> {sec.label}
                  </span>
                  {isWirelessActive ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/20 px-1.5 py-0.5 rounded-full border border-emerald-500/30">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      EN VIVO
                    </span>
                  ) : isWebcamActive ? (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-cyan-300 bg-cyan-500/20 px-1.5 py-0.5 rounded-full border border-cyan-500/30">
                      <span>📷</span> USB
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[9px] font-bold text-blue-300 bg-blue-500/20 px-1.5 py-0.5 rounded-full border border-blue-500/30">
                      <span>🦅</span> SIM
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">{sec.desc}</div>
              </div>

              {/* Controles de Fuente y Conexión para esta sección */}
              <div className="bg-black/50 rounded-xl p-2 border border-white/10 flex flex-col gap-1.5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between text-[9px]">
                  <span className="text-slate-400 font-mono">Cámara:</span>
                  <span className={`font-mono font-bold truncate max-w-[120px] ${
                    isWirelessActive ? 'text-emerald-400' : isWebcamActive ? 'text-cyan-300' : 'text-blue-300'
                  }`}>
                    {isWirelessActive ? `📱 ${cfg.label}` : isWebcamActive ? '📷 Web USB' : '🦅 Simulación'}
                  </span>
                </div>

                {/* Dropdown para reasignar cualquier celular o cámara a esta sección */}
                <select
                  value={cfg?.sourceType === 'wireless' ? `wireless:${cfg.wirelessId}` : (cfg?.sourceType || 'simulation')}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val.startsWith('wireless:')) {
                      const wId = val.split(':')[1];
                      const found = wirelessCams.find(c => c.id === wId);
                      setSectionConfigs(prev => ({
                        ...prev,
                        [sec.id]: { sourceType: 'wireless', wirelessId: wId, label: found?.label || 'Celular' }
                      }));
                    } else if (val === 'webcam') {
                      setSectionConfigs(prev => ({
                        ...prev,
                        [sec.id]: { sourceType: 'webcam', label: 'Cámara Web USB' }
                      }));
                    } else {
                      setSectionConfigs(prev => ({
                        ...prev,
                        [sec.id]: { sourceType: 'simulation', label: `Simulación ${sec.label}` }
                      }));
                    }
                  }}
                  className="w-full bg-slate-800 text-[10px] text-white rounded-lg px-2 py-1 border border-white/10 outline-none cursor-pointer"
                >
                  <option value="simulation">🦅 Simulación Oficial</option>
                  {localVideoRef.current && <option value="webcam">📷 Cámara Web USB</option>}
                  {wirelessCams.map((c, idx) => (
                    <option key={c.id} value={`wireless:${c.id}`}>
                      📱 {c.label || `Celular #${idx + 1}`}
                    </option>
                  ))}
                </select>

                {/* Botón para vincular un celular a esta sección vía QR */}
                <button
                  onClick={() => {
                    setModalSection(sec.id as CameraAngleType);
                    setShowQRModal(true);
                  }}
                  className="w-full bg-cyan-600/25 hover:bg-cyan-600/40 text-cyan-300 border border-cyan-400/30 text-[9px] font-bold py-1 rounded-lg uppercase tracking-wider flex items-center justify-center gap-1 transition"
                >
                  <span>📱</span> Conectar Celular
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Barra de Herramientas de Inspección Arbitral: Mover (Pan), Zoom y Círculo */}
      <div className="flex flex-wrap items-center justify-between gap-2 bg-[#080d19] border border-white/10 rounded-2xl p-2.5">
        {/* Modos de Interacción */}
        <div className="flex items-center gap-1.5 bg-black/60 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => setInteractionMode('pan')}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition ${
              interactionMode === 'pan' 
                ? 'bg-cyan-500 text-slate-950 shadow-[0_0_12px_rgba(34,211,238,0.5)]' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>✋</span> Mover Pantalla
          </button>
          <button
            onClick={() => {
              setInteractionMode('circle');
              setShowInspectionCircle(true);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition ${
              interactionMode === 'circle' && showInspectionCircle
                ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.7)] animate-pulse' 
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🎯</span> Círculo Desafío
          </button>
        </div>

        {/* Controles de Círculo Retícula */}
        {showInspectionCircle && (
          <div className="flex items-center gap-2 bg-red-950/40 border border-red-500/40 px-3 py-1 rounded-xl">
            <span className="text-[10px] font-bold text-red-300 uppercase tracking-wider">Tamaño Círculo:</span>
            {[30, 45, 65].map(rad => (
              <button
                key={rad}
                onClick={() => setCircleRadius(rad)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                  circleRadius === rad ? 'bg-red-500 text-white font-black' : 'text-slate-400 hover:text-white'
                }`}
              >
                {rad === 30 ? 'P' : rad === 45 ? 'M' : 'G'}
              </button>
            ))}
            <button
              onClick={() => setShowInspectionCircle(false)}
              className="text-slate-400 hover:text-red-400 text-xs ml-1 font-bold"
              title="Quitar círculo"
            >
              ✕
            </button>
          </div>
        )}

        {/* Controles de Zoom Digital y Reset */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-black/60 p-1 rounded-xl border border-white/10">
            {[1, 1.5, 2, 3, 4].map(z => (
              <button
                key={z}
                onClick={() => setZoomLevel(z)}
                className={`px-2 py-1 rounded text-[10px] font-black transition ${
                  zoomLevel === z ? 'bg-cyan-500 text-slate-950 shadow-md' : 'text-slate-400 hover:text-white'
                }`}
              >
                {z}x
              </button>
            ))}
          </div>

          <button
            onClick={() => {
              setZoomLevel(1);
              setPanOffset({ x: 0, y: 0 });
              setShowInspectionCircle(false);
            }}
            className="bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-bold px-2.5 py-1.5 rounded-xl border border-white/10 uppercase transition"
          >
            🔄 Reset
          </button>
        </div>
      </div>

      {/* Visor Principal con Lupa, Desplazamiento (Pan) y Círculo Retícula */}
      <div 
        className={`relative rounded-2xl overflow-hidden border-2 border-white/15 bg-black aspect-video max-h-[380px] shadow-2xl flex items-center justify-center select-none ${
          interactionMode === 'circle' ? 'cursor-crosshair' : isDragging ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onMouseDown={(e) => {
          const rect = previewCanvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          if (interactionMode === 'circle') {
            const scaleX = 640 / rect.width;
            const scaleY = 360 / rect.height;
            const clickX = Math.round((e.clientX - rect.left) * scaleX);
            const clickY = Math.round((e.clientY - rect.top) * scaleY);
            setCirclePos({ x: clickX, y: clickY });
            setShowInspectionCircle(true);
          } else {
            setIsDragging(true);
            setDragStart({ x: e.clientX, y: e.clientY });
          }
        }}
        onMouseMove={(e) => {
          if (!isDragging || interactionMode === 'circle') return;
          const rect = previewCanvasRef.current?.getBoundingClientRect();
          const scale = rect ? 640 / rect.width : 1;
          const dx = (e.clientX - dragStart.x) * scale;
          const dy = (e.clientY - dragStart.y) * scale;
          setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          setDragStart({ x: e.clientX, y: e.clientY });
        }}
        onMouseUp={() => setIsDragging(false)}
        onMouseLeave={() => setIsDragging(false)}
        onTouchStart={(e) => {
          const touch = e.touches[0];
          const rect = previewCanvasRef.current?.getBoundingClientRect();
          if (!rect || !touch) return;
          if (interactionMode === 'circle') {
            const scaleX = 640 / rect.width;
            const scaleY = 360 / rect.height;
            const touchX = Math.round((touch.clientX - rect.left) * scaleX);
            const touchY = Math.round((touch.clientY - rect.top) * scaleY);
            setCirclePos({ x: touchX, y: touchY });
            setShowInspectionCircle(true);
          } else {
            setIsDragging(true);
            setDragStart({ x: touch.clientX, y: touch.clientY });
          }
        }}
        onTouchMove={(e) => {
          if (!isDragging || interactionMode === 'circle') return;
          const touch = e.touches[0];
          const rect = previewCanvasRef.current?.getBoundingClientRect();
          if (!rect || !touch) return;
          const scale = 640 / rect.width;
          const dx = (touch.clientX - dragStart.x) * scale;
          const dy = (touch.clientY - dragStart.y) * scale;
          setPanOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }));
          setDragStart({ x: touch.clientX, y: touch.clientY });
        }}
        onTouchEnd={() => setIsDragging(false)}
      >
        <canvas 
          ref={previewCanvasRef} 
          width={640} 
          height={360} 
          className="w-full h-full object-contain pointer-events-none"
        />

        {/* Indicador de Transmisión al En Vivo (TV) */}
        {isLiveBroadcast && (
          <div className="absolute top-3 left-3 bg-red-600 text-white font-black text-[10px] px-3 py-1 rounded-lg uppercase tracking-widest animate-pulse border border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)] flex items-center gap-1.5 z-20 pointer-events-none">
            <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
            TRANSMITIENDO EN VIVO A LA SEÑAL TV
          </div>
        )}

        {/* Logo del torneo en el visor cuando está activo el Challenger */}
        {tournament?.logoUrl && (
          <div className="absolute top-3 right-3 z-20 pointer-events-none drop-shadow-lg">
            <img src={tournament.logoUrl} alt="Torneo" className="h-10 md:h-12 object-contain" />
          </div>
        )}

        {/* Si el ángulo es Ojo de Halcón, selector directo In / Out */}
        {selectedAngle === 'halcon' && (
          <div className="absolute bottom-3 left-3 z-20 flex items-center gap-2 bg-black/80 backdrop-blur p-1.5 rounded-xl border border-white/20">
            <span className="text-[10px] font-bold text-slate-300 uppercase">Simulación:</span>
            <button
              onClick={() => setHawkEyeIn(true)}
              className={`px-2.5 py-1 rounded text-xs font-black uppercase ${hawkEyeIn ? 'bg-green-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`}
            >
              🟢 BALÓN DENTRO (IN)
            </button>
            <button
              onClick={() => setHawkEyeIn(false)}
              className={`px-2.5 py-1 rounded text-xs font-black uppercase ${!hawkEyeIn ? 'bg-red-500 text-white' : 'bg-slate-800 text-slate-400'}`}
            >
              🔴 BALÓN FUERA (OUT)
            </button>
          </div>
        )}

        {/* Guía informativa interactiva */}
        <div className="absolute bottom-2.5 right-2.5 z-20 pointer-events-none bg-black/70 backdrop-blur px-2.5 py-1 rounded-xl border border-white/10 text-[9px] font-mono text-slate-300">
          {interactionMode === 'circle' ? '🎯 Clic en el video para colocar el círculo' : zoomLevel > 1 ? `🔍 Zoom ${zoomLevel}x • Arrastra para mover` : '🔍 Zoom 1x • Arrastra o selecciona modo'}
        </div>
      </div>


      {/* Barra de Tiempo del Búfer de 5 Minutos (Scrubbing / Playhead) */}
      <div className="bg-slate-950/80 p-3.5 rounded-2xl border border-white/10 flex flex-col gap-2 shadow-inner">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-slate-400">Posición:</span>
            <span className="font-bold text-cyan-300">
              {currentSecondsFromLive === 0 ? '🔴 EN VIVO (0s)' : `-${currentSecondsFromLive}s antes`}
            </span>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">
            Capacidad: 5 Minutos Continuos (Descarte automático de lo más antiguo)
          </span>
        </div>

        {/* Slider de tiempo */}
        <input 
          type="range"
          min={0}
          max={Math.max(1, totalFrames - 1)}
          value={playheadIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setPlayheadIndex(parseInt(e.target.value));
          }}
          className="w-full accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
        />

        {/* Controles de reproducción y velocidad en cámara lenta */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1 shadow ${
                isPlaying ? 'bg-amber-500 text-slate-950' : 'bg-green-500 text-slate-950'
              }`}
            >
              <span>{isPlaying ? '⏸️ Pausar' : '▶️ Reproducir'}</span>
            </button>

            {/* Cuadro a cuadro */}
            <button
              onClick={() => {
                setIsPlaying(false);
                setPlayheadIndex(prev => Math.max(0, prev - 1));
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold"
              title="Retroceder 1 Cuadro"
            >
              ◀ 1 Frame
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setPlayheadIndex(prev => Math.min(totalFrames - 1, prev + 1));
              }}
              className="bg-slate-800 hover:bg-slate-700 text-slate-200 px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold"
              title="Avanzar 1 Cuadro"
            >
              ▶ 1 Frame
            </button>

            {/* Ir al en vivo */}
            <button
              onClick={() => {
                setPlayheadIndex(Math.max(0, totalFrames - 1));
                setIsPlaying(true);
              }}
              className="bg-slate-800 hover:bg-slate-700 text-cyan-300 px-2.5 py-1.5 rounded-xl text-xs font-bold"
            >
              ⏱️ Ir al En Vivo
            </button>
          </div>

          {/* Selector de velocidad en cámara lenta */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase mr-1">Velocidad:</span>
            {[
              { val: 0.1, label: '0.1x Súper Lenta' },
              { val: 0.25, label: '0.25x' },
              { val: 0.5, label: '0.5x' },
              { val: 0.75, label: '0.75x' },
              { val: 1.0, label: '1.0x Normal' }
            ].map(spd => (
              <button
                key={spd.val}
                onClick={() => setPlaybackSpeed(spd.val)}
                className={`px-2 py-1 rounded-lg text-[10px] font-mono font-black ${
                  playbackSpeed === spd.val 
                    ? 'bg-cyan-500 text-slate-950 shadow' 
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {spd.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Configuración del Desafío y Emisión al En Vivo (TV) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 bg-slate-900/60 p-4 rounded-2xl border border-white/10">
        
        {/* Columna Izquierda: Datos del Desafío */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <span className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <span>⚖️</span> Detalles del Desafío (Challenger)
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Equipo que pide el desafío */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Equipo Solicitante:</label>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  onClick={() => setRequestingTeamId(teamA.id)}
                  className={`p-2 rounded-xl text-xs font-black uppercase truncate border transition ${
                    requestingTeamId === teamA.id 
                      ? 'bg-cyan-600 text-white border-cyan-300 shadow' 
                      : 'bg-slate-800 text-slate-400 border-white/5'
                  }`}
                >
                  🔵 {teamA.name.split(' ')[0]}
                </button>
                <button
                  onClick={() => setRequestingTeamId(teamB.id)}
                  className={`p-2 rounded-xl text-xs font-black uppercase truncate border transition ${
                    requestingTeamId === teamB.id 
                      ? 'bg-rose-600 text-white border-rose-300 shadow' 
                      : 'bg-slate-800 text-slate-400 border-white/5'
                  }`}
                >
                  🔴 {teamB.name.split(' ')[0]}
                </button>
              </div>
            </div>

            {/* Motivo del desafío */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase">Motivo del Desafío:</label>
              <select
                value={challengeType}
                onChange={(e) => {
                  const val = e.target.value as VarChallengeState['challengeType'];
                  setChallengeType(val);
                  if (val === 'net_touch') setChallengeLabel('TOQUE DE RED');
                  else if (val === 'attack_touch') setChallengeLabel('TOQUE DE BLOQUEO');
                  else if (val === 'in_out') setChallengeLabel('BALÓN DENTRO / FUERA');
                  else if (val === 'serve_foot') setChallengeLabel('FALTA DE PIE EN SAQUE');
                  else setChallengeLabel('REVISIÓN GENERAL');
                }}
                className="bg-black/60 border border-white/15 rounded-xl p-2 text-xs text-white outline-none focus:border-cyan-400"
              >
                <option value="net_touch">🏐 Toque de Red (Net Touch)</option>
                <option value="attack_touch">✋ Toque de Bloqueo / Manos</option>
                <option value="in_out">🦅 Balón Dentro / Fuera (In & Out)</option>
                <option value="serve_foot">🦶 Falta de Pie en Saque</option>
                <option value="general">🔍 Revisión General de Jugada</option>
              </select>
            </div>
          </div>

          {/* Veredicto Oficial */}
          <div className="flex flex-col gap-1.5 mt-1">
            <label className="text-[10px] font-bold text-slate-400 uppercase">Veredicto Oficial del Árbitro:</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {[
                { id: 'IN_PROGRESS', label: '⏳ En Revisión', color: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40' },
                { id: 'CONFIRMED', label: '✅ Decisión Confirmada', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' },
                { id: 'BALL_IN', label: '🟢 Balón Dentro (In)', color: 'bg-green-500/20 text-green-300 border-green-500/40' },
                { id: 'BALL_OUT', label: '🔴 Balón Fuera (Out)', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
                { id: 'TOUCH_NET', label: '🏐 Toque de Red', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
                { id: 'OVERTURNED', label: '❌ Decisión Revocada', color: 'bg-rose-500/20 text-rose-300 border-rose-500/40' }
              ].map(ver => (
                <button
                  key={ver.id}
                  onClick={() => handleSetVerdict(ver.id as VarChallengeState['verdict'])}
                  className={`p-2 rounded-xl text-xs font-black uppercase border transition ${
                    verdict === ver.id ? `${ver.color} shadow-lg scale-[1.02]` : 'bg-slate-800 text-slate-400 border-white/5 hover:text-white'
                  }`}
                >
                  {ver.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Columna Derecha: Botón de Transmisión al En Vivo (TV) */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-3 bg-black/40 p-4 rounded-2xl border border-white/10">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
              <span>📡</span> Control de Emisión al En Vivo (TV)
            </span>
            <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
              Al enviar al en vivo, la pantalla de televisión mostrará el rótulo del torneo, el equipo desafiante, el motivo del desafío y la repetición en cámara lenta seleccionada.
            </p>
          </div>

          <div className="flex flex-col gap-2 mt-2">
            {!isLiveBroadcast ? (
              <button
                onClick={() => handleBroadcastChallenge(true)}
                className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white font-black text-xs py-3.5 rounded-xl uppercase tracking-wider shadow-lg shadow-red-600/30 flex items-center justify-center gap-2 transition"
              >
                <span>📡</span> ENVIAR DESAFÍO AL EN VIVO (TV)
              </button>
            ) : (
              <button
                onClick={() => handleBroadcastChallenge(false)}
                className="w-full bg-gradient-to-r from-slate-700 to-slate-800 hover:bg-slate-600 active:scale-95 text-white font-black text-xs py-3.5 rounded-xl uppercase tracking-wider shadow border border-white/20 flex items-center justify-center gap-2 transition"
              >
                <span>⏹️</span> FINALIZAR DESAFÍO Y VOLVER AL PARTIDO
              </button>
            )}

            <button
              onClick={() => {
                const list = buffersRef.current[selectedAngle];
                if (list.length > 0) {
                  const clip = list[Math.min(playheadIndex, list.length - 1)];
                  const a = document.createElement('a');
                  a.href = clip.dataUrl;
                  a.download = `var_clip_${challengeType}_${Date.now()}.jpg`;
                  a.click();
                }
              }}
              className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold py-2 rounded-xl uppercase transition flex items-center justify-center gap-1.5 border border-white/10"
            >
              <span>💾</span> Descargar Fotograma Clave del Desafío
            </button>
          </div>
        </div>

      </div>

      {/* Modal para conectar Celular VAR por Sección */}
      {showQRModal && (() => {
        const targetSection = modalSection || selectedAngle;
        const sectionLabels: Record<CameraAngleType, { name: string; icon: string; desc: string }> = {
          attack: { name: 'Ataque / Bloqueo (Red)', icon: '🏐', desc: 'Ubica este celular apuntando a la red central para revisar toques de malla o dedos en bloqueo.' },
          serve: { name: 'Línea de Saque (Fondo)', icon: '🚀', desc: 'Ubica este celular apuntando a la línea de fondo para verificar faltas de pie en el saque.' },
          halcon: { name: 'Ojo de Halcón (Línea In/Out)', icon: '🦅', desc: 'Ubica este celular paralelo a la línea lateral o de fondo para repeticiones milimétricas in/out.' },
          crowd: { name: 'Vista General (Cancha)', icon: '👥', desc: 'Ubica este celular con plano amplio de la cancha y bancos para seguimiento táctico general.' },
          wireless: { name: 'Cámara Móvil Auxiliar', icon: '📱', desc: 'Cámara celular libre para operadores en cancha o repeticiones dinámicas.' }
        };
        const currentSecInfo = sectionLabels[targetSection] || sectionLabels.attack;
        const directUrl = getVarDirectUrl(match.matchId, targetSection, currentSecInfo.name);

        return (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 bg-black/85 backdrop-blur-md animate-in fade-in duration-200">
            <div className="bg-[#0f172a] border border-cyan-500/40 rounded-3xl max-w-lg w-full p-5 text-white flex flex-col gap-4 shadow-2xl relative">
              <button 
                onClick={() => setShowQRModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-white text-base w-8 h-8 rounded-full bg-white/5 flex items-center justify-center transition"
              >
                ✕
              </button>

              <div className="text-center flex flex-col items-center gap-1.5">
                <span className="text-3xl">{currentSecInfo.icon}</span>
                <div className="flex items-center gap-2">
                  <span className="bg-cyan-500 text-slate-950 font-black text-[9px] px-2 py-0.5 rounded uppercase tracking-wider">
                    SECCIÓN ASIGNADA
                  </span>
                  <span className="text-xs font-mono text-cyan-300 font-bold uppercase">
                    {targetSection.toUpperCase()}
                  </span>
                </div>
                <h3 className="text-base md:text-lg font-black uppercase text-white">
                  Conectar Celular a: {currentSecInfo.name}
                </h3>
                <p className="text-xs text-slate-400 max-w-md">
                  {currentSecInfo.desc}
                </p>
              </div>

              {/* Selector de Sección dentro del modal para cambiar rápido */}
              <div className="flex flex-wrap gap-1 justify-center bg-black/40 p-1.5 rounded-xl border border-white/5">
                {(['attack', 'serve', 'halcon', 'crowd', 'wireless'] as CameraAngleType[]).map(sKey => (
                  <button
                    key={sKey}
                    onClick={() => setModalSection(sKey)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition flex items-center gap-1 ${
                      targetSection === sKey ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{sectionLabels[sKey].icon}</span>
                    <span>{sectionLabels[sKey].name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>

              {/* Código QR con Enlace Directo Configurado */}
              <div className="bg-black/60 p-4 rounded-2xl flex flex-col items-center gap-3 border border-white/10">
                <div className="bg-white p-3 rounded-2xl shadow-xl">
                  <QRCodeSVG value={directUrl} size={160} />
                </div>
                <div className="text-center">
                  <div className="font-mono font-bold text-cyan-300 text-xs">
                    PARTIDO: <span className="text-white">{match.matchId}</span>
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                    Canal: <span className="text-amber-300 uppercase">{targetSection}</span>
                  </div>
                </div>
              </div>

              {/* Guía Paso a Paso */}
              <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex flex-col gap-1 text-[11px] text-slate-300">
                <div className="font-bold text-white text-xs mb-1 flex items-center gap-1.5">
                  <span>📖</span> Instrucciones de Conexión:
                </div>
                <div>1. Abre la app de Cámara en tu teléfono móvil y enfoca el código QR.</div>
                <div>2. Toca el enlace amarillo en tu teléfono y autoriza el uso de la cámara.</div>
                <div>3. Presiona el botón verde <strong className="text-white">"COMENZAR TRANSMISIÓN"</strong> en el celular.</div>
                <div>4. ¡Listo! Esta sección grabará de inmediato los últimos 5 minutos de video para repeticiones lentas.</div>
              </div>

              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    if (navigator.clipboard) {
                      navigator.clipboard.writeText(directUrl);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold py-2.5 rounded-xl uppercase transition border border-white/10 flex items-center justify-center gap-1.5"
                >
                  <span>📋</span> {copiedLink ? '✅ ¡Enlace Copiado!' : 'Copiar Enlace'}
                </button>

                <button 
                  onClick={() => setShowQRModal(false)}
                  className="flex-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black py-2.5 rounded-xl uppercase transition shadow-lg shadow-cyan-500/20"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        );
      })()}

    </div>
  );
};
