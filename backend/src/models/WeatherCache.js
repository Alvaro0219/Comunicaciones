import mongoose from 'mongoose';

const WeatherCacheSchema = new mongoose.Schema({
  // Clave por ubicación redondeada a 2 decimales: macetas cercanas comparten pronóstico
  key: { type: String, required: true, unique: true, index: true },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  fetchedAt: { type: Date, required: true },
  hourly: [{
    _id: false,
    time: Date,
    temperature: Number,
    rainProbability: Number,
    windSpeed: Number,
    condition: String
  }],
  daily: [{
    _id: false,
    date: String,
    condition: String,
    tempMax: Number,
    tempMin: Number,
    rainProbabilityMax: Number
  }]
}, { timestamps: true });

export const WeatherCache = mongoose.model('WeatherCache', WeatherCacheSchema);
