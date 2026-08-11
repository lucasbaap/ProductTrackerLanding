/* Menu lateral (drawer) para mobile — landing ProductTracker.
 * Compartilhado pelas 4 páginas. Sem dependências. */
(function () {
  'use strict';

  var body = document.body;
  var toggle = document.querySelector('.menu-toggle');
  var closeBtn = document.querySelector('.drawer-close');
  var overlay = document.querySelector('.menu-overlay');
  var drawer = document.querySelector('.mobile-drawer');
  var lastFocus = null;

  function isOpen() {
    return body.classList.contains('menu-open');
  }

  function setState(open) {
    body.classList.toggle('menu-open', open);
    if (toggle) {
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    }
    if (drawer) drawer.setAttribute('aria-hidden', open ? 'false' : 'true');
  }

  function openMenu() {
    if (isOpen()) return;
    lastFocus = document.activeElement;
    setState(true);
    if (closeBtn) closeBtn.focus();
  }

  function closeMenu() {
    if (!isOpen()) return;
    setState(false);
    if (lastFocus && typeof lastFocus.focus === 'function') lastFocus.focus();
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      isOpen() ? closeMenu() : openMenu();
    });
  }
  if (closeBtn) closeBtn.addEventListener('click', closeMenu);
  if (overlay) overlay.addEventListener('click', closeMenu);

  if (drawer) {
    var links = drawer.querySelectorAll('a');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', closeMenu);
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  // Ao voltar para desktop, garante drawer fechado
  window.addEventListener('resize', function () {
    if (window.innerWidth > 640) closeMenu();
  });
})();
