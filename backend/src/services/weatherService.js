import { WeatherCache } from '../models/WeatherCache.js';
import { Pot } from '../models/Pot.js';
import { env } from '../config/env.js';

// Integración con Open-Meteo (gratuita, sin API key). El pronóstico se cachea por
// ubicación redondeada a 2 decimales y se refresca cada WEATHER_TTL_HOURS (default 3h):
// la lógica de decisión NUNCA consulta la API externa directamente, siempre lee el caché.

function locKey(lat, lon) {
  return `${lat.toFixed(2)},${lon.toFixed(2)}`;
}

function mapCondition(code) {
  if (code === 0 || code === 1) return 'despejado';
  if (code >= 51) return 'lluvioso';
  return 'nublado';
}

async function fetchFromApi(lat, lon) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', lat);
  url.searchParams.set('longitude', lon);
  url.searchParams.set('hourly', 'temperature_2m,precipitation_probability,wind_speed_10m,weather_code');
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('timezone', 'auto');

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Open-Meteo respondió ${res.status}`);
  const body = await res.json();

  const hourly = (body.hourly?.time || []).map((t, i) => ({
    time: new Date(t),
    temperature: body.hourly.temperature_2m?.[i] ?? null,
    rainProbability: body.hourly.precipitation_probability?.[i] ?? 0,
    windSpeed: body.hourly.wind_speed_10m?.[i] ?? null,
    condition: mapCondition(body.hourly.weather_code?.[i] ?? 0)
  }));

  const daily = (body.daily?.time || []).map((d, i) => ({
    date: d,
    condition: mapCondition(body.daily.weather_code?.[i] ?? 0),
    tempMax: body.daily.temperature_2m_max?.[i] ?? null,
    tempMin: body.daily.temperature_2m_min?.[i] ?? null,
    rainProbabilityMax: body.daily.precipitation_probability_max?.[i] ?? 0
  }));

  return { hourly, daily };
}

export async function getForecast(lat, lon, { forceRefresh = false } = {}) {
  if (lat == null || lon == null) return null;
  const key = locKey(lat, lon);
  const cached = await WeatherCache.findOne({ key }).lean();

  const ttlMs = env.weatherTtlHours * 60 * 60 * 1000;
  const isFresh = cached && (Date.now() - new Date(cached.fetchedAt).getTime()) < ttlMs;
  if (isFresh && !forceRefresh) return cached;

  try {
    const { hourly, daily } = await fetchFromApi(lat, lon);
    const doc = await WeatherCache.findOneAndUpdate(
      { key },
      { key, lat, lon, fetchedAt: new Date(), hourly, daily },
      { upsert: true, new: true }
    ).lean();
    return doc;
  } catch (err) {
    console.error(`Error consultando pronóstico (${key}):`, err.message);
    return cached || null; // ante fallo de la API, servir el caché viejo si existe
  }
}

// ¿Hay lluvia prevista dentro de las próximas `hours` horas por encima del umbral?
export function rainExpected(forecast, hours = 6, threshold = env.rainProbThreshold) {
  if (!forecast?.hourly?.length) return { expected: false, maxProb: 0 };
  const now = Date.now();
  const until = now + hours * 60 * 60 * 1000;
  let maxProb = 0;
  for (const h of forecast.hourly) {
    const t = new Date(h.time).getTime();
    if (t >= now - 30 * 60 * 1000 && t <= until) {
      maxProb = Math.max(maxProb, h.rainProbability || 0);
    }
  }
  return { expected: maxProb >= threshold, maxProb };
}

// Job periódico: refresca el pronóstico de todas las ubicaciones con macetas activas.
export async function refreshAllPotLocations() {
  const pots = await Pot.find({ isActive: true, 'location.lat': { $ne: null } })
    .select('location').lean();
  const seen = new Set();
  for (const pot of pots) {
    const { lat, lon } = pot.location || {};
    if (lat == null || lon == null) continue;
    const key = locKey(lat, lon);
    if (seen.has(key)) continue;
    seen.add(key);
    await getForecast(lat, lon, { forceRefresh: true });
  }
  if (seen.size > 0) console.log(`Pronóstico refrescado para ${seen.size} ubicación(es)`);
}
