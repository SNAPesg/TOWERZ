import { CONFIG, TYPES, ROOM_PROPS, beep } from './Engine.js';
import { SPRITE_DATA, PALETTE } from './Assets.js';

export class GridManager {
    constructor() {
        this.grid = Array(CONFIG.GRID_H).fill().map(() => 
            Array(CONFIG.GRID_W).fill().map(() => ({
                type: TYPES.EMPTY, connected: false, occupants: [], dirt: 0, stress: 0, 
                isAnchor: false, width: 1 
            }))
        );
        this.bgCanvas = document.createElement('canvas');
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.dirty = true;
        this.sprites = {};
        this.generateAllSprites();
        
        for (let x = 0; x < CONFIG.GRID_W; x++) {
            this.grid[CONFIG.LOBBY_FLOOR][x] = { type: TYPES.LOBBY, connected: true, occupants: [], isAnchor: true, width: 1 };
        }
    }

    // [ADDED] Missing method
    updateDirt() {
        // Placeholder for dirt logic accumulation
    }

    // [ADDED] Missing method
    updateStress() {
        // Placeholder for stress logic
    }

    generateAllSprites() {
        try {
            Object.keys(SPRITE_DATA).forEach(key => {
                if (TYPES[key]) {
                    this.sprites[TYPES[key]] = this.csvToCanvas(SPRITE_DATA[key]);
                }
            });
            this.sprites[TYPES.ELEVATOR_EXPRESS] = this.sprites[TYPES.ELEVATOR];
        } catch (e) { console.error("Sprite Error:", e); }
    }

    csvToCanvas(csvString) {
        if (!csvString) return null;
        const rows = csvString.trim().split('\n').map(r => r.trim()).filter(r => r.length > 0);
        const height = rows.length;
        const width = rows[0].split(',').length;
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        const ctx = canvas.getContext('2d');
        for (let y = 0; y < height; y++) {
            const cols = rows[y].split(',');
            for (let x = 0; x < width; x++) {
                const colorCode = cols[x].trim();
                if (PALETTE[colorCode]) {
                    ctx.fillStyle = PALETTE[colorCode];
                    ctx.fillRect(x, y, 1, 1);
                }
            }
        }
        return canvas;
    }

    initCanvas(w, h) { this.bgCanvas.width = w; this.bgCanvas.height = h; this.dirty = true; }

    canBuild(x, y, type) {
        if (!ROOM_PROPS[type]) return false;
        const width = ROOM_PROPS[type].w;
        if (x + width > CONFIG.GRID_W) return false; 
        const isUnderground = y > CONFIG.LOBBY_FLOOR;
        if ((type === TYPES.PARKING || type === TYPES.METRO) && !isUnderground) return false;
        if ((type === TYPES.OFFICE || type === TYPES.CONDO) && isUnderground) return false;
        for (let i = 0; i < width; i++) {
            if (this.grid[y][x + i].type !== TYPES.EMPTY) return false;
        }
        return true;
    }

    build(x, y, type) {
        if (!this.canBuild(x, y, type)) return false;
        const width = ROOM_PROPS[type].w;
        this.grid[y][x] = { type, connected: false, occupants: [], dirt: 0, stress: 0, isAnchor: true, width, masterX: x };
        for (let i = 1; i < width; i++) {
            this.grid[y][x + i] = { type: TYPES.TAKEN, connected: false, occupants: [], isAnchor: false, masterX: x };
        }
        this.dirty = true; beep(500, 60); return true;
    }

    demolish(x, y) {
        const cell = this.grid[y][x];
        if (cell.type === TYPES.LOBBY || cell.type === TYPES.EMPTY) return false;
        const ax = cell.isAnchor ? x : cell.masterX;
        const width = this.grid[y][ax].width;
        for (let i = 0; i < width; i++) {
            this.grid[y][ax + i] = { type: TYPES.EMPTY, connected: false, occupants: [], isAnchor: false };
        }
        this.dirty = true; return true;
    }

    checkConnectivity() {
        for (let y = 0; y < CONFIG.GRID_H; y++)
            for (let x = 0; x < CONFIG.GRID_W; x++)
                this.grid[y][x].connected = (y === CONFIG.LOBBY_FLOOR);

        const queue = [];
        const visited = new Set();
        for (let x = 0; x < CONFIG.GRID_W; x++) queue.push({x, y: CONFIG.LOBBY_FLOOR});
        while (queue.length) {
            const {x, y} = queue.shift();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            this.grid[y][x].connected = true;
            [[0,1],[0,-1],[1,0],[-1,0]].forEach(([dx, dy]) => {
                const nx = x + dx, ny = y + dy;
                if (nx >= 0 && nx < CONFIG.GRID_W && ny >= 0 && ny < CONFIG.GRID_H) {
                    if (this.grid[ny][nx].type !== TYPES.EMPTY) queue.push({x: nx, y: ny});
                }
            });
        }
    }

    draw(ctx, isNight) {
        if (this.dirty) this.redrawBackground();
        ctx.drawImage(this.bgCanvas, 0, 0);
    }

    redrawBackground() {
        const ctx = this.bgCtx;
        ctx.fillStyle = '#87CEEB'; ctx.fillRect(0, 0, this.bgCanvas.width, this.bgCanvas.height);
        ctx.fillStyle = '#3E2723'; ctx.fillRect(0, (CONFIG.LOBBY_FLOOR + 1) * CONFIG.CELL_SIZE, this.bgCanvas.width, 1000);
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const c = this.grid[y][x];
                if (c.isAnchor) this.drawRoom(ctx, x, y, c);
            }
        }
        this.dirty = false;
    }

    drawRoom(ctx, x, y, cell) {
        const cs = CONFIG.CELL_SIZE;
        const px = x * cs, py = y * cs, w = cell.width * cs;
        const sprite = this.sprites[cell.type];
        if (sprite) {
            ctx.drawImage(sprite, px, py);
        } else {
            // Infrastructure color fallbacks
            switch(cell.type) {
                case TYPES.SECURITY: ctx.fillStyle = '#1A237E'; break;
                case TYPES.METRO: ctx.fillStyle = '#212121'; break;
                case TYPES.LOBBY: ctx.fillStyle = '#BDBDBD'; break;
                case TYPES.ELEVATOR: ctx.fillStyle = '#444'; break;
                default: ctx.fillStyle = '#616161';
            }
            ctx.fillRect(px + 1, py + 1, w - 2, cs - 2);
        }
        if (!cell.connected && cell.type !== TYPES.LOBBY) {
            ctx.strokeStyle = 'red'; ctx.strokeRect(px + 2, py + 2, w - 4, cs - 4);
        }
    }
}
