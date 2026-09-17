const DISCORD_WEBHOOK = 'https://canary.discord.com/api/webhooks/1498457729726021705/bJnDc7ounbJNhDoEw1R3OEVH2RxqgfjXdNudj9JfpgUUJ5hymunZ5WmC0PF0wg8S4LRQ';

let mp3File = null;
let generatedData = null;

window.addEventListener('DOMContentLoaded', function () {
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var genBtn = document.getElementById('genBtn');

  dropZone.addEventListener('click', function (e) {
    fileInput.click();
  });

  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) {
      setFile(fileInput.files[0]);
    }
  });

  dropZone.addEventListener('dragover', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.add('drag');
  });

  dropZone.addEventListener('dragleave', function (e) {
    e.preventDefault();
    dropZone.classList.remove('drag');
  });

  dropZone.addEventListener('drop', function (e) {
    e.preventDefault();
    e.stopPropagation();
    dropZone.classList.remove('drag');
    var files = e.dataTransfer.files;
    if (files && files.length > 0) {
      setFile(files[0]);
    }
  });

  ['titleInput', 'artistInput', 'mapperInput'].forEach(function (id) {
    document.getElementById(id).addEventListener('input', checkReady);
  });
});

function setFile(f) {
  if (!f) return;
  var name = f.name.toLowerCase();
  if (!name.endsWith('.mp3') && f.type !== 'audio/mpeg') {
    alert('Veuillez sélectionner un fichier MP3.');
    return;
  }

  mp3File = f;

  document.getElementById('dropInner').style.display = 'none';
  document.getElementById('dropReady').style.display = 'block';
  document.getElementById('fileName').textContent = f.name;
  document.getElementById('fileSize').textContent = formatSize(f.size);

  var base = f.name.replace(/\.mp3$/i, '').replace(/[_-]/g, ' ');
  var titleInput = document.getElementById('titleInput');
  if (!titleInput.value) titleInput.value = base;

  checkReady();
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function checkReady() {
  var genBtn = document.getElementById('genBtn');
  var ok = mp3File &&
    document.getElementById('titleInput').value.trim() &&
    document.getElementById('artistInput').value.trim() &&
    document.getElementById('mapperInput').value.trim();
  genBtn.disabled = !ok;
}

function setProgress(pct, label) {
  document.getElementById('progressArea').style.display = 'block';
  document.getElementById('progressBar').style.width = pct + '%';
  document.getElementById('progressLabel').textContent = label;
}

function tick() {
  return new Promise(function (r) { setTimeout(r, 60); });
}

function showError(msg) {
  document.getElementById('progressLabel').textContent = 'Erreur : ' + msg;
  document.getElementById('progressLabel').classList.remove('pulsing');
  document.getElementById('progressBar').style.background = '#555';
  document.getElementById('genBtn').disabled = false;
}

async function generate() {
  var genBtn = document.getElementById('genBtn');
  genBtn.disabled = true;
  document.getElementById('dlBtn').style.display = 'none';
  document.getElementById('discordStatus').style.display = 'none';
  document.getElementById('previewStats').style.display = 'none';
  document.getElementById('notePreview').style.display = 'none';
  document.getElementById('previewIdle').style.display = 'none';

  var progressLabel = document.getElementById('progressLabel');
  progressLabel.classList.add('pulsing');

  setProgress(5, 'Lecture du fichier...');

  var arrayBuffer;
  try {
    arrayBuffer = await mp3File.arrayBuffer();
  } catch (e) {
    showError('Impossible de lire le fichier.');
    return;
  }

  setProgress(15, 'Décodage audio...');
  await tick();

  var AudioCtx = window.AudioContext || window.webkitAudioContext;
  var audioCtx = new AudioCtx();
  var audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    showError('Fichier MP3 invalide.');
    await audioCtx.close();
    return;
  }

  setProgress(35, 'Analyse spectrale...');
  await tick();

  var notes = detectBeats(audioBuffer);

  setProgress(65, 'Génération des notes...');
  await tick();

  var title       = document.getElementById('titleInput').value.trim();
  var artist      = document.getElementById('artistInput').value.trim();
  var mapper      = document.getElementById('mapperInput').value.trim();
  var approachDist = parseFloat(document.getElementById('approachDist').value) || 50;
  var approachTime = parseFloat(document.getElementById('approachTime').value) || 1;

  var official = {
    _approachDistance: approachDist,
    _approachTime: approachTime,
    _name: 'BEATHAVEN Auto-Generated',
    _notes: notes
  };

  var meta = {
    _artist: artist,
    _difficulties: ['official.json'],
    _mappers: [mapper],
    _music: mp3File.name,
    _title: title,
    _version: 1
  };

  generatedData = { official, meta, mp3File, title, artist, mapper };

  setProgress(80, 'Rendu de l\'aperçu...');
  await tick();

  var bpm = estimateBpm(notes);
  document.getElementById('sBpm').textContent   = Math.round(bpm);
  document.getElementById('sNotes').textContent = notes.length;
  document.getElementById('sDur').textContent   = Math.round(audioBuffer.duration);

  document.getElementById('previewStats').style.display = 'grid';
  drawNotePreview(notes, audioBuffer.duration);
  document.getElementById('notePreview').style.display = 'block';

  setProgress(90, 'Génération ZIP + envoi Discord...');
  await tick();

  // Générer le ZIP avant l'envoi Discord
  var zip = new JSZip();
  zip.file('official.json', JSON.stringify(official, null, 2));
  zip.file('meta.json',     JSON.stringify(meta,     null, 2));
  zip.file(mp3File.name,    mp3File);
  var zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  var zipName = (title || 'map').replace(/\s+/g, '_') + '_rhythia.zip';

  await sendToDiscord(title, artist, mapper, notes.length, Math.round(bpm), Math.round(audioBuffer.duration), zipBlob, zipName);

  setProgress(100, 'Map générée avec succès !');
  progressLabel.classList.remove('pulsing');

  document.getElementById('dlBtn').style.display = 'flex';
  document.getElementById('resetBtn').style.display = 'flex';
  genBtn.disabled = false;

  await audioCtx.close();
}

function detectBeats(audioBuffer) {
  var data       = audioBuffer.getChannelData(0);
  var sampleRate = audioBuffer.sampleRate;
  var hopSize    = Math.floor(sampleRate * 0.02);
  var windowSize = Math.floor(sampleRate * 0.04);

  var energies = [];
  for (var i = 0; i + windowSize < data.length; i += hopSize) {
    var e = 0;
    for (var j = 0; j < windowSize; j++) e += data[i + j] * data[i + j];
    energies.push(e / windowSize);
  }

  var smoothed = energies.map(function (v, i) {
    var w = 8, start = Math.max(0, i - w), end = Math.min(energies.length - 1, i + w), s = 0;
    for (var k = start; k <= end; k++) s += energies[k];
    return s / (end - start + 1);
  });

  var onsets = [], minGap = Math.floor(0.12 / (hopSize / sampleRate)), lastOnset = -minGap;
  for (var i = 3; i < energies.length - 3; i++) {
    var slice    = energies.slice(Math.max(0, i - 3), i + 4);
    var localMax = Math.max.apply(null, slice);
    if (energies[i] !== localMax) continue;
    if (i - lastOnset < minGap) continue;
    if (energies[i] > smoothed[i] * 1.5) { onsets.push(i); lastOnset = i; }
  }

  var vals = [-1, 0, 1], prevX = null, prevY = null;
  return onsets.map(function (idx) {
    var t = parseFloat(((idx * hopSize) / sampleRate).toFixed(3)), x, y;
    do { x = vals[Math.floor(Math.random() * 3)]; } while (x === prevX && Math.random() > 0.3);
    do { y = vals[Math.floor(Math.random() * 3)]; } while (y === prevY && Math.random() > 0.3);
    prevX = x; prevY = y;
    return { _time: t, _x: x, _y: y };
  });
}

function estimateBpm(notes) {
  if (notes.length < 4) return 120;
  var intervals = [];
  for (var i = 1; i < Math.min(notes.length, 64); i++) {
    var d = notes[i]._time - notes[i - 1]._time;
    if (d > 0.1 && d < 2) intervals.push(d);
  }
  if (!intervals.length) return 120;
  return 60 / (intervals.reduce(function (a, b) { return a + b; }, 0) / intervals.length);
}

function drawNotePreview(notes, duration) {
  var canvas = document.getElementById('noteCanvas');
  var ctx    = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  var subset   = notes.slice(0, 120);
  var lastNote = subset[subset.length - 1];
  var dur      = lastNote ? Math.min(duration, lastNote._time + 1) : duration;

  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  ctx.lineWidth   = 1;
  [W / 3, 2 * W / 3].forEach(function (x) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); });
  [H / 3, 2 * H / 3].forEach(function (y) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); });

  subset.forEach(function (note, i) {
    var px = (note._time / dur) * (W - 12) + 6;
    var py = H / 2 - note._y * (H / 3);
    var a  = 0.25 + 0.75 * (i / subset.length);
    var c  = note._x === -1 ? [255, 255, 255] : note._x === 1 ? [180, 180, 180] : [100, 100, 100];
    ctx.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    ctx.beginPath();
    ctx.arc(px, py, 2.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ── DISCORD WEBHOOK — Components V2 ─────────────────────────────────────────
async function sendToDiscord(title, artist, mapper, noteCount, bpm, duration, zipBlob, zipName) {
  var diffLabels = { E: 'Easy', M: 'Medium', H: 'Hard', L: 'Lunatic' };
  // currentDiff est défini dans index.html ; on le lit si disponible
  var diff = (typeof currentDiff !== 'undefined' && diffLabels[currentDiff]) ? diffLabels[currentDiff] : 'Medium';
  var date = new Date().toLocaleDateString('fr-FR');

  // Discord Components V2 — flag 32 = IS_COMPONENTS_V2
  var payload = {
    flags: 32,
    components: [
      {
        type: 10,
        content: '## ' + title
      },
      {
        type: 14,
        divider: true,
        spacing: 1
      },
      {
        type: 17,
        accent_color: 0xffffff,
        components: [
          {
            type: 10,
            content: '**Informations de la map**'
          },
          {
            type: 10,
            content: [
              '**Artiste** — ' + artist,
              '**Mapper** — ' + mapper,
              '**Difficulté** — ' + diff,
              '**Notes** — ' + noteCount,
              '**BPM estimé** — ' + bpm,
              '**Durée** — ' + duration + 's'
            ].join('\n')
          },
          {
            type: 14,
            divider: true,
            spacing: 1
          },
          {
            type: 10,
            content: 'Le fichier ZIP de la map est joint ci-dessous.'
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: 'Ouvrir Rhythia Map Generator',
                url: 'https://rhythia-map-generator.vercel.app'
              }
            ]
          }
        ]
      },
      {
        type: 14,
        divider: false,
        spacing: 1
      },
      {
        type: 10,
        content: '-# Charta • ' + date
      }
    ]
  };

  var form = new FormData();
  form.append('payload_json', JSON.stringify(payload));
  form.append('files[0]', zipBlob, zipName);

  var ds = document.getElementById('discordStatus');
  var dt = document.getElementById('dsText');

  try {
    var res = await fetch(DISCORD_WEBHOOK, { method: 'POST', body: form });
    ds.style.display = 'flex';
    if (res.ok) {
      dt.textContent = 'Map + ZIP envoyés sur Discord';
    } else {
      dt.textContent = 'Erreur Discord : ' + res.status;
      dt.style.color = 'var(--w3)';
    }
  } catch (e) {
    ds.style.display = 'flex';
    dt.textContent = 'Discord : webhook injoignable';
  }
}

// ── TÉLÉCHARGEMENT ZIP ───────────────────────────────────────────────────────
async function downloadZip() {
  if (!generatedData) return;

  var zip = new JSZip();
  zip.file('official.json', JSON.stringify(generatedData.official, null, 2));
  zip.file('meta.json',     JSON.stringify(generatedData.meta,     null, 2));
  zip.file(generatedData.mp3File.name, generatedData.mp3File);

  var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  a.href     = url;
  a.download = (generatedData.title || 'map').replace(/\s+/g, '_') + '_rhythia.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
