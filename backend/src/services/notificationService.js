import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

// Si no hay SMTP configurado, las notificaciones se loguean en consola (modo desarrollo).
const transport = env.smtp.host
  ? nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined
    })
  : null;

const TYPE_LABELS = {
  critica: 'Alerta crítica',
  preventiva: 'Alerta preventiva',
  calor_extremo: 'Calor extremo',
  fallo_sensor: 'Fallo de sensor',
  exceso_humedad: 'Exceso de humedad'
};

export async function sendAlertEmail(user, pot, alert) {
  const subject = `[GDA] ${TYPE_LABELS[alert.type] || alert.type} — ${pot.name}`;
  const text = `${alert.message}\n\nMaceta: ${pot.name} (nodo ${pot.nodeId})\nFecha: ${new Date(alert.createdAt || Date.now()).toLocaleString()}\n\n— Gemelo Digital Agrícola`;

  if (!transport) {
    console.log(`[mail:simulado] Para: ${user.email} | ${subject} | ${alert.message}`);
    return false;
  }
  try {
    await transport.sendMail({ from: env.smtp.from, to: user.email, subject, text });
    return true;
  } catch (err) {
    console.error('Error enviando email de alerta:', err.message);
    return false;
  }
}
