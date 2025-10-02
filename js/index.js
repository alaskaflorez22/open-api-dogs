document.addEventListener('DOMContentLoaded', () => {
  // === Config ===
  const API_BASE = 'https://api.thedogapi.com/v1';
  // (Opcional) pega tu API key gratuita:
  const API_KEY  = ''; // e.g. 'live_XXXXXXXXXXXXXXXXXXXXXXXXXXXX'
  const headers  = API_KEY ? { 'x-api-key': API_KEY } : {};

  // === Estado ===
  const state = {
    limit: 12,
    query: '' // nombre de raza (vacío = feed general)
  };

  // === DOM ===
  const listEl    = document.getElementById('dog-list');
  const errorEl   = document.getElementById('error');
  const statusEl  = document.getElementById('status');
  const reloadBt  = document.getElementById('reload');
  const formEl    = document.getElementById('search-form');
  const qInput    = document.getElementById('q');
  const clearBt   = document.getElementById('clear');
  const limitSel  = document.getElementById('limit');

  // === Utils ===
  function setStatus(text, isLoading = false){
    statusEl.textContent = text;
    statusEl.classList.toggle('is-loading', isLoading);
  }
  function showError(msg){
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }
  function hideError(){ errorEl.hidden = true; }

  function createCard({ url, breed }) {
    const li = document.createElement('li');
    li.className = 'card';

    const img = document.createElement('img');
    img.src = url;
    img.alt = breed?.name ? `${breed.name} dog` : 'Dog';

    const body = document.createElement('div');
    body.className = 'body';

    const h3 = document.createElement('h3');
    h3.textContent = breed?.name ?? 'Unknown breed';

    // Mínimo 2 datapoints: temperament + life_span (extra: weight)
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

  // === API helpers ===

  // 1) Feed aleatorio con razas incluidas
  function fetchRandomDogs(limit){
    const url = `${API_BASE}/images/search?has_breeds=1&include_breeds=1&limit=${limit}`;
    return fetch(url, { headers }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI images/search error (${res.status})`);
      return res.json();
    });
  }

  // 2) Imágenes por raza específica
  function fetchDogsByBreedId(breedId, limit){
    const url = `${API_BASE}/images/search?breed_ids=${breedId}&include_breeds=1&limit=${limit}`;
    return fetch(url, { headers }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI images/search (by breed) error (${res.status})`);
      return res.json();
    });
  }

  // 3) Buscar razas por nombre (para el buscador)
  function searchBreedsByName(q){
    const url = `${API_BASE}/breeds/search?q=${encodeURIComponent(q)}`;
    return fetch(url, { headers }).then(res => {
      if (!res.ok) throw new Error(`TheDogAPI breeds/search error (${res.status})`);
      return res.json();
    });
  }

  // 4) Fallback: si una imagen no trae breeds, consultamos /images/{id}
  async function enrichWithBreeds(items){
    const enriched = await Promise.all(items.map(async (it) => {
      if (Array.isArray(it.breeds) && it.breeds.length) return it;
      try {
        const det = await fetch(`${API_BASE}/images/${it.id}`, { headers }).then(r => {
          if (!r.ok) throw new Error(`images/${it.id} error (${r.status})`);
          return r.json();
        });
        return { ...it, breeds: det.breeds || [] };
      } catch {
        return it; // si falla, regresamos como vino
      }
    }));
    return enriched;
  }

  // === Controlador principal ===
  function loadDogs(){
    hideError();
    setStatus('Loading…', true);

    // Sin query -> feed general
    if (!state.query) {
      fetchRandomDogs(state.limit)
        .then(async data => {
          console.log('TheDogAPI images/search:', data);
          const filled = await enrichWithBreeds(data);
          if (!Array.isArray(filled) || filled.length === 0) {
            showError('No dog data found.');
            setStatus('Done', false);
            return;
          }
          renderDogs(filled);
        })
        .catch(err => {
          console.error(err);
          showError('Could not load dog data right now. Please try again later.');
          setStatus('Error', false);
        });
      return;
    }

    // Con query -> buscar raza y luego imágenes por breed_id
    searchBreedsByName(state.query)
      .then(breeds => {
        console.log('TheDogAPI breeds/search:', breeds);
        if (!Array.isArray(breeds) || breeds.length === 0) {
          showError(`No breeds found for "${state.query}".`);
          setStatus('Done', false);
          return [];
        }
        return fetchDogsByBreedId(breeds[0].id, state.limit);
      })
      .then(async data => {
        if (!Array.isArray(data) || data.length === 0) {
          showError(`No images found for "${state.query}".`);
          setStatus('Done', false);
          return;
        }
        console.log('TheDogAPI images/search (by breed):', data);
        const filled = await enrichWithBreeds(data);
        renderDogs(filled);
      })
      .catch(err => {
        console.error(err);
        showError('Could not load dog data right now. Please try again later.');
        setStatus('Error', false);
      });
  }

  // === Eventos ===
  reloadBt.addEventListener('click', loadDogs);

  formEl.addEventListener('submit', (e) => {
    e.preventDefault();
    state.query = qInput.value.trim();
    loadDogs();
  });

  clearBt.addEventListener('click', () => {
    qInput.value = '';
    state.query = '';
    loadDogs();
  });

  limitSel.addEventListener('change', () => {
    state.limit = parseInt(limitSel.value, 10) || 12;
    loadDogs();
  });

  // Primera carga
  loadDogs();
});
