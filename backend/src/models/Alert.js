import mongoose from 'mongoose';

const AlertSchema = new mongoose.Schema({
  potId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pot', required: true, index: true },
  type: {
    type: String,
    enum: ['critica', 'preventiva', 'calor_extremo', 'fallo_sensor', 'exceso_humedad'],
    required: true,
    index: true
  },
  status: { type: String, enum: ['activa', 'resuelta'], default: 'activa', index: true },
  message: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed },
  resolvedAt: { type: Date },
  notified: {
    email: { type: Boolean, default: false }
  }
}, { timestamps: true });

AlertSchema.index({ potId: 1, type: 1, status: 1 });

export const Alert = mongoose.model('Alert', AlertSchema);
