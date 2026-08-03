# ChatVault

ChatVault ist eine statische Browser-App zum lokalen Durchsuchen eines ChatGPT-Datenexports.

## Funktionen

- Import der originalen ChatGPT-Export-ZIP
- Alternativ direkter Import von `conversations.json`
- Lokale Verarbeitung im Browser
- Volltextsuche
- Projektfilter
- Sortierung nach Datum, Titel und Umfang
- Favoriten
- Einzelne Chats als Textdatei speichern
- Hell-/Dunkelmodus
- Installierbar als Web-App
- Für GitHub Pages geeignet

## Datenschutz

Die Chat-Inhalte werden nicht an einen Server gesendet. Die Verarbeitung erfolgt im Browser.

Die Bibliothek JSZip wird über ein öffentliches CDN geladen, damit ZIP-Dateien geöffnet werden können. Die eigentlichen Chatdaten werden dabei nicht hochgeladen.

## Auf GitHub Pages veröffentlichen

1. Neues Repository bei GitHub anlegen, zum Beispiel `chatvault`.
2. Alle Dateien aus diesem Ordner in das Repository hochladen.
3. In GitHub öffnen:
   `Settings` → `Pages`
4. Unter `Build and deployment` auswählen:
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
5. Speichern.
6. Nach kurzer Zeit erscheint die öffentliche Adresse der App.

## Lokal testen

Die Datei `index.html` kann direkt geöffnet werden. Für die Installierbarkeit und den Offline-Modus ist ein lokaler Webserver besser.

Beispiel mit Python:

```bash
python -m http.server 8000
```

Danach im Browser öffnen:

```text
http://localhost:8000
```

## Unterstütztes Exportformat

ChatVault sucht in einer ZIP-Datei nach `conversations.json`. Die App ist für das übliche ChatGPT-Datenexportformat ausgelegt.

Projektinformationen sind im Export nicht bei allen älteren Chats einheitlich vorhanden. Solche Chats werden unter `Ohne Projekt` eingeordnet.
