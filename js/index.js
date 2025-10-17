document.addEventListener('DOMContentLoaded', () => {
  // === Setting ===
  const API_BASE = 'https://api.thedogapi.com/v1';
  const API_KEY = '';
  const headers = API_KEY ? { 'x-api-key': API_KEY } : {};

  const state = {
    limit: 12,
    query: '',
    view: 'images',
  };

  
  try {
    const saved = JSON.parse(localStorage.getItem('dogapp:ui') || '{}');
    if (saved.limit) state.limit = saved.limit;
    if (saved.view) state.view = saved.view;
    if (saved.query) state.query = saved.query;
  } catch {}

  let controller = null;
  function abortPending() {
    if (controller) controller.abort();
    controller = new AbortController();
    return controller.signal;
  }

  // === DOM ===
  const listEl = document.getElementById('dog-list');
  const errorEl = document.getElementById('error');
  const statusEl = document.getElementById('status');
  const reloadBt = document.getElementById('reload');
  const formEl = document.getElementById('search-form');
  const qInput = document.getElementById('q');
  const clearBt = document.getElementById('clear');
  const limitSel = document.getElementById('limit');
  const tabImages = document.getElementById('tab-images');
  const tabBreeds = document.getElementById('tab-breeds');

  //  Helpers
  function setToolbarDisabled(disabled) {
    formEl.querySelector('button[type="submit"]').disabled = disabled;
    qInput.disabled = disabled;
    limitSel.disabled = disabled;
    reloadBt.disabled = disabled;
    clearBt.disabled = disabled;
  }

  function showSkeletons(n = state.limit) {
    listEl.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const li = document.createElement('li');
      li.className = 'card';
      const sk = document.createElement('div');
      sk.className = 'skeleton';
      li.appendChild(sk);
      listEl.appendChild(li);
    }
  }

  function saveUI() {
    localStorage.setItem(
      'dogapp:ui',
      JSON.stringify({
        limit: state.limit,
        view: state.view,
        query: state.query,
      })
    );
  }

  // === UI feedback
  function setStatus(text, isLoading = false) {
    statusEl.textContent = text;
    statusEl.classList.toggle('is-loading', isLoading);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
    listEl.innerHTML = '';
  }

  function hideError() {
    errorEl.hidden = true;
  }

  // === Render helpers
  function createCard({ url, breed }) {
    const li = document.createElement('li');
    li.className = 'card';

    const img = document.createElement('img');
    img.src = url || 'https://placehold.co/300x200?text=No+Image';
    img.alt =
      breed?.name ? `${breed?.name} dog photo` : 'Unknown breed image';
    li.appendChild(img);

    const body = document.createElement('div');
    body.className = 'body';

    const h3 = document.createElement('h3');
    h3.textContent = breed?.name || 'Unknown breed';
    body.appendChild(h3);

    const meta = document.createElement('p');
    meta.className = 'meta';
    const temperament = breed?.temperament
      ? `Temperament: ${breed.temperament}`
      : '';
    const life = breed?.life_span ? `Life span: ${breed.life_span}` : '';
    const weight = breed?.weight?.metric
      ? `Weight: ${breed.weight.metric} kg`
      : '';
    meta.textContent = [temperament, life, weight].filter(Boolean).join(' | ');
    if (meta.textContent) body.appendChild(meta);

    if (breed?.wikipedia_url) {
      const more = document.createElement('p');
      more.className = 'more';
      const a = document.createElement('a');
      a.href = breed.wikipedia_url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.textContent = 'More info';
      more.appendChild(a);
      body.appendChild(more);
    }

    li.appendChild(body);
    return li;
  }

  function renderDogs(items) {
    listEl.innerHTML = '';
    items.forEach((it) =>
      listEl.appendChild(
        createCard({
          url: it.url,
          breed: Array.isArray(it.breeds) && it.breeds.length ? it.breeds[0] : null,
        })
      )
    );
    setStatus(`Loaded (${items.length})`);
  }

  function renderBreeds(breeds) {
    listEl.innerHTML = '';
    breeds.forEach((b) =>
      listEl.appendChild(createCard({ url: b.image?.url || '', breed: b }))
    );
    setStatus(`Loaded (${breeds.length})`);
  }

  // === API ===
  function fetchRandomDogs(limit, signal) {
    return fetch(
      `${API_BASE}/images/search?has_breeds=1&include_breeds=1&limit=${limit}`,
      { headers, signal }
    ).then((res) => res.json());
  }

  function fetchDogsByBreedId(breedId, limit, signal) {
    return fetch(
      `${API_BASE}/images/search?breed_ids=${breedId}&include_breeds=1&limit=${limit}`,
      { headers, signal }
    ).then((res) => res.json());
  }

  function searchBreedsByName(q, signal) {
    return fetch(
      `${API_BASE}/breeds/search?q=${encodeURIComponent(q)}`,
      { headers, signal }
    ).then((res) => res.json());
  }

  function fetchBreedsList(signal) {
    return fetch(`${API_BASE}/breeds`, { headers, signal }).then((res) =>
      res.json()
    );
  }

  async function enrichWithBreeds(items, signal) {
    return Promise.all(
      items.map(async (it) => {
        if (Array.isArray(it.breeds) && it.breeds.length) return it;
        try {
          const det = await fetch(`${API_BASE}/images/${it.id}`, {
            headers,
            signal,
          }).then((r) => r.json());
          return { ...it, breeds: det.breeds || [] };
        } catch {
          return it;
        }
      })
    );
  }

  // === Views ===
  async function loadImagesView() {
    hideError();
    setToolbarDisabled(true);
    showSkeletons();
    const signal = abortPending();
    setStatus('Loading...', true);

    try {
      if (!state.query) {
        const data = await fetchRandomDogs(state.limit, signal);
        renderDogs(await enrichWithBreeds(data, signal));
        return;
      }
      const breeds = await searchBreedsByName(state.query, signal);
      if (!breeds.length) return showError(`No breeds found for "${state.query}".`);
      const imgs = await fetchDogsByBreedId(breeds[0].id, state.limit, signal);
      renderDogs(await enrichWithBreeds(imgs, signal));
    } catch {
      showError('Could not load dog data. Try again later.');
    } finally {
      setToolbarDisabled(false);
      setStatus('Done');
    }
  }

  async function loadBreedsView() {
    hideError();
    setToolbarDisabled(true);
    showSkeletons();
    const signal = abortPending();
    setStatus('Loading...', true);

    try {
      if (state.query) {
        const breeds = await searchBreedsByName(state.query, signal);
        if (!breeds.length) return showError(`No breeds found for "${state.query}".`);
        renderBreeds(breeds.slice(0, state.limit));
        return;
      }
      const full = await fetchBreedsList(signal);
      renderBreeds(full.slice(0, state.limit));
    } catch {
      showError('Could not load breeds. Try again later.');
    } finally {
      setToolbarDisabled(false);
      setStatus('Done');
    }
  }

  function loadView() {
    if (state.view === 'images') return loadImagesView();
    return loadBreedsView();
  }

  // === UI setup ===
  function setActiveTab(view) {
    state.view = view;
    tabImages.setAttribute('aria-selected', String(view === 'images'));
    tabBreeds.setAttribute('aria-selected', String(view === 'breeds'));
    saveUI();
  }

  tabImages.addEventListener('click', () => {
    setActiveTab('images');
    loadView();
  });

  tabBreeds.addEventListener('click', () => {
    setActiveTab('breeds');
    loadView();
  });

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = qInput.value.trim();
    if (q && q.length < 2) return showError('Type at least 2 letters to search.');
    state.query = q;
    saveUI();
    loadView();
  });

  clearBt.addEventListener('click', () => {
    qInput.value = '';
    state.query = '';
    saveUI();
    qInput.focus();
    loadView();
  });

  limitSel.value = state.limit;
  limitSel.addEventListener('change', () => {
    state.limit = Number(limitSel.value);
    saveUI();
    loadView();
  });

  reloadBt.addEventListener('click', loadView);

  // === Init ===
  setActiveTab(state.view);
  qInput.value = state.query;
  qInput.focus();
  loadView();
});
