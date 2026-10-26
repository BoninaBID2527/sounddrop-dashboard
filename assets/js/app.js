(function () {
  "use strict";

  const D = window.SOUNDDROP;

  const COLORI = {
    giallo: "#e5a800",
    gialloHover: "#c99400",
    gialloMappa: "#f5b800",
    grigio: "#c4c3bc",
    testo: "#0b0b0b",
    testo2: "#52514e",
    griglia: "#efeee9",
    nero: "#0e0e0e",
  };
  const MESI = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];

  /* ---------- Dati ---------- */

  const citta = new Map(D.citta.map(([id, nome, regione, lat, lon]) => [id, { id, nome, regione, lat, lon }]));
  const canali = new Map(D.canali.map(([id, nome]) => [id, { id, nome }]));
  const eventi = new Map(D.eventi.map(([id, nome, artista, genere, cittaId, data, capienza]) =>
    [id, { id, nome, artista, genere, citta: citta.get(cittaId), data, anno: Number(data.slice(0, 4)), capienza }]));
  const righe = D.mensile.map(([eventoId, canaleId, mese, biglietti, incasso]) => ({
    evento: eventi.get(eventoId),
    canale: canali.get(canaleId),
    anno: Math.floor(mese / 100),
    mese: mese % 100,
    biglietti,
    incasso,
  }));

  // Biglietti venduti in totale da ogni evento (serve al tasso di riempimento)
  const bigliettiEvento = new Map();
  righe.forEach((r) => bigliettiEvento.set(r.evento.id, (bigliettiEvento.get(r.evento.id) || 0) + r.biglietti));

  const anni = [...new Set(righe.map((r) => r.anno))].sort();
  const generi = [...new Set([...eventi.values()].map((e) => e.genere))].sort((a, b) => a.localeCompare(b, "it"));
  const ultimoMese = new Map();
  righe.forEach((r) => ultimoMese.set(r.anno, Math.max(ultimoMese.get(r.anno) || 0, r.mese)));

  /* ---------- Formati ---------- */

  const nf = (opzioni) => new Intl.NumberFormat("it-IT", { useGrouping: "always", ...opzioni });
  const fEuro = nf({ style: "currency", currency: "EUR", maximumFractionDigits: 0 });
  const fEuro2 = nf({ style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fNum = nf({});
  const fPct = nf({ style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fVar = nf({ style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1, signDisplay: "exceptZero" });
  const fData = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" });

  function euroBreve(v) {
    if (v >= 1e6) return (v / 1e6).toLocaleString("it-IT", { maximumFractionDigits: 1 }) + " Mln €";
    if (v >= 1e3) return Math.round(v / 1e3).toLocaleString("it-IT") + "k €";
    return fEuro.format(v);
  }

  const somma = (lista, campo) => lista.reduce((s, r) => s + r[campo], 0);
  const imposta = (id, testo) => { document.getElementById(id).textContent = testo; };

  /* ---------- Stato e filtri ---------- */

  const stato = { anno: anni[anni.length - 1], genere: "tutti", tutti: false };
  const perGenere = (e) => stato.genere === "tutti" || e.genere === stato.genere;
  const perAnno = (r) => stato.anno === "tutti" || r.anno === stato.anno;

  const selezione = () => righe.filter((r) => perAnno(r) && perGenere(r.evento));
  const eventiDelPeriodo = () => [...eventi.values()].filter((e) =>
    perGenere(e) && (stato.anno === "tutti" || e.anno === stato.anno));

  function raggruppa(lista, chiave) {
    const gruppi = new Map();
    lista.forEach((r) => {
      const k = chiave(r);
      const g = gruppi.get(k) || { chiave: k, incasso: 0, biglietti: 0 };
      g.incasso += r.incasso;
      g.biglietti += r.biglietti;
      gruppi.set(k, g);
    });
    return [...gruppi.values()];
  }

  function riempimento(listaEventi) {
    const capienza = listaEventi.reduce((s, e) => s + e.capienza, 0);
    const venduti = listaEventi.reduce((s, e) => s + (bigliettiEvento.get(e.id) || 0), 0);
    return capienza ? venduti / capienza : null;
  }

  function periodo(anno) {
    const m = ultimoMese.get(anno);
    return m === 12 ? `anno ${anno}` : `gen - ${MESI[m - 1].toLowerCase()} ${anno}`;
  }

  // Stesso periodo dell'anno prima (stessi mesi), con lo stesso filtro sul genere
  function annoPrecedente() {
    if (stato.anno === "tutti" || !ultimoMese.has(stato.anno - 1)) return null;
    const mese = ultimoMese.get(stato.anno);
    const lista = righe.filter((r) => r.anno === stato.anno - 1 && r.mese <= mese && perGenere(r.evento));
    return { anno: stato.anno - 1, mese, lista };
  }

  function preparaFiltri() {
    const selAnno = document.getElementById("filtro-anno");
    [...anni].reverse().forEach((a) => selAnno.add(new Option(String(a), String(a))));
    selAnno.add(new Option("Tutti gli anni", "tutti"));
    selAnno.value = String(stato.anno);
    selAnno.addEventListener("change", () => {
      stato.anno = selAnno.value === "tutti" ? "tutti" : Number(selAnno.value);
      aggiorna();
    });

    const selGenere = document.getElementById("filtro-genere");
    selGenere.add(new Option("Tutti i generi", "tutti"));
    generi.forEach((g) => selGenere.add(new Option(g, g)));
    selGenere.addEventListener("change", () => {
      stato.genere = selGenere.value;
      aggiorna();
    });
  }

  function impostaGenere(genere) {
    stato.genere = genere;
    document.getElementById("filtro-genere").value = genere;
    aggiorna();
  }

  /* ---------- Grafici: impostazioni comuni ---------- */

  Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
  Chart.defaults.font.size = 12;
  Chart.defaults.color = COLORI.testo2;
  Chart.defaults.borderColor = COLORI.griglia;
  Chart.defaults.animation.duration = 300;
  Object.assign(Chart.defaults.plugins.tooltip, {
    backgroundColor: COLORI.nero,
    padding: 10,
    cornerRadius: 8,
    titleColor: "#d9d8d2",
    titleFont: { weight: "500" },
    bodyColor: "#ffffff",
    bodyFont: { weight: "600", size: 13 },
    boxPadding: 6,
    usePointStyle: true,
  });

  // Valore scritto alla fine di ogni barra (il formato è salvato su chart.$formato)
  const etichetteBarre = {
    id: "etichetteBarre",
    afterDatasetsDraw(chart) {
      const formato = chart.$formato;
      if (!formato) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.font = `600 12px ${Chart.defaults.font.family}`;
      ctx.fillStyle = COLORI.testo;
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      chart.getDatasetMeta(0).data.forEach((barra, i) => {
        const v = chart.data.datasets[0].data[i];
        if (v != null) ctx.fillText(formato(v), barra.x + 6, barra.y);
      });
      ctx.restore();
    },
  };

  // Linea verticale che segue il mouse sui grafici a linee
  const mirino = {
    id: "mirino",
    afterDraw(chart) {
      const attivi = chart.tooltip && chart.tooltip.getActiveElements();
      if (!attivi || !attivi.length) return;
      const x = attivi[0].element.x;
      const { top, bottom } = chart.chartArea;
      const ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = "#cfcec7";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, bottom);
      ctx.stroke();
      ctx.restore();
    },
  };

  // Accorcia un'etichetta finché non entra nella larghezza disponibile (misurata davvero)
  function adatta(testo, larghezza) {
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.font = `12px ${Chart.defaults.font.family}`;
    if (ctx.measureText(testo).width <= larghezza) return testo;
    while (testo.length > 4 && ctx.measureText(testo + "…").width > larghezza) testo = testo.slice(0, -1);
    return testo.trimEnd() + "…";
  }

  function graficoBarre(id, { formato, onClick, breve = false, spazioDestro = 86 }) {
    const grafico = new Chart(document.getElementById(id), {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          data: [],
          backgroundColor: COLORI.giallo,
          hoverBackgroundColor: COLORI.gialloHover,
          borderRadius: 4,
          borderSkipped: "start",
          maxBarThickness: 24,
          categoryPercentage: 0.8,
          barPercentage: 0.9,
        }],
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        layout: { padding: { right: spazioDestro } },
        scales: {
          x: { display: false, beginAtZero: true },
          y: {
            grid: { display: false },
            border: { display: false },
            // larghezza dell'asse = etichetta più lunga (al massimo il 38% del grafico)
            afterFit: (scala) => {
              const ctx = scala.ctx;
              ctx.save();
              ctx.font = `12px ${Chart.defaults.font.family}`;
              const piuLunga = Math.max(0, ...scala.ticks.map((t) => ctx.measureText(String(t.label)).width));
              ctx.restore();
              scala.width = Math.ceil(Math.min(piuLunga + 14, scala.chart.width * 0.38));
            },
            ticks: {
              color: COLORI.testo,
              autoSkip: false,
              callback(valore) {
                let testo = this.getLabelForValue(valore);
                // su schermi stretti: solo artista o festival, senza città e data
                if (breve && this.chart.width < 520) testo = testo.split(" - ")[0];
                return adatta(testo, this.chart.width * 0.38 - 14);
              },
            },
          },
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            displayColors: false,
            callbacks: { label: (c) => formato(c.raw) },
          },
        },
        onClick: onClick ? (e, elementi) => { if (elementi.length) onClick(elementi[0].index); } : undefined,
        onHover: (e, elementi) => {
          e.native.target.style.cursor = onClick && elementi.length ? "pointer" : "default";
        },
      },
      plugins: [etichetteBarre],
    });
    grafico.$formato = formato;
    return grafico;
  }

  function graficoLinee(id, { formato, assePasso }) {
    return new Chart(document.getElementById(id), {
      type: "line",
      data: { labels: [], datasets: [] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: {
          x: {
            grid: { display: false },
            border: { color: "#dcdbd5" },
            ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: assePasso || 12 },
          },
          y: {
            beginAtZero: true,
            border: { display: false },
            grid: { color: COLORI.griglia },
            ticks: { callback: (v) => formato(v), maxTicksLimit: 5 },
          },
        },
        plugins: {
          legend: {
            display: false,
            align: "end",
            labels: { usePointStyle: true, pointStyle: "line", boxWidth: 18, color: COLORI.testo2 },
          },
          tooltip: {
            callbacks: {
              label: (c) => `${formato(c.raw)}  ${c.dataset.label}`,
              labelPointStyle: () => ({ pointStyle: "line", rotation: 0 }),
            },
          },
        },
      },
      plugins: [mirino],
    });
  }

  const serieLinea = (etichetta, dati, colore, riempi) => ({
    label: etichetta,
    data: dati,
    borderColor: colore,
    backgroundColor: riempi ? "rgba(229, 168, 0, 0.10)" : colore,
    fill: riempi,
    borderWidth: 2,
    borderCapStyle: "round",
    borderJoinStyle: "round",
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBorderWidth: 2,
    pointHoverBorderColor: "#ffffff",
    pointBackgroundColor: colore,
    tension: 0.3,
  });

  /* ---------- Vista tabella delle schede ---------- */

  function tabellaDati(chiave, colonne, righeTabella) {
    const scheda = document.querySelector(`[data-scheda="${chiave}"]`);
    let box = scheda.querySelector(".dati-tabella");
    if (!box) {
      box = document.createElement("div");
      box.className = "dati-tabella";
      scheda.querySelector(".scheda__corpo").appendChild(box);
    }
    const tabella = document.createElement("table");
    tabella.className = "tabella";
    const testa = tabella.createTHead().insertRow();
    colonne.forEach(([nome, numerica]) => {
      const th = document.createElement("th");
      th.textContent = nome;
      if (numerica) th.className = "num";
      testa.appendChild(th);
    });
    const corpo = tabella.createTBody();
    righeTabella.forEach((valori) => {
      const tr = corpo.insertRow();
      valori.forEach((v, i) => {
        const td = tr.insertCell();
        td.textContent = v;
        if (colonne[i][1]) td.className = "num";
      });
    });
    box.replaceChildren(tabella);
  }

  function preparaSchede() {
    document.querySelectorAll(".scheda__vista").forEach((pulsante) => {
      pulsante.setAttribute("aria-pressed", "false");
      pulsante.addEventListener("click", () => {
        const scheda = pulsante.closest(".scheda");
        const tabella = scheda.classList.toggle("vista-tabella");
        pulsante.textContent = tabella ? "Grafico" : "Tabella";
        pulsante.setAttribute("aria-pressed", String(tabella));
        if (!tabella && scheda.dataset.scheda === "mappa") mappa.invalidateSize();
      });
    });
  }

  /* ---------- Grafici della pagina ---------- */

  const gTrend = graficoLinee("g-trend", { formato: euroBreve });

  const gGenere = graficoBarre("g-genere", {
    formato: euroBreve,
    spazioDestro: 64,
    onClick: (i) => {
      const g = gGenere.data.labels[i];
      impostaGenere(stato.genere === g ? "tutti" : g);
    },
  });

  const gTop = graficoBarre("g-top", {
    formato: (v) => fEuro.format(v),
    breve: true,
    spazioDestro: 92,
    onClick: (i) => apriDettaglio(gTop.$ids[i]),
  });

  const gCanali = graficoBarre("g-canali", { formato: euroBreve, spazioDestro: 64 });
  const gRiempimento = graficoBarre("g-riempimento", { formato: (v) => fPct.format(v), spazioDestro: 56 });

  function aggiornaKpi(sel) {
    const incasso = somma(sel, "incasso");
    const biglietti = somma(sel, "biglietti");
    const nEventi = new Set(sel.map((r) => r.evento.id)).size;

    imposta("kpi-incasso", fEuro.format(incasso));
    imposta("kpi-incasso-nota", stato.anno === "tutti" ? "tutti gli anni" : periodo(stato.anno));
    imposta("kpi-biglietti", fNum.format(biglietti));
    imposta("kpi-biglietti-nota", `${nEventi} eventi`);
    imposta("kpi-prezzo", biglietti ? fEuro2.format(incasso / biglietti) : "-");
    const r = riempimento(eventiDelPeriodo());
    imposta("kpi-riempimento", r == null ? "-" : fPct.format(r));

    const nota = document.getElementById("kpi-variazione-nota");
    const prec = annoPrecedente();
    if (!prec || !prec.lista.length) {
      imposta("kpi-variazione", "n.d.");
      nota.textContent = stato.anno === "tutti" ? "seleziona un anno" : `nessun dato per il ${stato.anno - 1}`;
      return;
    }
    const base = somma(prec.lista, "incasso");
    const variazione = (incasso - base) / base;
    imposta("kpi-variazione", fVar.format(variazione));
    const freccia = document.createElement("span");
    freccia.className = variazione >= 0 ? "su" : "giu";
    freccia.textContent = variazione >= 0 ? "▲ " : "▼ ";
    const confronto = prec.mese === 12 ? `${prec.anno}` : `gen - ${MESI[prec.mese - 1].toLowerCase()} ${prec.anno}`;
    nota.replaceChildren(freccia, document.createTextNode(`vs ${confronto} (${euroBreve(base)})`));
  }

  function aggiornaTrend() {
    let etichette;
    let serie;
    const filtro = (r) => perGenere(r.evento);
    if (stato.anno === "tutti") {
      const mesi = [...new Set(righe.map((r) => r.anno * 100 + r.mese))].sort((a, b) => a - b);
      const valori = mesi.map((m) => somma(righe.filter((r) => filtro(r) && r.anno * 100 + r.mese === m), "incasso"));
      etichette = mesi.map((m) => `${MESI[(m % 100) - 1]} ${String(Math.floor(m / 100)).slice(2)}`);
      serie = [serieLinea("Incasso", valori, COLORI.giallo, true)];
      imposta("trend-sotto", "Tutto il periodo disponibile");
    } else {
      const fino = ultimoMese.get(stato.anno);
      const mesi = Array.from({ length: fino }, (_, i) => i + 1);
      const valori = (anno) => mesi.map((m) => somma(righe.filter((r) => filtro(r) && r.anno === anno && r.mese === m), "incasso"));
      etichette = mesi.map((m) => MESI[m - 1]);
      serie = [serieLinea(`Incasso ${stato.anno}`, valori(stato.anno), COLORI.giallo, true)];
      if (ultimoMese.has(stato.anno - 1)) {
        serie.push(serieLinea(`Incasso ${stato.anno - 1}`, valori(stato.anno - 1), COLORI.grigio, false));
        imposta("trend-sotto", `${stato.anno} confrontato con lo stesso periodo del ${stato.anno - 1}`);
      } else {
        imposta("trend-sotto", `Anno ${stato.anno}`);
      }
    }
    gTrend.data.labels = etichette;
    gTrend.data.datasets = serie;
    gTrend.options.plugins.legend.display = serie.length > 1;
    gTrend.update();

    tabellaDati("trend", [["Mese", false], ...serie.map((s) => [s.label, true])],
      etichette.map((e, i) => [e, ...serie.map((s) => fEuro.format(s.data[i]))]));
  }

  function aggiornaGenere() {
    // Mostra tutti i generi (filtrati solo per anno) ed evidenzia quello scelto
    const gruppi = raggruppa(righe.filter(perAnno), (r) => r.evento.genere).sort((a, b) => b.incasso - a.incasso);
    gGenere.data.labels = gruppi.map((g) => g.chiave);
    gGenere.data.datasets[0].data = gruppi.map((g) => g.incasso);
    gGenere.data.datasets[0].backgroundColor = gruppi.map((g) =>
      stato.genere === "tutti" || g.chiave === stato.genere ? COLORI.giallo : COLORI.grigio);
    gGenere.update();
    tabellaDati("genere", [["Genere", false], ["Incasso", true], ["Biglietti", true]],
      gruppi.map((g) => [g.chiave, fEuro.format(g.incasso), fNum.format(g.biglietti)]));
  }

  function aggiornaTop(sel) {
    const top = raggruppa(sel, (r) => r.evento.id).sort((a, b) => b.incasso - a.incasso).slice(0, 5);
    gTop.$ids = top.map((t) => t.chiave);
    gTop.data.labels = top.map((t) => eventi.get(t.chiave).nome);
    gTop.data.datasets[0].data = top.map((t) => t.incasso);
    gTop.update();
    tabellaDati("top", [["Evento", false], ["Incasso", true], ["Biglietti", true]],
      top.map((t) => [eventi.get(t.chiave).nome, fEuro.format(t.incasso), fNum.format(t.biglietti)]));
  }

  function aggiornaCanali(sel) {
    const gruppi = raggruppa(sel, (r) => r.canale.nome).sort((a, b) => b.incasso - a.incasso);
    const totale = somma(gruppi, "incasso");
    gCanali.data.labels = gruppi.map((g) => g.chiave);
    gCanali.data.datasets[0].data = gruppi.map((g) => g.incasso);
    gCanali.update();
    tabellaDati("canali", [["Canale", false], ["Incasso", true], ["Quota", true]],
      gruppi.map((g) => [g.chiave, fEuro.format(g.incasso), fPct.format(totale ? g.incasso / totale : 0)]));
  }

  function aggiornaRiempimento() {
    const perCitta = new Map();
    eventiDelPeriodo().forEach((e) => {
      const lista = perCitta.get(e.citta.nome) || [];
      lista.push(e);
      perCitta.set(e.citta.nome, lista);
    });
    const valori = [...perCitta].map(([nome, lista]) => ({ nome, tasso: riempimento(lista), eventi: lista.length }))
      .sort((a, b) => b.tasso - a.tasso);
    gRiempimento.data.labels = valori.map((v) => v.nome);
    gRiempimento.data.datasets[0].data = valori.map((v) => v.tasso);
    gRiempimento.update();
    tabellaDati("riempimento", [["Città", false], ["Riempimento", true], ["Eventi", true]],
      valori.map((v) => [v.nome, fPct.format(v.tasso), String(v.eventi)]));
  }

  /* ---------- Mappa ---------- */

  const mappa = L.map("mappa", { scrollWheelZoom: false, attributionControl: true });
  L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 10,
  }).addTo(mappa);
  mappa.fitBounds(L.latLngBounds([...citta.values()].map((c) => [c.lat, c.lon])).pad(0.12));
  mappa.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  const livelloCitta = L.layerGroup().addTo(mappa);

  function aggiornaMappa(sel) {
    const gruppi = raggruppa(sel, (r) => r.evento.citta.id).sort((a, b) => b.incasso - a.incasso);
    const massimo = gruppi.length ? gruppi[0].incasso : 1;
    livelloCitta.clearLayers();
    gruppi.forEach((g) => {
      const c = citta.get(g.chiave);
      const etichetta = document.createElement("div");
      const nome = document.createElement("strong");
      nome.textContent = fEuro.format(g.incasso);
      etichetta.append(nome, document.createTextNode(`${c.nome} · ${fNum.format(g.biglietti)} biglietti`));
      L.circleMarker([c.lat, c.lon], {
        radius: 4 + 15 * Math.sqrt(g.incasso / massimo),
        fillColor: COLORI.gialloMappa,
        fillOpacity: 0.9,
        color: COLORI.nero,
        weight: 1.5,
      }).bindTooltip(etichetta, { className: "etichetta-mappa", direction: "top", offset: [0, -6] })
        .addTo(livelloCitta);
    });
    tabellaDati("mappa", [["Città", false], ["Regione", false], ["Incasso", true], ["Biglietti", true]],
      gruppi.map((g) => { const c = citta.get(g.chiave); return [c.nome, c.regione, fEuro.format(g.incasso), fNum.format(g.biglietti)]; }));
  }

  /* ---------- Classifica ---------- */

  function aggiornaClassifica(sel) {
    const gruppi = raggruppa(sel, (r) => r.evento.id).sort((a, b) => b.incasso - a.incasso);
    const visibili = stato.tutti ? gruppi : gruppi.slice(0, 10);
    const corpo = document.querySelector("#classifica tbody");
    const nuove = visibili.map((g, i) => {
      const e = eventi.get(g.chiave);
      const tr = document.createElement("tr");
      tr.tabIndex = 0;
      tr.setAttribute("aria-label", `Apri il dettaglio di ${e.nome}`);
      const pos = document.createElement("span");
      pos.className = i < 3 ? "posizione podio" : "posizione";
      pos.textContent = String(i + 1);
      const celle = [
        [pos, "num"],
        [e.nome, "evento"],
        [e.citta.nome, "secondaria"],
        [e.genere, "secondaria"],
        [fNum.format(g.biglietti), "num secondaria"],
        [fPct.format((bigliettiEvento.get(e.id) || 0) / e.capienza), "num secondaria"],
        [fEuro.format(g.incasso), "num"],
      ];
      celle.forEach(([valore, classe]) => {
        const td = tr.insertCell();
        if (classe) td.className = classe;
        if (typeof valore === "string") td.textContent = valore; else td.appendChild(valore);
      });
      const apri = () => apriDettaglio(e.id);
      tr.addEventListener("click", apri);
      tr.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); apri(); } });
      return tr;
    });
    corpo.replaceChildren(...nuove);

    const pulsante = document.getElementById("mostra-tutti");
    pulsante.hidden = gruppi.length <= 10;
    pulsante.textContent = stato.tutti ? "Mostra solo i primi 10" : `Mostra tutti gli eventi (${gruppi.length})`;
  }

  document.getElementById("mostra-tutti").addEventListener("click", () => {
    stato.tutti = !stato.tutti;
    aggiornaClassifica(selezione());
  });

  /* ---------- Dettaglio evento ---------- */

  const dialogo = document.getElementById("dettaglio");
  let gCurva = null;
  let gDettaglioCanali = null;

  function apriDettaglio(id) {
    const e = eventi.get(id);
    const lista = righe.filter((r) => r.evento.id === id);
    const incasso = somma(lista, "incasso");
    const biglietti = somma(lista, "biglietti");

    imposta("dettaglio-titolo", e.nome);
    const info = [
      e.artista,
      e.genere,
      `${e.citta.nome} (${e.citta.regione})`,
      fData.format(new Date(e.data + "T12:00:00")),
      `Capienza ${fNum.format(e.capienza)}`,
    ].map((t) => { const li = document.createElement("li"); li.textContent = t; return li; });
    document.getElementById("dettaglio-info").replaceChildren(...info);

    imposta("d-incasso", fEuro.format(incasso));
    imposta("d-biglietti", fNum.format(biglietti));
    imposta("d-riempimento", fPct.format(biglietti / e.capienza));
    imposta("d-prezzo", biglietti ? fEuro2.format(incasso / biglietti) : "-");

    if (!dialogo.open) dialogo.showModal();

    const inizio = new Date(D.inizio + "T12:00:00");
    const giorni = D.giornaliero[String(id)] || [];
    const etichette = giorni.map(([g]) => {
      const d = new Date(inizio);
      d.setDate(d.getDate() + g);
      return d.toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
    });
    if (!gCurva) gCurva = graficoLinee("g-curva", { formato: (v) => fNum.format(v), assePasso: 8 });
    gCurva.data.labels = etichette;
    gCurva.data.datasets = [serieLinea("biglietti", giorni.map(([, q]) => q), COLORI.giallo, true)];
    gCurva.update();

    if (!gDettaglioCanali) gDettaglioCanali = graficoBarre("g-dettaglio-canali", { formato: (v) => fNum.format(v), spazioDestro: 52 });
    const perCanale = raggruppa(lista, (r) => r.canale.nome).sort((a, b) => b.biglietti - a.biglietti);
    gDettaglioCanali.data.labels = perCanale.map((g) => g.chiave);
    gDettaglioCanali.data.datasets[0].data = perCanale.map((g) => g.biglietti);
    gDettaglioCanali.update();
  }

  document.getElementById("dettaglio-chiudi").addEventListener("click", () => dialogo.close());
  dialogo.addEventListener("click", (ev) => { if (ev.target === dialogo) dialogo.close(); });

  /* ---------- Avvio ---------- */

  function aggiorna() {
    const sel = selezione();
    aggiornaKpi(sel);
    aggiornaTrend();
    aggiornaGenere();
    aggiornaTop(sel);
    aggiornaCanali(sel);
    aggiornaMappa(sel);
    aggiornaRiempimento();
    aggiornaClassifica(sel);
  }

  preparaFiltri();
  preparaSchede();
  aggiorna();
})();
