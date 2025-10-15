document.addEventListener('DOMContentLoaded', () => {
  // === Setting ===
  const API_BASE = 'https://api.thedogapi.com/v1';
  const API_KEY  = ''; 
  const headers  = API_KEY ? { 'x-api-key': API_KEY } : {};

  //  UI
  const state = {
    limit: 12,
    query: '',
    view: 'images', // 'images' | 'breeds'
  };

  
  let controller = null;
  function abortPending(){
    if (controller) controller.abort();
    controller = new AbortController();
    return controller.signal;
  }

  // === DOM ===
  const listEl    = document.getElementById('dog-list');
  const errorEl   = document.getElementById('error');
  const statusEl  = document.getElementById('status');
  const reloadBt  = document.getElementById('reload');
  const formEl    = document.getElementById('search-form');
  const qInput    = document.getElementById('q');
  const clearBt   = document.getElementById('clear');
  const limitSel  = document.getElementById('limit');

  const tabImages = document.getElementById('tab-images');
  const tabBreeds = document.getElementById('tab-breeds');

  function setStatus(text, isLoading = false){
    statusEl.textContent = text;
    statusEl.classList.toggle('is-loading', isLoading);
  }
  function showError(msg){
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function hideError(){ errorEl.hidden = true; }

  // ===== Render helpers =====
  function createCard({ url, breed }) {
    const li = document.createElement('li');
    li.className = 'card';

    const img = document.createElement('img');
    img.src = url || 'https://placehold.co/600x400?text=No+Image';
    img.alt = breed?.name ? `${breed.name} dog` : 'Dog';

    const body = document.createElement('div');
    body.className = 'body';

    const h3 = document.createElement('h3');
    h3.textContent = breed?.name ?? 'Unknown breed';

    const meta = document.createElement('p');
    meta.className = 'meta';
    const temperament = breed?.temperament ? `Temperament: ${breed.temperament}` : '';
    const life = breed?.life_span ? `Life span: ${breed.life_span}` : '';
    const weight = breed?.weight?.metric ? `Weight: ${breed.weight.metric} kg` : '';
    meta.textContent = [temperament, life, weight].filter(Boolean).join(' | ');

    body.appendChild(h3);
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

    li.appendChild(img);
    li.appendChild(body);
    return li;
  }

  function renderDogs(items){
    listEl.innerHTML = '';
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const breed = Array.isArray(it.breeds) && it.breeds.length ? it.breeds[0] : null;
      const card = createCard({ url: it.url, breed });
      listEl.appendChild(card);
    }
    setStatus(`Loaded (${items.length})`, false);
  }

  // Render for visit "breeds" 
  function renderBreeds(breeds){
    listEl.innerHTML = '';
    for (const b of breeds) {
      const url = b.image?.url || ''; 
      const card = createCard({ url, breed: b });
      listEl.appendChild(card);
    }
    setStatus(`Loaded (${breeds.length})`, false);
  }

  // === API helpers ===
  function fetchRandomDogs(limit, signal){
    const url = `${API_BASE}/images/search?has_breeds=1&include_breeds=1&limit=${limit}`;
    return fetch(url, { headers, signal }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI images/search error (${res.status})`);
      return res.json();
    });
  }

  function fetchDogsByBreedId(breedId, limit, signal){
    const url = `${API_BASE}/images/search?breed_ids=${breedId}&include_breeds=1&limit=${limit}`;
    return fetch(url, { headers, signal }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI images/search (by breed) error (${res.status})`);
      return res.json();
    });
  }

  function searchBreedsByName(q, signal){
    const url = `${API_BASE}/breeds/search?q=${encodeURIComponent(q)}`;
    return fetch(url, { headers, signal }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI breeds/search error (${res.status})`);
      return res.json();
    });
  }

  // List of breeds 
  function fetchBreedsList(signal){
    const url = `${API_BASE}/breeds`;
    return fetch(url, { headers, signal }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI /breeds error (${res.status})`);
      return res.json();
    });
  }

  
  async function enrichWithBreeds(items, signal){
    const enriched = await Promise.all(items.map(async (it) => {
      if (Array.isArray(it.breeds) && it.breeds.length) return it;
      try {
        const det = await fetch(`${API_BASE}/images/${it.id}`, { headers, signal }).then(r => {
          if (!r.ok) throw new Error(`images/${it.id} error (${r.status})`);
          return r.json();
        });
        return { ...it, breeds: det.breeds || [] };
      } catch {
        return it;
      }
    }));
    return enriched;
  }

  // === Loaders ===
  async function loadImagesView(){
    hideError();
    setStatus('Loading…', true);
    const signal = abortPending();

    try {
      if (!state.query) {
        const data = await fetchRandomDogs(state.limit, signal);
        const filled = await enrichWithBreeds(data, signal);
        if (!Array.isArray(filled) || filled.length === 0) {
          showError('No dog data found.');
          setStatus('Done', false);
          return;
        }
        renderDogs(filled);
        return;
      }

      // with query: search for breed and then images of that breed
      const breeds = await searchBreedsByName(state.query, signal);
      if (!Array.isArray(breeds) || breeds.length === 0) {
        showError(`No breeds found for "${state.query}".`);
        setStatus('Done', false);
        return;
      }
      const data = await fetchDogsByBreedId(breeds[0].id, state.limit, signal);
      if (!Array.isArray(data) || data.length === 0) {
        showError(`No images found for "${state.query}".`);
        setStatus('Done', false);
        return;
      }
      const filled = await enrichWithBreeds(data, signal);
      renderDogs(filled);
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      showError('Could not load dog data right now. Please try again later.');
      setStatus('Error', false);
    }
  }

  async function loadBreedsView(){
    hideError();
    setStatus('Loading…', true);
    const signal = abortPending();

    try {
      // If there is a query, use /breeds/search; if not, use /breeds (and trim by limit).
      if (state.query) {
        const breeds = await searchBreedsByName(state.query, signal);
        if (!Array.isArray(breeds) || breeds.length === 0) {
          showError(`No breeds found for "${state.query}".`);
          setStatus('Done', false);
          return;
        }
        // /breeds/search 
        renderBreeds(breeds.slice(0, state.limit));
        return;
      }

      const full = await fetchBreedsList(signal);
      if (!Array.isArray(full) || full.length === 0) {
        showError('No breeds found.');
        setStatus('Done', false);
        return;
      }
      renderBreeds(full.slice(0, state.limit));
    } catch (err) {
      if (err.name === 'AbortError') return;
      console.error(err);
      showError('Could not load breeds right now. Please try again later.');
      setStatus('Error', false);
    }
  }

  function loadView(){
    if (state.view === 'images') return loadImagesView();
    return loadBreedsView();
  }

  // === UI wiring ===
  function setActiveTab(view){
    state.view = view;
    tabImages.setAttribute('aria-pressed', String(view === 'images'));
    tabBreeds.setAttribute('aria-pressed', String(view === 'breeds'));
  }

  tabImages?.addEventListener('click', () => {
    if (state.view === 'images') return;
    setActiveTab('images');
    loadView();
  });

  tabBreeds?.addEventListener('click', () => {
    if (state.view === 'breeds') return;
    setActiveTab('breeds');
    loadView();
  });

  reloadBt.addEventListener('click', loadView);

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    state.query = qInput.value.trim();
    loadView();
  });

  clearBt.addEventListener('click', () => {
    qInput.value = '';
    state.query = '';
    loadView();
  });

  limitSel.addEventListener('change', () => {
    state.limit = parseInt(limitSel.value, 10) || 12;
    loadView();
  });

  // Inicial
  setActiveTab('images');
  loadView();
});
