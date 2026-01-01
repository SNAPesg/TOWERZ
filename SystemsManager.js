import { CONFIG, TYPES, beep } from './Engine.js';

class ElevatorCar {
    constructor(x) {
        this.x = x;
        this.y = CONFIG.LOBBY_FLOOR;
        this.targetY = CONFIG.LOBBY_FLOOR;
        this.passengers = [];
        this.upRequests = new Set();
        this.downRequests = new Set();
        this.direction = 0; 
        this.doorsOpen = false;
        this.doorTimer = 0;
    }

    addRequest(floor, goingUp) {
        if (goingUp) this.upRequests.add(floor);
        else this.downRequests.add(floor);
    }

    update(peopleList) {
        if (this.doorTimer > 0) {
            this.doorTimer--;
            if (this.doorTimer === 0) {
                this.doorsOpen = false;
            }
            return;
        }

        if (this.doorsOpen) {
            this.handlePassengers(peopleList);
        }

        // Determine next target
        if (this.direction === 1) { // Going up
            const nextUp = [...this.upRequests].filter(f => f > this.y).sort((a,b)=>a-b)[0];
            if (nextUp) {
                this.targetY = nextUp;
            } else {
                this.direction = -1; // Switch direction
            }
        }

        if (this.direction === -1) { // Going down
            const nextDown = [...this.downRequests].filter(f => f < this.y).sort((a,b)=>b-a)[0];
            if (nextDown) {
                this.targetY = nextDown;
            } else {
                this.direction = 1; // Switch direction
            }
        }

        if (this.direction === 0) { // Idle
             if (this.upRequests.size > 0) {
                 this.direction = 1;
             } else if (this.downRequests.size > 0) {
                 this.direction = -1;
             }
        }

        // Move towards target
        const diff = this.targetY - this.y;
        if (Math.abs(diff) > 0.1) {
            this.y += Math.sign(diff) * 0.2;
        } else if (this.targetY !== this.y) {
            this.y = this.targetY;
            this.doorsOpen = true;
            this.doorTimer = 50;
            this.upRequests.delete(this.y);
            this.downRequests.delete(this.y);
            beep(800, 50, 'sine');
        }
    }

    handlePassengers(peopleList) {
        this.passengers = this.passengers.filter(p => {
            if (Math.floor(p.targetY) === Math.floor(this.y)) {
                p.exitElevator(this.x, this.y);
                return false;
            }
            return true;
        });

        if (this.passengers.length < 15) {
            const candidates = peopleList.filter(p => 
                p.state === 'waiting' && 
                Math.abs(p.y - this.y) < 0.5 && 
                Math.abs(p.x - this.x) < 0.5
            );

            for (const p of candidates) {
                if (this.passengers.length >= 15) break;
                this.passengers.push(p);
                p.enterElevator(this);
                this.addRequest(Math.floor(p.targetY), p.targetY < this.y);
            }
        }
    }
}

export class SystemsManager {
    constructor() {
        this.elevators = [];
    }

    syncElevators(grid) {
        const shafts = new Set();
        for (let x = 0; x < CONFIG.GRID_W; x++) {
            let hasElevator = false;
            for(let y=0; y<CONFIG.GRID_H; y++) {
                if(grid[y][x].type === TYPES.ELEVATOR) { hasElevator = true; break; }
            }
            if (hasElevator) shafts.add(x);
        }
        this.elevators = this.elevators.filter(e => shafts.has(e.x));
        shafts.forEach(x => {
            if (!this.elevators.find(e => e.x === x)) this.elevators.push(new ElevatorCar(x));
        });
    }

    update(peopleList) {
        this.elevators.forEach(e => e.update(peopleList));
    }

    draw(ctx) {
        this.elevators.forEach(e => {
            const px = e.x * CONFIG.CELL_SIZE + 5;
            const py = e.y * CONFIG.CELL_SIZE + 5;
            
            ctx.fillStyle = '#222';
            ctx.fillRect(px, py, CONFIG.CELL_SIZE - 10, CONFIG.CELL_SIZE - 10);
            
            ctx.fillStyle = e.doorsOpen ? '#eee' : '#666';
            ctx.fillRect(px+1, py+1, CONFIG.CELL_SIZE - 12, CONFIG.CELL_SIZE - 12);

            if (e.direction !== 0) {
                ctx.fillStyle = '#0f0';
                ctx.beginPath();
                if (e.direction < 0) { 
                    ctx.moveTo(px + 9, py - 4); ctx.lineTo(px + 5, py); ctx.lineTo(px + 13, py);
                } else { 
                    ctx.moveTo(px + 9, py + CONFIG.CELL_SIZE - 6); ctx.lineTo(px + 5, py + CONFIG.CELL_SIZE - 10); ctx.lineTo(px + 13, py + CONFIG.CELL_SIZE - 10);
                }
                ctx.fill();
            }
        });
    }
}
