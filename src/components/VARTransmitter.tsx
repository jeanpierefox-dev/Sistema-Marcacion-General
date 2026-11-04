import React, { useEffect, useRef, useState } from 'react';
import { Peer } from 'peerjs';

interface VARTransmitterProps {
  onExit: () => void;
}

export const VARTransmitter: React.FC<VARTransmitterProps> = ({ onExit }) => {
  const [matchId, setMatchId] = useState('');
  const [cameraLabel, setCameraLabel] = useState('Cámara Inalámbrica');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'streaming' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const peerRef = useRef<Peer | null>(null);

  // Load active match from local storage if available
  useEffect(() => {
    try {
      const liveState = localStorage.getItem('vnl_liveMatch');
      if (liveState) {
        const parsed = JSON.parse(liveState);
        if (parsed && parsed.matchId) {
          setMatchId(parsed.matchId);
        }
      }
    } catch (e) {
      console.warn("Could not read match ID from local storage", e);
    }
  }, []);

  // Enumerate video devices on mount
  useEffect(() => {
    async function getDevices() {
      try {
        await navigator.mediaDevices.getUserMedia({ video: true }).catch(() => {});
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = allDevices.filter(d => d.kind === 'videoinput');
        setDevices(videoInputs);
        if (videoInputs.length > 0) {
          // Prefer back camera by default
          const backCam = videoInputs.find(d => d.label.toLowerCase().includes('back') || d.label.toLowerCase().includes('environment') || d.label.toLowerCase().includes('trasera'));
          setSelectedDeviceId(backCam ? backCam.deviceId : videoInputs[0].deviceId);
        }
      } catch (err) {
        console.error("Error enumerating devices", err);
      }
    }
    getDevices();
  }, []);

  // Stop camera and peer connections on unmount
  useEffect(() => {
    return () => {
      stopTransmission();
    };
  }, []);

  const startLocalCamera = async (deviceId: string) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' },
        audio: false // No audio needed for VAR replays
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(e => console.warn(e));
      }
      return stream;
    } catch (err: any) {
      console.error("Error starting local camera", err);
      setErrorMessage("No se pudo acceder a la cámara seleccionada: " + (err.message || err.name));
      setStatus('error');
      return null;
    }
  };

  // Switch camera source on the fly
  const handleDeviceChange = async (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (status === 'streaming') {
      setStatus('connecting');
      const newStream = await startLocalCamera(deviceId);
      if (newStream && peerRef.current && matchId) {
        // Re-establish call
        try {
          peerRef.current.destroy();
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
    setStatus('connecting');
    setErrorMessage('');
    
    // Create a peer with a random ID
    const peer = new Peer();
    peerRef.current = peer;

    peer.on('open', (id) => {
      console.log('Transmitter Peer ID:', id);
      
      // Call the master screen (which hosts `${matchId}-var`)
      const masterPeerId = `${matchId}-var`;
      console.log('Calling master at:', masterPeerId);
      
      const call = peer.call(masterPeerId, activeStream, {
        metadata: { label: cameraLabel }
      });

      // Handle call errors/close
      call.on('close', () => {
        console.log("Call closed by master");
        if (status === 'streaming') {
          setStatus('idle');
          setErrorMessage("Se perdió la conexión con la pantalla principal.");
        }
      });

      call.on('error', (err) => {
        console.error("Call error", err);
        setStatus('error');
        setErrorMessage("Error en la llamada de video WebRTC.");
      });

      // If call is accepted or active, update status
      setStatus('streaming');
    });

    peer.on('error', (err) => {
      console.error("PeerJS Transmitter error:", err);
      setStatus('error');
      if (err.type === 'peer-unavailable') {
        setErrorMessage(`No se encontró la pantalla principal del partido. Asegúrate de que el partido con ID "${matchId}" esté en modo TV Overlay.`);
      } else {
        setErrorMessage("Error de conexión inalambrica: " + err.message);
      }
    });

    peer.on('disconnected', () => {
      console.log("Transmitter peer disconnected");
      setStatus('idle');
    });
  };

  const startTransmission = async () => {
    if (!matchId.trim()) {
      setErrorMessage("Por favor ingresa el ID del partido para conectar.");
      setStatus('error');
      return;
    }

    let activeStream = streamRef.current;
    if (!activeStream) {
      activeStream = await startLocalCamera(selectedDeviceId);
    }

    if (!activeStream) return;

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

  // Start preview camera on mount
  useEffect(() => {
    if (selectedDeviceId) {
      startLocalCamera(selectedDeviceId);
    }
  }, [selectedDeviceId]);

  return (
    <div className="min-h-screen bg-[#090d16] text-white flex flex-col p-4 md:p-6 relative overflow-hidden font-sans">
      
      {/* Background visual accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-blue-500/10 rounded-full blur-[80px]"></div>
        <div className="absolute -bottom-24 -left-24 w-80 h-80 bg-red-500/10 rounded-full blur-[80px]"></div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between z-10 border-b border-white/5 pb-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600/20 p-2 rounded-lg text-blue-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">Transmisor Inalámbrico</h1>
            <p className="text-slate-400 text-xs">Cámara de Apoyo para VAR / Repetición</p>
          </div>
        </div>
        <button 
          onClick={onExit}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold uppercase rounded-lg transition-all"
        >
          Volver
        </button>
      </div>

      {/* Main Grid */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 z-10 max-w-6xl mx-auto w-full">
        
        {/* Left Column - Camera Preview */}
        <div className="lg:col-span-7 flex flex-col bg-[#111625] border border-white/5 rounded-2xl overflow-hidden shadow-2xl relative min-h-[250px] md:min-h-[400px]">
          
          <video 
            ref={videoRef}
            autoPlay 
            playsInline 
            muted 
            className="absolute inset-0 w-full h-full object-cover z-0"
          />

          {/* Video Overlay Info */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent z-10 pointer-events-none flex flex-col justify-end p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs bg-black/40 text-slate-300 px-2.5 py-1 rounded-md backdrop-blur-md border border-white/10 uppercase tracking-wider font-mono">
                  {cameraLabel || 'Cámara'}
                </span>
                <p className="text-[10px] text-slate-400 mt-1 font-mono">Resolución Dinámica • Sin Audio</p>
              </div>
              
              {status === 'streaming' && (
                <div className="flex items-center gap-2 bg-red-600/90 text-white font-black px-3 py-1 rounded-md text-[10px] uppercase tracking-widest animate-pulse border border-red-500 shadow-lg">
                  <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                  EN VIVO (VAR)
                </div>
              )}
            </div>
          </div>

          {status === 'idle' && (
            <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center z-10 pointer-events-none">
              <span className="text-xs text-white/60 bg-black/50 px-4 py-2 rounded-lg">Cámara en espera</span>
            </div>
          )}
        </div>

        {/* Right Column - Controls & Configuration */}
        <div className="lg:col-span-5 flex flex-col gap-4">
          
          {/* Status Panel */}
          <div className="bg-[#111625] border border-white/5 p-5 rounded-2xl flex flex-col gap-4 shadow-xl">
            <h2 className="text-sm font-bold uppercase tracking-widest text-slate-400">Panel de Control</h2>
            
            {/* Status indicator */}
            <div className="flex items-center gap-3 bg-black/30 p-3 rounded-xl border border-white/5">
              <div className={`w-3.5 h-3.5 rounded-full ${
                status === 'streaming' ? 'bg-green-500 animate-pulse' :
                status === 'connecting' ? 'bg-yellow-500 animate-spin border-t-transparent border border-white' :
                status === 'error' ? 'bg-red-500' : 'bg-slate-600'
              }`}></div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider">
                  {status === 'streaming' ? 'Conectado y Transmitiendo' :
                   status === 'connecting' ? 'Estableciendo WebRTC...' :
                   status === 'error' ? 'Error de Conexión' : 'Desconectado'}
                </p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {status === 'streaming' ? 'Tu celular es ahora una cámara inalámbrica.' :
                   status === 'connecting' ? 'Enlazando con la consola de repeticiones...' :
                   status === 'error' ? 'Verifica los parámetros e intenta de nuevo.' : 'Listo para iniciar transmisión.'}
                </p>
              </div>
            </div>

            {errorMessage && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg text-xs font-semibold">
                ⚠️ {errorMessage}
              </div>
            )}

            {/* Inputs */}
            <div className="flex flex-col gap-3 mt-1">
              
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Código del Partido (Match ID)</label>
                <div className="flex gap-2">
                  <input 
                    type="text"
                    value={matchId}
                    onChange={(e) => setMatchId(e.target.value)}
                    disabled={status === 'streaming' || status === 'connecting'}
                    placeholder="Ej. part_123_abc"
                    className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none uppercase font-mono disabled:opacity-50 text-white"
                  />
                </div>
                <p className="text-[9px] text-slate-500">Puedes encontrar el Match ID en la barra superior o en los controles del partido de la pantalla principal.</p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Etiqueta de Cámara</label>
                <input 
                  type="text"
                  value={cameraLabel}
                  onChange={(e) => setCameraLabel(e.target.value)}
                  disabled={status === 'streaming' || status === 'connecting'}
                  placeholder="Ej. Cámara Red Izquierda"
                  className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm focus:border-blue-500 outline-none disabled:opacity-50 text-white"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Seleccionar Cámara del Celular</label>
                <select
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white outline-none focus:border-blue-500"
                >
                  {devices.map(d => (
                    <option key={d.deviceId} value={d.deviceId} className="bg-slate-900">
                      {d.label || `Cámara ${devices.indexOf(d) + 1}`}
                    </option>
                  ))}
                </select>
                <p className="text-[9px] text-slate-500">Se recomienda seleccionar la cámara trasera (Back/Environment) para una mejor definición.</p>
              </div>

            </div>

            {/* Action Buttons */}
            <div className="mt-2">
              {status === 'streaming' || status === 'connecting' ? (
                <button
                  onClick={stopTransmission}
                  className="w-full bg-red-600 hover:bg-red-700 text-white text-xs font-black py-3.5 rounded-lg uppercase tracking-wider transition-all transform active:scale-95 shadow-lg shadow-red-500/10"
                >
                  Detener Transmisión
                </button>
              ) : (
                <button
                  onClick={startTransmission}
                  className="w-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-black py-3.5 rounded-lg uppercase tracking-wider transition-all transform active:scale-95 shadow-lg shadow-blue-500/20"
                >
                  Conectar y Transmitir
                </button>
              )}
            </div>

          </div>

          {/* Quick instructions */}
          <div className="bg-[#111625]/60 border border-white/5 p-4 rounded-xl text-slate-400 text-[11px] leading-relaxed flex flex-col gap-2">
            <h3 className="text-white font-bold text-xs uppercase tracking-wider mb-1">Guía de Uso Rápido</h3>
            <p>1. Abre JSport Braccini en tu computadora principal y pon el partido en <strong>Modo TV Overlay</strong>.</p>
            <p>2. En tu smartphone, abre la misma aplicación, haz clic en <strong>📱 Transmitir VAR</strong> e introduce el ID de partido.</p>
            <p>3. Coloca tu teléfono en un trípode apuntando a la red o a las líneas de saque.</p>
            <p>4. Desde la PC, podrás ver la miniatura de esta cámara en el <strong>Panel de Control VAR</strong>, y lanzar la repetición instantánea en cámara lenta de los últimos 8 segundos en la transmisión.</p>
          </div>

        </div>

      </div>

    </div>
  );
};
