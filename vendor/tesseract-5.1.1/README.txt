Tesseract.js 5.1.1 embarqué pour la lecture des captures de tickets (js/ocr.js).
Pourquoi ici et pas sur un CDN : la page n'autorise que ses propres scripts
(Content-Security-Policy de index.html), et la capture ne doit jamais quitter
le téléphone. Source : npm tesseract.js@5.1.1 (dist/), tesseract.js-core@5.1.1
(variantes LSTM seules, avec et sans SIMD) et @tesseract.js-data/fra@1.0.0
(4.0.0_best_int, décompressé, lu avec gzip:false).
Licence Apache-2.0 (fichiers LICENSE-*.txt). Dossier versionné : changer de
version = nouveau dossier, jamais un remplacement sur place.
