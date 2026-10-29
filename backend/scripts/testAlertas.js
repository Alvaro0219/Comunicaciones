// Prueba de todas las alertas del sistema con TODAS activadas (email y los 5 tipos).
// Pasa telemetría por el mismo camino que usa el nodo (handleTelemetry) y el job de timeout
// de sensores; verifica la alerta, el evento de decisión, el email y la auto-resolución.
// Crea su propio usuario y zonas de prueba y las elimina al terminar. No publica en MQTT
// (fuerza MODO_ESCRITURA=false) ni manda emails reales (fuerza SMTP_HOST vacío: se loguean).
// Uso: npm run test:alertas      (conviene correrlo contra una base de prueba)
process.env.MODO_ESCRITURA = 'false';
process.env.SMTP_HOST = '';
process.env.CONTROL_RIEGO = 'backend';
process.env.DECISION_COOLDOWN_MIN = '10';

const mails = [];
const origLog = console.log;
console.log = (...a) => {
  const line = a.join(' ');
  if (line.startsWith('[mail:simulado]')) mails.push(line);
  else origLog(...a);
};

const { default: mongoose } = await import('mongoose');
const { connectDb } = await import('../src/config/db.js');
const { User } = await import('../src/models/User.js');
const { Pot } = await import('../src/models/Pot.js');
const { Alert } = await import('../src/models/Alert.js');
const { Event } = await import('../src/models/Event.js');
const { Reading } = await import('../src/models/Reading.js');
const { WeatherCache } = await import('../src/models/WeatherCache.js');
const { handleTelemetry } = await import('../src/services/ingestService.js');
const { checkSensorTimeouts } = await import('../src/jobs/scheduler.js');

await connectDb();

const TAG = `testalertas-${Date.now()}`;
const DRY = { lat: -33.11, lon: -60.11 };     // pronóstico sin lluvia
const RAIN = { lat: -34.22, lon: -61.22 };    // 80% de lluvia en las próximas horas
const locKey = (l) => `${l.lat.toFixed(2)},${l.lon.toFixed(2)}`;

const LABEL = {
  critica: 'Alerta crítica', preventiva: 'Alerta preventiva', calor_extremo: 'Calor extremo',
  fallo_sensor: 'Fallo de sensor', exceso_humedad: 'Exceso de humedad'
};

const user = await User.create({
  email: `${TAG}@test.local`, passwordHash: 'x', fullName: 'Prueba alertas', role: 'admin',
  alertPrefs: { email: true, types: { critica: true, preventiva: true, calor_extremo: true, fallo_sensor: true, exceso_humedad: true } }
});

for (const [loc, prob] of [[DRY, 0], [RAIN, 80]]) {
  const hourly = Array.from({ length: 30 }, (_, i) => ({
    time: new Date(Date.now() + (i - 1) * 3600e3), temperature: 25, rainProbability: prob, windSpeed: 5, condition: 'soleado'
  }));
  await WeatherCache.findOneAndUpdate({ key: locKey(loc) },
    { key: locKey(loc), ...loc, fetchedAt: new Date(), hourly, daily: [] }, { upsert: true });
}

const mkPot = (suffix, loc, extra = {}) => Pot.create({
  ownerId: user._id, name: `Zona ${suffix}`, nodeId: `${TAG}-${suffix}`, deviceToken: 'x',
  minMoisture: 30, maxMoisture: 70, heatTempThreshold: 35, rainProbThreshold: 50,
  location: { ...loc, label: 'prueba' }, ...extra
});
const pots = {
  ok: await mkPot('ok', DRY),
  critica: await mkPot('critica', DRY),
  preventiva: await mkPot('preventiva', RAIN),
  salto: await mkPot('salto', DRY),
  interior: await mkPot('interior', RAIN, { exposure: 'interior' }),
  emergencia: await mkPot('emergencia', RAIN),
  espera: await mkPot('espera', RAIN),
  exceso: await mkPot('exceso', DRY),
  calor: await mkPot('calor', DRY),
  fallo: await mkPot('fallo', DRY, { online: true, lastSeenAt: new Date(Date.now() - 30 * 60e3) }),
  demo: await mkPot('demo', DRY, { online: true, isDemo: true, lastSeenAt: new Date(Date.now() - 30 * 60e3) })
};

const send = (pot, humedad, extra = {}) => handleTelemetry(pot.nodeId, { maceta_id: 1, humedad, ...extra });
const active = (pot, type) => Alert.countDocuments({ potId: pot._id, type, status: 'activa' });
const events = (pot, type) => Event.countDocuments({ potId: pot._id, type });
const mailsFor = (type) => mails.filter((m) => m.includes(`[GDA] ${LABEL[type]}`)).length;
const results = [];
const check = (name, cond) => {
  results.push({ name, ok: !!cond });
  origLog(`${cond ? 'OK   ' : 'FALLA'}  ${name}`);
};

try {
  origLog('\n-- Sin alertas cuando todo está en rango --');
  await send(pots.ok, 50, { temp_ambiente: 24, hum_ambiente: 60 });
  check('humedad 50% (rango 30-70) no genera ninguna alerta ni email', (await Alert.countDocuments({ potId: pots.ok._id })) === 0 && mails.length === 0);

  origLog('\n-- Alerta crítica: suelo bajo el mínimo y sin lluvia prevista --');
  await send(pots.critica, 20);
  check('crítica: alerta activa', (await active(pots.critica, 'critica')) === 1);
  check('crítica: decide regar (evento riego_activado; en modo lectura queda omitido)', (await events(pots.critica, 'riego_activado')) === 1);
  check('crítica: email enviado', mailsFor('critica') === 1);

  origLog('\n-- Alerta preventiva: suelo bajo el mínimo pero con lluvia prevista --');
  await send(pots.preventiva, 20);
  check('preventiva: alerta activa', (await active(pots.preventiva, 'preventiva')) === 1);
  check('preventiva: riego pospuesto (riego_pospuesto) y no se ordena riego', (await events(pots.preventiva, 'riego_pospuesto')) === 1 && (await events(pots.preventiva, 'riego_activado')) === 0);
  check('preventiva: no se levanta una crítica a la vez', (await active(pots.preventiva, 'critica')) === 0);
  check('preventiva: email enviado', mailsFor('preventiva') === 1);

  origLog('\n-- Lluvia: zona interior, emergencia y espera máxima (todas con lluvia pronosticada) --');
  await send(pots.interior, 20);
  check('interior: ignora la lluvia: riega (riego_activado) y no pospone', (await events(pots.interior, 'riego_activado')) === 1 && (await events(pots.interior, 'riego_pospuesto')) === 0);
  check('interior: alerta crítica y sin alerta preventiva', (await active(pots.interior, 'critica')) === 1 && (await active(pots.interior, 'preventiva')) === 0);
  await send(pots.emergencia, 10);
  check('emergencia: suelo 20 puntos bajo el mínimo (margen 10): riega aunque llueva', (await events(pots.emergencia, 'riego_activado')) === 1 && (await events(pots.emergencia, 'riego_pospuesto')) === 0);
  check('emergencia: el motivo queda en el evento', (await Event.findOne({ potId: pots.emergencia._id, type: 'riego_activado' })).detail?.reason === 'emergencia_humedad');
  await send(pots.espera, 25);
  check('espera: suelo bajo pero sin emergencia: primero pospone (preventiva)', (await active(pots.espera, 'preventiva')) === 1 && (await events(pots.espera, 'riego_activado')) === 0);
  await Alert.collection.updateOne({ potId: pots.espera._id, type: 'preventiva' }, { $set: { createdAt: new Date(Date.now() - 7 * 3600e3) } });
  await send(pots.espera, 24);
  check('espera: pasadas 6 h posponiendo y sigue seco: riega', (await events(pots.espera, 'riego_activado')) === 1);
  check('espera: la preventiva se resuelve y queda la crítica', (await active(pots.espera, 'preventiva')) === 0 && (await active(pots.espera, 'critica')) === 1);
  check('espera: el motivo queda en el evento', (await Event.findOne({ potId: pots.espera._id, type: 'riego_activado' })).detail?.reason === 'espera_lluvia_agotada');

  origLog('\n-- Exceso de humedad: suelo sobre el máximo --');
  await send(pots.exceso, 85);
  check('exceso: alerta activa', (await active(pots.exceso, 'exceso_humedad')) === 1);
  check('exceso: no se riega (evento riego_no_aplicado)', (await events(pots.exceso, 'riego_no_aplicado')) === 1);
  check('exceso: email enviado', mailsFor('exceso_humedad') === 1);

  origLog('\n-- Saltos de humedad sin pasar por el rango (alertas viejas que quedaban abiertas) --');
  await send(pots.salto, 10);
  check('salto: suelo seco levanta la crítica', (await active(pots.salto, 'critica')) === 1);
  await send(pots.salto, 95);
  check('salto: al pasar a muy húmedo la crítica se cierra y se levanta el exceso', (await active(pots.salto, 'critica')) === 0 && (await active(pots.salto, 'exceso_humedad')) === 1);
  await send(pots.salto, 5);
  check('salto: al volver a seco el exceso se cierra y se levanta una crítica nueva', (await active(pots.salto, 'exceso_humedad')) === 0 && (await active(pots.salto, 'critica')) === 1);

  origLog('\n-- Calor extremo: temperatura >= umbral con humedad baja (< mín+10) --');
  await send(pots.calor, 35, { temp_ambiente: 38, hum_ambiente: 30 });
  check('calor: alerta activa', (await active(pots.calor, 'calor_extremo')) === 1);
  check('calor: riego breve preventivo (evento riego_calor)', (await events(pots.calor, 'riego_calor')) === 1);
  check('calor: email enviado', mailsFor('calor_extremo') === 1);

  origLog('\n-- Fallo de sensor: sin datos por más del tiempo configurado --');
  await checkSensorTimeouts();
  check('fallo: alerta activa', (await active(pots.fallo, 'fallo_sensor')) === 1);
  check('fallo: la zona pasa a offline', (await Pot.findById(pots.fallo._id)).online === false);
  check('fallo: email enviado', mailsFor('fallo_sensor') === 1);
  check('fallo: una zona de ejemplo (isDemo) no levanta la alerta', (await active(pots.demo, 'fallo_sensor')) === 0);

  origLog('\n-- Anti-spam: la misma condición no repite alerta ni email --');
  const before = mails.length;
  await send(pots.critica, 19);
  await send(pots.exceso, 86);
  await checkSensorTimeouts();
  check('no se duplican alertas activas', (await active(pots.critica, 'critica')) === 1 && (await active(pots.exceso, 'exceso_humedad')) === 1 && (await active(pots.fallo, 'fallo_sensor')) === 1);
  check('no se mandan emails repetidos', mails.length === before);
  check('no se vuelve a ordenar riego dentro de la espera de 10 min', (await events(pots.critica, 'riego_activado')) === 1);

  origLog('\n-- Auto-resolución cuando la condición desaparece --');
  await send(pots.critica, 50);
  check('crítica se resuelve al volver a rango', (await active(pots.critica, 'critica')) === 0);
  await send(pots.preventiva, 50);
  check('preventiva se resuelve al volver a rango', (await active(pots.preventiva, 'preventiva')) === 0);
  await send(pots.exceso, 55);
  check('exceso se resuelve al volver a rango', (await active(pots.exceso, 'exceso_humedad')) === 0);
  await send(pots.calor, 50, { temp_ambiente: 28, hum_ambiente: 50 });
  check('calor se resuelve al bajar la temperatura', (await active(pots.calor, 'calor_extremo')) === 0);
  await send(pots.fallo, 50);
  check('fallo de sensor se resuelve cuando vuelve la telemetría', (await active(pots.fallo, 'fallo_sensor')) === 0);
  check('la zona vuelve a online', (await Pot.findById(pots.fallo._id)).online === true);

  origLog('\n-- Preferencias del usuario --');
  await User.updateOne({ _id: user._id }, { 'alertPrefs.types.exceso_humedad': false });
  const antes = mailsFor('exceso_humedad');
  await send(pots.exceso, 90);
  check('con el tipo desactivado la alerta se crea pero no manda email', (await active(pots.exceso, 'exceso_humedad')) === 1 && mailsFor('exceso_humedad') === antes);
  await User.updateOne({ _id: user._id }, { 'alertPrefs.email': false });
  const total = mails.length;
  await Alert.deleteMany({ potId: pots.critica._id });
  await Event.deleteMany({ potId: pots.critica._id });
  await send(pots.critica, 10);
  check('con el email desactivado la alerta se crea pero no manda email', (await active(pots.critica, 'critica')) === 1 && mails.length === total);
} finally {
  const ids = Object.values(pots).map((p) => p._id);
  await Promise.all([
    Alert.deleteMany({ potId: { $in: ids } }), Event.deleteMany({ potId: { $in: ids } }),
    Reading.deleteMany({ potId: { $in: ids } }), Pot.deleteMany({ _id: { $in: ids } }),
    User.deleteOne({ _id: user._id }),
    WeatherCache.deleteMany({ key: { $in: [locKey(DRY), locKey(RAIN)] } })
  ]);
  await mongoose.disconnect();
}

const fails = results.filter((r) => !r.ok);
origLog(`\n${results.length - fails.length}/${results.length} comprobaciones correctas`);
process.exit(fails.length ? 1 : 0);
