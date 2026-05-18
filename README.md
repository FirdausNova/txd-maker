# 🎮 TXD Maker — GTA San Andreas Texture Tool

Convert PNG images to TXD (Texture Dictionary) files for **GTA San Andreas** modding. Runs entirely in your browser — no installation required.

🌐 **[Open TXD Maker →](https://firdausnova.github.io/txd-maker/)**

![TXD Maker Screenshot](https://img.shields.io/badge/GTA_SA-Compatible-purple?style=for-the-badge) ![License](https://img.shields.io/badge/License-MIT-blue?style=for-the-badge) ![No Server](https://img.shields.io/badge/100%25-Client_Side-green?style=for-the-badge)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| **Single TXD** | Combine multiple images into 1 TXD file |
| **Separate TXDs** | Each image becomes its own TXD, auto-packaged as ZIP |
| **DXT Compression** | DXT1 (no alpha), DXT3 (sharp alpha), DXT5 (smooth alpha) |
| **Auto Detect** | Automatically chooses DXT1 or DXT3 based on image transparency |
| **Mipmap Generation** | Generates mipmaps for better in-game performance |
| **Power-of-2 Resize** | Auto-resizes images to valid dimensions (64, 128, 256, 512, etc.) |
| **Custom Texture Names** | Rename textures directly in the UI |
| **100% Client-Side** | No server, no upload — everything runs in your browser |
| **Privacy Safe** | Your images never leave your device |

---

## 🚀 How to Use

1. Open **[TXD Maker](https://firdausnova.github.io/txd-maker/)**
2. **Drag & drop** your PNG/JPG images into the upload area (or click to browse)
3. **Configure** settings:
   - **TXD Name** — name for the output file
   - **Mode** — Single TXD (all-in-one) or Separate TXDs (one each, downloaded as ZIP)
   - **Compression** — Auto, DXT1, DXT3, DXT5, or Uncompressed RGBA
   - **Mipmaps** — toggle on/off, set max levels
   - **Auto Resize** — resize to power-of-2 dimensions
4. Click **Convert to TXD**
5. File downloads automatically!

---

## 📁 TXD Format

The generated TXD files are fully compatible with GTA San Andreas:

| Property | Value |
|----------|-------|
| RenderWare Version | `3.6.0.3` (`0x1803FFFF`) |
| Platform | D3D9 (PC) |
| Device | Direct3D |
| Compression | DXT1 / DXT3 / DXT5 / RGBA32 |

### Verified With
- ✅ Magic.TXD
- ✅ TXD Workshop
- ✅ GTA San Andreas (PC)

---

## 🛠️ For Developers

### Project Structure

```
public/
├── index.html          # Main page
├── style.css           # Dark theme styling
├── txd-builder.js      # Core TXD binary engine
└── app.js              # UI logic & file handling
```

### How It Works

```
User drops PNG files
    ↓
Browser reads pixels via Canvas API
    ↓
JavaScript compresses to DXT format
    ↓
Binary TXD file assembled in memory
    ↓
Download triggered → saved to user's PC
```

No data is ever sent to any server. All processing happens locally in the browser using:
- **Canvas API** for image reading & resizing
- **Pure JS DXT compression** (based on libsquish algorithm)
- **DataView/Uint8Array** for binary file construction
- **JSZip** for packaging separate TXD files

### Run Locally

```bash
# Using any static file server
npx serve public

# Or simply open index.html in a browser
```

---

## 📋 Supported Image Formats

| Format | Extension |
|--------|-----------|
| PNG | `.png` |
| JPEG | `.jpg`, `.jpeg` |
| BMP | `.bmp` |
| WebP | `.webp` |

---

## 🔒 Privacy

- ✅ No server uploads — images stay on your device
- ✅ No cookies or tracking
- ✅ No external API calls (except loading fonts & JSZip library)
- ✅ Works offline after first load

---

## 📝 License

MIT License — free to use, modify, and distribute.

---

Made with 💜 for the GTA modding community
