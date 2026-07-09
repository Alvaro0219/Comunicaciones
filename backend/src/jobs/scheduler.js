import cron from 'node-cron';
import { Pot } from '../models/Pot.js';
import { env } from '../config/env.js';
import { broadcast } from '../realtime/sseHub.js';
import { raiseAlert } from '../services/alertService.js';
import { expireStaleCommands } from '../services/irrigationService.js';
import { refreshAllPotLocations } from '../services/weatherService.js';

// Macetas activas que dejaron de reportar por más de SENSOR_TIMEOUT_MIN:
// alerta de fallo de sensor + marcado offline visible en el dashboard.
async function checkSensorTimeouts() {
  const cutoff = new Date(Date.now() - env.sensorTimeoutMin * 60 * 1000);
  const silent = await Pot.find({
    isActive: true,
    lastSeenAt: { $ne: null, $lt: cutoff }
  });

  for (const pot of silent) {
    await raiseAlert(pot, 'fallo_sensor',
      `La maceta "${pot.name}" no reporta datos desde hace más de ${env.sensorTimeoutMin} minutos`,
      { lastSeenAt: pot.lastSeenAt });
    if (pot.online) {
      await Pot.updateOne({ _id: pot._id }, { online: false });
      broadcast('pot_status', { potId: pot._id, online: false }, pot.ownerId);
    }
  }
}

export function startJobs() {
  cron.schedule('* * * * *', () => checkSensorTimeouts().catch(console.error));
  cron.schedule('* * * * *', () => expireStaleCommands().catch(console.error));
  cron.schedule('0 */3 * * *', () => refreshAllPotLocations().catch(console.error));

  // Primer refresco de clima al arrancar, sin bloquear el arranque
  refreshAllPotLocations().catch(console.error);
  console.log('Jobs programados: timeout de sensores (1m), expiración de órdenes (1m), clima (3h)');
}
