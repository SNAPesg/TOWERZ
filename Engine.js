export const CONFIG = {
    STARTING_MONEY: 2000000,
    GRID_W: 40, 
    GRID_H: 50, 
    CELL_SIZE: 24, 
    LOBBY_FLOOR: 25, 
    OFFICE_RENT: 300,
    HOTEL_RENT: 500,
    CONDO_RENT: 0,
    CONDO_SALE: 150000,
    FOOD_INCOME_PER: 25,
    PARKING_INCOME: 50,
    CINEMA_INCOME_PER: 40,
    MAX_WAIT: 1200 
};

export const TYPES = {
    EMPTY: 0, LOBBY: 1, OFFICE: 2, CONDO: 3, HOTEL: 4,
    FOOD: 5, PARKING: 6, STAIRS: 7, ELEVATOR: 8,
    CLEANING_SERVICE: 9, 
    CINEMA: 11,      
    CATHEDRAL: 12,   
    TAKEN: 99,
    ELEVATOR_EXPRESS: 10,
    SECURITY: 13,
    METRO: 14,
    // [ADDED] Missing types referenced in GridManager/SystemsManager
    SKY_LOBBY: 15,
    MEDICAL: 16,
    RECYCLING: 17,
    HOTEL_SUITE: 18
};

export const ROOM_PROPS = {
    [TYPES.OFFICE]:   { w: 2, cost: 40000 },
    [TYPES.CONDO]:    { w: 4, cost: 80000 },
    [TYPES.HOTEL]:    { w: 2, cost: 20000 },
    [TYPES.FOOD]:     { w: 3, cost: 100000 },
    [TYPES.PARKING]:  { w: 1, cost: 2000 },
    [TYPES.STAIRS]:   { w: 1, cost: 500 },
    [TYPES.ELEVATOR]: { w: 1, cost: 3000 },
    [TYPES.ELEVATOR_EXPRESS]: { w: 1, cost: 10000 },
    [TYPES.CLEANING_SERVICE]: { w: 2, cost: 5000 }, 
    [TYPES.CINEMA]:   { w: 6, cost: 15000 },
    [TYPES.CATHEDRAL]:{ w: 4, cost: 50000 },
    [TYPES.SECURITY]: { w: 2, cost: 10000 },
    [TYPES.METRO]:    { w: 4, cost: 500000 },
    [TYPES.LOBBY]:    { w: 1, cost: 0 },
    [TYPES.SKY_LOBBY]:{ w: 2, cost: 10000 }, // Added
    [TYPES.EMPTY]:    { w: 1, cost: 0 }
};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
export function beep(freq = 600, dur = 50, type = 'square') {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.frequency.value = freq;
    o.type = type;
    g.gain.value = 0.5;
    o.start();
    g.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + dur / 1000);
    o.stop(audioCtx.currentTime + dur / 1000);
}

export class TowerEngine {
    constructor() {
        this.money = CONFIG.STARTING_MONEY;
        this.time = 6 * 60; // Start at 06:00
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
        this.speed = this.speed >= 10 ? 1 : (this.speed === 1 ? 4 : 10);
        return this.speed;
    }

    togglePause() {
        this.paused = !this.paused;
        return this.paused;
    }

    updateRating(stats) {
        let newRating = 1;
        if (stats.pop > 300 && stats.hasElevator) {
            newRating = 2;
            if (stats.pop > 1000 && stats.hasSecurity && stats.hasFood) {
                newRating = 3;
                if (stats.pop > 5000 && stats.vipGood) {
                    newRating = 4;
                    if (stats.pop > 10000 && stats.hasMetro) {
                        newRating = 5;
                        if (stats.pop > 15000 && stats.hasCathedral) {
                            newRating = 6; 
                        }
                    }
                }
            }
        }
        this.rating = newRating;
    }
}
