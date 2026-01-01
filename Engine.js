export const CONFIG = {
    STARTING_MONEY: 2000000,
    GRID_W: 40, 
    GRID_H: 50, 
    CELL_SIZE: 24, 
    LOBBY_FLOOR: 25, 
    OFFICE_RENT: 300,
    HOTEL_RENT: 500,
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
    ELEVATOR_EXPRESS: 10,
    CINEMA: 11,      
    CATHEDRAL: 12,   
    SECURITY: 13,
    METRO: 14,
    SKY_LOBBY: 15,
    MEDICAL: 16,     // New
    RECYCLING: 17,   // New
    HOTEL_SUITE: 18,
    ELEVATOR_SERVICE: 19, // New
    TAKEN: 99,
};

export const ROOM_PROPS = {
    [TYPES.OFFICE]:   { w: 2, cost: 40000 },
    [TYPES.CONDO]:    { w: 4, cost: 80000 },
    [TYPES.HOTEL]:    { w: 2, cost: 20000 },
    [TYPES.FOOD]:     { w: 3, cost: 100000 },
    [TYPES.PARKING]:  { w: 1, cost: 2000 },
    [TYPES.STAIRS]:   { w: 1, cost: 500 },
    [TYPES.CLEANING_SERVICE]: { w: 2, cost: 5000 }, 
    [TYPES.CINEMA]:   { w: 6, cost: 15000 },
    [TYPES.CATHEDRAL]:{ w: 4, cost: 50000 },
    [TYPES.SECURITY]: { w: 2, cost: 10000 },
    [TYPES.METRO]:    { w: 4, cost: 500000 },
    [TYPES.LOBBY]:    { w: 1, cost: 0 },
    [TYPES.SKY_LOBBY]:{ w: 2, cost: 10000 },
    [TYPES.MEDICAL]:  { w: 3, cost: 250000 },
    [TYPES.RECYCLING]:{ w: 2, cost: 120000 },
    [TYPES.EMPTY]:    { w: 1, cost: 0 },

    // Elevator types with specific properties
    [TYPES.ELEVATOR]: {
        w: 1, cost: 3000,
        elevatorType: 'STANDARD', speed: 0.2, capacity: 8
    },
    [TYPES.ELEVATOR_EXPRESS]: {
        w: 1, cost: 10000,
        elevatorType: 'EXPRESS', speed: 0.4, capacity: 12
    },
    [TYPES.ELEVATOR_SERVICE]: {
        w: 1, cost: 4000,
        elevatorType: 'SERVICE', speed: 0.15, capacity: 10
    }
};

export const STAR_LEVELS = {
    1: { pop: 0, unlocks: [TYPES.LOBBY, TYPES.OFFICE, TYPES.CONDO, TYPES.FOOD, TYPES.STAIRS, TYPES.ELEVATOR] },
    2: { pop: 300, unlocks: [TYPES.HOTEL, TYPES.CLEANING_SERVICE, TYPES.SECURITY, TYPES.ELEVATOR_SERVICE] },
    3: { pop: 1000, unlocks: [TYPES.ELEVATOR_EXPRESS, TYPES.SKY_LOBBY, TYPES.CINEMA, TYPES.PARKING, TYPES.MEDICAL, TYPES.RECYCLING] },
    4: { pop: 5000, unlocks: [TYPES.METRO], specialReqs: ['vip', 'parking', 'medical', 'recycling'] },
    5: { pop: 10000, unlocks: [TYPES.CATHEDRAL], specialReqs: ['metro'] }
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
        this.time = 6 * 60;
        this.day = 1;
        this.speed = 1;
        this.rating = 1; // Star rating
        this.paused = false;
        this.buildable = new Set(STAR_LEVELS[1].unlocks);
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
        for (let i = 5; i > 1; i--) {
            const level = STAR_LEVELS[i];
            if (stats.pop >= level.pop) {

                // Check special requirements
                let allReqsMet = true;
                if (level.specialReqs) {
                    if (level.specialReqs.includes('vip') && !stats.vipGood) allReqsMet = false;
                    if (level.specialReqs.includes('metro') && !stats.hasMetro) allReqsMet = false;
                    if (level.specialReqs.includes('parking') && !stats.hasParking) allReqsMet = false;
                    if (level.specialReqs.includes('medical') && !stats.hasMedical) allReqsMet = false;
                    if (level.specialReqs.includes('recycling') && !stats.hasRecycling) allReqsMet = false;
                }

                if (allReqsMet) {
                    newRating = i;
                    break;
                }
            }
        }

        // Check for rating loss
        if (this.rating > 1 && stats.pop < STAR_LEVELS[this.rating].pop) {
            // Simple derank, could be more complex
            newRating = Math.max(1, this.rating - 1);
        }

        if (newRating !== this.rating) {
            this.rating = newRating;
            this.updateBuildableTypes();
            beep(1500, 150, 'sawtooth');
        }
    }

    updateBuildableTypes() {
        this.buildable.clear();
        for (let i = 1; i <= this.rating; i++) {
            STAR_LEVELS[i].unlocks.forEach(type => this.buildable.add(type));
        }
    }
}
