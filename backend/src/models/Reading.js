import mongoose from 'mongoose';

const ReadingSchema = new mongoose.Schema({
  potId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pot', required: true, index: true },
  nodeId: { type: String, required: true },
  soilMoisture: { type: Number, required: true },
  // Opcionales: el nodo real puede reportar solo humedad de suelo mientras
  // el AM2302 no esté conectado (estado actual del hardware)
  temperature: { type: Number, default: null },
  airHumidity: { type: Number, default: null },
  measuredAt: { type: Date, required: true },
  receivedAt: { type: Date, default: Date.now },
  // 'live' = llegó en el ciclo normal; 'replay' = retransmitida tras un corte de conectividad
  source: { type: String, enum: ['live', 'replay'], default: 'live', index: true },
  status: { type: String, enum: ['valida', 'invalida'], default: 'valida', index: true },
  invalidReason: { type: String }
}, { timestamps: true });

// Idempotencia de retransmisiones: una misma medición (nodo + timestamp) nunca se duplica.
ReadingSchema.index({ nodeId: 1, measuredAt: 1 }, { unique: true });
ReadingSchema.index({ potId: 1, measuredAt: -1 });

export const Reading = mongoose.model('Reading', ReadingSchema);
