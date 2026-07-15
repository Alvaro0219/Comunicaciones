// Simulador del nodo GDA — habla el MISMO contrato que el firmware real de Tomás
// contra el broker en la nube (HiveMQ). "Se seca solo, riega cuando le mandan la
// orden, y confirma. El backend no distingue."
//
// Topics:  {prefix}/{nodo}/telemetria | comando | evento
// Payload: { maceta_id, humedad, temp_ambiente, hum_ambiente, rssi, ip, heap }
// Comando: { activar_riego: true, duracion_seg: 5, commandId? }
// Evento:  { maceta_id, evento: "riego_exitoso", commandId? }
//
// Uso (las credenciales salen del documento interno del equipo — el usuario
// personal es Subscribe-only y NO sirve para simular: pedir/crear gda_sim_xxx):
//
//   node index.js --host <HIVEMQ_HOST> --user gda_sim_alvaro --pass <PASS> \
//                 --prefix gda/dev-alvaro [--node nodo1] [--interval 5]
//
// Regla de equipo: usar SIEMPRE tu prefijo de desarrollo (gda/dev-xxx).
// gda/prod es solo del nodo real.

import mqtt from 'mqtt';

const args = process.argv.slice(2);
function getFlag(name, fallback = null) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
}

const HOST = getFlag('host');
const PORT = Number(getFlag('port', 8883));
const USER = getFlag('user');
const PASS = getFlag('pass');
const PREFIX = getFlag('prefix');
const NODE = getFlag('node', 'nodo1');
const INTERVAL_S = Number(getFlag('interval', 5));

if (!HOST || !USER || !PASS || !PREFIX) {
  console.error('Uso: node index.js --host <hivemq-host> --user <usuario> --pass <password> --prefix gda/dev-tunombre [--node nodo1] [--interval 5]');
  console.error('Credenciales: documento interno del equipo (GDA Guia Setup). Tu usuario personal es');
  console.error('Subscribe-only: para simular hace falta una credencial con publish (gda_sim_xxx).');
  process.exit(1);
}
if (PREFIX === 'gda/prod') {
  console.error('NO uses gda/prod: ese prefijo es solo del nodo real y del backend desplegado.');
  process.exit(1);
}

const topicTelemetria = `${PREFIX}/${NODE}/telemetria`;
const topicComando = `${PREFIX}/${NODE}/comando`;
const topicEvento = `${PREFIX}/${NODE}/evento`;

const client = mqtt.connect(`mqtts://${HOST}:${PORT}`, {
  username: USER,
  password: PASS,
  clientId: `sim-${Math.random().toString(16).slice(2, 8)}`,
  reconnectPeriod: 5000
});

let humedad = 40;
let regando = false;

client.on('connect', () => {
  console.log(`Simulador conectado a ${HOST} (nodo ${NODE}, prefijo ${PREFIX}, cada ${INTERVAL_S}s)`);
  client.subscribe(topicComando, { qos: 1 });

  setInterval(() => {
    if (!regando) humedad -= Math.random() * 2; // se va secando
    humedad = Math.max(0, humedad);

    const hora = new Date().getHours();
    const payload = {
      maceta_id: 1,
      humedad: +humedad.toFixed(1),
      temp_ambiente: +(20 + 6 * Math.sin(((hora - 9) / 24) * 2 * Math.PI) + Math.random() * 2).toFixed(2),
      hum_ambiente: +(50 + Math.random() * 20).toFixed(1),
      // Diagnóstico, como el firmware real
      rssi: -55 - Math.floor(Math.random() * 15),
      ip: '192.168.0.99',
      heap: 170000 + Math.floor(Math.random() * 10000)
    };
    client.publish(topicTelemetria, JSON.stringify(payload), { qos: 1 });
    console.log('TX', payload);
  }, INTERVAL_S * 1000);
});

client.on('message', (topic, msg) => {
  let cmd;
  try {
    cmd = JSON.parse(msg.toString());
  } catch {
    return;
  }
  console.log('RX comando:', cmd);

  if (cmd.activar_riego) {
    regando = true;
    console.log(`Regando ${cmd.duracion_seg}s...`);
    setTimeout(() => {
      humedad = Math.min(100, humedad + 30); // el riego sube la humedad
      regando = false;
      const evento = { maceta_id: 1, evento: 'riego_exitoso' };
      if (cmd.commandId) evento.commandId = cmd.commandId;
      client.publish(topicEvento, JSON.stringify(evento), { qos: 1 });
      console.log(`Riego completado (humedad ahora ${humedad.toFixed(1)}%), evento publicado`);
    }, (cmd.duracion_seg || 5) * 1000);
  }
});

client.on('error', (err) => {
  console.error('Error MQTT:', err.message);
  if (String(err.message).includes('Not authorized')) {
    console.error('La credencial no tiene permiso de publish en este prefijo (¿usuario Subscribe-only?).');
  }
});
