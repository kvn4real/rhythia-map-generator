const DISCORD_WEBHOOK = 'https://canary.discord.com/api/webhooks/1498457729726021705/bJnDc7ounbJNhDoEw1R3OEVH2RxqgfjXdNudj9JfpgUUJ5hymunZ5WmC0PF0wg8S4LRQ';

let mp3File = null;
let generatedData = null;

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const genBtn = document.getElementById('genBtn');

fileInput.addEventListener('change', e => setFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => {
  e.preventDefault();
  dropZone.classList.add('drag');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag');
  const f = e.dataTransfer.files[0];
  if (f) setFile(f);
});

function setFile(f) {
  if (!f) return;
  if (!f.type.includes('audio') && !f.name.toLowerCase().endsWith('.mp3')) {
    alert('Veuillez sélectionner un fichier MP3.');
    return;
  }
  mp3File = f;

  document.getElementById('dropInner').style.display = 'none';
  document.getElementById('dropReady').style.display = 'block';
  document.getElementById('fileName').textContent = f.name;
  document.getElementById('fileSize').textContent = formatSize(f.size);

  const base = f.name.replace(/\.mp3$/i, '').replace(/[_-]/g, ' ');
  if (!document.getElementById('titleInput').value) {
    document.getElementById('titleInput').value = base;
  }

  checkReady();
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

['titleInput', 'artistInput', 'mapperInput'].forEach(id => {
  document.getElementById(id).addEventListener('input', checkReady);
});

function checkReady() {
  const ok = mp3File &&
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

async function generate() {
  genBtn.disabled = true;
  document.getElementById('dlBtn').style.display = 'none';
  document.getElementById('discordStatus').style.display = 'none';
  document.getElementById('previewStats').style.display = 'none';
  document.getElementById('notePreview').style.display = 'none';
  document.getElementById('previewIdle').style.display = 'none';

  const progressLabel = document.getElementById('progressLabel');
  progressLabel.classList.add('pulsing');

  setProgress(5, 'Lecture du fichier...');

  let arrayBuffer;
  try {
    arrayBuffer = await mp3File.arrayBuffer();
  } catch (e) {
    showError('Impossible de lire le fichier.');
    return;
  }

  setProgress(15, 'Décodage audio...');
  await tick();

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let audioBuffer;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  } catch (e) {
    showError('Erreur de décodage. Fichier MP3 invalide ?');
    await audioCtx.close();
    return;
  }

  setProgress(35, 'Analyse spectrale...');
  await tick();

  const notes = detectBeats(audioBuffer);

  setProgress(65, 'Génération des notes...');
  await tick();

  const title = document.getElementById('titleInput').value.trim();
  const artist = document.getElementById('artistInput').value.trim();
  const mapper = document.getElementById('mapperInput').value.trim();
  const approachDist = parseFloat(document.getElementById('approachDist').value) || 50;
  const approachTime = parseFloat(document.getElementById('approachTime').value) || 1;

  const official = {
    _approachDistance: approachDist,
    _approachTime: approachTime,
    _name: "BEATHAVEN Auto-Generated",
    _notes: notes
  };

  const meta = {
    _artist: artist,
    _difficulties: ["official.json"],
    _mappers: [mapper],
    _music: mp3File.name,
    _title: title,
    _version: 1
  };

  generatedData = { official, meta, mp3File, title, artist, mapper };

  setProgress(80, 'Rendu de l\'aperçu...');
  await tick();

  const bpm = estimateBpm(notes);
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

function tick() {
  return new Promise(r => setTimeout(r, 60));
}

function showError(msg) {
  document.getElementById('progressLabel').textContent = '✖ ' + msg;
  document.getElementById('progressLabel').classList.remove('pulsing');
  document.getElementById('progressBar').style.background = '#e24b4a';
  genBtn.disabled = false;
}

function detectBeats(audioBuffer) {
  const data = audioBuffer.getChannelData(0);
  const sampleRate = audioBuffer.sampleRate;
  const hopSize = Math.floor(sampleRate * 0.02);
  const windowSize = Math.floor(sampleRate * 0.04);

  const energies = [];
  for (let i = 0; i + windowSize < data.length; i += hopSize) {
    let e = 0;
    for (let j = 0; j < windowSize; j++) e += data[i + j] * data[i + j];
    energies.push(e / windowSize);
  }

  const smoothed = energies.map((v, i) => {
    const w = 8;
    const start = Math.max(0, i - w);
    const end = Math.min(energies.length - 1, i + w);
    let s = 0;
    for (let k = start; k <= end; k++) s += energies[k];
    return s / (end - start + 1);
  });

  const onsets = [];
  const minGap = Math.floor(0.12 / (hopSize / sampleRate));
  let lastOnset = -minGap;

  for (let i = 3; i < energies.length - 3; i++) {
    const localMax = Math.max(...energies.slice(Math.max(0, i - 3), i + 4));
    if (energies[i] !== localMax) continue;
    if (i - lastOnset < minGap) continue;
    const threshold = smoothed[i] * 1.5;
    if (energies[i] > threshold) {
      onsets.push(i);
      lastOnset = i;
    }
  }

  const vals = [-1, 0, 1];
  let prevX = null, prevY = null;
  return onsets.map(idx => {
    const t = parseFloat(((idx * hopSize) / sampleRate).toFixed(3));
    let x, y;
    do { x = vals[Math.floor(Math.random() * 3)]; } while (x === prevX && Math.random() > 0.3);
    do { y = vals[Math.floor(Math.random() * 3)]; } while (y === prevY && Math.random() > 0.3);
    prevX = x; prevY = y;
    return { _time: t, _x: x, _y: y };
  });
}

function estimateBpm(notes) {
  if (notes.length < 4) return 120;
  const intervals = [];
  for (let i = 1; i < Math.min(notes.length, 64); i++) {
    const d = notes[i]._time - notes[i - 1]._time;
    if (d > 0.1 && d < 2) intervals.push(d);
  }
  if (!intervals.length) return 120;
  const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  return 60 / avg;
}

function drawNotePreview(notes, duration) {
  const canvas = document.getElementById('noteCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const maxNotes = 120;
  const subset = notes.slice(0, maxNotes);
  const dur = Math.min(duration, notes[Math.min(notes.length - 1, maxNotes - 1)]?._time + 1 || duration);

  ctx.strokeStyle = 'rgba(124,90,255,0.15)';
  ctx.lineWidth = 1;
  for (let x = 0; x <= W; x += W / 3) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
  }
  for (let y = 0; y <= H; y += H / 3) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
  }

  subset.forEach((note, i) => {
    const px = (note._time / dur) * (W - 12) + 6;
    const py = H / 2 - note._y * (H / 3);
    const alpha = 0.4 + 0.6 * (i / subset.length);

    if (note._x === -1) ctx.fillStyle = `rgba(124,90,255,${alpha})`;
    else if (note._x === 1) ctx.fillStyle = `rgba(29,233,155,${alpha})`;
    else ctx.fillStyle = `rgba(164,127,255,${alpha})`;

    ctx.beginPath();
    ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

async function sendToDiscord(title, artist, mapper, noteCount, bpm, duration) {
  const now = new Date();
  const timestamp = now.toISOString();

  const embed = {
    embeds: [{
      title: `🎵 Nouvelle map générée : ${title}`,
      color: 0x7c5aff,
      fields: [
        { name: '🎤 Artiste', value: artist, inline: true },
        { name: '🗺️ Mapper', value: mapper, inline: true },
        { name: '\u200b', value: '\u200b', inline: true },
        { name: '🎯 Notes', value: `${noteCount}`, inline: true },
        { name: '🥁 BPM estimé', value: `${bpm}`, inline: true },
        { name: '⏱️ Durée', value: `${duration}s`, inline: true },
      ],
      footer: {
        text: 'Rhythia Map Generator'
      },
      timestamp: timestamp
    }]
  };

  try {
    const res = await fetch(DISCORD_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(embed)
    });

    const dsStatus = document.getElementById('discordStatus');
    const dsText = document.getElementById('dsText');

    if (res.ok) {
      dsText.textContent = '◆ Map envoyée sur Discord !';
      dsStatus.style.display = 'flex';
    } else {
      dsText.textContent = '◆ Discord : envoi échoué (code ' + res.status + ')';
      dsStatus.style.display = 'flex';
      dsStatus.style.borderColor = 'rgba(226,75,74,0.3)';
      dsStatus.style.background = 'rgba(226,75,74,0.08)';
      dsText.style.color = '#e24b4a';
    }
  } catch (e) {
    const dsStatus = document.getElementById('discordStatus');
    document.getElementById('dsText').textContent = '◆ Discord : impossible de joindre le webhook';
    dsStatus.style.display = 'flex';
  }
}

async function downloadZip() {
  if (!generatedData) return;

  const zip = new JSZip();
  zip.file('official.json', JSON.stringify(generatedData.official, null, 2));
  zip.file('meta.json', JSON.stringify(generatedData.meta, null, 2));
  zip.file(generatedData.mp3File.name, generatedData.mp3File);

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = (generatedData.title || 'map').replace(/\s+/g, '_') + '_rhythia.zip';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
