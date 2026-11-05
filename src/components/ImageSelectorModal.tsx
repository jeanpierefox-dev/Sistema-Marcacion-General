import React, { useState, useRef } from 'react';
import { TEAM_BADGE_PRESETS, PLAYER_AVATAR_PRESETS, SportsPreset } from '../constants/sportsAssets';

interface ImageSelectorModalProps {
  isOpen: boolean;
  title: string;
  currentImage?: string;
  targetType: 'team' | 'player' | 'general';
  onSelectImage: (imageUrl: string) => void;
  onClose: () => void;
}

export const ImageSelectorModal: React.FC<ImageSelectorModalProps> = ({
  isOpen,
  title,
  currentImage,
  targetType,
  onSelectImage,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'presets' | 'url'>('upload');
  const [previewUrl, setPreviewUrl] = useState<string>(currentImage || '');
  const [customUrl, setCustomUrl] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    const reader = new FileReader();
    reader.onload = () => {
      const rawData = reader.result as string;
      const img = new Image();
      img.onload = () => {
        // High quality thumbnail compression (max 256px, 75% quality JPEG)
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 256;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL('image/jpeg', 0.75);
          setPreviewUrl(compressed);
        } else {
          setPreviewUrl(rawData);
        }
        setIsProcessing(false);
      };
      img.onerror = () => {
        setPreviewUrl(rawData);
        setIsProcessing(false);
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  const handleApply = () => {
    onSelectImage(previewUrl);
    onClose();
  };

  const handleRemove = () => {
    setPreviewUrl('');
    onSelectImage('');
    onClose();
  };

  const availablePresets: SportsPreset[] = targetType === 'player'
    ? [...PLAYER_AVATAR_PRESETS, ...TEAM_BADGE_PRESETS]
    : [...TEAM_BADGE_PRESETS, ...PLAYER_AVATAR_PRESETS];

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-corp-panel border border-white/20 rounded-2xl w-full max-w-xl shadow-[0_20px_60px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh]">
        
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-black/30">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-vnl-accent/20 border border-vnl-accent/40 flex items-center justify-center text-vnl-accent text-lg">
              🖼️
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white uppercase italic tracking-tight">{title}</h3>
              <p className="text-[11px] text-slate-400 font-medium">Sube una foto o escoge de la galería deportiva</p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white flex items-center justify-center transition active:scale-95"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-white/10 bg-black/20 p-1.5 gap-1.5 text-xs font-bold uppercase tracking-wider">
          <button
            type="button"
            onClick={() => setActiveTab('upload')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-center transition flex items-center justify-center gap-2 ${
              activeTab === 'upload' 
                ? 'bg-vnl-accent text-black font-black shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>📁</span>
            <span>Subir Archivo</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('presets')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-center transition flex items-center justify-center gap-2 ${
              activeTab === 'presets' 
                ? 'bg-vnl-accent text-black font-black shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🏆</span>
            <span>Galería</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('url')}
            className={`flex-1 py-2.5 px-3 rounded-lg text-center transition flex items-center justify-center gap-2 ${
              activeTab === 'url' 
                ? 'bg-vnl-accent text-black font-black shadow-md' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <span>🔗</span>
            <span>URL Web</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-grow space-y-5">
          
          {/* Active Preview */}
          <div className="bg-black/40 border border-white/10 rounded-xl p-4 flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-slate-900 border-2 border-dashed border-white/20 flex items-center justify-center overflow-hidden shrink-0 relative">
              {previewUrl ? (
                <img src={previewUrl} alt="Vista previa" className="w-full h-full object-contain p-1" />
              ) : (
                <span className="text-2xl text-slate-600">📷</span>
              )}
            </div>
            <div className="flex-grow min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">Vista Previa Seleccionada</span>
              <p className="text-xs text-white truncate font-medium">
                {previewUrl ? (previewUrl.startsWith('data:') ? 'Imagen cargada y optimizada' : previewUrl) : 'Ninguna imagen seleccionada'}
              </p>
              {previewUrl && (
                <button
                  type="button"
                  onClick={() => setPreviewUrl('')}
                  className="mt-2 text-[10px] font-bold text-red-400 hover:text-red-300 uppercase tracking-wider flex items-center gap-1"
                >
                  ✕ Quitar imagen
                </button>
              )}
            </div>
          </div>

          {/* TAB 1: Upload */}
          {activeTab === 'upload' && (
            <div className="space-y-4">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
                id="imageModalFileInput"
              />
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-vnl-accent/40 hover:border-vnl-accent bg-vnl-accent/5 hover:bg-vnl-accent/10 rounded-2xl p-6 sm:p-8 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 group"
              >
                <div className="w-14 h-14 rounded-full bg-vnl-accent/20 flex items-center justify-center text-3xl group-hover:scale-110 transition duration-200">
                  📸
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider">
                    {isProcessing ? 'Procesando imagen...' : 'Toca para elegir desde tu cámara o galería'}
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Formatos soportados: JPG, PNG, WEBP. Se optimiza automáticamente para no saturar memoria.
                  </p>
                </div>
                <button
                  type="button"
                  className="mt-2 px-5 py-2.5 rounded-lg bg-vnl-accent/20 hover:bg-vnl-accent/30 text-vnl-accent border border-vnl-accent/40 text-xs font-bold uppercase tracking-wider transition pointer-events-none"
                >
                  Examinar archivos
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: Presets Gallery */}
          {activeTab === 'presets' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-400">
                Selecciona uno de los escudos y avatares deportivos predeterminados:
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 max-h-60 overflow-y-auto pr-1">
                {availablePresets.map((preset) => {
                  const isSelected = previewUrl === preset.url;
                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => setPreviewUrl(preset.url)}
                      className={`p-2.5 rounded-xl border flex flex-col items-center gap-2 transition text-center group ${
                        isSelected 
                          ? 'border-vnl-accent bg-vnl-accent/20 ring-2 ring-vnl-accent shadow-lg' 
                          : 'border-white/10 bg-black/30 hover:border-white/30 hover:bg-white/5'
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-black/40">
                        <img src={preset.url} alt={preset.name} className="w-full h-full object-contain" />
                      </div>
                      <span className="text-[10px] font-bold text-slate-300 group-hover:text-white truncate w-full">
                        {preset.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Web URL */}
          {activeTab === 'url' && (
            <div className="space-y-3">
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider">
                Dirección web de la imagen (HTTPS)
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  placeholder="https://ejemplo.com/logo.png"
                  className="flex-grow p-3 bg-black/40 border border-white/15 rounded-xl text-white text-xs font-medium focus:border-vnl-accent outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (customUrl.trim()) setPreviewUrl(customUrl.trim());
                  }}
                  className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold uppercase transition"
                >
                  Cargar
                </button>
              </div>
              <p className="text-[11px] text-slate-500">
                Pega el enlace directo a una imagen PNG, JPG o SVG alojada en la web.
              </p>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-5 border-t border-white/10 bg-black/40 flex flex-col-reverse sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto">
            {currentImage && (
              <button
                type="button"
                onClick={handleRemove}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl text-red-400 hover:text-red-300 hover:bg-red-500/10 text-xs font-bold uppercase tracking-wider transition min-h-[44px]"
              >
                Eliminar imagen actual
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-bold uppercase tracking-wider transition min-h-[44px]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-vnl-accent hover:bg-cyan-400 text-black text-xs font-black uppercase tracking-wider transition shadow-[0_0_15px_rgba(6,182,212,0.3)] min-h-[44px] active:scale-95"
            >
              Aplicar Imagen
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
