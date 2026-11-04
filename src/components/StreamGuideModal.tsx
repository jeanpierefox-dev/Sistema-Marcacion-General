import React from 'react';

interface StreamGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
  matchUrl: string;
}

export const StreamGuideModal: React.FC<StreamGuideModalProps> = ({ isOpen, onClose, matchUrl }) => {
  const [activeTab, setActiveTab] = React.useState<'pc' | 'mobile'>('pc');

  if (!isOpen) return null;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(matchUrl);
    alert("URL copiada al portapapeles");
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-pink-600 p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-black text-white uppercase italic tracking-wider flex items-center gap-3">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" className="text-white">
                  <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5 20.1a6.34 6.34 0 0 0 10.86-4.43v-7a8.16 8.16 0 0 0 4.77 1.52v-3.4a4.85 4.85 0 0 1-1-.1z"/>
              </svg>
              Cómo Transmitir
            </h2>
            <button onClick={onClose} className="text-white/80 hover:text-white hover:bg-white/20 rounded-full p-2 transition">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 bg-black/20 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('pc')}
              className={`flex-1 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition ${activeTab === 'pc' ? 'bg-white text-purple-600 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            >
              💻 Desde PC (Studio/OBS)
            </button>
            <button 
              onClick={() => setActiveTab('mobile')}
              className={`flex-1 py-2 rounded-md text-sm font-bold uppercase tracking-wide transition ${activeTab === 'mobile' ? 'bg-white text-purple-600 shadow-sm' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
            >
              📱 Desde Móvil (Sin PC)
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 text-slate-300">
          
          {activeTab === 'pc' ? (
            /* PC Content */
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
               {/* Intro */}
              <div className="bg-slate-800/50 p-4 rounded-lg border border-white/5">
                <p className="text-sm">
                  Para transmitir en PC, usa <strong>TikTok Live Studio</strong> o <strong>OBS Studio</strong>. Es la opción más profesional.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-white font-bold uppercase tracking-wide border-b border-white/10 pb-2">Pasos para TikTok Live Studio</h3>
                
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shrink-0">1</div>
                  <div>
                    <h4 className="text-white font-bold">Abre TikTok Live Studio</h4>
                    <p className="text-xs text-slate-400 mt-1">Inicia sesión con tu cuenta de TikTok en tu PC.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shrink-0">2</div>
                  <div>
                    <h4 className="text-white font-bold">Añade una Fuente de Navegador</h4>
                    <p className="text-xs text-slate-400 mt-1">Haz clic en "Añadir Fuente" {'>'} "Navegador" (Browser Source).</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shrink-0">3</div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold">Copia y Pega la URL del Marcador</h4>
                    <div className="flex items-center gap-2 mt-2 bg-black/50 p-2 rounded border border-white/10">
                      <code className="text-xs text-green-400 truncate flex-1">{matchUrl}</code>
                      <button onClick={copyToClipboard} className="bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded transition">Copiar</button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center font-bold text-white shrink-0">4</div>
                  <div>
                    <h4 className="text-white font-bold">Configura las Dimensiones</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Establece el tamaño en <strong>1080 x 1920</strong> (Vertical) para que ocupe toda la pantalla del móvil.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* Mobile Content */
            <div className="space-y-4 animate-in fade-in slide-in-from-left-4 duration-300">
               {/* Intro */}
               <div className="bg-slate-800/50 p-4 rounded-lg border border-white/5">
                <p className="text-sm">
                  ¿No tienes PC? Usa la app <strong>Prism Live Studio</strong> (Gratis) en tu celular para transmitir con el marcador superpuesto.
                </p>
              </div>

              <div className="space-y-4">
                <h3 className="text-white font-bold uppercase tracking-wide border-b border-white/10 pb-2">Pasos con Prism Live Studio</h3>
                
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white shrink-0">1</div>
                  <div>
                    <h4 className="text-white font-bold">Descarga Prism Live Studio</h4>
                    <p className="text-xs text-slate-400 mt-1">Disponible gratis en App Store (iOS) y Google Play (Android).</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white shrink-0">2</div>
                  <div>
                    <h4 className="text-white font-bold">Conecta tu cuenta de TikTok</h4>
                    <p className="text-xs text-slate-400 mt-1">Abre la app y vincula tu cuenta para transmitir en vivo.</p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white shrink-0">3</div>
                  <div className="flex-1">
                    <h4 className="text-white font-bold">Añade el Widget Web</h4>
                    <p className="text-xs text-slate-400 mt-1 mb-2">Desliza a la izquierda en la cámara {'>'} Widget {'>'} Web / URL.</p>
                    <div className="flex items-center gap-2 bg-black/50 p-2 rounded border border-white/10">
                      <code className="text-xs text-green-400 truncate flex-1">{matchUrl}</code>
                      <button onClick={copyToClipboard} className="bg-white/10 hover:bg-white/20 text-white text-xs px-2 py-1 rounded transition">Copiar</button>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center font-bold text-white shrink-0">4</div>
                  <div>
                    <h4 className="text-white font-bold">¡A Transmitir!</h4>
                    <p className="text-xs text-slate-400 mt-1">
                      Verás el marcador sobre tu cámara. ¡Inicia el live y listo!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Tips */}
          <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-lg">
            <h4 className="text-yellow-400 font-bold text-sm uppercase mb-2">💡 Tips Pro</h4>
            <ul className="list-disc list-inside text-xs space-y-1 text-yellow-200/80">
              <li>Usa el modo <strong>"TV / Overlay"</strong> de esta app para una vista limpia sin botones.</li>
              <li>Asegúrate de tener buena conexión a internet (WiFi o 5G) para evitar cortes.</li>
            </ul>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-900 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="bg-white text-black font-bold px-6 py-2 rounded hover:bg-slate-200 transition">Entendido</button>
        </div>

      </div>
    </div>
  );
};
