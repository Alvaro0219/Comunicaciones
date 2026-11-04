<template>
  <div class="gda-auth">
    <!-- Panel de marca: sala de control en verde pino -->
    <section class="gda-auth-panel">
      <div class="gda-auth-brand">
        <div class="gda-auth-tile"><BrandMark :size="26" /></div>
        <span class="gda-auth-logo">GDA</span>
      </div>

      <div class="gda-auth-copy">
        <h1 class="gda-auth-claim"><slot name="claim" /></h1>
        <p class="gda-auth-desc"><slot name="description" /></p>
      </div>

      <!-- Vista de ejemplo: una zona con su banda de humedad -->
      <div class="gda-auth-demo" aria-hidden="true">
        <div class="gda-auth-demo-head">
          <span><i class="gda-auth-led" /> Zona de ejemplo</span>
          <span class="gda-auth-demo-tag">DEMO</span>
        </div>
        <div class="gda-auth-demo-value">62<small>%</small></div>
        <div class="gda-auth-demo-label">Humedad del suelo</div>
        <div class="gda-auth-track">
          <div class="gda-auth-safe" />
          <div class="gda-auth-marker" />
        </div>
        <div class="gda-auth-ticks"><span>30</span><span>70</span></div>
      </div>

      <ul class="gda-auth-points">
        <li><q-icon name="sensors" size="18px" /> Lecturas en tiempo real</li>
        <li><q-icon name="water_drop" size="18px" /> Riego decidido por el sistema</li>
        <li><q-icon name="notifications_active" size="18px" /> Alertas en pantalla y por email</li>
      </ul>
    </section>

    <section class="gda-auth-form">
      <div class="gda-auth-form-inner">
        <slot />
      </div>
    </section>
  </div>
</template>

<script setup>
import BrandMark from './BrandMark.vue';
</script>

<style scoped>
.gda-auth { display: flex; min-height: 100vh; }

.gda-auth-panel {
  position: relative;
  width: 46%;
  min-width: 420px;
  background: var(--gda-pine-deep);
  color: #E9F1E7;
  padding: 44px 56px;
  display: flex;
  flex-direction: column;
  gap: 32px;
}
.gda-auth-brand { display: flex; align-items: center; gap: 12px; }
.gda-auth-tile {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: rgba(127, 201, 143, 0.14);
  color: var(--gda-leaf-bright);
  display: grid;
  place-items: center;
}
.gda-auth-logo { font-family: var(--gda-font-display); font-size: 22px; font-weight: 800; letter-spacing: 0.05em; }
.gda-auth-copy { margin-top: auto; }
.gda-auth-claim {
  font-family: var(--gda-font-display);
  font-size: clamp(30px, 3.2vw, 44px);
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.02em;
  margin: 0 0 16px;
  max-width: 14ch;
}
.gda-auth-desc { font-size: 15px; line-height: 1.6; color: rgba(233, 241, 231, 0.74); max-width: 380px; margin: 0; }

.gda-auth-demo {
  max-width: 340px;
  padding: 18px 20px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
}
.gda-auth-demo-head { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: rgba(233, 241, 231, 0.8); }
.gda-auth-led { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--gda-leaf-bright); margin-right: 7px; box-shadow: 0 0 8px rgba(127, 201, 143, 0.7); }
.gda-auth-demo-tag { font-family: var(--gda-font-mono); font-size: 10px; letter-spacing: 0.1em; padding: 2px 7px; border-radius: 5px; background: rgba(255, 255, 255, 0.1); }
.gda-auth-demo-value { font-family: var(--gda-font-mono); font-size: 40px; font-weight: 600; margin-top: 10px; line-height: 1; color: var(--gda-leaf-bright); }
.gda-auth-demo-value small { font-size: 16px; margin-left: 2px; color: rgba(233, 241, 231, 0.6); }
.gda-auth-demo-label { font-family: var(--gda-font-mono); font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(233, 241, 231, 0.55); margin: 6px 0 14px; }
.gda-auth-track { position: relative; height: 10px; border-radius: 5px; background: rgba(255, 255, 255, 0.1); }
.gda-auth-safe { position: absolute; top: 0; bottom: 0; left: 30%; width: 40%; background: rgba(127, 201, 143, 0.28); border-inline: 1px solid var(--gda-leaf-bright); }
.gda-auth-marker { position: absolute; top: 50%; left: 62%; width: 16px; height: 16px; border-radius: 50%; background: var(--gda-leaf-bright); border: 3px solid var(--gda-pine-deep); transform: translate(-50%, -50%); }
.gda-auth-ticks { position: relative; height: 16px; margin-top: 4px; font-family: var(--gda-font-mono); font-size: 10px; color: rgba(233, 241, 231, 0.5); }
.gda-auth-ticks span { position: absolute; transform: translateX(-50%); }
.gda-auth-ticks span:nth-child(1) { left: 30%; }
.gda-auth-ticks span:nth-child(2) { left: 70%; }

.gda-auth-points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; font-size: 14px; color: rgba(233, 241, 231, 0.82); }
.gda-auth-points li { display: flex; align-items: center; gap: 10px; }
.gda-auth-points .q-icon { color: var(--gda-leaf-bright); }

.gda-auth-form { flex: 1; display: flex; align-items: center; justify-content: center; padding: 40px 24px; background: var(--gda-mist); }
.gda-auth-form-inner {
  width: 420px;
  max-width: 100%;
  padding: 36px 34px 30px;
  background: var(--gda-card);
  border: 1px solid var(--gda-hairline);
  border-radius: 18px;
  box-shadow: 0 12px 40px rgba(31, 42, 34, 0.07);
}

@media (max-width: 899px) {
  .gda-auth { flex-direction: column; }
  .gda-auth-panel { width: 100%; min-width: 0; padding: 28px 24px; gap: 18px; }
  .gda-auth-copy { margin-top: 8px; }
  .gda-auth-claim { font-size: 28px; max-width: none; }
  .gda-auth-demo, .gda-auth-points { display: none; }
  .gda-auth-form { padding: 24px 16px 40px; align-items: flex-start; margin-top: -8px; }
  .gda-auth-form-inner { padding: 28px 22px 24px; }
}
</style>
