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
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const [connectedHostId, setConnectedHostId] = useState('');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);

  // Leer Match ID y Sección asignada de la URL
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search);
        const urlMatchId = params.get('var') || params.get('var_code') || params.get('matchId') || params.get('id');
        if (urlMatchId) {
          setMatchId(urlMatchId.trim());
        }

        const sec = params.get('section') || params.get('sec');
        if (sec) {
          setAssignedSection(sec as any);
          if (sec === 'attack') setCameraLabel('Cámara Ataque / Red');
          else if (sec === 'serve') setCameraLabel('Cámara Saque / Fondo');
          else if (sec === 'halcon') setCameraLabel('Cámara Línea / In & Out');
          else if (sec === 'crowd') setCameraLabel('Cámara Vista General');
        }

        const lbl = params.get('label');
        if (lbl) {
          setCameraLabel(decodeURIComponent(lbl));
        }

        if (urlMatchId) return;
      }

      const liveState = localStorage.getItem('vnl_liveMatch');
      if (liveState) {
        const parsed = JSON.parse(liveState);
        if (parsed && parsed.matchId) {
          setMatchId(parsed.matchId);
        }
      }
    } catch (e) {
      console.warn("No se pudo leer el Match ID inicial:", e);
    }
  }, []);

  // Enumerar cámaras del dispositivo móvil
  useEffect(() => {
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).catch(() => {});
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoInputs);
        if (videoInputs.length > 0) {
          // Preferir cámara trasera por defecto
          const backCam = videoInputs.find(d => 
            d.label.toLowerCase().includes('back') || 
            d.label.toLowerCase().includes('environment') || 
            d.label.toLowerCase().includes('trasera')
          );
          setSelectedDeviceId(backCam ? backCam.deviceId : videoInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error al enumerar dispositivos de video:", err);
      }
    }
    getDevices();
  }, []);

  // Limpieza al desmontar
  useEffect(() => {
    return () => {
      stopTransmission();
    };
  }, []);

  const startLocalCamera = async (deviceId?: string, preferredFacing: 'environment' | 'user' = facingMode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId 
          ? { deviceId: { exact: deviceId } } 
          : { facingMode: preferredFacing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false // No se requiere audio para repeticiones VAR
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn("Autoplay bloqueado:", e));
      }
      return stream;
    } catch (err: any) {
      console.error("Error al iniciar cámara local:", err);
      setErrorMessage("No se pudo acceder a la cámara: " + (err.message || err.name));
      setStatus('error');
      return null;
    }
  };

  // Alternar entre cámara trasera y delantera
  const toggleFacingMode = async () => {
    const newFacing = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacing);
    setSelectedDeviceId('');
    const newStream = await startLocalCamera(undefined, newFacing);
    if (newStream && status === 'streaming') {
      // Re-establecer llamada
      stopTransmission();
      connectToMaster(newStream);
    }
  };

  // Cambiar dispositivo de cámara seleccionado
  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (status === 'streaming') {
      setStatus('connecting');
      const newStream = await startLocalCamera(deviceId);
      if (newStream && matchId) {
        try {
          if (peerRef.current) peerRef.current.destroy();
        } catch(e){}
        connectToMaster(newStream);
      } else {
        setStatus('idle');
      }
    } else {
      startLocalCamera(deviceId);
    }
  };

  const connectToMaster = (activeStream: MediaStream) => {
    if (!matchId.trim()) {
      setErrorMessage("Por favor ingresa el código del partido.");
      setStatus('error');
      return;
    }

    setStatus('connecting');
    setErrorMessage('');
    
    // Iniciar cliente PeerJS con servidores STUN confiables
    const peer = new Peer(PEER_CONFIG);
    peerRef.current = peer;

    peer.on('open', (localId) => {
      console.log('Transmitter Peer ID asignado:', localId);
      
      // ID determinista del receptor en la PC (TV Overlay)
      const targetMasterId = getVarPeerId(matchId);
      setConnectedHostId(targetMasterId);
      console.log('Llamando a receptor VAR:', targetMasterId);
      
      const call = peer.call(targetMasterId, activeStream, {
        metadata: { 
          label: cameraLabel || 'Cámara Inalámbrica Celular',
          section: assignedSection || 'wireless'
        }
      });

      if (!call) {
        setStatus('error');
        setErrorMessage("No se pudo inicializar la llamada WebRTC hacia la pantalla.");
        return;
      }

      call.on('close', () => {
        console.log("Llamada cerrada por el receptor principal");
        if (status === 'streaming') {
          setStatus('idle');
          setErrorMessage("Se cerró la conexión con la pantalla principal.");
        }
      });

      call.on('error', (err) => {
        console.error("Error en llamada WebRTC:", err);
        setStatus('error');
        setErrorMessage("Error de conexión con la pantalla TV: " + (err.message || 'Desconectado'));
      });

      setStatus('streaming');
    });

    peer.on('error', (err: any) => {
      console.error("Error PeerJS en Transmisor:", err);
      setStatus('error');
      if (err.type === 'peer-unavailable') {
        setErrorMessage(`No se encontró la pantalla del partido (${matchId.trim()}). Asegúrate de que en la computadora esté abierta la pantalla en "Modo TV Overlay" antes de conectar el celular.`);
      } else if (err.type === 'network') {
        setErrorMessage("Problema de red o firewall. Ambos dispositivos deben tener acceso a internet.");
      } else {
        setErrorMessage("Error de conexión: " + (err.message || err.type || 'Fallo desconocido'));
      }
    });

    peer.on('disconnected', () => {
      console.log("Transmisor Peer desconectado del servidor de señalización");
      if (status === 'streaming') {
        setStatus('idle');
      }
    });
  };

  const startTransmission = async () => {
    if (!matchId.trim()) {
      setErrorMessage("Por favor ingresa el código del partido.");
      setStatus('error');
      return;
    }

    let activeStream = streamRef.current;
    if (!activeStream) {
      activeStream = await startLocalCamera(selectedDeviceId);
    }

    if (!activeStream) {
      setErrorMessage("Activa los permisos de la cámara en el navegador de tu celular para continuar.");
      return;
    }

    connectToMaster(activeStream);
  };

  const stopTransmission = () => {
    if (peerRef.current) {
      try {
        peerRef.current.destroy();
      } catch (e) {}
      peerRef.current = null;
    }
    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {}
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setStatus('idle');
  };

  // Iniciar cámara local de preview al montar
  useEffect(() => {
    startLocalCamera(selectedDeviceId);
  }, []);

  return (
    <div className="min-h-screen bg-[#070b14] text-white flex flex-col p-3 md:p-6 relative overflow-x-hidden font-sans">
      
      {/* Luces y fondos ambientales */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-cyan-500/10 rounded-full blur-[90px]"></div>
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-red-500/10 rounded-full blur-[90px]"></div>
      </div>

      {/* Barra Superior */}
      <div className="flex items-center justify-between z-10 border-b border-white/10 pb-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-cyan-500/20 border border-cyan-400/30 p-2.5 rounded-xl text-cyan-400 shadow-md">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 font-black px-1.5 py-0.5 rounded uppercase tracking-wider">
                VAR Móvil
              </span>
              <h1 className="text-base md:text-lg font-black tracking-tight uppercase">Cámara Inalámbrica</h1>
            </div>
            <p className="text-slate-400 text-xs">Transmite la cámara de tu celular a la PC para repetición en cámara lenta</p>
          </div>
        </div>
        <button 
          onClick={onExit}
          className="px-3.5 py-2 bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-bold uppercase rounded-xl border border-white/10 transition-all"
        >
          ✕ Salir
        </button>
      </div>

      {/* Cuadrícula Principal */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 z-10 max-w-6xl mx-auto w-full items-start">
        
        {/* Columna Izquierda - Visor de Cámara */}
        <div className="lg:col-span-7 flex flex-col bg-[#0f172a] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative aspect-video md:min-h-[380px]">
          
          <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover z-0"
          />

          {/* Botón flotante para alternar cámara Frontal/Trasera */}
          <div className="absolute top-3 right-3 z-20 flex gap-2">
            <button
              onClick={toggleFacingMode}
              className="bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-xs font-bold px-3 py-1.5 rounded-lg border border-white/20 flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
              title="Cambiar Cámara Trasera / Delantera"
            >
              <span>🔄</span> {facingMode === 'environment' ? 'Trasera' : 'Frontal'}
            </button>
          </div>

          {/* Información superpuesta sobre el video */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 pointer-events-none flex flex-col justify-end p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs bg-black/60 text-slate-200 px-2.5 py-1 rounded-md backdrop-blur-md border border-white/10 uppercase tracking-wider font-mono">
                  {cameraLabel || 'Cámara Celular'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">720p HD • WebRTC P2P • Baja Latencia</p>
              </div>
              
              {status === 'streaming' && (
                <div className="flex items-center gap-2 bg-red-600 text-white font-black px-3 py-1 rounded-md text-[10px] uppercase tracking-widest animate-pulse border border-red-400 shadow-[0_0_15px_rgba(239,68,68,0.7)]">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                  EN VIVO AL VAR
                </div>
              )}
            </div>
          </div>

          {status === 'idle' && (
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[1px] flex items-center justify-center z-10 pointer-events-none p-4 text-center">
              <span className="text-xs text-white/80 bg-black/70 border border-white/10 px-4 py-2 rounded-lg">
                Vista previa de la cámara activa • Presiona "Conectar y Transmitir"
              </span>
            </div>
          )}
        </div>

        {/* Columna Derecha - Controles y Estado */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Panel de Control */}
          <div className="bg-[#0f172a] border border-white/10 p-5 rounded-2xl flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-400">
                Estado de Conexión
              </h2>
              {status === 'streaming' && (
                <span className="text-[9px] bg-green-500/20 text-green-400 border border-green-500/40 px-2 py-0.5 rounded-full font-bold">
                  Sincronizado
                </span>
              )}
            </div>
            
            {/* Indicador de estado */}
            <div className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
              status === 'streaming' 
                ? 'bg-green-950/40 border-green-500/40 text-green-300' 
                : status === 'connecting'
                  ? 'bg-yellow-950/40 border-yellow-500/40 text-yellow-300'
                  : status === 'error'
                    ? 'bg-red-950/40 border-red-500/40 text-red-300'
                    : 'bg-black/40 border-white/10 text-slate-300'
            }`}>
              <div className={`w-4 h-4 rounded-full shrink-0 ${
                status === 'streaming' ? 'bg-green-400 shadow-[0_0_10px_#4ade80] animate-pulse' :
                status === 'connecting' ? 'bg-yellow-400 animate-spin border-2 border-slate-900 border-t-transparent' :
                status === 'error' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : 'bg-slate-500'
              }`}></div>
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-wider">
                  {status === 'streaming' ? '¡Conectado y Transmitiendo!' :
                   status === 'connecting' ? 'Conectando con la PC...' :
                   status === 'error' ? 'No se pudo conectar' : 'Esperando para conectar'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5 truncate">
                  {status === 'streaming' ? `Transmitiendo al receptor: ${connectedHostId}` :
                   status === 'connecting' ? 'Negociando enlace WebRTC con servidores STUN...' :
                   status === 'error' ? 'Revisa que la PC tenga el TV Overlay abierto' : 'Introduce el código del partido abajo.'}
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-300 p-3 rounded-xl text-xs leading-relaxed">
                <div className="font-bold flex items-center gap-1.5 mb-1">
                  <span>⚠️</span> Mensaje del Sistema:
                </div>
                {errorMessage}
              </div>
            )}

            {/* Inputs de configuración */}
            <div className="flex flex-col gap-3.5">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider flex items-center justify-between">
                  <span>Código del Partido (Match ID)</span>
                  <span className="text-[9px] text-cyan-400 font-normal">Obligatorio</span>
                </label>
                <input 
                  type="text"
                  value={matchId}
                  onChange={(e) => setMatchId(e.target.value)}
                  disabled={status === 'streaming' || status === 'connecting'}
                  placeholder="Ej. part_123 o 1"
                  className="bg-black/50 border border-white/15 rounded-xl px-3.5 py-2.5 text-sm focus:border-cyan-400 outline-none uppercase font-mono disabled:opacity-50 text-white placeholder-slate-600 shadow-inner"
                />
                <p className="text-[9px] text-slate-400">
                  El código aparece en el botón "📱 Conectar Celular (Cámara VAR)" de la pantalla de PC.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider">
                  Sección del Challenger Asignada:
                </label>
                <div className="grid grid-cols-2 gap-1.5">
                  {[
                    { id: 'attack', label: '🏐 Ataque / Red' },
                    { id: 'serve', label: '🚀 Saque / Fondo' },
                    { id: 'halcon', label: '🦅 Línea In / Out' },
                    { id: 'crowd', label: '👥 Vista General' }
                  ].map(sec => (
                    <button
                      key={sec.id}
                      type="button"
                      disabled={status === 'streaming' || status === 'connecting'}
                      onClick={() => {
                        setAssignedSection(sec.id as any);
                        setCameraLabel(sec.label);
                      }}
                      className={`py-1.5 px-2 rounded-lg text-[10px] font-bold uppercase transition border ${
                        assignedSection === sec.id 
                          ? 'bg-cyan-500 text-slate-950 border-cyan-300 font-black shadow-md' 
                          : 'bg-black/40 text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {sec.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider">
                  Nombre de esta Cámara
                </label>
                <input 
                  type="text"
                  value={cameraLabel}
                  onChange={(e) => setCameraLabel(e.target.value)}
                  disabled={status === 'streaming' || status === 'connecting'}
                  placeholder="Ej. Celular Red / Lateral A"
                  className="bg-black/50 border border-white/15 rounded-xl px-3.5 py-2 text-xs focus:border-cyan-400 outline-none disabled:opacity-50 text-white shadow-inner"
                />
              </div>

              {devices.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-black text-slate-300 uppercase tracking-wider">
                    Lente / Cámara Activa
                  </label>
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => handleDeviceChange(e.target.value)}
                    className="bg-black/50 border border-white/15 rounded-xl p-2.5 text-xs text-white outline-none focus:border-cyan-400"
                  >
                    {devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-slate-900 text-white">
                        {d.label || `Cámara ${devices.indexOf(d) + 1}`}
                      </option>
                    ))}
                  </select>
                </div>
              )}

            </div>

            {/* Botón de Acción Principal */}
            <div className="mt-2">
              {status === 'streaming' || status === 'connecting' ? (
                <button
                  onClick={stopTransmission}
                  className="w-full bg-red-600 hover:bg-red-700 active:scale-95 text-white text-xs font-black py-3.5 rounded-xl uppercase tracking-wider transition-all shadow-lg shadow-red-600/30 flex items-center justify-center gap-2"
                >
                  <span>⏹️</span> Detener Transmisión
                </button>
              ) : (
                <button
                  onClick={startTransmission}
                  disabled={!matchId.trim()}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 active:scale-95 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-black text-xs py-3.5 rounded-xl uppercase tracking-wider transition-all shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2"
                >
                  <span>📡</span> Conectar y Transmitir
                </button>
              )}
            </div>

          </div>

          {/* Guía Paso a Paso */}
          <div className="bg-[#0f172a]/70 border border-white/10 p-4 rounded-2xl text-slate-300 text-xs leading-relaxed flex flex-col gap-2">
            <h3 className="text-white font-black text-xs uppercase tracking-wider flex items-center gap-1.5">
              <span>📖</span> Paso a Paso para Conectar el Celular:
            </h3>
            <ol className="list-decimal list-inside space-y-1 text-slate-300 text-[11px]">
              <li>En la computadora, entra a la app y pulsa <strong className="text-cyan-400">"Modo TV Overlay"</strong> del partido.</li>
              <li>En la barra o en los controles VAR de la PC, pulsa <strong className="text-white">"📱 Conectar Celular"</strong>.</li>
              <li>Aparecerá un <strong>Código QR</strong> y un <strong>Código de Partido</strong>.</li>
              <li>Escanea el QR con este celular o escribe el código en el campo de arriba y pulsa <strong>"Conectar y Transmitir"</strong>.</li>
              <li>¡Listo! Tu celular aparecerá en el panel de repetición de la PC para revisar jugadas dudosas.</li>
            </ol>
          </div>

        </div>

      </div>

    </div>
  );
};
