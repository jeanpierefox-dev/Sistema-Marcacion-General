import React, { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';
import { PEER_CONFIG, getVarPeerId } from '../constants/peerConfig';

interface VARTransmitterProps {
  onExit: () => void;
}

export const VARTransmitter: React.FC<VARTransmitterProps> = ({ onExit }) => {
  const [matchId, setMatchId] = useState('');
  const [cameraLabel, setCameraLabel] = useState('Cámara Celular VAR');
  const [assignedSection, setAssignedSection] = useState<'attack' | 'serve' | 'halcon' | 'crowd' | 'wireless'>('wireless');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);

  // 1. Leer Match ID y Sección asignada de la URL
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlMatchId = params.get('var') || params.get('var_code') || params.get('matchId') || params.get('id');
        let currentMatchId = '';
        if (urlMatchId) {
          currentMatchId = urlMatchId.trim();
          setMatchId(currentMatchId);
        }

        const sec = params.get('section') || params.get('sec');
        let secLabel = 'Cámara Celular VAR';
        if (sec) {
          setAssignedSection(sec as any);
          if (sec === 'attack') secLabel = 'Cámara de Red / Ataque';
          else if (sec === 'serve') secLabel = 'Cámara de Saque / Fondo';
          else if (sec === 'halcon') secLabel = 'Cámara de Línea In/Out';
          else if (sec === 'crowd') secLabel = 'Cámara Vista General';
        }

        const lbl = params.get('label');
        if (lbl) {
          secLabel = decodeURIComponent(lbl);
        }
        setCameraLabel(secLabel);

        // Auto-iniciar transmisión si se abre desde el código QR con el Match ID
        if (currentMatchId) {
          initAndAutoConnect(currentMatchId, secLabel, (sec as any) || 'wireless');
        }
      }
    } catch (e) {
      console.warn("Error leyendo parámetros de cámara VAR:", e);
    }
  }, []);

  // 2. Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopTransmission();
    };
  }, []);

  const startLocalCamera = async (preferredFacing: 'environment' | 'user' = facingMode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: { 
          facingMode: preferredFacing, 
          width: { ideal: 1280 }, 
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: false // Sin audio para repeticiones VAR
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Autoplay:", e));
      }
      return stream;
    } catch (err: any) {
      console.error("Error al iniciar cámara:", err);
      setErrorMessage("No se pudo acceder a la cámara. Por favor autoriza los permisos en el navegador.");
      setStatus('error');
      return null;
    }
  };

  const connectToMaster = (activeStream: MediaStream, targetMatchId = matchId, label = cameraLabel, section = assignedSection) => {
    const cleanId = targetMatchId.trim();
    if (!cleanId) {
      setErrorMessage("Código de partido no especificado.");
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setErrorMessage('');
    
    // Iniciar cliente PeerJS
    const peer = new Peer(PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', (localId) => {
      console.log('Transmitter Peer ID asignado:', localId);
      const targetMasterId = getVarPeerId(cleanId);
      console.log('Llamando a consola VAR:', targetMasterId);
      
      const call = peer.call(targetMasterId, activeStream, {
        metadata: { 
          label: label || 'Cámara Celular',
          section: section || 'wireless'
        }
      });

      if (!call) {
        setStatus('error');
        setErrorMessage("No se pudo iniciar el canal WebRTC hacia la consola.");
        return;
      }

      call.on('close', () => {
        if (status === 'streaming') {
          setStatus('idle');
          setErrorMessage("Se cerró la conexión con la consola VAR.");
        }
      });

      call.on('error', (err) => {
        console.error("Error en llamada:", err);
        setStatus('error');
        setErrorMessage("Error de conexión: " + (err.message || 'Desconectado'));
      });

      setStatus('streaming');
    });

    peer.on('error', (err: any) => {
      console.error("Error PeerJS en Transmisor:", err);
      setStatus('error');
      if (err.type === 'peer-unavailable') {
        setErrorMessage(`No se encontró la consola VAR (${cleanId}). Asegúrate de tener abierta la Consola de Desafío en la PC.`);
      } else {
        setErrorMessage("Error de conexión: " + (err.message || err.type || 'Fallo de red'));
      }
    });

    peer.on('disconnected', () => {
      if (status === 'streaming') {
        setStatus('idle');
      }
    });
  };

  const initAndAutoConnect = async (cleanMatchId: string, label: string, section: any) => {
    const stream = await startLocalCamera('environment');
    if (stream) {
      connectToMaster(stream, cleanMatchId, label, section);
    }
  };

  // Alternar entre cámara trasera y delantera
  const toggleFacingMode = async () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    const newStream = await startLocalCamera(newFacing);
    if (newStream && status === 'streaming') {
      if (peerRef.current) {
        try { peerRef.current.destroy(); } catch(e){}
      }
      connectToMaster(newStream);
    }
  };

  const stopTransmission = () => {
    if (peerRef.current) {
      try { peerRef.current.destroy(); } catch (e) {}
      peerRef.current = null;
    }
    if (streamRef.current) {
      try { streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  };

  const handleManualStart = async () => {
    if (!matchId.trim()) {
      setErrorMessage("Por favor ingresa el código del partido.");
      return;
    }
    const stream = await startLocalCamera(facingMode);
    if (stream) {
      connectToMaster(stream, matchId, cameraLabel, assignedSection);
    }
  };

  // INTERFAZ LIMPIA FULL-SCREEN: Solo la cámara grabando sin botones de configuración molestos
  return (
    <div className="fixed inset-0 w-full h-full bg-black text-white overflow-hidden select-none touch-none">
      
      {/* Video en Vivo de la Cámara a Pantalla Completa */}
      <video 
        ref={videoRef}
        autoPlay 
        playsInline 
        muted 
        className="absolute inset-0 w-full h-full object-cover z-0"
      />

      {/* Rótulo Superior Minimalista: Estado de Transmisión */}
      <div className="absolute top-4 inset-x-4 z-30 flex items-center justify-between pointer-events-none">
        <div className="flex items-center gap-2 bg-black/75 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/20 shadow-xl pointer-events-auto">
          {status === 'streaming' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse"></span>
              <span className="text-[11px] font-black uppercase tracking-wider text-white">
                🔴 GRABANDO • {cameraLabel}
              </span>
            </>
          ) : status === 'connecting' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 animate-spin"></span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-yellow-300">
                CONECTANDO AL VAR...
              </span>
            </>
          ) : status === 'error' ? (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-300">
                ERROR DE CONEXIÓN
              </span>
            </>
          ) : (
            <>
              <span className="w-2.5 h-2.5 rounded-full bg-slate-400"></span>
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
                LISTO PARA TRANSMITIR
              </span>
            </>
          )}
        </div>

        {/* Botones Flotantes Mínimos (Cambiar Lente y Salir) */}
        <div className="flex items-center gap-2 pointer-events-auto">
          <button
            onClick={toggleFacingMode}
            className="w-10 h-10 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center text-base shadow-xl active:scale-95 transition"
            title="Cambiar Cámara Delantera / Trasera"
          >
            🔄
          </button>
          
          <button 
            onClick={onExit}
            className="w-10 h-10 rounded-full bg-black/70 backdrop-blur-md border border-white/20 text-white flex items-center justify-center text-sm font-bold shadow-xl active:scale-95 transition"
            title="Cerrar Transmisión"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Marca de agua de encuadre VAR (Líneas sutiles de referencia de cancha) */}
      <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
        <div className="w-[85%] h-[75%] border border-white/15 rounded-3xl relative">
          <div className="absolute top-2 left-3 text-[9px] font-mono text-white/40 uppercase tracking-widest">
            VAR CHALLENGE • 720p HD 30 FPS
          </div>
          {/* Pequeñas cruces en las esquinas */}
          <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-cyan-400"></div>
          <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-cyan-400"></div>
          <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-cyan-400"></div>
          <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-cyan-400"></div>
        </div>
      </div>

      {/* Si no está transmitiendo, pantalla simple para iniciar con 1 toque */}
      {status !== 'streaming' && status !== 'connecting' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md z-40 flex flex-col items-center justify-center p-6 text-center">
          <div className="max-w-sm w-full bg-slate-900/90 border border-white/15 p-6 rounded-3xl shadow-2xl flex flex-col gap-4">
            <span className="text-4xl">📹</span>
            <div>
              <h2 className="text-lg font-black uppercase text-white tracking-wide">
                Cámara de Desafío VAR
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                {cameraLabel ? `Sección: ${cameraLabel}` : 'Transmite la cámara de este teléfono a la consola central.'}
              </p>
            </div>

            {errorMessage && (
              <div className="bg-red-500/20 border border-red-500/40 text-red-200 p-2.5 rounded-xl text-xs text-left">
                {errorMessage}
              </div>
            )}

            {!matchId && (
              <input
                type="text"
                placeholder="CÓDIGO DEL PARTIDO"
                value={matchId}
                onChange={e => setMatchId(e.target.value)}
                className="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-2.5 text-center text-sm font-mono uppercase tracking-widest text-white outline-none focus:border-cyan-400"
              />
            )}

            <button
              onClick={handleManualStart}
              className="w-full bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-black text-sm py-3.5 rounded-2xl uppercase tracking-wider shadow-lg shadow-red-600/30 active:scale-95 transition"
            >
              🔴 Comenzar a Filmar
            </button>

            <button
              onClick={onExit}
              className="text-xs text-slate-400 hover:text-white uppercase tracking-wider py-1"
            >
              Cancelar y Salir
            </button>
          </div>
        </div>
      )}

      {/* Rótulo inferior sutil: Todo se controla desde la PC */}
      <div className="absolute bottom-4 inset-x-4 z-20 flex justify-center pointer-events-none">
        <div className="bg-black/60 backdrop-blur-sm text-slate-300 text-[10px] px-3.5 py-1 rounded-full border border-white/10 uppercase tracking-widest font-mono">
          Controlado desde el Panel Arbitral
        </div>
      </div>

    </div>
  );
};
