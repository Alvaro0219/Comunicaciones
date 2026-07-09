import mongoose from 'mongoose';

const EventSchema = new mongoose.Schema({
  potId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pot', required: true, index: true },
  type: {
    type: String,
    enum: ['riego_activado', 'riego_pospuesto', 'riego_no_aplicado', 'riego_calor', 'riego_manual'],
    required: true,
    index: true
  },
  // Trazabilidad: qué originó el evento (ciclo automático o acción manual de un usuario)
  origin: { type: String, enum: ['auto', 'manual'], required: true, index: true },
  byUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  durationSec: { type: Number },
  commandUuid: { type: String, index: true },
  result: { type: String, enum: ['pendiente', 'confirmado', 'fallido', 'no_aplica'], default: 'no_aplica' },
  message: { type: String },
  detail: {
    reason: String,
    soilMoisture: Number,
    temperature: Number,
    rainProbability: Number
  }
}, { timestamps: true });

EventSchema.index({ potId: 1, createdAt: -1 });

export const Event = mongoose.model('Event', EventSchema);
