// === CONFIGURATION ===
export const CONFIG = {
    STARTING_MONEY: 200000,
    GRID_W: 40, GRID_H: 50, CELL_SIZE: 24, // Made cells slightly smaller to fit wider grid
    LOBBY_FLOOR: 25, 
    
    // REVENUE
    OFFICE_RENT: 400,
    HOTEL_RENT: 250,
    FOOD_INCOME_PER: 30,
    CONDO_SALE: 30000,
    PARKING_INCOME: 100,
    
    MAX_WAIT: 600
};

export const TYPES = {
    EMPTY: 0, LOBBY: 1, OFFICE: 2, CONDO: 3, HOTEL: 4,
    FOOD: 5, PARKING: 6, STAIRS: 7, ELEVATOR: 8,
    TAKEN: 99 // Placeholder for the extra tiles of a wide room
};

// Define Size and Cost here
export const ROOM_PROPS = {
    [TYPES.OFFICE]:   { w: 2, cost: 8000 },
    [TYPES.CONDO]:    { w: 4, cost: 15000 },
    [TYPES.HOTEL]:    { w: 2, cost: 12000 },
    [TYPES.FOOD]:     { w: 3, cost: 10000 },
    [TYPES.PARKING]:  { w: 1, cost: 5000 },
    [TYPES.STAIRS]:   { w: 1, cost: 1000 },
    [TYPES.ELEVATOR]: { w: 1, cost: 5000 },
    [TYPES.LOBBY]:    { w: 1, cost: 0 },
    [TYPES.EMPTY]:    { w: 1, cost: 0 }
};

// === AUDIO SYSTEM ===
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export function beep(freq = 600, dur = 50, type = 'square') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.frequency.value = freq;
    o.type = type;
    o.start();
    g.gain.setValueAtTime(0.05, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur/1000);
    o.stop(audioCtx.currentTime + dur/1000);
}

export class TowerEngine {
    constructor() {
        this.money = CONFIG.STARTING_MONEY;
        this.time = 8 * 60; 
        this.day = 1;
        this.speed = 1;
        this.rating = 1;
        this.paused = false;
    }

    update(dt) {
        if (this.paused) return false;
        const scaled = dt * this.speed;
        this.time += 0.5 * (scaled / 16);

        if (this.time >= 24 * 60) {
            this.time -= 24 * 60;
            this.day++;
            return true; 
        }
        return false;
    }

    getFormattedTime() {
        const h = Math.floor(this.time / 60).toString().padStart(2, '0');
        const m = Math.floor(this.time % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    }

    isNight() {
        const h = this.time / 60;
        return h < 6 || h > 20;
    }

    setSpeed() {
        this.speed = this.speed % 4 + 1;
        return this.speed;
    }
}
