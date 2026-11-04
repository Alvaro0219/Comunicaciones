// Estado visible de una zona: una sola fuente de verdad para tarjeta, tabla y detalle.
// tone coincide con las variantes de .gda-chip (ok | water | warn | crit | neutral).
export function potState(pot) {
  if (!pot.online) return { key: 'offline', label: 'Sin conexión', tone: 'neutral' };
  if (pot.watering?.active) return { key: 'watering', label: 'Regando', tone: 'water' };
  const soil = pot.lastReading?.soilMoisture;
  if (soil == null) return { key: 'wait', label: 'Sin lecturas', tone: 'neutral' };
  if (soil < pot.minMoisture) return { key: 'dry', label: 'Seca', tone: 'crit' };
  if (soil > pot.maxMoisture) return { key: 'wet', label: 'Húmeda', tone: 'water' };
  return { key: 'ok', label: 'En rango', tone: 'ok' };
}

// ¿Requiere que alguien la mire? Alerta activa o humedad fuera de los límites.
export function needsAttention(pot) {
  if (!pot.online) return false;
  const k = potState(pot).key;
  return !!pot.activeAlerts || k === 'dry' || k === 'wet';
}
