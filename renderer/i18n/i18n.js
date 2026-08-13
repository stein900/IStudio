'use strict';

/**
 * i18n — internationalisation de l'application (11 langues).
 *
 * Principe gettext : la CLÉ d'une traduction est la phrase française
 * d'origine. Le français ne charge donc aucun catalogue, et toute phrase
 * absente d'un catalogue retombe proprement sur le français — l'interface
 * ne casse jamais, la couverture peut grandir fichier par fichier.
 *
 * Trois canaux de traduction :
 *  - I18n.t('…')                   : chaînes construites dynamiquement en JS ;
 *  - attributs [title]/[placeholder] : balayés automatiquement (l'original
 *    est mémorisé dans data-i18n-orig-*, le changement de langue est donc
 *    réversible) ;
 *  - éléments [data-i18n]          : leur texte est traduit de la même façon.
 *
 * Les catalogues sont des JSON plats (fr → traduction) dans
 * renderer/i18n/locales/, lus via l'IPC read-file existante ; le process
 * main lit les mêmes fichiers pour ses dialogues natifs (set-locale).
 */

window.I18n = (() => {
  const LANGUAGES = [
    { code: 'fr', name: 'Français' },
    { code: 'en', name: 'English' },
    { code: 'ja', name: '日本語' },
    { code: 'es', name: 'Español' },
    { code: 'de', name: 'Deutsch' },
    { code: 'ar', name: 'العربية' },
    { code: 'ru', name: 'Русский' },
    { code: 'zh', name: '中文' },
    { code: 'it', name: 'Italiano' },
    { code: 'ko', name: '한국어' },
    { code: 'hi', name: 'हिन्दी' },
  ];

  let locale = localStorage.getItem('locale') || 'fr';
  if (!LANGUAGES.some((l) => l.code === locale)) locale = 'fr';
  let dict = {}; // phrase française -> traduction (vide quand locale = fr)
  const listeners = new Set();

  /** Traduit une phrase ; `params` remplace les jetons {nom}. */
  function t(fr, params) {
    let out = Object.prototype.hasOwnProperty.call(dict, fr) ? dict[fr] : fr;
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        out = out.split(`{${key}}`).join(String(value));
      }
    }
    return out;
  }

  /** Chemin absolu d'un catalogue, déduit de l'URL de la page. */
  function localePath(code) {
    const url = new URL(`i18n/locales/${code}.json`, window.location.href);
    let p = decodeURIComponent(url.pathname);
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1); // file:///C:/… → C:/…
    return p;
  }

  async function loadDict(code) {
    if (code === 'fr') return {};
    try {
      const data = await window.viewer.readFile(localePath(code));
      if (!data) return {};
      return JSON.parse(new TextDecoder().decode(data));
    } catch {
      return {};
    }
  }

  /** (Re)traduit le DOM : tooltips, placeholders et textes marqués. */
  function apply(root = document) {
    for (const el of root.querySelectorAll('[title], [data-i18n-orig-title]')) {
      const orig = el.dataset.i18nOrigTitle || el.getAttribute('title');
      if (!orig) continue;
      el.dataset.i18nOrigTitle = orig;
      el.setAttribute('title', t(orig));
    }
    for (const el of root.querySelectorAll('[placeholder], [data-i18n-orig-ph]')) {
      const orig = el.dataset.i18nOrigPh || el.getAttribute('placeholder');
      if (!orig) continue;
      el.dataset.i18nOrigPh = orig;
      el.setAttribute('placeholder', t(orig));
    }
    for (const el of root.querySelectorAll('[data-i18n]')) {
      const orig = el.dataset.i18nOrig || el.textContent.trim();
      if (!orig) continue;
      el.dataset.i18nOrig = orig;
      el.textContent = t(orig);
    }
  }

  async function setLocale(code) {
    if (!LANGUAGES.some((l) => l.code === code)) return;
    locale = code;
    localStorage.setItem('locale', code);
    dict = await loadDict(code);
    document.documentElement.lang = code;
    apply();
    if (window.viewer && window.viewer.setLocale) window.viewer.setLocale(code); // dialogues natifs
    for (const cb of listeners) cb(code);
  }

  /** Modules : être prévenu d'un changement de langue (reconstruire leur UI). */
  function onChange(cb) {
    listeners.add(cb);
  }

  // démarrage : charge la langue mémorisée puis traduit la page
  window.addEventListener('DOMContentLoaded', () => {
    setLocale(locale);
  });

  return {
    t,
    apply,
    setLocale,
    onChange,
    locale: () => locale,
    languages: () => LANGUAGES.slice(),
  };
})();
