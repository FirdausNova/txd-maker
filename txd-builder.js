/**
 * TXD Builder — Browser-Compatible RenderWare TXD File Generator
 * Compatible with GTA San Andreas (RW v3.6.0.3, Platform D3D9)
 * 
 * Runs entirely in the browser — no server required.
 * Uses Canvas API for image processing instead of sharp.
 */

// ============================================================================
// Constants
// ============================================================================

const RW_VERSION_GTASA = 0x1803FFFF;

const CHUNK_TEXDICTIONARY = 0x16;
const CHUNK_STRUCT = 0x01;
const CHUNK_TEXTURENATIVE = 0x15;
const CHUNK_EXTENSION = 0x03;

const PLATFORM_D3D9 = 9;

const D3DFMT_DXT1 = 0x31545844;
const D3DFMT_DXT3 = 0x33545844;
const D3DFMT_DXT5 = 0x35545844;
const D3DFMT_A8R8G8B8 = 21;

const DEFAULT_FILTER_FLAGS = 0x1106;
const FLAG_HASALPHA = 0x01;
const FLAG_ISCUBE = 0x08;

// ============================================================================
// Binary Helpers (replaces Node.js Buffer)
// ============================================================================

class BinaryWriter {
    constructor() {
        this.chunks = [];
        this.totalSize = 0;
    }

    writeUint32(value) {
        const buf = new ArrayBuffer(4);
        new DataView(buf).setUint32(0, value, true);
        this.chunks.push(new Uint8Array(buf));
        this.totalSize += 4;
    }

    writeUint16(value) {
        const buf = new ArrayBuffer(2);
        new DataView(buf).setUint16(0, value, true);
        this.chunks.push(new Uint8Array(buf));
        this.totalSize += 2;
    }

    writeUint8(value) {
        this.chunks.push(new Uint8Array([value & 0xFF]));
        this.totalSize += 1;
    }

    writeBytes(uint8array) {
        this.chunks.push(uint8array);
        this.totalSize += uint8array.length;
    }

    writeString32(str) {
        const buf = new Uint8Array(32);
        for (let i = 0; i < Math.min(str.length, 31); i++) {
            buf[i] = str.charCodeAt(i);
        }
        this.chunks.push(buf);
        this.totalSize += 32;
    }

    toUint8Array() {
        const result = new Uint8Array(this.totalSize);
        let offset = 0;
        for (const chunk of this.chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }
}

function writeChunkHeader(writer, id, size, version) {
    writer.writeUint32(id);
    writer.writeUint32(size);
    writer.writeUint32(version);
}

function calcChunkHeaderSize() {
    return 12;
}

// ============================================================================
// DXT Compression (Pure JS — runs in browser)
// ============================================================================

function compressDXT1Block(pixels) {
    let minR = 255, minG = 255, minB = 255;
    let maxR = 0, maxG = 0, maxB = 0;

    for (let i = 0; i < 16; i++) {
        const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
        if (r < minR) minR = r; if (g < minG) minG = g; if (b < minB) minB = b;
        if (r > maxR) maxR = r; if (g > maxG) maxG = g; if (b > maxB) maxB = b;
    }

    let color0 = ((maxR >> 3) << 11) | ((maxG >> 2) << 5) | (maxB >> 3);
    let color1 = ((minR >> 3) << 11) | ((minG >> 2) << 5) | (minB >> 3);

    let c0 = color0, c1 = color1;
    if (c0 < c1) {
        c0 = color1; c1 = color0;
        [maxR, minR] = [minR, maxR];
        [maxG, minG] = [minG, maxG];
        [maxB, minB] = [minB, maxB];
    }

    if (c0 === c1) {
        const block = new Uint8Array(8);
        const dv = new DataView(block.buffer);
        dv.setUint16(0, c0, true);
        dv.setUint16(2, c1, true);
        dv.setUint32(4, 0, true);
        return block;
    }

    const palette = [
        [maxR, maxG, maxB],
        [minR, minG, minB],
        [Math.round((2 * maxR + minR) / 3), Math.round((2 * maxG + minG) / 3), Math.round((2 * maxB + minB) / 3)],
        [Math.round((maxR + 2 * minR) / 3), Math.round((maxG + 2 * minG) / 3), Math.round((maxB + 2 * minB) / 3)]
    ];

    let indices = 0;
    for (let i = 0; i < 16; i++) {
        const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
        let bestDist = Infinity, bestIdx = 0;
        for (let j = 0; j < 4; j++) {
            const dr = r - palette[j][0], dg = g - palette[j][1], db = b - palette[j][2];
            const dist = dr * dr + dg * dg + db * db;
            if (dist < bestDist) { bestDist = dist; bestIdx = j; }
        }
        indices |= (bestIdx << (i * 2));
    }

    const block = new Uint8Array(8);
    const dv = new DataView(block.buffer);
    dv.setUint16(0, c0, true);
    dv.setUint16(2, c1, true);
    dv.setUint32(4, indices >>> 0, true);
    return block;
}

function compressDXT3Block(pixels) {
    const alphaBlock = new Uint8Array(8);
    for (let i = 0; i < 16; i++) {
        const alpha4 = pixels[i * 4 + 3] >> 4;
        const byteIdx = Math.floor(i / 2);
        if (i % 2 === 0) {
            alphaBlock[byteIdx] = alpha4;
        } else {
            alphaBlock[byteIdx] |= (alpha4 << 4);
        }
    }
    const colorBlock = compressDXT1Block(pixels);
    const result = new Uint8Array(16);
    result.set(alphaBlock, 0);
    result.set(colorBlock, 8);
    return result;
}

function compressDXT5Block(pixels) {
    let minA = 255, maxA = 0;
    for (let i = 0; i < 16; i++) {
        const a = pixels[i * 4 + 3];
        if (a < minA) minA = a;
        if (a > maxA) maxA = a;
    }

    const alphaBlock = new Uint8Array(8);
    alphaBlock[0] = maxA;
    alphaBlock[1] = minA;

    const alphaPalette = new Array(8);
    alphaPalette[0] = maxA;
    alphaPalette[1] = minA;
    if (maxA > minA) {
        for (let i = 1; i <= 6; i++) {
            alphaPalette[i + 1] = Math.round(((7 - i) * maxA + i * minA) / 7);
        }
    } else {
        for (let i = 1; i <= 4; i++) {
            alphaPalette[i + 1] = Math.round(((5 - i) * maxA + i * minA) / 5);
        }
        alphaPalette[6] = 0;
        alphaPalette[7] = 255;
    }

    let alphaBits = BigInt(0);
    for (let i = 0; i < 16; i++) {
        const a = pixels[i * 4 + 3];
        let bestDist = Infinity, bestIdx = 0;
        for (let j = 0; j < 8; j++) {
            const dist = Math.abs(a - alphaPalette[j]);
            if (dist < bestDist) { bestDist = dist; bestIdx = j; }
        }
        alphaBits |= (BigInt(bestIdx) << BigInt(i * 3));
    }

    for (let i = 0; i < 6; i++) {
        alphaBlock[2 + i] = Number((alphaBits >> BigInt(i * 8)) & BigInt(0xFF));
    }

    const colorBlock = compressDXT1Block(pixels);
    const result = new Uint8Array(16);
    result.set(alphaBlock, 0);
    result.set(colorBlock, 8);
    return result;
}

function compressDXT(rgbaPixels, width, height, format) {
    const blocksX = Math.max(1, Math.ceil(width / 4));
    const blocksY = Math.max(1, Math.ceil(height / 4));
    const blockSize = (format === 'DXT1') ? 8 : 16;
    const output = new Uint8Array(blocksX * blocksY * blockSize);

    let outOffset = 0;
    for (let by = 0; by < blocksY; by++) {
        for (let bx = 0; bx < blocksX; bx++) {
            const blockPixels = new Uint8Array(64);
            for (let py = 0; py < 4; py++) {
                for (let px = 0; px < 4; px++) {
                    const srcX = Math.min(bx * 4 + px, width - 1);
                    const srcY = Math.min(by * 4 + py, height - 1);
                    const srcIdx = (srcY * width + srcX) * 4;
                    const dstIdx = (py * 4 + px) * 4;
                    blockPixels[dstIdx] = rgbaPixels[srcIdx];
                    blockPixels[dstIdx + 1] = rgbaPixels[srcIdx + 1];
                    blockPixels[dstIdx + 2] = rgbaPixels[srcIdx + 2];
                    blockPixels[dstIdx + 3] = rgbaPixels[srcIdx + 3];
                }
            }

            let block;
            switch (format) {
                case 'DXT1': block = compressDXT1Block(blockPixels); break;
                case 'DXT3': block = compressDXT3Block(blockPixels); break;
                case 'DXT5': block = compressDXT5Block(blockPixels); break;
                default: throw new Error('Unknown DXT format: ' + format);
            }

            output.set(block, outOffset);
            outOffset += blockSize;
        }
    }
    return output;
}

// ============================================================================
// Image Processing (Canvas API — replaces sharp)
// ============================================================================

function loadImage(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Failed to load image: ' + file.name));
        };
        img.src = url;
    });
}

function getImageRGBA(img, targetWidth, targetHeight) {
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
    return ctx.getImageData(0, 0, targetWidth, targetHeight).data;
}

function detectAlpha(img) {
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 255) return true;
    }
    return false;
}

function generateMipmapsCanvas(img, width, height, levels) {
    const mipmaps = [];
    let w = width, h = height;

    for (let i = 0; i < levels; i++) {
        const rgba = getImageRGBA(img, w, h);
        mipmaps.push({ data: new Uint8Array(rgba), width: w, height: h });
        w = Math.max(4, Math.floor(w / 2));
        h = Math.max(4, Math.floor(h / 2));
    }

    return mipmaps;
}

function nearestPowerOf2(n) {
    if (n <= 0) return 1;
    const lower = Math.pow(2, Math.floor(Math.log2(n)));
    const upper = lower * 2;
    return (n - lower < upper - n) ? lower : upper;
}

// ============================================================================
// TXD Builder Class (Browser)
// ============================================================================

class TXDBuilder {
    constructor() {
        this.textures = [];
        this.version = RW_VERSION_GTASA;
    }

    /**
     * Add a texture from an image File object
     * @param {File} file - Image file (PNG, JPG, etc.)
     * @param {Object} options
     */
    async addTexture(file, options = {}) {
        const {
            name = 'texture',
            alphaName = '',
            compression = 'auto',
            generateMipmaps = true,
            maxMipmaps = 4,
            autoResize = true
        } = options;

        const img = await loadImage(file);
        let width = img.width;
        let height = img.height;
        const hasAlpha = detectAlpha(img);

        if (autoResize) {
            width = nearestPowerOf2(width);
            height = nearestPowerOf2(height);
        }

        width = Math.min(Math.max(width, 4), 2048);
        height = Math.min(Math.max(height, 4), 2048);

        let format = compression;
        if (format === 'auto') {
            format = hasAlpha ? 'DXT3' : 'DXT1';
        }

        let mipCount = 1;
        let mipmaps;
        if (generateMipmaps && width >= 8 && height >= 8) {
            mipCount = Math.max(1, Math.min(maxMipmaps, Math.floor(Math.log2(Math.min(width, height))) - 1));
            mipmaps = generateMipmapsCanvas(img, width, height, mipCount);
        } else {
            const rgba = getImageRGBA(img, width, height);
            mipmaps = [{ data: new Uint8Array(rgba), width, height }];
        }

        let compressedMipmaps;
        let d3dFormat, depth, texCodeType;

        if (format === 'RGBA') {
            d3dFormat = D3DFMT_A8R8G8B8;
            depth = 32;
            texCodeType = 0;
            compressedMipmaps = mipmaps.map(mip => {
                const bgra = new Uint8Array(mip.data.length);
                for (let i = 0; i < mip.data.length; i += 4) {
                    bgra[i] = mip.data[i + 2];
                    bgra[i + 1] = mip.data[i + 1];
                    bgra[i + 2] = mip.data[i];
                    bgra[i + 3] = mip.data[i + 3];
                }
                return { data: bgra, width: mip.width, height: mip.height };
            });
        } else {
            switch (format) {
                case 'DXT1': d3dFormat = D3DFMT_DXT1; depth = 16; texCodeType = 4; break;
                case 'DXT3': d3dFormat = D3DFMT_DXT3; depth = 16; texCodeType = 4; break;
                case 'DXT5': d3dFormat = D3DFMT_DXT5; depth = 16; texCodeType = 4; break;
            }
            compressedMipmaps = mipmaps.map(mip => ({
                data: compressDXT(mip.data, mip.width, mip.height, format),
                width: mip.width,
                height: mip.height
            }));
        }

        this.textures.push({
            name: name.substring(0, 31),
            alphaName: alphaName.substring(0, 31),
            format,
            d3dFormat,
            width,
            height,
            depth,
            mipCount,
            texCodeType,
            hasAlpha,
            mipmaps: compressedMipmaps
        });

        return {
            name,
            width,
            height,
            format,
            mipCount,
            hasAlpha,
            originalWidth: img.width,
            originalHeight: img.height
        };
    }

    /**
     * Build the TXD binary
     * @returns {Uint8Array}
     */
    build() {
        // Pre-calculate sizes
        const textureBuffers = this.textures.map(tex => this._buildTextureNative(tex));

        const structDataSize = 4;
        let totalTextureSize = 0;
        for (const buf of textureBuffers) totalTextureSize += buf.length;
        const extensionHeaderSize = 12;
        const rootDataSize = 12 + structDataSize + totalTextureSize + extensionHeaderSize;

        const writer = new BinaryWriter();

        // Root TXD header
        writeChunkHeader(writer, CHUNK_TEXDICTIONARY, rootDataSize, this.version);

        // Struct chunk
        writeChunkHeader(writer, CHUNK_STRUCT, structDataSize, this.version);
        writer.writeUint16(this.textures.length);
        writer.writeUint16(2); // device ID

        // Texture chunks
        for (const buf of textureBuffers) {
            writer.writeBytes(buf);
        }

        // Root extension
        writeChunkHeader(writer, CHUNK_EXTENSION, 0, this.version);

        return writer.toUint8Array();
    }

    _buildTextureNative(tex) {
        const dataWriter = new BinaryWriter();

        // Platform
        dataWriter.writeUint32(PLATFORM_D3D9);
        // Filter flags
        dataWriter.writeUint32(DEFAULT_FILTER_FLAGS);
        // Texture name
        dataWriter.writeString32(tex.name);
        // Alpha name
        dataWriter.writeString32(tex.alphaName);
        // Alpha flags
        dataWriter.writeUint32(tex.hasAlpha ? 0x0300 : 0x0200);
        // D3D format
        dataWriter.writeUint32(tex.d3dFormat);
        // Width & height
        dataWriter.writeUint16(tex.width);
        dataWriter.writeUint16(tex.height);
        // Depth, mipcount, texcode, flags
        dataWriter.writeUint8(tex.depth);
        dataWriter.writeUint8(tex.mipCount);
        dataWriter.writeUint8(tex.texCodeType);
        dataWriter.writeUint8(tex.hasAlpha ? (FLAG_HASALPHA | FLAG_ISCUBE) : FLAG_ISCUBE);

        // Raster data per mipmap
        for (const mip of tex.mipmaps) {
            dataWriter.writeUint32(mip.data.length);
            dataWriter.writeBytes(mip.data);
        }

        const nativeData = dataWriter.toUint8Array();
        const innerStructSize = nativeData.length;

        // Texture native chunk = header + inner_struct_header + data + extension_header
        const texNativeDataSize = 12 + innerStructSize + 12;

        const chunkWriter = new BinaryWriter();
        writeChunkHeader(chunkWriter, CHUNK_TEXTURENATIVE, texNativeDataSize, this.version);
        writeChunkHeader(chunkWriter, CHUNK_STRUCT, innerStructSize, this.version);
        chunkWriter.writeBytes(nativeData);
        writeChunkHeader(chunkWriter, CHUNK_EXTENSION, 0, this.version);

        return chunkWriter.toUint8Array();
    }
}

// Export for use in app.js
window.TXDBuilder = TXDBuilder;
window.nearestPowerOf2 = nearestPowerOf2;
window.detectAlpha = detectAlpha;
