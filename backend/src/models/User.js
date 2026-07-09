import mongoose from 'mongoose';

const AlertPrefsSchema = new mongoose.Schema({
  email: { type: Boolean, default: true },
  types: {
    critica: { type: Boolean, default: true },
    preventiva: { type: Boolean, default: true },
    calor_extremo: { type: Boolean, default: true },
    fallo_sensor: { type: Boolean, default: true },
    exceso_humedad: { type: Boolean, default: true }
  }
}, { _id: false });

const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  fullName: { type: String, required: true, trim: true },
  role: { type: String, enum: ['admin', 'tecnico', 'visualizador'], default: 'tecnico', index: true },
  isActive: { type: Boolean, default: true, index: true },
  alertPrefs: { type: AlertPrefsSchema, default: () => ({}) }
}, { timestamps: true });

export const User = mongoose.model('User', UserSchema);
