<template>
  <q-table
    class="gda-table"
    flat
    :rows="rows"
    :columns="columns"
    :row-key="rowKey"
    :loading="loading"
    :grid="mobile"
    :hide-header="mobile"
    :pagination="{ rowsPerPage }"
    :rows-per-page-options="[rowsPerPage]"
    rows-per-page-label="Filas"
    :pagination-label="(from, to, total) => `${from}–${to} de ${total}`"
    :no-data-label="noDataLabel"
    :hide-pagination="rows.length <= rowsPerPage"
  >
    <!-- Escritorio: cada columna reexpone su celda como slot "cell-<nombre>" -->
    <template v-for="col in columns" :key="col.name" #[`body-cell-${col.name}`]="props">
      <q-td :props="props">
        <slot :name="`cell-${col.name}`" :row="props.row" :value="props.value" :col="col">{{ props.value }}</slot>
      </q-td>
    </template>

    <!-- Móvil: una tarjeta por registro -->
    <template #item="props">
      <div class="q-table__grid-item col-12 col-sm-6">
        <article class="gda-rcard">
          <header class="gda-rcard-head">
            <div class="gda-rcard-title">
              <slot :name="`cell-${titleColumn.name}`" :row="props.row" :value="valueOf(titleColumn, props.row)" :col="titleColumn">
                {{ valueOf(titleColumn, props.row) }}
              </slot>
            </div>
            <div v-if="badgeCol">
              <slot :name="`cell-${badgeCol.name}`" :row="props.row" :value="valueOf(badgeCol, props.row)" :col="badgeCol">
                {{ valueOf(badgeCol, props.row) }}
              </slot>
            </div>
          </header>
          <dl class="gda-rcard-grid">
            <div v-for="col in bodyColumns" :key="col.name" :class="{ 'is-wide': col.wide }">
              <dt class="gda-label">{{ col.label }}</dt>
              <dd>
                <slot :name="`cell-${col.name}`" :row="props.row" :value="valueOf(col, props.row)" :col="col">
                  {{ valueOf(col, props.row) }}
                </slot>
              </dd>
            </div>
          </dl>
          <footer v-if="actionsColumn" class="gda-rcard-foot">
            <slot :name="`cell-${actionsColumn.name}`" :row="props.row" :value="null" :col="actionsColumn" />
          </footer>
        </article>
      </div>
    </template>

    <template #no-data="{ message }">
      <div class="app-empty-state" style="width: 100%">
        <q-icon :name="noDataIcon" size="40px" color="grey-5" />
        <span>{{ message }}</span>
      </div>
    </template>
  </q-table>
</template>

<script setup>
import { computed } from 'vue';
import { useQuasar } from 'quasar';

// Tabla en escritorio, tarjetas en móvil (< 1024 px, el mismo corte que el layout).
// Columnas: las de Quasar + wide:true para texto largo (ocupa todo el ancho de la tarjeta).
// La primera columna es el título de la tarjeta; badgeColumn va a la derecha del título;
// la columna "actions" pasa al pie de la tarjeta.
const props = defineProps({
  rows: { type: Array, default: () => [] },
  columns: { type: Array, required: true },
  rowKey: { type: String, default: '_id' },
  loading: Boolean,
  rowsPerPage: { type: Number, default: 15 },
  noDataLabel: { type: String, default: 'No hay registros.' },
  noDataIcon: { type: String, default: 'inbox' },
  badgeColumn: { type: String, default: '' }
});

const $q = useQuasar();
const mobile = computed(() => $q.screen.lt.md);

const titleColumn = computed(() => props.columns[0]);
const actionsColumn = computed(() => props.columns.find((c) => c.name === 'actions'));
const badgeCol = computed(() => props.columns.find((c) => c.name === props.badgeColumn));
const bodyColumns = computed(() =>
  props.columns.slice(1).filter((c) => c.name !== 'actions' && c.name !== props.badgeColumn)
);

// Valor de la columna ya formateado, igual que en la tabla de escritorio
function valueOf(col, row) {
  const raw = typeof col.field === 'function' ? col.field(row) : row[col.field];
  return col.format ? col.format(raw, row) : raw;
}
</script>
