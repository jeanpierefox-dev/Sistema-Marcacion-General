import React, { useState, useEffect } from 'react';
import { testConnection, resetCloudData } from '../services/cloud';
import { User } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

interface CloudConfigProps {
  onClose: () => void;
  onConnected?: () => void;
  currentUser?: User | null;
}

export const CloudConfig: React.FC<CloudConfigProps> = ({ onClose, onConnected, currentUser }) => {
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  const isAdmin = currentUser?.role === 'ADMIN';
  const shareableUrl = window.location.href;

  useEffect(() => {
    // Initial silent check
    testConnection().then(res => {
      setTestResult({
        success: res.success,
        message: res.message || (res.success ? 'Conectado a Google Cloud Firestore' : 'Error')
      });
      if (res.success && onConnected) onConnected();
    });
  }, [onConnected]);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection();
      setTestResult({
        success: res.success,
        message: res.message || (res.success ? 'Conexión a Cloud Firestore activa en tiempo real.' : 'No se pudo conectar.')
      });
      if (res.success && onConnected) onConnected();
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Error al conectar con la base de datos.'
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareableUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleResetData = async () => {
    if (!isAdmin) return;
    const confirm1 = window.confirm('⚠️ ¿Estás seguro de que deseas restablecer los datos de la nube a valores iniciales?');
    if (!confirm1) return;

    setIsResetting(true);
    try {
      await resetCloudData([{ id: 'admin', username: 'admin', password: '1234', role: 'ADMIN' }]);
      alert('✅ Base de datos restablecida correctamente. El usuario administrador es admin / 1234.');
      onClose();
    } catch (e: any) {
      alert('Error al restablecer: ' + e.message);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/85 z-[100] flex items-center justify-center p-4 backdrop-blur-md">
      <div className="bg-corp-panel border border-white/10 rounded-2xl shadow-2xl p-6 md:p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto relative animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-xl">
              ☁️
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-wide">Conexión a la Nube</h2>
              <p className="text-xs text-slate-400">Google Cloud Firestore en tiempo real</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-white/5 transition"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        {/* Cloud Status Card */}
        <div className="my-5 p-4 rounded-xl bg-black/30 border border-white/5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estado del Servidor</span>
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-medium">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Nube Activa
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
            <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
              <div className="text-[10px] text-slate-500 uppercase font-sans font-bold">Proyecto</div>
              <div className="text-slate-200 truncate font-semibold" title={firebaseConfig.projectId}>
                {firebaseConfig.projectId}
              </div>
            </div>
            <div className="bg-white/5 p-2.5 rounded-lg border border-white/5">
              <div className="text-[10px] text-slate-500 uppercase font-sans font-bold">Base de Datos</div>
              <div className="text-slate-200 truncate font-semibold">
                Cloud Firestore
              </div>
            </div>
          </div>

          {testResult && (
            <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
              testResult.success 
                ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300' 
                : 'bg-rose-500/10 border border-rose-500/20 text-rose-300'
            }`}>
              <span>{testResult.success ? '✓' : '⚠️'}</span>
              <span>{testResult.message}</span>
            </div>
          )}

          <button
            onClick={handleTestConnection}
            disabled={isTesting}
            className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 active:scale-[0.99] border border-white/10 rounded-lg text-xs font-semibold text-slate-200 transition flex items-center justify-center gap-2"
          >
            {isTesting ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                <span>Comprobando conexión...</span>
              </>
            ) : (
              <>
                <span>🔄</span>
                <span>Probar Conexión con Firestore</span>
              </>
            )}
          </button>
        </div>

        {/* Multi-Device Connection Section */}
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 text-sm font-bold text-white">
            <span>📱</span>
            <h3>Ingresar desde otros dispositivos</h3>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            El sistema se sincroniza <strong>automáticamente en tiempo real</strong>. Abre este enlace desde cualquier teléfono, tableta o computadora (árbitro de cancha, mesa de control, TV/OBS o público):
          </p>

          <div className="flex gap-2">
            <input 
              readOnly 
              value={shareableUrl} 
              className="flex-1 bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs font-mono text-blue-300 select-all outline-none focus:border-corp-accent"
            />
            <button
              onClick={handleCopyLink}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                copied 
                  ? 'bg-emerald-600 text-white' 
                  : 'bg-corp-accent hover:bg-corp-accent-hover text-white shadow-md'
              }`}
            >
              <span>{copied ? '✓ Copiado' : 'Copiar'}</span>
            </button>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3.5 space-y-2 text-xs text-slate-300">
            <div className="font-semibold text-blue-400 flex items-center gap-1.5">
              <span>💡</span>
              <span>Acceso para cada rol:</span>
            </div>
            <ul className="space-y-1 pl-4 list-disc text-slate-300">
              <li><strong>Administrador / Mesa:</strong> Inicia sesión con <code className="bg-black/30 px-1 py-0.5 rounded text-blue-300">admin</code> / <code className="bg-black/30 px-1 py-0.5 rounded text-blue-300">1234</code> para crear torneos y controlar el partido.</li>
              <li><strong>Árbitro en Cancha:</strong> Inicia sesión con la cuenta de árbitro asignada para marcar puntos y cambios desde el móvil.</li>
              <li><strong>Cámara VAR Móvil:</strong> En la pantalla de login pulsa "Conectar Celular (Cámara VAR)".</li>
              <li><strong>Espectador / TV OBS:</strong> Abre el link para ver la transmisión o marcador en vivo sin necesidad de login.</li>
            </ul>
          </div>
        </div>

        {/* Admin Danger Zone */}
        {isAdmin && (
          <div className="mt-6 pt-4 border-t border-white/10">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-300">Zona de Administración</div>
                <div className="text-[11px] text-slate-500">Reiniciar datos del torneo en la nube</div>
              </div>
              <button
                onClick={handleResetData}
                disabled={isResetting}
                className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-semibold transition"
              >
                {isResetting ? 'Reiniciando...' : 'Restablecer Nube'}
              </button>
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button
            onClick={onClose}
            className="w-full py-3 bg-white/10 hover:bg-white/15 text-white font-bold rounded-lg text-xs uppercase tracking-wider transition"
          >
            Listo / Continuar
          </button>
        </div>

      </div>
    </div>
  );
};
