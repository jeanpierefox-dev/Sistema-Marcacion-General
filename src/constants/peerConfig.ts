// Configuración compartida de WebRTC y PeerJS para conexión de cámara VAR
import type { PeerOptions } from 'peerjs';

export const PEER_CONFIG: PeerOptions = {
  debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  }
};

/**
 * Normaliza el ID de partido para generar un ID de PeerJS determinista y válido
 */
export function getVarPeerId(matchId: string): string {
  const clean = (matchId || 'partido')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_');
  return `jsport-${clean}-var`;
}

/**
 * Genera el enlace directo para que el celular abra directamente la cámara VAR con sección asignada
 */
export function getVarDirectUrl(matchId: string, section?: string, label?: string): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const path = window.location.pathname;
  let url = `${origin}${path}?var=${encodeURIComponent(matchId.trim())}`;
  if (section) url += `&section=${encodeURIComponent(section)}`;
  if (label) url += `&label=${encodeURIComponent(label)}`;
  return url;
}
