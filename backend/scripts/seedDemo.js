// Carga zonas de ejemplo (vivero) con 24 h de lecturas, riegos y alertas, para mostrar el
// sistema sin tener todos los nodos armados. Son datos de demostración: las zonas quedan
// marcadas isDemo (el dashboard las rotula "Zona de ejemplo") y no tienen nodo físico.
// Se puede correr de nuevo: reemplaza las zonas de ejemplo anteriores.
// Uso: npm run seed:demo -- admin@ejemplo.com
//      npm run seed:demo -- admin@ejemplo.com --borrar   (solo elimina las de ejemplo)
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';
import { Pot } from '../src/models/Pot.js';
import { Reading } from '../src/models/Reading.js';
import { Event } from '../src/models/Event.js';
import { Alert } from '../src/models/Alert.js';
import { IrrigationCommand } from '../src/models/IrrigationCommand.js';

const [, , email, flag] = process.argv;
if (!email) {
  console.error('Uso: npm run seed:demo -- <email-del-dueño> [--borrar]');
  process.exit(1);
}

const STEP_MIN = 10;
const HOURS = 24;
const LOCATION = { lat: -31.43, lon: -62.08, label: 'San Francisco, Córdoba' };

// start/drop: humedad inicial y pérdida por intervalo; irrigateBelow: umbral al que el
// vivero "riega" en la simulación (null = no riega: seca o con lluvia prevista); jump: lo
// que sube el suelo con cada riego. silentHours: horas sin reportar (zona sin conexión).
const ZONES = [
  {
    name: 'Invernadero A · Helechos', nodeId: 'demo-zona-a', species: 'Helechos', exposure: 'interior',
    plants: ['Helecho de Boston', 'Helecho de Boston', 'Helecho nido de ave', 'Adiantum', 'Adiantum', 'Helecho de Boston'],
    min: 60, max: 80, start: 74, drop: 0.25, irrigateBelow: 62, jump: 14, temp: 24, air: 72
  },
  {
    name: 'Sector B · Lavanda', nodeId: 'demo-zona-b', species: 'Lavanda',
    plants: ['Lavanda inglesa', 'Lavanda inglesa', 'Lavanda francesa', 'Lavanda francesa'],
    min: 20, max: 40, start: 38, drop: 0.12, irrigateBelow: 22, jump: 12, temp: 27, air: 45
  },
  {
    name: 'Sector C · Hortalizas', nodeId: 'demo-zona-c', species: 'Hortalizas de hoja',
    plants: ['Lechuga criolla', 'Lechuga criolla', 'Rúcula', 'Rúcula', 'Acelga', 'Acelga', 'Espinaca', 'Espinaca'],
    min: 50, max: 70, start: 56, drop: 0.1, irrigateBelow: null, jump: 0, temp: 26, air: 58,
    alert: { type: 'critica', message: 'La humedad del suelo está por debajo del mínimo de la zona' },
    events: [
      { hoursAgo: 2.2, type: 'riego_pospuesto', message: 'Riego pospuesto: se espera lluvia en las próximas 6 horas' }
    ]
  },
  {
    name: 'Sombra D · Suculentas', nodeId: 'demo-zona-d', species: 'Suculentas',
    plants: ['Echeveria', 'Echeveria', 'Aloe vera', 'Haworthia', 'Sedum'],
    min: 10, max: 30, start: 41, drop: 0.02, irrigateBelow: null, jump: 0, temp: 22, air: 50,
    alert: { type: 'exceso_humedad', message: 'La humedad del suelo supera el máximo de la zona' }
  },
  {
    name: 'Fondo E · Aromáticas', nodeId: 'demo-zona-e', species: 'Aromáticas',
    plants: ['Albahaca', 'Albahaca', 'Menta', 'Romero', 'Orégano'],
    min: 40, max: 60, start: 52, drop: 0.12, irrigateBelow: 42, jump: 10, temp: 25, air: 55, silentHours: 3,
    alert: { type: 'fallo_sensor', message: 'La zona no reporta datos desde hace más de 15 minutos' }
  }
];

await connectDb();

const owner = await User.findOne({ email: email.toLowerCase() });
if (!owner) {
  console.error(`No existe el usuario ${email}`);
  process.exit(1);
}

const old = await Pot.find({ isDemo: true }).select('_id');
if (old.length) {
  const ids = old.map((p) => p._id);
  await Promise.all([
    Reading.deleteMany({ potId: { $in: ids } }),
    Event.deleteMany({ potId: { $in: ids } }),
    Alert.deleteMany({ potId: { $in: ids } }),
    IrrigationCommand.deleteMany({ potId: { $in: ids } }),
    Pot.deleteMany({ _id: { $in: ids } })
  ]);
  console.log(`Eliminadas ${old.length} zonas de ejemplo anteriores`);
}
if (flag === '--borrar') {
  await mongoose.disconnect();
  process.exit(0);
}

const now = Date.now();
// Ruido determinístico (mismo resultado en cada corrida)
let seed = 7;
const noise = () => {
  seed = (seed * 16807) % 2147483647;
  return seed / 2147483647 - 0.5;
};

for (const z of ZONES) {
  const silentMs = (z.silentHours || 0) * 3600e3;
  const last = now - silentMs;
  const steps = Math.floor((HOURS * 60) / STEP_MIN);
  const readings = [];
  const events = [];
  let soil = z.start;
  let lastIrrigationAt = null;

  const pot = await Pot.create({
    ownerId: owner._id,
    name: z.name,
    nodeId: z.nodeId,
    deviceToken: uuidv4(),
    minMoisture: z.min,
    maxMoisture: z.max,
    species: z.species,
    exposure: z.exposure || 'exterior',
    plants: z.plants.map((name) => ({ name })),
    location: LOCATION,
    isDemo: true
  });

  for (let i = steps; i >= 0; i--) {
    const t = now - i * STEP_MIN * 60e3;
    if (t > last) continue;
    soil -= z.drop * (1 + noise() * 0.4);
    if (z.irrigateBelow != null && soil < z.irrigateBelow) {
      soil += z.jump;
      lastIrrigationAt = t;
      events.push({ potId: pot._id, type: 'riego_activado', origin: 'auto', durationSec: 5, result: 'confirmado',
        message: 'Riego automático confirmado', detail: { reason: 'suelo_bajo_minimo', soilMoisture: +soil.toFixed(1) },
        createdAt: new Date(t), updatedAt: new Date(t) });
    }
    const hour = new Date(t).getHours();
    const sun = Math.sin(((hour - 9) / 24) * 2 * Math.PI);
    readings.push({
      potId: pot._id, nodeId: z.nodeId,
      soilMoisture: +Math.max(0, Math.min(100, soil + noise() * 0.4)).toFixed(1),
      temperature: +(z.temp + 5 * sun + noise()).toFixed(1),
      airHumidity: +(z.air - 8 * sun + noise() * 2).toFixed(1),
      measuredAt: new Date(t), receivedAt: new Date(t), source: 'live', status: 'valida'
    });
  }

  for (const e of z.events || []) {
    const at = new Date(now - e.hoursAgo * 3600e3);
    events.push({ potId: pot._id, type: e.type, origin: 'auto', result: 'no_aplica', message: e.message,
      createdAt: at, updatedAt: at });
  }

  await Reading.insertMany(readings);
  if (events.length) await Event.insertMany(events);
  if (z.alert) await Alert.create({ potId: pot._id, type: z.alert.type, message: z.alert.message });

  const lastR = readings[readings.length - 1];
  const online = !z.silentHours;
  await Pot.updateOne({ _id: pot._id }, {
    online,
    lastSeenAt: new Date(lastR.measuredAt),
    lastReading: {
      soilMoisture: lastR.soilMoisture, temperature: lastR.temperature, airHumidity: lastR.airHumidity,
      measuredAt: lastR.measuredAt, source: 'live'
    },
    ...(lastIrrigationAt ? { lastIrrigation: { at: new Date(lastIrrigationAt), durationSec: 5, origin: 'auto', result: 'ok' } } : {})
  });
  console.log(`${z.name}: ${readings.length} lecturas, humedad actual ${lastR.soilMoisture}% (límites ${z.min}–${z.max}%)`);
}

console.log('Zonas de ejemplo listas. Quitarlas: npm run seed:demo -- <email> --borrar');
await mongoose.disconnect();
