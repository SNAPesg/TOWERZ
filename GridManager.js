import { CONFIG, TYPES, ROOM_PROPS, beep } from './Engine.js';

export class GridManager {
    constructor() {
        this.grid = Array(CONFIG.GRID_H).fill().map(() => 
            Array(CONFIG.GRID_W).fill().map(() => ({
                type: TYPES.EMPTY, connected: false, occupants: [], dirt: 0, stress: 0, 
                isAnchor: false, width: 1 // Track if this is the start of a room
            }))
        );
        this.bgCanvas = document.createElement('canvas');
        this.bgCtx = this.bgCanvas.getContext('2d');
        this.dirty = true;
        
        for (let x = 0; x < CONFIG.GRID_W; x++) {
            this.grid[CONFIG.LOBBY_FLOOR][x] = { type: TYPES.LOBBY, connected: true, occupants: [], isAnchor: true, width: 1 };
        }
    }

    initCanvas(w, h) {
        this.bgCanvas.width = w;
        this.bgCanvas.height = h;
        this.dirty = true;
    }

    getCell(x, y) {
        if (x < 0 || x >= CONFIG.GRID_W || y < 0 || y >= CONFIG.GRID_H) return null;
        return this.grid[y][x];
    }

    // New Multi-Tile Build Logic
    canBuild(x, y, type) {
        const width = ROOM_PROPS[type].w;
        // Check bounds
        if (x + width > CONFIG.GRID_W) return false;
        
        // Check if all needed cells are empty (or Lobby overrides)
        const isTransport = type === TYPES.ELEVATOR || type === TYPES.STAIRS;
        
        for (let i = 0; i < width; i++) {
            const cell = this.getCell(x + i, y);
            const isLobby = cell.type === TYPES.LOBBY;
            
            if (cell.type !== TYPES.EMPTY && !(isLobby && isTransport)) {
                return false;
            }
        }
        return true;
    }

    build(x, y, type) {
        if (!this.canBuild(x, y, type)) return false;

        const width = ROOM_PROPS[type].w;

        // Set the Anchor (The main logic cell)
        this.grid[y][x] = { 
            type: type, connected: false, occupants: [], dirt: 0, stress: 0, 
            isAnchor: true, width: width, masterX: x // masterX points to self
        };

        // Set the "Taken" cells (The rest of the width)
        for (let i = 1; i < width; i++) {
            this.grid[y][x + i] = { 
                type: TYPES.TAKEN, connected: false, occupants: [], 
                isAnchor: false, masterX: x // Points back to anchor
            };
        }

        this.dirty = true;
        beep(500, 60);
        return true;
    }

    demolish(x, y) {
        const cell = this.grid[y][x];
        if (cell.type === TYPES.LOBBY || cell.type === TYPES.EMPTY) return false;

        let anchorX = x;
        if (!cell.isAnchor && cell.masterX !== undefined) {
            anchorX = cell.masterX;
        }
        
        const anchor = this.grid[y][anchorX];
        if (!anchor) return false; // Safety

        // Clear all cells this room occupied
        const width = anchor.width || 1;
        for (let i = 0; i < width; i++) {
            this.grid[y][anchorX + i] = { type: TYPES.EMPTY, connected: false, occupants: [], isAnchor: false };
        }
        
        this.dirty = true;
        return true;
    }

    makeRandomDirty() {
        // ... (Logic mostly same, simplified for anchor check)
        // Only target anchors to avoid double dirt
        for(let i=0; i<10; i++) {
            const rx = Math.floor(Math.random() * CONFIG.GRID_W);
            const ry = Math.floor(Math.random() * CONFIG.GRID_H);
            const c = this.grid[ry][rx];
            if (c.isAnchor && (c.type === TYPES.OFFICE || c.type === TYPES.HOTEL || c.type === TYPES.FOOD)) {
                c.dirt = Math.min((c.dirt || 0) + 20, 100);
                this.dirty = true;
                return true;
            }
        }
        return false;
    }

    cleanRoom(x, y) {
        const cell = this.getCell(x, y);
        let target = cell;
        
        // Redirect to anchor if clicking on a wide room part
        if (cell.type === TYPES.TAKEN && cell.masterX !== undefined) {
            target = this.grid[y][cell.masterX];
        }

        if(target && target.dirt > 0) {
            target.dirt = 0;
            this.dirty = true;
            return true;
        }
        return false;
    }

    checkConnectivity() {
        // Reset
        for (let y = 0; y < CONFIG.GRID_H; y++)
            for (let x = 0; x < CONFIG.GRID_W; x++)
                this.grid[y][x].connected = (y === CONFIG.LOBBY_FLOOR);

        // BFS
        const queue = [];
        for (let x = 0; x < CONFIG.GRID_W; x++) queue.push({x, y: CONFIG.LOBBY_FLOOR});
        const visited = new Set();

        while (queue.length) {
            const {x, y} = queue.shift();
            const key = `${x},${y}`;
            if (visited.has(key)) continue;
            visited.add(key);
            
            const cell = this.grid[y][x];
            cell.connected = true;
            
            // If this is a taken cell, ensure anchor is connected too
            if (cell.type === TYPES.TAKEN && cell.masterX !== undefined) {
                 this.grid[y][cell.masterX].connected = true;
            }
            // If this is anchor, ensure parts are connected
            if (cell.isAnchor) {
                 for(let i=1; i<cell.width; i++) this.grid[y][x+i].connected = true;
            }

            // Horizontal
            if (x > 0 && this.grid[y][x-1].type !== TYPES.EMPTY) queue.push({x: x-1, y});
            if (x < CONFIG.GRID_W-1 && this.grid[y][x+1].type !== TYPES.EMPTY) queue.push({x: x+1, y});

            // Vertical
            const realType = cell.type === TYPES.TAKEN ? this.grid[y][cell.masterX].type : cell.type;
            if (realType === TYPES.ELEVATOR || realType === TYPES.STAIRS) {
                if (y > 0) {
                    const upCell = this.grid[y-1][x];
                    const upType = upCell.type === TYPES.TAKEN ? this.grid[y-1][upCell.masterX].type : upCell.type;
                    if (upType === realType) queue.push({x, y: y-1});
                }
                if (y < CONFIG.GRID_H-1) {
                    const downCell = this.grid[y+1][x];
                    const downType = downCell.type === TYPES.TAKEN ? this.grid[y+1][downCell.masterX].type : downCell.type;
                    if (downType === realType) queue.push({x, y: y+1});
                }
            }
        }
    }

    draw(ctx, isNight) {
        if (this.dirty) this.redrawBackground();
        ctx.drawImage(this.bgCanvas, 0, 0);
        this.drawOverlays(ctx, isNight);
    }

    drawOverlays(ctx, isNight) {
        const cs = CONFIG.CELL_SIZE;
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const cell = this.grid[y][x];
                if (!cell.isAnchor) continue; // Only draw on anchors

                const px = x * cs;
                const py = y * cs;
                const w = cell.width * cs;

                // Night Lights
                if (isNight && (cell.type === TYPES.OFFICE || cell.type === TYPES.HOTEL || cell.type === TYPES.CONDO)) {
                    if ((x + y + Date.now()/1000) % 10 > 3) { 
                        ctx.fillStyle = 'rgba(255, 235, 59, 0.3)';
                        ctx.fillRect(px + 4, py + 4, w - 8, cs - 8);
                    }
                }

                // Status Icons
                if (cell.stress > 50) { ctx.font = '12px Arial'; ctx.fillText('😡', px + w/2 - 6, py + 18); }
                if (cell.dirt > 50) { ctx.fillStyle = `rgba(60, 40, 0, ${cell.dirt/200})`; ctx.fillRect(px, py, w, cs); }
            }
        }
    }

    redrawBackground() {
        const ctx = this.bgCtx;
        const w = this.bgCanvas.width;
        const h = this.bgCanvas.height;

        // Background
        const skyGrad = ctx.createLinearGradient(0, 0, 0, h);
        skyGrad.addColorStop(0, '#87CEEB'); skyGrad.addColorStop(1, '#E0F7FA');
        ctx.fillStyle = skyGrad; ctx.fillRect(0, 0, w, h);
        
        const groundY = CONFIG.LOBBY_FLOOR * CONFIG.CELL_SIZE;
        ctx.fillStyle = '#3E2723'; ctx.fillRect(0, groundY + CONFIG.CELL_SIZE, w, h);

        // Draw Rooms (Only draw on Anchor)
        for (let y = 0; y < CONFIG.GRID_H; y++) {
            for (let x = 0; x < CONFIG.GRID_W; x++) {
                const c = this.grid[y][x];
                if (c.isAnchor && c.type !== TYPES.EMPTY) {
                    this.drawRoom(ctx, x, y, c);
                }
            }
        }
        this.dirty = false;
    }

    drawRoom(ctx, x, y, cell) {
        const cs = CONFIG.CELL_SIZE;
        const px = x * cs;
        const py = y * cs;
        const width = (cell.width || 1) * cs;

        ctx.save();
        
        // 1. Background Fill
        switch(cell.type) {
            case TYPES.OFFICE: ctx.fillStyle = '#E3F2FD'; break;
            case TYPES.HOTEL: ctx.fillStyle = '#E1BEE7'; break;
            case TYPES.CONDO: ctx.fillStyle = '#FFECB3'; break;
            case TYPES.FOOD: ctx.fillStyle = '#FFF9C4'; break;
            case TYPES.LOBBY: ctx.fillStyle = '#D7CCC8'; break;
            case TYPES.PARKING: ctx.fillStyle = '#546E7A'; break;
            case TYPES.ELEVATOR: ctx.fillStyle = '#424242'; break;
            case TYPES.STAIRS: ctx.fillStyle = '#8D6E63'; break;
            default: ctx.fillStyle = '#FFF';
        }
        ctx.fillRect(px, py, width, cs);

        // 2. Interiors (Procedural Detail)
        
        // OFFICE (2 Wide): [ Desk area ] [ Meeting area ]
        if(cell.type === TYPES.OFFICE) {
            // Divider
            ctx.fillStyle = '#90A4AE'; ctx.fillRect(px + width/2, py+4, 2, cs-4);
            // Desk 1
            ctx.fillStyle = '#795548'; ctx.fillRect(px+4, py+14, 12, 6);
            ctx.fillStyle = '#FFF'; ctx.fillRect(px+6, py+12, 4, 3); // Paper
            // Desk 2
            ctx.fillStyle = '#795548'; ctx.fillRect(px+width/2+4, py+14, 12, 6);
        }

        // CONDO (4 Wide): [ Bed ] [ Bath ] [ Living ] [ Kitchen ]
        if(cell.type === TYPES.CONDO) {
            // Walls
            ctx.fillStyle = '#BCAAA4'; 
            ctx.fillRect(px + cs, py, 2, cs);
            ctx.fillRect(px + cs*3, py, 2, cs);
            
            // Bed
            ctx.fillStyle = '#5D4037'; ctx.fillRect(px+4, py+12, 14, 8);
            ctx.fillStyle = '#FFF'; ctx.fillRect(px+4, py+13, 4, 6);
            
            // TV
            ctx.fillStyle = '#000'; ctx.fillRect(px + cs*2 + 4, py+8, 12, 8);
            
            // Kitchen Counter
            ctx.fillStyle = '#EEE'; ctx.fillRect(px + cs*3 + 2, py+14, 18, 8);
        }

        // HOTEL (2 Wide): [ Bath ] [ Bed ]
        if(cell.type === TYPES.HOTEL) {
            ctx.fillStyle = '#BA68C8'; ctx.fillRect(px + cs + 4, py+12, 14, 8); // Bed
            ctx.fillStyle = '#FFF'; ctx.fillRect(px + cs + 4, py+13, 4, 6); // Pillow
            
            // Door
            ctx.fillStyle = '#5D4037'; ctx.fillRect(px+2, py+4, 8, cs-4);
        }

        // FOOD (3 Wide): [ Kitchen ] [ Tables ]
        if(cell.type === TYPES.FOOD) {
            // Counter
            ctx.fillStyle = '#E0E0E0'; ctx.fillRect(px, py+12, cs, cs-12);
            ctx.fillStyle = '#FF5722'; ctx.fillRect(px+2, py+8, cs-4, 4); // Heat lamps
            
            // Tables
            ctx.fillStyle = '#795548';
            ctx.fillRect(px + cs + 4, py+14, 12, 6);
            ctx.fillRect(px + cs*2 + 4, py+14, 12, 6);
        }

        // ELEVATOR
        if(cell.type === TYPES.ELEVATOR) {
            ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
            ctx.moveTo(px+width/2-4, py); ctx.lineTo(px+width/2-4, py+cs);
            ctx.moveTo(px+width/2+4, py); ctx.lineTo(px+width/2+4, py+cs);
            ctx.stroke();
        }

        // STAIRS
        if(cell.type === TYPES.STAIRS) {
            ctx.strokeStyle = '#D7CCC8'; ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(px, py+cs); ctx.lineTo(px+width, py);
            ctx.stroke();
        }

        // Warning X
        if (!cell.connected && cell.type !== TYPES.EMPTY && cell.type !== TYPES.LOBBY) {
            ctx.strokeStyle = 'red'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(px,py); ctx.lineTo(px+width,py+cs); 
            ctx.moveTo(px+width,py); ctx.lineTo(px,py+cs); ctx.stroke();
        }
        
        // Outline
        ctx.strokeStyle = 'rgba(0,0,0,0.1)';
        ctx.strokeRect(px, py, width, cs);
        ctx.restore();
    }
}
