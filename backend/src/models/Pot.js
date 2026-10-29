import mongoose from 'mongoose';
import { env } from '../config/env.js';

const PotSchema = new mongoose.Schema({
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, required: true, trim: true },

  // Identidad del nodo físico (ESP32). El deviceToken es la credencial MQTT del nodo.
  nodeId: { type: String, required: true, unique: true, trim: true, index: true },
  deviceToken: { type: String, required: true },

  // Umbrales y parámetros de riego configurables por maceta
  minMoisture: { type: Number, required: true, min: 0, max: 100, default: 30 },
  maxMoisture: { type: Number, required: true, min: 0, max: 100, default: 70 },
  irrigationDurationSec: { type: Number, min: 1, max: 600, default: env.defaultIrrigationSec },
  heatTempThreshold: { type: Number, default: env.heatTempThreshold },
  heatIrrigationDurationSec: { type: Number, min: 1, max: 600, default: env.heatIrrigationSec },
  rainProbThreshold: { type: Number, min: 0, max: 100, default: env.rainProbThreshold },

  // Lluvia: una zona interior (o bajo techo) ignora el pronóstico. En una exterior el riego se
  // pospone por lluvia prevista, pero nunca de más: si la humedad cae emergencyMarginPts por
  // debajo del mínimo, o la espera supera maxPostponeHours, se riega igual.
  exposure: { type: String, enum: ['exterior', 'interior'], default: 'exterior' },
  emergencyMarginPts: { type: Number, min: 0, max: 50, default: 10 },
  maxPostponeHours: { type: Number, min: 1, max: 72, default: 6 },

  location: {
    lat: { type: Number, min: -90, max: 90 },
    lon: { type: Number, min: -180, max: 180 },
    label: { type: String, trim: true }
  },

  // Una "zona" del vivero = un nodo con sus límites de humedad. Las macetas de la zona
  // comparten esos límites y son solo descriptivas (no generan mensajes propios).
  species: { type: String, trim: true, default: '' },
  plants: [{ _id: false, name: { type: String, trim: true, required: true } }],

  // Zona de demostración: datos de ejemplo sin nodo físico (riego simulado, sin chequeo
  // de sensores). No se puede activar desde la API; la crea scripts/seedDemo.js.
  isDemo: { type: Boolean, default: false, index: true },

  isActive: { type: Boolean, default: true, index: true },

  // Estado de conectividad y última lectura (snapshot para el dashboard)
  online: { type: Boolean, default: false },
  lastSeenAt: { type: Date },
  // Diagnóstico que publica el firmware en cada telemetría (rssi/ip/heap).
  // La IP importa: es la que se usa para OTA/Telnet contra el nodo.
  diagnostics: {
    rssi: Number,
    ssid: String,
    ip: String,
    heap: Number,
    at: Date
  },
  lastReading: {
    soilMoisture: Number,
    temperature: Number,
    airHumidity: Number,
    measuredAt: Date,
    source: String
  },
  watering: {
    active: { type: Boolean, default: false },
    since: Date,
    commandId: String
  },
  lastIrrigation: {
    at: Date,
    durationSec: Number,
    origin: String,
    result: String
  }
}, { timestamps: true });

export const Pot = mongoose.model('Pot', PotSchema);
