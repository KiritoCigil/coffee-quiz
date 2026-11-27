// Small runtime for the public report: loads anonymised answers from the quiz backend and draws the page.
(function () {
  const ENDPOINT = 'https://script.google.com/macros/s/AKfycbwT_oX4rVLkLaosoJta7sVoqE9M8eVA-Lz90WSlyoRy1bnQphO8vp5Ev2ryL7gi_KXuXw/exec';
  const REFRESH_MS = 120000;
  const calcs = [], draws = [];
  let store = {}, status = 'loading';

  window.dash = {
    colors: ['#6B4DFF', '#A38BFF', '#C6F24E', '#6CCBFF'],
    loader() {},
    calc(id, spec) { calcs.push([id, spec]); },
    draw(name, fn) {
      if (fn) draws.push([name, fn]);
      else draws.filter(([n]) => n === name).forEach(([n, f]) => document.querySelectorAll('[data-draw="' + n + '"]').forEach((el) => f(el)));
    },
    data(id) {
      if (status !== 'ok') return {status, data: []};
      return id in store ? {status: 'ok', data: store[id]} : {status: 'missing', data: []};
    },
    onData(fn) { fn(); }, params() { return {}; }, setParams() {}, resetParams() {}, setLink() {}, refresh() {}
  };

  function render() {
    for (const [name, fn] of draws) document.querySelectorAll('[data-draw="' + name + '"]').forEach((el) => { try { fn(el); } catch (e) { console.error(name, e); } });
    if (status !== 'loading') document.querySelectorAll('.dash-skeleton').forEach((e) => e.classList.remove('dash-skeleton'));
  }

  function key() {
    const h = location.hash.replace(/^#/, '');
    try { if (h) localStorage.setItem('cq-key', h); } catch (_) {}
    try { return h || localStorage.getItem('cq-key') || ''; } catch (_) { return h; }
  }

  async function load() {
    const k = key();
    const note = document.getElementById('cq-status');
    if (!k) {
      status = 'error';
      if (note) { note.hidden = false; note.textContent = 'Нужна ссылка с ключом доступа. Попросите её у владельца отчёта.'; }
      render();
      return;
    }
    try {
      const r = await fetch(ENDPOINT + '?stats=1&key=' + encodeURIComponent(k), {cache: 'no-store'});
      const j = await r.json();
      if (!j.ok) throw new Error(j.error === 'forbidden' ? 'Ключ в ссылке не подходит.' : 'Сервер ответил ошибкой.');
      store = {responses: j.rows};
      for (const [id, spec] of calcs) store[id] = spec.fn(...spec.inputs.map((i) => store[i]));
      status = 'ok';
      if (note) note.hidden = true;
    } catch (e) {
      if (status !== 'ok') status = 'error';
      if (note) { note.hidden = false; note.textContent = 'Не удалось загрузить данные: ' + (e.message || e) + ' Обновите страницу чуть позже.'; }
    }
    render();
  }

  window.addEventListener('DOMContentLoaded', () => {
    render();
    load();
    setInterval(() => { if (document.visibilityState === 'visible') load(); }, REFRESH_MS);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') load(); });
  });
})();
