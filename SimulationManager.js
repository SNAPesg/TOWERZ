import { CONFIG, TYPES, beep } from './Engine.js';

class ElevatorCar {
    constructor(x, stopsAt = null) {
        this.x = x;
        this.y = CONFIG.LOBBY_FLOOR;
        this.passengers = [];
        this.requests = new Set(); 
        this.direction = 0; // 0: Idle, 1: Up, -1: Down
        this.doorsOpen = false;
        this.doorTimer = 0;
        this.stopsAt = stopsAt; 
    }

    canStopAt(floor) {
        if (!this.stopsAt) return true; 
        return this.stopsAt.has(floor);
    }

    addRequest(floor) {
        if (this.canStopAt(floor)) {
            this.requests.add(floor);
        }
    }

    update(peopleList) {
        // 1. Door Logic
        if (this.doorsOpen) {
            this.doorTimer--;
            this.handlePassengers(peopleList); 
            if (this.doorTimer <= 0) {
                this.doorsOpen = false;
                this.decideDirection(); 
            }
            return;
        }

        // 2. Movement Logic
        if (this.direction === 0) {
            this.decideDirection();
        }

        if (this.direction !== 0) {
            // Find next target floor
            const destinations = Array.from(this.requests).sort((a,b) => a-b);
            let nextStop = -1;

            if (this.direction === 1) { // Going Up
                nextStop = destinations.find(f => f >= this.y + 0.1);
            } else { // Going Down
                // Find highest floor below us
                const below = destinations.filter(f => f <= this.y - 0.1);
                if (below.length > 0) nextStop = below[below.length - 1];
            }

            // No stops in this direction?
            if (nextStop === -1) {
                if (destinations.length > 0) this.direction *= -1; // Switch direction
                else this.direction = 0; // Idle
                return;
            }

            // Move
            const dist = nextStop - this.y;
            const absDist = Math.abs(dist);
            
            if (absDist < 0.1) {
                // Arrived
                this.y = nextStop;
                this.doorsOpen = true;
                this.doorTimer = 60;
                this.requests.delete(nextStop);
                beep(800, 50, 'sine');
            } else {
                // Move car
                let speed = 0.2; 
                if (this.stopsAt) speed = 0.4; // Express is faster
                this.y += Math.sign(dist) * Math.min(absDist, speed);
            }
        }
    }

    decideDirection() {
        if (this.requests.size === 0) {
            this.direction = 0;
            return;
        }
        // Simple logic: Go towards closest request
        const floors = Array.from(this.requests);
        let closest = floors[0];
        let minDist = Math.abs(floors[0] - this.y);
        
        floors.forEach(f => {
            const d = Math.abs(f - this.y);
            if (d < minDist) {
                minDist = d;
                closest = f;
            }
        });
        
        if (minDist < 0.1) this.direction = 0; // Already there (shouldn't happen often due to door logic)
        else this.direction = closest > this.y ? 1 : -1;
    }

    handlePassengers(peopleList) {
        const currentFloor = Math.round(this.y);

        // 1. UNLOAD
        // Filter out people who want to get off here
        for (let i = this.passengers.length - 1; i >= 0; i--) {
            const p = this.passengers[i];
            
            // Check if this is the floor they wanted (Destination Y)
            if (Math.round(p.destinationY) === currentFloor) {
                // Kick them out
                p.elevator = null;
                p.x = this.x;
                p.y = this.y;
                p.visible = true;
                p.state = 'idle'; 
                
                // IMPORTANT: Tell them to figure out where to walk now!
                p.decideNextMove(); 

                this.passengers.splice(i, 1);
            }
        }

        // 2. LOAD
        if (this.passengers.length < 20) {
            // Find people standing exactly here waiting
            const waiting = peopleList.filter(p => 
                p.state === 'waiting_for_elev' &&
                Math.abs(p.x - this.x) < 1 &&
                Math.abs(p.y - this.y) < 1
            );

            waiting.forEach(p => {
                if (this.passengers.length < 20) {
                    // Check if elevator can go to their destination
                    if (this.canStopAt(Math.round(p.destinationY))) {
                        p.state = 'riding';
                        p.visible = false;
                        p.elevator = this;
                        this.passengers.push(p);
                        
                        // Add their destination to elevator requests
                        this.addRequest(Math.round(p.destinationY));
                    }
                }
            });
        }
    }
}

export class SystemsManager {
    constructor() {
        this.elevators = [];
    }

    syncElevators(grid) {
        // Find shafts
        const shaftX = new Set();
        for(let y=0; y<CONFIG.GRID_H; y++) {
            for(let x=0; x<CONFIG.GRID_W; x++) {
                if(grid[y][x].type === TYPES.ELEVATOR) shaftX.add(x);
            }
        }

        // Create/Update elevators
        shaftX.forEach(x => {
            if (!this.elevators.find(e => e.x === x)) {
                this.elevators.push(new ElevatorCar(x));
            }
        });
        
        // Remove deleted elevators
        this.elevators = this.elevators.filter(e => shaftX.has(e.x));
    }

    update(peopleList) {
        this.elevators.forEach(e => e.update(peopleList));
    }

    draw(ctx) {
        const cs = CONFIG.CELL_SIZE;
        this.elevators.forEach(e => {
            // Shaft is drawn by grid, we draw the car
            const px = e.x * cs + 2;
            const py = e.y * cs + 2;
            
            ctx.fillStyle = e.doorsOpen ? '#FFF' : '#B71C1C';
            ctx.fillRect(px, py, cs-4, cs-4);
            
            // Draw passenger count dot
            if (e.passengers.length > 0) {
                ctx.fillStyle = '#00E676';
                ctx.fillRect(px + 4, py + 4, 4, 4);
            }
        });
    }
}
