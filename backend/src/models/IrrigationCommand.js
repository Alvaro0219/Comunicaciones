import mongoose from 'mongoose';

const IrrigationCommandSchema = new mongoose.Schema({
  potId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pot', required: true, index: true },
  nodeId: { type: String, required: true, index: true },
  uuid: { type: String, required: true, unique: true, index: true },
  durationSec: { type: Number, required: true },
  origin: { type: String, enum: ['auto', 'calor', 'manual'], required: true },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  status: { type: String, enum: ['enviada', 'confirmada', 'fallida', 'expirada'], default: 'enviada', index: true },
  sentAt: { type: Date, default: Date.now },
  ackAt: { type: Date },
  detail: { type: String }
}, { timestamps: true });

export const IrrigationCommand = mongoose.model('IrrigationCommand', IrrigationCommandSchema);
