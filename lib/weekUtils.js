// Semana = segunda a domingo, sempre em America/Sao_Paulo.
// Brasil não usa mais horário de verão desde 2019, então o offset é fixo (UTC-3),
// o que permite fazer a aritmética de datas em UTC sem se preocupar com DST.
const SP_OFFSET_MS = -3 * 60 * 60 * 1000;

function ymd(date) {
  return date.toISOString().slice(0, 10);
}

// Data/hora "agora" como se fosse um relógio de parede em São Paulo, representada em UTC.
function spNow() {
  return new Date(Date.now() + SP_OFFSET_MS);
}

// `dateStr` no formato YYYY-MM-DD (calendário local de SP). Meio-dia UTC evita
// qualquer problema de arredondamento de fuso ao converter de volta pra string.
function parseLocalDate(dateStr) {
  return new Date(`${dateStr}T12:00:00Z`);
}

function mondayOf(date) {
  const day = date.getUTCDay(); // 0=Dom..6=Sáb
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(date);
  monday.setUTCDate(monday.getUTCDate() + diff);
  return monday;
}

function addDays(weekStartStr, days) {
  const d = parseLocalDate(weekStartStr);
  d.setUTCDate(d.getUTCDate() + days);
  return ymd(d);
}

function currentWeekStart() {
  return ymd(mondayOf(spNow()));
}

function weekStartFor(dateStr) {
  return ymd(mondayOf(parseLocalDate(dateStr)));
}

function weekEndFor(weekStartStr) {
  return addDays(weekStartStr, 6);
}

function previousWeekStart(weekStartStr) {
  return addDays(weekStartStr, -7);
}

function nextWeekStart(weekStartStr) {
  return addDays(weekStartStr, 7);
}

// Mês de referência de uma semana = mês da segunda-feira daquela semana.
function monthOfWeek(weekStartStr) {
  return weekStartStr.slice(0, 7); // YYYY-MM
}

// Todas as segundas-feiras (weekStart) que caem dentro do mês YYYY-MM.
function weekStartsInMonth(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1, 12));
  const last = new Date(Date.UTC(y, m, 0, 12));
  const weeks = [];
  let cursor = mondayOf(first);
  if (cursor < first) cursor = new Date(cursor.getTime() + 7 * 86400000);
  while (cursor <= last) {
    weeks.push(ymd(cursor));
    cursor = new Date(cursor.getTime() + 7 * 86400000);
  }
  return weeks;
}

module.exports = {
  currentWeekStart,
  weekStartFor,
  weekEndFor,
  previousWeekStart,
  nextWeekStart,
  monthOfWeek,
  weekStartsInMonth,
  addDays
};
