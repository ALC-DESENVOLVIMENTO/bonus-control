(function (global) {
  function recommendedOperationPeriod(sources, mode = 'ff', currentMonth = currentOperationMonth()) {
    const required = mode === 'spot' ? ['DDS', 'MERCADO_LIVRE'] : ['DDS', 'MERCADO_LIVRE', 'LOGICA_FF'];
    const periods = source => Array.isArray(sources?.[source]?.periods) ? sources[source].periods : [];
    const months = [...new Set(required.flatMap(source => periods(source).map(item => item.period)).filter(period => /^\d{4}-(0[1-9]|1[0-2])$/.test(period) && period <= currentMonth))].sort().reverse();
    for (const month of months) {
      const stats = Object.fromEntries(required.map(source => {
        const item = periods(source).find(period => period.period === month) || {};
        return [source, {first: Number(item.firstQuinzenaRows || 0), second: Number(item.secondQuinzenaRows || 0), total: Number(item.rows || 0)}];
      }));
      // Prefira o período mais recente comum a todas as fontes obrigatórias.
      // Registros isolados ou com datas incorretas não devem deslocar o painel.
      if (!required.every(source => stats[source].total > 0)) continue;
      if (required.every(source => stats[source].first > 0 && stats[source].second > 0)) return {month, part: 'monthly'};
      const firstCoverage = required.filter(source => stats[source].first > 0).length;
      const secondCoverage = required.filter(source => stats[source].second > 0).length;
      if (firstCoverage || secondCoverage) return {month, part: secondCoverage >= firstCoverage && secondCoverage > 0 ? '2' : '1'};
      return {month, part: 'monthly'};
    }
    return null;
  }

  function currentOperationMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  const api = Object.freeze({recommendedOperationPeriod, currentOperationMonth});
  global.BonusPeriodSelection = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
