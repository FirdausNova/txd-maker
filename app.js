/**
 * TXD Maker — Client-side Application Logic (Full Client-Side Version)
 * All processing happens in the browser — no server required.
 */

// ============================================================================
// State
// ============================================================================

const state = {
    files: [],
    converting: false
};

let fileIdCounter = 0;

// ============================================================================
// DOM Elements
// ============================================================================

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dropzone = $('#dropzone');
const fileInput = $('#file-input');
const fileListContainer = $('#file-list-container');
const fileList = $('#file-list');
const fileCountEl = $('#file-count');
const btnConvert = $('#btn-convert');
const btnAddMore = $('#btn-add-more');
const btnClearAll = $('#btn-clear-all');
const btnCloseResult = $('#btn-close-result');
const resultPanel = $('#result-panel');
const resultBody = $('#result-body');
const statusBadge = $('#status-badge');
const convertProgress = $('#convert-progress');
const convertContent = $('.btn-convert-content');

// ============================================================================
// File Management
// ============================================================================

async function addFiles(fileArray) {
    for (const file of fileArray) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (!['png', 'jpg', 'jpeg', 'bmp', 'webp'].includes(ext)) continue;

        const id = ++fileIdCounter;
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        const preview = URL.createObjectURL(file);

        // Get image metadata using Canvas
        const metadata = await getImageMetadata(file);

        state.files.push({
            id,
            file,
            name: file.name,
            texName: baseName.substring(0, 31),
            preview,
            metadata
        });
    }

    updateUI();
}

async function getImageMetadata(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const hasAlpha = detectAlpha(img);
            URL.revokeObjectURL(url);
            resolve({
                width: img.width,
                height: img.height,
                hasAlpha,
                size: file.size
            });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve({ width: 0, height: 0, hasAlpha: false, size: file.size });
        };
        img.src = url;
    });
}

function removeFile(id) {
    const idx = state.files.findIndex(f => f.id === id);
    if (idx !== -1) {
        URL.revokeObjectURL(state.files[idx].preview);
        state.files.splice(idx, 1);
    }
    updateUI();
}

function clearAll() {
    state.files.forEach(f => URL.revokeObjectURL(f.preview));
    state.files = [];
    updateUI();
}

// ============================================================================
// UI Rendering
// ============================================================================

function updateUI() {
    const count = state.files.length;
    fileCountEl.textContent = `${count} file${count !== 1 ? 's' : ''}`;

    if (count > 0) {
        dropzone.style.display = 'none';
        fileListContainer.style.display = 'flex';
        btnConvert.disabled = false;
    } else {
        dropzone.style.display = 'block';
        fileListContainer.style.display = 'none';
        btnConvert.disabled = true;
    }

    renderFileList();
}

function renderFileList() {
    fileList.innerHTML = '';

    state.files.forEach((f, index) => {
        const item = document.createElement('div');
        item.className = 'file-item';
        item.style.animationDelay = `${index * 0.05}s`;

        const meta = f.metadata;
        const sizeStr = formatSize(f.file.size);
        const dimsStr = meta ? `${meta.width}\u00D7${meta.height}` : '...';
        const alphaStr = meta && meta.hasAlpha ? '<span class="alpha-badge">\u03B1</span>' : '';

        item.innerHTML = `
            <div class="file-thumb">
                <img src="${f.preview}" alt="${f.name}" loading="lazy">
            </div>
            <div class="file-info">
                <div class="file-name">${f.name}</div>
                <input class="file-name-input" type="text" value="${f.texName}"
                    placeholder="texture name" data-id="${f.id}" maxlength="31"
                    title="Texture name in TXD (max 31 chars)">
                <div class="file-meta">
                    <span>${dimsStr}</span>
                    <span>${sizeStr}</span>
                    ${alphaStr}
                </div>
            </div>
            <button class="file-remove" data-id="${f.id}" title="Remove">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
            </button>
        `;

        fileList.appendChild(item);
    });

    fileList.querySelectorAll('.file-remove').forEach(btn => {
        btn.addEventListener('click', () => removeFile(parseInt(btn.dataset.id)));
    });

    fileList.querySelectorAll('.file-name-input').forEach(input => {
        input.addEventListener('change', (e) => {
            const id = parseInt(e.target.dataset.id);
            const f = state.files.find(f => f.id === id);
            if (f) f.texName = e.target.value.substring(0, 31);
        });
    });
}

function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// ============================================================================
// Conversion (100% Client-Side)
// ============================================================================

async function convertFiles() {
    if (state.converting || state.files.length === 0) return;

    state.converting = true;
    btnConvert.disabled = true;
    convertContent.style.display = 'none';
    convertProgress.style.display = 'flex';
    statusBadge.classList.add('converting');
    statusBadge.querySelector('span:last-child').textContent = 'Converting...';

    const mode = document.querySelector('input[name="mode"]:checked').value;
    const compression = $('#compression').value;
    const generateMipmaps = $('#toggle-mipmaps input').checked;
    const maxMipmaps = parseInt($('#max-mipmaps').value);
    const autoResize = $('#toggle-resize input').checked;
    const txdName = $('#txd-name').value || 'output';

    try {
        // Small delay to let UI update
        await new Promise(r => setTimeout(r, 50));

        if (mode === 'single') {
            // All images -> one TXD
            const builder = new TXDBuilder();
            const results = [];

            for (const f of state.files) {
                const result = await builder.addTexture(f.file, {
                    name: f.texName,
                    compression,
                    generateMipmaps,
                    maxMipmaps,
                    autoResize
                });
                results.push(result);
            }

            const txdData = builder.build();
            downloadUint8Array(txdData, `${txdName}.txd`);
            showResults([{
                filename: `${txdName}.txd`,
                size: txdData.length,
                textures: results
            }]);

        } else {
            // Each image -> separate TXD, bundled into a ZIP
            const zip = new JSZip();
            const results = [];

            for (const f of state.files) {
                const builder = new TXDBuilder();
                const info = await builder.addTexture(f.file, {
                    name: f.texName,
                    compression,
                    generateMipmaps,
                    maxMipmaps,
                    autoResize
                });

                const txdData = builder.build();
                zip.file(`${f.texName}.txd`, txdData);
                results.push({
                    filename: `${f.texName}.txd`,
                    size: txdData.length,
                    textures: [info]
                });
            }

            // Generate and download ZIP
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipName = `${txdName}_textures.zip`;
            downloadBlob(zipBlob, zipName);

            // Add ZIP summary to results
            results.unshift({
                filename: zipName,
                size: zipBlob.size,
                textures: [{ name: `${results.length} TXD files`, width: '-', height: '-', format: 'ZIP' }],
                isZip: true
            });

            showResults(results);
        }
    } catch (err) {
        alert('Error: ' + err.message);
        console.error(err);
    } finally {
        state.converting = false;
        btnConvert.disabled = false;
        convertContent.style.display = 'flex';
        convertProgress.style.display = 'none';
        statusBadge.classList.remove('converting');
        statusBadge.querySelector('span:last-child').textContent = 'Ready';
    }
}

function downloadUint8Array(data, filename) {
    const blob = new Blob([data], { type: 'application/octet-stream' });
    downloadBlob(blob, filename);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function showResults(results) {
    resultPanel.style.display = 'block';
    resultBody.innerHTML = '';

    results.forEach((r, i) => {
        const texList = r.textures.map(t =>
            `${t.name} (${t.width}\u00D7${t.height}, ${t.format})`
        ).join(', ');

        const item = document.createElement('div');
        item.className = 'result-item' + (r.isZip ? ' result-item-zip' : '');
        item.style.animationDelay = `${i * 0.1}s`;

        const icon = r.isZip
            ? `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-accent)" stroke-width="2">
                 <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
               </svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2.5">
                 <polyline points="20 6 9 17 4 12"/>
               </svg>`;

        item.innerHTML = `
            <div class="result-item-info">
                <div class="result-item-name">${r.filename}</div>
                <div class="result-item-meta">${formatSize(r.size)} \u00B7 ${r.isZip ? r.textures[0].name : r.textures.length + ' texture(s) \u00B7 ' + texList}</div>
            </div>
            ${icon}
        `;
        resultBody.appendChild(item);
    });

    resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ============================================================================
// Event Listeners
// ============================================================================

dropzone.addEventListener('click', () => fileInput.click());

dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files));
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        addFiles(Array.from(e.target.files));
        fileInput.value = '';
    }
});

btnAddMore.addEventListener('click', () => fileInput.click());

btnClearAll.addEventListener('click', () => {
    clearAll();
    resultPanel.style.display = 'none';
});

btnCloseResult.addEventListener('click', () => {
    resultPanel.style.display = 'none';
});

btnConvert.addEventListener('click', convertFiles);

$$('.radio-option').forEach(opt => {
    opt.addEventListener('click', () => {
        $$('.radio-option').forEach(o => o.classList.remove('active'));
        opt.classList.add('active');
        opt.querySelector('input').checked = true;
    });
});

document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') convertFiles();
});

document.body.addEventListener('dragover', (e) => e.preventDefault());
document.body.addEventListener('drop', (e) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) {
        addFiles(Array.from(e.dataTransfer.files));
    }
});

// ============================================================================
// Init
// ============================================================================

console.log('%c TXD Maker %c Client-Side Ready ',
    'background: #7c3aed; color: white; font-weight: bold; border-radius: 4px 0 0 4px; padding: 2px 8px;',
    'background: #1a1a3e; color: #a78bfa; font-weight: bold; border-radius: 0 4px 4px 0; padding: 2px 8px;'
);
