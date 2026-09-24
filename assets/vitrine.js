/* Vitrine / Catálogo de produtos em destaque — ProductTracker landing.
 * HTML/CSS/JS vanilla, sem build nem libs. Roteamento client-side por hash:
 *   #/                → categorias raiz
 *   #/cat/<slug>      → subcategorias e/ou famílias da categoria
 *   #/fam/<slug>      → grade de modelos da família
 *   #/model/<id>      → página do modelo (gráfico multi-loja + CTAs)
 * Lê o snapshot estático em showcase/index.json e showcase/models/<id>.json.
 * O gráfico SVG multi-loja é adaptado do renderChart de webapp/index.html. */
(function () {
  "use strict";

  var INDEX_URL = "showcase/index.json";
  var MODEL_URL = function (id) { return "showcase/models/" + encodeURIComponent(id) + ".json"; };
  var BOT_FALLBACK = "https://t.me/MyProductTrackerBot?start=vitrine";

  // Labels dos marketplaces — espelham o mapa MKT do Mini App (webapp/index.html).
  var MKT = {
    mercadolibre: { label: "Mercado Livre", color: "#ffd700" },
    amazon: { label: "Amazon", color: "#ff8c00" },
    shopee: { label: "Shopee", color: "#ff4d2d" },
    aliexpress: { label: "AliExpress", color: "#e3312b" },
    kabum: { label: "KaBuM!", color: "#1a73e8" },
    pichau: { label: "Pichau", color: "#a855f7" },
    terabyte: { label: "Terabyte", color: "#f97316" },
    magalu: { label: "Magalu", color: "#0ea5e9" }
  };

  // Ícones SVG inline (mesmo estilo de traço da landing) — substituem emojis.
  function svgIcon(inner, extraCls) {
    return '<svg class="sc-ico' + (extraCls ? " " + extraCls : "") + '" viewBox="0 0 24 24" ' +
      'width="42" height="42" fill="none" stroke="currentColor" stroke-width="1.6" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + "</svg>";
  }
  var ICONS = {
    box: svgIcon('<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/>'),
    search: svgIcon('<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>'),
    alert: svgIcon('<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'),
    store: svgIcon('<path d="M3 9l1-5h16l1 5"/><path d="M4 9v10a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9"/><path d="M9 22V12h6v10"/>'),
    spinner: svgIcon('<line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"/><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"/><line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"/><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"/>', "sc-spin")
  };

  var app = document.getElementById("app");
  var indexData = null; // cache do snapshot raiz
  var hiddenSeries = {}; // marketplaces ocultos no gráfico do modelo atual

  // ── Utils ───────────────────────────────────────────────────────────
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  // Só permite http(s) (ou caminhos relativos/hash internos) em href/src — os
  // dados (link de loja, image_url) vêm de SCRAPING/curadoria e podem conter
  // esquemas perigosos (javascript:/data:/vbscript:). Retorna "" quando o
  // esquema é inseguro. Antes de checar, remove chars que o navegador ignora ao
  // interpretar o esquema (tab/newline/controle) — evita bypass "java\tscript:".
  function safeUrl(u) {
    var s = String(u == null ? "" : u).trim();
    if (!s) return "";
    var probe = s.replace(/[\u0000-\u001f\u007f]/g, "").toLowerCase();
    if (/^[a-z][a-z0-9.+-]*:/.test(probe) && !/^https?:/.test(probe)) return "";
    return s;
  }

  function mktLabel(m) { return (MKT[m] && MKT[m].label) || m; }
  function mktColor(m) { return (MKT[m] && MKT[m].color) || "#3b82f6"; }

  function fmtMoney(value, currency) {
    if (value == null || isNaN(value)) return "—";
    try {
      return new Intl.NumberFormat("pt-BR", {
        style: "currency", currency: currency || "BRL"
      }).format(value);
    } catch (e) {
      return "R$ " + Number(value).toFixed(2).replace(".", ",");
    }
  }

  // "YYYY-MM-DD" → Date local (evita o shift de fuso do Date("YYYY-MM-DD") UTC).
  function parseDate(s) {
    if (!s) return null;
    var p = String(s).slice(0, 10).split("-");
    if (p.length !== 3) return null;
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function fmtDateFull(s) {
    var d = parseDate(s);
    if (!d) return "—";
    return String(d.getDate()).padStart(2, "0") + "/" +
      String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  function fmtMonthYear(s) {
    var d = parseDate(s);
    if (!d) return "—";
    return String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  function fmtDayMonth(d) {
    return String(d.getDate()).padStart(2, "0") + "/" + String(d.getMonth() + 1).padStart(2, "0");
  }

  // dd/mm/aaaa a partir de um objeto Date (tooltip do gráfico).
  function fmtDateD(d) {
    return String(d.getDate()).padStart(2, "0") + "/" +
      String(d.getMonth() + 1).padStart(2, "0") + "/" + d.getFullYear();
  }

  // Bloco cinza/gradiente quando não há imagem.
  function imageBlock(url, alt, cls) {
    cls = cls || "sc-thumb";
    var safe = safeUrl(url);
    if (safe) {
      return '<div class="' + cls + '"><img src="' + esc(safe) + '" alt="' + esc(alt) +
        '" loading="lazy" onerror="this.parentNode.classList.add(\'sc-thumb--ph\');this.remove();"></div>';
    }
    return '<div class="' + cls + ' sc-thumb--ph" role="img" aria-label="' + esc(alt) + '"></div>';
  }

  function stateMsg(icon, title, sub) {
    return '<div class="sc-state"><span class="sc-state-icon" aria-hidden="true">' + icon + "</span>" +
      '<p class="sc-state-title">' + esc(title) + "</p>" +
      (sub ? '<p class="sc-state-sub">' + esc(sub) + "</p>" : "") + "</div>";
  }

  function loading() {
    app.innerHTML = '<div class="container sc-wrap">' +
      stateMsg(ICONS.spinner, "Carregando catálogo…", "") + "</div>";
  }

  // ── Data ────────────────────────────────────────────────────────────
  function loadIndex() {
    if (indexData) return Promise.resolve(indexData);
    return fetch(INDEX_URL, { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (d) { indexData = d; return d; });
  }

  function childCategories(parentId) {
    return (indexData.categories || [])
      .filter(function (c) { return c.parent_id === parentId; })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
  }

  function familiesOf(categoryId) {
    return (indexData.families || [])
      .filter(function (f) { return f.category_id === categoryId; })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
  }

  function modelsOf(familyId) {
    return (indexData.models || [])
      .filter(function (m) { return m.family_id === familyId; })
      .sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
  }

  function catBySlug(slug) {
    return (indexData.categories || []).filter(function (c) { return c.slug === slug; })[0] || null;
  }
  function famBySlug(slug) {
    return (indexData.families || []).filter(function (f) { return f.slug === slug; })[0] || null;
  }
  function catById(id) {
    return (indexData.categories || []).filter(function (c) { return c.id === id; })[0] || null;
  }
  function famById(id) {
    return (indexData.families || []).filter(function (f) { return f.id === id; })[0] || null;
  }

  // ── Breadcrumb ──────────────────────────────────────────────────────
  function breadcrumb(items) {
    // items: [{label, href}] — último sem href (página atual).
    var parts = items.map(function (it, i) {
      if (it.href && i < items.length - 1) {
        return '<a href="' + esc(it.href) + '">' + esc(it.label) + "</a>";
      }
      return '<span aria-current="page">' + esc(it.label) + "</span>";
    });
    return '<nav class="sc-crumb" aria-label="Trilha de navegação">' +
      parts.join('<span class="sc-crumb-sep" aria-hidden="true">›</span>') + "</nav>";
  }

  // Trilha de ancestrais de uma categoria (raiz → … → categoria).
  function catAncestors(cat) {
    var chain = [];
    var cur = cat;
    var guard = 0;
    while (cur && guard < 20) {
      chain.unshift(cur);
      cur = cur.parent_id != null ? catById(cur.parent_id) : null;
      guard++;
    }
    return chain;
  }

  // ── Cards ───────────────────────────────────────────────────────────
  function categoryCard(cat) {
    return '<a class="sc-card sc-card--cat" href="#/cat/' + esc(cat.slug) + '">' +
      '<span class="sc-card-body"><span class="sc-card-title">' + esc(cat.name) + "</span></span>" +
      '<span class="sc-card-arrow" aria-hidden="true">→</span></a>';
  }

  function familyCard(fam) {
    var price = fam.price_from != null
      ? '<span class="sc-card-price">a partir de <b>' + esc(fmtMoney(fam.price_from, fam.currency)) + "</b></span>"
      : "";
    var count = fam.model_count
      ? '<span class="sc-card-meta">' + fam.model_count + (fam.model_count === 1 ? " modelo" : " modelos") + "</span>"
      : "";
    return '<a class="sc-card sc-card--fam" href="#/fam/' + esc(fam.slug) + '">' +
      imageBlock(fam.image_url, fam.name) +
      '<span class="sc-card-body"><span class="sc-card-title">' + esc(fam.name) + "</span>" +
      count + price + "</span></a>";
  }

  function modelCard(model) {
    var stores = (model.stores || []).map(function (m) {
      return '<span class="sc-dot" style="background:' + mktColor(m) + '" title="' +
        esc(mktLabel(m)) + '" aria-label="' + esc(mktLabel(m)) + '"></span>';
    }).join("");
    var price = model.price_from != null
      ? '<span class="sc-card-price">a partir de <b>' + esc(fmtMoney(model.price_from, model.currency)) + "</b></span>"
      : "";
    return '<a class="sc-card sc-card--model" href="#/model/' + esc(model.id) + '">' +
      imageBlock(model.image_url, model.name) +
      '<span class="sc-card-body"><span class="sc-card-title">' + esc(model.name) + "</span>" +
      (stores ? '<span class="sc-card-stores">' + stores + "</span>" : "") +
      price + "</span></a>";
  }

  function grid(cards) {
    return '<div class="sc-grid">' + cards.join("") + "</div>";
  }

  // ── Views ───────────────────────────────────────────────────────────
  function viewRoot() {
    var roots = childCategories(null);
    var body;
    if (!roots.length) {
      body = stateMsg(ICONS.box, "Catálogo em breve", "Ainda não há produtos monitorados.");
    } else {
      body = grid(roots.map(categoryCard));
    }
    app.innerHTML = '<div class="container sc-wrap">' +
      '<h1 class="section-title">Produtos Monitorados</h1>' +
      '<p class="section-sub">Explore preços monitorados nas principais lojas do Brasil e comece a acompanhar no Telegram.</p>' +
      body + "</div>";
  }

  function viewCategory(slug) {
    var cat = catBySlug(slug);
    if (!cat) { notFound(); return; }
    var crumb = [{ label: "Produtos Monitorados", href: "#/" }];
    catAncestors(cat).forEach(function (c) {
      crumb.push({ label: c.name, href: "#/cat/" + c.slug });
    });

    var subs = childCategories(cat.id);
    var fams = familiesOf(cat.id);
    var sections = "";
    if (subs.length) {
      sections += (fams.length ? '<h2 class="sc-subtitle">Subcategorias</h2>' : "") +
        grid(subs.map(categoryCard));
    }
    var brands = distinctBrands(fams);
    if (fams.length) {
      sections += (subs.length ? '<h2 class="sc-subtitle">Produtos</h2>' : "") +
        // Só mostra a barra quando há ao menos duas marcas distintas (um único
        // chip de marca ao lado de "Todas" não filtra nada de útil).
        (brands.length >= 2 ? brandBar(brands) : "") +
        '<div id="sc-fam-grid" class="sc-grid">' + fams.map(familyCard).join("") + "</div>";
    }
    if (!subs.length && !fams.length) {
      sections = stateMsg(ICONS.box, "Nada por aqui ainda", "Esta categoria ainda não tem produtos.");
    }

    app.innerHTML = '<div class="container sc-wrap">' +
      breadcrumb(crumb) +
      '<h1 class="section-title sc-h1">' + esc(cat.name) + "</h1>" +
      sections + "</div>";

    if (fams.length && brands.length >= 2) wireBrandFilter(fams);
  }

  // Marcas distintas (não-null/vazias) das famílias, ordenadas pt-BR.
  function distinctBrands(fams) {
    var seen = {}, out = [];
    (fams || []).forEach(function (f) {
      var b = f.brand;
      if (b != null && String(b).trim() !== "" && !seen[b]) { seen[b] = 1; out.push(String(b)); }
    });
    return out.sort(function (a, b) { return a.localeCompare(b, "pt-BR"); });
  }

  function brandBar(brands) {
    var chips = ['<button type="button" class="sc-chip is-active" data-brand="" aria-pressed="true">Todas</button>'];
    brands.forEach(function (b) {
      chips.push('<button type="button" class="sc-chip" data-brand="' + esc(b) +
        '" aria-pressed="false">' + esc(b) + "</button>");
    });
    return '<div class="sc-brandbar" role="group" aria-label="Filtrar por marca">' +
      chips.join("") + "</div>";
  }

  // Filtra a grade de famílias pela marca do chip clicado (delegação de evento).
  function wireBrandFilter(fams) {
    var bar = app.querySelector(".sc-brandbar");
    var gridEl = document.getElementById("sc-fam-grid");
    if (!bar || !gridEl) return;
    bar.addEventListener("click", function (e) {
      var chip = e.target.closest ? e.target.closest(".sc-chip") : null;
      if (!chip || !bar.contains(chip)) return;
      var brand = chip.getAttribute("data-brand") || "";
      var chips = bar.querySelectorAll(".sc-chip");
      for (var i = 0; i < chips.length; i++) {
        var on = chips[i] === chip;
        chips[i].classList.toggle("is-active", on);
        chips[i].setAttribute("aria-pressed", on ? "true" : "false");
      }
      var filtered = brand
        ? fams.filter(function (f) { return String(f.brand) === brand; })
        : fams;
      gridEl.innerHTML = filtered.map(familyCard).join("");
    });
  }

  function viewFamily(slug) {
    var fam = famBySlug(slug);
    if (!fam) { notFound(); return; }
    var cat = catById(fam.category_id);
    var crumb = [{ label: "Produtos Monitorados", href: "#/" }];
    if (cat) {
      catAncestors(cat).forEach(function (c) {
        crumb.push({ label: c.name, href: "#/cat/" + c.slug });
      });
    }
    crumb.push({ label: fam.name, href: "#/fam/" + fam.slug });

    var models = modelsOf(fam.id);
    var body = models.length
      ? grid(models.map(modelCard))
      : stateMsg(ICONS.box, "Sem modelos", "Esta família ainda não tem modelos cadastrados.");

    app.innerHTML = '<div class="container sc-wrap">' +
      breadcrumb(crumb) +
      '<h1 class="section-title sc-h1">' + esc(fam.name) + "</h1>" +
      (fam.price_from != null
        ? '<p class="section-sub">A partir de <b>' + esc(fmtMoney(fam.price_from, fam.currency)) + "</b></p>"
        : "") +
      body + "</div>";
  }

  function viewModel(id) {
    loading();
    fetch(MODEL_URL(id), { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (model) { renderModel(model); })
      .catch(function () {
        app.innerHTML = '<div class="container sc-wrap">' +
          breadcrumb([{ label: "Produtos Monitorados", href: "#/" }, { label: "Modelo" }]) +
          stateMsg(ICONS.alert, "Não foi possível carregar este modelo", "Tente novamente mais tarde.") +
          "</div>";
      });
  }

  function renderModel(model) {
    var fam = famById(model.family_id);
    var cat = fam ? catById(fam.category_id) : null;
    var currency = model.currency || "BRL";
    hiddenSeries = {}; // reinicia o toggle de lojas do gráfico a cada modelo

    var crumb = [{ label: "Produtos Monitorados", href: "#/" }];
    if (cat) {
      catAncestors(cat).forEach(function (c) {
        crumb.push({ label: c.name, href: "#/cat/" + c.slug });
      });
    }
    if (fam) crumb.push({ label: fam.name, href: "#/fam/" + fam.slug });
    crumb.push({ label: model.name });

    var stores = model.stores || [];

    // Menor preço histórico entre todas as lojas + data.
    var globalMin = null;
    stores.forEach(function (s) {
      if (s.min_price != null && (globalMin == null || s.min_price < globalMin.price)) {
        globalMin = { price: s.min_price, at: s.min_price_at, label: s.label || mktLabel(s.marketplace) };
      }
    });

    var cta = model.cta || {};
    var ctaAll = safeUrl(cta.all) || BOT_FALLBACK;
    var perStore = cta.per_store || {};

    // Cabeçalho
    var summaryBits = [];
    if (globalMin) {
      summaryBits.push('<div class="sc-stat"><span class="sc-stat-label">Menor preço registrado</span>' +
        '<span class="sc-stat-value sc-price-low">' + esc(fmtMoney(globalMin.price, currency)) +
        '</span><span class="sc-stat-meta">' + esc(globalMin.label) + " · " + esc(fmtDateFull(globalMin.at)) + "</span></div>");
    }
    if (model.monitored_since) {
      summaryBits.push('<div class="sc-stat"><span class="sc-stat-label">Monitorado desde</span>' +
        '<span class="sc-stat-value">' + esc(fmtMonthYear(model.monitored_since)) + "</span></div>");
    }

    var chartHtml = stores.length
      ? '<div class="sc-chart-box"><div class="sc-chart-title">Histórico de preços</div>' +
          '<div id="sc-chart"></div>' + chartLegend(stores) + "</div>"
      : "";

    var storeCards = stores.map(function (s) { return storeCard(s, currency, perStore); }).join("");

    var head =
      '<div class="sc-model-head">' +
      imageBlock(model.image_url, model.name, "sc-thumb sc-thumb--lg") +
      '<div class="sc-model-headinfo">' +
      '<h1 class="section-title sc-h1">' + esc(model.name) + "</h1>" +
      '<div class="sc-stats">' + summaryBits.join("") + "</div>" +
      '<a class="btn btn-sm sc-cta-all" href="' + esc(ctaAll) + '" target="_blank" rel="noopener">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
      'stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>' +
      "Monitorar em todas as lojas</a>" +
      "</div></div>";

    app.innerHTML = '<div class="container sc-wrap sc-model">' +
      breadcrumb(crumb) +
      head +
      chartHtml +
      (storeCards
        ? '<h2 class="sc-subtitle">Preços por loja</h2><div class="sc-stores">' + storeCards + "</div>"
        : stateMsg(ICONS.store, "Sem lojas", "Este modelo ainda não tem lojas vinculadas.")) +
      "</div>";

    if (stores.length) {
      renderChart(stores, currency);
      wireLegend(stores, currency);
      // Redesenha o gráfico no resize (o SVG depende da largura do container).
      window.clearTimeout(renderModel._rt);
      window.onresize = function () {
        window.clearTimeout(renderModel._rt);
        renderModel._rt = window.setTimeout(function () {
          if (document.getElementById("sc-chart")) renderChart(stores, currency);
        }, 150);
      };
    } else {
      window.onresize = null;
    }
  }

  function storeCard(s, currency, perStore) {
    var mkt = s.marketplace;
    var monitorHref = safeUrl(perStore[mkt]) || BOT_FALLBACK;
    var safeStoreLink = safeUrl(s.link);
    var linkHtml = safeStoreLink
      ? '<a class="sc-store-link" href="' + esc(safeStoreLink) + '" target="_blank" rel="noopener nofollow">Ver na loja ↗</a>'
      : "";
    var minHtml = s.min_price != null
      ? '<span class="sc-store-min">mín. ' + esc(fmtMoney(s.min_price, currency)) +
        (s.min_price_at ? " · " + esc(fmtDateFull(s.min_price_at)) : "") + "</span>"
      : "";
    return '<div class="sc-store">' +
      '<div class="sc-store-top"><span class="sc-dot" style="background:' + mktColor(mkt) + '" aria-hidden="true"></span>' +
      '<span class="sc-store-name">' + esc(s.label || mktLabel(mkt)) + "</span></div>" +
      '<div class="sc-store-price">' + esc(fmtMoney(s.current_price, currency)) + "</div>" +
      minHtml +
      '<div class="sc-store-actions">' +
      '<a class="btn btn-sm sc-store-monitor" href="' + esc(monitorHref) + '" target="_blank" rel="noopener">Monitorar nesta loja</a>' +
      linkHtml +
      "</div></div>";
  }

  // Legenda interativa: cada item é um <button> (teclado nativo + aria-pressed).
  // aria-pressed="true" = série visível; "false" = oculta (apagada visualmente).
  function chartLegend(stores) {
    var items = stores.map(function (s) {
      var visible = !hiddenSeries[s.marketplace];
      return '<button type="button" class="sc-legend-item" data-mkt="' + esc(s.marketplace) +
        '" aria-pressed="' + (visible ? "true" : "false") + '">' +
        '<span class="sc-dot" style="background:' + mktColor(s.marketplace) + '" aria-hidden="true"></span>' +
        '<span class="sc-legend-label">' + esc(s.label || mktLabel(s.marketplace)) + "</span></button>";
    }).join("");
    return '<div class="sc-legend" role="group" ' +
      'aria-label="Lojas — ative para mostrar ou ocultar no gráfico">' + items + "</div>";
  }

  // Clique/teclado num item da legenda alterna a visibilidade da série e
  // redesenha o gráfico (escala recalculada só com as séries visíveis).
  function wireLegend(stores, currency) {
    var legend = document.querySelector(".sc-legend");
    if (!legend) return;
    legend.addEventListener("click", function (e) {
      var btn = e.target.closest ? e.target.closest(".sc-legend-item") : null;
      if (!btn || !legend.contains(btn)) return;
      var mkt = btn.getAttribute("data-mkt");
      var visibleCount = stores.filter(function (s) { return !hiddenSeries[s.marketplace]; }).length;
      // Não deixa ocultar a última série visível (o gráfico ficaria vazio).
      if (!hiddenSeries[mkt] && visibleCount <= 1) return;
      hiddenSeries[mkt] = !hiddenSeries[mkt];
      btn.setAttribute("aria-pressed", hiddenSeries[mkt] ? "false" : "true");
      renderChart(stores, currency);
    });
  }

  // ── Gráfico SVG multi-loja (adaptado de webapp/index.html renderChart) ──
  function renderChart(stores, currency) {
    var container = document.getElementById("sc-chart");
    if (!container) return;

    // Séries por loja: [{date:Date, p:number}], ordenadas. Séries ocultas pela
    // legenda (hiddenSeries) são descartadas — escala/eixos usam só as visíveis.
    var series = stores.filter(function (s) { return !hiddenSeries[s.marketplace]; }).map(function (s) {
      var pts = (s.history || []).map(function (h) {
        return { t: parseDate(h.date), p: parseFloat(h.price) };
      }).filter(function (pt) { return pt.t && !isNaN(pt.p); });
      pts.sort(function (a, b) { return a.t - b.t; });
      return {
        mkt: s.marketplace, color: mktColor(s.marketplace),
        label: s.label || mktLabel(s.marketplace), pts: pts
      };
    }).filter(function (ser) { return ser.pts.length > 0; });

    if (!series.length) {
      container.innerHTML = '<p class="sc-state-sub" style="text-align:center;padding:2rem 0">' +
        "Selecione ao menos uma loja na legenda.</p>";
      return;
    }

    var allP = [], allT = [];
    series.forEach(function (ser) {
      ser.pts.forEach(function (pt) { allP.push(pt.p); allT.push(pt.t.getTime()); });
    });

    var minP = Math.min.apply(null, allP);
    var maxP = Math.max.apply(null, allP);
    // Passo de arredondamento adaptado à faixa de preço (centena p/ GPU, dezena p/ periférico).
    var step = maxP >= 1000 ? 100 : (maxP >= 100 ? 10 : 5);
    var yMin = Math.floor(minP / step) * step;
    var yMax = Math.ceil((maxP + 1) / step) * step;
    if (yMin === yMax) { yMax = yMin + step; }

    var tMin = Math.min.apply(null, allT);
    var tMax = Math.max.apply(null, allT);
    if (tMin === tMax) { tMax = tMin + 86400000; }

    var w = Math.max(300, (container.clientWidth || 320));
    var h = 190;
    var padLeft = 54, padRight = 16, padTop = 12, padBottom = 26;
    var chartW = w - padLeft - padRight;
    var chartH = h - padTop - padBottom;

    function x(ts) { return padLeft + ((ts - tMin) / (tMax - tMin)) * chartW; }
    function y(v) { return padTop + chartH - ((v - yMin) / (yMax - yMin)) * chartH; }

    var sym = "R$";
    var gridLines = "";
    var ySteps = 3;
    for (var g = 0; g <= ySteps; g++) {
      var val = yMin + ((yMax - yMin) * g) / ySteps;
      var yy = y(val);
      gridLines +=
        '<line x1="' + padLeft + '" y1="' + yy.toFixed(1) + '" x2="' + (w - padRight) +
        '" y2="' + yy.toFixed(1) + '" stroke="var(--border)" stroke-width="1" opacity="0.6"/>' +
        '<text x="' + (padLeft - 8) + '" y="' + (yy + 3).toFixed(1) + '" fill="var(--muted)" font-size="9" text-anchor="end">' +
        sym + Math.round(val) + "</text>";
    }

    var paths = series.map(function (ser) {
      var d = ser.pts.map(function (pt, i) {
        return (i === 0 ? "M" : "L") + x(pt.t.getTime()).toFixed(1) + "," + y(pt.p).toFixed(1);
      }).join(" ");
      var last = ser.pts[ser.pts.length - 1];
      return '<path d="' + d + '" fill="none" stroke="' + ser.color +
        '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + x(last.t.getTime()).toFixed(1) + '" cy="' + y(last.p).toFixed(1) +
        '" r="3.2" fill="' + ser.color + '" stroke="var(--card)" stroke-width="1.5"/>';
    }).join("");

    var dMin = new Date(tMin), dMax = new Date(tMax);
    var xLabels =
      '<text x="' + padLeft + '" y="' + (h - 8) + '" fill="var(--muted)" font-size="9" text-anchor="start">' +
      fmtDayMonth(dMin) + "</text>" +
      '<text x="' + (w - padRight) + '" y="' + (h - 8) + '" fill="var(--muted)" font-size="9" text-anchor="end">' +
      fmtDayMonth(dMax) + "</text>";

    container.innerHTML =
      '<svg viewBox="0 0 ' + w + " " + h + '" style="width:100%;height:auto;display:block" ' +
      'role="img" aria-label="Gráfico de histórico de preços por loja">' +
      gridLines + paths + xLabels +
      // Área transparente para captura de ponteiro + camada do hover (guia + marcadores).
      '<rect class="sc-hit" x="' + padLeft + '" y="' + padTop + '" width="' + chartW +
      '" height="' + chartH + '" fill="transparent"/>' +
      '<g class="sc-hover"></g>' +
      "</svg>" +
      '<div class="sc-tooltip" role="status" aria-live="off"></div>';

    attachChartInteractions(container, {
      svgW: w, padLeft: padLeft, padTop: padTop, chartW: chartW, chartH: chartH,
      tMin: tMin, tMax: tMax, x: x, y: y, series: series, currency: currency
    });
  }

  // Tooltip + linha-guia no hover/touch. Recebe a geometria já calculada pelo
  // renderChart e trabalha em coordenadas do viewBox do SVG.
  function attachChartInteractions(container, g) {
    var svg = container.querySelector("svg");
    var hover = container.querySelector(".sc-hover");
    var tip = container.querySelector(".sc-tooltip");
    if (!svg || !hover || !tip) return;

    // Conjunto ordenado de timestamps (união das séries visíveis) p/ "snap".
    var seen = {}, unionTs = [];
    g.series.forEach(function (ser) {
      ser.pts.forEach(function (pt) {
        var ts = pt.t.getTime();
        if (!seen[ts]) { seen[ts] = 1; unionTs.push(ts); }
      });
    });
    unionTs.sort(function (a, b) { return a - b; });
    if (!unionTs.length) return;

    function nearestTs(ts) {
      var best = unionTs[0], bd = Math.abs(unionTs[0] - ts);
      for (var i = 1; i < unionTs.length; i++) {
        var d = Math.abs(unionTs[i] - ts);
        if (d < bd) { bd = d; best = unionTs[i]; }
      }
      return best;
    }

    function move(clientX) {
      var rect = svg.getBoundingClientRect();
      if (!rect.width) return;
      var vbX = (clientX - rect.left) / rect.width * g.svgW; // px → unidade do viewBox
      var frac = (vbX - g.padLeft) / g.chartW;
      var ts = g.tMin + Math.max(0, Math.min(1, frac)) * (g.tMax - g.tMin);
      var target = nearestTs(ts);
      var gx = g.x(target);

      var markers = '<line x1="' + gx.toFixed(1) + '" y1="' + g.padTop + '" x2="' + gx.toFixed(1) +
        '" y2="' + (g.padTop + g.chartH) + '" stroke="var(--muted)" stroke-width="1" ' +
        'stroke-dasharray="3 3" opacity="0.7"/>';
      var rows = [];
      g.series.forEach(function (ser) {
        var best = null, bd = Infinity;
        ser.pts.forEach(function (pt) {
          var d = Math.abs(pt.t.getTime() - target);
          if (d < bd) { bd = d; best = pt; }
        });
        if (!best) return;
        var cy = g.y(best.p);
        markers += '<circle cx="' + gx.toFixed(1) + '" cy="' + cy.toFixed(1) +
          '" r="3.5" fill="' + ser.color + '" stroke="var(--card)" stroke-width="1.5"/>';
        rows.push('<div class="sc-tooltip-row"><span class="sc-dot" style="background:' + ser.color +
          '"></span><span class="sc-tooltip-name">' + esc(ser.label) +
          '</span><span class="sc-tooltip-price">' + esc(fmtMoney(best.p, g.currency)) + "</span></div>");
      });
      hover.innerHTML = markers;

      tip.innerHTML = '<div class="sc-tooltip-date">' + esc(fmtDateD(new Date(target))) + "</div>" + rows.join("");

      // Posiciona a caixinha sobre a linha-guia, presa ao container (px).
      var crect = container.getBoundingClientRect();
      var rect2 = svg.getBoundingClientRect();
      var pxX = (rect2.left - crect.left) + (gx / g.svgW) * rect2.width;
      var halfW = tip.offsetWidth / 2 || 70;
      pxX = Math.max(halfW + 2, Math.min(crect.width - halfW - 2, pxX));
      tip.style.left = pxX + "px";
      tip.style.top = "8px";
      tip.classList.add("is-visible");
    }

    function hide() {
      hover.innerHTML = "";
      tip.classList.remove("is-visible");
    }

    svg.addEventListener("mousemove", function (e) { move(e.clientX); });
    svg.addEventListener("mouseleave", hide);
    svg.addEventListener("touchstart", function (e) {
      if (e.touches[0]) move(e.touches[0].clientX);
    }, { passive: true });
    svg.addEventListener("touchmove", function (e) {
      if (e.touches[0]) { move(e.touches[0].clientX); e.preventDefault(); }
    }, { passive: false });
    svg.addEventListener("touchend", hide);
  }

  // ── Router ──────────────────────────────────────────────────────────
  function notFound() {
    app.innerHTML = '<div class="container sc-wrap">' +
      breadcrumb([{ label: "Produtos Monitorados", href: "#/" }, { label: "Não encontrado" }]) +
      stateMsg(ICONS.search, "Página não encontrada", "O item que você procura não existe mais.") +
      "</div>";
  }

  function route() {
    var hash = window.location.hash.replace(/^#/, "");
    if (!hash || hash === "/") { viewRoot(); return; }
    var m;
    if ((m = hash.match(/^\/cat\/(.+)$/))) { viewCategory(decodeURIComponent(m[1])); return; }
    if ((m = hash.match(/^\/fam\/(.+)$/))) { viewFamily(decodeURIComponent(m[1])); return; }
    if ((m = hash.match(/^\/model\/(.+)$/))) { viewModel(decodeURIComponent(m[1])); return; }
    notFound();
  }

  function start() {
    loading();
    loadIndex()
      .then(function () {
        window.addEventListener("hashchange", function () {
          window.scrollTo(0, 0);
          route();
        });
        route();
      })
      .catch(function () {
        app.innerHTML = '<div class="container sc-wrap">' +
          stateMsg(ICONS.alert, "Não foi possível carregar o catálogo", "Verifique sua conexão e tente novamente.") +
          "</div>";
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
