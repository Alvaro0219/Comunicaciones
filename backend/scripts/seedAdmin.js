// Crea (o promueve) el primer usuario administrador.
// Uso: npm run seed:admin -- admin@ejemplo.com MiPassword123 "Nombre Apellido"
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { connectDb } from '../src/config/db.js';
import { User } from '../src/models/User.js';

const [, , email, password, fullName = 'Administrador GDA'] = process.argv;

if (!email || !password) {
  console.error('Uso: npm run seed:admin -- <email> <password> ["Nombre completo"]');
  process.exit(1);
}
if (password.length < 8) {
  console.error('La contraseña debe tener al menos 8 caracteres');
  process.exit(1);
}

await connectDb();
const passwordHash = await bcrypt.hash(password, 10);
const user = await User.findOneAndUpdate(
  { email: email.toLowerCase() },
  { email: email.toLowerCase(), passwordHash, fullName, role: 'admin', isActive: true },
  { upsert: true, new: true }
);
console.log(`Admin listo: ${user.email} (${user._id})`);
await mongoose.disconnect();
