/*
 * PATCH OCR – Inventaire de la bibliothèque (fichier à AJOUTER sur GitHub, à côté de index.html)
 *
 * Ajoute, uniquement sur une fiche SANS notice (pas de code-barres, ou code non trouvé), deux boutons :
 *   « Photographier l'ISBN ou l'ISSN » et « Lire la couverture ».
 * La photo est lue par le service Google (patch OCR.gs), la fiche est remplie automatiquement,
 * puis elle s'enregistre par le circuit habituel (bouton « Enregistrer »), photo comprise.
 *
 * Ce fichier ne modifie rien du fonctionnement existant : il s'appuie sur les fonctions de la page.
 * S'il est absent, ou si le service n'a pas encore le patch, la page fonctionne exactement comme avant.
 */
(function () {
  'use strict';
  if (typeof S === 'undefined' || typeof ouvrirFiche !== 'function' || typeof appel !== 'function') return;

  // ─────────── Styles ───────────
  var css = document.createElement('style');
  css.textContent =
    '#ocrBloc{display:flex;flex-direction:column;gap:8px;border:1px dashed var(--line);border-radius:14px;padding:12px}' +
    '#ocrBloc .ocr-boutons{display:flex;flex-direction:column;gap:8px}' +
    '#ocrBloc .btn{display:flex;align-items:center;justify-content:center;gap:8px}' +
    '#ocrChamps{display:flex;flex-direction:column;gap:8px}' +
    '#ocrChamps .row > div{min-width:0}' +
    '.ocr-texte{font-size:12px;color:var(--muted);font-style:italic;overflow-wrap:anywhere}';
  document.head.appendChild(css);

  // ─────────── Bloc ajouté dans la fiche (sous les messages, au-dessus de la notice) ───────────
  var bloc = document.createElement('div');
  bloc.id = 'ocrBloc';
  bloc.className = 'hidden';
  bloc.innerHTML =
    '<span class="lbl">Pas de code-barres lisible</span>' +
    '<div class="ocr-boutons">' +
    '  <button class="btn ghost" id="ocrBtnCode" type="button">📷 Photographier l\'ISBN ou l\'ISSN</button>' +
    '  <button class="btn ghost" id="ocrBtnCouv" type="button">📷 Lire la couverture</button>' +
    '</div>' +
    '<div class="msg info hidden" id="ocrMsg"></div>' +
    '<div id="ocrChamps" class="hidden">' +
    '  <div><label class="lbl" for="ocrTitre">Titre (lu sur la couverture)</label><input id="ocrTitre" autocomplete="off"></div>' +
    '  <div><label class="lbl" for="ocrAuteurs">Auteur(s)</label><input id="ocrAuteurs" autocomplete="off"></div>' +
    '  <div class="row">' +
    '    <div><label class="lbl" for="ocrEditeur">Éditeur</label><input id="ocrEditeur" autocomplete="off"></div>' +
    '    <div class="none" style="width:96px"><label class="lbl" for="ocrAnnee">Année</label><input id="ocrAnnee" inputmode="numeric" maxlength="4" autocomplete="off"></div>' +
    '  </div>' +
    '</div>';
  var repere = document.getElementById('fNotice');
  repere.parentNode.insertBefore(bloc, repere);

  var $o = function (id) { return document.getElementById(id); };
  var attente = null;   // photo demandée pour la lecture : { nature, mode, avant }
  var enCours = false;

  function msgOcr(txt, type, detail) {
    var m = $o('ocrMsg');
    m.className = 'msg ' + (type || 'info') + (txt ? '' : ' hidden');
    m.textContent = txt || '';
    if (detail) {
      var d = document.createElement('div'); d.className = 'ocr-texte'; d.textContent = 'Texte lu : « ' + detail + ' »';
      m.appendChild(d);
    }
  }
  function boutons(actifs) { $o('ocrBtnCode').disabled = !actifs; $o('ocrBtnCouv').disabled = !actifs; }

  // ─────────── Affichage selon la fiche (après la fonction d'origine, sans la modifier) ───────────
  var ouvrirFicheOrigine = ouvrirFiche;
  ouvrirFiche = function (r) {
    ouvrirFicheOrigine(r);
    try { majOcr(r); } catch (e) { /* le patch ne doit jamais gêner la fiche */ }
  };

  function majOcr(r) {
    var sansNotice = !r.chargement && !r.found;
    bloc.classList.toggle('hidden', !sansNotice && !(r.ocr && r.ocr.via === 'texte'));
    var parTexte = !!(r.ocr && r.ocr.via === 'texte');
    $o('ocrChamps').classList.toggle('hidden', !parTexte);
    if (!r.ocr) { msgOcr(''); boutons(true); }
    if (parTexte) {
      $o('fTitreSaisie').classList.add('hidden'); // remplacé par les champs lus
      $o('ocrTitre').value = r.titre || ''; $o('ocrAuteurs').value = r.auteurs || '';
      $o('ocrEditeur').value = r.editeur || ''; $o('ocrAnnee').value = r.annee || '';
      var badge = $o('fBadge'); badge.className = 'badge info'; badge.textContent = 'Lu sur la couverture · à vérifier';
    }
  }

  // Les champs lus alimentent directement la fiche : « Enregistrer » les envoie comme une saisie manuelle
  [['ocrTitre', 'titre'], ['ocrAuteurs', 'auteurs'], ['ocrEditeur', 'editeur'], ['ocrAnnee', 'annee']].forEach(function (x) {
    $o(x[0]).addEventListener('input', function () { if (S.fiche) S.fiche[x[1]] = this.value.trim(); });
  });

  // ─────────── Prise de la photo (écran de prise de vue existant) ───────────
  function demanderPhoto(mode) {
    if (!S.fiche || enCours) return;
    var nature = mode === 'code' ? 'isbn' : 'couverture';
    // Couverture déjà photographiée : on la lit directement
    if (mode === 'couverture' && S.fiche.photos && S.fiche.photos.couverture) return lire(mode, S.fiche.photos.couverture);
    attente = { nature: nature, mode: mode, avant: S.fiche.photos ? S.fiche.photos[nature] : null };
    ouvrirCapture('photo', nature, mode === 'code' ? "Photographiez l'ISBN ou l'ISSN en gros plan" : 'Photographiez la couverture entière');
  }
  $o('ocrBtnCode').addEventListener('click', function () { demanderPhoto('code'); });
  $o('ocrBtnCouv').addEventListener('click', function () { demanderPhoto('couverture'); });

  // Après le déclencheur d'origine (qui range la photo dans la fiche) : lancement de la lecture
  document.getElementById('btnDeclencher').addEventListener('click', function () {
    if (!attente || !S.fiche || !S.fiche.photos) return;
    var a = attente;
    var photo = S.fiche.photos[a.nature];
    if (!photo || photo === a.avant) return;
    attente = null;
    lire(a.mode, photo);
  });
  document.getElementById('btnAnnulerCapture').addEventListener('click', function () { attente = null; });

  // ─────────── Lecture par le service Google ───────────
  function lire(mode, photo) {
    var fiche = S.fiche;
    enCours = true; boutons(false);
    msgOcr(mode === 'code' ? "Lecture du numéro sur la photo…" : 'Lecture de la couverture et recherche dans les catalogues…', 'info');
    appel('ocr', { mode: mode, image: photo }).then(function (res) {
      enCours = false; boutons(true);
      if (S.fiche !== fiche) return; // l'opérateur est passé à un autre ouvrage
      if (!res.ok) {
        var m = res.erreur || 'Lecture impossible.';
        if (/Action inconnue/i.test(m)) m = "La lecture par photo n'est pas encore installée sur le tableau (patch OCR.gs).";
        msgOcr(m, res.ocrVide ? 'warn' : 'err', res.texte);
        return;
      }
      // Garde les photos, l'état et la pile déjà choisis, puis affiche la fiche trouvée (circuit habituel)
      fiche.code = res.code;
      fiche.chargement = true;
      ouvrirFiche(res);
      var o = res.ocr || {};
      if (o.via === 'code') toast('Lu sur la photo : ' + (res.type === 'Revue' ? 'ISSN ' + res.issn : 'ISBN ' + res.isbnEan), null, 3500);
      else if (o.via === 'catalogue') toast('Couverture reconnue : ' + (o.correspondance || res.titre), null, 3500);
      else {
        msgOcr('Aucune notice trouvée dans les catalogues : vérifiez les champs lus, puis enregistrez.', 'warn', o.texte);
        if (res.existants && res.existants.length && typeof afficherAlerteDoublon === 'function') {
          afficherAlerteDoublon(S.fiche, res.existants, null);
        }
      }
    }).catch(function (e) {
      enCours = false; boutons(true);
      if (S.fiche === fiche) msgOcr('Lecture impossible : ' + e.message, 'err');
    });
  }
})();
