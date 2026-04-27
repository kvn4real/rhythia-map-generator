# Rhythia Map Generator

Génère automatiquement des maps pour le jeu **Rhythia** à partir d'un fichier MP3.

## Fonctionnement

1. Importe un fichier MP3
2. Remplis le titre, l'artiste et ton pseudo mapper
3. Clique sur **Générer la map**
4. L'algorithme analyse le rythme via Web Audio API et génère les notes
5. La map est envoyée en embed sur Discord via webhook
6. Télécharge le ZIP contenant :
   - `official.json` — positions et timings de chaque note
   - `meta.json` — métadonnées de la map
   - Le fichier MP3 original

## Stack

- HTML / CSS / JavaScript vanilla
- Web Audio API (analyse des beats)
- JSZip (génération du ZIP côté client)
- Discord Webhook (notification embed)

## Déploiement

Déployé sur **Vercel** — aucun backend requis, tout tourne côté client.
