const DISCORD_WEBHOOK = 'https://canary.discord.com/api/webhooks/1498457729726021705/bJnDc7ounbJNhDoEw1R3OEVH2RxqgfjXdNudj9JfpgUUJ5hymunZ5WmC0PF0wg8S4LRQ';

let mp3File = null;
let generatedData = null;

window.addEventListener('DOMContentLoaded', function () {
  var dropZone = document.getElementById('dropZone');
  var fileInput = document.getElementById('fileInput');
  var genBtn = document.getElementById('genBtn');

  // Clic sur la zone → ouvre le sélecteur
  dropZone.addEventListener('click', function (e) {
    fileInput.click();
  });

  // Changement de fichier via le sélecteur
  fileInput.addEventListener('change', function () {
    if (fileInput.files && fileInput.files.length > 0) {
      setFile(fileInput.files[0]);
    }
  });

  // Drag & drop
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

  // Inputs texte
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
  document.getElementById('progressLabel').textContent = '✖ ' + msg;
  document.getElementById('progressLabel').classList.remove('pulsing');
  document.getElementById('progressBar').style.background = '#e24b4a';
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
    showError('Erreur de décodage. Fichier MP3 invalide ?');
    await audioCtx.close();
    return;
  }

  setProgress(35, 'Analyse spectrale...');
  await tick();

  var notes = detectBeats(audioBuffer);

  setProgress(65, 'Génération des notes...');
  await tick();

  var title = document.getElementById('titleInput').value.trim();
  var artist = document.getElementById('artistInput').value.trim();
  var mapper = document.getElementById('mapperInput').value.trim();
  var approachDist = parseFloat(document.getElementById('approachDist').value) || 50;
  var approachTime = parseFloat(document.getElementById('approachTime').value) || 1;

  var official = {
    _approachDistance: approachDist,
    _approachTime: approachTime,
    _name: "BEATHAVEN Auto-Generated",
    _notes: notes
  };

  var meta = {
    _artist: artist,
    _difficulties: ["official.json"],
    _mappers: [mapper],
    _music: mp3File.name,
    _title: title,
    _version: 1
  };

  generatedData = { official: official, meta: meta, mp3File: mp3File, title: title, artist: artist, mapper: mapper };

  setProgress(80, 'Rendu de l\'aperçu...');
  await tick();

  var bpm = estimateBpm(notes);
  document.getElementById('sBpm').textContent = Math.round(bpm);
  document.getElementById('sNotes').textContent = notes.length;
  document.getElementById('sDur').textContent = Math.round(audioBuffer.duration);

  document.getElementById('previewStats').style.display = 'grid';
  drawNotePreview(notes, audioBuffer.duration);
  document.getElementById('notePreview').style.display = 'block';

  setProgress(90, 'Envoi sur Discord...');
  await tick();

  await sendToDiscord(title, artist, mapper, notes.length, Math.round(bpm), Math.round(audioBuffer.duration));

  setProgress(100, 'Map générée avec succès !');
  progressLabel.classList.remove('pulsing');

  document.getElementById('dlBtn').style.display = 'flex';
  genBtn.disabled = false;

  await audioCtx.close();
}

function detectBeats(audioBuffer) {
  var data = audioBuffer.getChannelData(0);
  var sampleRate = audioBuffer.sampleRate;
  var hopSize = Math.floor(sampleRate * 0.02);
  var windowSize = Math.floor(sampleRate * 0.04);

  var energies = [];
  for (var i = 0; i + windowSize < data.length; i += hopSize) {
    var e = 0;
    for (var j = 0; j < windowSize; j++) e += data[i + j] * data[i + j];
    energies.push(e / windowSize);
  }

  var smoothed = energies.map(function (v, i) {
    var w = 8;
    var start = Math.max(0, i - w);
    var end = Math.min(energies.length - 1, i + w);
    var s = 0;
    for (var k = start; k <= end; k++) s += energies[k];
    return s / (end - start + 1);
  });

  var onsets = [];
  var minGap = Math.floor(0.12 / (hopSize / sampleRate));
  var lastOnset = -minGap;

  for (var i = 3; i < energies.length - 3; i++) {
    var slice = energies.slice(Math.max(0, i - 3), i + 4);
    var localMax = Math.max.apply(null, slice);
    if (energies[i] !== localMax) continue;
    if (i - lastOnset < minGap) continue;
    var threshold = smoothed[i] * 1.5;
    if (energies[i] > threshold) {
      onsets.push(i);
      lastOnset = i;
    }
  }

  var vals = [-1, 0, 1];
  var prevX = null, prevY = null;
  return onsets.map(function (idx) {
    var t = parseFloat(((idx * hopSize) / sampleRate).toFixed(3));
    var x, y;
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
  var avg = intervals.reduce(function (a, b) { return a + b; }, 0) / intervals.length;
  return 60 / avg;
}

function drawNotePreview(notes, duration) {
  var canvas = document.getElementById('noteCanvas');
  var ctx = canvas.getContext('2d');
  var W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  var maxNotes = 120;
  var subset = notes.slice(0, maxNotes);
  var lastNote = subset[subset.length - 1];
  var dur = lastNote ? Math.min(duration, lastNote._time + 1) : duration;

  ctx.strokeStyle = 'rgba(124,90,255,0.15)';
  ctx.lineWidth = 1;
  [W / 3, 2 * W / 3].forEach(function (x) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  });
  [H / 3, 2 * H / 3].forEach(function (y) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  });

  subset.forEach(function (note, i) {
    var px = (note._time / dur) * (W - 12) + 6;
    var py = H / 2 - note._y * (H / 3);
    var alpha = 0.4 + 0.6 * (i / subset.length);
    if (note._x === -1) ctx.fillStyle = 'rgba(124,90,255,' + alpha + ')';
    else if (note._x === 1) ctx.fillStyle = 'rgba(29,233,155,' + alpha + ')';
    else ctx.fillStyle = 'rgba(164,127,255,' + alpha + ')';
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function sendToDiscord(title, artist, mapper, noteCount, bpm, duration) {
  var embed = {
    embeds: [{
      title: '🎵 Nouvelle map générée : ' + title,
      color: 0x7c5aff,
      fields: [
        { name: '🎤 Artiste', value: artist, inline: true },
        { name: '🗺️ Mapper', value: mapper, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '🎯 Notes', value: String(noteCount), inline: true },
        { name: '🥁 BPM estimé', value: String(bpm), inline: true },
        { name: '⏱️ Durée', value: duration + 's', inline: true }
      ],
      footer: { text: 'Rhythia Map Generator' },
      timestamp: new Date().toISOString()
    }]
  };

  try {
    var res = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });

    var dsStatus = document.getElementById('discordStatus');
    var dsText = document.getElementById('dsText');

    if (res.ok) {
      dsText.textContent = '◆ Map envoyée sur Discord !';
      dsStatus.style.display = 'flex';
    } else {
      dsText.textContent = '◆ Discord : erreur ' + res.status;
      dsStatus.style.display = 'flex';
      dsStatus.style.borderColor = 'rgba(226,75,74,0.3)';
      dsStatus.style.background = 'rgba(226,75,74,0.08)';
      dsText.style.color = '#e24b4a';
    }
  } catch (e) {
    var dsStatus = document.getElementById('discordStatus');
    document.getElementById('dsText').textContent = '◆ Discord : impossible de joindre le webhook';
    dsStatus.style.display = 'flex';
  }
}

async function downloadZip() {
  if (!generatedData) return;

  var zip = new JSZip();
  zip.file('official.json', JSON.stringify(generatedData.official, null, 2));
  zip.file('meta.json', JSON.stringify(generatedData.meta, null, 2));
  zip.file(generatedData.mp3File.name, generatedData.mp3File);

  var blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = (generatedData.title || 'map').replace(/\s+/g, '_') + '_rhythia.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
